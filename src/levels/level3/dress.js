import * as THREE from 'three';

// Room dressing for Level 3: generator rooms, boiler rooms, the assembly
// hall, Sanctums, Base Gamma and the sealed galleries. Everything static
// goes into the level's ChunkedBuilders by material name; solid footprints
// go into `solid` (they must exist before the world builds collision).
// Each builder returns what the level animates or interacts with.

// ---- Generator rooms ------------------------------------------------------------

export function generatorRoom(D, r) {
  const { o, L, W, H } = D.frame(r);
  const out = { sparks: [], hum: [], crates: [] };
  // Switchgear with a service aisle behind it, along one long wall.
  const tries = [];
  for (const side of [-1, 1]) {
    const zc = side * (W / 2 - 1.45);
    tries.push([side, zc, -(L - 2.6) / 2, (L - 2.6) / 2]);
    tries.push([side, zc, -(L - 2.6) / 2, -0.4]);
    tries.push([side, zc, 0.4, (L - 2.6) / 2]);
  }
  let sgSide = 0;
  for (const [side, zc, x0, x1] of tries) {
    if (x1 - x0 < 2 || !D.free(o, x0, zc - 0.5, x1, zc + 0.5)) continue;
    const f = D.sub(o, (x0 + x1) / 2, zc, side < 0 ? 0 : Math.PI);
    switchgear(D, f, x1 - x0, H, out);
    D.solidRect(o, x0, zc - 0.5, x1, zc + 0.55);
    sgSide = side;
    break;
  }
  // The generator set on the other side.
  for (const side of sgSide ? [-sgSide] : [1, -1]) {
    const gz = side * (W / 2 - 2.0);
    if (!D.free(o, -1.75, gz - 0.95, 1.75, gz + 0.95)) continue;
    const f = D.sub(o, 0, gz);
    genset(D, f, H);
    D.solidRect(o, -1.75, gz - 0.95, 1.75, gz + 0.95);
    out.hum.push(D.at(o, 0, 1, gz));
    break;
  }
  // Supplies in the corners.
  for (const [sx, sz] of D.rng.shuffle([[1, 1], [-1, 1], [1, -1], [-1, -1]]).slice(0, 2)) {
    const x = sx * (L / 2 - 0.55), z = sz * (W / 2 - 0.55);
    if (!D.free(o, x - 0.4, z - 0.4, x + 0.4, z + 0.4)) continue;
    const [wx, , wz] = D.at(o, x, 0, z);
    out.crates.push({ x: wx, z: wz, size: 0.7, rot: o.rot + D.rng.range(-0.2, 0.2) });
    D.solid.push([wx - 0.42, wz - 0.42, wx + 0.42, wz + 0.42]);
  }
  // Control cabinets and breaker panels wherever the walls are free.
  for (const s of [-1, 1]) {
    const z = s * (W / 2 - 0.3);
    for (let x = -L / 2 + 0.6; x < L / 2 - 0.6; x += 0.75) {
      if (!D.rng.chance(0.6) || !D.free(o, x - 0.33, z - 0.3, x + 0.33, z + 0.3)) continue;
      const tall = D.rng.chance(0.6);
      D.box(tall ? 'blackpanel' : 'green', o, x, tall ? 1.0 : 1.35, z, 0.62, tall ? 2.0 : 0.9, 0.5);
      for (let k = 0; k < 3; k++) D.box('enamel', o, x - 0.15 + k * 0.15, tall ? 1.5 : 1.45, z - s * 0.26, 0.07, 0.1, 0.03);
      D.cyl('conduit', o, [x, tall ? 2.0 : 1.8, z + s * 0.1], [x, H, z + s * 0.1], 0.03, 5);
      D.solidRect(o, x - 0.33, z - 0.3, x + 0.33, z + 0.3);
    }
  }
  // Cable trays across the ceiling.
  for (const x of [-L / 4, L / 4]) {
    D.box('strut', o, x, H - 0.4, 0, 0.35, 0.02, W - 0.2);
    for (let k = 0; k < 4; k++) D.cyl('cable', o, [x - 0.12 + k * 0.08, H - 0.36, -W / 2 + 0.1], [x - 0.12 + k * 0.08, H - 0.36, W / 2 - 0.1], 0.025, 5);
  }
  const ss = sgSide || -1;
  D.signs.push({ o, lx: 0, ly: 2.3, lz: ss * (W / 2 - 0.006), face: -ss, tile: 5 });
  return out;
}

