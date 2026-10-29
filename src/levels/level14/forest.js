import * as THREE from 'three';
import { createNoise2D } from '../../core/rng.js';
import { mergeGeometries } from '../../world/props.js';
import { skeletonGeo } from '../level7/build.js';

// Level 14's forest: tall bare trunks reaching for an eternal starlit sky,
// a floor of crimson leaves and wet red grass, drifting blue and violet fog,
// and every so often a cliff with waterfalls crashing into a black pool.
//
// The forest has no end. Its landmarks (the waterfall cliff, the clearing
// where the guests lie, the clearing where the children stand) repeat every
// PERIOD metres; the trees in between are scattered fresh, chunk by chunk.

export const PERIOD = 240;
// Landmarks, in the coordinates of one period.
export const MESA = { x: 172, z: 58, r: 30, h: 21 };
const toTile = (() => {
  const dx = 120 - MESA.x, dz = 120 - MESA.z, l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
})();
export const FALL_ANGLE = Math.atan2(toTile[1], toTile[0]);
export const POOL = { x: MESA.x + toTile[0] * (MESA.r + 9), z: MESA.z + toTile[1] * (MESA.r + 9), r: 10.5 };
export const GUESTS = { x: 62, z: 182, r: 15 };
export const CHILDREN = { x: 104, z: 142, r: 15 };
export const SPAWN = { x: 30, z: 112 };

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The copy of a landmark nearest to (x, z).
export function nearest(L, x, z) {
  return { x: L.x + Math.round((x - L.x) / PERIOD) * PERIOD, z: L.z + Math.round((z - L.z) / PERIOD) * PERIOD };
}
function distTo(L, x, z) {
  const n = nearest(L, x, z);
  return Math.hypot(x - n.x, z - n.z);
}

export function makeGround(rng) {
  const noise = createNoise2D(rng.fork('ground'));
  function heightAt(x, z) {
    let h = (noise(x / 48, z / 48) - 0.5) * 5 + (noise(x / 14 + 3, z / 14) - 0.5) * 1.2;
    // Level ground around the landmarks, and the pool's bowl.
    const dp = distTo(POOL, x, z), dm = distTo(MESA, x, z);
    const dg = distTo(GUESTS, x, z), dc = distTo(CHILDREN, x, z);
    h *= smooth(POOL.r, POOL.r + 18, dp) * smooth(MESA.r, MESA.r + 16, dm) * smooth(GUESTS.r - 4, GUESTS.r + 10, dg) * smooth(CHILDREN.r - 4, CHILDREN.r + 10, dc);
    if (dp < POOL.r) h += 0.3 - 2.9 * (1 - (dp / POOL.r) ** 2);
    else h += 0.3 * smooth(POOL.r + 12, POOL.r, dp);
    // The guests' clearing sinks a little, as if the ground were soft there.
    if (dg < GUESTS.r) h -= 0.35 * (1 - dg / GUESTS.r);
    return h;
  }
  return { heightAt };
}

// ---- Textures ------------------------------------------------------------------------

function tex(own, w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  own.textures.push(t);
  return t;
}

const LEAF_COLORS = ['#c0182c', '#e0283c', '#a00e22', '#ff4a4a', '#e84070', '#7a0818', '#d83a2a', '#ff6a5a'];

function leafTexture(own) {
  return tex(own, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a0a16';
    ctx.fillRect(0, 0, w, h);
    const leaf = (x, y, s, a, c, alpha) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.7, -s * 0.2, 0, s);
      ctx.quadraticCurveTo(-s * 0.7, -s * 0.2, 0, -s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,0,10,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.9);
      ctx.lineTo(0, s);
      ctx.stroke();
      ctx.restore();
    };
    // Several layers: dark leaves underneath, bright ones on top.
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const s = 5 + Math.random() * 9;
        const c = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
        const alpha = layer === 0 ? 0.5 : layer === 1 ? 0.75 : 0.95;
        for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) leaf(x + ox, y + oy, s, Math.random() * Math.PI * 2, c, alpha);
      }
    }
    // Dew: tiny bright points.
    for (let i = 0; i < 400; i++) {
      ctx.globalAlpha = Math.random() * 0.7;
      ctx.fillStyle = '#ffd8e0';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
  });
}

