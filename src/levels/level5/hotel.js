import { DIRS, EDGE_WALL } from '../../world/GridMap.js';
import { L5_SIGNS } from '../../world/textures.js';

// Set dressing for the Main Hall and the Beverly Room. Everything goes into
// the Dresser's ChunkedBuilders by material name (see Level5's material
// table); lights go into the level's light list with `bulbs` (the glowing
// points the level draws for them) and `glowY`.

const T = 0.08; // half wall thickness
const WARM = [1.0, 0.68, 0.38];

// ---- Small helpers -------------------------------------------------------------

// Frame on the face of the wall on side d of cell (x, y): local +z into the cell.
export function faceFrame(map, x, y, d, off = T) {
  const cs = map.cellSize;
  const [cx, cz] = map.cellCenter(x, y);
  const n = [-DIRS[d][0], -DIRS[d][1]];
  return { x: cx + DIRS[d][0] * (cs / 2 - off), z: cz + DIRS[d][1] * (cs / 2 - off), rot: Math.atan2(n[0], n[1]) };
}

// Frame on the line of an edge, local +z towards cell (x, y)'s neighbour on side d.
export function edgeFrame(map, x, y, d) {
  const cs = map.cellSize;
  const [cx, cz] = map.cellCenter(x, y);
  return { x: cx + DIRS[d][0] * cs / 2, z: cz + DIRS[d][1] * cs / 2, rot: Math.atan2(DIRS[d][0], DIRS[d][1]) };
}

// A horizontal beam along local x (x0..x1) at lateral z, hanging from yTop:
// textured sides (v across the height) and bottom.
export function beamX(D, mat, o, x0, x1, z, yTop, w, h, unit = 1) {
  const yb = yTop - h, u = (x1 - x0) / unit;
  D.quad(mat, o, [[x0, yb, z + w / 2], [x1, yb, z + w / 2], [x1, yTop, z + w / 2], [x0, yTop, z + w / 2]], [0, 0, 1], [[0, 0], [u, 0], [u, 1], [0, 1]]);
  D.quad(mat, o, [[x1, yb, z - w / 2], [x0, yb, z - w / 2], [x0, yTop, z - w / 2], [x1, yTop, z - w / 2]], [0, 0, -1], [[0, 0], [u, 0], [u, 1], [0, 1]]);
  D.quad(mat, o, [[x0, yb, z - w / 2], [x1, yb, z - w / 2], [x1, yb, z + w / 2], [x0, yb, z + w / 2]], [0, -1, 0], [[0, 0], [u, 0], [u, 1], [0, 1]]);
}

export function beamZ(D, mat, o, z0, z1, x, yTop, w, h, unit = 1) {
  beamX(D, mat, { x: D.at(o, x, 0, 0)[0], z: D.at(o, x, 0, 0)[2], rot: o.rot - Math.PI / 2 }, z0, z1, 0, yTop, w, h, unit);
}

// Sign from the atlas on a wall frame, centred at (x, y), half-size w x h.
export function sign(D, f, tile, x, y, w, h, z = 0.012) {
  const v0 = 1 - (tile + 1) / L5_SIGNS, v1 = 1 - tile / L5_SIGNS;
  D.box('darkwood', f, x, y, z - 0.012, w * 2 + 0.06, h * 2 + 0.06, 0.02);
  D.quad('signs', f, [[x - w, y - h, z + 0.001], [x + w, y - h, z + 0.001], [x + w, y + h, z + 0.001], [x - w, y + h, z + 0.001]], [0, 0, 1], [[0, v0], [1, v0], [1, v1], [0, v1]]);
}

// Brass door numbers on a frame at (x, y).
export function plate(D, f, number, x, y, z = 0.03) {
  const s = String(number);
  const w = 0.045, h = 0.07;
  D.box('darkwood', f, x, y, z - 0.008, s.length * w * 2 + 0.05, h * 2 + 0.05, 0.012);
  [...s].forEach((ch, k) => {
    const d = Number(ch);
    const cx = x + (k - (s.length - 1) / 2) * w * 2;
    D.quad('digits', f, [[cx - w, y - h, z], [cx + w, y - h, z], [cx + w, y + h, z], [cx - w, y + h, z]], [0, 0, 1], [[d / 10, 0], [(d + 1) / 10, 0], [(d + 1) / 10, 1], [d / 10, 1]]);
  });
}

// ---- Lights ------------------------------------------------------------------------

// Brass lantern on a curled bracket. f on the wall face. Returns the flame point.
export function lanternSconce(D, f, y = 2.05) {
  D.box('brass', f, 0, y - 0.05, 0.015, 0.1, 0.2, 0.03);
  D.cyl('brass', f, [0, y - 0.02, 0.02], [0, y + 0.02, 0.2], 0.012, 5);
  D.cyl('brass', f, [0, y - 0.1, 0.02], [0, y - 0.06, 0.18], 0.01, 5);
  const c = [0, y + 0.02, 0.24];
  D.cyl('brass', f, [c[0], c[1] - 0.12, c[2]], [c[0], c[1] - 0.1, c[2]], 0.075, 6);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) D.box('brass', f, a * 0.06, c[1] + 0.03, c[2] + b * 0.06, 0.014, 0.26, 0.014);
  // Glass panes, then a pyramid cap and finial.
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const px = nx * 0.058, pz = nz * 0.058;
    const tx = nz, tz = -nx;
    D.quad('lanternGlass', f, [
      [c[0] + px - tx * 0.058, c[1] - 0.09, c[2] + pz - tz * 0.058], [c[0] + px + tx * 0.058, c[1] - 0.09, c[2] + pz + tz * 0.058],
      [c[0] + px + tx * 0.058, c[1] + 0.15, c[2] + pz + tz * 0.058], [c[0] + px - tx * 0.058, c[1] + 0.15, c[2] + pz - tz * 0.058],
    ], [nx, 0, nz]);
  }
  D.cone('brass', f, [c[0], c[1] + 0.16, c[2]], [c[0], c[1] + 0.3, c[2]], 0.1, 0.008, 4);
  return D.at(f, c[0], c[1] + 0.02, c[2]);
}

// Wrought-iron candle chandelier hanging from `top`; returns { bulbs, glowY }.
export function ironChandelier(D, x, z, top, drop = 1.7, R = 0.78) {
  const o = { x, z, rot: 0 };
  const y0 = top - drop;
  D.cyl('iron', o, [0, top, 0], [0, y0 + 0.75, 0], 0.012, 4);
  for (let k = 0; k < 5; k++) D.ball('iron', o, [0, top - 0.15 - k * ((drop - 0.9) / 5), 0], 0.03, 5, 3, 1.6);
  D.ball('iron', o, [0, y0 + 0.62, 0], 0.07, 8, 5);
  D.cyl('iron', o, [0, y0 + 0.62, 0], [0, y0 - 0.12, 0], 0.03, 6);
  D.ball('iron', o, [0, y0 + 0.1, 0], 0.09, 8, 5, 1.3);
  D.cone('iron', o, [0, y0 - 0.12, 0], [0, y0 - 0.32, 0], 0.05, 0.005, 6);
  const bulbs = [];
  const ring = (r, y, n, arms) => {
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
      D.cyl('iron', o, [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], 0.016, 4);
    }
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r < 0.5 ? 0.4 : 0);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      if (arms) {
        // S-scroll arm from the stem out to the ring.
        D.cyl('iron', o, [Math.cos(a) * 0.05, y + 0.3, Math.sin(a) * 0.05], [Math.cos(a) * r * 0.55, y + 0.18, Math.sin(a) * r * 0.55], 0.012, 4);
        D.cyl('iron', o, [Math.cos(a) * r * 0.55, y + 0.18, Math.sin(a) * r * 0.55], [cx, y, cz], 0.012, 4);
        D.ball('iron', o, [Math.cos(a) * r * 0.55, y + 0.14, Math.sin(a) * r * 0.55], 0.03, 5, 3);
      }
      // Drip cup, candle, flame.
      D.cone('brass', o, [cx, y, cz], [cx, y + 0.05, cz], 0.025, 0.05, 6);
      D.cyl('wax', o, [cx, y + 0.05, cz], [cx, y + 0.17, cz], 0.016, 5);
      bulbs.push(D.at(o, cx, y + 0.21, cz));
    }
  };
  ring(R, y0, 10, true);
  ring(R * 0.5, y0 + 0.42, 6, true);
  return { bulbs, glowY: y0 + 0.2 };
}

// Brass and crystal chandelier for the ballroom.
export function crystalChandelier(D, x, z, top, drop = 2.6) {
  const o = { x, z, rot: 0 };
  const y0 = top - drop;
  D.cyl('brass', o, [0, top, 0], [0, y0 + 1.3, 0], 0.014, 4);
  D.cone('brass', o, [0, top, 0], [0, top - 0.12, 0], 0.22, 0.04, 10);
  D.cyl('brass', o, [0, y0 + 1.3, 0], [0, y0 - 0.2, 0], 0.035, 6);
  D.ball('brass', o, [0, y0 + 0.2, 0], 0.13, 10, 6, 1.2);
  D.ball('crystal', o, [0, y0 - 0.35, 0], 0.09, 8, 6, 1.6);
  const bulbs = [];
  for (const [r, y, n] of [[1.05, y0, 14], [0.7, y0 + 0.45, 10], [0.38, y0 + 0.85, 6]]) {
    for (let k = 0; k < 20; k++) {
      const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
      D.cyl('brass', o, [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], 0.014, 4);
      // Strands of crystal drops between the tiers.
      if (k % 2 === 0) {
        const am = (a0 + a1) / 2;
        for (let j = 1; j <= 3; j++) D.ball('crystal', o, [Math.cos(am) * r, y - j * 0.07, Math.sin(am) * r], 0.016, 4, 3, 1.5);
      }
    }
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      D.cyl('brass', o, [Math.cos(a) * 0.08, y + 0.15, Math.sin(a) * 0.08], [cx, y, cz], 0.01, 4);
      D.cyl('wax', o, [cx, y, cz], [cx, y + 0.1, cz], 0.014, 5);
      bulbs.push(D.at(o, cx, y + 0.15, cz));
    }
  }
  return { bulbs, glowY: y0 + 0.3 };
}

