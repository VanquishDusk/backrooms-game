import * as THREE from 'three';
import { createNoise2D } from '../../core/rng.js';
import { paintTex } from './kit.js';

// Level 94's ground: a flat town, then smooth round grassy hills in every
// direction, forever. Somewhere out there a transparent mountain rises
// with a castle on top; seen from the town, the castle seems to float.

export const TOWN = { x: 100, z: 100, r: 70 };
const CELL = 85;

function hash(i, j, k = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function makeTerrain(rng) {
  const noise = createNoise2D(rng.fork('ground'));
  const seed = Math.floor(rng.next() * 1e6);
  // The water tower's hill, close to town, and the transparent mountain.
  const wa = rng.range(0, Math.PI * 2);
  const tower = { x: TOWN.x + Math.cos(wa) * 150, z: TOWN.z + Math.sin(wa) * 150, R: 46, h: 24 };
  const ma = wa + Math.PI + rng.range(-0.8, 0.8);
  const mountain = { x: TOWN.x + Math.cos(ma) * 430, z: TOWN.z + Math.sin(ma) * 430, R: 135, H: 74 };

  const dome = (dx, dz, R, h) => {
    const u = (dx * dx + dz * dz) / (R * R);
    return u < 1 ? h * (1 - u) * (1 - u) : 0;
  };

  function hillsAt(x, z) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let h = 0;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const cx = (i + 0.2 + hash(i, j, seed) * 0.6) * CELL, cz = (j + 0.2 + hash(i, j, seed + 1) * 0.6) * CELL;
        const R = 34 + hash(i, j, seed + 2) * 30, hh = 9 + hash(i, j, seed + 3) * 22;
        h = Math.max(h, dome(x - cx, z - cz, R, hh));
      }
    }
    return h;
  }

  function heightAt(x, z) {
    const r = Math.hypot(x - TOWN.x, z - TOWN.z);
    let h = hillsAt(x, z) + (noise(x / 60, z / 60) - 0.5) * 3 + 1.5;
    h = Math.max(h, dome(x - tower.x, z - tower.z, tower.R, tower.h));
    return h * smooth(TOWN.r, TOWN.r + 45, r);
  }

  // The glass under the castle: you can walk up it, if you can find it.
  function glassAt(x, z) {
    const r = Math.hypot(x - mountain.x, z - mountain.z);
    if (r >= mountain.R) return -Infinity;
    const u = r / mountain.R;
    return mountain.H * Math.pow(1 - u * u, 1.3);
  }

  function groundAt(x, z) {
    return Math.max(heightAt(x, z), glassAt(x, z));
  }

  return { heightAt, glassAt, groundAt, tower, mountain, hillsAt };
}

// ---- The ground mesh, recentred on the player as they walk ------------------------

export function buildGround(terrain, own) {
  const grass = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#96c452';
    ctx.fillRect(0, 0, w, h);
    // Felt-like tufts and a few lighter dabs: grass as it'd be in a model.
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 2 + Math.random() * 5;
      const g = 120 + Math.random() * 80;
      ctx.strokeStyle = `rgba(${60 + Math.random() * 50},${g},${30 + Math.random() * 30},0.6)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y - l);
      ctx.stroke();
    }
  });
  const N = 150, S = 760;
  const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const base = geo.attributes.position.array.slice();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  own.geos.push(geo);
  const mat = new THREE.MeshLambertMaterial({ map: grass, vertexColors: true });
  own.mats.push(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const noise = (x, z) => Math.sin(x * 0.05) * Math.sin(z * 0.043) * 0.5 + 0.5;
  const ground = {
    mesh,
    cx: NaN,
    cz: NaN,
    recenter(px, pz) {
      const step = 5;
      const cx = Math.round(px / step) * step, cz = Math.round(pz / step) * step;
      if (Math.abs(cx - this.cx) < 40 && Math.abs(cz - this.cz) < 40) return;
      this.cx = cx;
      this.cz = cz;
      const pos = geo.attributes.position, col = geo.attributes.color, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3] + cx, z = base[i * 3 + 2] + cz;
        const y = terrain.heightAt(x, z);
        pos.setXYZ(i, x, y, z);
        uv.setXY(i, x / 5, z / 5);
        // Lighter tops, deeper green in the dips, a few yellower patches.
        const k = Math.min(1, y / 30);
        const n = noise(x, z);
        col.setXYZ(i, 0.92 + k * 0.3 + n * 0.12, 1.0 + k * 0.12, 0.82 + n * 0.12);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      uv.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
  return ground;
}

// ---- Sky: day, dusk, night ------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float night;
varying vec3 vDir;
void main() {
  float h = max(vDir.y, 0.0);
  vec3 c = mix(horizon, top, pow(h, 0.5));
  float s = max(dot(normalize(vDir), sunDir), 0.0);
  // A flat cut-out sun (or moon), and a soft glow around it.
  c = mix(c, sunColor, smoothstep(0.9975, 0.998, s));
  c += sunColor * pow(s, 60.0) * 0.25 * (1.0 - night * 0.6);
  gl_FragColor = vec4(c, 1.0);
}
`;

export function buildSky(own, rng) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(0x5a96dc) },
      horizon: { value: new THREE.Color(0xc4dcf0) },
      sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
      sunColor: { value: new THREE.Color(0xfff8e0) },
      night: { value: 0 },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  own.mats.push(mat);
  const geo = new THREE.SphereGeometry(900, 32, 16);
  own.geos.push(geo);
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  group.add(dome);
  // Stars.
  const n = 700;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), y = rng.range(0.08, 1);
    const r = Math.sqrt(1 - y * y);
    arr.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  own.geos.push(sg);
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  own.mats.push(starMat);
  const stars = new THREE.Points(sg, starMat);
  stars.frustumCulled = false;
  group.add(stars);
  // Puffy cut-out clouds.
  const cloudTex = paintTex(own, 256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 22 + Math.random() * 28;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(30, 80, 196, 30);
    // A painted shadow along the bottom.
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(0, 60, 0, 112);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(150,170,200,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, false);
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false });
  own.mats.push(cloudMat);
  const clouds = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = rng.range(0, Math.PI * 2), r = rng.range(150, 650);
    s.userData = { a, r, y: rng.range(110, 220), speed: rng.range(0.6, 1.4) };
    const w = rng.range(70, 140);
    s.scale.set(w, w / 2, 1);
    group.add(s);
    clouds.push(s);
  }
  return { group, mat, stars, starMat, clouds, cloudMat };
}
