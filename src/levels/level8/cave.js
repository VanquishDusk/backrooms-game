import * as THREE from 'three';
import { createNoise2D } from '../../core/rng.js?v=20261101b';
import { GridMap, EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js?v=20261101b';

// Level 8's caves, laid out on a grid of 2 m corners. Each corner is rock or
// air. Named caverns are blobs of air, joined by winding tunnels; marching
// squares turns the rock/air boundary into rough walls. Floor and ceiling
// heights come from the caverns (tall, with basins for the lakes) and noise.

export const CS = 2;
export const N = 150; // corners per side
export const WATER = -0.9; // resting water level

export const ZONES = {
  spawn: { name: 'THE FLOODED MOUTH', x: 40, z: 150, r: 11, floor: 0, h: 7 },
  lake: { name: 'THE ALMOND LAKE', x: 86, z: 140, r: 24, floor: 0, h: 13, basin: -2.6 },
  jungle: { name: 'ROTTNEST JUNGLE', x: 150, z: 222, r: 36, floor: 0, h: 22 },
  movile: { name: 'NEW MOVILE CAVE', x: 226, z: 250, r: 20, floor: -0.2, h: 9, basin: -1.3 },
  kav: { name: 'KAVRAGOST', x: 200, z: 118, r: 22, floor: 0, h: 11 },
  hands: { name: 'HANDYLAND', x: 238, z: 48, r: 32, floor: 0, h: 20 },
  road: { name: 'THE END OF THE 9TH ROAD', x: 92, z: 40, r: 9, floor: 0, h: 6 },
};

// Tunnels: [from, to, half-width, kind].
const TUNNELS = [
  ['spawn', 'lake', 3.0, 'plain'],
  ['lake', 'jungle', 3.2, 'plain'],
  ['jungle', 'movile', 2.8, 'plain'],
  ['lake', 'kav', 2.8, 'lane'],
  ['kav', 'hands', 3.2, 'plain'],
  ['kav', 'road', 3.0, 'road'],
  ['jungle', 'kav', 2.6, 'plain'],
];

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function generateCave(rng) {
  const noise = createNoise2D(rng.fork('cave'));
  const noise2 = createNoise2D(rng.fork('cave2'));
  const zones = {};
  for (const [k, z] of Object.entries(ZONES)) zones[k] = { ...z, key: k, x: z.x + rng.range(-6, 6), z: z.z + rng.range(-6, 6) };

  // Tunnel centrelines: wavy polylines.
  const tunnels = TUNNELS.map(([a, b, hw, kind]) => {
    const A = zones[a], B = zones[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const n = Math.ceil(len / 3);
    const px = -(B.z - A.z) / len, pz = (B.x - A.x) / len;
    const amp = kind === 'lane' ? 22 : 12, ph = rng.range(0, 10);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const off = Math.sin(t * Math.PI) * ((noise(t * 3 + ph, ph) - 0.5) * 2 * amp + Math.sin(t * Math.PI * (kind === 'lane' ? 5 : 2) + ph) * amp * 0.5);
      pts.push({ x: A.x + (B.x - A.x) * t + px * off, z: A.z + (B.z - A.z) * t + pz * off });
    }
    return { a, b, hw, kind, pts };
  });
  // A few dead-end side passages, for getting lost in.
  for (let k = 0; k < 9; k++) {
    const t = rng.pick(tunnels.slice(0, 7));
    const p0 = rng.pick(t.pts);
    let a = rng.range(0, Math.PI * 2), x = p0.x, z = p0.z;
    const pts = [{ x, z }];
    for (let s = 0; s < rng.int(10, 22); s++) {
      a += rng.range(-0.6, 0.6);
      x = Math.max(10, Math.min(N * CS - 10, x + Math.cos(a) * 3));
      z = Math.max(10, Math.min(N * CS - 10, z + Math.sin(a) * 3));
      pts.push({ x, z });
    }
    tunnels.push({ hw: rng.range(1.5, 2.2), kind: 'side', pts });
  }

  const distSeg = (x, z, p, q) => {
    const dx = q.x - p.x, dz = q.z - p.z;
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - p.x - dx * t, z - p.z - dz * t);
  };
  const tunnelDist = (t, x, z) => {
    let d = Infinity;
    for (let k = 0; k < t.pts.length - 1; k++) d = Math.min(d, distSeg(x, z, t.pts[k], t.pts[k + 1]));
    return d;
  };

  // ---- Air or rock at every corner -----------------------------------------------
  const V = N + 1;
  const air = new Uint8Array(V * V);
  const zoneOf = new Int8Array(V * V).fill(-1);
  const kindOf = new Uint8Array(V * V); // 1 lane, 2 road
  const zkeys = Object.keys(zones);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = i * CS, z = j * CS;
    if (i < 3 || j < 3 || i > V - 4 || j > V - 4) continue;
    const wob = (noise(x / 14, z / 14) - 0.5) * 7 + (noise2(x / 5, z / 5) - 0.5) * 2.5;
    let open = false;
    zkeys.forEach((k, zi) => {
      const Z = zones[k];
      if (Math.hypot(x - Z.x, z - Z.z) < Z.r + wob) {
        open = true;
        zoneOf[j * V + i] = zi;
      }
    });
    for (const t of tunnels) {
      if (tunnelDist(t, x, z) < t.hw + wob * 0.15) {
        open = true;
        if (t.kind === 'lane') kindOf[j * V + i] = 1;
        if (t.kind === 'road') kindOf[j * V + i] = 2;
      }
    }
    air[j * V + i] = open ? 1 : 0;
  }
  // Rock pillars in the big caverns.
  for (const k of ['jungle', 'hands', 'lake']) {
    const Z = zones[k];
    for (let p = 0; p < (k === 'lake' ? 2 : 5); p++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(Z.r * 0.3, Z.r * 0.7), pr = rng.range(1.6, 3.4);
      const px = Z.x + Math.cos(a) * r, pz = Z.z + Math.sin(a) * r;
      for (let j = Math.floor((pz - pr) / CS); j <= Math.ceil((pz + pr) / CS); j++) for (let i = Math.floor((px - pr) / CS); i <= Math.ceil((px + pr) / CS); i++) {
        if (i < 0 || j < 0 || i >= V || j >= V) continue;
        if (Math.hypot(i * CS - px, j * CS - pz) < pr) air[j * V + i] = 0;
      }
    }
  }
  // Smooth (cellular automaton), then keep only what you can reach from the spawn.
  for (let pass = 0; pass < 2; pass++) {
    const next = air.slice();
    for (let j = 1; j < V - 1; j++) for (let i = 1; i < V - 1; i++) {
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) n += air[(j + dj) * V + i + di];
      next[j * V + i] = n >= 5 ? 1 : n <= 3 ? 0 : air[j * V + i];
    }
    air.set(next);
  }
  {
    const seen = new Uint8Array(V * V);
    const s = Math.round(zones.spawn.z / CS) * V + Math.round(zones.spawn.x / CS);
    const q = [s];
    seen[s] = 1;
    while (q.length) {
      const c = q.pop();
      const i = c % V, j = (c / V) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= V || nj >= V) continue;
        const k = nj * V + ni;
        if (seen[k] || !air[k]) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    for (let k = 0; k < air.length; k++) if (!seen[k]) air[k] = 0;
  }

  // ---- Heights ---------------------------------------------------------------------
  function weights(x, z) {
    let wsum = 0, f = 0, h = 0, basin = 0;
    for (const k of zkeys) {
      const Z = zones[k];
      const d = Math.hypot(x - Z.x, z - Z.z);
      const w = smooth(Z.r + 14, Z.r * 0.4, d);
      if (w <= 0) continue;
      wsum += w;
      f += w * Z.floor;
      h += w * Z.h;
      if (Z.basin) basin = Math.min(basin, Z.basin * smooth(Z.r * 0.95, Z.r * 0.25, d));
    }
    const t = Math.min(1, wsum);
    return { f: (wsum ? f / wsum : 0) * t, h: 4.4 * (1 - t) + (wsum ? h / wsum : 4.4) * t, basin };
  }
  const floorH = new Float32Array(V * V), ceilH = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = i * CS, z = j * CS;
    const w = weights(x, z);
    let f = w.f + (noise(x / 9 + 50, z / 9) - 0.5) * 0.5 + w.basin;
    // The spawn pool: a deep hole down into the water you came up through.
    const ds = Math.hypot(x - zones.spawn.x, z - zones.spawn.z);
    if (ds < 6) f = Math.min(f, -0.4 - 3 * smooth(6, 2.5, ds));
    floorH[j * V + i] = f;
    ceilH[j * V + i] = f + w.h * (0.75 + noise2(x / 18, z / 18) * 0.5) + (noise(x / 4, z / 4) - 0.5) * 1.2;
  }
  const bilerp = (arr, x, z) => {
    const fi = Math.max(0, Math.min(V - 1.001, x / CS)), fj = Math.max(0, Math.min(V - 1.001, z / CS));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = arr[j * V + i], b = arr[j * V + i + 1], c = arr[(j + 1) * V + i], d = arr[(j + 1) * V + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  const floorAt = (x, z) => bilerp(floorH, x, z);
  const ceilAt = (x, z) => bilerp(ceilH, x, z);
  const isAir = (i, j) => i >= 0 && j >= 0 && i < V && j < V && air[j * V + i] === 1;

  // ---- A grid for the entities to walk on ---------------------------------------------
  const map = new GridMap(N, N, CS, 4);
  const walk = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const n = isAir(i, j) + isAir(i + 1, j) + isAir(i, j + 1) + isAir(i + 1, j + 1);
    // Not in deep water.
    walk[j * N + i] = n >= 3 && floorAt((i + 0.5) * CS, (j + 0.5) * CS) > WATER - 0.3 ? 1 : 0;
  }
  const W = (i, j) => (i >= 0 && j >= 0 && i < N && j < N ? walk[j * N + i] : 0);
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, W(x, y - 1) && W(x, y) ? EDGE_OPEN : EDGE_WALL);
  for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, W(x - 1, y) && W(x, y) ? EDGE_OPEN : EDGE_WALL);

  const zoneAt = (x, z) => {
    let best = null, bd = Infinity;
    for (const k of zkeys) {
      const Z = zones[k];
      const d = Math.hypot(x - Z.x, z - Z.z) - Z.r;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return bd < 4 ? best : null;
  };
  const kindAt = (x, z) => {
    const i = Math.round(x / CS), j = Math.round(z / CS);
    return i >= 0 && j >= 0 && i < V && j < V ? kindOf[j * V + i] : 0;
  };

  return { V, air, isAir, floorAt, ceilAt, zones, tunnels, map, walk, zoneAt, kindAt, noise };
}

