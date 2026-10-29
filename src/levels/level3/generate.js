import { GridMap, EDGE_OPEN, EDGE_WALL, EDGE_BARS, DIRS } from '../../world/GridMap.js';

// Level 3 layout: an old electrical station.
//
//  - A maze of brick service corridors (one cell wide), some so low you
//    have to crouch or crawl through them
//  - Rooms: generator rooms, boiler rooms, an assembly hall, Sanctums, and
//    Base Gamma. Galleries are sealed behind indestructible bars: you can
//    see in, never get in
//  - Bars also block many corridors outright
//  - Arrival through the door from Level 2; the way on is an old freight lift

export const CELL = 2.4;
export const SIZE = 38;
export const CEIL = { CORR: 2.9, LOW: 1.75, CRAWL: 1.3, generator: 4.4, boiler: 4.0, assembly: 6.4, sanctum: 8.2, base: 3.0, gallery: 5.0 };
export const HEIGHT = 8.2; // tallest ceiling (walls are built this tall)
export const KIND = { CORR: 0, ROOM: 1, LOW: 2 };
export const SECTION = 7;

const opposite = (d) => d ^ 1;

export function generateLevel3(rng) {
  const N = SIZE;
  const map = new GridMap(N, N, CELL, HEIGHT);
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, EDGE_WALL);
  for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, EDGE_WALL);
  const total = N * N;
  const kind = new Uint8Array(total);
  const roomId = new Int16Array(total).fill(-1);
  const ceil = new Float32Array(total).fill(CEIL.CORR);

  // ---- Rooms --------------------------------------------------------------------
  const want = [
    ['assembly', [5, 6], [8, 10]],
    ['sanctum', [4, 4], [6, 6]],
    ['generator', [4, 4], [4, 5]],
    ['generator', [4, 4], [4, 5]],
    ['boiler', [3, 3], [4, 4]],
    ['boiler', [3, 3], [4, 4]],
    ['base', [3, 3], [3, 4]],
    ['gallery', [3, 4], [4, 5]],
    ['gallery', [3, 4], [3, 5]],
    ['gallery', [3, 3], [3, 4]],
    ['sanctum', [4, 4], [5, 6]],
    ['generator', [4, 4], [4, 4]],
  ];
  const rooms = [];
  for (const [type, ws, hs] of want) {
    for (let tries = 0; tries < 120; tries++) {
      let w = rng.int(ws[0], ws[1]), h = rng.int(hs[0], hs[1]);
      if (rng.chance(0.5)) [w, h] = [h, w];
      const x = rng.int(1, N - w - 1), y = rng.int(1, N - h - 1);
      if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      const room = { id: rooms.length, type, x, y, w, h, sealed: type === 'gallery' };
      rooms.push(room);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const i = map.idx(xx, yy);
          kind[i] = KIND.ROOM;
          roomId[i] = room.id;
          ceil[i] = CEIL[type];
        }
      }
      break;
    }
  }
  const sealedCell = (x, y) => {
    const r = roomId[map.idx(x, y)];
    return r >= 0 && rooms[r].sealed;
  };

  // ---- Maze ------------------------------------------------------------------------
  const visited = new Uint8Array(total);
  const active = [[rng.int(0, N - 1), rng.int(0, N - 1), -1]];
  visited[map.idx(active[0][0], active[0][1])] = 1;
  while (active.length) {
    const k = rng.chance(0.75) ? active.length - 1 : rng.int(0, active.length - 1);
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
    const d = last >= 0 && opts.includes(last) && rng.chance(0.6) ? last : rng.pick(opts);
    const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
    map.setEdge(map.edge(cx, cy, d), EDGE_OPEN);
    visited[map.idx(nx, ny)] = 1;
    active.push([nx, ny, d]);
  }
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x + 1 < r.x + r.w) map.setV(x + 1, y, EDGE_OPEN);
        if (y + 1 < r.y + r.h) map.setH(x, y + 1, EDGE_OPEN);
      }
    }
  }

  // Perimeter edges of a room: [edge, outside cell].
  const perimeter = (r) => {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (!map.inBounds(nx, ny) || roomId[map.idx(nx, ny)] === r.id) continue;
          out.push({ e: map.edge(x, y, d), x, y, d, nx, ny });
        }
      }
    }
    return out;
  };

  // Galleries: sealed behind bars, with barred "windows" onto corridors.
  for (const r of rooms) {
    if (!r.sealed) continue;
    const per = perimeter(r);
    for (const p of per) if (map.getEdge(p.e) === EDGE_OPEN) map.setEdge(p.e, EDGE_BARS);
    const walls = rng.shuffle(per.filter((p) => map.getEdge(p.e) === EDGE_WALL && !sealedCell(p.nx, p.ny)));
    for (const p of walls.slice(0, rng.int(2, 3))) map.setEdge(p.e, EDGE_BARS);
  }

  // Everything that isn't sealed must stay reachable.
  const reach = () => {
    let start = 0;
    while (sealedCell(start % N, (start / N) | 0)) start++;
    return map.bfs(start % N, (start / N) | 0);
  };
  const repair = () => {
    for (let guard = 0; guard < 400; guard++) {
      const dist = reach();
      let fixed = false;
      const cand = [];
      for (let y = 0; y < N && !fixed; y++) {
        for (let x = 0; x < N; x++) {
          if (sealedCell(x, y) || dist[map.idx(x, y)] >= 0) continue;
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (!map.inBounds(nx, ny) || sealedCell(nx, ny) || dist[map.idx(nx, ny)] < 0) continue;
            cand.push(map.edge(x, y, d));
          }
        }
      }
      if (!cand.length) return;
      map.setEdge(rng.pick(cand), EDGE_OPEN);
    }
  };
  repair();

  // Rooms keep only a few ways in.
  const connected = () => {
    const dist = reach();
    for (let i = 0; i < total; i++) if (dist[i] < 0 && !sealedCell(i % N, (i / N) | 0)) return false;
    return true;
  };
  for (const r of rooms) {
    if (r.sealed) continue;
    const doors = rng.shuffle(perimeter(r).filter((p) => map.getEdge(p.e) === EDGE_OPEN));
    let open = doors.length;
    const keep = r.type === 'assembly' ? 4 : r.type === 'sanctum' ? 1 : 2;
    for (const p of doors) {
      if (open <= keep) break;
      map.setEdge(p.e, EDGE_WALL);
      if (connected()) open--;
      else map.setEdge(p.e, EDGE_OPEN);
    }
    r.doors = perimeter(r).filter((p) => map.getEdge(p.e) === EDGE_OPEN);
  }

  // A few loops, never opening a 2x2 block of corridor.
  const corridor = (x, y) => map.inBounds(x, y) && kind[map.idx(x, y)] !== KIND.ROOM;
  const openBlock = (x, y) => {
    if (!corridor(x, y) || !corridor(x + 1, y) || !corridor(x, y + 1) || !corridor(x + 1, y + 1)) return false;
    return [map.getV(x + 1, y), map.getV(x + 1, y + 1), map.getH(x, y + 1), map.getH(x + 1, y + 1)].every((v) => v === EDGE_OPEN);
  };
  let loops = Math.floor(total * 0.04);
  for (let tries = 0; tries < total * 3 && loops > 0; tries++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1), d = rng.int(0, 3);
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    if (!corridor(x, y) || !corridor(nx, ny)) continue;
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

  // ---- Bars across corridors --------------------------------------------------------
  // Passable edges turned to bars where that leaves everything reachable,
  // and walls between corridors turned to bars you can see through.
  const bars = [];
  let barTarget = 16;
  for (let tries = 0; tries < 900 && barTarget > 0; tries++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1), d = rng.int(0, 3);
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    if (!corridor(x, y) || !corridor(nx, ny)) continue;
    const e = map.edge(x, y, d);
    if (map.getEdge(e) !== EDGE_OPEN) continue;
    map.setEdge(e, EDGE_BARS);
    if (!connected()) {
      map.setEdge(e, EDGE_OPEN);
      continue;
    }
    bars.push({ e, gate: rng.chance(0.4) });
    barTarget--;
  }
  barTarget = 10;
  for (let tries = 0; tries < 900 && barTarget > 0; tries++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1), d = rng.int(0, 3);
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    if (!corridor(x, y) || !corridor(nx, ny)) continue;
    const e = map.edge(x, y, d);
    if (map.getEdge(e) !== EDGE_WALL) continue;
    map.setEdge(e, EDGE_BARS);
    bars.push({ e, gate: false });
    barTarget--;
  }

  // ---- Topology -------------------------------------------------------------------------
  const openDirs = (x, y) => [0, 1, 2, 3].filter((d) => map.canMove(x, y, d));
  const deadEnds = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!corridor(x, y)) continue;
      const o = openDirs(x, y);
      if (o.length === 1) deadEnds.push({ x, y, dir: o[0] });
    }
  }

  // Low passages: straight corridor stretches you must crouch or crawl through.
  const straight = (x, y) => {
    const o = openDirs(x, y);
    return corridor(x, y) && o.length === 2 && (o[0] >> 1) === (o[1] >> 1);
  };
  const lowRuns = [];
  const isLow = new Uint8Array(total);
  for (let tries = 0; tries < 400 && lowRuns.length < 11; tries++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1);
    if (!straight(x, y) || isLow[map.idx(x, y)]) continue;
    const d = openDirs(x, y)[0];
    const cells = [[x, y]];
    let cx = x, cy = y;
    while (cells.length < 6) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!map.inBounds(nx, ny) || !straight(nx, ny) || isLow[map.idx(nx, ny)]) break;
      cells.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    if (cells.length < 3) continue;
    const crawl = lowRuns.filter((r) => r.crawl).length < 3 && rng.chance(0.35);
    for (const [a, b] of cells) {
      const i = map.idx(a, b);
      isLow[i] = 1;
      kind[i] = KIND.LOW;
      ceil[i] = crawl ? CEIL.CRAWL : CEIL.LOW;
    }
    lowRuns.push({ cells, crawl, axis: d >> 1 });
  }

  // Arrival: the end of a straight corridor, the door from Level 2 behind you.
  const straightLen = (x, y, d) => {
    let n = 0;
    while (map.canMove(x, y, d) && n < 10) {
      x += DIRS[d][0];
      y += DIRS[d][1];
      if (kind[map.idx(x, y)] !== KIND.CORR) break;
      n++;
    }
    return n;
  };
  const goodSpawn = deadEnds.filter((c) => kind[map.idx(c.x, c.y)] === KIND.CORR && straightLen(c.x, c.y, c.dir) >= 3);
  const spawnCell = rng.pick(goodSpawn.length ? goodSpawn : deadEnds);
  const spawnYaw = Math.atan2(-DIRS[spawnCell.dir][0], -DIRS[spawnCell.dir][1]);
  const spawnDist = map.bfs(spawnCell.x, spawnCell.y);
  let maxDist = 0;
  for (let i = 0; i < total; i++) maxDist = Math.max(maxDist, spawnDist[i]);
  const used = new Set([map.idx(spawnCell.x, spawnCell.y)]);
  const doors = [{ x: spawnCell.x, y: spawnCell.y, dir: opposite(spawnCell.dir), edge: map.edge(spawnCell.x, spawnCell.y, opposite(spawnCell.dir)), type: 'back2' }];

  // The way on: a freight lift at the end of a far dead end. Sometimes two.
  const lifts = [];
  const farEnds = deadEnds.filter((c) => kind[map.idx(c.x, c.y)] === KIND.CORR && spawnDist[map.idx(c.x, c.y)] >= maxDist * 0.6 && !used.has(map.idx(c.x, c.y)));
  rng.shuffle(farEnds);
  for (const c of farEnds) {
    if (lifts.length >= (rng.chance(0.35) ? 2 : 1)) break;
    if (lifts.some((l) => Math.abs(l.x - c.x) + Math.abs(l.y - c.y) < 10)) continue;
    lifts.push({ x: c.x, y: c.y, dir: c.dir });
    used.add(map.idx(c.x, c.y));
  }
  if (!lifts.length) {
    const c = deadEnds.filter((c) => !used.has(map.idx(c.x, c.y))).sort((a, b) => spawnDist[map.idx(b.x, b.y)] - spawnDist[map.idx(a.x, a.y)])[0];
    lifts.push({ x: c.x, y: c.y, dir: c.dir });
    used.add(map.idx(c.x, c.y));
  }

  // ---- Sections and lights ------------------------------------------------------------
  const SN = Math.ceil(N / SECTION);
  const sectionOf = (x, y) => Math.floor(y / SECTION) * SN + Math.floor(x / SECTION);
  const sections = [];
  for (let s = 0; s < SN * SN; s++) {
    const r = rng.next();
    sections.push({
      id: s,
      x0: (s % SN) * SECTION * CELL, z0: Math.floor(s / SN) * SECTION * CELL,
      x1: Math.min(N, (s % SN + 1) * SECTION) * CELL, z1: Math.min(N, (Math.floor(s / SN) + 1) * SECTION) * CELL,
      mood: r < 0.35 ? 'lit' : r < 0.8 ? 'dim' : 'dark',
      wall: rng.chance(0.4) ? 'tile' : rng.pick(['brick', 'brick', 'darkbrick', 'tanbrick']),
      floor: rng.chance(0.4) ? 'tile' : 'floor',
    });
  }
  sections[sectionOf(spawnCell.x, spawnCell.y)].mood = 'lit';

  // Straight corridor runs (for lights and ceiling services).
  const runs = [];
  const inRun = [new Int16Array(total).fill(-1), new Int16Array(total).fill(-1)];
  for (const axis of [0, 1]) {
    const d = axis === 0 ? 0 : 2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = map.idx(x, y);
        if (kind[i] !== KIND.CORR || inRun[axis][i] >= 0) continue;
        const cells = [[x, y]];
        let cx = x, cy = y;
        while (map.canMove(cx, cy, d) && kind[map.idx(cx + DIRS[d][0], cy + DIRS[d][1])] === KIND.CORR) {
          cx += DIRS[d][0];
          cy += DIRS[d][1];
          cells.push([cx, cy]);
        }
        if (cells.length < 2) continue;
        for (const [a, b] of cells) inRun[axis][map.idx(a, b)] = runs.length;
        const r = rng.next();
        runs.push({ axis, cells, side: rng.chance(0.5) ? 1 : -1, service: r < 0.45 ? 'pipes' : r < 0.7 ? 'tray' : 'none' });
      }
    }
  }

  const TUBE = [0.82, 0.88, 0.8];
  const WARM = [1.0, 0.62, 0.3];
  const lights = [];
  const lit = new Set();
  const [spx, spy] = [spawnCell.x, spawnCell.y];
  const addLight = (x, y, axis, side, o = {}) => {
    const sec = sections[sectionOf(x, y)];
    const near = Math.abs(x - spx) + Math.abs(y - spy) <= 2;
    const type = o.type || (rng.chance(0.75) ? 'tube' : 'bulb');
    const pOn = near ? 1 : o.pOn ?? { lit: 0.7, dim: 0.42, dark: 0.08 }[sec.mood];
    let state = rng.chance(pOn) ? 'on' : 'off';
    if (state === 'on' && !near && rng.chance(0.16)) state = 'flicker';
    const [cx, cz] = map.cellCenter(x, y);
    const off = side * 0.4;
    lights.push({
      x: cx + (axis === 1 ? off : 0) + (o.dx || 0), z: cz + (axis === 0 ? off : 0) + (o.dz || 0),
      color: o.color || (type === 'tube' ? TUBE : WARM),
      power: o.power ?? (type === 'tube' ? 0.85 : 0.7),
      state, type, axis, section: sec.id, ceil: ceil[map.idx(x, y)], hang: o.hang, room: o.room ?? -1,
      cell: [x, y],
    });
    lit.add(map.idx(x, y));
  };
  for (const run of runs) {
    const phase = rng.int(0, 1);
    run.cells.forEach(([x, y], k) => {
      if ((k + phase) % 2 || lit.has(map.idx(x, y)) || !rng.chance(0.75)) return;
      addLight(x, y, run.axis, -run.side);
    });
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = map.idx(x, y);
      if (lit.has(i) || kind[i] === KIND.ROOM) continue;
      if (kind[i] === KIND.LOW) {
        // Low passages: the odd caged bulb, mostly dead.
        if (ceil[i] > 1.5 && rng.chance(0.3)) addLight(x, y, 0, 0, { type: 'bulb', pOn: 0.5, power: 0.5 });
        continue;
      }
      const blocked = [0, 1, 2, 3].some((d) => {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        return map.inBounds(nx, ny) && lit.has(map.idx(nx, ny)) && map.canMove(x, y, d);
      });
      if (!blocked && rng.chance(0.5)) addLight(x, y, openDirs(x, y).some((d) => d < 2) ? 0 : 1, 0);
    }
  }
  // Room lighting by type.
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const lx = x - r.x, ly = y - r.y;
        switch (r.type) {
          case 'generator':
            if ((lx + ly) % 2 === 0) addLight(x, y, 0, 0, { type: 'tube', pOn: 0.75, power: 1.0 });
            break;
          case 'boiler':
            if ((lx + ly) % 2 === 0) addLight(x, y, 0, 0, { type: 'bulb', pOn: 0.8, power: 0.9, color: [1, 0.55, 0.22] });
            break;
          case 'assembly':
            if (lx % 2 === 0 && ly % 2 === 0) addLight(x, y, 0, 0, { type: 'dome', pOn: 0.8, power: 1.5, hang: CEIL.assembly - 2.1, dx: CELL / 2, dz: CELL / 2 });
            break;
          case 'base':
            if (lx === 1 && ly % 2 === 1) addLight(x, y, 0, 0, { type: 'tube', pOn: 1, power: 1.0, room: r.id });
            break;
          case 'gallery':
            // Bright, out of reach: the light beyond the bars.
            if (lx % 2 === 1 && ly % 2 === 1) addLight(x, y, 0, 0, { type: 'bulb', pOn: 1, power: 1.8, color: [1, 0.85, 0.6] });
            break;
          default:
            break; // Sanctums have no electric light at all.
        }
      }
    }
  }

  // ---- Supplies, hazards and anomalies ------------------------------------------------
  const corrCells = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (kind[map.idx(x, y)] === KIND.CORR && !used.has(map.idx(x, y))) corrCells.push([x, y]);
  rng.shuffle(corrCells);
  const takeCells = (n, minDist = 4) => {
    const out = [];
    for (const c of corrCells) {
      if (out.length >= n) break;
      const i = map.idx(c[0], c[1]);
      if (used.has(i) || spawnDist[i] < minDist) continue;
      used.add(i);
      out.push(c);
    }
    return out;
  };
  const sparks = takeCells(7, 5); // dangling live wires
  const puddles = takeCells(14, 2); // black fluid leaking
  const purple = takeCells(4, 10); // purple discoloration
  const crates = [];
  for (const r of rooms) {
    if (r.type !== 'generator' && r.type !== 'base') continue;
    crates.push({ room: r.id, n: r.type === 'base' ? 3 : rng.int(1, 2) });
  }
  const freeDeadEnds = deadEnds.filter((c) => !used.has(map.idx(c.x, c.y)) && kind[map.idx(c.x, c.y)] === KIND.CORR);

  return {
    map, kind, roomId, rooms, ceil, deadEnds, freeDeadEnds, lowRuns, bars, doors, lifts,
    sections, sectionOf, runs, inRun, lights, sparks, puddles, purple, crates,
    spawn: { x: spawnCell.x, y: spawnCell.y, dir: spawnCell.dir }, spawnYaw, spawnDist, maxDist,
    chamfers: [],
  };
}
