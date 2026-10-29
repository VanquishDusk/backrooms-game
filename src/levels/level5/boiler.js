import { DIRS, EDGE_WALL } from '../../world/GridMap.js';
import { faceFrame } from './hotel.js';

// Set dressing for the Boiler Room: boiler halls (a big grey-blue fire-tube
// boiler with its burner, rusty risers, yellow gas lines, tanks, debris),
// catwalk galleries over machinery pits full of white lagged pipe, tank
// and pump rooms, and the furnace hall where the stairs go down.

export const PIT = 2.6; // depth of the gallery pits

// Pipe-bundle profiles for the service passages (see world/services.js).
export const BOILER_PROFILES = {
  lagLow: (rng) => [
    { k: 'lag', r: 0.16, o: 0.19, y: rng.range(0.48, 0.56) },
    { k: 'lag', r: 0.11, o: 0.14, y: rng.range(0.92, 1.0) },
    { k: 'yellow', r: 0.04, o: 0.06, y: 1.32 },
    { k: 'rust', r: 0.065, o: 0.09, y: rng.range(2.05, 2.2) },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.55 },
  ],
  lagHigh: (rng) => [
    { k: 'yellow', r: 0.035, o: 0.05, y: rng.range(1.05, 1.15) },
    { k: 'lag', r: 0.15, o: 0.18, y: rng.range(1.85, 1.95) },
    { k: 'lag', r: 0.1, o: 0.13, y: 2.35 },
    { k: 'cable', r: 0.028, o: 0.05, y: 2.7 },
  ],
  rusty: (rng) => [
    { k: 'rust', r: 0.08, o: 0.11, y: rng.range(0.85, 0.95) },
    { k: 'rust', r: 0.05, o: 0.08, y: 1.14 },
    { k: 'lag', r: 0.14, o: 0.17, y: rng.range(2.0, 2.1) },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.55 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.66 },
  ],
  bare: () => [
    { k: 'lag', r: 0.12, o: 0.15, y: 2.4 },
    { k: 'cable', r: 0.028, o: 0.045, y: 2.7 },
  ],
  room: () => [],
  door: () => [],
};

export function pickBoilerProfile(rng) {
  const r = rng.next();
  return r < 0.35 ? 'lagLow' : r < 0.65 ? 'lagHigh' : r < 0.9 ? 'rusty' : 'bare';
}

// Straight runs of passage cells, for the ceiling services.
export function passageRuns(map, isPassage, rng) {
  const total = map.cols * map.rows;
  const inRun = [new Int16Array(total).fill(-1), new Int16Array(total).fill(-1)];
  const runs = [];
  for (const axis of [0, 1]) {
    const d = axis === 0 ? 0 : 2;
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const i = map.idx(x, y);
        if (!isPassage(x, y) || inRun[axis][i] >= 0) continue;
        const px = x - DIRS[d][0], py = y - DIRS[d][1];
        if (map.inBounds(px, py) && isPassage(px, py) && map.canMove(px, py, d)) continue;
        const cells = [[x, y]];
        let cx = x, cy = y;
        while (map.canMove(cx, cy, d) && isPassage(cx + DIRS[d][0], cy + DIRS[d][1])) {
          cx += DIRS[d][0];
          cy += DIRS[d][1];
          cells.push([cx, cy]);
        }
        if (cells.length < 2) continue;
        const run = { cells, axis, side: rng.chance(0.5) ? 1 : -1, service: rng.chance(0.85) ? 'pipes' : 'none' };
        for (const [ux, uy] of cells) inRun[axis][map.idx(ux, uy)] = runs.length;
        runs.push(run);
      }
    }
  }
  return { runs, inRun };
}

// ---- Pieces --------------------------------------------------------------------------------

// Lagged pipe along local points, with metal bands every metre or so.
export function lagPipe(D, o, pts, r) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    D.cyl('lag', o, a, b, r, 9, { vScale: 0.5 });
    if (i > 0) D.ball('lag', o, a, r * 1.02, 9, 5);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.floor(len / 1.6);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1), t2 = t + 0.035 / len;
      D.cyl('galv', o, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], [a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2, a[2] + (b[2] - a[2]) * t2], r * 1.04, 9);
    }
  }
}

// Plain pipe (rust, yellow gas line) with flanges.
export function metalPipe(D, mat, o, pts, r) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    D.cyl(mat, o, a, b, r, 7);
    if (i > 0) D.ball(mat, o, a, r * 1.1, 7, 4);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len > 1.6 && r > 0.03) {
      const t = 0.5, t2 = t + 0.04 / len;
      D.cyl(mat, o, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], [a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2, a[2] + (b[2] - a[2]) * t2], r * 1.5, 8);
    }
  }
}