// Switchgear (photo: green steel frame, copper busbars, insulators, fuses).
// Local x along it; front faces +z.
function switchgear(D, f, len, H, out) {
  D.box('blackpanel', f, 0, 1.2, -0.36, len, 2.3, 0.05);
  const n = Math.max(2, Math.round(len / 1.3));
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(-len / 2 + (len * i) / n);
  for (const x of xs) {
    D.box('green', f, x, 1.35, 0.38, 0.12, 2.7, 0.12);
    D.box('green', f, x, 1.35, -0.38, 0.12, 2.7, 0.12);
    D.box('green', f, x, 2.62, 0, 0.12, 0.14, 0.76);
  }
  D.box('green', f, 0, 2.62, 0.38, len + 0.12, 0.16, 0.14);
  D.box('green', f, 0, 2.62, -0.38, len + 0.12, 0.16, 0.14);
  D.box('green', f, 0, 2.02, 0.38, len, 0.12, 0.1);
  // Busbars and drops.
  for (const y of [1.08, 1.28, 1.48]) D.box('copper', f, 0, y, 0.3, len - 0.25, 0.1, 0.03);
  for (let i = 0; i < n; i++) {
    const x = (xs[i] + xs[i + 1]) / 2;
    for (const dx of [-0.18, 0, 0.18]) D.box('copper', f, x + dx, 1.62, 0.29, 0.04, 1.0, 0.03);
    // Insulator stacks on the top beam, cable up into the ceiling.
    for (const dx of [-0.3, 0.3]) {
      for (let k = 0; k < 4; k++) D.cyl('ceramic', f, [x + dx, 2.7 + k * 0.07, 0.38], [x + dx, 2.75 + k * 0.07, 0.38], 0.075 - k * 0.006, 10, { caps: true });
      D.cyl('cable', f, [x + dx, 2.98, 0.38], [x + dx, H, 0.38], 0.035, 6);
    }
    out.sparks.push(D.at(f, x, 1.28, 0.36));
  }
  // Fuse rows and cables to the floor.
  for (let x = -len / 2 + 0.15; x < len / 2 - 0.1; x += 0.17) {
    for (const y of [0.5, 0.72]) D.cyl('enamel', f, [x, y, 0.28], [x, y, 0.41], 0.028, 6, { caps: true });
    if (D.rng.chance(0.45)) D.pipe('cable', f, [[x, 0.5, 0.41], [x, 0.14, 0.62], [x + 0.25, 0.03, 0.95]], 0.022, 5);
  }
  D.signs.push({ o: f, lx: 0, ly: 1.85, lz: 0.452, face: 1, tile: 1 });
}

// A big old generator set: stator housing, end bell, flywheel.
function genset(D, f, H) {
  D.box('concrete', f, 0, 0.15, 0, 3.3, 0.3, 1.7);
  for (const x of [-0.8, 0.6]) for (const z of [-0.5, 0.5]) D.box('green', f, x, 0.45, z, 0.3, 0.3, 0.25);
  D.cyl('green', f, [-1.0, 1.08, 0], [0.9, 1.08, 0], 0.72, 18, { caps: true });
  for (let x = -0.85; x < 0.85; x += 0.22) D.cyl('steel', f, [x, 1.08, 0], [x + 0.03, 1.08, 0], 0.745, 18);
  D.cone('green', f, [0.9, 1.08, 0], [1.3, 1.08, 0], 0.72, 0.42, 18, { caps: true });
  D.cyl('steel', f, [-1.0, 1.08, 0], [-1.5, 1.08, 0], 0.1, 8);
  D.cyl('steel', f, [-1.5, 1.08, 0], [-1.64, 1.08, 0], 0.88, 20, { caps: true });
  D.box('green', f, 0.2, 1.98, 0, 0.6, 0.4, 0.5);
  D.cyl('conduit', f, [0.2, 2.18, 0], [0.2, H, 0], 0.06, 7);
  D.cyl('conduit', f, [0.4, 2.18, 0.1], [0.4, H, 0.1], 0.04, 6);
}

// ---- Boiler rooms ------------------------------------------------------------------