function barkTexture(own) {
  return tex(own, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1e1628';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w;
      ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '6,4,14' : '60,46,78'},${(Math.random() * 0.5).toFixed(2)})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
      ctx.stroke();
    }
  });
}

function rockTexture(own) {
  return tex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1c1a2c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '70,66,100' : '6,6,14'},${(Math.random() * 0.35).toFixed(2)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    // Wet streaks running down.
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(120,130,190,0.0)');
      g.addColorStop(0.5, 'rgba(120,130,190,0.18)');
      g.addColorStop(1, 'rgba(120,130,190,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 1 + Math.random() * 3, h);
    }
    // Red moss.
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(150,20,40,${(Math.random() * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 2 + Math.random() * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function softTexture(own) {
  return tex(own, 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, false);
}

// ---- Trees ---------------------------------------------------------------------------

function branch(parts, from, dir, len, r0, depth, rng) {
  const g = new THREE.CylinderGeometry(r0 * 0.35, r0, len, 6, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(from.x, from.y, from.z);
  parts.push(g);
  if (depth <= 0) return;
  const tip = from.clone().addScaledVector(dir, len);
  for (let k = 0; k < 2; k++) {
    const a = rng() * Math.PI * 2;
    const d = dir.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5)).normalize();
    branch(parts, from.clone().lerp(tip, 0.55 + rng() * 0.4), d, len * (0.45 + rng() * 0.2), r0 * 0.45, depth - 1, rng);
  }
}

function treeGeometry(seed) {
  let s = seed;
  const rng = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const H = 24 + rng() * 6;
  const trunk = new THREE.CylinderGeometry(0.2, 0.5, H, 9, 14, true);
  trunk.translate(0, H / 2, 0);
  const p = trunk.attributes.position;
  const lean = (rng() - 0.5) * 2.2, lean2 = (rng() - 0.5) * 1.4, ph = rng() * 6;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / H;
    // A flared base, a slow lean, a slight wander.
    const flare = 1 + Math.max(0, 0.9 - y) * 0.9;
    p.setX(i, p.getX(i) * flare + lean * t * t * 3 + Math.sin(t * 5 + ph) * 0.18);
    p.setZ(i, p.getZ(i) * flare + lean2 * t * t * 3);
  }
  trunk.computeVertexNormals();
  // UVs in metres up the trunk.
  const uv = trunk.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * H / 3);
  const parts = [trunk];
  // Branches reaching up for the sky.
  const n = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const t = 0.42 + rng() * 0.45, y = H * t;
    const a = rng() * Math.PI * 2;
    const from = new THREE.Vector3(lean * t * t * 3, y, lean2 * t * t * 3);
    const dir = new THREE.Vector3(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55).normalize();
    branch(parts, from, dir, 5 + rng() * 5, 0.16 - t * 0.08, 1, rng);
  }
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return geo;
}

export class Trees {
  constructor(ground, own, rng) {
    this.ground = ground;
    this.CS = 40;
    this.seed = Math.floor(rng.next() * 1e6);
    this.variants = [treeGeometry(11 + this.seed % 997), treeGeometry(7919 + this.seed % 991), treeGeometry(104729 + this.seed % 983)];
    own.geos.push(...this.variants);
    const bark = barkTexture(own);
    this.mat = new THREE.MeshLambertMaterial({ map: bark, color: 0xffffff });
    own.mats.push(this.mat);
    this.group = new THREE.Group();
    this.chunks = new Map();
  }