// Handwheel valve at local point p of frame o, its face turned `turn` from
// the frame's +z, on a short stem.
function handwheel(D, o, p, turn = 0, R = 0.14, mat = 'red') {
  const [wx, , wz] = D.at(o, p[0], 0, p[2]);
  const f = { x: wx, z: wz, rot: o.rot + turn };
  D.wheel(mat, f, [0, p[1], 0], R);
  D.cyl('galv', f, [0, p[1], 0], [0, p[1], -0.12], 0.012, 4);
}

// Round gauge on a stalk.
function gauge(D, o, x, y, z) {
  D.cyl('galv', o, [x, y - 0.12, z - 0.02], [x, y - 0.03, z - 0.02], 0.008, 4);
  D.cyl('black', o, [x, y, z - 0.04], [x, y, z], 0.07, 10, { caps: true });
  D.quad('gauge', o, [[x - 0.06, y - 0.06, z + 0.002], [x + 0.06, y - 0.06, z + 0.002], [x + 0.06, y + 0.06, z + 0.002], [x - 0.06, y + 0.06, z + 0.002]], [0, 0, 1]);
}

// The big horizontal boiler of the reference photo. Local x along the drum;
// the burner end at +x. Returns its footprint (local) for collision.
export function fireTubeBoiler(D, o, len = 4.4, R = 1.0, rng) {
  const cy = R + 0.4;
  const x0 = -len / 2, x1 = len / 2;
  // Concrete saddles.
  for (const x of [x0 + 0.7, x1 - 0.8]) D.box('concrete', o, x, 0.3, 0, 0.5, 0.6, R * 1.7);
  D.box('concrete', o, 0, 0.05, 0, len + 0.6, 0.1, R * 2.2);
  // Drum and heads.
  D.cyl('boilerBlue', o, [x0, cy, 0], [x1, cy, 0], R, 18, { caps: true, vScale: 0.4 });
  for (const x of [x0 + 0.05, x1 - 0.05]) D.cyl('boilerDark', o, [x, cy, 0], [x + (x > 0 ? 0.04 : -0.04), cy, 0], R + 0.04, 18);
  for (let k = 1; k < 4; k++) D.cyl('boilerDark', o, [x0 + k * len / 4, cy, 0], [x0 + k * len / 4 + 0.05, cy, 0], R + 0.015, 18);
  // Round inspection ports with bolt rings on the front head.
  for (const [py, pz, pr] of [[cy + 0.55, -0.45, 0.16], [cy + 0.55, 0.45, 0.16], [cy - 0.6, 0, 0.2]]) {
    D.cyl('boilerDark', o, [x1, py, pz], [x1 + 0.08, py, pz], pr, 12, { caps: true });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      D.cyl('galv', o, [x1 + 0.08, py + Math.cos(a) * pr * 0.8, pz + Math.sin(a) * pr * 0.8], [x1 + 0.11, py + Math.cos(a) * pr * 0.8, pz + Math.sin(a) * pr * 0.8], 0.015, 4);
    }
  }
  // Burner housing, fan scroll and motor on the front.
  const bx = x1 + 0.45;
  D.box('boilerBlue', o, bx, cy, 0, 0.8, 0.95, 0.9);
  D.box('boilerDark', o, bx + 0.41, cy, 0, 0.02, 0.8, 0.75);
  D.cyl('boilerBlue', o, [bx + 0.1, cy + 0.15, 0.48], [bx + 0.1, cy + 0.15, 0.78], 0.42, 14, { caps: true });
  D.cyl('boilerDark', o, [bx + 0.1, cy + 0.15, 0.78], [bx + 0.1, cy + 0.15, 0.8], 0.25, 12, { caps: true });
  D.cyl('motor', o, [bx + 0.1, cy + 0.15, 0.8], [bx + 0.1, cy + 0.15, 1.2], 0.18, 10, { caps: true });
  for (let k = 0; k < 6; k++) D.box('motor', o, bx + 0.1, cy + 0.15 + Math.cos(k) * 0.17, 1.0 + Math.sin(k) * 0.01, 0.02, 0.04, 0.4);
  // Control box with lamps.
  D.box('boilerDark', o, bx + 0.1, cy + 0.85, -0.2, 0.4, 0.5, 0.3);
  D.box('panel', o, bx + 0.31, cy + 0.85, -0.2, 0.01, 0.42, 0.24);
  gauge(D, { ...o, rot: o.rot + Math.PI / 2 }, 0.2, cy + 0.85, bx + 0.33);
  // Flue at the back, rusty risers off the top.
  D.cyl('rust', o, [x0 + 0.5, cy + R * 0.8, 0], [x0 + 0.5, 12, 0], 0.3, 12);
  D.cyl('rust', o, [x0 + 0.5, cy + R * 0.95, 0], [x0 + 0.5, cy + R * 0.95 + 0.06, 0], 0.4, 12);
  for (const [x, z, r] of [[x0 + 1.6, -0.35, 0.09], [0.4, 0.3, 0.075], [x1 - 0.7, -0.2, 0.06]]) {
    const top = cy + Math.sqrt(Math.max(0, R * R - z * z));
    metalPipe(D, 'rust', o, [[x, top - 0.05, z], [x, cy + R + 0.9, z], [x + 0.6, cy + R + 1.4, z * 1.5], [x + 0.6, 12, z * 1.5]], r);
    D.cyl('rust', o, [x, top + 0.25, z], [x, top + 0.31, z], r * 1.6, 8);
    if (rng.chance(0.6)) handwheel(D, o, [x + 0.2, cy + R + 0.5, z], Math.PI / 2, 0.16);
  }
  // Manway on top.
  D.cyl('boilerDark', o, [0, cy + R - 0.1, 0], [0, cy + R + 0.1, 0], 0.3, 12, { caps: true });
  // Yellow gas train into the burner.
  metalPipe(D, 'yellow', o, [[bx + 0.2, cy - 0.3, -0.45], [bx + 0.2, 0.25, -0.45], [bx + 0.2, 0.25, -1.4]], 0.045);
  D.box('yellow', o, bx + 0.2, 0.25, -0.85, 0.16, 0.16, 0.22);
  handwheel(D, o, [bx + 0.2, 0.48, -0.85], 0, 0.1);
  return [x0 - 0.35, -R - 0.15, bx + 0.45, R + 0.2];
}