// Hanging brass dome lamp (dining room).
export function pendantLamp(D, x, z, top, drop = 1.6) {
  const o = { x, z, rot: 0 };
  const y = top - drop;
  D.cyl('brass', o, [0, top, 0], [0, y + 0.2, 0], 0.008, 4);
  D.cone('brass', o, [0, y + 0.2, 0], [0, y - 0.05, 0], 0.05, 0.32, 12);
  return { bulbs: [D.at(o, 0, y - 0.02, 0)], glowY: y };
}

// ---- Architecture ----------------------------------------------------------------------

// Crimson faux-marble column with gilded rope edges, base and capital,
// standing from the floor to `topY` (where a girder rests on it).
export function column(D, c, topY, s = 0.62) {
  D.box('marble', c, 0, 0.24, 0, s + 0.2, 0.48, s + 0.2);
  D.box('gold', c, 0, 0.5, 0, s + 0.14, 0.04, s + 0.14);
  const shaftTop = topY - 0.72;
  D.box('marble', c, 0, (0.52 + shaftTop) / 2, 0, s, shaftTop - 0.52, s, ['top', 'bottom']);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    D.cyl('rope', c, [a * s / 2, 0.52, b * s / 2], [a * s / 2, shaftTop, b * s / 2], 0.034, 6, { vScale: 5 });
  }
  // Capital: gilt bands, a dark carved block, a gilded flare.
  D.box('gold', c, 0, shaftTop + 0.03, 0, s + 0.1, 0.06, s + 0.1);
  D.box('darkwood', c, 0, shaftTop + 0.22, 0, s + 0.04, 0.32, s + 0.04);
  for (const [a, b] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) D.ball('gold', c, [a * (s / 2 + 0.03), shaftTop + 0.22, b * (s / 2 + 0.03)], 0.07, 8, 5, 1);
  D.box('gold', c, 0, shaftTop + 0.43, 0, s + 0.22, 0.1, s + 0.22);
  D.box('darkwood', c, 0, shaftTop + 0.57, 0, s + 0.3, 0.18, s + 0.3);
  D.box('gold', c, 0, shaftTop + 0.69, 0, s + 0.38, 0.06, s + 0.38);
  D.solidRect(c, -s / 2 - 0.1, -s / 2 - 0.1, s / 2 + 0.1, s / 2 + 0.1);
}

// Girder along local x at lateral z: dark wood with the painted frieze on both sides.
export function girder(D, o, x0, x1, z, H, depth = 0.78, w = 0.5) {
  const yb = H - depth;
  D.box('darkwood', o, (x0 + x1) / 2, H - depth / 2, z, x1 - x0, depth, w, ['top']);
  const u = (x1 - x0) / 2.6;
  for (const s of [-1, 1]) {
    const zz = z + s * (w / 2 + 0.004);
    const pts = s > 0
      ? [[x0, yb + 0.07, zz], [x1, yb + 0.07, zz], [x1, H - 0.07, zz], [x0, H - 0.07, zz]]
      : [[x1, yb + 0.07, zz], [x0, yb + 0.07, zz], [x0, H - 0.07, zz], [x1, H - 0.07, zz]];
    D.quad('frieze', o, pts, [0, 0, s], [[0, 0], [u, 0], [u, 1], [0, 1]]);
    D.box('gold', o, (x0 + x1) / 2, yb + 0.035, z + s * (w / 2 + 0.01), x1 - x0, 0.03, 0.02);
  }
}

// ---- Furniture ------------------------------------------------------------------------------

export function armchair(D, o) {
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) D.box('darkwood', o, a * 0.3, 0.07, b * 0.3, 0.06, 0.14, 0.06);
  D.box('fabric', o, 0, 0.3, 0.02, 0.74, 0.3, 0.7);
  D.box('fabric', o, 0, 0.48, 0.05, 0.56, 0.08, 0.6);
  D.box('fabric', o, 0, 0.72, -0.3, 0.74, 0.62, 0.16);
  for (const s of [-1, 1]) {
    D.box('fabric', o, s * 0.32, 0.56, 0.04, 0.12, 0.22, 0.66);
    D.cyl('fabric', o, [s * 0.32, 0.67, -0.28], [s * 0.32, 0.67, 0.36], 0.07, 6);
  }
  D.cyl('fabric', o, [-0.37, 1.02, -0.3], [0.37, 1.02, -0.3], 0.08, 6);
  D.solidRect(o, -0.4, -0.4, 0.4, 0.4);
}

export function sofa(D, o, len = 2.0) {
  const h = len / 2;
  for (const a of [-1, 1]) for (const b of [-1, 1]) D.box('darkwood', o, a * (h - 0.08), 0.07, b * 0.3, 0.06, 0.14, 0.06);
  D.box('fabric', o, 0, 0.3, 0.02, len, 0.3, 0.76);
  for (let k = 0; k < 3; k++) D.box('fabric', o, -h + 0.2 + (k + 0.5) * ((len - 0.4) / 3), 0.49, 0.06, (len - 0.4) / 3 - 0.02, 0.1, 0.62);
  D.box('fabric', o, 0, 0.76, -0.31, len, 0.66, 0.16);
  D.cyl('fabric', o, [-h, 1.08, -0.31], [h, 1.08, -0.31], 0.09, 6);
  for (const s of [-1, 1]) {
    D.box('fabric', o, s * (h - 0.06), 0.57, 0.04, 0.12, 0.24, 0.7);
    D.cyl('fabric', o, [s * (h - 0.06), 0.69, -0.3], [s * (h - 0.06), 0.69, 0.4], 0.08, 6);
  }
  D.solidRect(o, -h - 0.04, -0.42, h + 0.04, 0.42);
}

// Round pedestal table; with an orchid in a white pot.
export function pedestalTable(D, o, r = 0.42, orchid = true) {
  D.cone('darkwood', o, [0, 0, 0], [0, 0.08, 0], 0.3, 0.08, 10);
  D.cyl('darkwood', o, [0, 0.08, 0], [0, 0.66, 0], 0.05, 8);
  D.ball('darkwood', o, [0, 0.4, 0], 0.08, 8, 5, 1.4);
  D.cyl('darkwood', o, [0, 0.66, 0], [0, 0.71, 0], r, 16, { caps: true });
  D.cyl('gold', o, [0, 0.665, 0], [0, 0.675, 0], r + 0.01, 16);
  if (orchid) {
    D.cone('enamel', o, [0, 0.71, 0], [0, 0.9, 0], 0.08, 0.11, 10, { caps: true });
    D.cyl('soil', o, [0, 0.88, 0], [0, 0.895, 0], 0.1, 8, { caps: true });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.3;
      const tip = [Math.cos(a) * 0.22, 1.32 + k * 0.06, Math.sin(a) * 0.22];
      D.cyl('leaf', o, [0, 0.9, 0], [tip[0] * 0.3, tip[1] - 0.12, tip[2] * 0.3], 0.006, 3);
      D.cyl('leaf', o, [tip[0] * 0.3, tip[1] - 0.12, tip[2] * 0.3], tip, 0.006, 3);
      for (let j = 0; j < 4; j++) {
        const t = 0.45 + j * 0.18;
        D.ball('petal', o, [tip[0] * t, tip[1] - 0.04 - (1 - t) * 0.12, tip[2] * t], 0.035, 6, 4, 0.55);
      }
    }
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6;
      D.quad('leaf', o, [[0, 0.92, 0], [Math.cos(a + 0.25) * 0.08, 0.95, Math.sin(a + 0.25) * 0.08], [Math.cos(a) * 0.24, 0.9, Math.sin(a) * 0.24], [Math.cos(a - 0.25) * 0.08, 0.95, Math.sin(a - 0.25) * 0.08]], [0, 1, 0], undefined, true);
    }
  }
  D.solidRect(o, -r, -r, r, r);
}

// Potted palm: a tall urn and arching fronds.
export function palm(D, o, scale = 1) {
  D.cone('pot', o, [0, 0, 0], [0, 0.55 * scale, 0], 0.2 * scale, 0.28 * scale, 10, { caps: true });
  D.cyl('gold', o, [0, 0.42 * scale, 0], [0, 0.46 * scale, 0], 0.26 * scale, 10);
  D.cyl('soil', o, [0, 0.53 * scale, 0], [0, 0.54 * scale, 0], 0.26 * scale, 8, { caps: true });
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + k * 0.3;
    const base = [0, 0.55 * scale, 0];
    const stemTop = [Math.cos(a) * 0.12 * scale, (1.4 + (k % 3) * 0.3) * scale, Math.sin(a) * 0.12 * scale];
    D.cyl('trunk', o, base, stemTop, 0.018 * scale, 4);
    // Frond: two segments arching out and down, leaflets either side.
    const mid = [Math.cos(a) * 0.55 * scale, stemTop[1] + 0.12 * scale, Math.sin(a) * 0.55 * scale];
    const tip = [Math.cos(a) * 1.0 * scale, stemTop[1] - 0.35 * scale, Math.sin(a) * 1.0 * scale];
    const side = [-Math.sin(a), 0, Math.cos(a)];
    for (const [p, q] of [[stemTop, mid], [mid, tip]]) {
      const w0 = p === stemTop ? 0.08 : 0.2, w1 = p === stemTop ? 0.2 : 0.03;
      const pts = [
        [p[0] - side[0] * w0 * scale, p[1] - 0.04, p[2] - side[2] * w0 * scale],
        [q[0] - side[0] * w1 * scale, q[1] - 0.06, q[2] - side[2] * w1 * scale],
        [q[0] + side[0] * w1 * scale, q[1] - 0.06, q[2] + side[2] * w1 * scale],
        [p[0] + side[0] * w0 * scale, p[1] - 0.04, p[2] + side[2] * w0 * scale],
      ];
      D.quad('leaf', o, pts, [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], true);
    }
  }
  D.solidRect(o, -0.3 * scale, -0.3 * scale, 0.3 * scale, 0.3 * scale);
}

