import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';
import { createNoise2D } from '../../core/rng.js';

// Level 1 — The Habitable Zone. A seemingly endless concrete complex: open
// parking-garage halls, tighter corridor blocks with rooms, warehouse
// storage, a handful of stranger sectors, and the long hallway out.

export const ZONE = { HALL: 0, CORRIDOR: 1, ROOM: 2, STORAGE: 3, EXIT: 4 };
export const SECTOR = { AQUILA: 0, GILD: 1, GOTHIC: 2, OUROBOROS: 3, GARDEN: 4, FABLED: 5 };
export const SECTOR_NAMES = ['Aquila', 'Gild', 'Gothic', 'Ouroboros', 'Garden', 'Fabled'];

const COLS = 40;
const ROWS = 40;
const CELL = 3.5;
const HEIGHT = 3.6;
const EXIT_LEN = 12;

const COOL = [0.92, 1, 1];
const WARM = [1, 0.86, 0.62];
const SUN = [0.95, 1, 0.62];
const PINK = [1, 0.25, 0.75];
const CYAN = [0.25, 0.9, 1];
const EMERGENCY = [1, 0.08, 0.04];

export function generateLevel1(rng) {
  const map = new GridMap(COLS, ROWS, CELL, HEIGHT);
  const n = COLS * ROWS;
  const zone = new Uint8Array(n);
  const sector = new Uint8Array(n);
  const reserved = new Uint8Array(n);
  const warp = createNoise2D(rng);
  map.addBoundary();
  const idx = (x, y) => map.idx(x, y);
  const inRect = (x, y, r, pad = 0) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad;

  // Arrival point: somewhere central-ish, in Aquila.
  const spawn = { x: rng.int(12, COLS - 13), y: rng.int(12, ROWS - 13) };

  // ---- Sectors (warped Voronoi) -----------------------------------------
  const seeds = [{ x: spawn.x, y: spawn.y, s: SECTOR.AQUILA, k: 1 }];
  const want = [
    [SECTOR.GILD, 1], [SECTOR.GOTHIC, 1], [SECTOR.OUROBOROS, 1.1],
    [SECTOR.GARDEN, 1.5], [SECTOR.FABLED, 1.5], [SECTOR.AQUILA, 1], [SECTOR.AQUILA, 1], [SECTOR.GILD, 1.1],
  ];
  for (const [s, k] of want) {
    for (let tries = 0; tries < 80; tries++) {
      const x = rng.int(2, COLS - 3), y = rng.int(2, ROWS - 3);
      const minD = tries < 60 ? 10 : 6;
      if (seeds.every((p) => Math.hypot(p.x - x, p.y - y) > minD)) {
        seeds.push({ x, y, s, k });
        break;
      }
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const wx = x + (warp(x / 6, y / 6) - 0.5) * 6, wy = y + (warp(x / 6 + 40, y / 6 + 40) - 0.5) * 6;
      let best = 0, bd = Infinity;
      seeds.forEach((p, i) => {
        const d = Math.hypot(p.x - wx, p.y - wy) * p.k;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      sector[idx(x, y)] = seeds[best].s;
    }
  }
  // You always arrive somewhere ordinary.
  for (let y = spawn.y - 3; y <= spawn.y + 3; y++) {
    for (let x = spawn.x - 3; x <= spawn.x + 3; x++) if (map.inBounds(x, y)) sector[idx(x, y)] = SECTOR.AQUILA;
  }

  // ---- The hallway out --------------------------------------------------
  let exit = null;
  for (let tries = 0; tries < 400 && !exit; tries++) {
    const horiz = rng.chance(0.5);
    const dir = rng.chance(0.5) ? 1 : -1;
    const sx = rng.int(2, COLS - 3), sy = rng.int(2, ROWS - 3);
    const cells = [];
    for (let i = 0; i < EXIT_LEN; i++) cells.push(horiz ? [sx + i * dir, sy] : [sx, sy + i * dir]);
    const [ex, ey] = cells[cells.length - 1];
    if (!cells.every(([x, y]) => x >= 1 && y >= 1 && x < COLS - 1 && y < ROWS - 1)) continue;
    // Entrance far from the arrival point.
    if (Math.hypot(sx - spawn.x, sy - spawn.y) < 16 || Math.hypot(ex - spawn.x, ey - spawn.y) < 12) continue;
    exit = { cells, horiz, dir };
  }
  const exitSet = new Set(exit.cells.map(([x, y]) => idx(x, y)));
  const exitSide = [];
  {
    const { cells, horiz, dir } = exit;
    cells.forEach(([x, y], i) => {
      zone[idx(x, y)] = ZONE.EXIT;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.inBounds(x + dx, y + dy)) reserved[idx(x + dx, y + dy)] = 1;
      // Side walls.
      const sides = horiz ? [2, 3] : [0, 1];
      for (const d of sides) {
        const e = map.edge(x, y, d);
        map.setEdge(e, EDGE_WALL);
        exitSide.push(e);
      }
      // Open the way in, and the walls between consecutive hallway cells.
      const back = horiz ? (dir > 0 ? 1 : 0) : (dir > 0 ? 3 : 2);
      map.setEdge(map.edge(x, y, back), EDGE_OPEN);
    });
    // Close the far end.
    const [lx, ly] = cells[cells.length - 1];
    const fwd = horiz ? (dir > 0 ? 0 : 1) : (dir > 0 ? 2 : 3);
    const endEdge = map.edge(lx, ly, fwd);
    map.setEdge(endEdge, EDGE_WALL);
    exitSide.push(endEdge);
    exit.forward = fwd;
  }
  const keepEdge = (e) => map.isBoundaryEdge(e) || exitSide.some((k) => k.h === e.h && k.x === e.x && k.y === e.y);

  // ---- Corridor blocks with rooms ----------------------------------------
  const blocks = [];
  const rooms = [];
  for (let tries = 0; tries < 120 && blocks.length < 6; tries++) {
    const w = rng.int(6, 9), h = rng.int(5, 8);
    const r = { x: rng.int(1, COLS - w - 1), y: rng.int(1, ROWS - h - 1), w, h };
    if (Math.hypot(r.x + w / 2 - spawn.x, r.y + h / 2 - spawn.y) < 7) continue;
    let ok = !blocks.some((b) => r.x < b.x + b.w + 1 && r.x + r.w + 1 > b.x && r.y < b.y + b.h + 1 && r.y + r.h + 1 > b.y);
    for (let y = r.y; y < r.y + h && ok; y++) for (let x = r.x; x < r.x + w && ok; x++) if (reserved[idx(x, y)]) ok = false;
    if (!ok) continue;
    blocks.push(r);
    // Wall everything, then carve a maze.
    for (let y = r.y; y < r.y + h; y++) {
      for (let x = r.x; x < r.x + w; x++) {
        zone[idx(x, y)] = ZONE.CORRIDOR;
        for (let d = 0; d < 4; d++) map.setEdge(map.edge(x, y, d), EDGE_WALL);
      }
    }
    const seen = new Set();
    const stack = [[r.x, r.y]];
    seen.add(idx(r.x, r.y));
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (inRect(nx, ny, r) && !seen.has(idx(nx, ny))) opts.push(d);
      }
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const d = rng.pick(opts);
      map.setEdge(map.edge(x, y, d), EDGE_OPEN);
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      seen.add(idx(nx, ny));
      stack.push([nx, ny]);
    }
    // A few loops so it isn't a perfect maze.
    for (let k = 0; k < w * h * 0.12; k++) {
      const x = rng.int(r.x, r.x + w - 2), y = rng.int(r.y, r.y + h - 2);
      map.setEdge(map.edge(x, y, rng.chance(0.5) ? 0 : 2), EDGE_OPEN);
    }
    // One or two rooms (offices, an infirmary, empty spaces).
    for (let k = rng.int(1, 2); k > 0; k--) {
      const rx = rng.int(r.x, r.x + w - 2), ry = rng.int(r.y, r.y + h - 2);
      if (zone[idx(rx, ry)] === ZONE.ROOM) continue;
      const cells = [[rx, ry], [rx + 1, ry], [rx, ry + 1], [rx + 1, ry + 1]];
      for (const [x, y] of cells) zone[idx(x, y)] = ZONE.ROOM;
      map.setEdge(map.edge(rx, ry, 0), EDGE_OPEN);
      map.setEdge(map.edge(rx, ry, 2), EDGE_OPEN);
      map.setEdge(map.edge(rx + 1, ry, 2), EDGE_OPEN);
      map.setEdge(map.edge(rx, ry + 1, 0), EDGE_OPEN);
      rooms.push({ x: rx, y: ry, kind: rng.pick(['office', 'office', 'infirmary', 'empty']) });
    }
    // Ways in from the halls.
    const perim = [];
    for (let x = r.x; x < r.x + w; x++) perim.push({ h: true, x, y: r.y }, { h: true, x, y: r.y + h });
    for (let y = r.y; y < r.y + h; y++) perim.push({ h: false, x: r.x, y }, { h: false, x: r.x + w, y });
    const doors = perim.filter((e) => !map.isBoundaryEdge(e));
    for (let k = rng.int(2, 4); k > 0 && doors.length; k--) map.setEdge(rng.pick(doors), EDGE_OPEN);
  }
  const free = (x, y) => map.inBounds(x, y) && zone[idx(x, y)] === ZONE.HALL && !reserved[idx(x, y)];

  // ---- Storage areas (shelving) -----------------------------------------
  const shelves = [];
  const extraBoxes = [];
  for (let y = 1; y < ROWS - 1; y += 2) {
    for (let x = 1; x < COLS - 2; x++) {
      const s = sector[idx(x, y)];
      const storageHere = s === SECTOR.GILD ? 0.6 : s === SECTOR.AQUILA ? 0.03 : 0.06;
      if (!free(x, y) || !free(x + 1, y) || !rng.chance(storageHere)) continue;
      // Shelving unit along x, centred in the row of cells.
      const z = (y + 0.5) * CELL;
      const x0 = x * CELL + 0.5, x1 = (x + 2) * CELL - 0.5;
      shelves.push({ x0, x1, z, depth: 1.0, height: 2.7 });
      extraBoxes.push({ x0, z0: z - 0.5, x1, z1: z + 0.5 });
      zone[idx(x, y)] = zone[idx(x + 1, y)] = ZONE.STORAGE;
      x += 2;
    }
  }
  // Cells beside shelving count as storage too.
  for (const sh of shelves) {
    const y = Math.floor(sh.z / CELL);
    for (let x = Math.floor(sh.x0 / CELL); x <= Math.floor(sh.x1 / CELL); x++) {
      for (const yy of [y - 1, y + 1]) if (free(x, yy)) zone[idx(x, yy)] = ZONE.STORAGE;
    }
  }
  const hallLike = (x, y) => map.inBounds(x, y) && (zone[idx(x, y)] === ZONE.HALL || zone[idx(x, y)] === ZONE.STORAGE);

  // ---- Partitions in the halls -----------------------------------------
  for (let s = 0; s < n * 0.045; s++) {
    const x = rng.int(1, COLS - 2), y = rng.int(1, ROWS - 2);
    const horiz = rng.chance(0.5), len = rng.int(2, 6);
    for (let k = 0; k < len; k++) {
      const cx = horiz ? x + k : x, cy = horiz ? y : y + k;
      const ox = horiz ? cx : cx - 1, oy = horiz ? cy - 1 : cy;
      if (!free(cx, cy) || !free(ox, oy) || zone[idx(cx, cy)] === ZONE.STORAGE) break;
      if (horiz) map.setH(cx, cy, EDGE_WALL);
      else map.setV(cx, cy, EDGE_WALL);
    }
  }

  // ---- Pillars -----------------------------------------------------------
  const pillars = [];
  const pillarAt = new Set();
  const wallTouches = (cx, cy) =>
    (cx < COLS && map.getH(cx, cy)) || (cx > 0 && map.getH(cx - 1, cy)) ||
    (cy < ROWS && map.getV(cx, cy)) || (cy > 0 && map.getV(cx, cy - 1));
  for (let cy = 2; cy < ROWS - 1; cy += 2) {
    for (let cx = 2; cx < COLS - 1; cx += 2) {
      if (![[cx, cy], [cx - 1, cy], [cx, cy - 1], [cx - 1, cy - 1]].every(([x, y]) => zone[idx(x, y)] === ZONE.HALL && !reserved[idx(x, y)])) continue;
      if (wallTouches(cx, cy)) continue;
      const s = sector[idx(cx, cy)];
      const p = { x: cx * CELL, z: cy * CELL, size: 1.1, sector: s };
      if (s === SECTOR.GOTHIC) Object.assign(p, { round: true, flare: true, size: 0.85, style: 'stone' });
      if (s === SECTOR.FABLED) p.style = 'panel';
      if (s === SECTOR.GARDEN) p.style = 'moss';
      pillars.push(p);
      pillarAt.add(`${cx},${cy}`);
    }
  }

  map.connectAll(rng, keepEdge);

  // ---- Lights ------------------------------------------------------------
  const lights = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = idx(x, y), z = zone[i], s = sector[i];
      const [wx, wz] = map.cellCenter(x, y);
      if (z === ZONE.EXIT) continue; // placed separately
      if (z === ZONE.CORRIDOR || z === ZONE.ROOM) {
        if ((x + y) % 2 === 0) lights.push({ x: wx, z: wz, color: COOL, power: 0.85, state: rng.chance(0.06) ? 'flicker' : 'on', zone: z });
        // Red emergency lighting that stays on in a blackout.
        if ((x + y) % 2 === 1 || z === ZONE.ROOM) lights.push({ x: wx, z: wz, color: EMERGENCY, power: 0.9, state: 'on', layer: 1, emergency: true });
        continue;
      }
      if (x % 2 !== 0) continue;
      const l = { x: wx, z: wz, color: COOL, power: 1.15, state: 'on', zone: z, sector: s };
      if (s === SECTOR.GOTHIC) l.color = WARM;
      if (s === SECTOR.GARDEN) { l.color = SUN; l.power = 1.35; }
      if (s === SECTOR.FABLED) { l.color = (x + y) % 4 < 2 ? PINK : CYAN; l.power = 1.25; l.neon = true; }
      if (s === SECTOR.OUROBOROS) { l.color = WARM; if (rng.chance(0.25)) l.state = 'off'; }
      const r = rng.next();
      if (r < 0.04) l.state = 'flicker';
      else if (r < 0.12) l.state = 'off';
      lights.push(l);
    }
  }
  // The hallway out: warm and dimming toward the end.
  exit.cells.forEach(([x, y], i) => {
    const [wx, wz] = map.cellCenter(x, y);
    const k = i / (EXIT_LEN - 1);
    if (i >= EXIT_LEN - 1) return;
    lights.push({ x: wx, z: wz, color: [1, 0.85 - k * 0.3, 0.6 - k * 0.35], power: 1.0 - k * 0.6, state: i > EXIT_LEN * 0.6 && rng.chance(0.4) ? 'flicker' : 'on', zone: ZONE.EXIT, rotate: !exit.horiz });
  });

  // ---- Crates ------------------------------------------------------------
  const crates = [];
  const crateCount = rng.int(48, 60);
  for (let tries = 0; tries < 4000 && crates.length < crateCount; tries++) {
    const x = rng.int(0, COLS - 1), y = rng.int(0, ROWS - 1);
    const i = idx(x, y), z = zone[i], s = sector[i];
    if (z === ZONE.EXIT || reserved[i] && z !== ZONE.HALL) continue;
    const weight = (z === ZONE.STORAGE ? 4 : z === ZONE.ROOM ? 2 : 1) * (s === SECTOR.GILD ? 2 : 1) * (s === SECTOR.GARDEN ? 1.5 : 1);
    if (!rng.chance(weight / 8)) continue;
    if (Math.abs(x - spawn.x) + Math.abs(y - spawn.y) < 2) continue;
    const [cx, cz] = map.cellCenter(x, y);
    let px = cx + rng.range(-0.7, 0.7), pz = cz + rng.range(-0.7, 0.7);
    if (z === ZONE.STORAGE) {
      // Beside the shelving, not inside it.
      pz = cz + (rng.chance(0.5) ? -1 : 1) * rng.range(0.9, 1.2);
    }
    if (crates.some((c) => Math.hypot(c.x - px, c.z - pz) < 1.6)) continue;
    crates.push({
      x: px, z: pz, rot: rng.range(0, Math.PI), size: rng.range(0.7, 0.95),
      table: s === SECTOR.GARDEN ? 'garden' : 'normal',
      ephemeral: rng.chance(0.3),
    });
  }

  // ---- Ceiling pipes: denser closer to the way out -----------------------
  const [ex0, ey0] = exit.cells[0];
  const pipes = [];
  for (let y = 1; y < ROWS; y++) {
    let run = null;
    for (let x = 0; x <= COLS; x++) {
      const ok = x < COLS && hallLike(x, y) && hallLike(x, y - 1);
      const prox = Math.max(0, 1 - Math.hypot(x - ex0, y - ey0) / 22);
      if (ok && !run && rng.chance(0.06 + prox * 0.5)) run = { x0: x, y, prox };
      if (run && (!ok || rng.chance(0.03))) {
        if (x - run.x0 >= 2) pipes.push({ axis: 'x', a0: run.x0 * CELL, a1: x * CELL, c: y * CELL, red: rng.chance(0.35), r: rng.pick([0.05, 0.08, 0.12, 0.18]) });
        run = null;
      }
    }
  }
  for (let x = 1; x < COLS; x++) {
    let run = null;
    for (let y = 0; y <= ROWS; y++) {
      const ok = y < ROWS && hallLike(x, y) && hallLike(x - 1, y);
      const prox = Math.max(0, 1 - Math.hypot(x - ex0, y - ey0) / 22);
      if (ok && !run && rng.chance(0.04 + prox * 0.45)) run = { y0: y };
      if (run && (!ok || rng.chance(0.03))) {
        if (y - run.y0 >= 2) pipes.push({ axis: 'z', a0: run.y0 * CELL, a1: y * CELL, c: x * CELL, red: rng.chance(0.35), r: rng.pick([0.05, 0.08, 0.12]) });
        run = null;
      }
    }
  }

  // ---- Set pieces --------------------------------------------------------
  const pickCell = (pred, tries = 600) => {
    for (let t = 0; t < tries; t++) {
      const x = rng.int(1, COLS - 2), y = rng.int(1, ROWS - 2);
      if (pred(x, y, idx(x, y))) return [x, y];
    }
    return null;
  };
  const gothicCell = pickCell((x, y, i) => sector[i] === SECTOR.GOTHIC && zone[i] === ZONE.HALL && !reserved[i]);
  const workers = [];
  for (let k = rng.int(3, 5); k > 0; k--) {
    const c = pickCell((x, y, i) => sector[i] === SECTOR.OUROBOROS && zone[i] === ZONE.HALL && !reserved[i]);
    if (c) workers.push({ x: (c[0] + 0.5) * CELL + rng.range(-0.6, 0.6), z: (c[1] + 0.5) * CELL + rng.range(-0.6, 0.6), rot: rng.range(0, Math.PI * 2) });
  }
  // A clean white wall near the cache (Base Alpha). Level 1.3 is on the
  // other side of it.
  const whiteCands = [];
  for (let y = spawn.y - 6; y <= spawn.y + 6; y++) {
    for (let x = spawn.x - 6; x <= spawn.x + 6; x++) {
      if (!map.inBounds(x, y) || zone[idx(x, y)] !== ZONE.HALL) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 2.5) continue;
      for (let d = 0; d < 4; d++) {
        const e = map.edge(x, y, d);
        if (map.getEdge(e) === EDGE_WALL && !keepEdge(e)) whiteCands.push({ edge: e, side: { x, y } });
      }
    }
  }
  const whiteWall = whiteCands.length ? rng.pick(whiteCands) : null;
  const sameE = (a, b) => a && b && a.h === b.h && a.x === b.x && a.y === b.y;

  // A window in a concrete corridor that can't be a real window. It leads
  // to Level 1.5.
  const windowCands = [];
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const z = zone[idx(x, y)];
      if ((z !== ZONE.CORRIDOR && z !== ZONE.ROOM) || Math.hypot(x - spawn.x, y - spawn.y) < 8) continue;
      for (let d = 0; d < 4; d++) {
        const e = map.edge(x, y, d);
        if (map.getEdge(e) === EDGE_WALL && !keepEdge(e) && !sameE(e, whiteWall?.edge)) windowCands.push({ edge: e, side: { x, y } });
      }
    }
  }
  const fakeWindow = windowCands.length ? rng.pick(windowCands) : null;

  const notes = [];
  const noteCells = [[spawn.x, spawn.y]];
  for (let k = 0; k < 4; k++) {
    const c = pickCell((x, y, i) => zone[i] !== ZONE.EXIT && Math.hypot(x - spawn.x, y - spawn.y) > 6);
    if (c) noteCells.push(c);
  }
  noteCells.forEach(([x, y], k) => {
    const [cx, cz] = map.cellCenter(x, y);
    notes.push({ x: cx + (k === 0 ? 1.4 : rng.range(-0.6, 0.6)), z: cz + (k === 0 ? -1.2 : rng.range(-0.6, 0.6)), first: k === 0 });
  });

  // Face down the longest open stretch.
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

  return {
    map, zone, sector, spawn, spawnYaw: yaw, exit, lights, pillars, pillarAt, shelves, extraBoxes,
    crates, pipes, rooms, blocks, workers, notes, gothicCell, whiteWall, fakeWindow,
  };
}
