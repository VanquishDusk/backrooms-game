import * as THREE from 'three';
import { mergeGeometries } from '../../world/props.js';

// Little helpers for building Level 94's handmade-looking props: painted
// canvas textures, and a kit that collects geometry per material and
// merges it into a few meshes.

export function paintTex(own, w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  own.textures.push(t);
  return t;
}

// Visible brush strokes over a base colour, like painted card or clay.
export function brushed(ctx, w, h, base, strokes = 400, spread = 0.12) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < strokes; i++) {
    const light = Math.random() < 0.5;
    ctx.strokeStyle = `rgba(${light ? '255,255,240' : '40,30,20'},${(Math.random() * spread).toFixed(3)})`;
    ctx.lineWidth = 1 + Math.random() * 4;
    const x = Math.random() * w, y = Math.random() * h, l = 6 + Math.random() * 24, a = Math.random() * 0.6 - 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Kit {
  constructor() {
    this.parts = {};
  }

  // Add a geometry under material `key`, transformed.
  add(key, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    const g = geo.index ? geo.clone() : geo.clone();
    g.applyMatrix4(_m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    (this.parts[key] ||= []).push(g);
    return this;
  }

  box(key, x, y, z, w, h, d, ry = 0, uv = null) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uv) {
      // UVs in metres (times `uv`), so textures don't stretch.
      const a = g.attributes.uv;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) a.setXY(f * 4 + k, a.getX(f * 4 + k) * dims[f][0] * uv, a.getY(f * 4 + k) * dims[f][1] * uv);
    }
    this.add(key, g, x, y, z, 0, ry);
    g.dispose();
    return this;
  }

  // Merge into one mesh per material.
  build(materials, own) {
    const group = new THREE.Group();
    for (const [key, list] of Object.entries(this.parts)) {
      const geo = mergeGeometries(list);
      for (const g of list) g.dispose();
      own.geos.push(geo);
      const mesh = new THREE.Mesh(geo, materials[key]);
      group.add(mesh);
    }
    this.parts = {};
    return group;
  }
}

// Oriented box colliders, bucketed on a coarse grid so lookups stay cheap.
export class Colliders {
  constructor(cell = 12) {
    this.cell = cell;
    this.map = new Map();
    this.all = new Set();
  }

  key(i, j) {
    return i * 100003 + j;
  }

  add(b) {
    // b: { x, z, hw, hd, rot, y0, y1 }
    const r = Math.hypot(b.hw, b.hd) + 1;
    const c = this.cell;
    b.cells = [];
    for (let i = Math.floor((b.x - r) / c); i <= Math.floor((b.x + r) / c); i++) {
      for (let j = Math.floor((b.z - r) / c); j <= Math.floor((b.z + r) / c); j++) {
        const k = this.key(i, j);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(b);
        b.cells.push(k);
      }
    }
    this.all.add(b);
    return b;
  }

  remove(b) {
    for (const k of b.cells || []) {
      const list = this.map.get(k);
      if (!list) continue;
      const i = list.indexOf(b);
      if (i >= 0) list.splice(i, 1);
    }
    this.all.delete(b);
  }

  // Push a circle at height y out of every box it overlaps. Returns true on a hit.
  collide(pos, r, y = null) {
    const list = this.map.get(this.key(Math.floor(pos.x / this.cell), Math.floor(pos.z / this.cell)));
    if (!list) return false;
    let hit = false;
    for (const b of list) {
      if (y != null && (y + 1.6 < b.y0 || y > b.y1)) continue;
      const dx = pos.x - b.x, dz = pos.z - b.z;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const px = b.hw + r - Math.abs(lx), pz = b.hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      let nx = lx, nz = lz;
      if (px < pz) nx = Math.sign(lx || 1) * (b.hw + r);
      else nz = Math.sign(lz || 1) * (b.hd + r);
      pos.x = b.x + nx * c + nz * s;
      pos.z = b.z - nx * s + nz * c;
      hit = true;
    }
    return hit;
  }
}