  hash(i, j, k) {
    let h = (i * 374761393 + j * 668265263 + k * 1442695041 + this.seed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  blocked(x, z) {
    return distTo(MESA, x, z) < MESA.r + 3 || distTo(POOL, x, z) < POOL.r + 3 || distTo(GUESTS, x, z) < GUESTS.r || distTo(CHILDREN, x, z) < CHILDREN.r + 2 || distTo(SPAWN, x, z) < 3;
  }

  build(ci, cj) {
    const { CS } = this;
    const trees = [];
    const N = 6, cell = CS / N;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const k = a * N + b;
      if (this.hash(ci, cj, k) < 0.12) continue;
      const x = ci * CS + (a + 0.15 + this.hash(ci, cj, k + 100) * 0.7) * cell;
      const z = cj * CS + (b + 0.15 + this.hash(ci, cj, k + 200) * 0.7) * cell;
      if (this.blocked(x, z)) continue;
      const s = 0.75 + this.hash(ci, cj, k + 300) * 0.6;
      trees.push({ x, z, s, r: 0.5 * s, rot: this.hash(ci, cj, k + 400) * Math.PI * 2, v: Math.floor(this.hash(ci, cj, k + 500) * 3) });
    }
    const group = new THREE.Group();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let v = 0; v < 3; v++) {
      const list = trees.filter((t) => t.v === v);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.variants[v], this.mat, list.length);
      list.forEach((t, i) => {
        p.set(t.x, this.ground.heightAt(t.x, t.z) - 0.3, t.z);
        q.setFromAxisAngle(up, t.rot);
        sc.set(t.s, 0.85 + t.s * 0.25, t.s);
        mesh.setMatrixAt(i, m4.compose(p, q, sc));
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return { group, trees };
  }

  update(px, pz) {
    const { CS } = this;
    const ci = Math.floor(px / CS), cj = Math.floor(pz / CS);
    if (ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const keep = new Set();
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const key = `${i},${j}`;
      keep.add(key);
      if (this.chunks.has(key)) continue;
      const c = this.build(i, j);
      this.chunks.set(key, c);
      this.group.add(c.group);
    }
    for (const [key, c] of this.chunks) {
      if (keep.has(key)) continue;
      this.group.remove(c.group);
      for (const m of c.group.children) m.dispose?.();
      this.chunks.delete(key);
    }
  }

  // Push a circle out of the trunks.
  collide(pos, r) {
    const ci = Math.floor(pos.x / this.CS), cj = Math.floor(pos.z / this.CS);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const c = this.chunks.get(`${i},${j}`);
      if (!c) continue;
      for (const t of c.trees) {
        const dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz), min = t.r + r;
        if (d >= min || d < 1e-5) continue;
        pos.x = t.x + (dx / d) * min;
        pos.z = t.z + (dz / d) * min;
      }
    }
  }

  dispose() {
    for (const c of this.chunks.values()) for (const m of c.group.children) m.dispose?.();
  }
}

// ---- Ground and grass --------------------------------------------------------------------