export function boilerRoom(D, r) {
  const { o, L, W, H } = D.frame(r);
  const out = { heat: [], hum: [], glow: null };
  let side = D.rng.chance(0.5) ? 1 : -1;
  // Riveted brass boiler drum along one wall (photo: brass tank, rivets).
  const R = 0.78;
  let zc = 0, x0 = 0, x1 = 0, ok = false;
  for (const [sd, a, b] of [[side, -L / 2 + 0.5, L / 2 - 2.2], [-side, -L / 2 + 0.5, L / 2 - 2.2], [side, -L / 2 + 0.5, 0.6], [-side, -L / 2 + 0.5, 0.6], [side, -0.9, L / 2 - 2.2], [-side, -0.9, L / 2 - 2.2]]) {
    const z = sd * (W / 2 - 0.2 - R);
    if (!D.free(o, a - 0.3, z - R, b + 0.3, z + R)) continue;
    [side, zc, x0, x1, ok] = [sd, z, a, b, true];
    break;
  }
  if (ok) {
    const y = 0.32 + R;
    for (const x of [x0 + 0.6, x1 - 0.6]) D.box('iron', o, x, 0.3, zc, 0.25, 0.6, R * 1.6);
    D.cyl('brass', o, [x0, y, zc], [x1, y, zc], R, 20);
    for (const [ex, dir] of [[x0, -1], [x1, 1]]) {
      D.cone('brass', o, [ex, y, zc], [ex + dir * 0.14, y, zc], R, R * 0.84, 20);
      D.cone('brass', o, [ex + dir * 0.14, y, zc], [ex + dir * 0.26, y, zc], R * 0.84, R * 0.45, 20, { caps: true });
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        D.ball('brass', o, [ex + dir * 0.01, y + Math.cos(a) * R * 0.97, zc + Math.sin(a) * R * 0.97], 0.022, 5, 3);
      }
    }
    for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) D.cyl('iron', o, [x, y, zc], [x + 0.04, y, zc], R + 0.015, 20);
    D.box('brass', o, (x0 + x1) / 2, y + R, zc, 0.45, 0.12, 0.35);
    D.cyl('brass', o, [x0 + 0.8, y + R, zc], [x0 + 0.8, H, zc], 0.07, 8);
    D.wheel('iron', o, [x0 + 0.8, y + R + 0.5, zc + 0.12]);
    D.solidRect(o, x0 - 0.3, zc - R, x1 + 0.3, zc + R);
  }
  // Furnace at the end wall: brick, an iron door, a glowing slit.
  const fz = side * (W / 2 - 1.3);
  if (D.free(o, L / 2 - 1.5, fz - 1.1, L / 2, fz + 1.1)) {
    D.box('brick', o, L / 2 - 0.75, 1.1, fz, 1.5, 2.2, 2.2);
    D.box('iron', o, L / 2 - 1.52, 0.8, fz, 0.05, 0.7, 0.8);
    D.box('iron', o, L / 2 - 1.53, 1.35, fz, 0.05, 0.16, 1.0);
    D.cyl('iron', o, [L / 2 - 0.75, 2.2, fz], [L / 2 - 0.75, H, fz], 0.26, 12);
    D.solidRect(o, L / 2 - 1.55, fz - 1.1, L / 2, fz + 1.1);
    const glowGeo = new THREE.PlaneGeometry(0.6, 0.06);
    D.ownGeos.push(glowGeo);
    out.glow = { geo: glowGeo, pos: D.at(o, L / 2 - 1.56, 0.42, fz), rot: o.rot - Math.PI / 2 };
    out.heat.push(D.at(o, L / 2 - 2, 1, fz));
  }
  // Pear-shaped vessel and a pump on the other side, all brass.
  const vz = -side * (W / 2 - 0.85);
  const vx = -L / 2 + 1.3;
  if (D.free(o, vx - 0.6, vz - 0.6, vx + 0.6, vz + 0.6)) {
    D.ball('brass', o, [vx, 1.75, vz], 0.46, 14, 8);
    D.cone('brass', o, [vx, 1.4, vz], [vx, 0.8, vz], 0.33, 0.08, 12);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      D.cyl('iron', o, [vx + Math.cos(a) * 0.3, 0, vz + Math.sin(a) * 0.3], [vx + Math.cos(a) * 0.2, 1.5, vz + Math.sin(a) * 0.2], 0.025, 5);
    }
    D.cyl('brass', o, [vx, 2.2, vz], [vx, H, vz], 0.06, 8);
    D.wheel('iron', o, [vx + 0.15, 2.5, vz]);
    D.solidRect(o, vx - 0.55, vz - 0.55, vx + 0.55, vz + 0.55);
  }
  const px = 0.3;
  if (D.free(o, px - 0.7, vz - 0.45, px + 0.7, vz + 0.45)) {
    D.box('iron', o, px, 0.12, vz, 1.3, 0.24, 0.7);
    D.ball('brass', o, [px + 0.35, 0.58, vz], 0.25, 12, 7);
    D.cyl('brass', o, [px - 0.55, 0.55, vz], [px + 0.1, 0.55, vz], 0.18, 12, { caps: true });
    D.pipe('brass', o, [[px + 0.35, 0.8, vz], [px + 0.35, 2.7, vz], [vx, 2.7, vz], [vx, 2.2, vz]], 0.06);
    D.pipe('brass', o, [[px + 0.6, 0.58, vz], [px + 1.4, 0.58, vz], [px + 1.4, 0.05, vz]], 0.055);
    D.solidRect(o, px - 0.7, vz - 0.45, px + 0.7, vz + 0.45);
    out.hum.push(D.at(o, px, 0.6, vz));
  }
  // Brass risers along the walls, with handwheels.
  for (let x = -L / 2 + 0.6; x < L / 2 - 0.4; x += D.rng.range(0.7, 1.5)) {
    for (const s of [-1, 1]) {
      if (!D.rng.chance(0.55)) continue;
      const z = s * (W / 2 - 0.12);
      if (!D.free(o, x - 0.1, z - 0.1, x + 0.1, z + 0.1)) continue;
      D.cyl('brass', o, [x, 0, z], [x, H, z], 0.045, 8);
      if (D.rng.chance(0.4)) D.wheel('iron', o, [x, D.rng.range(1.1, 1.7), z - s * 0.13], 0.09);
    }
  }
  D.signs.push({ o, lx: -L / 2 + 0.006, ly: 2.2, lz: 0, face: 'x', tile: 6 });
  return out;
}