// Vertical tank with a domed top. mat: tankGreen | tankYellow.
export function verticalTank(D, o, mat, r = 0.55, h = 2.2) {
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    D.cyl('black', o, [Math.cos(a) * r * 0.8, 0, Math.sin(a) * r * 0.8], [Math.cos(a) * r * 0.8, 0.35, Math.sin(a) * r * 0.8], 0.04, 5);
  }
  D.cyl(mat, o, [0, 0.3, 0], [0, h, 0], r, 14, { caps: true, vScale: 0.5 });
  D.ball(mat, o, [0, h, 0], r, 14, 5, 0.45);
  D.cyl('galv', o, [0, h + r * 0.45, 0], [0, h + r * 0.45 + 0.15, 0], 0.05, 6);
  D.cyl('boilerDark', o, [0, 0.9, r - 0.02], [0, 0.9, r + 0.05], 0.18, 10, { caps: true });
  gauge(D, o, 0.25, 1.5, r + 0.08);
  return r + 0.1;
}

// Horizontal tank on legs.
export function horizontalTank(D, o, mat, r = 0.42, len = 1.6) {
  for (const x of [-len / 2 + 0.25, len / 2 - 0.25]) D.box('black', o, x, 0.3, 0, 0.1, 0.6, r * 1.4);
  D.cyl(mat, o, [-len / 2, r + 0.4, 0], [len / 2, r + 0.4, 0], r, 14, { vScale: 0.5 });
  for (const s of [-1, 1]) D.ball(mat, o, [s * len / 2, r + 0.4, 0], r, 14, 5, 1);
  D.cyl('galv', o, [0, 2 * r + 0.38, 0], [0, 2 * r + 0.6, 0], 0.04, 6);
}

// Broken bricks, planks, papers, an oil stain.
export function debris(D, o, rng, n = 8) {
  for (let k = 0; k < n; k++) {
    const p = D.sub(o, rng.range(-0.9, 0.9), rng.range(-0.9, 0.9), rng.range(0, 6));
    const t = rng.next();
    if (t < 0.45) D.box('brickDebris', p, 0, 0.04, 0, 0.21, 0.07, 0.1);
    else if (t < 0.65) D.box('plank', p, 0, 0.02 + rng.range(0, 0.1), 0, rng.range(0.8, 1.6), 0.025, 0.12);
    else if (t < 0.85) D.box('paper', p, 0, 0.004, 0, 0.21, 0.004, 0.29);
    else D.ball('rubble', p, [0, 0, 0], rng.range(0.1, 0.22), 6, 3, 0.6);
  }
  if (rng.chance(0.5)) D.quad('oil', o, [[-0.7, 0.004, -0.5], [0.7, 0.004, -0.5], [0.7, 0.004, 0.5], [-0.7, 0.004, 0.5]], [0, 1, 0]);
}