// ---- Meshes -------------------------------------------------------------------------------

// Marching squares: segments (as pairs of edge indices 0 top, 1 right, 2 bottom, 3 left) per case.
const CASES = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[1, 0]], [[3, 0], [1, 2]], [[2, 0]], [[3, 0]], [[0, 3]], [[0, 2]], [[0, 1], [2, 3]], [[0, 1]], [[1, 3]], [[1, 2]], [[2, 3]], []];

export function buildCaveMeshes(cave, M) {
  const { V, isAir, floorAt, ceilAt, noise } = cave;
  const CH = 25; // cells per chunk
  const chunks = new Map();
  const get = (i, j, key) => {
    const k = `${key}|${Math.floor(i / CH)},${Math.floor(j / CH)}`;
    if (!chunks.has(k)) chunks.set(k, { key, pos: [], uv: [], col: [], idx: [] });
    return chunks.get(k);
  };
  // Rough rock: push points around by a smooth 3D-ish noise field.
  const disp = (x, y, z) => [
    (noise(x / 3.1 + y * 0.21, z / 3.1) - 0.5) * 1.1 + (noise(x / 1.1, z / 1.1 + y * 0.4) - 0.5) * 0.35,
    (noise(z / 3.3 + 17, x / 3.3 + y * 0.19) - 0.5) * 1.1 + (noise(z / 1.2 + 9, x / 1.2 + y * 0.37) - 0.5) * 0.35,
  ];
  const tint = (x, z, base) => {
    const n = noise(x / 7 + 3, z / 7 + 11);
    return [base[0] * (0.8 + n * 0.4), base[1] * (0.8 + n * 0.4), base[2] * (0.8 + n * 0.4)];
  };
  const zoneTint = (x, z) => {
    const zn = cave.zoneAt(x, z);
    if (zn === 'movile') return [0.95, 0.92, 0.7];
    if (zn === 'hands') return [0.95, 0.8, 0.78];
    if (zn === 'jungle') return [0.8, 0.95, 0.9];
    if (cave.kindAt(x, z) === 1) return [0.75, 0.85, 1.0];
    return [1, 1, 1];
  };
  for (let j = 0; j < V - 1; j++) for (let i = 0; i < V - 1; i++) {
    const a = isAir(i, j), b = isAir(i + 1, j), c = isAir(i + 1, j + 1), d = isAir(i, j + 1);
    const nAir = a + b + c + d;
    if (!nAir) continue;
    const x0 = i * CS, z0 = j * CS;
    // Floor and ceiling quads.
    for (const [key, hf, sign] of [['floor', floorAt, 1], ['ceil', ceilAt, -1]]) {
      const ch = get(i, j, key);
      const base = ch.pos.length / 3;
      for (const [x, z] of [[x0, z0], [x0 + CS, z0], [x0 + CS, z0 + CS], [x0, z0 + CS]]) {
        ch.pos.push(x, hf(x, z), z);
        ch.uv.push(x / 4, z / 4);
        const t = zoneTint(x, z);
        const col = tint(x, z, t);
        ch.col.push(...col);
      }
      if (sign > 0) ch.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else ch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (nAir === 4) continue;
    // Walls along the rock/air boundary.
    const code = (a ? 0 : 8) | (b ? 0 : 4) | (c ? 0 : 2) | (d ? 0 : 1);
    const mid = [[x0 + CS / 2, z0], [x0 + CS, z0 + CS / 2], [x0 + CS / 2, z0 + CS], [x0, z0 + CS / 2]];
    for (const [e1, e2] of CASES[code]) {
      const P = mid[e1], Q = mid[e2];
      const ch = get(i, j, 'wall');
      const R = 6;
      const base = ch.pos.length / 3;
      for (const [px, pz] of [P, Q]) {
        const f = floorAt(px, pz) - 0.8, cl = ceilAt(px, pz) + 0.8;
        for (let k = 0; k <= R; k++) {
          const t = k / R;
          const y = f + (cl - f) * t;
          // Overhangs: walls lean in near the top and bottom.
          const [dx, dz] = disp(px, y, pz);
          const lean = Math.sin(t * Math.PI) * 0.4;
          ch.pos.push(px + dx * (0.6 + lean), y, pz + dz * (0.6 + lean));
          ch.uv.push((px + pz) / 3, y / 3);
          const col = tint(px, pz, zoneTint(px, pz));
          const dark = 0.55 + 0.45 * Math.sin(t * Math.PI);
          ch.col.push(col[0] * dark, col[1] * dark, col[2] * dark);
        }
      }
      for (let k = 0; k < R; k++) ch.idx.push(base + k, base + R + 1 + k, base + k + 1, base + k + 1, base + R + 1 + k, base + R + 2 + k);
    }
  }
  const group = new THREE.Group();
  const geos = [];
  for (const ch of chunks.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(ch.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3));
    g.setIndex(ch.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    geos.push(g);
    group.add(new THREE.Mesh(g, M[ch.key]));
  }
  return { group, geos };
}

// Rock circles for collision: one per rock corner next to air.
export function buildColliders(cave) {
  const { V, isAir } = cave;
  const cell = 6;
  const buckets = new Map();
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    if (isAir(i, j)) continue;
    let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (isAir(i + di, j + dj)) near = true;
    if (!near) continue;
    const x = i * CS, z = j * CS;
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push([x, z]);
  }
  const extra = [];
  return {
    extra,
    collide(pos, r) {
      const R = CS * 0.5 + r;
      for (let it = 0; it < 2; it++) {
        const ci = Math.floor(pos.x / cell), cj = Math.floor(pos.z / cell);
        for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) {
          const list = buckets.get(`${a},${b}`);
          if (!list) continue;
          for (const [x, z] of list) {
            const dx = pos.x - x, dz = pos.z - z, d = Math.hypot(dx, dz);
            if (d >= R || d < 1e-5) continue;
            pos.x = x + (dx / d) * R;
            pos.z = z + (dz / d) * R;
          }
        }
        for (const c of extra) {
          const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
          if (d >= m || d < 1e-5) continue;
          pos.x = c.x + (dx / d) * m;
          pos.z = c.z + (dz / d) * m;
        }
      }
      // Never outside the rock entirely.
      const fi = Math.round(pos.x / CS), fj = Math.round(pos.z / CS);
      if (!isAir(fi, fj) && !isAir(Math.floor(pos.x / CS), Math.floor(pos.z / CS)) && !isAir(Math.ceil(pos.x / CS), Math.ceil(pos.z / CS))) return false;
      return true;
    },
  };
}