// Brass luggage cart with suitcases.
export function luggageCart(D, o, rng) {
  D.box('carpetRed', o, 0, 0.26, 0, 1.2, 0.04, 0.62);
  D.box('brass', o, 0, 0.22, 0, 1.24, 0.05, 0.66);
  for (const a of [-1, 1]) for (const b of [-1, 1]) D.cyl('black', o, [a * 0.5, 0.08, b * 0.33], [a * 0.5, 0.08, b * 0.25], 0.08, 8, { caps: true });
  for (const a of [-1, 1]) {
    D.cyl('brass', o, [a * 0.58, 0.26, -0.3], [a * 0.58, 1.85, -0.3], 0.022, 6);
    D.cyl('brass', o, [a * 0.58, 0.26, 0.3], [a * 0.58, 1.85, 0.3], 0.022, 6);
    D.cyl('brass', o, [a * 0.58, 1.85, -0.3], [a * 0.58, 1.85, 0.3], 0.022, 6);
  }
  D.cyl('brass', o, [-0.58, 1.95, 0], [0.58, 1.95, 0], 0.025, 6);
  for (const a of [-1, 1]) D.cyl('brass', o, [a * 0.58, 1.85, 0], [a * 0.58, 1.95, 0], 0.02, 5);
  // Suitcases.
  let y = 0.28;
  for (let k = 0; k < 3; k++) {
    const w = rng.range(0.7, 0.95), h = rng.range(0.18, 0.28), d = rng.range(0.42, 0.55);
    const m = rng.pick(['leather', 'leatherTan', 'leather']);
    D.box(m, o, rng.range(-0.12, 0.12), y + h / 2, rng.range(-0.04, 0.04), w, h, d);
    D.box('brass', o, 0, y + h + 0.02, 0, 0.14, 0.04, 0.03);
    y += h;
  }
  D.box('leatherTan', o, 0.3, 1.2, 0.1, 0.35, 0.45, 0.22);
  D.solidRect(o, -0.66, -0.36, 0.66, 0.36);
}

// Picture in a gilt frame on a wall frame f.
export function painting(D, f, tile, x, y, w, h) {
  const u0 = tile / 4, u1 = (tile + 1) / 4;
  D.quad('paintings', f, [[x - w / 2, y - h / 2, 0.03], [x + w / 2, y - h / 2, 0.03], [x + w / 2, y + h / 2, 0.03], [x - w / 2, y + h / 2, 0.03]], [0, 0, 1], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  const b = 0.07;
  D.box('gold', f, x, y + h / 2 + b / 2, 0.03, w + 2 * b, b, 0.05);
  D.box('gold', f, x, y - h / 2 - b / 2, 0.03, w + 2 * b, b, 0.05);
  D.box('gold', f, x - w / 2 - b / 2, y, 0.03, b, h, 0.05);
  D.box('gold', f, x + w / 2 + b / 2, y, 0.03, b, h, 0.05);
}

// Side table against a wall, with a lamp or a vase.
export function sideTable(D, f, x, lamp) {
  D.box('darkwood', f, x, 0.76, 0.24, 0.8, 0.04, 0.4);
  for (const a of [-1, 1]) for (const b of [0.07, 0.4]) D.box('darkwood', f, x + a * 0.36, 0.38, b, 0.04, 0.76, 0.04);
  D.box('darkwood', f, x, 0.66, 0.24, 0.74, 0.12, 0.36);
  if (lamp) {
    D.cone('brass', f, [x, 0.78, 0.24], [x, 0.84, 0.24], 0.09, 0.05, 8);
    D.cyl('brass', f, [x, 0.84, 0.24], [x, 1.18, 0.24], 0.012, 5);
    D.cone('shade', f, [x, 1.08, 0.24], [x, 1.32, 0.24], 0.19, 0.11, 10);
  } else {
    D.cone('vase', f, [x, 0.78, 0.24], [x, 1.02, 0.24], 0.07, 0.11, 8, { caps: true });
    for (let k = 0; k < 5; k++) D.cyl('trunk', f, [x, 1.0, 0.24], [x + Math.cos(k * 1.3) * 0.12, 1.22 + (k % 2) * 0.08, 0.24 + Math.sin(k * 1.3) * 0.1], 0.005, 3);
  }
  D.solidRect(f, x - 0.42, 0, x + 0.42, 0.46);
}

// Grandfather clock against a wall; returns its world position.
export function grandfatherClock(D, f, x) {
  D.box('mahogany', f, x, 0.2, 0.2, 0.58, 0.4, 0.4);
  D.box('mahogany', f, x, 1.0, 0.18, 0.46, 1.2, 0.32);
  D.box('mahogany', f, x, 1.88, 0.2, 0.56, 0.62, 0.38);
  D.box('gold', f, x, 2.22, 0.2, 0.6, 0.06, 0.42);
  D.cone('mahogany', f, [x, 2.25, 0.2], [x, 2.42, 0.2], 0.28, 0.06, 4);
  D.quad('clock', f, [[x - 0.2, 1.68, 0.392], [x + 0.2, 1.68, 0.392], [x + 0.2, 2.08, 0.392], [x - 0.2, 2.08, 0.392]], [0, 0, 1]);
  D.box('black', f, x, 1.0, 0.345, 0.24, 0.9, 0.01);
  D.cyl('brass', f, [x, 1.42, 0.35], [x, 0.78, 0.35], 0.006, 4);
  D.cyl('brass', f, [x, 0.72, 0.35], [x, 0.74, 0.35], 0.07, 10, { caps: true });
  D.solidRect(f, x - 0.32, 0, x + 0.32, 0.42);
  return D.at(f, x, 1.5, 0.3);
}

// Reception counter with key cubbies behind; returns the desk bell's world position.
export function receptionDesk(D, f, x, len = 3.2) {
  const h = len / 2;
  // The counter stands 1.3 m out from the wall; the clerk's side faces it.
  const z = 1.45;
  D.box('mahogany', f, x, 0.52, z, len, 1.04, 0.62);
  D.box('darkwood', f, x, 1.07, z + 0.04, len + 0.1, 0.06, 0.74);
  D.box('gold', f, x, 1.035, z + 0.41, len + 0.1, 0.02, 0.02);
  for (let k = 0; k < 4; k++) {
    const px = x - h + (k + 0.5) * (len / 4);
    D.box('darkwood', f, px, 0.55, z + 0.315, len / 4 - 0.14, 0.7, 0.02);
    D.box('gold', f, px, 0.55, z + 0.33, 0.14, 0.14, 0.01);
  }
  for (const s of [-1, 1]) D.box('mahogany', f, x + s * (h + 0.05), 0.55, z - 0.6, 0.08, 1.1, 0.6);
  // Key cubbies on the wall.
  D.box('mahogany', f, x, 1.95, 0.12, 2.4, 1.3, 0.24);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const cx = x - 1.05 + c * 0.3, cy = 1.45 + r * 0.3;
      D.box('darkwood', f, cx, cy, 0.23, 0.24, 0.22, 0.02);
      if ((r * 8 + c) % 3) D.box('brass', f, cx, cy - 0.02, 0.25, 0.03, 0.09, 0.012);
    }
  }
  // Ledger, pen, the bell.
  D.box('paper', f, x - 0.6, 1.11, z + 0.05, 0.42, 0.03, 0.3);
  D.box('leather', f, x - 0.6, 1.105, z + 0.05, 0.44, 0.02, 0.32);
  D.cyl('black', f, [x - 0.3, 1.11, z], [x - 0.2, 1.11, z + 0.12], 0.006, 4);
  const bx = x + 0.7;
  D.cyl('darkwood', f, [bx, 1.1, z + 0.1], [bx, 1.12, z + 0.1], 0.06, 10, { caps: true });
  D.ball('brass', f, [bx, 1.12, z + 0.1], 0.055, 10, 5, 0.75);
  D.cyl('brass', f, [bx, 1.16, z + 0.1], [bx, 1.19, z + 0.1], 0.008, 4);
  D.solidRect(f, x - h - 0.1, 0, x + h + 0.1, z + 0.38);
  return D.at(f, bx, 1.15, z + 0.1);
}