// ---- Assembly hall ------------------------------------------------------------------

export function assemblyHall(D, r) {
  const { o, L, W, H } = D.frame(r);
  const out = { lines: [], presses: [], bins: [], hum: [] };
  for (const zl of [-W / 4, W / 4]) {
    const len = [L - 5.6, L - 8, L - 10.5].find((n) => n > 4 && D.free(o, -n / 2 - 1, zl - 0.6, n / 2 + 1.2, zl + 0.6));
    if (!len) continue;
    const f = D.sub(o, 0, zl);
    // Conveyor frame.
    for (let x = -len / 2; x <= len / 2 + 0.01; x += len / Math.round(len / 1.5)) {
      for (const z of [-0.38, 0.38]) D.box('steel', f, x, 0.42, z, 0.06, 0.84, 0.06);
    }
    for (const z of [-0.42, 0.42]) D.box('green', f, 0, 0.87, z, len, 0.12, 0.05);
    D.box('belt', f, 0, 0.55, 0, len, 0.02, 0.7);
    for (const x of [-len / 2, len / 2]) D.cyl('steel', f, [x, 0.82, -0.4], [x, 0.82, 0.4], 0.09, 10, { caps: true });
    // Hopper at the start, bin at the end.
    D.box('green', f, -len / 2 - 0.5, 1.35, 0, 0.9, 0.9, 0.9);
    for (const [x, z] of [[-0.35, -0.35], [-0.35, 0.35], [0.35, -0.35], [0.35, 0.35]]) D.box('steel', f, -len / 2 - 0.5 + x, 0.45, z, 0.06, 0.9, 0.06);
    const bx = len / 2 + 0.65;
    D.box('steel', f, bx, 0.3, -0.38, 0.8, 0.6, 0.04);
    D.box('steel', f, bx, 0.3, 0.38, 0.8, 0.6, 0.04);
    D.box('steel', f, bx + 0.38, 0.3, 0, 0.04, 0.6, 0.8);
    D.box('steel', f, bx - 0.38, 0.3, 0, 0.04, 0.6, 0.8);
    D.box('steel', f, bx, 0.03, 0, 0.8, 0.04, 0.8);
    D.solidRect(o, -len / 2 - 1, zl - 0.6, len / 2 + 1.1, zl + 0.6);
    out.bins.push({ pos: D.at(f, bx, 0.3, 0) });
    // Presses straddling the line.
    for (const x of [-len / 4, len / 4]) {
      for (const z of [-0.62, 0.62]) D.box('green', f, x, 1.5, z, 0.25, 3.0, 0.22);
      D.box('green', f, x, 3.1, 0, 0.4, 0.4, 1.5);
      D.cyl('steel', f, [x, 2.9, 0], [x, 2.15, 0], 0.13, 10);
      out.presses.push({ pos: D.at(f, x, 0, 0), rot: f.rot });
      out.hum.push(D.at(f, x, 1.5, 0));
    }
    // Belt top: animated by the level.
    out.lines.push({ f, len, top: 0.9 });
  }
  // Overhead gantry crane.
  for (const z of [-W / 2 + 0.45, W / 2 - 0.45]) D.box('green', o, 0, H - 1.1, z, L - 0.3, 0.35, 0.25);
  const gx = D.rng.range(-L / 4, L / 4);
  D.box('green', o, gx, H - 1.3, 0, 0.32, 0.3, W - 0.6);
  D.box('steel', o, gx, H - 1.55, 0.6, 0.4, 0.25, 0.5);
  D.cyl('steel', o, [gx, H - 1.65, 0.6], [gx, 3.3, 0.6], 0.015, 4);
  D.box('iron', o, gx, 3.2, 0.6, 0.12, 0.22, 0.05);
  // Painted aisle lines.
  for (const z of [-W / 4 - 1.0, -W / 4 + 1.0, W / 4 - 1.0, W / 4 + 1.0]) {
    D.quad('yellow', o, [[-L / 2 + 1, 0.004, z - 0.05], [L / 2 - 1, 0.004, z - 0.05], [L / 2 - 1, 0.004, z + 0.05], [-L / 2 + 1, 0.004, z + 0.05]], [0, 1, 0]);
  }
  return out;
}

