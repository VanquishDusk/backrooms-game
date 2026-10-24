import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';

// Level 0.2: Level 0 as remodelled by the Backrooms Remodeling Co. Same
// bones (partitions, small rooms) but tidier, with the odd bathroom.

const COLS = 26;
const ROWS = 26;
const CELL = 3;
const HEIGHT = 2.75;
const LIGHT = [1, 1, 0.96];

export function generateLevel02(rng) {
  const map = new GridMap(COLS, ROWS, CELL, HEIGHT);
  const n = COLS * ROWS;
  const bathroom = new Uint8Array(n);
  map.addBoundary();

  // Bathrooms first, so partitions don't cut through them.
  const baths = [];
  for (let tries = 0; tries < 40 && baths.length < 3; tries++) {
    const w = 2, h = 2;
    const x0 = rng.int(1, COLS - w - 1), y0 = rng.int(1, ROWS - h - 1);
    let clash = false;
    for (let y = y0 - 1; y <= y0 + h && !clash; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) if (map.inBounds(x, y) && bathroom[map.idx(x, y)]) clash = true;
    }
    if (clash) continue;
    const perim = [];
    for (let x = x0; x < x0 + w; x++) perim.push({ h: true, x, y: y0 }, { h: true, x, y: y0 + h });
    for (let y = y0; y < y0 + h; y++) perim.push({ h: false, x: x0, y }, { h: false, x: x0 + w, y });
    for (const e of perim) map.setEdge(e, EDGE_WALL);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        bathroom[map.idx(x, y)] = 1;
        // Clear any interior walls.
        if (x > x0) map.setV(x, y, EDGE_OPEN);
        if (y > y0) map.setH(x, y, EDGE_OPEN);
      }
    }
    const door = rng.pick(perim);
    map.setEdge(door, EDGE_OPEN);
    baths.push({ x0, y0, w, h, perim, door });
  }
  const inBath = (x, y) => map.inBounds(x, y) && bathroom[map.idx(x, y)] === 1;

  // Long, straight partitions.
  for (let s = 0; s < n * 0.16; s++) {
    const x = rng.int(0, COLS - 1), y = rng.int(1, ROWS - 1);
    const horiz = rng.chance(0.5);
    const len = rng.int(2, 6);
    for (let k = 0; k < len; k++) {
      if (horiz) {
        const ex = x + k;
        if (ex >= COLS || inBath(ex, y) || inBath(ex, y - 1)) break;
        map.setH(ex, y, EDGE_WALL);
      } else {
        const ey = y + k;
        if (ey >= ROWS || x === 0 || inBath(x, ey) || inBath(x - 1, ey)) break;
        map.setV(x, ey, EDGE_WALL);
      }
    }
  }

  // Offices.
  for (let r = 0; r < 12; r++) {
    const w = rng.int(2, 4), h = rng.int(2, 3);
    const x0 = rng.int(1, COLS - w - 1), y0 = rng.int(1, ROWS - h - 1);
    let clash = false;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (inBath(x, y)) clash = true;
    if (clash) continue;
    const perim = [];
    for (let x = x0; x < x0 + w; x++) perim.push({ h: true, x, y: y0 }, { h: true, x, y: y0 + h });
    for (let y = y0; y < y0 + h; y++) perim.push({ h: false, x: x0, y }, { h: false, x: x0 + w, y });
    for (const e of perim) map.setEdge(e, EDGE_WALL);
    for (let i = rng.int(1, 2); i > 0; i--) map.setEdge(rng.pick(perim), EDGE_OPEN);
  }

  let spawn = { x: COLS >> 1, y: ROWS >> 1 };
  for (let tries = 0; tries < 300; tries++) {
    const x = rng.int(4, COLS - 5), y = rng.int(4, ROWS - 5);
    if (!inBath(x, y)) {
      spawn = { x, y };
      break;
    }
  }

  // Bathroom walls (apart from their door) stay intact.
  const bathWall = (e) => baths.some((b) => b.perim.some((p) => p.h === e.h && p.x === e.x && p.y === e.y));
  map.connectAll(rng, (e) => map.isBoundaryEdge(e) || bathWall(e));

  const lights = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x += 2) {
      const [wx, wz] = map.cellCenter(x, y);
      lights.push({ x: wx, z: wz, color: LIGHT, power: 1.05, state: 'on' });
    }
  }

  // The door back to Level 0, far from where you came in.
  const dist = map.bfs(spawn.x, spawn.y);
  let maxD = 0;
  for (const d of dist) maxD = Math.max(maxD, d);
  const doorCands = [];
  for (let i = 0; i < n; i++) {
    if (dist[i] < maxD * 0.6) continue;
    const x = i % COLS, y = (i / COLS) | 0;
    if (inBath(x, y)) continue;
    for (let d = 0; d < 4; d++) {
      const e = map.edge(x, y, d);
      if (map.getEdge(e) === EDGE_WALL && !bathWall(e)) doorCands.push({ edge: e, side: { x, y } });
    }
  }
  const exitDoor = rng.pick(doorCands);

  // Working outlets on wall faces.
  const outlets = [];
  for (let tries = 0; tries < 400 && outlets.length < 28; tries++) {
    const x = rng.int(0, COLS - 1), y = rng.int(0, ROWS - 1), d = rng.int(0, 3);
    const e = map.edge(x, y, d);
    if (map.getEdge(e) !== EDGE_WALL) continue;
    if (e.h === exitDoor.edge.h && e.x === exitDoor.edge.x && e.y === exitDoor.edge.y) continue;
    const off = rng.range(-1, 1);
    const [cx, cz] = map.cellCenter(x, y);
    const nx = -DIRS[d][0], nz = -DIRS[d][1];
    const face = {
      x: cx - nx * (CELL / 2 - 0.09) + (e.h ? off : 0),
      z: cz - nz * (CELL / 2 - 0.09) + (e.h ? 0 : off),
      nx,
      nz,
    };
    outlets.push(face);
  }

  // Bathroom fixtures against the back walls.
  const fixtures = [];
  for (const b of baths) {
    for (let y = b.y0; y < b.y0 + b.h; y++) {
      for (let x = b.x0; x < b.x0 + b.w; x++) {
        for (let d = 0; d < 4; d++) {
          const e = map.edge(x, y, d);
          if (map.getEdge(e) !== EDGE_WALL || !rng.chance(0.35)) continue;
          const [cx, cz] = map.cellCenter(x, y);
          const nx = -DIRS[d][0], nz = -DIRS[d][1];
          fixtures.push({
            type: rng.chance(0.5) ? 'toilet' : 'sink',
            x: cx - nx * (CELL / 2 - 0.45),
            z: cz - nz * (CELL / 2 - 0.45),
            rot: Math.atan2(nx, nz),
          });
          break;
        }
      }
    }
  }

  const bottles = [];
  const nBottles = rng.int(3, 5);
  for (let tries = 0; tries < 200 && bottles.length < nBottles; tries++) {
    const x = rng.int(0, COLS - 1), y = rng.int(0, ROWS - 1);
    if (dist[map.idx(x, y)] < 2) continue;
    const [cx, cz] = map.cellCenter(x, y);
    bottles.push({ x: cx + rng.range(-0.8, 0.8), z: cz + rng.range(-0.8, 0.8) });
  }

  let yaw = 0, best = -1;
  for (let d = 0; d < 4; d++) {
    let run = 0, x = spawn.x, y = spawn.y;
    while (run < 10 && map.canMove(x, y, d)) {
      x += DIRS[d][0];
      y += DIRS[d][1];
      run++;
    }
    if (run > best) {
      best = run;
      yaw = Math.atan2(-DIRS[d][0], -DIRS[d][1]);
    }
  }

  return { map, bathroom, lights, spawn, spawnYaw: yaw, exitDoor, outlets, fixtures, bottles, dist };
}