// Abandoned room service cart with a cloche and a tray.
export function serviceCart(D, o) {
  D.box('linen', o, 0, 0.82, 0, 0.9, 0.04, 0.55);
  D.box('linen', o, 0, 0.6, 0.27, 0.9, 0.44, 0.01);
  D.box('linen', o, 0, 0.6, -0.27, 0.9, 0.44, 0.01);
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    D.cyl('brass', o, [a * 0.42, 0.08, b * 0.24], [a * 0.42, 0.82, b * 0.24], 0.012, 4);
    D.cyl('black', o, [a * 0.42, 0.05, b * 0.24 - 0.02], [a * 0.42, 0.05, b * 0.24 + 0.02], 0.045, 8, { caps: true });
  }
  D.cyl('chrome', o, [0.15, 0.84, 0], [0.15, 0.85, 0], 0.17, 12, { caps: true });
  D.ball('chrome', o, [0.15, 0.85, 0], 0.15, 10, 4, 0.75);
  D.ball('chrome', o, [0.15, 0.98, 0], 0.02, 5, 3);
  D.cyl('chrome', o, [-0.25, 0.84, 0.05], [-0.25, 0.85, 0.05], 0.12, 10, { caps: true });
  D.cyl('crystal', o, [-0.3, 0.85, -0.15], [-0.3, 0.98, -0.15], 0.03, 6);
  D.solidRect(o, -0.5, -0.32, 0.5, 0.32);
}

// ---- Doors -----------------------------------------------------------------------------------

// A guest room door seen from the corridor. o on the edge line, +z towards
// the corridor. Locked doors sit in the (solid) wall; open ones swing in.
export function guestDoor(D, o, number, state, leaf = 'door') {
  const z = T;
  // Architrave.
  for (const s of [-1, 1]) D.box('darkwood', o, s * 0.58, 1.15, z + 0.015, 0.14, 2.3, 0.03);
  D.box('darkwood', o, 0, 2.34, z + 0.02, 1.3, 0.16, 0.04);
  D.box('gold', o, 0, 2.27, z + 0.04, 1.2, 0.02, 0.01);
  if (state === 'locked') {
    D.box(leaf, o, 0, 1.1, z + 0.012, 1.0, 2.2, 0.024);
    D.cyl('brass', o, [0.4, 1.0, z + 0.02], [0.4, 1.0, z + 0.07], 0.028, 5, { caps: true });
    D.box('brass', o, 0.4, 0.95, z + 0.026, 0.05, 0.16, 0.006);
    if (number) plate(D, o, number, 0, 1.62, z + 0.034);
  } else {
    if (number) plate(D, o, number, 0.78, 1.55, z + 0.02);
  }
}

// ---- Rooms -----------------------------------------------------------------------------------

// Lobbies and lounges after the reference photo: crimson marble columns with
// gilded rope and capitals carrying frieze girders, a beamed ochre ceiling,
// wrought-iron candle chandeliers, lantern sconces, a medallion rug on sage
// carpet, striped armchairs and sofas, orchids, palms, a luggage cart.
export function lobby(D, room, ctx) {
  const { map, rng } = ctx;
  const cs = map.cellSize;
  const H = room.ceil;
  const fr = D.frame({ x: room.x, y: room.y, w: room.w, h: room.h, doors: ctx.doorsOf(room) });
  const { o, L, W } = fr;
  const out = { bulbs: [], ticks: [], bells: [], rug: null, frontDoor: null };
  const big = room.kind === 'grand';
  const gB = H - 0.78;
  // Columns: two rows, one aisle in from the long walls.
  const zc = W / 2 - (W > 12 ? cs : cs * 0.9);
  const nx = Math.max(1, Math.round((L - 2 * cs) / (cs * 2)));
  const xsCol = [];
  for (let k = 0; k <= nx; k++) xsCol.push(-L / 2 + cs + (k * (L - 2 * cs)) / nx);
  if (room.kind !== 'homely') {
    for (const x of xsCol) {
      for (const s of [-1, 1]) {
        const c = D.sub(o, x, s * zc, 0);
        column(D, c, gB);
        // A lantern on the nave side of each column.
        const f = D.sub(c, 0, -s * 0.31, s > 0 ? Math.PI : 0);
        const p = lanternSconce(D, f, 2.3);
        D.light({ x: p[0], z: p[2], power: 0.4, color: WARM, hide: true, bulbs: [p], glowY: p[1], kind: 'sconce', state: rng.chance(0.08) ? 'flicker' : 'on' });
      }
    }
    for (const s of [-1, 1]) girder(D, o, -L / 2, L / 2, s * zc, H);
    for (const x of xsCol) girder(D, { x: D.at(o, x, 0, 0)[0], z: D.at(o, x, 0, 0)[2], rot: o.rot - Math.PI / 2 }, -W / 2, W / 2, 0, H, 0.6, 0.4);
  }
  // Painted ceiling beams across the room.
  for (let x = -L / 2 + 0.7; x < L / 2 - 0.3; x += 1.4) {
    if (xsCol.some((c) => Math.abs(c - x) < 0.4)) continue;
    beamZ(D, 'beam', o, -W / 2, W / 2, x, H, 0.16, 0.24, 1.2);
  }
  // Frieze band, cornice, baseboards and the walls' doorways.
  wallTrim(D, room, ctx, H, out);
  // Chandeliers down the nave, between the column pairs.
  const chX = [];
  for (let k = 0; k < xsCol.length - 1; k++) chX.push((xsCol[k] + xsCol[k + 1]) / 2);
  if (!chX.length) chX.push(0);
  for (const x of chX) {
    const [wx, , wz] = D.at(o, x, 0, 0);
    const c = room.kind === 'homely' ? pendantLamp(D, wx, wz, H, 1.8) : ironChandelier(D, wx, wz, H, big ? 1.9 : 1.6, big ? 0.85 : 0.7);
    D.light({ x: wx, z: wz, power: big ? 1.25 : 1.05, color: WARM, hide: true, bulbs: c.bulbs, glowY: c.glowY, kind: 'chandelier', state: rng.chance(0.06) ? 'flicker' : 'on', bulbSize: 0.5 });
  }
  // The rug.
  const rw = Math.max(3, L - 2 * cs - 0.6), rh = Math.max(3, 2 * zc - 1.4);
  out.rug = { o, w: rw, h: rh };
  D.quad(`rug${ctx.rugIndex}`, o, [[-rw / 2, 0.006, -rh / 2], [rw / 2, 0.006, -rh / 2], [rw / 2, 0.006, rh / 2], [-rw / 2, 0.006, rh / 2]], [0, 1, 0]);
  // Seating groups on the rug.
  const groups = [];
  if (chX.length >= 2) groups.push(chX[0], chX[chX.length - 1]);
  else groups.push(0);
  for (const gx of groups) {
    const g = D.sub(o, gx, 0, 0);
    if (!D.free(g, -1.9, -1.5, 1.9, 1.5)) continue;
    pedestalTable(D, g, 0.42, true);
    sofa(D, D.sub(g, 0, -1.25, 0), 2.1);
    armchair(D, D.sub(g, -1.4, 0.35, Math.PI / 2 + 0.35));
    armchair(D, D.sub(g, 1.4, 0.35, -Math.PI / 2 - 0.35));
  }
  // Aisles: palms by the columns, chairs and tables along the walls.
  for (const x of xsCol) {
    for (const s of [-1, 1]) {
      const p = D.sub(o, x + (rng.chance(0.5) ? 0.75 : -0.75), s * (zc + 0.05), 0);
      if (rng.chance(0.55) && D.free(p, -0.35, -0.35, 0.35, 0.35)) palm(D, p, rng.range(0.9, 1.15));
    }
  }
  return out;
}

