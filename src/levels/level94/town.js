import * as THREE from 'three';
import { Kit, paintTex, brushed } from './kit.js';
import { TOWN } from './terrain.js';

// Level 94's town, hills and castle, built like a model: painted clapboard
// houses with gable roofs, white picket fences, round-fendered 1930s cars,
// Almond Milk vans, a three-tier Almond Water fountain, siren poles with
// horn speakers, lamp posts; out in the hills, odd things left lying about;
// and the castle on its glass mountain.

export const PALETTE = [0xf2e6c0, 0xf6f2e8, 0xf2e2a2, 0xcadcea, 0xf0d2c6, 0xd8e6c8];
const ROOFS = [0x6a4a3a, 0x4c4c54, 0x8a3c32, 0x5a6a4a];
const CARS = [0x7a2a2a, 0x222226, 0xe2d6b2, 0x3a5a3a, 0x2c3c5c];

export function buildMaterials(own) {
  const T = {};
  T.siding = paintTex(own, 128, 128, (ctx, w, h) => {
    brushed(ctx, w, h, '#ffffff', 250, 0.06);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = 'rgba(70,60,50,0.28)';
      ctx.fillRect(0, y + 13, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, y, w, 2);
    }
  });
  T.shingle = paintTex(own, 128, 128, (ctx, w, h) => {
    brushed(ctx, w, h, '#ffffff', 200, 0.08);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x, y, 16, 16);
    }
  });
  T.window = paintTex(own, 64, 80, (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e2836';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillRect(6 + c * 18, 6 + r * 23, 15, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(8, 8, 6, 60);
  }, false);
  T.door = paintTex(own, 64, 128, (ctx, w, h) => {
    brushed(ctx, w, h, '#6a4630', 120, 0.1);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 10, 48, 48);
    ctx.strokeRect(8, 68, 48, 50);
    ctx.fillStyle = '#d8b050';
    ctx.beginPath();
    ctx.arc(52, 66, 3, 0, Math.PI * 2);
    ctx.fill();
  }, false);
  T.fence = paintTex(own, 256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f6f6f0';
    for (let x = 2; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x, 10);
      ctx.lineTo(x + 5, 2);
      ctx.lineTo(x + 10, 10);
      ctx.lineTo(x + 10, 64);
      ctx.fill();
    }
    ctx.fillRect(0, 20, w, 5);
    ctx.fillRect(0, 48, w, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 2; x < w; x += 16) ctx.fillRect(x + 8, 10, 2, 54);
  });
  T.cobble = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a8478';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 10; x < w; x += 20) {
      const v = 150 + Math.random() * 50;
      ctx.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 9, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  T.dirt = paintTex(own, 128, 128, (ctx, w, h) => brushed(ctx, w, h, '#c8b088', 300, 0.12));
  T.stone = paintTex(own, 128, 128, (ctx, w, h) => {
    brushed(ctx, w, h, '#d0ccc0', 200, 0.1);
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = 'rgba(80,70,60,0.3)';
      ctx.fillRect(0, y, w, 2);
      for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) ctx.fillRect(x, y, 2, 32);
    }
  });
  T.water = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f2ead4';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + Math.random() * 3, 0, 2, h);
    }
  });
  T.wallpaper = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8d8b0';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) {
      ctx.fillStyle = '#b86a5a';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(x + 8 + Math.cos(k * 1.26) * 4, y + 10 + Math.sin(k * 1.26) * 4, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#6a8a5a';
      ctx.fillRect(x + 7, y + 14, 2, 9);
    }
    ctx.fillStyle = 'rgba(120,90,50,0.15)';
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
  });
  T.planks = paintTex(own, 128, 128, (ctx, w, h) => {
    brushed(ctx, w, h, '#a87a4e', 160, 0.1);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = 'rgba(40,20,10,0.4)';
      ctx.fillRect(0, y, w, 2);
    }
  });
  T.rug = paintTex(own, 128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#8a2a2a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e0c080';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#2a3a6a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }, false);
  T.vanSign = paintTex(own, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f6f4ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a4a8a';
    ctx.font = 'bold 34px serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALMOND', w / 2, 52);
    ctx.fillText('MILK', w / 2, 92);
    ctx.fillStyle = '#c03a2a';
    ctx.fillRect(20, 106, w - 40, 6);
  }, false);
  T.whitewash = paintTex(own, 128, 128, (ctx, w, h) => {
    brushed(ctx, w, h, '#ecebe4', 300, 0.08);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(120,110,90,${(Math.random() * 0.15).toFixed(2)})`;
      ctx.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h);
    }
  });
  T.picture = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#6a8ab0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a9a4a';
    ctx.beginPath();
    ctx.ellipse(32, 64, 40, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f0e0';
    ctx.fillRect(26, 30, 12, 10);
    ctx.fillStyle = '#7a3a2a';
    ctx.beginPath();
    ctx.moveTo(24, 31);
    ctx.lineTo(32, 23);
    ctx.lineTo(40, 31);
    ctx.fill();
  }, false);

  const L = (opts) => {
    const m = new THREE.MeshLambertMaterial(opts);
    own.mats.push(m);
    return m;
  };
  const M = {
    trim: L({ color: 0xf8f6f0 }),
    window: L({ map: T.window, emissive: 0x000000, emissiveMap: T.window }),
    door: L({ map: T.door }),
    fence: L({ map: T.fence, alphaTest: 0.5, side: THREE.DoubleSide }),
    cobble: L({ map: T.cobble }),
    dirt: L({ map: T.dirt }),
    stone: L({ map: T.stone }),
    water: L({ map: T.water, color: 0xffffff, emissive: 0x3a3428, transparent: true, opacity: 0.72, depthWrite: false }),
    wallpaper: L({ map: T.wallpaper }),
    planks: L({ map: T.planks }),
    ceiling: L({ color: 0xf2eee2 }),
    rug: L({ map: T.rug }),
    wood: L({ color: 0x7a4c2c }),
    darkwood: L({ color: 0x4a2c1a }),
    sofa: L({ color: 0x5a7a5c }),
    chair: L({ color: 0x8a3c3a }),
    shade: L({ color: 0xf2e2b8, emissive: 0x000000 }),
    iron: L({ color: 0x2a2a2c }),
    metal: L({ color: 0x9a9ea2 }),
    chrome: L({ color: 0xd8d8d8, emissive: 0x202020 }),
    tire: L({ color: 0x18181a }),
    whitewall: L({ color: 0xf2f2ee }),
    glass: L({ color: 0x2e3c48 }),
    van: L({ color: 0xf6f4ee }),
    vanSign: L({ map: T.vanSign }),
    bottle: L({ color: 0xffffff, emissive: 0x303030 }),
    whitewash: L({ map: T.whitewash }),
    castleDoor: L({ color: 0x3a2a1e }),
    picture: L({ map: T.picture }),
    red: L({ color: 0xc03a2a }),
    glow: new THREE.MeshBasicMaterial({ color: 0xd8d4c4 }),
  };
  own.mats.push(M.glow);
  for (let i = 0; i < PALETTE.length; i++) M[`siding${i}`] = L({ map: T.siding, color: PALETTE[i] });
  for (let i = 0; i < ROOFS.length; i++) M[`roof${i}`] = L({ map: T.shingle, color: ROOFS[i] });
  for (let i = 0; i < CARS.length; i++) M[`car${i}`] = L({ color: CARS[i] });
  return { T, M };
}

// A frame for placing parts of one object: local +z is its front.
export class Placer {
  constructor(kit, colliders, x, y, z, rot) {
    Object.assign(this, { kit, colliders, x, y, z, rot });
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
    this.solids = [];
  }

  w(lx, lz) {
    return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c];
  }

  box(key, lx, ly, lz, w, h, d, ry = 0, uv = null) {
    const [x, z] = this.w(lx, lz);
    this.kit.box(key, x, this.y + ly, z, w, h, d, this.rot + ry, uv);
    return this;
  }

  add(key, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const [x, z] = this.w(lx, lz);
    this.kit.add(key, geo, x, this.y + ly, z, rx, this.rot + ry, rz, sx, sy, sz);
    geo.dispose();
    return this;
  }

  solid(lx, lz, hw, hd, ry = 0, y0 = 0, y1 = 3) {
    const [x, z] = this.w(lx, lz);
    const b = { x, z, hw, hd, rot: this.rot + ry, y0: this.y + y0, y1: this.y + y1 };
    if (this.colliders) this.colliders.add(b);
    this.solids.push(b);
    return b;
  }

  world(lx, ly, lz) {
    const [x, z] = this.w(lx, lz);
    return { x, y: this.y + ly, z };
  }
}

// ---- Furniture ------------------------------------------------------------------------

export function sofa(P, lx, lz, ry = 0, key = 'sofa') {
  const sub = new Placer(P.kit, P.colliders, ...Object.values(P.world(lx, 0, lz)), P.rot + ry);
  sub.box(key, 0, 0.25, 0, 1.9, 0.3, 0.8).box(key, 0, 0.6, -0.32, 1.9, 0.6, 0.18).box(key, -0.88, 0.45, 0, 0.18, 0.5, 0.8).box(key, 0.88, 0.45, 0, 0.18, 0.5, 0.8);
  sub.box('darkwood', 0, 0.05, 0, 1.8, 0.1, 0.7);
  sub.solid(0, 0, 0.95, 0.42, 0, 0, 0.9);
}

export function armchair(P, lx, lz, ry = 0) {
  const sub = new Placer(P.kit, P.colliders, ...Object.values(P.world(lx, 0, lz)), P.rot + ry);
  sub.box('chair', 0, 0.28, 0, 0.8, 0.3, 0.75).box('chair', 0, 0.65, -0.3, 0.8, 0.7, 0.16).box('chair', -0.36, 0.48, 0, 0.12, 0.42, 0.75).box('chair', 0.36, 0.48, 0, 0.12, 0.42, 0.75);
  sub.solid(0, 0, 0.42, 0.4, 0, 0, 1);
}

export function lamp(P, lx, lz) {
  P.add('iron', new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), lx, 0.75, lz);
  P.add('iron', new THREE.CylinderGeometry(0.16, 0.18, 0.04, 10), lx, 0.02, lz);
  P.add('shade', new THREE.CylinderGeometry(0.16, 0.28, 0.32, 12, 1, true), lx, 1.55, lz);
}

export function table(P, lx, lz, w = 1.2, d = 0.8, h = 0.75, ry = 0) {
  const sub = new Placer(P.kit, P.colliders, ...Object.values(P.world(lx, 0, lz)), P.rot + ry);
  sub.box('wood', 0, h - 0.03, 0, w, 0.06, d);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sub.box('wood', sx * (w / 2 - 0.06), (h - 0.06) / 2, sz * (d / 2 - 0.06), 0.06, h - 0.06, 0.06);
  sub.solid(0, 0, w / 2, d / 2, 0, 0, h);
}

export function chair(P, lx, lz, ry = 0) {
  const sub = new Placer(P.kit, P.colliders, ...Object.values(P.world(lx, 0, lz)), P.rot + ry);
  sub.box('wood', 0, 0.45, 0, 0.44, 0.05, 0.44).box('wood', 0, 0.75, -0.2, 0.44, 0.6, 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sub.box('wood', sx * 0.18, 0.22, sz * 0.18, 0.04, 0.45, 0.04);
}

export function radio(P, lx, lz, ry = 0) {
  // A 1930s cathedral radio cabinet.
  const sub = new Placer(P.kit, P.colliders, ...Object.values(P.world(lx, 0, lz)), P.rot + ry);
  sub.box('darkwood', 0, 0.45, 0, 0.6, 0.9, 0.35);
  sub.add('darkwood', new THREE.CylinderGeometry(0.3, 0.3, 0.35, 16, 1, false, -Math.PI / 2, Math.PI), 0, 0.9, 0, Math.PI / 2, 0, 0);
  sub.box('shade', 0, 0.75, 0.18, 0.36, 0.3, 0.01);
  sub.solid(0, 0, 0.3, 0.18, 0, 0, 1.2);
}

export function dresser(P, lx, lz, ry = 0) {
  const sub = new Placer(P.kit, P.colliders, ...Object.values(P.world(lx, 0, lz)), P.rot + ry);
  sub.box('wood', 0, 0.5, 0, 1.1, 1.0, 0.5);
  for (let k = 0; k < 3; k++) sub.box('darkwood', 0, 0.2 + k * 0.3, 0.255, 0.96, 0.22, 0.01);
  sub.solid(0, 0, 0.55, 0.25, 0, 0, 1);
}

export function picture(P, lx, ly, lz, ry = 0) {
  const sub = new Placer(P.kit, null, ...Object.values(P.world(lx, ly, lz)), P.rot + ry);
  sub.box('darkwood', 0, 0, 0, 0.6, 0.5, 0.04);
  sub.add('picture', new THREE.PlaneGeometry(0.5, 0.4), 0, 0, 0.025);
}

// ---- Houses -------------------------------------------------------------------------------

export function house(P, o) {
  const { w, d, floors, color, roof, enterable } = o;
  const H1 = 2.9, Ht = floors === 2 ? 5.7 : 3.0;
  const side = `siding${color}`;
  const T = 0.18;
  if (!enterable) {
    P.box(side, 0, Ht / 2, 0, w, Ht, d, 0, 0.5);
    P.solid(0, 0, w / 2, d / 2, 0, 0, Ht + 2);
  } else {
    // Ground floor hollow: walls with a doorway; the storey above solid.
    P.box(side, 0, H1 / 2, -d / 2 + T / 2, w, H1, T, 0, 0.5);
    P.box(side, -w / 2 + T / 2, H1 / 2, 0, T, H1, d, 0, 0.5);
    P.box(side, w / 2 - T / 2, H1 / 2, 0, T, H1, d, 0, 0.5);
    const dw = 1.1;
    P.box(side, -(w / 4 + dw / 4), H1 / 2, d / 2 - T / 2, w / 2 - dw / 2, H1, T, 0, 0.5);
    P.box(side, w / 4 + dw / 4, H1 / 2, d / 2 - T / 2, w / 2 - dw / 2, H1, T, 0, 0.5);
    P.box(side, 0, 2.25 + (H1 - 2.25) / 2, d / 2 - T / 2, dw, H1 - 2.25, T, 0, 0.5);
    if (floors === 2) P.box(side, 0, H1 + (Ht - H1) / 2, 0, w, Ht - H1, d, 0, 0.5);
    // Inside: wallpaper, floorboards, a ceiling.
    P.box('wallpaper', 0, H1 / 2, -d / 2 + T + 0.01, w - 2 * T, H1, 0.02, 0, 0.6);
    P.box('wallpaper', -w / 2 + T + 0.01, H1 / 2, 0, 0.02, H1, d - 2 * T, 0, 0.6);
    P.box('wallpaper', w / 2 - T - 0.01, H1 / 2, 0, 0.02, H1, d - 2 * T, 0, 0.6);
    P.box('planks', 0, 0.03, 0, w - 2 * T, 0.06, d - 2 * T, 0, 0.5);
    P.box('ceiling', 0, H1 - 0.03, 0, w - 2 * T, 0.06, d - 2 * T);
    P.solid(0, -d / 2 + T / 2, w / 2, T / 2, 0, 0, H1);
    P.solid(-w / 2 + T / 2, 0, T / 2, d / 2, 0, 0, H1);
    P.solid(w / 2 - T / 2, 0, T / 2, d / 2, 0, 0, H1);
    P.solid(-(w / 4 + dw / 4), d / 2 - T / 2, (w / 2 - dw / 2) / 2, T / 2, 0, 0, H1);
    P.solid(w / 4 + dw / 4, d / 2 - T / 2, (w / 2 - dw / 2) / 2, T / 2, 0, 0, H1);
    // Furniture, 1930s to 1950s.
    const iw = w / 2 - T - 0.5, id = d / 2 - T - 0.5;
    P.add('rug', new THREE.PlaneGeometry(2.4, 1.7), 0, 0.065, -0.2, -Math.PI / 2);
    sofa(P, 0, -id + 0.1, 0);
    armchair(P, -iw + 0.2, 0.2, Math.PI / 2);
    table(P, 0, -0.4, 1.0, 0.55, 0.42);
    radio(P, iw - 0.1, -id + 0.2, -Math.PI / 4);
    lamp(P, -iw + 0.15, -id + 0.15);
    table(P, iw - 0.5, id - 0.5, 0.9, 0.9, 0.75);
    chair(P, iw - 1.2, id - 0.5, Math.PI / 2);
    picture(P, 0, 1.75, -d / 2 + T + 0.04);
    picture(P, -w / 2 + T + 0.04, 1.7, -0.6, Math.PI / 2);
  }
  // Gable roof, ridge front to back.
  const rh = w * 0.42, slope = Math.atan2(rh, w / 2 + 0.3), len = Math.hypot(w / 2 + 0.35, rh) + 0.1;
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(len, 0.14, d + 0.6);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * len * 0.6, a.getY(i) * (d + 0.6) * 0.6);
    P.add(`roof${roof}`, g, s * (w / 4 + 0.08), Ht + rh / 2, 0, 0, 0, -s * slope);
  }
  // Gable ends.
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, rh);
  tri.lineTo(-w / 2, 0);
  for (const s of [-1, 1]) {
    const g = new THREE.ShapeGeometry(tri);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * 0.5, a.getY(i) * 0.5);
    P.add(side, g, 0, Ht, s * d / 2, 0, s < 0 ? Math.PI : 0, 0);
  }
  // Trim: corner boards, a band between floors, the eaves.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('trim', sx * (w / 2 + 0.02), Ht / 2, sz * (d / 2 + 0.02), 0.14, Ht, 0.14);
  if (floors === 2) P.box('trim', 0, H1, 0, w + 0.06, 0.14, d + 0.06);
  // Windows.
  const win = (lx, ly, lz, ry) => {
    P.add('window', new THREE.PlaneGeometry(0.85, 1.1), lx, ly, lz, 0, ry, 0);
    P.box('trim', lx, ly - 0.6, lz, ry && Math.abs(Math.sin(ry)) > 0.5 ? 0.1 : 1.0, 0.08, ry && Math.abs(Math.sin(ry)) > 0.5 ? 1.0 : 0.1, 0);
  };
  const fz = d / 2 + 0.02, sxw = w / 2 + 0.02;
  win(-w / 4 - 0.3, 1.5, fz, 0);
  win(w / 4 + 0.3, 1.5, fz, 0);
  if (floors === 2) {
    win(-w / 4, 4.2, fz, 0);
    win(w / 4, 4.2, fz, 0);
    win(0, 4.2, -d / 2 - 0.02, Math.PI);
  }
  win(0, 1.5, -d / 2 - 0.02, Math.PI);
  for (const s of [-1, 1]) {
    win(s * sxw, 1.5, 0, s * Math.PI / 2);
    if (floors === 2) win(s * sxw, 4.2, 0, s * Math.PI / 2);
  }
  // Front door (open on the houses you can go into) and a step.
  if (enterable) {
    const g = new THREE.BoxGeometry(1.0, 2.2, 0.06).translate(0.5, 1.1, 0);
    P.add('door', g, -0.52, 0, d / 2 - 0.1, 0, -1.6, 0);
  } else {
    P.add('door', new THREE.PlaneGeometry(1.0, 2.2), 0, 1.1, fz + 0.005);
  }
  P.box('stone', 0, 0.1, d / 2 + 0.4, 1.6, 0.2, 0.7);
  P.box('stone', w * 0.28, Ht + rh * 0.55, -d * 0.15, 0.6, rh * 1.1, 0.6);
}

// ---- Cars and vans ----------------------------------------------------------------------------

export function car(P, color) {
  const k = `car${color}`;
  P.box(k, 0, 0.66, 0, 1.55, 0.5, 3.9);
  P.box(k, 0, 1.0, 1.15, 1.05, 0.34, 1.5);
  P.box(k, 0, 1.25, -0.5, 1.45, 0.7, 1.9);
  P.box('glass', 0, 1.32, -0.5, 1.48, 0.38, 1.82);
  P.add(k, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.58, -0.5, 0, 0, 0, 0.74, 0.22, 0.96);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.add(k, new THREE.SphereGeometry(1, 14, 8), sx * 0.74, 0.66, sz * 1.32, 0, 0, 0, 0.22, 0.34, 0.68);
    P.add('tire', new THREE.CylinderGeometry(0.36, 0.36, 0.22, 16), sx * 0.74, 0.36, sz * 1.32, 0, 0, Math.PI / 2);
    P.add('whitewall', new THREE.CylinderGeometry(0.2, 0.2, 0.235, 14), sx * 0.74, 0.36, sz * 1.32, 0, 0, Math.PI / 2);
  }
  for (const sx of [-1, 1]) {
    P.add('chrome', new THREE.SphereGeometry(0.13, 10, 8), sx * 0.58, 1.02, 1.85);
    P.box('iron', sx * 0.86, 0.36, 0, 0.26, 0.05, 2.0);
  }
  P.box('chrome', 0, 0.98, 1.92, 0.6, 0.44, 0.06);
  P.box('chrome', 0, 0.42, 2.05, 1.7, 0.09, 0.12);
  P.box('chrome', 0, 0.42, -2.0, 1.7, 0.09, 0.12);
  P.solid(0, 0, 0.9, 2.1, 0, 0, 1.8);
}

export function milkVan(P) {
  P.box('van', 0, 0.68, 1.6, 1.6, 0.55, 1.6);
  P.box('van', 0, 1.05, 1.95, 1.2, 0.36, 0.9);
  P.box('van', 0, 1.35, 1.0, 1.55, 0.9, 0.9);
  P.box('glass', 0, 1.45, 1.0, 1.58, 0.42, 0.92);
  // The milk box: open at the back.
  P.box('van', 0, 2.38, -1.0, 1.9, 0.08, 3.1);
  P.box('van', 0, 0.34, -1.0, 1.9, 0.08, 3.1);
  for (const s of [-1, 1]) P.box('van', s * 0.92, 1.35, -1.0, 0.06, 2.1, 3.1);
  P.box('van', 0, 1.35, 0.52, 1.9, 2.1, 0.06);
  P.box('red', 0, 0.5, -1.0, 1.94, 0.12, 3.12);
  for (const s of [-1, 1]) P.add('vanSign', new THREE.PlaneGeometry(2.2, 1.1), s * 0.96, 1.5, -1.0, 0, s * Math.PI / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1.6, 1.65]) {
    P.add('tire', new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16), sx * 0.8, 0.38, sz, 0, 0, Math.PI / 2);
    P.add('whitewall', new THREE.CylinderGeometry(0.2, 0.2, 0.25, 14), sx * 0.8, 0.38, sz, 0, 0, Math.PI / 2);
  }
  // Back doors swung open, crates of bottles inside.
  P.box('darkwood', 0, 1.35, 0.47, 1.78, 2.0, 0.02);
  for (const s of [-1, 1]) P.box('van', s * 1.0, 1.35, -3.0, 0.05, 1.9, 0.92);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    P.box('wood', -0.4 + j * 0.27, 0.45 + i * 0.4, -2.2, 0.25, 0.08, 0.5);
    for (let b = 0; b < 2; b++) P.add('bottle', new THREE.CylinderGeometry(0.04, 0.05, 0.26, 8), -0.45 + j * 0.27 + b * 0.1, 0.62 + i * 0.4, -2.25);
  }
  P.box('chrome', 0, 0.45, 2.45, 1.7, 0.09, 0.12);
  P.solid(0, 0, 0.98, 2.6, 0, 0, 2.5);
}

// ---- The town ------------------------------------------------------------------------------------

export function buildTown(M, own, rng, colliders) {
  const kit = new Kit();
  const C = TOWN;
  const theta = rng.range(0, Math.PI / 2);
  const roads = [0, 1, 2, 3].map((k) => theta + (k * Math.PI) / 2);
  const dir = (a) => [Math.sin(a), Math.cos(a)];
  // Plaza and roads.
  const plaza = new THREE.CircleGeometry(21, 48).rotateX(-Math.PI / 2);
  plaza.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 10));
  kit.add('cobble', plaza, C.x, 0.02, C.z);
  for (const a of roads) {
    const [dx, dz] = dir(a);
    const g = new THREE.PlaneGeometry(7, 64).rotateX(-Math.PI / 2);
    g.attributes.uv.array.forEach((v, i, arr) => (arr[i] = i % 2 ? v * 16 : v * 2));
    kit.add('dirt', g, C.x + dx * 52, 0.015, C.z + dz * 52, 0, a);
  }
  // Houses along the roads.
  const houses = [];
  for (let ri = 0; ri < 4; ri++) {
    const a = roads[ri];
    const [dx, dz] = dir(a), [px, pz] = [dz, -dx];
    for (const dist of [32, 46, 60]) {
      for (const s of [-1, 1]) {
        const first = dist === 32 && s === 1;
        if (!first && rng.chance(0.12)) continue;
        const x = C.x + dx * dist + px * s * 12, z = C.z + dz * dist + pz * s * 12;
        const rot = Math.atan2(-px * s, -pz * s);
        houses.push({ x, z, rot, w: rng.range(6.2, 8), d: rng.range(6, 7.4), floors: first || rng.chance(0.7) ? 2 : 1, color: rng.int(0, PALETTE.length - 1), roof: rng.int(0, 3), enterable: first, road: ri });
      }
    }
  }
  for (const h of houses) {
    const P = new Placer(kit, colliders, h.x, 0, h.z, h.rot);
    house(P, h);
    // Picket fence along the front, with a gate gap, and a path to the door.
    const fz = h.d / 2 + 2.6;
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(4.2, 1.0);
      g.attributes.uv.array.forEach((v, i, arr) => (arr[i] = i % 2 ? v : v * 4.2));
      P.add('fence', g, s * 2.85, 0.5, fz);
      P.solid(s * 2.85, fz, 2.1, 0.05, 0, 0, 1);
    }
    const path = new THREE.PlaneGeometry(1.2, 2.6).rotateX(-Math.PI / 2);
    P.add('cobble', path, 0, 0.025, h.d / 2 + 1.3);
    if (h.enterable) {
      h.door = P.world(0, 0, h.d / 2 + 0.6);
      h.inside = P.world(0, 0, h.d / 2 - 1.2);
      h.light = P.world(0, 2.4, 0);
    }
  }
  // Cars parked at the kerb, and two Almond Milk vans by the plaza.
  const vans = [];
  for (let ri = 0; ri < 4; ri++) {
    const a = roads[ri];
    const [dx, dz] = dir(a), [px, pz] = [dz, -dx];
    const s = rng.chance(0.5) ? 1 : -1;
    const dist = rng.range(38, 66);
    const P = new Placer(kit, colliders, C.x + dx * dist + px * s * 2.6, 0, C.z + dz * dist + pz * s * 2.6, a + (rng.chance(0.5) ? Math.PI : 0));
    car(P, rng.int(0, CARS.length - 1));
    if (ri < 2) {
      const vp = new Placer(kit, colliders, C.x + dx * 25 - px * s * 2.6, 0, C.z + dz * 25 - pz * s * 2.6, a + Math.PI);
      milkVan(vp);
      vans.push({ ...vp.world(0, 0, -3.3), taken: false });
    }
  }
  // The fountain.
  const fountain = buildFountain(kit, M, own, colliders);
  // Siren poles at the corners of the plaza.
  const sirens = [];
  for (let k = 0; k < 4; k++) {
    const a = theta + Math.PI / 4 + (k * Math.PI) / 2;
    const [dx, dz] = dir(a);
    sirens.push(buildSiren(M, own, C.x + dx * 23, C.z + dz * 23, a, colliders));
  }
  // Lamp posts and benches.
  const lamps = [];
  const lampPost = (x, z) => {
    kit.add('iron', new THREE.CylinderGeometry(0.07, 0.11, 3.9, 8), x, 1.95, z);
    kit.add('iron', new THREE.CylinderGeometry(0.2, 0.24, 0.3, 8), x, 0.15, z);
    kit.add('iron', new THREE.CylinderGeometry(0.12, 0.08, 0.2, 8), x, 3.95, z);
    kit.add('glow', new THREE.SphereGeometry(0.24, 12, 10), x, 4.25, z);
    colliders.add({ x, z, hw: 0.15, hd: 0.15, rot: 0, y0: 0, y1: 4 });
    lamps.push({ x, z, y: 4.25 });
  };
  for (const a of roads) {
    const [dx, dz] = dir(a), [px, pz] = [dz, -dx];
    for (let dist = 26; dist <= 70; dist += 14) for (const s of [-1, 1]) lampPost(C.x + dx * dist + px * s * 4.6, C.z + dz * dist + pz * s * 4.6);
  }
  for (let k = 0; k < 8; k++) {
    const a = theta + (k * Math.PI) / 4 + Math.PI / 8;
    lampPost(C.x + Math.sin(a) * 19, C.z + Math.cos(a) * 19);
  }
  for (let k = 0; k < 4; k++) {
    const a = theta + (k * Math.PI) / 2 + Math.PI / 4;
    const P = new Placer(kit, colliders, C.x + Math.sin(a) * 10, 0, C.z + Math.cos(a) * 10, a + Math.PI);
    P.box('wood', 0, 0.45, 0, 1.8, 0.06, 0.45).box('wood', 0, 0.75, -0.2, 1.8, 0.4, 0.05);
    for (const s of [-1, 1]) P.box('iron', s * 0.8, 0.22, 0, 0.06, 0.45, 0.45);
    P.solid(0, 0, 0.9, 0.25, 0, 0, 0.8);
  }
  const group = kit.build(M, own);
  group.add(fountain.group);
  for (const s of sirens) group.add(s.group);
  return { group, houses, vans, fountain, sirens, lamps, roads, theta };
}

function buildFountain(kit, M, own, colliders) {
  const C = TOWN;
  const g = new THREE.Group();
  kit.add('stone', new THREE.CylinderGeometry(5.3, 5.5, 0.7, 48, 1, true), C.x, 0.35, C.z);
  kit.add('stone', new THREE.CylinderGeometry(4.85, 4.85, 0.7, 48, 1, true), C.x, 0.35, C.z);
  kit.add('stone', new THREE.TorusGeometry(5.08, 0.3, 8, 48), C.x, 0.72, C.z, Math.PI / 2);
  kit.add('stone', new THREE.CylinderGeometry(0.45, 0.65, 3.4, 16), C.x, 1.7, C.z);
  const bowl = (r, y) => {
    const pts = [new THREE.Vector2(0.4, 0), new THREE.Vector2(r * 0.7, 0.12), new THREE.Vector2(r, 0.45), new THREE.Vector2(r - 0.12, 0.5), new THREE.Vector2(r * 0.6, 0.3), new THREE.Vector2(0.3, 0.25)];
    kit.add('stone', new THREE.LatheGeometry(pts, 32), C.x, y, C.z);
  };
  bowl(2.1, 1.9);
  bowl(1.15, 3.1);
  kit.add('stone', new THREE.SphereGeometry(0.3, 12, 10), C.x, 3.9, C.z);
  for (let k = 0; k < 4; k++) colliders.add({ x: C.x, z: C.z, hw: 5.4, hd: 2.3, rot: (k * Math.PI) / 4, y0: 0, y1: 1 });
  // The Almond Water itself: the pool, and sheets falling from each bowl.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.85, 48).rotateX(-Math.PI / 2), M.water);
  pool.position.set(C.x, 0.55, C.z);
  const tops = [];
  for (const [r0, r1, y0, y1] of [[2.12, 2.4, 0.55, 2.35], [1.17, 1.35, 2.4, 3.55]]) {
    const geo = new THREE.CylinderGeometry(r0, r1, y1 - y0, 40, 1, true);
    const m = new THREE.Mesh(geo, M.water);
    m.position.set(C.x, (y0 + y1) / 2, C.z);
    g.add(m);
    own.geos.push(geo);
    tops.push(m);
  }
  const b1 = new THREE.Mesh(new THREE.CircleGeometry(1.95, 32).rotateX(-Math.PI / 2), M.water);
  b1.position.set(C.x, 2.32, C.z);
  const b2 = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32).rotateX(-Math.PI / 2), M.water);
  b2.position.set(C.x, 3.52, C.z);
  own.geos.push(pool.geometry, b1.geometry, b2.geometry);
  g.add(pool, b1, b2);
  return { group: g, x: C.x, z: C.z };
}

function buildSiren(M, own, x, z, a, colliders) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = a;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 8, 8), M.wood);
  pole.position.y = 4;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), M.wood);
  bar.position.y = 7.4;
  g.add(pole, bar);
  own.geos.push(pole.geometry, bar.geometry);
  const horns = [];
  const hornGeo = new THREE.ConeGeometry(0.42, 1.0, 16, 1, true);
  hornGeo.rotateX(-Math.PI / 2);
  hornGeo.translate(0, 0, 0.5);
  own.geos.push(hornGeo);
  for (const [hx, hy, ry] of [[-0.65, 7.75, -0.6], [0.65, 7.75, 0.6], [0, 8.25, 0]]) {
    const h = new THREE.Mesh(hornGeo, M.metal);
    h.position.set(hx, hy, 0);
    h.rotation.y = ry + Math.PI;
    g.add(h);
    horns.push(h);
  }
  colliders.add({ x, z, hw: 0.2, hd: 0.2, rot: 0, y0: 0, y1: 8 });
  return { group: g, horns, x, z };
}

// ---- The water tower ----------------------------------------------------------------------

export function buildWaterTower(M, own, terrain, colliders) {
  const t = terrain.tower;
  const y = terrain.heightAt(t.x, t.z);
  const kit = new Kit();
  const legH = 13;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    kit.add('whitewash', new THREE.CylinderGeometry(0.18, 0.24, legH + 1, 8), t.x + sx * 2.4, y + legH / 2, t.z + sz * 2.4, sz * 0.06, 0, -sx * 0.06);
    colliders.add({ x: t.x + sx * 2.5, z: t.z + sz * 2.5, hw: 0.3, hd: 0.3, rot: 0, y0: y, y1: y + legH });
  }
  for (const yy of [4, 8.5]) {
    kit.box('whitewash', t.x, y + yy, t.z - 2.4, 4.9, 0.12, 0.12).box('whitewash', t.x, y + yy, t.z + 2.4, 4.9, 0.12, 0.12);
    kit.box('whitewash', t.x - 2.4, y + yy, t.z, 0.12, 0.12, 4.9).box('whitewash', t.x + 2.4, y + yy, t.z, 0.12, 0.12, 4.9);
  }
  kit.add('whitewash', new THREE.CylinderGeometry(3.6, 3.6, 5.2, 24), t.x, y + legH + 2.6, t.z);
  kit.add('whitewash', new THREE.ConeGeometry(3.9, 1.8, 24), t.x, y + legH + 6.1, t.z);
  kit.add('whitewash', new THREE.TorusGeometry(3.7, 0.08, 6, 32), t.x, y + legH + 0.2, t.z, Math.PI / 2);
  kit.add('iron', new THREE.CylinderGeometry(0.06, 0.06, 1, 6), t.x + 2.5, y + 0.9, t.z + 2.9, 0, 0, Math.PI / 2);
  const group = kit.build(M, own);
  return { group, tap: { x: t.x + 2.5, z: t.z + 3.2, y } };
}

// ---- Things out in the hills ----------------------------------------------------------------

export function buildHillProp(type, rng, x, y, z, rot, M, own, colliders) {
  const kit = new Kit();
  const P = new Placer(kit, colliders, x, y, z, rot);
  if (type === 'car') {
    car(P, rng.int(0, CARS.length - 1));
  } else if (type === 'van') {
    milkVan(P);
  } else if (type === 'furniture') {
    // A sitting room, without the room.
    P.add('rug', new THREE.PlaneGeometry(3, 2.2), 0, 0.05, 0, -Math.PI / 2);
    sofa(P, 0, -0.8, 0);
    armchair(P, 1.6, 0.3, -Math.PI / 2);
    lamp(P, -1.4, -1.0);
    table(P, 0, 0.2, 1.0, 0.55, 0.42);
    if (rng.chance(0.5)) radio(P, -1.6, 0.4, Math.PI / 2);
  } else if (type === 'room') {
    // One wall of somebody's house, wallpapered, with its furniture.
    P.box('wallpaper', 0, 1.45, -0.1, 5, 2.9, 0.06, 0, 0.6);
    P.box('siding1', 0, 1.45, -0.18, 5, 2.9, 0.1, 0, 0.5);
    P.box('trim', 0, 0.06, 0, 5, 0.12, 0.08);
    P.add('window', new THREE.PlaneGeometry(0.85, 1.1), 1.4, 1.6, -0.06);
    P.solid(0, -0.13, 2.5, 0.12, 0, 0, 3);
    dresser(P, -1.2, 0.2);
    picture(P, -1.2, 1.7, -0.05);
    chair(P, 0.7, 0.4, 0.3);
    if (rng.chance(0.5)) lamp(P, 2.1, 0.2);
  } else if (type === 'house') {
    house(P, { w: rng.range(5.5, 7), d: rng.range(5.5, 7), floors: rng.chance(0.5) ? 2 : 1, color: rng.int(0, PALETTE.length - 1), roof: rng.int(0, 3), enterable: false });
  } else if (type === 'fence') {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.PlaneGeometry(4.2, 1.0);
      g.attributes.uv.array.forEach((v, i, arr) => (arr[i] = i % 2 ? v : v * 4.2));
      P.add('fence', g, -4.2 + k * 4.2, 0.5, 0);
    }
    P.solid(0, 0, 6.3, 0.05, 0, 0, 1);
  }
  const group = kit.build(M, own);
  return { group, solids: P.solids };
}

// ---- The castle and its glass mountain ---------------------------------------------------------

const GLASS_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GLASS_FRAG = /* glsl */ `
uniform float time;
uniform float bright;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float f = pow(1.0 - abs(dot(normalize(vN), v)), 2.5);
  float shimmer = 0.5 + 0.5 * sin(vW.y * 0.6 + vW.x * 0.05 + time * 0.7);
  vec3 c = mix(vec3(0.78, 0.88, 0.98), vec3(1.0), f) * bright;
  gl_FragColor = vec4(c, 0.04 + f * 0.42 + shimmer * 0.03);
}
`;

export function buildCastle(M, own, terrain, colliders) {
  const m = terrain.mountain;
  const group = new THREE.Group();
  // The glass mountain.
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = 1 - i / 40;
    pts.push(new THREE.Vector2(Math.max(0.01, u * m.R), terrain.glassAt(m.x + u * m.R * 0.9999, m.z)));
  }
  const glassGeo = new THREE.LatheGeometry(pts, 72);
  own.geos.push(glassGeo);
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, bright: { value: 1 } },
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  own.mats.push(glassMat);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(m.x, 0, m.z);
  glass.renderOrder = 5;
  group.add(glass);
  // The castle: tall white blocks like a grain elevator, facing the town.
  const rot = Math.atan2(TOWN.x - m.x, TOWN.z - m.z);
  const base = m.H - 0.6;
  const kit = new Kit();
  const P = new Placer(kit, colliders, m.x, base, m.z, rot);
  P.box('whitewash', 0, 12, 0, 9, 24, 9, 0, 0.25).solid(0, 0, 4.5, 4.5, 0, 0, 24);
  P.box('whitewash', 0, 26.5, 0, 7, 5, 7, 0, 0.25);
  const roof = (lx, ly, lz, w, d, h) => {
    const len = Math.hypot(w / 2 + 0.3, h);
    const a = Math.atan2(h, w / 2 + 0.3);
    for (const s of [-1, 1]) P.add('roof1', new THREE.BoxGeometry(len, 0.2, d + 0.5), lx + s * w / 4, ly + h / 2, lz, 0, 0, -s * a);
  };
  roof(0, 29, 0, 7, 7, 2.6);
  P.box('whitewash', 0, 33.2, 0, 3, 3, 3, 0, 0.25);
  roof(0, 34.7, 0, 3, 3, 1.4);
  P.box('whitewash', -8.5, 7, -1, 8, 14, 12, 0, 0.25).solid(-8.5, -1, 4, 6, 0, 0, 14);
  P.add('roof1', new THREE.BoxGeometry(8.6, 0.25, 12.6), -8.5, 14.8, -1, 0, 0, 0.18);
  P.box('whitewash', 7.6, 4.5, 2, 6, 9, 8, 0, 0.25).solid(7.6, 2, 3, 4, 0, 0, 9);
  P.add('roof1', new THREE.BoxGeometry(6.6, 0.25, 8.6), 7.6, 9.3, 2, 0, 0, -0.2);
  P.add('whitewash', new THREE.BoxGeometry(1.8, 1.8, 13), 5.5, 17, 0, 0.55, Math.PI / 2, 0);
  for (let row = 0; row < 6; row++) for (const lx of [-2.5, 0, 2.5]) P.add('glass', new THREE.PlaneGeometry(0.8, 1.0), lx, 4 + row * 3.4, 4.52);
  for (let row = 0; row < 3; row++) for (const lz of [-4, 0, 4]) P.add('glass', new THREE.PlaneGeometry(0.8, 1.0), -12.52, 3 + row * 4, lz - 1, 0, -Math.PI / 2, 0);
  // The door.
  P.box('castleDoor', 0, 1.8, 4.55, 2.6, 3.6, 0.2);
  P.box('trim', 0, 3.75, 4.6, 3.0, 0.3, 0.25);
  // A red pennant on top.
  P.add('iron', new THREE.CylinderGeometry(0.05, 0.05, 4, 6), 0, 37, 0);
  P.add('red', new THREE.ConeGeometry(0.5, 2.2, 3).rotateZ(-Math.PI / 2), 1.1, 38.3, 0, 0, 0, 0, 1, 1, 0.1);
  const castle = kit.build(M, own);
  // The castle sits high on the horizon; keep it out of the haze.
  castle.traverse((o) => {
    if (o.material) {
      o.material = o.material.clone();
      o.material.fog = false;
      own.mats.push(o.material);
    }
  });
  group.add(castle);
  const door = P.world(0, 0, 5.3);
  return { group, glass, glassMat, door, rot };
}