// Almond Water spigot on a wall: a stub of lagged pipe, a brass tap, a bucket.
export function waterTap(D, f) {
  D.cyl('lag', f, [0, 1.6, 0], [0, 1.6, 0.22], 0.08, 8, { caps: true });
  D.cyl('brass', f, [0, 1.6, 0.22], [0, 1.6, 0.3], 0.03, 6);
  D.cyl('brass', f, [0, 1.6, 0.3], [0, 1.45, 0.3], 0.022, 6);
  D.wheel('red', f, [0, 1.7, 0.3], 0.05);
  D.cone('galv', f, [0, 0, 0.3], [0, 0.32, 0.3], 0.13, 0.16, 10);
  D.cyl('almond', f, [0, 0.27, 0.3], [0, 0.28, 0.3], 0.15, 10, { caps: true });
  D.solidRect(f, -0.18, 0, 0.18, 0.48);
  const p = D.at(f, 0, 0, 0.6);
  return { x: p[0], z: p[2] };
}

// ---- Halls -------------------------------------------------------------------------------------

function hallFrame(D, hall) {
  return D.frame({ x: hall.x, y: hall.y, w: hall.w, h: hall.h, doors: hall.doors });
}

// Lagged mains around the top of a hall's walls, and drops down them.
function wallMains(D, hall, ctx, y = 3.6) {
  const { map, rng } = ctx;
  for (const [x, yy] of hall.cells) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = yy + DIRS[d][1];
      if (map.inBounds(nx, ny) && ctx.layout.roomOf[map.idx(nx, ny)] === hall.id) continue;
      const f = faceFrame(map, x, yy, d);
      const cs = map.cellSize;
      lagPipe(D, f, [[-cs / 2, y, 0.24], [cs / 2, y, 0.24]], 0.18);
      lagPipe(D, f, [[-cs / 2, y + 0.5, 0.17], [cs / 2, y + 0.5, 0.17]], 0.12);
      metalPipe(D, 'rust', f, [[-cs / 2, y + 0.85, 0.1], [cs / 2, y + 0.85, 0.1]], 0.06);
      if (map.getEdge(map.edge(x, yy, d)) === EDGE_WALL && rng.chance(0.3)) {
        lagPipe(D, f, [[0.6, y, 0.24], [0.6, 0.6, 0.24], [0.6, 0.35, 0.6]], 0.13);
        D.solidRect(f, 0.4, 0, 0.8, 0.75);
      }
    }
  }
}