// Trim on a room's walls: baseboard, frieze band and cornice; architraves
// on openings; paintings, a clock, a reception desk, the front doors.
export function wallTrim(D, room, ctx, H, out) {
  const { map, rng, layout } = ctx;
  const cs = map.cellSize;
  const inRoom = (x, y) => map.inBounds(x, y) && layout.roomOf[map.idx(x, y)] === room.id;
  const segs = [];
  for (const [x, y] of room.cells) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (inRoom(nx, ny)) continue;
      const wall = map.getEdge(map.edge(x, y, d)) === EDGE_WALL;
      segs.push({ x, y, d, wall, f: faceFrame(map, x, y, d), outside: !map.inBounds(nx, ny) || layout.zone[map.idx(nx, ny)] === 8 });
    }
  }
  const fh = Math.min(0.62, H * 0.11);
  for (const s of segs) {
    const f = s.f;
    if (!s.wall) {
      // Opening: a dark architrave with a gilt line, up to the lower ceiling.
      // Openings side by side share one frame.
      const [nx, ny] = [s.x + DIRS[s.d][0], s.y + DIRS[s.d][1]];
      const top = Math.min(H, layout.ceil[map.idx(nx, ny)]);
      const tx = Math.round(Math.cos(f.rot)), tz = Math.round(-Math.sin(f.rot));
      for (const k of [-1, 1]) {
        const ax = s.x + tx * k, ay = s.y + tz * k;
        if (inRoom(ax, ay) && map.getEdge(map.edge(ax, ay, s.d)) !== EDGE_WALL) continue;
        D.box('darkwood', f, k * (cs / 2 - 0.12), top / 2, 0.04, 0.24, top, 0.08);
        D.box('gold', f, k * (cs / 2 - 0.25), top / 2, 0.06, 0.03, top, 0.04);
        D.solidRect(f, k > 0 ? cs / 2 - 0.24 : -cs / 2, 0, k > 0 ? cs / 2 : -cs / 2 + 0.24, 0.08);
      }
      D.box('darkwood', f, 0, top - 0.1, 0.04, cs, 0.2, 0.1);
      D.box('gold', f, 0, top - 0.21, 0.06, cs - 0.4, 0.03, 0.04);
      continue;
    }
    D.box('darkwood', f, 0, 0.11, 0.015, cs, 0.22, 0.03);
    D.box('gold', f, 0, 0.225, 0.02, cs, 0.015, 0.02);
    // Frieze band and cornice.
    const y1 = H - 0.22, y0 = y1 - fh;
    D.quad('frieze', f, [[-cs / 2, y0, 0.01], [cs / 2, y0, 0.01], [cs / 2, y1, 0.01], [-cs / 2, y1, 0.01]], [0, 0, 1], [[0, 0], [cs / (fh * 4), 0], [cs / (fh * 4), 1], [0, 1]]);
    D.box('darkwood', f, 0, H - 0.11, 0.06, cs, 0.22, 0.12);
    D.box('gold', f, 0, y0 - 0.02, 0.015, cs, 0.04, 0.03);
    D.box('darkwood', f, 0, H * 0.42, 0.012, cs, 0.05, 0.024);
  }
  // Furnish the plain wall segments: front doors (grand lobby), a desk,
  // a clock, paintings, side tables.
  const plain = rng.shuffle(segs.filter((s) => s.wall));
  const used = new Set();
  const take = (pred) => {
    const s = plain.find((q) => !used.has(q) && pred(q));
    if (s) used.add(s);
    return s;
  };
  if (room.kind === 'grand') {
    const door = take((s) => s.outside) || take(() => true);
    if (door) out.frontDoor = frontDoors(D, door.f, ctx);
    const desk = take((s) => D.free(s.f, -1.8, 0, 1.8, 2.0));
    if (desk) {
      out.bells.push(receptionDesk(D, desk.f, 0, 3.0));
      sign(D, desk.f, 5, 0, 2.95, 0.6, 0.15);
      const cart = D.sub(desk.f, 2.2, 1.0, 0.4);
      if (D.free(cart, -0.7, -0.4, 0.7, 0.4)) luggageCart(D, cart, rng);
    }
  }
  if (room.kind === 'grand' || room.kind === 'lounge') {
    const clock = take((s) => D.free(s.f, -0.4, 0, 0.4, 0.5));
    if (clock) out.ticks.push(grandfatherClock(D, clock.f, 0));
  }
  for (const s of plain) {
    if (used.has(s)) continue;
    if (rng.chance(0.55)) painting(D, s.f, rng.int(0, 3), 0, Math.min(2.4, H * 0.45), rng.range(0.9, 1.3), rng.range(0.7, 1.0));
    if (rng.chance(0.4) && D.free(s.f, -0.45, 0, 0.45, 0.5)) sideTable(D, s.f, 0, rng.chance(0.6));
    else if (rng.chance(0.35) && D.free(s.f, -0.45, 0.05, 0.45, 0.85)) armchair(D, D.sub(s.f, 0, 0.5, 0));
  }
}

// Arched double doors with a glowing fanlight: daylight on the other side,
// always the same afternoon. They never open.
export function frontDoors(D, f, ctx) {
  const w = 2.2, h = 3.0, R = w / 2;
  // Stone surround.
  for (const s of [-1, 1]) {
    D.box('stone', f, s * (w / 2 + 0.25), (h + R) / 2, 0.08, 0.5, h + R, 0.16);
    D.box('gold', f, s * (w / 2 + 0.25), h, 0.17, 0.52, 0.06, 0.02);
  }
  D.box('stone', f, 0, h + R + 0.2, 0.08, w + 1.0, 0.4, 0.16);
  // Leaves: dark wood frames around lit glass.
  for (const s of [-1, 1]) {
    const cx = s * w / 4;
    D.box('darkwood', f, cx, h / 2, 0.03, w / 2 - 0.02, h, 0.06, ['nz']);
    D.quad('daylight', f, [[cx - w / 4 + 0.16, 1.1, 0.065], [cx + w / 4 - 0.16, 1.1, 0.065], [cx + w / 4 - 0.16, h - 0.16, 0.065], [cx - w / 4 + 0.16, h - 0.16, 0.065]], [0, 0, 1]);
    for (let k = 1; k < 4; k++) D.box('darkwood', f, cx, 1.1 + k * ((h - 1.26) / 4), 0.07, w / 2 - 0.3, 0.035, 0.02);
    D.box('darkwood', f, cx, 1.1 + (h - 1.26) / 2, 0.07, 0.035, h - 1.26, 0.02);
    D.ball('brass', f, [s * 0.12, 1.15, 0.09], 0.035, 6, 4);
  }
  // Fanlight: a half-disc of glass with dark wood spokes.
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI, a1 = ((k + 1) / n) * Math.PI;
    const p0 = [Math.cos(a0) * R, h + Math.sin(a0) * R], p1 = [Math.cos(a1) * R, h + Math.sin(a1) * R];
    D.quad('daylight', f, [[0, h, 0.03], [p0[0], p0[1], 0.03], [p1[0], p1[1], 0.03], [0, h, 0.03]], [0, 0, 1]);
    D.cyl('darkwood', f, [p0[0], p0[1], 0.05], [p1[0], p1[1], 0.05], 0.05, 4);
    if (k % 2 === 0) D.cyl('darkwood', f, [0, h, 0.05], [p0[0] * 0.95, h + (p0[1] - h) * 0.95, 0.05], 0.018, 4);
  }
  D.box('darkwood', f, 0, h + 0.02, 0.05, w, 0.08, 0.06);
  const [lx, , lz] = D.at(f, 0, 0, 0.9);
  D.light({ x: lx, z: lz, power: 1.1, color: [1, 0.9, 0.72], hide: true, kind: 'daylight' });
  D.solidRect(f, -w / 2 - 0.5, 0, w / 2 + 0.5, 0.2);
  const [x, , z] = D.at(f, 0, 0, 0.5);
  return { x, z };
}

