import * as THREE from 'three';
import { Kit, paintTex } from '../level94/kit.js';
import { Placer, house, table, chair, dresser, picture } from '../level94/town.js';
import { mergeGeometries } from '../../world/props.js';

// Level 9's neighbourhood, block by block. Each block is B metres square
// and owns the road along its west and north edges (with the crossing at
// its north-west corner), the sidewalks around it, and what's inside:
// two rows of houses back to back, or a park, or an empty grass field.

export const B = 64;
export const ROAD = 8;
export const WALK = 2.5;
export const IN0 = ROAD + WALK; // where the lots start
export const IN1 = B - WALK; // where they end
export const LOT = (IN1 - IN0) / 3;

export function hash(i, j, k = 0, seed = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 1442695041 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;
export function isRoad(x, z) {
  return mod(x, B) < ROAD || mod(z, B) < ROAD;
}
export function isSidewalk(x, z) {
  if (isRoad(x, z)) return false;
  const lx = mod(x, B), lz = mod(z, B);
  return lx < IN0 || lz < IN0 || lx > IN1 || lz > IN1;
}

const STREETS = ['ELM', 'MAPLE', 'OAK', 'BIRCH', 'CEDAR', 'WILLOW', 'ASH', 'PINE', 'LAUREL', 'HAZEL', 'ALDER', 'ROWAN', 'LINDEN', 'POPLAR', 'HOLLY'];
export const streetName = (n, seed, ew) => `${STREETS[Math.floor(hash(n, ew ? 7 : 13, 1, seed) * STREETS.length)]} ${ew ? 'ST' : 'AVE'}`;

// ---- The plan of a block (cheap: no geometry) --------------------------------------

export function blockPlan(i, j, seed, spawnBlock) {
  const r = hash(i, j, 1, seed);
  const isSpawn = i === spawnBlock[0] && j === spawnBlock[1];
  const type = isSpawn ? 'houses' : r < 0.08 ? 'field' : r < 0.15 ? 'park' : 'houses';
  const plan = { i, j, type, lots: [], lamps: [], watch: null, tube: false };
  const x0 = i * B, z0 = j * B;
  if (type === 'houses') {
    for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) {
      const h = (n) => hash(i * 7 + k, j * 7 + row, n, seed);
      if (h(2) < 0.08 && !(isSpawn && row === 0 && k === 1)) {
        plan.lots.push({ row, k, empty: true });
        continue;
      }
      const w = 8.5 + h(3) * 3.5, d = 7.5 + h(4) * 2.5, setback = 4.5 + h(5) * 3;
      const cx = x0 + IN0 + (k + 0.5) * LOT + (h(6) - 0.5) * 2;
      const cz = row === 0 ? z0 + IN0 + setback + d / 2 : z0 + IN1 - setback - d / 2;
      plan.lots.push({
        row, k, w, d, cx, cz,
        rot: row === 0 ? Math.PI : 0, // front faces the street
        floors: h(7) < 0.6 ? 2 : 1,
        color: Math.floor(h(8) * 6),
        roof: Math.floor(h(9) * 4),
        enterable: (isSpawn && row === 0 && k === 1) || h(10) < 0.32,
        merged: h(11) < 0.08,
        mergeRot: (h(12) - 0.5) * 1.2,
        flood: h(13) < 0.12,
        item: h(14) < 0.6 ? ['water', 'water', 'battery', 'medkit', 'flare', 'pipe'][Math.floor(h(15) * 6)] : null,
      });
    }
  }
  if (type === 'park') plan.tube = hash(i, j, 20, seed) < 0.5;
  // Street lamps: mostly dead; some flicker; a few just work.
  for (const [lx, lz] of [[22, IN0 - 0.9], [44, IN0 - 0.9], [IN0 - 0.9, 26], [IN0 - 0.9, 48]]) {
    const s = hash(i * 3 + Math.round(lx), j * 3 + Math.round(lz), 30, seed);
    const lit = (type === 'park' && lz < 20) || (isSpawn && lx === 22);
    plan.lamps.push({ x: x0 + lx, z: z0 + lz, state: lit ? 'on' : s < 0.42 ? 'off' : s < 0.58 ? 'flicker' : 'on', warm: hash(i, j, 31 + lx, seed) < 0.35 });
  }
  // Someone standing in a yard, watching.
  if (hash(i, j, 40, seed) < 0.35 && !isSpawn) {
    const row = hash(i, j, 41, seed) < 0.5 ? 0 : 1;
    plan.watch = { x: x0 + IN0 + LOT * (0.3 + hash(i, j, 42, seed) * 2.4), z: z0 + (row === 0 ? 31 : 36) };
  }
  return plan;
}