export function buildGround(ground, own) {
  const leaves = leafTexture(own);
  const N = 130, S = 280;
  const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const base = geo.attributes.position.array.slice();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  own.geos.push(geo);
  const mat = new THREE.MeshLambertMaterial({ map: leaves, vertexColors: true, emissive: 0x8a4050, emissiveMap: leaves, emissiveIntensity: 1.0 });
  own.mats.push(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    recenter(px, pz) {
      const cx = Math.round(px / 6) * 6, cz = Math.round(pz / 6) * 6;
      if (Math.abs(cx - this.cx) < 30 && Math.abs(cz - this.cz) < 30) return;
      this.cx = cx;
      this.cz = cz;
      const pos = geo.attributes.position, col = geo.attributes.color, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3] + cx, z = base[i * 3 + 2] + cz;
        const y = ground.heightAt(x, z);
        pos.setXYZ(i, x, y, z);
        uv.setXY(i, x / 5, z / 5);
        // Darker soil in the guests' clearing, wet dark rock by the pool.
        const dg = distTo(GUESTS, x, z), dp = distTo(POOL, x, z);
        const k = smooth(GUESTS.r, GUESTS.r - 6, dg) * 0.65 + smooth(POOL.r + 3, POOL.r - 1, dp) * 0.7;
        const v = 0.85 + Math.max(-0.2, Math.min(0.2, y * 0.06));
        col.setXYZ(i, v * (1 - k * 0.7), v * (1 - k * 0.5), v * (1 - k * 0.35));
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      uv.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

// Wet red grass around you, swaying.
export function buildGrass(ground, own, rng) {
  const t = tex(own, 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = 8 + Math.random() * (w - 16), l = h * (0.4 + Math.random() * 0.6);
      ctx.strokeStyle = ['#8a0e20', '#b0182c', '#6a0a18', '#c83040', '#a01428'][Math.floor(Math.random() * 5)];
      ctx.lineWidth = 1.4 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 10, h - l * 0.5, x + (Math.random() - 0.5) * 20, h - l);
      ctx.stroke();
      if (Math.random() < 0.4) {
        ctx.fillStyle = 'rgba(255,230,240,0.9)';
        ctx.fillRect(x + (Math.random() - 0.5) * 8, h - l * Math.random(), 1.5, 1.5);
      }
    }
  }, false);
  const card = (r) => new THREE.PlaneGeometry(0.9, 0.55).translate(0, 0.27, 0).rotateY(r);
  const parts = [card(0), card(Math.PI / 3), card((2 * Math.PI) / 3)];
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  own.geos.push(geo);
  const mat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, emissive: 0x301018, emissiveMap: t });
  own.mats.push(mat);
  const wind = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wind = wind;
    sh.vertexShader = 'uniform float wind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 wp0 = instanceMatrix * vec4(position, 1.0);
      float sway = sin(wind * 1.3 + wp0.x * 0.2 + wp0.z * 0.13) * 0.1 + sin(wind * 2.7 + wp0.z * 0.5) * 0.03;
      transformed.x += sway * position.y;
      transformed.z += sway * 0.6 * position.y;`,
    );
  };
  const n = 2600;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const seeds = Array.from({ length: n }, () => [rng.next(), rng.next(), rng.next(), rng.next()]);
  return {
    mesh,
    wind,
    recenter(px, pz) {
      if (Math.hypot(px - (this.cx ?? 1e9), pz - (this.cz ?? 1e9)) < 8) return;
      this.cx = px;
      this.cz = pz;
      for (let i = 0; i < n; i++) {
        const [a0, r0, s0, rot] = seeds[i];
        // Snap to a fixed world grid so tufts don't swim as you walk.
        const a = a0 * Math.PI * 2, r = Math.sqrt(r0) * 32;
        let x = Math.round((px + Math.cos(a) * r) / 0.7) * 0.7 + (s0 - 0.5) * 0.5, z = Math.round((pz + Math.sin(a) * r) / 0.7) * 0.7 + (rot - 0.5) * 0.5;
        const hidden = distTo(POOL, x, z) < POOL.r + 0.5 || distTo(GUESTS, x, z) < GUESTS.r - 3;
        p.set(x, ground.heightAt(x, z) - 0.05 - (hidden ? 50 : 0), z);
        q.setFromAxisAngle(up, rot * 6.28);
        const s = 0.45 + s0 * 0.55;
        sc.set(s, s * (0.6 + a0 * 0.6), s);
        mesh.setMatrixAt(i, m4.compose(p, q, sc));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---- Sky --------------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 moonDir;
uniform float time;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}
float stars(vec3 d, float scale, float thresh) {
  vec3 p = d * scale;
  vec3 c = floor(p);
  float h = hash(c);
  if (h < thresh) return 0.0;
  vec3 s = c + 0.5 + (vec3(hash(c + 1.3), hash(c + 2.7), hash(c + 4.1)) - 0.5) * 0.6;
  float r = length(p - s);
  float tw = 0.7 + 0.3 * sin(time * (1.0 + h * 4.0) + h * 40.0);
  return smoothstep(0.35, 0.0, r) * tw * (h - thresh) / (1.0 - thresh);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.55, h));
  // The milky way: a band of haze and crowded stars.
  vec3 bandN = normalize(vec3(0.5, 0.3, 0.8));
  float band = exp(-pow(dot(d, bandN) / 0.2, 2.0));
  float cloud = vnoise(d * 9.0) * 0.6 + vnoise(d * 23.0) * 0.4;
  col += vec3(0.32, 0.22, 0.5) * band * cloud * 0.55 * smoothstep(-0.02, 0.2, h);
  float s = stars(d, 180.0, 0.985) * 1.4 + stars(d, 420.0, 0.99) * 0.8 + stars(d, 300.0, 0.97) * band * 1.2;
  col += vec3(0.95, 0.92, 1.0) * s * smoothstep(-0.02, 0.15, h);
  // The moon, huge and pale, and its glow.
  float m = dot(d, moonDir);
  float disc = smoothstep(0.99935, 0.99952, m);
  float craters = vnoise(d * 260.0) * 0.25 + vnoise(d * 90.0) * 0.2;
  col = mix(col, vec3(0.94, 0.92, 1.0) * (0.85 - craters), disc);
  col += vec3(0.6, 0.55, 0.85) * (pow(max(m, 0.0), 300.0) * 0.5 + pow(max(m, 0.0), 30.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const MOON_DIR = new THREE.Vector3(-0.35, 0.55, -0.76).normalize();

export function buildSky(own) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(0x03041a) },
      horizon: { value: new THREE.Color(0x4a2550) },
      moonDir: { value: MOON_DIR },
      time: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  own.mats.push(mat);
  const geo = new THREE.SphereGeometry(900, 48, 24);
  own.geos.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { mesh, mat };
}

// ---- The waterfall cliff, the pool ------------------------------------------------------------

const FALL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const FALL_FRAG = /* glsl */ `
uniform float time;
varying vec2 vUv;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float y = vUv.y;
  // Streaks rushing down, faster as they fall.
  float sp = time * (1.6 + (1.0 - y) * 1.4);
  float s = n(vec2(vUv.x * 46.0, y * 3.0 + sp * 3.0)) * 0.55 + n(vec2(vUv.x * 120.0, y * 9.0 + sp * 7.0)) * 0.45;
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float foam = smoothstep(0.18, 0.0, y);
  vec3 col = mix(vec3(0.42, 0.46, 0.78), vec3(0.92, 0.92, 1.0), s);
  col += foam * 0.4;
  float a = edge * (0.45 + 0.5 * s) + foam * 0.3;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
  #include <fog_fragment>
}
`;

const POOL_FRAG = /* glsl */ `
uniform float time;
uniform vec3 center;
uniform vec3 moonDir;
varying vec2 vUv;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 d = vWorld.xz - center.xz;
  float r = length(d);
  // Rings spreading out from where the falls come down.
  float ring = sin(r * 3.0 - time * 3.5) * 0.5 + sin(r * 7.0 - time * 6.0 + vWorld.x) * 0.25;
  vec3 nrm = normalize(vec3(d / max(r, 0.01) * ring * 0.12, 1.0));
  nrm = normalize(vec3(nrm.x, 1.0, nrm.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(nrm, v), 0.0), 3.0);
  vec3 col = mix(vec3(0.02, 0.02, 0.07), vec3(0.28, 0.2, 0.45), fres);
  // The moon's reflection, broken by ripples.
  vec3 refl = reflect(-v, nrm);
  col += vec3(0.85, 0.85, 1.0) * pow(max(dot(refl, moonDir), 0.0), 400.0) * 2.0;
  // White water where the falls land.
  col += vec3(0.7, 0.72, 0.9) * smoothstep(0.75, 1.0, sin(r * 2.0 - time * 5.0) * 0.5 + 0.5) * smoothstep(7.0, 1.0, abs(r - 6.0)) * 0.15;
  gl_FragColor = vec4(col, 0.93);
  #include <fog_fragment>
}
`;

export function buildCliff(own, ground, rng) {
  const g = new THREE.Group();
  const noise = createNoise2D(rng.fork('rock'));
  const rock = rockTexture(own);
  const rockMat = new THREE.MeshLambertMaterial({ map: rock, color: 0xb0aac8 });
  own.mats.push(rockMat);
  // The cliff: a rough column of rock, falls on the side facing the pool.
  const geo = new THREE.CylinderGeometry(MESA.r * 0.9, MESA.r, MESA.h + 4, 64, 14, false);
  geo.translate(0, (MESA.h + 4) / 2 - 3, 0);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1) continue;
    const a = Math.atan2(z, x);
    let da = Math.abs(Math.atan2(Math.sin(a - FALL_ANGLE), Math.cos(a - FALL_ANGLE)));
    // Smooth, wet rock behind the falls; jagged everywhere else.
    const rough = smooth(0.12, 0.45, da);
    const bump = (noise(a * 9, y * 0.18) - 0.5) * 5 + (noise(a * 30, y * 0.6) - 0.5) * 1.6;
    const k = (r + bump * rough - (1 - rough) * 0.8) / r;
    if (y > MESA.h - 0.5) {
      // The top: a lip, slightly domed.
      p.setY(i, y + (noise(x * 0.1, z * 0.1) - 0.5) * 1.5);
    }
    p.setX(i, x * k);
    p.setZ(i, z * k);
    uv.setXY(i, (a * MESA.r) / 6, y / 6);
  }
  geo.computeVertexNormals();
  own.geos.push(geo);
  const cliff = new THREE.Mesh(geo, rockMat);
  g.add(cliff);
  // The cave behind the middle fall: a black mouth in the rock.
  const caveMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  own.mats.push(caveMat);
  const shape = new THREE.Shape();
  shape.moveTo(-1.6, 0);
  shape.lineTo(-1.6, 2.8);
  shape.quadraticCurveTo(0, 4.8, 1.6, 2.8);
  shape.lineTo(1.6, 0);
  const caveGeo = new THREE.ShapeGeometry(shape);
  own.geos.push(caveGeo);
  const cave = new THREE.Mesh(caveGeo, caveMat);
  const cr = MESA.r - 0.75;
  cave.position.set(Math.cos(FALL_ANGLE) * cr, -0.4, Math.sin(FALL_ANGLE) * cr);
  cave.rotation.y = Math.PI / 2 - FALL_ANGLE;
  g.add(cave);
  // The falls.
  const fallMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  own.mats.push(fallMat);
  const falls = [];
  for (const [da, w, top] of [[0, 7, MESA.h], [-0.24, 3.2, MESA.h - 2], [0.27, 2.6, MESA.h - 1]]) {
    const cols = 12, rows = 24;
    const fg = new THREE.PlaneGeometry(1, 1, cols, rows);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const u = fp.getX(i) + 0.5, v = fp.getY(i) + 0.5;
      const a = FALL_ANGLE + da + ((u - 0.5) * w) / MESA.r;
      const y = v * (top + 0.3) - 0.3;
      // Arcing out from the lip and down into the pool.
      const out = MESA.r * 0.9 + 0.6 + (1 - v) * (1 - v) * 3.4 + (1 - v) * MESA.r * 0.1;
      fp.setXYZ(i, Math.cos(a) * out, y, Math.sin(a) * out);
    }
    own.geos.push(fg);
    const fm = new THREE.Mesh(fg, fallMat);
    fm.renderOrder = 4;
    g.add(fm);
    falls.push({ da, w });
  }
  // The pool.
  const poolGeo = new THREE.CircleGeometry(POOL.r + 0.6, 64).rotateX(-Math.PI / 2);
  own.geos.push(poolGeo);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, center: { value: new THREE.Vector3() }, moonDir: { value: MOON_DIR } }]),
    vertexShader: FALL_VERT, fragmentShader: POOL_FRAG, transparent: true, fog: true,
  });
  own.mats.push(poolMat);
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.renderOrder = 3;
  pool.position.set(POOL.x - MESA.x, 0.02, POOL.z - MESA.z);
  g.add(pool);
  // Dark wet stones around the rim.
  const stones = [];
  for (let k = 0; k < 26; k++) {
    const a = rng.range(0, Math.PI * 2), r = POOL.r + rng.range(-0.5, 1.6);
    const sx = POOL.x - MESA.x + Math.cos(a) * r, sz = POOL.z - MESA.z + Math.sin(a) * r;
    const s = rng.range(0.4, 1.3);
    const sg = new THREE.IcosahedronGeometry(1, 0).scale(s, s * 0.6, s * rng.range(0.8, 1.3)).rotateY(rng.range(0, 6));
    sg.translate(sx, ground.heightAt(sx + MESA.x, sz + MESA.z) + s * 0.1, sz);
    stones.push(sg);
  }
  const stoneGeo = mergeGeometries(stones);
  for (const s of stones) s.dispose();
  own.geos.push(stoneGeo);
  g.add(new THREE.Mesh(stoneGeo, rockMat));
  // Mist where the water comes down.
  const mist = buildMist(own);
  const ma = FALL_ANGLE;
  mist.points.position.set(Math.cos(ma) * (MESA.r + 3.5), 0.2, Math.sin(ma) * (MESA.r + 3.5));
  g.add(mist.points);
  // A pale light off the white water.
  const light = new THREE.PointLight(0x9aa6ff, 3, 34, 1.4);
  light.position.set(Math.cos(ma) * (MESA.r + 5), 3, Math.sin(ma) * (MESA.r + 5));
  g.add(light);
  return { group: g, fallMat, poolMat, mist };
}

function buildMist(own) {
  const n = 260;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 6], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  own.geos.push(geo);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: /* glsl */ `
      uniform float time;
      attribute float seed;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        float t = fract(time * 0.12 + seed);
        vec3 p = position + vec3(sin(seed * 40.0 + time * 0.3) * 2.0 * t, t * 9.0, cos(seed * 30.0) * 2.0 * t);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vA = sin(t * 3.14159) * 0.22;
        gl_PointSize = (180.0 + seed * 200.0) * t / max(1.0, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
        gl_FragColor = vec4(0.82, 0.84, 1.0, a);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  own.mats.push(mat);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return { points, mat };
}

