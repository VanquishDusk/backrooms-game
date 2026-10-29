import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';

// Level 1.5: narrow house hallways that go on and on, lined with doors and
// picture frames, ending in more doors. Long straight runs, as in the photo.

const COLS = 22;
const ROWS = 22;
const CELL = 2.0;
const HEIGHT = 2.6;

export const FEATURE = { NONE: 0, DOOR: 1, FRAMES: 2, ORNAMENT: 3, WRITING: 4 };

export function generateLevel15(rng) {
  const map = new GridMap(COLS, ROWS, CELL, HEIGHT);
  const n = COLS * ROWS;
  for (let y = 0; y <= ROWS; y++) for (let x = 0; x < COLS; x++) map.setH(x, y, EDGE_WALL);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x <= COLS; x++) map.setV(x, y, EDGE_WALL);

  // Maze carved with a strong bias to keep going straight: long hallways.
  const seen = new Uint8Array(n);
  const stack = [[rng.int(0, COLS - 1), rng.int(0, ROWS - 1), -1]];
  seen[map.idx(stack[0][0], stack[0][1])] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    const [x, y, lastDir] = top;
    const opts = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (map.inBounds(nx, ny) && !seen[map.idx(nx, ny)]) opts.push(d);
    }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const d = opts.includes(lastDir) && rng.chance(0.82) ? lastDir : rng.pick(opts);
    map.setEdge(map.edge(x, y, d), EDGE_OPEN);
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
    seen[map.idx(nx, ny)] = 1;
    stack.push([nx, ny, d]);
  }
  // A few loops.
  for (let k = 0; k < n * 0.06; k++) {
    const x = rng.int(1, COLS - 2), y = rng.int(1, ROWS - 2);
    map.setEdge(map.edge(x, y, rng.pick([0, 2])), EDGE_OPEN);
  }

  const openDirs = (x, y) => [0, 1, 2, 3].filter((d) => map.canMove(x, y, d));
  const spawn = { x: rng.int(3, COLS - 4), y: rng.int(3, ROWS - 4) };
  const dist = map.bfs(spawn.x, spawn.y);

  // The way out: the farthest dead end, where reality wears thin.
  let exitCell = null, best = -1;
  for (let i = 0; i < n; i++) {
    const x = i % COLS, y = (i / COLS) | 0;
    if (openDirs(x, y).length !== 1 || dist[i] <= best) continue;
    best = dist[i];
    exitCell = { x, y };
  }
  const inDir = openDirs(exitCell.x, exitCell.y)[0];
  const exitDir = inDir ^ 1; // the wall facing back up the hallway
  const exitEdge = map.edge(exitCell.x, exitCell.y, exitDir);

  // What hangs on each wall face: (cell, dir) -> feature.
  const features = [];
  const lights = [];
  let writings = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = map.idx(x, y);
      const open = openDirs(x, y);
      for (let d = 0; d < 4; d++) {
        if (open.includes(d)) continue;
        if (x === exitCell.x && y === exitCell.y && d === exitDir) continue;
        let f = FEATURE.NONE;
        // Dead ends always finish in a door, like the photo.
        if (open.length === 1 && d === (open[0] ^ 1)) f = FEATURE.DOOR;
        else {
          const r = rng.next();
          if (r < 0.32) f = FEATURE.DOOR;
          else if (r < 0.62) f = FEATURE.FRAMES;
          else if (r < 0.72) f = FEATURE.ORNAMENT;
          else if (r < 0.74 && writings < 3 && dist[i] > 4) {
            f = FEATURE.WRITING;
            writings++;
          }
        }
        if (f !== FEATURE.NONE) features.push({ x, y, d, f, upside: rng.chance(0.3) });
      }
      if ((x * 7 + y * 3) % 3 === 0) {
        const [wx, wz] = map.cellCenter(x, y);
        const r = rng.next();
        lights.push({ x: wx, z: wz, color: [1, 1, 1], power: 1.15, state: r < 0.1 ? 'flicker' : r < 0.16 ? 'off' : 'on', rotate: open.includes(0) || open.includes(1) });
      }
    }
  }

  // Upside-down things: furniture on the ceiling, fixtures in the floor.
  const hanging = [];
  const floorLights = [];
  for (let k = 0; k < 12; k++) {
    const x = rng.int(0, COLS - 1), y = rng.int(0, ROWS - 1);
    const i = map.idx(x, y);
    if (dist[i] < 2) continue;
    const [wx, wz] = map.cellCenter(x, y);
    if (k % 2) hanging.push({ x: wx + rng.range(-0.3, 0.3), z: wz + rng.range(-0.3, 0.3), kind: rng.pick(['chair', 'table', 'chair']), rot: rng.range(0, Math.PI) });
    else floorLights.push({ x: wx, z: wz, rotate: rng.chance(0.5) });
  }

  // Logs, written by someone who got in and didn't get out.
  const logs = [];
  for (let k = 0; k < 4; k++) {
    for (let t = 0; t < 100; t++) {
      const x = rng.int(0, COLS - 1), y = rng.int(0, ROWS - 1);
      const i = map.idx(x, y);
      if (dist[i] < 3 + k * 4) continue;
      if (logs.some((l) => l.cx === x && l.cy === y)) continue;
      const [wx, wz] = map.cellCenter(x, y);
      logs.push({ cx: x, cy: y, x: wx + rng.range(-0.4, 0.4), z: wz + rng.range(-0.4, 0.4), index: k });
      break;
    }
  }

  let yaw = 0, bestRun = -1;
  for (const d of openDirs(spawn.x, spawn.y)) {
    let run = 0, x = spawn.x, y = spawn.y;
    while (run < 12 && map.canMove(x, y, d)) {
      x += DIRS[d][0];
      y += DIRS[d][1];
      run++;
    }
    if (run > bestRun) {
      bestRun = run;
      yaw = Math.atan2(-DIRS[d][0], -DIRS[d][1]);
    }
  }

  return { map, spawn, spawnYaw: yaw, dist, exitCell, exitEdge, features, lights, hanging, floorLights, logs };
}