// A guest room behind an open door: bed, nightstands and lamp, wardrobe,
// writing desk, armchair, a painting.
export function guestRoom(D, room, ctx) {
  const { map, rng } = ctx;
  const xs = room.cells.map((c) => c[0]), ys = room.cells.map((c) => c[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) !== room.cells.length || room.cells.length < 2) return {};
  const fr = D.frame({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, doors: [{ x: room.door.x, y: room.door.y, d: room.door.d }] });
  const { o, L, W } = fr;
  // Which end is the door at?
  const [dcx, dcz] = map.cellCenter(room.door.x, room.door.y);
  const dx = dcx + DIRS[room.door.d][0] * map.cellSize / 2 - o.x, dz = dcz + DIRS[room.door.d][1] * map.cellSize / 2 - o.z;
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const lx = dx * c - dz * s;
  const far = lx > 0 ? -1 : 1; // the end away from the door
  const bed = D.sub(o, far * (L / 2 - 1.1), 0, far > 0 ? -Math.PI / 2 : Math.PI / 2);
  // Bed: headboard against the far wall, local -z = head.
  D.box('mahogany', bed, 0, 0.75, -1.02, 1.7, 1.5, 0.08);
  D.box('gold', bed, 0, 1.48, -0.99, 1.5, 0.04, 0.03);
  D.box('mahogany', bed, 0, 0.2, 0, 1.64, 0.3, 2.0);
  D.box('linen', bed, 0, 0.45, 0.02, 1.58, 0.22, 1.94);
  D.box('bedspread', bed, 0, 0.5, 0.35, 1.66, 0.14, 1.32);
  D.box('bedspread', bed, 0, 0.36, 0.35, 1.68, 0.3, 1.3, ['top']);
  for (const k of [-1, 1]) D.box('linen', bed, k * 0.4, 0.62, -0.78, 0.62, 0.14, 0.34);
  D.box('mahogany', bed, 0, 0.35, 1.0, 1.7, 0.7, 0.06);
  D.solidRect(bed, -0.86, -1.08, 0.86, 1.05);
  const bulbs = [];
  for (const k of [-1, 1]) {
    const ns = D.sub(bed, k * 1.08, -0.82, 0);
    if (!D.free(ns, -0.22, -0.2, 0.22, 0.2)) continue;
    D.box('mahogany', ns, 0, 0.3, 0, 0.42, 0.6, 0.38);
    D.box('brass', ns, 0, 0.42, 0.195, 0.08, 0.02, 0.01);
    if (k > 0 || rng.chance(0.5)) {
      D.cone('brass', ns, [0, 0.6, 0], [0, 0.66, 0], 0.07, 0.03, 8);
      D.cyl('brass', ns, [0, 0.66, 0], [0, 0.92, 0], 0.01, 4);
      D.cone('shade', ns, [0, 0.84, 0], [0, 1.04, 0], 0.15, 0.09, 10);
      const p = D.at(ns, 0, 0.9, 0);
      if (k > 0) {
        D.light({ x: p[0], z: p[2], power: 0.62, color: [1, 0.74, 0.45], hide: true, bulbs: [p], glowY: p[1], kind: 'lamp', state: rng.chance(0.25) ? 'off' : rng.chance(0.1) ? 'flicker' : 'on', bulbSize: 0.6 });
        bulbs.push(p);
      }
    }
    D.solidRect(ns, -0.22, -0.2, 0.22, 0.2);
  }
  // Painting over the bed.
  painting(D, D.sub(o, far * (L / 2 - 0.0), 0, far > 0 ? -Math.PI / 2 : Math.PI / 2), rng.int(0, 3), 0, 1.95, 1.0, 0.7);
  // Wardrobe and desk along the side walls, nearer the door.
  for (const side of [-1, 1]) {
    const f = D.sub(o, -far * 0.3, side * W / 2, side > 0 ? Math.PI : 0);
    if (side === -1 && D.free(f, -0.55, 0, 0.55, 0.62)) {
      D.box('mahogany', f, 0, 1.0, 0.3, 1.1, 2.0, 0.58);
      D.box('darkwood', f, 0, 2.03, 0.3, 1.2, 0.08, 0.64);
      D.box('darkwood', f, 0, 1.0, 0.595, 0.012, 1.8, 0.01);
      for (const k of [-1, 1]) D.box('brass', f, k * 0.06, 1.1, 0.6, 0.02, 0.12, 0.02);
      D.solidRect(f, -0.56, 0, 0.56, 0.62);
    } else if (side === 1 && D.free(f, -0.6, 0, 0.6, 0.55)) {
      D.box('mahogany', f, 0, 0.74, 0.27, 1.1, 0.04, 0.5);
      for (const a of [-1, 1]) for (const b of [0.06, 0.48]) D.box('mahogany', f, a * 0.5, 0.37, b, 0.04, 0.74, 0.04);
      D.box('mirror', f, 0, 1.45, 0.02, 0.7, 0.9, 0.02);
      D.box('gold', f, 0, 1.45, 0.012, 0.78, 0.98, 0.012);
      D.box('paper', f, 0.2, 0.765, 0.25, 0.22, 0.01, 0.3);
      D.solidRect(f, -0.56, 0, 0.56, 0.52);
      const chair = D.sub(f, 0, 0.75, Math.PI);
      if (D.free(chair, -0.25, -0.25, 0.25, 0.25)) {
        D.box('velvetSeat', chair, 0, 0.45, 0, 0.44, 0.06, 0.42);
        D.box('mahogany', chair, 0, 0.75, -0.2, 0.44, 0.6, 0.04);
        for (const a of [-1, 1]) for (const b of [-1, 1]) D.box('mahogany', chair, a * 0.19, 0.22, b * 0.18, 0.04, 0.44, 0.04);
        D.solidRect(chair, -0.24, -0.24, 0.24, 0.24);
      }
    }
  }
  // A frosted bowl light in the middle of the ceiling.
  const [cx, , cz] = D.at(o, 0, 0, 0);
  const top = room.ceil ?? 3.4;
  D.cyl('brass', { x: cx, z: cz, rot: 0 }, [0, top, 0], [0, top - 0.06, 0], 0.16, 10, { caps: true });
  D.ball('shade', { x: cx, z: cz, rot: 0 }, [0, top - 0.08, 0], 0.2, 10, 4, 0.55);
  D.light({ x: cx, z: cz, power: 0.5, color: [1, 0.78, 0.5], hide: true, bulbs: [[cx, top - 0.14, cz]], glowY: top - 0.14, kind: 'ceiling', state: rng.chance(0.3) ? 'off' : rng.chance(0.1) ? 'flicker' : 'on', bulbSize: 0.6 });
  // Suites get a sofa.
  if (room.suite) {
    const sf = D.sub(o, -far * (L / 2 - 1.2), 0, far > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (D.free(sf, -1.0, -0.45, 1.0, 0.45)) sofa(D, sf, 1.8);
  }
  // Something left behind.
  if (rng.chance(0.3)) {
    const p = D.sub(o, rng.range(-L / 4, L / 4), rng.range(-W / 4, W / 4), rng.range(0, 6));
    if (D.free(p, -0.4, -0.25, 0.4, 0.25)) {
      D.box(rng.chance(0.5) ? 'leather' : 'leatherTan', p, 0, 0.12, 0, 0.75, 0.24, 0.48);
      D.solidRect(p, -0.38, -0.25, 0.38, 0.25);
    }
  }
  return { bulbs };
}

// The Beverly Room: parquet, mirrored walls between gilt pilasters, crystal
// chandeliers, round tables, a bandstand with nobody on it.
export function ballroom(D, room, ctx) {
  const { map, rng } = ctx;
  const cs = map.cellSize;
  const H = room.ceil;
  const doors = ctx.doorsOf(room);
  const fr = D.frame({ x: room.x, y: room.y, w: room.w, h: room.h, doors });
  const { o, L, W } = fr;
  const out = { bulbs: [], stage: null, ticks: [], bells: [] };
  // Stage at the end with fewest doors.
  const endOf = (dd) => {
    const [cx, cz] = map.cellCenter(dd.x, dd.y);
    const lx = (cx - o.x) * Math.cos(o.rot) - (cz - o.z) * Math.sin(o.rot);
    return lx;
  };
  const near = (sgn) => doors.filter((dd) => sgn * endOf(dd) > L / 2 - cs * 1.5).length;
  const sEnd = near(1) <= near(-1) ? 1 : -1;
  // Coffered ceiling: beams both ways, rosettes at the crossings.
  for (let x = -L / 2 + cs; x < L / 2 - 0.5; x += cs) beamZ(D, 'beam', o, -W / 2, W / 2, x, H, 0.22, 0.34, 1.2);
  for (let z = -W / 2 + cs; z < W / 2 - 0.5; z += cs) beamX(D, 'beam', o, -L / 2, L / 2, z, H - 0.02, 0.2, 0.3, 1.2);
  for (let x = -L / 2 + cs; x < L / 2 - 0.5; x += cs) for (let z = -W / 2 + cs; z < W / 2 - 0.5; z += cs) D.cyl('gold', o, [x, H - 0.36, z], [x, H - 0.33, z], 0.2, 10, { caps: true });
  // Walls: pilasters at every cell boundary, mirrors and drapes between.
  const segs = [];
  for (const [x, y] of room.cells) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (map.inBounds(nx, ny) && ctx.layout.roomOf[map.idx(nx, ny)] === room.id) continue;
      segs.push({ x, y, d, wall: map.getEdge(map.edge(x, y, d)) === EDGE_WALL, f: faceFrame(map, x, y, d) });
    }
  }
  for (const s of segs) {
    const f = s.f;
    D.box('gold', f, -cs / 2 + 0.2, H / 2, 0.06, 0.4, H, 0.12);
    D.box('darkwood', f, 0, 0.14, 0.015, cs, 0.28, 0.03);
    const fh = 0.8;
    D.quad('frieze', f, [[-cs / 2, H - 0.3 - fh, 0.01], [cs / 2, H - 0.3 - fh, 0.01], [cs / 2, H - 0.3, 0.01], [-cs / 2, H - 0.3, 0.01]], [0, 0, 1], [[0, 0], [cs / 3.2, 0], [cs / 3.2, 1], [0, 1]]);
    D.box('darkwood', f, 0, H - 0.15, 0.08, cs, 0.3, 0.16);
    if (!s.wall) continue;
    if ((s.x + s.y) % 2 === 0) {
      // Tall mirror in a gilt frame.
      D.box('mirror', f, 0.1, 2.4, 0.02, 1.7, 3.4, 0.02);
      D.box('gold', f, 0.1, 2.4, 0.012, 1.9, 3.6, 0.012);
      D.box('gold', f, 0.1, 4.25, 0.04, 1.2, 0.18, 0.06);
    } else {
      // Velvet drapes, tied back.
      for (const k of [-1, 1]) for (let j = 0; j < 4; j++) D.cyl('velvet', f, [0.1 + k * (0.55 + j * 0.12), 0, 0.12], [0.1 + k * (0.75 + j * 0.06), H - 1.3, 0.1], 0.07, 6);
      D.box('velvet', f, 0.1, H - 1.25, 0.12, cs - 0.5, 0.35, 0.1);
      const p = lanternSconce(D, D.sub(f, 0.1, 0, 0), 2.6);
      D.light({ x: p[0], z: p[2], power: 0.46, color: WARM, hide: true, bulbs: [p], glowY: p[1], kind: 'sconce', state: rng.chance(0.1) ? 'flicker' : 'on' });
    }
  }
  // Crystal chandeliers down the middle.
  const n = Math.max(2, Math.round(L / (cs * 2.5)));
  for (let k = 0; k < n; k++) {
    const x = -L / 2 + (k + 0.5) * (L / n) - sEnd * 0.8;
    const [wx, , wz] = D.at(o, x, 0, 0);
    const c = crystalChandelier(D, wx, wz, H, 2.8);
    D.light({ x: wx, z: wz, power: 1.7, color: [1, 0.78, 0.5], hide: true, bulbs: c.bulbs, glowY: c.glowY, kind: 'chandelier', state: rng.chance(0.08) ? 'flicker' : 'on', bulbSize: 0.45 });
  }
  // The bandstand.
  const sd = 3.0, sx = sEnd * (L / 2 - sd / 2);
  const st = D.sub(o, sx, 0, sEnd > 0 ? -Math.PI / 2 : Math.PI / 2); // local +z faces the floor
  const sw = W - 1.6;
  D.box('parquetDark', st, 0, 0.29, 0, sw, 0.58, sd);
  D.box('gold', st, 0, 0.57, sd / 2 + 0.01, sw, 0.03, 0.03);
  D.box('velvet', st, 0, 0.27, sd / 2 + 0.005, sw, 0.5, 0.01);
  for (let k = 0; k < 2; k++) D.box('parquetDark', st, 0, 0.1 + k * 0.19, sd / 2 + 0.2 + (1 - k) * 0.2, 2.0, 0.2 + k * 0.19, 0.4 - k * 0.2);
  D.solidRect(st, -sw / 2, -sd / 2, sw / 2, sd / 2 + 0.6);
  // Backdrop: velvet folds and a deco sunburst.
  for (let z = -sw / 2; z < sw / 2; z += 0.22) D.cyl('velvet', st, [z, 0.58, -sd / 2 + 0.12], [z, H - 0.6, -sd / 2 + 0.12], 0.12, 6);
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI;
    D.cyl('gold', st, [0, 3.0, -sd / 2 + 0.28], [Math.cos(a) * 1.6, 3.0 + Math.sin(a) * 1.6, -sd / 2 + 0.28], 0.03, 4);
  }
  D.quad('signs', st, [[-1.2, 4.9, -sd / 2 + 0.3], [1.2, 4.9, -sd / 2 + 0.3], [1.2, 5.5, -sd / 2 + 0.3], [-1.2, 5.5, -sd / 2 + 0.3]], [0, 0, 1], [[0, 1 - 2 / L5_SIGNS], [1, 1 - 2 / L5_SIGNS], [1, 1 - 1 / L5_SIGNS], [0, 1 - 1 / L5_SIGNS]]);
  // Grand piano, stage left.
  const pi = D.sub(st, -sw / 2 + 1.6, -0.2, 0.5);
  const py = 0.58;
  for (const [a, b] of [[-0.6, 0.5], [0.6, 0.5], [0, -0.9]]) D.cyl('black', pi, [a, py, b], [a, py + 0.62, b], 0.05, 6);
  D.box('black', pi, 0, py + 0.75, 0.2, 1.45, 0.28, 0.9);
  D.cyl('black', pi, [0.15, py + 0.62, -0.25], [0.15, py + 0.9, -0.25], 0.6, 12, { caps: true });
  D.box('ivory', pi, 0, py + 0.78, 0.72, 1.3, 0.04, 0.16);
  for (let k = 0; k < 18; k++) D.box('black', pi, -0.6 + k * 0.072, py + 0.805, 0.68, 0.025, 0.02, 0.08);
  D.box('black', pi, 0, py + 0.48, 1.1, 0.7, 0.06, 0.32);
  // Double bass on its stand, drums stage right, a microphone.
  const ba = D.sub(st, -0.4, -0.5, 0);
  D.ball('woodBass', ba, [0, py + 0.65, 0], 0.32, 10, 6, 1.5);
  D.ball('woodBass', ba, [0, py + 1.15, 0], 0.24, 10, 6, 1.3);
  D.cyl('black', ba, [0, py + 1.3, 0.05], [0, py + 2.0, 0.06], 0.025, 5);
  D.ball('black', ba, [0, py + 2.02, 0.06], 0.04, 6, 4, 1.4);
  D.cyl('black', ba, [0, py, 0], [0, py + 0.35, 0], 0.012, 4);
  const dr = D.sub(st, sw / 2 - 1.6, -0.3, -0.4);
  D.cyl('drum', dr, [0, py + 0.32, -0.25], [0, py + 0.32, 0.25], 0.32, 14, { caps: true });
  D.cyl('drum', dr, [0.65, py + 0.1, 0.1], [0.65, py + 0.55, 0.1], 0.2, 12, { caps: true });
  D.cyl('drum', dr, [-0.2, py + 0.72, 0.35], [-0.2, py + 0.88, 0.35], 0.16, 12, { caps: true });
  D.cyl('drum', dr, [0.25, py + 0.75, 0.35], [0.25, py + 0.9, 0.35], 0.17, 12, { caps: true });
  for (const [x, z, h] of [[-0.7, 0.4, 1.4], [0.9, 0.5, 1.5], [0.5, -0.3, 1.0]]) {
    D.cyl('chrome', dr, [x, py, z], [x, py + h, z], 0.012, 4);
    D.cyl('brass', dr, [x, py + h, z], [x, py + h + 0.015, z], 0.22, 14, { caps: true });
  }
  const mic = D.sub(st, 0.6, 0.9, 0);
  D.cyl('chrome', mic, [0, py, 0], [0, py + 1.55, 0], 0.012, 4);
  D.cone('chrome', mic, [0, py, 0], [0, py + 0.03, 0], 0.16, 0.14, 8);
  D.ball('chrome', mic, [0, py + 1.6, 0], 0.05, 8, 5, 1.3);
  for (let k = 0; k < 3; k++) {
    const ms = D.sub(st, -1.0 + k * 1.1, 0.1, 0);
    D.cyl('black', ms, [0, py, 0], [0, py + 1.1, 0], 0.01, 4);
    D.box('black', ms, 0, py + 1.15, 0.05, 0.45, 0.3, 0.02);
    D.box('gold', ms, 0, py + 1.15, 0.062, 0.3, 0.16, 0.002);
  }
  const [stx, , stz] = D.at(st, 0, 0, 0);
  out.stage = { x: stx, z: stz };
  // Footlights.
  const foot = [];
  for (let x = -sw / 2 + 0.4; x < sw / 2; x += 0.5) {
    D.box('brass', st, x, 0.6, sd / 2 - 0.08, 0.14, 0.06, 0.08);
    foot.push(D.at(st, x, 0.66, sd / 2 - 0.08));
  }
  const [lx, , lz] = D.at(st, 0, 0, 1.0);
  D.light({ x: lx, z: lz, power: 0.8, color: [1, 0.7, 0.42], hide: true, kind: 'stage', bulbs: foot, glowY: 0.66, bulbSize: 0.35 });
  // Round tables along the long walls; the floor between left clear for dancing.
  const zt = W / 2 - 2.2;
  for (let x = -L / 2 + 2.2 - (sEnd < 0 ? -sd : 0); x < L / 2 - 2.0 - (sEnd > 0 ? sd : 0); x += 3.2) {
    for (const s of [-1, 1]) {
      const t = D.sub(o, x, s * zt, rng.range(0, 1));
      if (!D.free(t, -1.25, -1.25, 1.25, 1.25)) continue;
      roundTable(D, t, rng, true);
    }
  }
  // The drinks table and the mahjong table.
  const dt = D.sub(o, -sEnd * (L / 2 - 2.4), -W / 2 + 0.9, 0);
  if (D.free(dt, -1.4, -0.5, 1.4, 0.5)) drinksTable(D, dt, rng);
  const mj = D.sub(o, -sEnd * (L / 2 - 4.5), 1.2, 0.3);
  if (D.free(mj, -1.2, -1.2, 1.2, 1.2)) mahjongTable(D, mj, rng);
  return out;
}