// The boiler hall of the photo: one or two boilers, tanks, debris.
export function boilerHall(D, hall, ctx) {
  const { rng } = ctx;
  const { o, L, W } = hallFrame(D, hall);
  const out = { taps: [], machines: [] };
  wallMains(D, hall, ctx);
  // Boilers down the long axis, against a long wall; a second one if there's room.
  const len = Math.min(5.0, L - 4.4);
  const cands = [];
  for (const z of [-W / 2 + 2.3, W / 2 - 2.3, -W / 2 + 3.2, W / 2 - 3.2, 0]) {
    for (const x of [-0.6, 0.6, -1.4, 1.4, 0]) for (const r of [0, Math.PI]) cands.push([x, z, r]);
  }
  let placed = 0;
  for (const [x, z, r] of cands) {
    if (placed >= (W > 11 ? 2 : 1)) break;
    const b = D.sub(o, x, z, r);
    if (!D.free(b, -len / 2 - 0.5, -1.3, len / 2 + 1.0, 1.3)) continue;
    const fp = fireTubeBoiler(D, b, len, 1.0, rng);
    D.solidRect(b, fp[0], fp[1], fp[2], fp[3]);
    const [mx, , mz] = D.at(b, 0, 0, 0);
    out.machines.push({ x: mx, z: mz });
    placed++;
  }
  // Barrels, a workbench, a ladder against the wall.
  for (let k = 0; k < 4; k++) {
    const p = D.sub(o, rng.range(-L / 2 + 0.8, L / 2 - 0.8), rng.range(-W / 2 + 0.8, W / 2 - 0.8), 0);
    if (!D.free(p, -0.4, -0.4, 0.4, 0.4)) continue;
    const m = rng.pick(['rust', 'boilerBlue', 'tankYellow', 'rust']);
    if (rng.chance(0.25)) {
      D.cyl(m, p, [0, 0.3, -0.4], [0, 0.3, 0.4], 0.3, 12, { caps: true });
    } else {
      D.cyl(m, p, [0, 0, 0], [0, 0.88, 0], 0.29, 12, { caps: true });
      for (const y of [0.28, 0.6]) D.cyl(m, p, [0, y, 0], [0, y + 0.03, 0], 0.305, 12);
    }
    D.solidRect(p, -0.32, -0.32, 0.32, 0.32);
  }
  const wb = D.sub(o, rng.range(-L / 4, L / 4), W / 2, Math.PI);
  if (D.free(wb, -1.0, 0, 1.0, 0.8)) {
    D.box('plank', wb, 0, 0.9, 0.38, 1.8, 0.06, 0.7);
    for (const a of [-1, 1]) for (const zz of [0.08, 0.68]) D.box('railing', wb, a * 0.85, 0.45, zz, 0.06, 0.9, 0.06);
    D.box('red', wb, -0.4, 1.0, 0.3, 0.45, 0.16, 0.22);
    D.box('galv', wb, 0.3, 0.95, 0.45, 0.3, 0.03, 0.05);
    D.cyl('galv', wb, [0.6, 0.94, 0.25], [0.9, 0.94, 0.4], 0.015, 4);
    D.box('boilerDark', wb, 0, 1.6, 0.03, 1.6, 0.9, 0.04);
    for (let k = 0; k < 6; k++) D.box('galv', wb, -0.6 + k * 0.24, 1.6, 0.06, 0.03, 0.3, 0.03);
    D.solidRect(wb, -0.92, 0, 0.92, 0.76);
  }
  const ld = D.sub(o, rng.range(-L / 3, L / 3), -W / 2, 0);
  if (D.free(ld, -0.3, 0, 0.3, 0.5)) {
    for (const a of [-1, 1]) D.cyl('galv', ld, [a * 0.22, 0, 0.45], [a * 0.22, 3.4, 0.08], 0.022, 5);
    for (let k = 1; k < 11; k++) D.cyl('galv', ld, [-0.22, k * 0.3, 0.45 - k * 0.033], [0.22, k * 0.3, 0.45 - k * 0.033], 0.014, 4);
    D.solidRect(ld, -0.28, 0, 0.28, 0.5);
  }

  // Tanks in the corners.
  const corners = rng.shuffle([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  for (const [a, c] of corners.slice(0, 2)) {
    const t = D.sub(o, a * (L / 2 - 1.0), c * (W / 2 - 1.0), 0);
    if (!D.free(t, -0.7, -0.7, 0.7, 0.7)) continue;
    const r = verticalTank(D, t, rng.chance(0.5) ? 'tankGreen' : 'tankYellow', 0.55, rng.range(1.8, 2.6));
    D.solidRect(t, -r, -r, r, r);
    metalPipe(D, 'rust', t, [[0, 2.0, 0], [0, 3.2, 0], [-a * 1.5, 3.2, 0]], 0.05);
  }
  const ht = D.sub(o, rng.range(-L / 4, L / 4), placed < 2 ? W / 2 - 1.2 : 0, rng.chance(0.5) ? 0 : Math.PI);
  if (D.free(ht, -1.0, -0.6, 1.0, 0.6)) {
    horizontalTank(D, ht, 'tankYellow');
    D.solidRect(ht, -1.0, -0.5, 1.0, 0.5);
  }
  // Debris on the floor.
  for (let k = 0; k < 4; k++) debris(D, D.sub(o, rng.range(-L / 2 + 1, L / 2 - 1), rng.range(-W / 2 + 1, W / 2 - 1), 0), rng, 7);
  return out;
}

// Tank room: a cluster of tanks and their pipework.
export function tankRoom(D, hall, ctx) {
  const { rng } = ctx;
  const { o, L, W } = hallFrame(D, hall);
  wallMains(D, hall, ctx, 3.4);
  for (let x = -L / 2 + 1.3; x < L / 2 - 1.0; x += 1.8) {
    for (const s of [-1, 1]) {
      const t = D.sub(o, x, s * (W / 2 - 1.1), 0);
      if (!D.free(t, -0.7, -0.7, 0.7, 0.7)) continue;
      const r = verticalTank(D, t, rng.chance(0.55) ? 'tankGreen' : 'tankYellow', rng.range(0.45, 0.62), rng.range(1.8, 3.0));
      D.solidRect(t, -r, -r, r, r);
      metalPipe(D, rng.chance(0.5) ? 'rust' : 'yellow', t, [[0, 0.6, -s * r], [0, 0.6, -s * (r + 0.4)], [0, 0.05, -s * (r + 0.4)]], 0.045);
    }
  }
  debris(D, D.sub(o, 0, 0, 0), rng, 6);
  return { taps: [] };
}

// Pump room: motors and volutes on plinths.
export function pumpRoom(D, hall, ctx) {
  const { rng } = ctx;
  const { o, L, W } = hallFrame(D, hall);
  wallMains(D, hall, ctx, 3.4);
  for (let x = -L / 2 + 1.4; x < L / 2 - 1.2; x += 2.0) {
    const p = D.sub(o, x, 0, Math.PI / 2);
    if (!D.free(p, -0.5, -0.9, 0.5, 0.9)) continue;
    D.box('concrete', p, 0, 0.12, 0, 0.8, 0.24, 1.7);
    D.cyl('motor', p, [0, 0.55, -0.75], [0, 0.55, 0.05], 0.26, 12, { caps: true });
    D.cyl('boilerBlue', p, [0, 0.55, 0.12], [0, 0.55, 0.42], 0.34, 14, { caps: true });
    metalPipe(D, 'rust', p, [[0, 0.55, 0.42], [0, 0.55, 0.7], [0, 2.4, 0.7], [0, 2.4, 2.0]], 0.08);
    metalPipe(D, 'rust', p, [[0, 0.95, 0.27], [0, 1.5, 0.27], [0.8, 1.5, 0.27]], 0.07);
    handwheel(D, p, [0, 1.2, 0.95], 0, 0.13);
    D.solidRect(p, -0.45, -0.9, 0.45, 0.9);
  }
  debris(D, D.sub(o, 0, W / 2 - 1.0, 0), rng, 5);
  return { taps: [] };
}

// Catwalk gallery after the engine room photo: a narrow green walkway
// with black railings over a pit of machinery, white lagged pipe
// everywhere, valve wheels at hand.
export function gallery(D, hall, ctx) {
  const { map, rng } = ctx;
  const cs = map.cellSize;
  const along = hall.along; // 0 = x
  hallFrame(D, hall); // keeps the doorways clear
  const H = hall.ceil;
  // Local frame with x along the catwalk.
  const L = (along === 0 ? hall.w : hall.h) * cs, W = (along === 0 ? hall.h : hall.w) * cs;
  const o = { x: (hall.x + hall.w / 2) * cs, z: (hall.y + hall.h / 2) * cs, rot: along === 0 ? 0 : -Math.PI / 2 };
  const hw = 0.65; // half width of the walk
  const T = 0.08;
  // The pit: floor, walls down to it.
  D.quad('pitFloor', o, [[-L / 2, -PIT, -W / 2], [L / 2, -PIT, -W / 2], [L / 2, -PIT, W / 2], [-L / 2, -PIT, W / 2]], [0, 1, 0]);
  for (const s of [-1, 1]) {
    const z = s * (W / 2 - T);
    D.quad('brick', o, [[-L / 2, -PIT, z], [L / 2, -PIT, z], [L / 2, 0, z], [-L / 2, 0, z]], [0, 0, -s], [[0, 0], [L, 0], [L, PIT], [0, PIT]]);
    const x = s * (L / 2 - T);
    D.quad('brick', o, [[x, -PIT, -W / 2], [x, -PIT, W / 2], [x, 0, W / 2], [x, 0, -W / 2]], [-s, 0, 0], [[0, 0], [W, 0], [W, PIT], [0, PIT]]);
  }
  // The walk: grating, kick plates, cross beams underneath.
  D.box('catwalk', o, 0, -0.03, 0, L, 0.06, 2 * hw, ['nx', 'px']);
  for (const s of [-1, 1]) D.box('railing', o, 0, 0.05, s * hw, L, 0.1, 0.02);
  for (let x = -L / 2 + 0.7; x < L / 2; x += 1.4) {
    D.box('railing', o, x, -0.2, 0, 0.12, 0.24, W - 0.2);
  }
  // Railings: posts, top and mid rails.
  for (const s of [-1, 1]) {
    for (let x = -L / 2 + 0.6; x < L / 2 - 0.3; x += 1.2) D.box('railing', o, x, 0.53, s * hw, 0.045, 1.06, 0.045);
    D.cyl('railing', o, [-L / 2, 1.06, s * hw], [L / 2, 1.06, s * hw], 0.024, 6);
    D.cyl('railing', o, [-L / 2, 0.55, s * hw], [L / 2, 0.55, s * hw], 0.016, 5);
    // The player stays on the walk.
    D.solidRect(o, -L / 2, s > 0 ? hw - 0.04 : -W / 2, L / 2, s > 0 ? W / 2 : -hw + 0.04);
  }
  // Machinery down in the pit: lagged drums and pumps.
  for (const s of [-1, 1]) {
    for (let x = -L / 2 + 1.6; x < L / 2 - 1.2; x += rng.range(2.6, 3.4)) {
      const z = s * (hw + 0.95);
      if (rng.chance(0.5)) {
        D.cyl('lag', o, [x - 1.0, -PIT + 0.9, z], [x + 1.0, -PIT + 0.9, z], 0.75, 14, { caps: true, vScale: 0.5 });
        for (const dx of [-0.6, 0, 0.6]) D.cyl('galv', o, [x + dx, -PIT + 0.9, z], [x + dx + 0.04, -PIT + 0.9, z], 0.78, 14);
      } else {
        D.box('boilerDark', o, x, -PIT + 0.5, z, 1.4, 1.0, 0.9);
        D.cyl('motor', o, [x - 0.3, -PIT + 1.2, z], [x + 0.6, -PIT + 1.2, z], 0.3, 10, { caps: true });
      }
      // A riser from the machine up past the walk and into the ceiling.
      lagPipe(D, o, [[x, -PIT + 1.5, z], [x, H + 0.1, z]], 0.13);
      if (rng.chance(0.6)) {
        // Valve wheel on a stem, reachable from the walk.
        const vz = s * (hw + 0.28);
        D.cyl('galv', o, [x + 0.5, -0.4, vz], [x + 0.5, 1.2, vz], 0.025, 5);
        D.wheel(rng.chance(0.7) ? 'red' : 'railing', { x: D.at(o, x + 0.5, 0, vz)[0], z: D.at(o, x + 0.5, 0, vz)[2], rot: o.rot + Math.PI / 2 }, [0, 1.25, 0], 0.17);
      }
    }
  }
  // Long lagged mains on both sides, at several heights, the length of the room.
  for (const s of [-1, 1]) {
    const heights = [[-0.6, 0.2, 0.95], [0.25, 0.16, 1.2], [1.4, 0.18, 1.0], [2.3, 0.14, 1.25], [3.3, 0.2, 0.9]];
    for (const [y, r, off] of heights) {
      if (rng.chance(0.15)) continue;
      const z = s * (hw + off);
      lagPipe(D, o, [[-L / 2, y, z], [L / 2, y, z]], r);
    }
    metalPipe(D, 'rust', o, [[-L / 2, 0.85, s * (W / 2 - 0.3)], [L / 2, 0.85, s * (W / 2 - 0.3)]], 0.07);
  }
  // Overhead: bundles crossing the walk, and two running along it.
  for (let x = -L / 2 + 1.1; x < L / 2 - 0.5; x += rng.range(1.8, 2.8)) {
    const y = rng.range(2.5, 3.4);
    for (let k = 0; k < rng.int(1, 3); k++) {
      const r = rng.range(0.09, 0.16);
      lagPipe(D, o, [[x + k * 0.4, -PIT + 1.0, -W / 2 + 0.4], [x + k * 0.4, y + k * 0.32, -W / 2 + 0.4], [x + k * 0.4, y + k * 0.32, W / 2 - 0.4], [x + k * 0.4, -PIT + 1.0, W / 2 - 0.4]], r);
    }
  }
  for (const s of [-1, 1]) lagPipe(D, o, [[-L / 2, H - 0.5, s * 0.55], [L / 2, H - 0.5, s * 0.55]], 0.15);
  // Gauges on the railing posts.
  for (let x = -L / 2 + 1.8; x < L / 2 - 1; x += 3.6) gauge(D, D.sub(o, x, hw, 0), 0, 1.2, 0.05);
  return { taps: [] };
}

// The furnace hall: a brick furnace roaring behind an open door, coal,
// and a stair cut into the floor going down into the heat (Level 6).
export function furnaceRoom(D, hall, ctx) {
  const { map, rng } = ctx;
  const cs = map.cellSize;
  const { o, L, W } = hallFrame(D, hall);
  wallMains(D, hall, ctx, 3.8);
  const out = { taps: [], fire: [], stair: null };
  // The furnace against the far wall from the first door.
  const d0 = hall.doors[0];
  let sgn = 1;
  if (d0) {
    const [cx, cz] = map.cellCenter(d0.x, d0.y);
    const lx = (cx - o.x) * Math.cos(o.rot) - (cz - o.z) * Math.sin(o.rot);
    sgn = lx > 0 ? -1 : 1;
  }
  const f = D.sub(o, sgn * (L / 2 - 1.0), 0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2); // +z into the room
  D.box('firebrick', f, 0, 1.7, 0, 3.8, 3.4, 2.0);
  D.box('boilerDark', f, 0, 3.5, 0, 4.0, 0.2, 2.2);
  D.cyl('rust', f, [0, 3.6, -0.3], [0, 12, -0.3], 0.45, 12);
  for (const x of [-1.0, 1.0]) {
    // Two fire doors, one open.
    D.box('iron', f, x, 1.15, 1.02, 1.1, 1.0, 0.06);
    D.quad('fire', f, [[x - 0.42, 0.75, 1.056], [x + 0.42, 0.75, 1.056], [x + 0.42, 1.55, 1.056], [x - 0.42, 1.55, 1.056]], [0, 0, 1]);
    const leaf = D.sub(f, x + 0.55, 1.05, x > 0 ? 1.9 : 0.15);
    D.box('iron', leaf, -0.45, 1.15, 0.03, 0.9, 0.9, 0.05);
  }
  D.solidRect(f, -2.0, -1.1, 2.0, 1.15);
  const [fx, , fz] = D.at(f, 0, 0, 1.4);
  out.fire.push({ x: fx, z: fz });
  // Coal heaps and a shovel.
  for (let k = 0; k < 3; k++) {
    const c = D.sub(f, -1.4 + k * 1.4, 2.0 + rng.range(0, 0.6), 0);
    if (!D.free(c, -0.5, -0.5, 0.5, 0.5)) continue;
    for (let j = 0; j < 9; j++) D.ball('coal', c, [rng.range(-0.35, 0.35), rng.range(0, 0.15), rng.range(-0.35, 0.35)], rng.range(0.12, 0.24), 6, 3, 0.7);
  }
  const sh = D.sub(f, 1.7, 1.7, 0.6);
  D.cyl('plank', sh, [0, 0.05, 0], [0, 1.2, 0.15], 0.02, 5);
  D.box('iron', sh, 0, 0.1, -0.05, 0.25, 0.02, 0.3);
  // The stair down: a hole in the floor, steps descending into the glow.
  const sw = 1.4, len = 3.6, rise = 3.0;
  let sf = null;
  for (const [x, z, r] of [[-sgn * 0.4, -len / 2, 0], [-sgn * 0.4, len / 2, Math.PI], [-sgn * 1.6, -len / 2, 0], [0, -W / 2 + 1.2, 0], [-sgn * (L / 2 - 1.5), -len / 2, 0]]) {
    const c = D.sub(o, x, z, r); // +z: down the stair
    if (D.free(c, -sw / 2 - 0.5, -0.6, sw / 2 + 0.5, len + 0.5)) {
      sf = c;
      break;
    }
  }
  sf ||= D.sub(o, 0, -len / 2, 0);
  // Rim and railing around the hole (open at the top step).
  for (const s of [-1, 1]) {
    D.box('concrete', sf, s * (sw / 2 + 0.1), -1.5, len / 2, 0.2, 3.0, len, ['top']);
    D.solidRect(sf, s > 0 ? sw / 2 - 0.02 : -sw / 2 - 0.3, -0.1, s > 0 ? sw / 2 + 0.3 : -sw / 2 + 0.02, len + 0.1);
    for (let z = 0.2; z < len; z += 1.0) D.box('railing', sf, s * (sw / 2 + 0.1), 0.53, z, 0.045, 1.06, 0.045);
    D.cyl('railing', sf, [s * (sw / 2 + 0.1), 1.06, 0], [s * (sw / 2 + 0.1), 1.06, len], 0.024, 6);
  }
  D.box('concrete', sf, 0, -1.5, len + 0.1, sw + 0.4, 3.0, 0.2, ['top']);
  D.box('railing', sf, 0, 1.06, len + 0.1, sw + 0.3, 0.05, 0.05);
  D.solidRect(sf, -sw / 2 - 0.3, len - 0.05, sw / 2 + 0.3, len + 0.3);
  const steps = 14;
  for (let k = 0; k < steps; k++) {
    const z = (k + 0.5) * (len / steps), y = -(k + 1) * (rise / steps);
    D.box('concrete', sf, 0, y - 0.1, z, sw, 0.2, len / steps + 0.01);
    D.box('galv', sf, 0, y + 0.002, z - len / steps / 2 + 0.03, sw, 0.01, 0.05);
  }
  D.quad('fire', sf, [[-sw / 2, -rise - 0.4, len - 0.02], [sw / 2, -rise - 0.4, len - 0.02], [sw / 2, -0.9, len - 0.02], [-sw / 2, -0.9, len - 0.02]], [0, 0, -1]);
  const [sx, , sz] = D.at(sf, 0, 0, 0);
  const [ex, , ez] = D.at(sf, 0, 0, len);
  out.stair = { o: sf, x: sx, z: sz, ex, ez, sw, len, rise };
  const [gx, , gz] = D.at(sf, 0, 0, len * 0.6);
  D.light({ x: gx, z: gz, power: 1.5, color: [1, 0.4, 0.1], hide: true, kind: 'fire' });
  D.light({ x: fx, z: fz, power: 1.2, color: [1, 0.45, 0.15], hide: true, kind: 'fire' });
  for (let k = 0; k < 3; k++) debris(D, D.sub(o, rng.range(-L / 4, L / 4), rng.range(-W / 2 + 1, W / 2 - 1), 0), rng, 6);
  return out;
}