// Rectangles where nothing can walk (houses), for the entity grid.
export function blockSolids(plan) {
  const out = [];
  for (const L of plan.lots) {
    if (L.empty) continue;
    out.push({ x: L.cx, z: L.cz, hw: L.w / 2 + 0.3, hd: L.d / 2 + 0.3, rot: L.rot });
    if (L.merged) out.push({ x: L.cx + L.w * 0.35, z: L.cz, hw: L.w / 2, hd: L.d / 2, rot: L.rot + L.mergeRot });
  }
  return out;
}

// ---- Materials ---------------------------------------------------------------------------

export function buildMaterials(own) {
  const T = {};
  const noise = (ctx, w, h, n, a, rgb, s = 2) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(${rgb},${(Math.random() * a).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * s + 0.5, Math.random() * s + 0.5);
    }
  };
  T.asphalt = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a2c2e';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 14000, 0.35, '120,120,120', 1.6);
    noise(ctx, w, h, 6000, 0.4, '8,8,10', 1.8);
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = 'rgba(10,10,10,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) ctx.lineTo((x += (Math.random() - 0.5) * 30), (y += (Math.random() - 0.5) * 30));
      ctx.stroke();
    }
  });
  T.concrete = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7a7a76';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 4000, 0.2, '30,30,30');
    noise(ctx, w, h, 2000, 0.15, '200,200,190');
    ctx.fillStyle = 'rgba(20,20,20,0.6)';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, h);
  });
  T.lawn = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a4a22';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${60 + Math.random() * 60},${20 + Math.random() * 20},0.6)`;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y - 2 - Math.random() * 4);
      ctx.stroke();
    }
    // Fallen leaves.
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = ['#6a2a14', '#8a4a1a', '#5a3a14', '#7a1e14'][i % 4];
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 2, 1 + Math.random(), Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  T.siding = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y + 10, w, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, y, w, 2);
    }
    noise(ctx, w, h, 2000, 0.12, '60,60,60');
    // Grime running down.
    for (let i = 0; i < 12; i++) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(40,40,30,0.2)');
      g.addColorStop(1, 'rgba(40,40,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.random() * w, 0, 2 + Math.random() * 6, h);
    }
  });
  T.shingle = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 8 : 0; x < w; x += 16) {
      ctx.fillStyle = `rgba(0,0,0,${(0.1 + Math.random() * 0.25).toFixed(2)})`;
      ctx.fillRect(x, y, 15, 11);
    }
  });
  T.window = paintTex(own, 64, 80, (ctx, w, h) => {
    ctx.fillStyle = '#c8c4b8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#05080a';
    ctx.fillRect(5, 5, 25, 33);
    ctx.fillRect(34, 5, 25, 33);
    ctx.fillRect(5, 42, 25, 33);
    ctx.fillRect(34, 42, 25, 33);
    // Curtains, half drawn.
    ctx.fillStyle = 'rgba(70,60,50,0.6)';
    ctx.fillRect(5, 5, 8, 70);
    ctx.fillRect(51, 5, 8, 70);
  }, false);
  T.door = paintTex(own, 64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 10, 48, 48);
    ctx.strokeRect(8, 68, 48, 50);
    ctx.fillStyle = '#a8904a';
    ctx.fillRect(50, 64, 4, 4);
  }, false);
  T.wallpaper = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8a8270';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = 'rgba(60,50,40,0.25)';
      ctx.fillRect(x, 0, 6, h);
    }
    noise(ctx, w, h, 1500, 0.1, '40,30,20');
  });
  T.planks = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5a4430';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, y, w, 2);
    }
    noise(ctx, w, h, 1500, 0.15, '20,10,5');
  });
  T.leaf = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.quadraticCurveTo(58, 30, 32, 60);
    ctx.quadraticCurveTo(6, 30, 32, 4);
    ctx.fill();
  }, false);
  T.bark = paintTex(own, 64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2a241e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '80,70,60'},0.4)`;
      ctx.beginPath();
      const x = Math.random() * w;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 6, h);
      ctx.stroke();
    }
  });
  T.fence = paintTex(own, 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4a3a2c';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '90,70,50'},0.35)`;
      ctx.fillRect(x, 0, 11, h);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + 11, 0, 1, h);
    }
  });
  T.arrowR = paintTex(own, 128, 48, (ctx, w, h) => arrowPlate(ctx, w, h, 1), false);
  T.arrowL = paintTex(own, 128, 48, (ctx, w, h) => arrowPlate(ctx, w, h, -1), false);
  T.highway = paintTex(own, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1a5a32';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8e8e0';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#e8e8e0';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL 11', w / 2, 48);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('NEXT EXIT  ↑', w / 2, 92);
  }, false);
  T.tube = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c03a2a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  T.watch = paintTex(own, 64, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#040404';
    ctx.beginPath();
    ctx.ellipse(32, 18, 10, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(20, 30, 24, 54);
    ctx.fillRect(14, 32, 7, 58);
    ctx.fillRect(43, 32, 7, 58);
    ctx.fillRect(22, 84, 8, 44);
    ctx.fillRect(34, 84, 8, 44);
    ctx.fillStyle = '#d8d8c8';
    ctx.fillRect(27, 16, 3, 2);
    ctx.fillRect(35, 16, 3, 2);
  }, false);

  const L = (o) => {
    const m = new THREE.MeshLambertMaterial(o);
    own.mats.push(m);
    return m;
  };
  const Ph = (o) => {
    const m = new THREE.MeshPhongMaterial(o);
    own.mats.push(m);
    return m;
  };
  const M = {
    road: Ph({ map: T.asphalt, color: 0xc0c4c8, shininess: 90, specular: 0xa0b0b0 }),
    puddle: Ph({ color: 0x050708, shininess: 160, specular: 0xd0dcdc, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    line: L({ color: 0x8a8460 }),
    walk: Ph({ map: T.concrete, shininess: 20, specular: 0x333333 }),
    lawn: L({ map: T.lawn }),
    leaf: L({ map: T.leaf, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: false }),
    bark: L({ map: T.bark }),
    foliage: L({ color: 0xffffff }),
    trim: L({ color: 0xa8a49a }),
    window: Ph({ map: T.window, shininess: 120, specular: 0x6a7a80 }),
    door: L({ map: T.door }),
    stone: L({ map: T.concrete }),
    wallpaper: L({ map: T.wallpaper }),
    planks: L({ map: T.planks }),
    ceiling: L({ color: 0x8a867a }),
    rug: L({ color: 0x4a3a3a }),
    sofa: L({ color: 0x4a4a52 }),
    chair: L({ color: 0x5a4a3a }),
    wood: L({ color: 0x5a4430 }),
    darkwood: L({ color: 0x2e2218 }),
    shade: L({ color: 0x8a8270 }),
    iron: L({ color: 0x2a2a2c }),
    picture: L({ color: 0x5a6070 }),
    metal: L({ color: 0x5a5c60 }),
    white: L({ color: 0xc8c8c4 }),
    tv: Ph({ color: 0x080a0c, shininess: 100, specular: 0x5a5a5a }),
    fridge: L({ color: 0xc8c8c0 }),
    bed: L({ color: 0x6a6a7a }),
    fence: L({ map: T.fence }),
    sign: L({ color: 0x1a5a32 }),
    arrowR: L({ map: T.arrowR, emissive: 0x081808 }),
    arrowL: L({ map: T.arrowL, emissive: 0x081808 }),
    highway: L({ map: T.highway, emissive: 0x0a1a10 }),
    red: L({ map: T.tube }),
    yellow: L({ color: 0xc0a020 }),
    blue: L({ color: 0x2a4a8a }),
    tubeGlow: new THREE.MeshBasicMaterial({ color: 0xf4f8ff, side: THREE.BackSide }),
    lampOff: L({ color: 0x3a3a3a }),
    lampOn: new THREE.MeshBasicMaterial({ color: 0xf4fbff }),
    lampWarm: new THREE.MeshBasicMaterial({ color: 0xffc070 }),
    grassTall: L({ color: 0x2a3a20, side: THREE.DoubleSide }),
    watch: new THREE.MeshBasicMaterial({ map: T.watch, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
  };
  own.mats.push(M.tubeGlow, M.lampOn, M.lampWarm, M.watch);
  const SIDING = [0x6a7068, 0x7a756a, 0x5e666e, 0x857a68, 0x6a5e52, 0x8a877e];
  const ROOFS = [0x2e2e30, 0x3a2e2a, 0x262c30, 0x36302a];
  SIDING.forEach((c, k) => (M[`siding${k}`] = L({ map: T.siding, color: c })));
  ROOFS.forEach((c, k) => (M[`roof${k}`] = L({ map: T.shingle, color: c })));
  return { T, M };
}

function arrowPlate(ctx, w, h, dir) {
  ctx.fillStyle = '#1a5a32';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8e8e0';
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = '#e8e8e0';
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.moveTo(-40, -6);
  ctx.lineTo(16, -6);
  ctx.lineTo(16, -15);
  ctx.lineTo(40, 0);
  ctx.lineTo(16, 15);
  ctx.lineTo(16, 6);
  ctx.lineTo(-40, 6);
  ctx.fill();
  ctx.restore();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('11', dir > 0 ? 14 : w - 26, h - 8);
}

// ---- Trees --------------------------------------------------------------------------------

function branch(parts, from, dir, len, r, depth, rnd) {
  const g = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(from.x, from.y, from.z);
  parts.push(g);
  if (depth <= 0) return;
  const tip = from.clone().addScaledVector(dir, len);
  const n = depth > 1 ? 3 : 2;
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const d = dir.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7)).normalize();
    branch(parts, from.clone().lerp(tip, 0.6 + rnd() * 0.4), d, len * (0.55 + rnd() * 0.2), r * 0.55, depth - 1, rnd);
  }
}