// ---- Sanctums -----------------------------------------------------------------------

export function sanctum(D, r) {
  const { o, L, W, H } = D.frame(r);
  const out = { statues: [], candles: [] };
  // The statue stands at the end away from the way in.
  let end = 1;
  const door = (r.doors || [])[0];
  if (door) {
    const [dx, dz] = D.map.cellCenter(door.x, door.y);
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    end = (dx - o.x) * c - (dz - o.z) * s > 0 ? -1 : 1;
  }
  const sx = end * (L / 2 - 1.6);
  // Plinth, steps and the angel.
  D.box('stone', o, sx, 0.6, 0, 1.8, 1.2, 1.8);
  D.box('stone', o, sx - end * 1.1, 0.12, 0, 0.6, 0.24, 2.6);
  D.solidRect(o, sx - 0.95, -0.95, sx + 0.95, 0.95);
  const sf = D.sub(o, sx, 0, end > 0 ? -Math.PI / 2 : Math.PI / 2);
  angel(D, sf, 1.2, 1.55, null);
  out.statues.push(D.at(o, sx, 0, 0));
  // Colonnades with an entablature, Greco-Roman.
  const colZ = W / 2 - 1.45;
  for (const s of [-1, 1]) {
    const z = s * colZ;
    for (let x = -L / 2 + 1.6; x < L / 2 - 1.2; x += 2.4) {
      if (!D.free(o, x - 0.45, z - 0.45, x + 0.45, z + 0.45)) continue;
      D.box('stone', o, x, 0.2, z, 0.95, 0.4, 0.95);
      D.cyl('stone', o, [x, 0.4, z], [x, 0.55, z], 0.42, 14);
      D.cyl('stone', o, [x, 0.55, z], [x, H - 1.15, z], 0.33, 14);
      D.cone('stone', o, [x, H - 1.15, z], [x, H - 0.95, z], 0.33, 0.45, 14);
      D.box('stone', o, x, H - 0.85, z, 0.95, 0.2, 0.95);
      D.solidRect(o, x - 0.48, z - 0.48, x + 0.48, z + 0.48);
    }
    D.box('stone', o, 0, H - 0.4, z, L - 0.2, 0.7, 0.95, ['top']);
  }
  // Pews facing the statue, a centre aisle between them.
  const plen = colZ - 0.6 - 0.7;
  for (let x = -end * (L / 2 - 1.8); end * x < L / 2 - 4.2; x += end * 1.15) {
    for (const s of [-1, 1]) {
      const z = s * (0.7 + plen / 2);
      if (!D.free(o, x - 0.3, z - plen / 2, x + 0.3, z + plen / 2)) continue;
      D.box('wood', o, x, 0.45, z, 0.45, 0.06, plen);
      D.box('wood', o, x - end * 0.22, 0.82, z, 0.05, 0.7, plen);
      for (const e of [-1, 1]) D.box('wood', o, x, 0.45, z + e * plen / 2, 0.5, 0.9, 0.05);
      D.solidRect(o, x - 0.28, z - plen / 2, x + 0.28, z + plen / 2);
    }
  }
  // Paintings between the columns, and a great one behind the statue.
  for (const s of [-1, 1]) {
    for (let x = -L / 2 + 2.8; x < L / 2 - 2.6; x += 2.4) {
      if (!D.rng.chance(0.7)) continue;
      painting(D, o, x, 3.3, s * (W / 2 - 0.004), -s, 1.1, 1.5, D.rng.int(0, 3));
    }
  }
  painting(D, D.sub(o, end * (L / 2 - 0.004), 0, -end * Math.PI / 2), 0, 4.2, 0, 1, 2.4, 3.2, D.rng.int(0, 1));
  // Candles: stands by the statue and along the aisle.
  const candle = (x, z) => {
    if (!D.free(o, x - 0.15, z - 0.15, x + 0.15, z + 0.15)) return;
    D.cyl('iron', o, [x, 0, z], [x, 1.1, z], 0.02, 5);
    D.cyl('iron', o, [x, 0, z], [x, 0.03, z], 0.18, 8, { caps: true });
    D.cyl('iron', o, [x, 1.1, z], [x, 1.13, z], 0.09, 8, { caps: true });
    D.cyl('enamel', o, [x, 1.13, z], [x, 1.28, z], 0.025, 6, { caps: true });
    const [wx, , wz] = D.at(o, x, 0, z);
    D.light({ x: wx, z: wz, type: 'candle', hang: 1.33, power: 0.32, color: [1, 0.6, 0.28] });
    out.candles.push([wx, 1.33, wz]);
  };
  for (const s of [-1, 1]) candle(sx - end * 1.6, s * 1.5);
  for (let x = -L / 2 + 2; x < L / 2 - 3.5; x += 4.8) for (const s of [-1, 1]) candle(x, s * (colZ - 0.75));
  // A pale light from somewhere high above the statue.
  const [lx, , lz] = D.at(o, sx - end * 1.2, 0, 0);
  D.light({ x: lx, z: lz, type: 'none', hang: H - 0.5, power: 0.75, color: [0.55, 0.6, 0.78] });
  return out;
}