export function roundTable(D, t, rng, chairs) {
  D.cone('linen', t, [0, 0, 0], [0, 0.74, 0], 0.82, 0.72, 16);
  D.cyl('linen', t, [0, 0.74, 0], [0, 0.76, 0], 0.74, 16, { caps: true });
  D.cyl('crystal', t, [0, 0.76, 0], [0, 0.98, 0], 0.025, 6);
  D.cyl('wax', t, [0, 0.98, 0], [0, 1.08, 0], 0.012, 5);
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2) + 0.4;
    D.cyl('plate', t, [Math.cos(a) * 0.5, 0.76, Math.sin(a) * 0.5], [Math.cos(a) * 0.5, 0.775, Math.sin(a) * 0.5], 0.12, 10, { caps: true });
    D.cyl('crystal', t, [Math.cos(a + 0.3) * 0.5, 0.76, Math.sin(a + 0.3) * 0.5], [Math.cos(a + 0.3) * 0.5, 0.9, Math.sin(a + 0.3) * 0.5], 0.028, 6);
    if (!chairs || rng.chance(0.15)) continue;
    const ch = D.sub(t, Math.cos(a) * 1.0, Math.sin(a) * 1.0, Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI + rng.range(-0.3, 0.3));
    D.box('velvetSeat', ch, 0, 0.46, 0, 0.42, 0.06, 0.42);
    for (const a2 of [-1, 1]) for (const b of [-1, 1]) D.cyl('gold', ch, [a2 * 0.18, 0, b * 0.18], [a2 * 0.18, 0.46, b * 0.18], 0.015, 4);
    for (const a2 of [-1, 1]) D.cyl('gold', ch, [a2 * 0.18, 0.46, -0.18], [a2 * 0.18, 1.0, -0.2], 0.015, 4);
    for (const yy of [0.7, 0.85, 1.0]) D.cyl('gold', ch, [-0.18, yy, -0.19], [0.18, yy, -0.19], 0.012, 4);
  }
  D.solidRect(t, -0.85, -0.85, 0.85, 0.85);
}

function drinksTable(D, t, rng) {
  D.box('linen', t, 0, 0.75, 0, 2.6, 0.04, 0.8);
  D.box('linen', t, 0, 0.38, 0.4, 2.6, 0.74, 0.01);
  D.box('linen', t, 0, 0.38, -0.4, 2.6, 0.74, 0.01);
  for (const s of [-1, 1]) D.box('linen', t, s * 1.3, 0.38, 0, 0.01, 0.74, 0.8);
  D.ball('crystal', t, [0, 0.9, 0], 0.26, 12, 5, 0.6);
  D.cyl('punch', t, [0, 0.9, 0], [0, 0.91, 0], 0.24, 12, { caps: true });
  for (let k = 0; k < 14; k++) D.cyl('crystal', t, [-1.1 + (k % 7) * 0.12, 0.77, -0.2 + Math.floor(k / 7) * 0.12], [-1.1 + (k % 7) * 0.12, 0.89, -0.2 + Math.floor(k / 7) * 0.12], 0.03, 6);
  for (let k = 0; k < 5; k++) {
    const x = 0.6 + k * 0.13;
    D.cyl('bottle', t, [x, 0.77, 0.1], [x, 1.05, 0.1], 0.038, 7);
    D.cyl('bottle', t, [x, 1.05, 0.1], [x, 1.16, 0.1], 0.013, 5);
  }
  D.solidRect(t, -1.32, -0.42, 1.32, 0.42);
}