export function treeGeometries() {
  const out = [];
  for (let v = 0; v < 3; v++) {
    let s = 1234 + v * 777;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const parts = [new THREE.CylinderGeometry(0.16, 0.28, 4, 7).translate(0, 2, 0)];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rnd();
      branch(parts, new THREE.Vector3(0, 3.2 + rnd() * 0.6, 0), new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize(), 2.6 + rnd(), 0.12, 2, rnd);
    }
    const g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    out.push(g);
  }
  return out;
}

// ---- Building a block -----------------------------------------------------------------------

const AUTUMN = [0x6a2a14, 0x8a3a12, 0x4a3a18, 0x7a1e16, 0x2a3a1e, 0x5a4a14].map((c) => new THREE.Color(c));

export function buildBlock(plan, M, shared, seed, exitDir, colliders) {
  const { i, j } = plan;
  const kit = new Kit();
  const x0 = i * B, z0 = j * B;
  const solids = [];
  const addSolid = (b) => {
    colliders.add(b);
    solids.push(b);
  };
  const rnd = (() => {
    let s = Math.floor(hash(i, j, 99, seed) * 2147483646) + 1;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const plane = (key, ax, az, bx, bz, y, uv = 4) => {
    const w = bx - ax, d = bz - az;
    const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    const a = g.attributes.uv;
    for (let k = 0; k < a.count; k++) a.setXY(k, (a.getX(k) * w + ax) / uv, (a.getY(k) * d + az) / uv);
    kit.add(key, g, (ax + bx) / 2, y, (az + bz) / 2);
    g.dispose();
  };
  // Roads, with a faded centre line.
  plane('road', x0, z0, x0 + ROAD, z0 + B, 0, 6);
  plane('road', x0 + ROAD, z0, x0 + B, z0 + ROAD, 0, 6);
  for (let s = ROAD + 2; s < B - 1; s += 6) {
    kit.box('line', x0 + ROAD / 2, 0.006, z0 + s, 0.12, 0.01, 3);
    kit.box('line', x0 + s, 0.006, z0 + ROAD / 2, 3, 0.01, 0.12);
  }
  // Sidewalks, raised, with a curb.
  const walk = (ax, az, bx, bz) => kit.box('walk', (ax + bx) / 2, 0.06, (az + bz) / 2, bx - ax, 0.12, bz - az, 0, 0.5);
  walk(x0 + ROAD, z0 + ROAD, x0 + IN0, z0 + B);
  walk(x0 + IN1, z0 + ROAD, x0 + B, z0 + B);
  walk(x0 + IN0, z0 + ROAD, x0 + IN1, z0 + IN0);
  walk(x0 + IN0, z0 + IN1, x0 + IN1, z0 + B);
  // Lawn.
  const field = plan.type === 'field';
  plane(field ? 'grassTall' : 'lawn', x0 + IN0, z0 + IN0, x0 + IN1, z0 + IN1, 0.1, 5);
  // Puddles on the road.
  for (let k = 0; k < 5; k++) {
    const g = new THREE.CircleGeometry(0.6 + rnd() * 1.4, 12).rotateX(-Math.PI / 2);
    g.scale(1 + rnd(), 1, 0.6 + rnd() * 0.5);
    const onX = rnd() < 0.5;
    const along = ROAD + rnd() * (B - ROAD - 2), across = 0.8 + rnd() * (ROAD - 1.6);
    kit.add('puddle', g, onX ? x0 + across : x0 + along, 0.012, onX ? z0 + along : z0 + across);
    g.dispose();
  }

  const P = (x, z, rot) => new Placer(kit, colliders, x, 0, z, rot);
  const houses = [];
  const items = [];
  // ---- Houses ----
  for (const Lt of plan.lots) {
    if (Lt.empty) continue;
    const ph = P(Lt.cx, Lt.cz, Lt.rot);
    ph.y = 0.1;
    house(ph, { w: Lt.w, d: Lt.d, floors: Lt.floors, color: Lt.color, roof: Lt.roof, enterable: Lt.enterable });
    if (Lt.enterable) {
      // Things that don't work any more: a television, a fridge, a bed.
      const iw = Lt.w / 2 - 0.7, id = Lt.d / 2 - 0.7;
      ph.box('tv', iw - 0.4, 0.75, 0.3, 0.9, 0.6, 0.45).box('darkwood', iw - 0.4, 0.22, 0.3, 1.0, 0.44, 0.5);
      ph.box('fridge', -iw + 0.1, 0.9, -id + 0.2, 0.75, 1.8, 0.7);
      ph.solid(-iw + 0.1, -id + 0.2, 0.4, 0.38, 0, 0, 2);
      ph.box('bed', iw - 1.0, 0.3, -id + 1.1, 1.5, 0.45, 2.0).box('white', iw - 1.0, 0.56, -id + 0.3, 1.4, 0.1, 0.4);
      ph.solid(iw - 1.0, -id + 1.1, 0.78, 1.02, 0, 0, 0.7);
      dresser(ph, -iw + 1.5, id - 0.4, Math.PI);
      table(ph, -iw + 1.2, 0.8, 1.0, 0.8, 0.75);
      chair(ph, -iw + 1.2, 1.5, Math.PI);
      picture(ph, iw - 0.05, 1.7, -0.6, -Math.PI / 2);
      if (Lt.item && !plan.itemsTaken) {
        const at = ph.world(0, 0, 0.5);
        items.push({ id: Lt.item, x: at.x, z: at.z });
      }
      houses.push({ ...Lt, door: ph.world(0, 0, Lt.d / 2 + 0.6), inside: ph.world(0, 0, 0) });
    }
    if (Lt.merged) {
      // Two houses in the same place, clipped through each other.
      const pm = P(Lt.cx + Lt.w * 0.35, Lt.cz, Lt.rot + Lt.mergeRot);
      pm.y = 0.1;
      house(pm, { w: Lt.w * 0.9, d: Lt.d * 0.9, floors: 3 - Lt.floors, color: (Lt.color + 2) % 6, roof: (Lt.roof + 1) % 4, enterable: false });
    }
    // A driveway and a path to the door.
    const side = (Lt.k % 2 ? 1 : -1) * (Lt.w / 2 + 1.6);
    const front = Lt.row === 0 ? -1 : 1;
    const streetZ = Lt.row === 0 ? z0 + IN0 : z0 + IN1;
    const dz0 = Math.min(streetZ, Lt.cz + front * (Lt.d / 2 - 2)), dz1 = Math.max(streetZ, Lt.cz + front * (Lt.d / 2 - 2));
    kit.box('stone', Lt.cx + side, 0.11, (dz0 + dz1) / 2, 2.8, 0.03, dz1 - dz0);
    const pz0 = Math.min(streetZ, Lt.cz + front * Lt.d / 2), pz1 = Math.max(streetZ, Lt.cz + front * Lt.d / 2);
    kit.box('stone', Lt.cx, 0.115, (pz0 + pz1) / 2, 1.1, 0.03, pz1 - pz0);
    // A floodlight on the lawn, by the porch, still on for no reason.
    if (Lt.flood) {
      const fl = { x: Lt.cx - Lt.w * 0.3, z: Lt.cz + front * (Lt.d / 2 + 1.5) };
      kit.box('metal', fl.x, 0.2, fl.z, 0.25, 0.2, 0.2);
      plan.floodlight = { x: fl.x, y: 0.4, z: fl.z };
    }
  }
  // Fences between the back yards.
  if (plan.type === 'houses') {
    const mz = z0 + (IN0 + IN1) / 2;
    const fg = new THREE.PlaneGeometry(IN1 - IN0, 1.8);
    fg.attributes.uv.array.forEach((v, k, a) => (a[k] = k % 2 ? v : v * (IN1 - IN0) / 4));
    kit.add('fence', fg, x0 + (IN0 + IN1) / 2, 0.95, mz);
    fg.dispose();
    addSolid({ x: x0 + (IN0 + IN1) / 2, z: mz, hw: (IN1 - IN0) / 2, hd: 0.08, rot: 0, y0: 0, y1: 2 });
    for (const k of [1, 2]) {
      const x = x0 + IN0 + k * LOT;
      for (const row of [0, 1]) {
        const za = row === 0 ? z0 + 26 : mz, zb = row === 0 ? mz : z0 + IN1 - 14;
        const g = new THREE.PlaneGeometry(zb - za, 1.8);
        g.attributes.uv.array.forEach((v, q, a) => (a[q] = q % 2 ? v : v * (zb - za) / 4));
        kit.add('fence', g, x, 0.95, (za + zb) / 2, 0, Math.PI / 2, 0);
        g.dispose();
        addSolid({ x, z: (za + zb) / 2, hw: 0.08, hd: (zb - za) / 2, rot: 0, y0: 0, y1: 2 });
      }
    }
  }
  // ---- A park ----
  if (plan.type === 'park') {
    const cx = x0 + 36, cz = z0 + 36;
    // Slide.
    kit.box('yellow', cx - 8, 1.1, cz - 4, 1.0, 2.2, 1.0);
    kit.add('blue', new THREE.BoxGeometry(0.8, 0.06, 4).translate(0, 0, 0), cx - 8, 1.15, cz - 1.8, -0.5, 0, 0);
    addSolid({ x: cx - 8, z: cz - 4, hw: 0.6, hd: 0.6, rot: 0, y0: 0, y1: 2.5 });
    // Swings.
    kit.box('metal', cx + 4, 2.6, cz - 6, 4.5, 0.1, 0.1);
    for (const s of [-1, 1]) for (const dz of [-0.8, 0.8]) kit.add('metal', new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), cx + 4 + s * 2.2, 1.3, cz - 6 + dz, dz > 0 ? -0.3 : 0.3, 0, 0);
    for (const s of [-1, 1]) {
      kit.box('darkwood', cx + 4 + s * 0.9, 0.5, cz - 6, 0.5, 0.05, 0.25);
      kit.box('iron', cx + 4 + s * 0.9, 1.55, cz - 6, 0.02, 2.1, 0.02);
    }
    addSolid({ x: cx + 4, z: cz - 6, hw: 2.3, hd: 1, rot: 0, y0: 0, y1: 3 });
    // The tube: a long red tunnel on legs. Some glow inside.
    const tg = new THREE.CylinderGeometry(0.75, 0.75, 4, 16, 1, true).rotateZ(Math.PI / 2);
    kit.add('red', tg, cx, 1.1, cz + 6);
    tg.dispose();
    for (const s of [-1.5, 1.5]) kit.box('metal', cx + s, 0.3, cz + 6, 0.15, 0.6, 1.2);
    addSolid({ x: cx, z: cz + 6, hw: 2, hd: 0.8, rot: 0, y0: 0, y1: 2 });
    if (plan.tube) {
      const inner = new THREE.CylinderGeometry(0.7, 0.7, 4.02, 16, 1, true).rotateZ(Math.PI / 2);
      kit.add('tubeGlow', inner, cx, 1.1, cz + 6);
      inner.dispose();
      plan.tubeAt = { x: cx - 2.3, z: cz + 6 };
    }
    // Benches.
    for (const s of [-1, 1]) {
      kit.box('wood', cx + s * 10, 0.45, cz + 8, 1.8, 0.06, 0.45).box('wood', cx + s * 10, 0.75, cz + 8.2, 1.8, 0.4, 0.05);
      addSolid({ x: cx + s * 10, z: cz + 8, hw: 0.9, hd: 0.3, rot: 0, y0: 0, y1: 1 });
    }
  }
  // ---- A field, with a walkway into it ----
  if (field) {
    const wx = x0 + 36;
    for (let z = IN0; z < 46; z += 1.1) kit.box('stone', wx + Math.sin(z * 0.2) * 1.5, 0.13, z0 + z, 0.9, 0.04, 0.8, Math.sin(z) * 0.2);
    plan.walkway = { x: wx, z0: z0 + IN0, z1: z0 + 46 };
    // Tall grass.
    const blades = [];
    for (let k = 0; k < 600; k++) {
      const x = x0 + IN0 + rnd() * (IN1 - IN0), z = z0 + IN0 + 1 + rnd() * (IN1 - IN0 - 1);
      if (Math.abs(x - (wx + Math.sin((z - z0) * 0.2) * 1.5)) < 1.2 && z < z0 + 46) continue;
      const g = new THREE.PlaneGeometry(0.8, 0.9 + rnd() * 0.6).translate(0, 0.5, 0);
      g.rotateY(rnd() * Math.PI).translate(x, 0.1, z);
      blades.push(g);
    }
    const bg = mergeGeometries(blades);
    for (const g of blades) g.dispose();
    kit.parts.grassTall = (kit.parts.grassTall || []).concat([bg]);
  }

  // ---- Street furniture: lamps, signs ----
  const lamps = [];
  for (const lp of plan.lamps) {
    kit.add('metal', new THREE.CylinderGeometry(0.07, 0.1, 6, 7), lp.x, 3, lp.z);
    // The arm reaches out over the road.
    const toRoad = mod(lp.z, B) < IN0 && mod(lp.x, B) > IN0 ? [0, -1] : [-1, 0];
    kit.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5).rotateZ(Math.PI / 2).rotateY(toRoad[0] ? 0 : Math.PI / 2), lp.x + toRoad[0] * 0.8, 6, lp.z + toRoad[1] * 0.8);
    const hx = lp.x + toRoad[0] * 1.6, hz = lp.z + toRoad[1] * 1.6;
    kit.box('metal', hx, 5.95, hz, 0.5, 0.15, 0.3, toRoad[0] ? 0 : Math.PI / 2);
    const key = lp.state === 'off' ? 'lampOff' : lp.warm ? 'lampWarm' : 'lampOn';
    kit.box(key, hx, 5.85, hz, 0.4, 0.05, 0.22, toRoad[0] ? 0 : Math.PI / 2);
    addSolid({ x: lp.x, z: lp.z, hw: 0.15, hd: 0.15, rot: 0, y0: 0, y1: 6 });
    lamps.push({ x: hx, y: 5.6, z: hz, state: lp.state, warm: lp.warm, ph: rnd() * 10 });
  }
  // A street sign at the corner: two names, and an arrow.
  {
    const sx = x0 + IN0 - 0.8, sz = z0 + IN0 - 0.8;
    kit.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 3, 6), sx, 1.5, sz);
    kit.box('sign', sx, 2.85, sz, 1.1, 0.22, 0.03);
    kit.box('sign', sx, 2.6, sz, 0.03, 0.22, 1.1);
    addSolid({ x: sx, z: sz, hw: 0.1, hd: 0.1, rot: 0, y0: 0, y1: 3 });
    // Arrow plates, back to back, perpendicular to the way they point.
    const [dx, dz] = exitDir;
    const ry = dx ? 0 : Math.PI / 2;
    for (const flip of [0, Math.PI]) {
      const r = ry + flip;
      const ux = Math.cos(r), uz = -Math.sin(r);
      const key = ux * dx + uz * dz > 0 ? 'arrowR' : 'arrowL';
      const nx = Math.sin(r) * 0.02, nz = Math.cos(r) * 0.02;
      kit.add(key, new THREE.PlaneGeometry(0.9, 0.34), sx + nx, 2.2, sz + nz, 0, r, 0);
    }
  }
  // ---- Trees ----
  const trees = [];
  const tryTree = (x, z) => {
    for (const s of solids.concat(colliders.map.get(colliders.key(Math.floor(x / colliders.cell), Math.floor(z / colliders.cell))) || [])) {
      if (Math.hypot(s.x - x, s.z - z) < Math.max(s.hw, s.hd) + 1.2) return;
    }
    trees.push({ x, z, s: 0.8 + rnd() * 0.7, rot: rnd() * 6, v: Math.floor(rnd() * 3), leafy: rnd() < 0.65, c: Math.floor(rnd() * AUTUMN.length) });
    addSolid({ x, z, hw: 0.3, hd: 0.3, rot: 0, y0: 0, y1: 5 });
  };
  if (!field) {
    for (let k = 0; k < 4; k++) tryTree(x0 + IN0 + 6 + k * 13 + rnd() * 3, z0 + IN0 + 1.2);
    for (let k = 0; k < 3; k++) tryTree(x0 + IN0 + 1.2, z0 + IN0 + 8 + k * 15 + rnd() * 3);
    for (let k = 0; k < 4; k++) tryTree(x0 + IN0 + 4 + rnd() * (IN1 - IN0 - 8), z0 + IN0 + 18 + rnd() * 18);
  }
  return { kit, solids, lamps, trees, houses, items, plan };
}
