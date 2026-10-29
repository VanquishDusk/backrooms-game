import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';

// Level 2 layout: a labyrinth of narrow maintenance tunnels.
//
//  - One-cell-wide tunnels (CELL metres) carved as a "growing tree" maze
//    biased toward long straight runs, plus a few loops
//  - Machine rooms: small open plant rooms, each with only a few ways in
//  - Turns are cut at 45 degrees (chamfers) so tunnels bend, not corner
//  - Sections: lights die and come back a whole section at a time
//  - Doors sit at the back of dead ends. Nearly all are locked; a rare few
//    lead out (Level 1, Level 3, sometimes Level 4)

export const CELL = 2.2;
export const HEIGHT = 2.75;
export const SIZE = 34;
export const SECTION = 6; // cells per section side

export const KIND = { TUNNEL: 0, ROOM: 1 };

const opposite = (d) => d ^ 1;

export function generateLevel2(rng) {
  const N = SIZE;
  const map = new GridMap(N, N, CELL, HEIGHT);
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, EDGE_WALL);
  for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, EDGE_WALL);
  const kind = new Uint8Array(N * N);
  const roomId = new Int16Array(N * N).fill(-1);

  // ---- Machine rooms (reserved before the maze) ---------------------------
  const rooms = [];
  for (let tries = 0; tries < 200 && rooms.length < 6; tries++) {
    const w = rng.int(2, 3), h = rng.int(2, 3);
    if (w * h < 5) continue;
    const x = rng.int(1, N - w - 1), y = rng.int(1, N - h - 1);
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push({ x, y, w, h, id: rooms.length });
  }
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        kind[map.idx(x, y)] = KIND.ROOM;
        roomId[map.idx(x, y)] = r.id;
      }
    }
  }

  // ---- Maze: growing tree, newest-biased, prefers going straight ----------
  const visited = new Uint8Array(N * N);
  const active = [];
  const start = [rng.int(0, N - 1), rng.int(0, N - 1)];
  visited[map.idx(...start)] = 1;
  active.push([start[0], start[1], -1]);
  while (active.length) {
    const k = rng.chance(0.78) ? active.length - 1 : rng.int(0, active.length - 1);
    const [cx, cy, last] = active[k];
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (map.inBounds(nx, ny) && !visited[map.idx(nx, ny)]) opts.push(d);
    }
    if (!opts.length) {
      active.splice(k, 1);
      continue;
    }
    const d = last >= 0 && opts.includes(last) && rng.chance(0.68) ? last : rng.pick(opts);
    const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
    map.setEdge(map.edge(cx, cy, d), EDGE_OPEN);
    visited[map.idx(nx, ny)] = 1;
    active.push([nx, ny, d]);
  }

  // Rooms: open inside, few ways in.
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x + 1 < r.x + r.w) map.setV(x + 1, y, EDGE_OPEN);
        if (y + 1 < r.y + r.h) map.setH(x, y + 1, EDGE_OPEN);
      }
    }
  }
  const total = N * N;
  const connected = () => {
    const dist = map.bfs(0, 0);
    let n = 0;
    for (let i = 0; i < total; i++) if (dist[i] >= 0) n++;
    return n === total;
  };
  for (const r of rooms) {
    const doors = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (!map.inBounds(nx, ny) || roomId[map.idx(nx, ny)] === r.id) continue;
          const e = map.edge(x, y, d);
          if (map.getEdge(e) === EDGE_OPEN) doors.push(e);
        }
      }
    }
    rng.shuffle(doors);
    let open = doors.length;
    for (const e of doors) {
      if (open <= 2) break;
      map.setEdge(e, EDGE_WALL);
      if (connected()) open--;
      else map.setEdge(e, EDGE_OPEN);
    }
  }

  // Loops, so it isn't a perfect maze, but never opening a 2x2 block of
  // tunnel (that would read as a room, not a tunnel).
  const openBlock = (x, y) => {
    if (!map.inBounds(x, y) || !map.inBounds(x + 1, y + 1)) return false;
    const inner = [map.getV(x + 1, y), map.getV(x + 1, y + 1), map.getH(x, y + 1), map.getH(x + 1, y + 1)];
    if (inner.some((v) => v !== EDGE_OPEN)) return false;
    return ![[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([a, b]) => kind[map.idx(a, b)] === KIND.ROOM);
  };
  let loops = Math.floor(total * 0.05);
  for (let tries = 0; tries < total * 3 && loops > 0; tries++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1), d = rng.int(0, 3);
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    if (!map.inBounds(nx, ny)) continue;
    if (kind[map.idx(x, y)] === KIND.ROOM || kind[map.idx(nx, ny)] === KIND.ROOM) continue;
    const e = map.edge(x, y, d);
    if (map.getEdge(e) !== EDGE_WALL) continue;
    map.setEdge(e, EDGE_OPEN);
    const bx = Math.min(x, nx), by = Math.min(y, ny);
    if (openBlock(bx - 1, by - 1) || openBlock(bx, by - 1) || openBlock(bx - 1, by) || openBlock(bx, by)) {
      map.setEdge(e, EDGE_WALL);
      continue;
    }
    loops--;
  }

  // ---- Cell topology ------------------------------------------------------
  const openDirs = (x, y) => [0, 1, 2, 3].filter((d) => map.canMove(x, y, d));
  const deadEnds = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (kind[map.idx(x, y)] !== KIND.TUNNEL) continue;
      const o = openDirs(x, y);
      if (o.length === 1) deadEnds.push({ x, y, dir: o[0] });
    }
  }

  // Spawn: the end of a long straight tunnel, like the Level 1 hallway
  // continuing. Face down the tunnel.
  const straightLen = (x, y, d) => {
    let n = 0;
    while (map.canMove(x, y, d) && n < 12) {
      x += DIRS[d][0];
      y += DIRS[d][1];
      if (kind[map.idx(x, y)] !== KIND.TUNNEL) break;
      n++;
    }
    return n;
  };
  const good = deadEnds.filter((c) => straightLen(c.x, c.y, c.dir) >= 4);
  const spawnCell = rng.pick(good.length ? good : deadEnds);
  const spawnYaw = Math.atan2(-DIRS[spawnCell.dir][0], -DIRS[spawnCell.dir][1]);
  const spawnDist = map.bfs(spawnCell.x, spawnCell.y);
  let maxDist = 0;
  for (let i = 0; i < total; i++) maxDist = Math.max(maxDist, spawnDist[i]);

  // ---- Doors at the back of dead ends --------------------------------------
  const used = new Set([map.idx(spawnCell.x, spawnCell.y)]);
  const doors = [];
  const doorAt = (c, type) => {
    used.add(map.idx(c.x, c.y));
    const back = opposite(c.dir);
    doors.push({ x: c.x, y: c.y, dir: back, edge: map.edge(c.x, c.y, back), type });
  };
  const far = (k) => deadEnds.filter((c) => !used.has(map.idx(c.x, c.y)) && spawnDist[map.idx(c.x, c.y)] >= maxDist * k);
  const spread = (list, others) => list.filter((c) => others.every((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) > 8));
  // Level 3: always at least one, deep in.
  const exits = [];
  for (const [type, k, p] of [['exit3', 0.55, 1], ['exit3', 0.4, 0.45], ['exit1', 0.3, 1], ['exit4', 0.5, 0.35]]) {
    if (!rng.chance(p)) continue;
    let list = spread(far(k), exits);
    if (!list.length) list = far(k * 0.6);
    if (!list.length) continue;
    const c = rng.pick(list);
    exits.push(c);
    doorAt(c, type);
  }
  // Locked doors: plenty of them, so a door alone means nothing.
  rng.shuffle(deadEnds);
  let locked = 0;
  for (const c of deadEnds) {
    if (locked >= 16) break;
    if (used.has(map.idx(c.x, c.y)) || spawnDist[map.idx(c.x, c.y)] < 4) continue;
    doorAt(c, rng.chance(0.75) ? 'locked' : 'locked2');
    locked++;
  }
  // Locked doors in machine room walls too.
  for (const r of rooms) {
    if (!rng.chance(0.6)) continue;
    for (let t = 0; t < 10; t++) {
      const x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1), d = rng.int(0, 3);
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (map.inBounds(nx, ny) && roomId[map.idx(nx, ny)] === r.id) continue;
      const e = map.edge(x, y, d);
      if (map.getEdge(e) !== EDGE_WALL || doors.some((o) => sameEdge(o.edge, e))) continue;
      doors.push({ x, y, dir: d, edge: e, type: 'locked', room: true });
      break;
    }
  }
  const doorCells = new Set(doors.map((d) => map.idx(d.x, d.y)));

  // ---- 45-degree corners ----------------------------------------------------
  // A turn cell (exactly two open sides, perpendicular) gets its outer corner
  // cut off diagonally. `corner` = the two walled sides meeting there.
  const chamfers = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = map.idx(x, y);
      if (kind[i] !== KIND.TUNNEL || doorCells.has(i)) continue;
      const o = openDirs(x, y);
      if (o.length !== 2 || (o[0] >> 1) === (o[1] >> 1)) continue;
      if (!rng.chance(0.85)) continue;
      const walls = [0, 1, 2, 3].filter((d) => !o.includes(d));
      chamfers.push({ x, y, walls, leg: rng.range(1.25, 1.55) });
    }
  }

  // ---- Sections -------------------------------------------------------------
  const SN = Math.ceil(N / SECTION);
  const sectionOf = (x, y) => Math.floor(y / SECTION) * SN + Math.floor(x / SECTION);
  const sections = [];
  for (let s = 0; s < SN * SN; s++) {
    const r = rng.next();
    sections.push({
      id: s,
      x0: (s % SN) * SECTION * CELL, z0: Math.floor(s / SN) * SECTION * CELL,
      x1: Math.min(N, (s % SN + 1) * SECTION) * CELL, z1: Math.min(N, (Math.floor(s / SN) + 1) * SECTION) * CELL,
      // How alive the lights are here.
      mood: r < 0.45 ? 'lit' : r < 0.78 ? 'dim' : 'dark',
      // What kind of fixtures hang here.
      fixture: rng.chance(0.55) ? 'tube' : rng.chance(0.6) ? 'bulb' : 'mixed',
      brick: rng.chance(0.22),
      label: `${'ABCDEFGH'[s % 8]}-${rng.int(1, 19)}`,
    });
  }
  const [spx, spy] = [spawnCell.x, spawnCell.y];
  const spawnSection = sectionOf(spx, spy);
  sections[spawnSection].mood = 'lit';

  // ---- Straight runs (ceiling services and fixtures follow these) ----------
  const runs = [];
  const inRun = [new Int16Array(total).fill(-1), new Int16Array(total).fill(-1)];
  for (const axis of [0, 1]) {
    const d = axis === 0 ? 0 : 2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = map.idx(x, y);
        if (kind[i] !== KIND.TUNNEL || inRun[axis][i] >= 0) continue;
        const cells = [[x, y]];
        let cx = x, cy = y;
        while (map.canMove(cx, cy, d) && kind[map.idx(cx + DIRS[d][0], cy + DIRS[d][1])] === KIND.TUNNEL) {
          cx += DIRS[d][0];
          cy += DIRS[d][1];
          cells.push([cx, cy]);
        }
        if (cells.length < 2) continue;
        for (const [a, b] of cells) inRun[axis][map.idx(a, b)] = runs.length;
        runs.push({ axis, cells, side: rng.chance(0.5) ? 1 : -1, service: pickService(rng, axis, cells.length) });
      }
    }
  }

  // ---- Lights -----------------------------------------------------------------
  const WHITE = [0.86, 0.93, 1.0];
  const ORANGE = [1.0, 0.6, 0.27];
  const lights = [];
  const lit = new Set();
  const addLight = (x, y, axis, side, inRoom) => {
    const sec = sections[sectionOf(x, y)];
    const near = Math.abs(x - spx) + Math.abs(y - spy) <= 4;
    const type = inRoom || near ? 'tube' : sec.fixture === 'mixed' ? (rng.chance(0.5) ? 'tube' : 'bulb') : sec.fixture;
    const pOn = Math.abs(x - spx) + Math.abs(y - spy) <= 2 ? 1 : near ? 0.75 : inRoom ? 0.8 : { lit: 0.72, dim: 0.4, dark: 0.06 }[sec.mood];
    let state = rng.chance(pOn) ? 'on' : 'off';
    if (state === 'on' && !near && rng.chance(0.13)) state = 'flicker';
    const [cx, cz] = map.cellCenter(x, y);
    const off = side * 0.42;
    lights.push({
      x: cx + (axis === 1 ? off : 0), z: cz + (axis === 0 ? off : 0),
      color: type === 'tube' ? WHITE : ORANGE,
      power: type === 'tube' ? 1.05 : 0.8,
      state, type, axis, section: sec.id, rotate: axis === 1,
      panelTint: type === 'tube' ? [0.95, 0.98, 1] : [1, 0.75, 0.4],
    });
    lit.add(map.idx(x, y));
  };
  // The green door back to Level 1 always has one bare bulb over it.
  for (const d of doors) {
    if (d.type !== 'exit1') continue;
    const [cx, cz] = map.cellCenter(d.x, d.y);
    lights.push({
      x: cx + DIRS[d.dir][0] * 0.3, z: cz + DIRS[d.dir][1] * 0.3, color: [1, 0.7, 0.4], power: 0.55,
      state: 'on', type: 'bulb', axis: 0, section: sectionOf(d.x, d.y), rotate: false, panelTint: [1, 0.75, 0.4],
    });
    lit.add(map.idx(d.x, d.y));
  }
  for (const run of runs) {
    // Every other cell along a run, on the side away from the ceiling services.
    const phase = rng.int(0, 1);
    run.cells.forEach(([x, y], k) => {
      if ((k + phase) % 2 || lit.has(map.idx(x, y))) return;
      if (!rng.chance(0.7)) return;
      addLight(x, y, run.axis, -run.side, false);
    });
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = map.idx(x, y);
      if (lit.has(i)) continue;
      if (kind[i] === KIND.ROOM) {
        if ((x + y) % 2 === 0) addLight(x, y, 0, 0, true);
        continue;
      }
      // Corners, junctions and dead ends not covered by a run.
      const blocked = [0, 1, 2, 3].some((d) => {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        return map.inBounds(nx, ny) && lit.has(map.idx(nx, ny)) && map.canMove(x, y, d);
      });
      if (!blocked && rng.chance(0.55)) addLight(x, y, openDirs(x, y).some((d) => d < 2) ? 0 : 1, 0, false);
    }
  }

  // ---- Supply crates ------------------------------------------------------------
  const crates = [];
  const spots = deadEnds.filter((c) => !used.has(map.idx(c.x, c.y)) && spawnDist[map.idx(c.x, c.y)] > 3);
  rng.shuffle(spots);
  for (const c of spots.slice(0, 9)) {
    used.add(map.idx(c.x, c.y));
    const [cx, cz] = map.cellCenter(c.x, c.y);
    const back = opposite(c.dir);
    crates.push({
      x: cx + DIRS[back][0] * 0.45 + rng.range(-0.2, 0.2) * (DIRS[back][0] ? 0 : 1),
      z: cz + DIRS[back][1] * 0.45 + rng.range(-0.2, 0.2) * (DIRS[back][1] ? 0 : 1),
      rot: rng.range(-0.25, 0.25) + (back >> 1) * Math.PI / 2,
      size: rng.range(0.62, 0.78),
      cell: [c.x, c.y], back,
    });
  }
  const freeDeadEnds = deadEnds.filter((c) => !used.has(map.idx(c.x, c.y)));

  return {
    map, kind, roomId, rooms, deadEnds, freeDeadEnds, chamfers, doors, sections, sectionOf,
    runs, inRun, lights, crates,
    spawn: { x: spawnCell.x, y: spawnCell.y, dir: spawnCell.dir }, spawnYaw, spawnDist, maxDist,
  };
}

// What runs along a tunnel's ceiling.
function pickService(rng, axis, len) {
  const r = rng.next();
  if (axis === 0 && len >= 3 && r < 0.28) return 'duct';
  if (r < 0.7) return 'pipes';
  if (r < 0.88) return 'tray';
  return 'none';
}

export function sameEdge(a, b) {
  return a.h === b.h && a.x === b.x && a.y === b.y;
}