// ---- Drifting fog banks, motes, falling leaves --------------------------------------------------

export function buildFogBanks(own, rng) {
  const soft = softTexture(own);
  const group = new THREE.Group();
  const banks = [];
  const colors = [0x5a6ad0, 0x8a4aa0, 0x4a5ab8, 0xa05a8a, 0x6a5ab0];
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.SpriteMaterial({ map: soft, color: colors[i % colors.length], transparent: true, opacity: rng.range(0.08, 0.16), depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    own.mats.push(mat);
    const s = new THREE.Sprite(mat);
    const w = rng.range(26, 50);
    s.scale.set(w, w * 0.35, 1);
    s.userData = { drift: rng.range(-0.6, 0.6), base: mat.opacity };
    group.add(s);
    banks.push(s);
  }
  return {
    group,
    update(dt, px, pz, ground, rand) {
      for (const s of banks) {
        const dx = s.position.x - px, dz = s.position.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > 95 || !s.userData.placed) {
          s.userData.placed = true;
          const a = rand() * Math.PI * 2, r = 25 + rand() * 65;
          const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
          s.position.set(x, ground.heightAt(x, z) + 2.5 + rand() * 5, z);
        }
        s.position.x += s.userData.drift * dt;
        // Fade out as you walk into it.
        s.material.opacity = s.userData.base * smooth(8, 30, d);
      }
    },
  };
}

