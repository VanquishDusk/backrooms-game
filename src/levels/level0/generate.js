import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';
import { createNoise2D } from '../../core/rng.js';

// Level 0 layout generator. Everything here comes from the seed, so the
// same seed always rebuilds the same Yellow Hell.

export const ZONE = { NORMAL: 0, DARK: 1, RED: 2, PITS: 3 };

const COLS = 56;
const ROWS = 56;
const CELL = 3;
const HEIGHT = 2.75;

const WHITE = [1.0, 0.96, 0.78];
const RED = [0.95, 0.05, 0.03];

export function generateLevel0(rng) {
  const map = new GridMap(COLS, ROWS, CELL, HEIGHT);
  const densityNoise = createNoise2D(rng);
  const darkNoise = createNoise2D(rng);
  const n = COLS * ROWS;
  const density = new Float32Array(n);
  const zone = new Uint8Array(n);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = map.idx(x, y);
      density[i] = densityNoise(x / 8, y / 8) * 0.75 + densityNoise(x / 3, y / 3) * 0.25;
      if (darkNoise(x / 9 + 50, y / 9 + 50) > 0.76) zone[i] = ZONE.DARK;
    }
  }

  // One red-lit pocket in most runs.
  if (rng.chance(0.8)) {
    const rx = rng.int(8, COLS - 9), ry = rng.int(8, ROWS - 9), rr = rng.range(3, 5.5);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const d = Math.hypot(x - rx, (y - ry) * 1.2) + densityNoise(x * 0.7, y * 0.7) * 1.5;
        if (d < rr) zone[map.idx(x, y)] = ZONE.RED;
      }
    }
  }

  // The Pitfalls: a wide room with a grid of square holes in the floor.
  const pw = rng.int(6, 9), ph = rng.int(5, 7);
  const pRoom = { x: rng.int(2, COLS - pw - 3), y: rng.int(2, ROWS - ph - 3), w: pw, h: ph };
  const inPitRoom = (x, y, pad = 0) =>
    x >= pRoom.x - pad && x < pRoom.x + pRoom.w + pad && y >= pRoom.y - pad && y < pRoom.y + pRoom.h + pad;
  for (let y = pRoom.y; y < pRoom.y + ph; y++) {
    for (let x = pRoom.x; x < pRoom.x + pw; x++) zone[map.idx(x, y)] = ZONE.PITS;
  }

  map.addBoundary();

  // Long partitions — the signature of Level 0.
  const segs = Math.floor(n * 0.2);
  for (let s = 0; s < segs; s++) {
    const x = rng.int(0, COLS - 1), y = rng.int(1, ROWS - 1);
    const d = density[map.idx(x, Math.min(ROWS - 1, y))];
    if (!rng.chance(0.15 + d * 0.95)) continue;
    const horiz = rng.chance(0.5);
    const len = rng.int(1, d > 0.55 ? 4 : 7);
    for (let k = 0; k < len; k++) {
      if (horiz) {
        const ex = x + k;
        if (ex >= COLS || inPitRoom(ex, y, 1) || inPitRoom(ex, y - 1, 1)) break;
        map.setH(ex, y, EDGE_WALL);
      } else {
        const ey = y + k;
        if (ey >= ROWS || inPitRoom(x, ey, 1) || inPitRoom(x - 1, ey, 1)) break;
        if (x > 0) map.setV(x, ey, EDGE_WALL);
      }
    }
  }

  // Small rooms with one to three doorways.
  for (let r = 0; r < 26; r++) {
    const w = rng.int(2, 4), h = rng.int(2, 4);
    const x0 = rng.int(1, COLS - w - 1), y0 = rng.int(1, ROWS - h - 1);
    if (inPitRoom(x0, y0, 2) || inPitRoom(x0 + w, y0 + h, 2) || inPitRoom(x0 + w, y0, 2) || inPitRoom(x0, y0 + h, 2)) continue;
    const perim = [];
    for (let x = x0; x < x0 + w; x++) {
      perim.push({ h: true, x, y: y0 }, { h: true, x, y: y0 + h });
    }
    for (let y = y0; y < y0 + h; y++) {
      perim.push({ h: false, x: x0, y }, { h: false, x: x0 + w, y });
    }
    for (const e of perim) map.setEdge(e, EDGE_WALL);
    const doors = rng.int(1, 3);
    for (let i = 0; i < doors; i++) map.setEdge(rng.pick(perim), EDGE_OPEN);
  }

  // Pitfalls room walls, with several openings.
  const perim = [];
  for (let x = pRoom.x; x < pRoom.x + pw; x++) {
    perim.push({ h: true, x, y: pRoom.y }, { h: true, x, y: pRoom.y + ph });
  }
  for (let y = pRoom.y; y < pRoom.y + ph; y++) {
    perim.push({ h: false, x: pRoom.x, y }, { h: false, x: pRoom.x + pw, y });
  }
  for (const e of perim) map.setEdge(e, EDGE_WALL);
  for (let i = 0; i < 4; i++) map.setEdge(rng.pick(perim), EDGE_OPEN);

  // Pits on every interior cell (the outer ring stays walkable).
  const pits = [];
  for (let y = pRoom.y + 1; y < pRoom.y + ph - 1; y++) {
    for (let x = pRoom.x + 1; x < pRoom.x + pw - 1; x++) {
      const s = 1.35;
      const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL;
      pits.push({ x0: cx - s / 2, z0: cz - s / 2, x1: cx + s / 2, z1: cz + s / 2 });
    }
  }

  // Square pillars in the open, low-density halls.
  const pillars = [];
  const wallTouches = (cx, cy) =>
    (cx < COLS && map.getH(cx, cy)) || (cx > 0 && map.getH(cx - 1, cy)) ||
    (cy < ROWS && map.getV(cx, cy)) || (cy > 0 && map.getV(cx, cy - 1));
  for (let cy = 1; cy < ROWS; cy++) {
    for (let cx = 1; cx < COLS; cx++) {
      if (inPitRoom(cx, cy, 1) || inPitRoom(cx - 1, cy - 1, 1)) continue;
      const d = (density[map.idx(cx, cy)] + density[map.idx(cx - 1, cy - 1)]) / 2;
      if (d > 0.42 || wallTouches(cx, cy)) continue;
      if (rng.chance(0.38)) pillars.push({ x: cx * CELL, z: cy * CELL, size: rng.range(0.9, 1.25) });
    }
  }

  // Spawn somewhere ordinary.
  let spawn;
  for (let tries = 0; tries < 500; tries++) {
    const x = rng.int(3, COLS - 4), y = rng.int(3, ROWS - 4);
    if (zone[map.idx(x, y)] === ZONE.NORMAL && !inPitRoom(x, y, 2)) {
      spawn = { x, y };
      break;
    }
  }
  spawn = spawn || { x: 1, y: 1 };

  map.connectAll(rng, (e) => map.isBoundaryEdge(e));

  // Fluorescent fixtures in long rows.
  const lights = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (x % 2 !== 0) continue;
      const z = zone[map.idx(x, y)];
      const [wx, wz] = map.cellCenter(x, y);
      const l = { x: wx, z: wz, color: WHITE, power: 1.0, state: 'on', zone: z };
      if (z === ZONE.DARK) {
        const r = rng.next();
        l.state = r < 0.72 ? 'off' : r < 0.84 ? 'flicker' : 'on';
        l.power = 0.55;
      } else if (z === ZONE.RED) {
        l.color = RED;
        l.power = 1.15;
        l.panelTint = [1, 0.86, 0.86];
        if (rng.chance(0.08)) l.state = 'flicker';
      } else {
        const r = rng.next();
        if (r < 0.035) l.state = 'flicker';
        else if (r < 0.06) l.state = 'off';
      }
      lights.push(l);
    }
  }
  // Never start next to a flickering fixture; first impressions matter.
  for (const l of lights) {
    if (Math.hypot(l.x - (spawn.x + 0.5) * CELL, l.z - (spawn.y + 0.5) * CELL) < 7) l.state = 'on';
  }

  // Exit: a flickering wall far from the spawn.
  const dist = map.bfs(spawn.x, spawn.y);
  let maxD = 0;
  for (const d of dist) maxD = Math.max(maxD, d);
  const exitCands = [];
  for (let i = 0; i < n; i++) {
    if (dist[i] < maxD * 0.6 || zone[i] === ZONE.PITS) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const e = map.edge(x, y, d);
      if (map.getEdge(e) !== EDGE_WALL) continue;
      // Leave room in front of the exit: the other side must not be a pit cell.
      exitCands.push(e);
    }
  }
  const exitEdge = rng.pick(exitCands);

  // Almond Water, scattered.
  const bottles = [];
  const nBottles = rng.int(11, 16);
  for (let tries = 0; tries < 2000 && bottles.length < nBottles; tries++) {
    const x = rng.int(0, COLS - 1), y = rng.int(0, ROWS - 1);
    const i = map.idx(x, y);
    if (zone[i] === ZONE.PITS || dist[i] < 3) continue;
    if (bottles.some((b) => b.cx === x && b.cy === y)) continue;
    bottles.push({ cx: x, cy: y, x: (x + 0.5) * CELL + rng.range(-0.8, 0.8), z: (y + 0.5) * CELL + rng.range(-0.8, 0.8) });
  }

  // Face down the longest open stretch at spawn.
  let yaw = 0, best = -1;
  for (let d = 0; d < 4; d++) {
    let run = 0, x = spawn.x, y = spawn.y;
    while (run < 12 && map.canMove(x, y, d)) {
      x += DIRS[d][0];
      y += DIRS[d][1];
      run++;
    }
    if (run > best) {
      best = run;
      yaw = Math.atan2(-DIRS[d][0], -DIRS[d][1]);
    }
  }

  return { map, zone, density, lights, pillars, pits, spawn, spawnYaw: yaw, exitEdge, bottles, pitRoom: pRoom };
}