// An angelic statue, in frame f (facing local +z), standing at height `base`.
// damaged: null | 'head' | 'wing' | 'arm'
export function angel(D, f, base, k, damaged) {
  const b = base;
  D.cone('statue', f, [0, b, 0], [0, b + 0.14 * k, 0], 0.56 * k, 0.48 * k, 16);
  D.cone('statue', f, [0, b + 0.14 * k, 0], [0, b + 1.5 * k, 0], 0.48 * k, 0.21 * k, 16);
  D.cone('statue', f, [0, b + 1.5 * k, 0], [0, b + 2.02 * k, 0], 0.21 * k, 0.27 * k, 14);
  for (const s of [-1, 1]) D.ball('statue', f, [s * 0.24 * k, b + 1.98 * k, 0], 0.11 * k, 10, 6);
  D.cyl('statue', f, [0, b + 2.02 * k, 0], [0, b + 2.16 * k, 0], 0.07 * k, 8);
  if (damaged !== 'head') {
    D.ball('statue', f, [0, b + 2.31 * k, 0.02 * k], 0.15 * k, 12, 8);
    // Halo.
    const R = 0.25 * k, c = [0, b + 2.36 * k, -0.13 * k];
    for (let i = 0; i < 14; i++) {
      const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2;
      D.cyl('brass', f, [c[0] + Math.cos(a0) * R, c[1] + Math.sin(a0) * R, c[2]], [c[0] + Math.cos(a1) * R, c[1] + Math.sin(a1) * R, c[2]], 0.018 * k, 4);
    }
  } else {
    D.cone('statue', f, [0, b + 2.16 * k, 0], [0, b + 2.24 * k, 0.02], 0.08 * k, 0.03 * k, 6);
  }
  // Hands together at the chest.
  for (const s of [-1, 1]) {
    const sh = [s * 0.27 * k, b + 1.96 * k, 0], el = [s * 0.24 * k, b + 1.55 * k, 0.14 * k], hd = [s * 0.03 * k, b + 1.82 * k, 0.27 * k];
    D.cyl('statue', f, sh, el, 0.065 * k, 8);
    if (!(damaged === 'arm' && s > 0)) {
      D.cyl('statue', f, el, hd, 0.055 * k, 8);
      D.ball('statue', f, hd, 0.06 * k, 8, 5);
    }
  }
  // Wings: a fan of quads, two layers, both sides.
  for (const s of [-1, 1]) {
    const broken = damaged === 'wing' && s > 0 ? 0.45 : 1;
    const root = [s * 0.12 * k, b + 1.95 * k, -0.14 * k];
    const outline = [
      [0.35, 2.55], [0.75, 2.95], [1.2, 3.15], [1.35, 2.9], [1.2, 2.4], [1.1, 1.9], [0.95, 1.4], [0.8, 0.95], [0.6, 0.6], [0.35, 0.75], [0.2, 1.2],
    ].map(([x, y]) => [s * (0.12 + (x - 0.12) * broken) * k, b + (1.95 + (y - 1.95) * broken) * k, -(0.2 + x * 0.22) * k]);
    for (const layer of [1, 0.72]) {
      const pts = outline.map((p) => [root[0] + (p[0] - root[0]) * layer, root[1] + (p[1] - root[1]) * layer, p[2] + (1 - layer) * 0.06 * k]);
      for (let i = 0; i < pts.length - 1; i++) {
        D.quad('statue', f, [root, pts[i], pts[i + 1], root], [0, 0, 1], undefined, true);
      }
    }
  }
}