// Mahjong: a game left mid-hand, walls of tiles, four empty chairs.
function mahjongTable(D, t, rng) {
  for (const a of [-1, 1]) for (const b of [-1, 1]) D.box('darkwood', t, a * 0.42, 0.36, b * 0.42, 0.06, 0.72, 0.06);
  D.box('darkwood', t, 0, 0.74, 0, 1.0, 0.05, 1.0);
  D.box('felt', t, 0, 0.768, 0, 0.88, 0.006, 0.88);
  const tile = (x, z, rot, up, k) => {
    const f = D.sub(t, x, z, rot);
    const u0 = (k % 8) / 8, u1 = u0 + 1 / 8;
    if (up) {
      D.box('ivory', f, 0, 0.792, 0, 0.034, 0.045, 0.026);
      D.quad('mahjong', f, [[-0.017, 0.773, 0.0135], [0.017, 0.773, 0.0135], [0.017, 0.814, 0.0135], [-0.017, 0.814, 0.0135]], [0, 0, 1], [[u0, 0.33], [u1, 0.33], [u1, 1], [u0, 1]]);
    } else {
      D.box('mahjongBack', f, 0, 0.782, 0, 0.034, 0.024, 0.045);
    }
  };
  for (let side = 0; side < 4; side++) {
    const rot = side * Math.PI / 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let k = 0; k < 9; k++) {
      const lx = -0.16 + k * 0.036, lz = 0.2;
      tile(lx * c + lz * s, -lx * s + lz * c, rot, false, k);
      // Each player's hand, standing up at the edge.
      const hz = 0.37;
      if (k < 8) tile(lx * c + hz * s, -lx * s + hz * c, rot, true, (k * 3 + side) % 8);
    }
  }
  for (let k = 0; k < 6; k++) tile(rng.range(-0.1, 0.1), rng.range(-0.1, 0.1), rng.range(0, 6), false, k);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    const ch = D.sub(t, Math.sin(a) * 0.85, Math.cos(a) * 0.85, a + Math.PI + rng.range(-0.2, 0.2));
    D.box('velvetSeat', ch, 0, 0.46, 0, 0.42, 0.06, 0.42);
    for (const a2 of [-1, 1]) for (const b of [-1, 1]) D.box('darkwood', ch, a2 * 0.18, 0.23, b * 0.18, 0.04, 0.46, 0.04);
    D.box('darkwood', ch, 0, 0.8, -0.2, 0.42, 0.6, 0.04);
  }
  D.solidRect(t, -1.1, -1.1, 1.1, 1.1);
}

// The Homely Hotel's dining room: a reception desk, tables set for dinner,
// a buffet with real food on it.
export function homely(D, room, ctx) {
  const out = lobby(D, room, ctx);
  const { rng } = ctx;
  const fr = D.frame({ x: room.x, y: room.y, w: room.w, h: room.h, doors: [] });
  const { o, L, W } = fr;
  out.food = [];
  // Dining tables in the middle.
  for (const x of [-L / 4, L / 4]) {
    for (const z of [-W / 4, W / 4]) {
      const t = D.sub(o, x, z, 0);
      if (D.free(t, -1.2, -1.2, 1.2, 1.2)) roundTable(D, t, rng, true);
    }
  }
  // Buffet against a wall, with meat under the cloches.
  const segs = [];
  for (const [x, y] of room.cells) {
    for (let d = 0; d < 4; d++) {
      if (ctx.map.getEdge(ctx.map.edge(x, y, d)) !== EDGE_WALL) continue;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (ctx.map.inBounds(nx, ny) && ctx.layout.roomOf[ctx.map.idx(nx, ny)] === room.id) continue;
      segs.push(faceFrame(ctx.map, x, y, d));
    }
  }
  rng.shuffle(segs);
  let signed = false;
  for (const f of segs) {
    if (!signed) {
      sign(D, f, 0, 0, 2.7, 0.9, 0.22);
      signed = true;
      continue;
    }
    if (!D.free(f, -1.3, 0, 1.3, 0.85)) continue;
    D.box('linen', f, 0, 0.78, 0.42, 2.4, 0.04, 0.7);
    D.box('linen', f, 0, 0.4, 0.77, 2.4, 0.76, 0.01);
    for (const s of [-1, 1]) D.box('linen', f, s * 1.2, 0.4, 0.42, 0.01, 0.76, 0.7);
    for (let k = 0; k < 3; k++) {
      const x = -0.75 + k * 0.75;
      D.cyl('plate', f, [x, 0.8, 0.42], [x, 0.815, 0.42], 0.24, 12, { caps: true });
      if (k === 1) {
        D.ball('chrome', f, [x, 0.815, 0.42], 0.2, 10, 4, 0.7);
      } else {
        D.ball('meat', f, [x, 0.86, 0.42], 0.13, 8, 5, 0.55);
        D.ball('meat', f, [x + 0.08, 0.85, 0.36], 0.08, 7, 4, 0.6);
      }
    }
    D.solidRect(f, -1.22, 0, 1.22, 0.8);
    const [fx, , fz] = D.at(f, 0, 0, 1.0);
    out.food.push({ x: fx, z: fz, left: 3 });
    break;
  }
  return out;
}

// M.E.G. Housekeeping: shelves of linen, carts, crates of supplies, a cot.
export function housekeeping(D, room, ctx) {
  const { map, rng } = ctx;
  const doors = room.doors.map((d) => ({ x: d.x, y: d.y, d: d.d }));
  const fr = D.frame({ x: room.x, y: room.y, w: room.w, h: room.h, doors });
  const { o, L, W } = fr;
  const out = { crates: [], note: null };
  // Shelving along one long wall.
  const sh = D.sub(o, 0, -W / 2, 0);
  for (let x = -L / 2 + 0.8; x < L / 2 - 0.6; x += 1.3) {
    const f = D.sub(sh, x, 0, 0);
    if (!D.free(f, -0.6, 0, 0.6, 0.5)) continue;
    for (const a of [-1, 1]) for (const b of [0.05, 0.45]) D.box('steel', f, a * 0.58, 1.0, b, 0.04, 2.0, 0.04);
    for (let k = 0; k < 4; k++) {
      D.box('steel', f, 0, 0.15 + k * 0.55, 0.25, 1.2, 0.03, 0.46);
      for (let j = 0; j < 4; j++) if (rng.chance(0.75)) D.box(rng.chance(0.8) ? 'linen' : 'towel', f, -0.42 + j * 0.28, 0.24 + k * 0.55, 0.25, 0.25, rng.range(0.1, 0.18), 0.36);
    }
    D.solidRect(f, -0.62, 0, 0.62, 0.5);
  }
  // A cot, a cart, crates.
  const cot = D.sub(o, L / 2 - 1.2, W / 2 - 0.5, 0);
  if (D.free(cot, -1.0, -0.38, 1.0, 0.38)) {
    D.box('olive', cot, 0, 0.4, 0, 1.9, 0.08, 0.7);
    for (const a of [-1, 1]) for (const b of [-1, 1]) D.box('steel', cot, a * 0.9, 0.2, b * 0.32, 0.03, 0.4, 0.03);
    D.box('linen', cot, -0.7, 0.48, 0, 0.36, 0.1, 0.5);
    D.solidRect(cot, -1.0, -0.38, 1.0, 0.38);
  }
  const cart = D.sub(o, -L / 2 + 1.0, W / 2 - 0.6, 0.2);
  if (D.free(cart, -0.6, -0.35, 0.6, 0.35)) {
    D.box('steel', cart, 0, 0.5, 0, 1.0, 0.03, 0.5);
    D.box('steel', cart, 0, 0.15, 0, 1.0, 0.03, 0.5);
    D.box('canvas', cart, 0.25, 0.75, 0, 0.45, 0.5, 0.45);
    for (const a of [-1, 1]) for (const b of [-1, 1]) D.cyl('steel', cart, [a * 0.48, 0.05, b * 0.23], [a * 0.48, 0.95, b * 0.23], 0.012, 4);
    D.box('linen', cart, -0.25, 0.6, 0, 0.4, 0.16, 0.4);
    D.box('bottleBlue', cart, -0.3, 0.75, 0.1, 0.08, 0.22, 0.08);
    D.solidRect(cart, -0.55, -0.3, 0.55, 0.3);
  }
  for (let k = 0; k < 2; k++) {
    const p = D.sub(o, rng.range(-L / 4, L / 4), rng.range(-0.3, 0.6), rng.range(0, 1.5));
    if (!D.free(p, -0.4, -0.4, 0.4, 0.4)) continue;
    const [x, , z] = D.at(p, 0, 0, 0);
    out.crates.push({ x, z, rot: p.rot, size: 0.6 });
    D.solidRect(p, -0.32, -0.32, 0.32, 0.32);
  }
  const [nx, , nz] = D.at(o, 0, 0, 0);
  out.note = { x: nx, z: nz };
  // The sign by the door, outside.
  for (const dd of room.doors) {
    const f = faceFrame(map, dd.x + DIRS[dd.d][0], dd.y + DIRS[dd.d][1], dd.d ^ 1);
    sign(D, D.sub(f, 0, 0, 0), 3, 0, 2.75, 0.62, 0.15, 0.02);
  }
  const [lx, , lz] = D.at(o, 0, 0, 0);
  D.light({ x: lx, z: lz, power: 0.55, color: [0.95, 0.9, 0.8], hide: true, kind: 'housekeeping', bulbs: [[lx, room.ceil - 0.35, lz]], glowY: room.ceil - 0.35, bulbSize: 0.7 });
  D.cyl('brass', { x: lx, z: lz, rot: 0 }, [0, room.ceil, 0], [0, room.ceil - 0.3, 0], 0.01, 4);
  D.cone('enamelLamp', { x: lx, z: lz, rot: 0 }, [0, room.ceil - 0.28, 0], [0, room.ceil - 0.42, 0], 0.06, 0.24, 10);
  return out;
}