export function buildMotes(own) {
  const n = 1400;
  const pos = new Float32Array(n * 3);
  const kind = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 50, Math.random() * 18, (Math.random() - 0.5) * 50], i * 3);
    kind[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
  own.geos.push(geo);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, center: { value: new THREE.Vector3() } }]),
    vertexShader: /* glsl */ `
      uniform float time;
      uniform vec3 center;
      attribute float kind;
      varying float vK;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        vK = kind;
        vec3 p = position;
        if (kind < 0.55) {
          // Falling leaves: drifting down, swaying side to side.
          p.y -= time * (0.4 + kind * 0.8);
          p.x += sin(time * 1.3 + kind * 50.0) * 0.8;
          p.z += cos(time * 1.1 + kind * 70.0) * 0.6;
        } else {
          // Motes of light, wandering.
          p += vec3(sin(time * 0.4 + kind * 90.0), sin(time * 0.3 + kind * 40.0) * 0.5, cos(time * 0.35 + kind * 60.0)) * 1.5;
        }
        p = vec3(mod(p.x - center.x + 25.0, 50.0) - 25.0 + center.x, mod(p.y - center.y + 4.0, 18.0) - 4.0 + center.y, mod(p.z - center.z + 25.0, 50.0) - 25.0 + center.z);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(25.0, 8.0, length(p.xz - center.xz));
        if (kind >= 0.55) vA *= 0.5 + 0.5 * sin(time * (2.0 + kind * 3.0) + kind * 100.0);
        gl_PointSize = min(kind < 0.55 ? 7.0 : 4.0, (kind < 0.55 ? 70.0 : 45.0) / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying float vK;
      varying float vA;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float d = length(gl_PointCoord - 0.5);
        vec3 c = vK < 0.55 ? mix(vec3(0.75, 0.06, 0.12), vec3(1.0, 0.35, 0.3), vK * 1.8) : vec3(1.0, 0.85, 0.95);
        float a = (vK < 0.55 ? smoothstep(0.5, 0.3, d) : smoothstep(0.5, 0.0, d)) * vA;
        if (a < 0.02) discard;
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  own.mats.push(mat);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

// ---- The guests: bones lying in the soil, glistening -------------------------------------------

export function buildGuests(own, ground, rng) {
  const g = new THREE.Group();
  const parts = skeletonGeo();
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  own.geos.push(geo);
  const mat = new THREE.MeshLambertMaterial({ color: 0xf0eaf8, emissive: 0x4a4868 });
  own.mats.push(mat);
  const n = 16;
  const bones = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // Laid out in a loose ring, heads to the middle, as if meditating together.
    const a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15), r = rng.range(3.5, GUESTS.r - 4.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    p.set(x, ground.heightAt(GUESTS.x + x, GUESTS.z + z) - 0.04, z);
    q.setFromEuler(e.set(0, Math.PI / 2 - a + Math.PI, rng.range(-0.1, 0.1)));
    sc.setScalar(rng.range(1.0, 1.15));
    bones.setMatrixAt(i, m4.compose(p, q, sc));
  }
  g.add(bones);
  // Pale flowers growing out of them.
  const flowerGeo = new THREE.SphereGeometry(0.06, 6, 4);
  own.geos.push(flowerGeo);
  const flowerMat = new THREE.MeshBasicMaterial({ color: 0xf2e8ff });
  own.mats.push(flowerMat);
  const fl = new THREE.InstancedMesh(flowerGeo, flowerMat, 120);
  for (let i = 0; i < 120; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * (GUESTS.r - 4.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    fl.setMatrixAt(i, m4.makeTranslation(x, ground.heightAt(GUESTS.x + x, GUESTS.z + z) + 0.05 + rng.next() * 0.15, z));
  }
  g.add(fl);
  // Moonlight seems to gather here.
  const light = new THREE.PointLight(0xb8b0ff, 4, 22, 1.3);
  light.position.set(0, 6, 0);
  g.add(light);
  return { group: g };
}