// A framed painting on a wall at local (x, y, z), facing local z = face.
function painting(D, o, x, y, z, face, w, h, tile) {
  const u0 = tile / 4, u1 = (tile + 1) / 4;
  const zf = z + face * 0.03;
  const pts = face > 0
    ? [[x - w / 2, y - h / 2, zf], [x + w / 2, y - h / 2, zf], [x + w / 2, y + h / 2, zf], [x - w / 2, y + h / 2, zf]]
    : [[x + w / 2, y - h / 2, zf], [x - w / 2, y - h / 2, zf], [x - w / 2, y + h / 2, zf], [x + w / 2, y + h / 2, zf]];
  D.quad('paintings', o, pts, [0, 0, face], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  const t = 0.08, zc = z + face * 0.03;
  D.box('brass', o, x, y + h / 2 + t / 2, zc, w + 2 * t, t, 0.06);
  D.box('brass', o, x, y - h / 2 - t / 2, zc, w + 2 * t, t, 0.06);
  D.box('brass', o, x - w / 2 - t / 2, y, zc, t, h, 0.06);
  D.box('brass', o, x + w / 2 + t / 2, y, zc, t, h, 0.06);
}

// ---- Base Gamma -------------------------------------------------------------------------

export function baseGamma(D, r) {
  const { o, L, W } = D.frame(r);
  const out = { crates: [], note: null, radio: null };
  // Two tables pushed together, with a radio, a lantern and papers.
  if (D.free(o, -1, -0.5, 1, 0.5)) {
    D.box('wood', o, 0, 0.74, 0, 1.9, 0.05, 0.9);
    for (const [x, z] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) D.box('steel', o, x, 0.36, z, 0.04, 0.72, 0.04);
    D.box('olive', o, 0.5, 0.88, -0.1, 0.4, 0.22, 0.25);
    D.cyl('steel', o, [0.65, 0.99, -0.15], [0.7, 1.5, -0.2], 0.006, 4);
    D.cyl('olive', o, [-0.6, 0.77, 0.1], [-0.6, 0.98, 0.1], 0.07, 8, { caps: true });
    D.quad('paper', o, [[-0.25, 0.768, -0.15], [0.05, 0.768, -0.15], [0.05, 0.768, 0.25], [-0.25, 0.768, 0.25]], [0, 1, 0]);
    D.solidRect(o, -1, -0.5, 1, 0.5);
    for (const [x, z] of [[-0.5, 0.75], [0.4, -0.75]]) {
      D.box('olive', o, x, 0.45, z, 0.42, 0.05, 0.42);
      D.box('olive', o, x, 0.75, z + Math.sign(z) * 0.2, 0.42, 0.55, 0.04);
      D.box('steel', o, x, 0.22, z, 0.38, 0.44, 0.38, ['top', 'bottom']);
    }
    const [nx, , nz] = D.at(o, -0.1, 0, 0.05);
    out.note = { x: nx, z: nz };
    out.radio = D.at(o, 0.5, 0.9, -0.1);
  }
  // Cots along one wall.
  for (const x of [-L / 2 + 0.6, -L / 2 + 1.6]) {
    const z = W / 2 - 1.05;
    if (!D.free(o, x - 0.4, z - 0.95, x + 0.4, z + 0.95)) continue;
    D.box('olive', o, x, 0.32, z, 0.8, 0.08, 1.9);
    for (const [dx, dz] of [[-0.36, -0.9], [0.36, -0.9], [-0.36, 0.9], [0.36, 0.9]]) D.box('steel', o, x + dx, 0.15, z + dz, 0.04, 0.3, 0.04);
    D.box('canvas', o, x, 0.4, z + 0.75, 0.6, 0.1, 0.3);
    D.solidRect(o, x - 0.4, z - 0.95, x + 0.4, z + 0.95);
  }
  // Shelving with tins and bottles, crates of supplies beneath.
  const sz = -W / 2 + 0.3;
  if (D.free(o, -1.2, sz - 0.25, 1.2, sz + 0.25)) {
    for (const x of [-1.2, 0, 1.2]) D.box('steel', o, x, 1.0, sz, 0.05, 2.0, 0.45);
    for (const y of [0.6, 1.2, 1.8]) {
      D.box('steel', o, 0, y, sz, 2.4, 0.03, 0.45);
      for (let x = -1.1; x < 1.1; x += 0.13) {
        if (!D.rng.chance(0.7)) continue;
        if (D.rng.chance(0.5)) D.cyl('galv', o, [x, y + 0.015, sz], [x, y + 0.13, sz], 0.04, 6, { caps: true });
        else D.cyl('bottle', o, [x, y + 0.015, sz], [x, y + 0.24, sz], 0.035, 6, { caps: true });
      }
    }
    D.solidRect(o, -1.25, sz - 0.25, 1.25, sz + 0.25);
  }
  for (const x of [L / 2 - 0.55, -L / 2 + 0.55]) {
    for (const z of [W / 2 - 0.55, -W / 2 + 0.55]) {
      if (out.crates.length >= 3 || !D.free(o, x - 0.4, z - 0.4, x + 0.4, z + 0.4)) continue;
      const [wx, , wz] = D.at(o, x, 0, z);
      out.crates.push({ x: wx, z: wz, size: 0.68, rot: o.rot });
      D.solid.push([wx - 0.4, wz - 0.4, wx + 0.4, wz + 0.4]);
    }
  }
  // The banner: M.E.G. Base Gamma.
  D.signs.push({ o, lx: -L / 2 + 0.006, ly: 2.0, lz: 0, face: 'x', tile: 3, scale: 2.4 });
  return out;
}

// ---- Galleries (sealed behind bars) --------------------------------------------------------

export function gallery(D, r) {
  const { o, L, W } = D.frame(r);
  const out = { shadows: [], tv: null };
  // Damaged statues on plinths.
  const n = L > 8 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i ? 1 : -1) * L / 4;
    D.box('stone', o, x, 0.4, 0, 1.2, 0.8, 1.2);
    angel(D, D.sub(o, x, 0, D.rng.range(-0.6, 0.6) + (D.rng.chance(0.5) ? Math.PI : 0)), 0.8, D.rng.range(0.85, 1.0), D.rng.pick(['head', 'wing', 'arm', 'head']));
  }
  // Paintings on the walls, some hanging crooked.
  for (const s of [-1, 1]) {
    for (let x = -L / 2 + 1.4; x < L / 2 - 1; x += 2.2) if (D.rng.chance(0.6)) painting(D, o, x, 2.1, s * (W / 2 - 0.004), -s, 0.9, 1.2, D.rng.int(0, 3));
  }
  // Odd objects: a chair facing the wall, an old television.
  const cx = -L / 2 + 0.7, cz = W / 2 - 0.9;
  D.box('wood', o, cx, 0.45, cz, 0.45, 0.05, 0.45);
  D.box('wood', o, cx, 0.75, cz + 0.2, 0.45, 0.6, 0.04);
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) D.box('wood', o, cx + dx, 0.22, cz + dz, 0.04, 0.45, 0.04);
  const tx = L / 2 - 0.8, tz = -W / 2 + 0.8;
  D.box('wood', o, tx, 0.25, tz, 0.7, 0.5, 0.5);
  D.box('blackpanel', o, tx, 0.75, tz, 0.6, 0.5, 0.45);
  out.tv = { pos: D.at(o, tx - 0.0, 0.75, tz + 0.23), rot: o.rot };
  for (let i = 0; i < 3; i++) out.shadows.push(D.at(o, D.rng.range(-L / 2 + 1, L / 2 - 1), 0, D.rng.range(-W / 2 + 1, W / 2 - 1)));
  return out;
}
