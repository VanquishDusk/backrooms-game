import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';

// Level 4 layout: an empty office floor that goes on and on.
//
//  - Long straight corridors on a loose grid; the blocks between them are
//    split into offices, open-plan floors, conference rooms, break rooms
//  - Service cores: closed shafts holding stairwells and elevators. Their
//    doors are the exits, and an exit can move to another core's door
//    when nobody is looking at it
//  - Windows on the outside walls; most are blacked out, a few aren't

export const CELL = 2.5;
export const SIZE = 40;
export const HEIGHT = 2.75;
export const ZONE = { CORR: 0, ROOM: 1, CORE: 2 };

export function generateLevel4(rng) {
  const N = SIZE;
  const map = new GridMap(N, N, CELL, HEIGHT);
  const total = N * N;
  const zone = new Uint8Array(total).fill(ZONE.ROOM);
  const roomOf = new Int16Array(total).fill(-1);
  const idx = (x, y) => map.idx(x, y);

  // ---- Corridors ----------------------------------------------------------------
  const lines = () => {
    const out = [];
    for (let p = rng.int(3, 5); p < N - 2; p += rng.int(7, 10)) out.push(p);
    return out;
  };
  const xs = lines(), ys = lines();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (xs.includes(x) || ys.includes(y)) zone[idx(x, y)] = ZONE.CORR;
  // A few corridor stubs end blind instead of running edge to edge.
  for (const x of xs) if (rng.chance(0.3)) for (let y = 0; y < Math.min(...ys); y++) zone[idx(x, y)] = ZONE.ROOM;
  for (const y of ys) if (rng.chance(0.3)) for (let x = Math.max(...xs) + 1; x < N; x++) zone[idx(x, y)] = ZONE.ROOM;

  // ---- Blocks -> cores and rooms ----------------------------------------------------
  const bounds = (list) => {
    const out = [];
    let a = 0;
    for (const p of [...list, N]) {
      if (p - a >= 2) out.push([a, p - 1]);
      a = p + 1;
    }
    return out;
  };
  const blocks = [];
  for (const [y0, y1] of bounds(ys)) for (const [x0, x1] of bounds(xs)) blocks.push({ x0, y0, x1, y1 });
  // Room cells must not be corridors (stubs may have turned some back into rooms).
  const rooms = [];
  const cores = [];
  const touchesCorr = (x, y) => [0, 1, 2, 3].some((d) => {
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    return map.inBounds(nx, ny) && zone[idx(nx, ny)] === ZONE.CORR;
  });
  rng.shuffle(blocks);
  let coreCount = 0;
  for (const b of blocks) {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    // A service core against the block's edge, by a corridor.
    if (coreCount < 9 && w >= 3 && h >= 3) {
      const cand = [];
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = b.x0; x <= b.x1; x++) {
          if (!touchesCorr(x, y) || zone[idx(x, y)] !== ZONE.ROOM) continue;
          // Two cells deep, so a stair can run down inside it.
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const x2 = x + dx, y2 = y + dy;
            if (x2 > b.x1 || y2 > b.y1 || zone[idx(x2, y2)] !== ZONE.ROOM) continue;
            cand.push([[x, y], [x2, y2]]);
          }
        }
      }
      if (cand.length) {
        const cells = rng.pick(cand);
        const core = { id: cores.length, cells };
        for (const [x, y] of cells) zone[idx(x, y)] = ZONE.CORE;
        cores.push(core);
        coreCount++;
      }
    }
    // Split the rest of the block into rooms (binary space partition).
    const split = (x0, y0, x1, y1, depth) => {
      const w2 = x1 - x0 + 1, h2 = y1 - y0 + 1;
      const big = w2 * h2 > rng.int(6, 14) || w2 > 5 || h2 > 5;
      if (big && depth < 6 && (w2 >= 4 || h2 >= 4)) {
        const vertical = w2 > h2 ? true : w2 < h2 ? false : rng.chance(0.5);
        if (vertical && w2 >= 4) {
          const s = rng.int(x0 + 1, x1 - 1);
          split(x0, y0, s, y1, depth + 1);
          split(s + 1, y0, x1, y1, depth + 1);
          return;
        }
        if (!vertical && h2 >= 4) {
          const s = rng.int(y0 + 1, y1 - 1);
          split(x0, y0, x1, s, depth + 1);
          split(x0, s + 1, x1, y1, depth + 1);
          return;
        }
      }
      const cells = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (zone[idx(x, y)] === ZONE.ROOM && roomOf[idx(x, y)] < 0) cells.push([x, y]);
      if (!cells.length) return;
      const room = { id: rooms.length, cells, x0, y0, x1, y1 };
      for (const [x, y] of cells) roomOf[idx(x, y)] = room.id;
      rooms.push(room);
    };
    // Big open-plan floors are the norm; some blocks are cut into offices.
    const open = w * h >= 12 && rng.chance(0.6);
    split(b.x0, b.y0, b.x1, b.y1, open ? 9 : 0);
  }
  // Stray room cells (from corridor stubs) join the nearest room or become one.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (zone[idx(x, y)] !== ZONE.ROOM || roomOf[idx(x, y)] >= 0) continue;
      const n = [0, 1, 2, 3].map((d) => [x + DIRS[d][0], y + DIRS[d][1]]).find(([a, b]) => map.inBounds(a, b) && roomOf[idx(a, b)] >= 0);
      if (n) {
        const r = rooms[roomOf[idx(...n)]];
        r.cells.push([x, y]);
        roomOf[idx(x, y)] = r.id;
      } else {
        zone[idx(x, y)] = ZONE.CORR;
      }
    }
  }

  // ---- Walls and doors -----------------------------------------------------------------
  const same = (a, b) => {
    const za = zone[a], zb = zone[b];
    if (za === ZONE.CORE || zb === ZONE.CORE) return false;
    if (za === ZONE.CORR && zb === ZONE.CORR) return true;
    return za === ZONE.ROOM && zb === ZONE.ROOM && roomOf[a] === roomOf[b];
  };
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, y === 0 || y === N || !same(idx(x, y - 1), idx(x, y)) ? EDGE_WALL : EDGE_OPEN);
  for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, x === 0 || x === N || !same(idx(x - 1, y), idx(x, y)) ? EDGE_WALL : EDGE_OPEN);

  const doors = [];
  const addDoor = (x, y, d) => {
    const e = map.edge(x, y, d);
    map.setEdge(e, EDGE_OPEN);
    doors.push({ edge: e, x, y, dir: d });
  };
  for (const r of rooms) {
    const cand = [];
    for (const [x, y] of r.cells) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (map.inBounds(nx, ny) && zone[idx(nx, ny)] === ZONE.CORR) cand.push([x, y, d]);
      }
    }
    rng.shuffle(cand);
    const n = Math.min(cand.length, r.cells.length >= 10 ? 2 : 1);
    for (let i = 0; i < n; i++) addDoor(...cand[i]);
  }
  // Rooms with no corridor frontage get a door into a neighbouring room.
  let start = 0;
  while (zone[start] !== ZONE.CORR) start++;
  for (let guard = 0; guard < 300; guard++) {
    const dist = map.bfs(start % N, (start / N) | 0);
    const cand = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        if (zone[i] === ZONE.CORE || dist[i] >= 0) continue;
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (map.inBounds(nx, ny) && zone[idx(nx, ny)] !== ZONE.CORE && dist[idx(nx, ny)] >= 0) cand.push([x, y, d]);
        }
      }
    }
    if (!cand.length) break;
    addDoor(...rng.pick(cand));
  }

  // ---- Room kinds ---------------------------------------------------------------------------
  rng.shuffle(rooms);
  const kinds = { meg: 1, camp: 1, break: Math.max(3, Math.floor(rooms.length * 0.08)), conference: Math.max(2, Math.floor(rooms.length * 0.06)) };
  for (const r of rooms) {
    const size = r.cells.length;
    if (kinds.meg && size >= 6) { r.kind = 'meg'; kinds.meg--; continue; }
    if (kinds.camp && size >= 4) { r.kind = 'camp'; kinds.camp--; continue; }
    if (size >= 16) { r.kind = 'open'; continue; }
    if (kinds.break && size >= 4) { r.kind = 'break'; kinds.break--; continue; }
    if (kinds.conference && size >= 6) { r.kind = 'conference'; kinds.conference--; continue; }
    const t = rng.next();
    r.kind = t < 0.45 ? 'empty' : t < 0.8 ? 'office' : 'storage';
  }
  rooms.sort((a, b) => a.id - b.id);

  // ---- Windows --------------------------------------------------------------------------------
  // On the outside walls. Most are blacked out.
  const windows = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (zone[idx(x, y)] === ZONE.CORE) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (map.inBounds(nx, ny) || !rng.chance(0.85)) continue;
        windows.push({ x, y, dir: d, edge: map.edge(x, y, d), trap: false, black: rng.chance(0.3) });
      }
    }
  }
  rng.shuffle(windows);
  for (const w of windows.slice(0, 6)) {
    w.trap = true;
    w.black = false;
  }

  // ---- Spawn: the middle of a long corridor --------------------------------------------------
  const corr = [];
  for (let y = 4; y < N - 4; y++) for (let x = 4; x < N - 4; x++) if (zone[idx(x, y)] === ZONE.CORR) corr.push([x, y]);
  const run = (x, y, d) => {
    let n = 0;
    while (map.canMove(x, y, d) && n < 30) {
      x += DIRS[d][0];
      y += DIRS[d][1];
      n++;
    }
    return n;
  };
  let spawn = null, best = -1;
  for (let t = 0; t < 60; t++) {
    const [x, y] = rng.pick(corr);
    for (let d = 0; d < 4; d++) {
      const r = run(x, y, d);
      if (r > best) {
        best = r;
        spawn = { x, y, dir: d };
      }
    }
  }
  const spawnYaw = Math.atan2(-DIRS[spawn.dir][0], -DIRS[spawn.dir][1]);
  const spawnDist = map.bfs(spawn.x, spawn.y);

  // ---- Exit slots: core doors facing a corridor or room ---------------------------------------
  const slots = [];
  for (const c of cores) {
    for (const [x, y] of c.cells) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!map.inBounds(nx, ny) || zone[idx(nx, ny)] === ZONE.CORE) continue;
        // The other core cell must lie straight behind, so a stair fits.
        const bx = x - DIRS[d][0], by = y - DIRS[d][1];
        const deep = c.cells.some(([cx, cy]) => cx === bx && cy === by);
        slots.push({ core: c.id, x, y, dir: d ^ 1, ax: nx, ay: ny, edge: map.edge(x, y, d), deep, corr: zone[idx(nx, ny)] === ZONE.CORR });
      }
    }
  }

  // ---- Lights: a troffer in every cell, mostly working ------------------------------------------
  const lights = [];
  const dark = new Set(rooms.filter((r) => r.kind === 'empty' && rng.chance(0.15)).map((r) => r.id));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const [cx, cz] = map.cellCenter(x, y);
      if (zone[i] === ZONE.CORE) {
        lights.push({ x: cx, z: cz, color: [0.95, 0.95, 0.9], power: 0.6, state: 'on', core: true });
        continue;
      }
      const r = roomOf[i];
      if ((x + y) % 2 && (zone[i] === ZONE.CORR || rooms[r].cells.length > 2)) continue;
      const r2 = rng.next();
      let state = r2 < (zone[i] === ZONE.CORR ? 0.12 : 0.3) ? 'off' : r2 < (zone[i] === ZONE.CORR ? 0.16 : 0.34) ? 'flicker' : 'on';
      if (r >= 0 && dark.has(r)) state = 'off';
      const rotate = zone[i] === ZONE.CORR ? map.canMove(x, y, 2) || map.canMove(x, y, 3) : (x % 2 === 0);
      lights.push({ x: cx, z: cz, color: [0.94, 0.97, 1.0], power: 0.8, state, rotate, panelTint: [0.96, 0.98, 1], room: r });
    }
  }
  // Daylight through every window that isn't blacked out: the edges of
  // each floor are bright, the middle is gloomy.
  for (const w of windows) {
    if (w.black) continue;
    const [cx, cz] = map.cellCenter(w.x, w.y);
    lights.push({
      x: cx + DIRS[w.dir][0] * 0.95, z: cz + DIRS[w.dir][1] * 0.95,
      color: w.trap ? [1, 0.85, 0.6] : [0.92, 0.95, 1.0], power: w.trap ? 0.9 : 1.05, state: 'on', window: true, hide: true,
    });
  }

  // Square columns through the open floors.
  const pillars = [];
  for (const r of rooms) {
    if (r.kind !== 'open') continue;
    const set = new Set(r.cells.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of r.cells) {
      if ((x - r.x0) % 3 !== 2 || (y - r.y0) % 3 !== 2) continue;
      if (![[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([a, b]) => set.has(`${a},${b}`))) continue;
      pillars.push({ x: (x + 1) * CELL, z: (y + 1) * CELL, size: 0.5 });
    }
  }

  return { map, zone, roomOf, rooms, cores, doors, windows, slots, lights, pillars, spawn, spawnYaw, spawnDist, darkRooms: dark, xs, ys };
}
