import * as THREE from 'three';
import { createNoise2D } from '../../core/rng.js';
import { disposeTextures, mergeGeometries } from '../../world/props.js';
import { Kit, Colliders, paintTex } from '../level94/kit.js';

// Level 10 — "Bumper Crop".
//
// For a moment, you'd think you had escaped. Endless fields of wheat and
// barley under a flat grey sky, divided into plots by lines of trees and
// hedges. Wind moves through the crop. Now and then it rains. Brick barns
// and wooden sheds stand empty, apart from the odd supply, and pages of a
// diary somebody left. Grey lakes lie in the low ground.
//
// It's safe. Almost: stand still on the soil for long enough and the worms
// come up to see what you are.
//
//   - Follow a dirt track long enough and you reach Level 11
//   - Walk into a patch of bright yellow canola among the wheat: Level 184
//   - Swim out into a lake and go under: somewhere wetter (Level 7)

const P = 70; // plot size
const WATER = -1.6;
const HEDGE = 2.2; // half-width of a hedgerow

const DIARY = [
  'A page in a child\'s handwriting: "Back home I had a game. I\'d leave an apple core on the doorstep and watch it every day until it was gone. It stained the concrete. I felt like the ruler of the world."',
  'Another page: "Me, Mum, Dad and the dog clipped into Level 1 on a picnic. We tried Level 4 but the dog kept clawing at the windows. 5, 6 and 8 were horrible. But when we got here... it was worth it."',
  '"I\'ll never forget the smell of the wheat when we lay down on the wet soil. Worms came up but I didn\'t mind. Mum and Dad found a barn. It\'s our home now. Everything is going to be alright."',
  '"Mum made a new wooden doorstep. She\'s been saying she feels weak. I put a bit of wheat on it to play my game."',
  '"The wheat never rots. Not one bit. A worm came up, took a bite, and turned right around. It\'s all any of us have been eating."',
];

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hash(i, j, k = 0, seed = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 1442695041 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const CROPS = {
  wheat: { ground: [0.92, 0.74, 0.42], tuft: 0xfff4dc, h: 1.0 },
  barley: { ground: [0.88, 0.8, 0.52], tuft: 0xfbf8e8, h: 0.85 },
  stubble: { ground: [0.9, 0.74, 0.46], tuft: 0xffe8b8, h: 0.25 },
  ploughed: { ground: [0.36, 0.28, 0.2], tuft: null, h: 0 },
};

export class Level10 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.noise = createNoise2D(rng.fork('ground'));
    this.cameraFar = 700;
    this.own = { geos: [], mats: [], textures: [] };
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(14);
    this.buildMaterials();
    this.buildSky();
    this.buildGround();
    this.buildWater();
    this.buildWheat();
    this.buildRain();
    this.plots = new Map();
    this.hemi = new THREE.HemisphereLight(0xeef0f2, 0xb8aa88, 1.8);
    this.sun = new THREE.DirectionalLight(0xf0f0ec, 1.0);
    this.sun.target = new THREE.Object3D();
    this.group.add(this.hemi, this.sun, this.sun.target);

    // Start on a track at the edge of a field.
    let sx = 5, sz = 30;
    for (let k = 0; k < 40 && this.heightAt(sx, sz) < WATER + 1.5; k++) sz += 7;
    this.spawn = { x: sx, z: sz, yaw: Math.PI + 0.7 };
    this.world = {
      collide: (pos, r) => this.colliders.collide(pos, r),
      groundAt: (x, z) => Math.max(this.heightAt(x, z), WATER - 1.2),
      sampleLight: () => [0.9, 0.9, 0.9],
    };
    this.update0 = true;
    this.time = 0;
    this.done = false;
    this.told = {};
    this.diary = 0;
    this.roadDist = 0;
    this.lastPos = { x: sx, z: sz };
    this.still = 0;
    this.worms = null;
    this.weather = { state: 'dry', t: 0, next: this.rng.range(70, 120), k: 0 };
    this.fog = new THREE.Color();
    this.updatePlots({ pos: { x: sx, z: sz } }, true);
    this.script = [
      [1.5, 'Wheat. Fields of it, under a grey sky. Wind moving through it. For a moment you think you\'ve escaped the Backrooms.'],
      [9, 'A dirt track runs along the field, two ruts with grass between them. Something drives here. You never see what.'],
    ];
  }

  // ---- The land -----------------------------------------------------------------------

  heightAt(x, z) {
    const n = this.noise;
    let h = (n(x / 210, z / 210) - 0.5) * 24 + (n(x / 60 + 7, z / 60) - 0.5) * 3 + (n(x / 17, z / 17 + 3) - 0.5) * 0.5;
    // Keep the start dry.
    h += 6 * smooth(90, 20, Math.hypot(x - 20, z - 30));
    // Tracks never drown: where one crosses a lake it rides a low causeway.
    if (h < WATER + 0.7) {
      const p = this.plotAt(x, z);
      const lx = x - p.i * P, lz = z - p.j * P;
      let d = 99;
      if (p.pathW) d = Math.abs(lx - 5);
      if (p.pathN) d = Math.min(d, Math.abs(lz - 5));
      const k = smooth(7, 3, d);
      if (k > 0) h += (WATER + 0.7 - h) * k;
    }
    return h;
  }

  plot(i, j) {
    const h = (k) => hash(i, j, k, this.seed);
    const r = h(1);
    const crop = i === 0 && j === 0 ? 'wheat' : r < 0.48 ? 'wheat' : r < 0.74 ? 'barley' : r < 0.93 ? 'stubble' : 'ploughed';
    const west = (i === 0 && j === 0) || h(2) < 0.4;
    const north = h(3) < 0.35;
    return {
      i, j, crop,
      pathW: west, pathN: north,
      gapW: 8 + h(4) * (P - 22), gapN: 8 + h(5) * (P - 22),
      barn: h(6) < 0.2 || (i === 0 && j === 0),
      shed: h(7) < 0.15,
      canola: crop === 'wheat' && h(8) < 0.12 && !(i === 0 && j === 0),
      cx: i * P + 20 + h(9) * 30, cz: j * P + 20 + h(10) * 30, rot: Math.floor(h(11) * 4) * (Math.PI / 2),
      sx: i * P + 12 + h(12) * 46, sz: j * P + 12 + h(13) * 46,
      kx: i * P + 18 + h(14) * 34, kz: j * P + 18 + h(15) * 34,
    };
  }

  plotAt(x, z) {
    return this.plot(Math.floor(x / P), Math.floor(z / P));
  }

  // On a dirt track? (Returns the track's direction, or null.)
  onTrack(x, z) {
    const p = this.plotAt(x, z);
    const lx = x - p.i * P, lz = z - p.j * P;
    if (p.pathW && Math.abs(lx - 5) < 2) return 'z';
    if (p.pathN && Math.abs(lz - 5) < 2) return 'x';
    return null;
  }

  inHedge(x, z) {
    const p = this.plotAt(x, z);
    const lx = x - p.i * P, lz = z - p.j * P;
    if (lx < HEDGE && !(Math.abs(lz - p.gapW) < 4) && !(p.pathN && lz < 8)) return true;
    if (lz < HEDGE && !(Math.abs(lx - p.gapN) < 4) && !(p.pathW && lx < 8)) return true;
    return false;
  }

  cropAt(x, z) {
    const h = this.heightAt(x, z);
    if (h < WATER + 0.5) return 'shore';
    if (this.onTrack(x, z) || this.inHedge(x, z)) return 'track';
    const p = this.plotAt(x, z);
    if (p.canola && Math.hypot(x - p.kx, z - p.kz) < 9) return 'canola';
    if (p.barn && Math.abs(x - p.cx) < 13 && Math.abs(z - p.cz) < 13) return 'yard';
    return p.crop;
  }

  // ---- Materials, sky, ground --------------------------------------------------------------

  buildMaterials() {
    const own = this.own;
    const T = {};
    T.ground = paintTex(own, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '120,100,60' : '255,250,230'},${(Math.random() * 0.25).toFixed(2)})`;
        const x = Math.random() * w, y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
        ctx.stroke();
      }
    });
    T.brick = paintTex(own, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#a88270';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < w; x += 32) {
        const v = Math.random() * 30;
        ctx.fillStyle = `rgb(${200 + v},${118 + v * 0.6},${92 + v * 0.4})`;
        ctx.fillRect(x + 1, y + 1, 30, 14);
      }
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = `rgba(40,30,20,${(Math.random() * 0.15).toFixed(2)})`;
        ctx.fillRect(Math.random() * w, 0, 6 + Math.random() * 30, h);
      }
    });
    T.roof = paintTex(own, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#a4a49c';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x, 0, 3, h);
      }
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '30,30,26' : '120,120,90'},${(Math.random() * 0.3).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 6 + Math.random() * 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    T.planks = paintTex(own, 128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#5a4a36';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 12) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,15,10' : '110,95,70'},0.4)`;
        ctx.fillRect(x, 0, 11, h);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x + 11, 0, 1, h);
      }
    });
    T.hay = paintTex(own, 64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#c8a860';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '90,70,30' : '240,220,150'},0.5)`;
        const x = Math.random() * w, y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 3);
        ctx.stroke();
      }
    });
    T.tuft = paintTex(own, 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let k = 0; k < 34; k++) {
        const x = 6 + Math.random() * (w - 12), top = 8 + Math.random() * 30;
        ctx.strokeStyle = `rgb(${232 + Math.random() * 23},${215 + Math.random() * 30},${165 + Math.random() * 40})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 6, h * 0.6, x + (Math.random() - 0.5) * 8, top + 14);
        ctx.stroke();
        // The ear of grain.
        ctx.fillStyle = `rgb(${238 + Math.random() * 17},${222 + Math.random() * 28},${170 + Math.random() * 40})`;
        ctx.beginPath();
        ctx.ellipse(x + (Math.random() - 0.5) * 6, top + 6, 2.2, 8, (Math.random() - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }, false);
    T.paper = paintTex(own, 32, 32, (ctx, w, h) => {
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(40,40,80,0.5)';
      for (let y = 6; y < h; y += 4) ctx.fillRect(3, y, w - 6, 1);
    }, false);
    const L = (o) => {
      const m = new THREE.MeshLambertMaterial(o);
      own.mats.push(m);
      return m;
    };
    this.T = T;
    this.M = {
      brick: L({ map: T.brick, emissive: 0x4a3a34, emissiveMap: T.brick }),
      roof: L({ map: T.roof, emissive: 0x6a6a66, emissiveMap: T.roof }),
      door: L({ color: 0x4a5258 }),
      planks: L({ map: T.planks }),
      hay: L({ map: T.hay }),
      dark: L({ color: 0x1a1612 }),
      floor: L({ color: 0x5a4a38 }),
      paper: L({ map: T.paper }),
      trunk: L({ color: 0x3a3028 }),
      leaves: L({ color: 0xffffff }),
      track: L({ color: 0x7a6a50 }),
      verge: L({ color: 0x6a7a44 }),
      worm: L({ color: 0xc88078 }),
    };
  }

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, dark: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float dark;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec2 uv = d.xz / (0.25 + y) * 2.0 + vec2(time * 0.01, time * 0.004);
          float c = n(uv) * 0.5 + n(uv * 2.3) * 0.3 + n(uv * 5.1) * 0.2;
          vec3 base = mix(vec3(0.82, 0.83, 0.84), vec3(0.6, 0.62, 0.64), smoothstep(0.0, 0.6, y));
          vec3 col = mix(base, base * 0.78, smoothstep(0.35, 0.8, c));
          col = mix(col, col * 0.62, dark);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.own.mats.push(mat);
    const geo = new THREE.SphereGeometry(650, 32, 16);
    this.own.geos.push(geo);
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  buildGround() {
    const N = 160, S = 520;
    const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
    const base = geo.attributes.position.array.slice();
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.own.geos.push(geo);
    const mat = new THREE.MeshLambertMaterial({ map: this.T.ground, vertexColors: true });
    this.own.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const self = this;
    this.ground = {
      recenter(px, pz) {
        const cx = Math.round(px / 8) * 8, cz = Math.round(pz / 8) * 8;
        if (Math.abs(cx - this.cx) < 48 && Math.abs(cz - this.cz) < 48) return;
        this.cx = cx;
        this.cz = cz;
        const pos = geo.attributes.position, col = geo.attributes.color, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3] + cx, z = base[i * 3 + 2] + cz;
          const y = self.heightAt(x, z);
          pos.setXYZ(i, x, y, z);
          uv.setXY(i, x / 4, z / 4);
          const c = self.cropAt(x, z);
          let rgb;
          if (c === 'shore') rgb = y < WATER ? [0.35, 0.32, 0.26] : [0.45, 0.52, 0.32];
          else if (c === 'track') rgb = self.inHedge(x, z) ? [0.25, 0.3, 0.18] : [0.5, 0.45, 0.32];
          else if (c === 'canola') rgb = [0.95, 0.85, 0.2];
          else if (c === 'yard') rgb = [0.55, 0.55, 0.36];
          else rgb = CROPS[c].ground;
          const v = 0.9 + self.noise(x / 9, z / 9) * 0.2;
          col.setXYZ(i, rgb[0] * v, rgb[1] * v, rgb[2] * v);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        uv.needsUpdate = true;
        geo.computeVertexNormals();
      },
    };
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2);
    this.own.geos.push(geo);
    const mat = new THREE.MeshPhongMaterial({ color: 0x4a5a64, specular: 0x9aa8b0, shininess: 80, transparent: true, opacity: 0.88 });
    this.own.mats.push(mat);
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = WATER;
    this.water.frustumCulled = false;
    this.group.add(this.water);
  }

  // Wheat around you: crossed cards, swaying in the wind.
  buildWheat() {
    const card = (r) => new THREE.PlaneGeometry(0.8, 1.1).translate(0, 0.55, 0).rotateY(r);
    const parts = [card(0), card(Math.PI / 3), card((2 * Math.PI) / 3)];
    const geo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    this.own.geos.push(geo);
    const mat = new THREE.MeshLambertMaterial({ map: this.T.tuft, alphaTest: 0.4, side: THREE.DoubleSide, emissive: 0x4a4434, emissiveMap: this.T.tuft });
    this.own.mats.push(mat);
    const wind = { value: 0 }, gust = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.wind = wind;
      sh.uniforms.gust = gust;
      sh.vertexShader = 'uniform float wind;\nuniform float gust;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp0 = instanceMatrix * vec4(position, 1.0);
        float wave = sin(wind * 1.6 - wp0.x * 0.18 - wp0.z * 0.07) * 0.5 + 0.5;
        float sway = (0.08 + wave * (0.12 + gust * 0.25)) * position.y;
        transformed.x += sway;
        transformed.z += sway * 0.3;`,
      );
    };
    const n = 7000;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const seeds = Array.from({ length: n }, () => [this.rng.next(), this.rng.next(), this.rng.next(), this.rng.next()]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const self = this;
    this.wheat = {
      wind, gust,
      recenter(px, pz) {
        if (Math.hypot(px - (this.cx ?? 1e9), pz - (this.cz ?? 1e9)) < 6) return;
        this.cx = px;
        this.cz = pz;
        for (let i = 0; i < n; i++) {
          const [a0, r0, j0, k0] = seeds[i];
          const a = a0 * Math.PI * 2, r = Math.sqrt(r0) * 34;
          const x = Math.round((px + Math.cos(a) * r) / 0.6) * 0.6 + (j0 - 0.5) * 0.4;
          const z = Math.round((pz + Math.sin(a) * r) / 0.6) * 0.6 + (k0 - 0.5) * 0.4;
          const c = self.cropAt(x, z);
          let hgt = 0, color = 0;
          if (CROPS[c] && CROPS[c].tuft) {
            hgt = CROPS[c].h;
            color = CROPS[c].tuft;
          } else if (c === 'canola') {
            hgt = 1.1;
            color = 0xffff50;
          } else if (c === 'shore' && self.heightAt(x, z) > WATER + 0.1) {
            hgt = 0.7;
            color = 0xe8e4d0;
          }
          const y = self.heightAt(x, z) - 0.05 - (hgt ? 0 : 60);
          p.set(x, y, z);
          q.setFromAxisAngle(up, a0 * 31);
          const sc = (hgt || 1) * (0.85 + j0 * 0.3);
          s.set(0.9 + k0 * 0.3, sc, 0.9 + k0 * 0.3);
          mesh.setMatrixAt(i, m4.compose(p, q, s));
          mesh.setColorAt(i, col.set(color || 0xffffff).multiplyScalar(0.92 + r0 * 0.12));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
    };
  }

  buildRain() {
    const n = 1500;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 50, y = Math.random() * 20, z = (Math.random() - 0.5) * 50;
      pos.set([x, y, z, x + 0.05, y - 0.6, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.own.geos.push(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0xc8d0d8, transparent: true, opacity: 0, depthWrite: false });
    this.own.mats.push(mat);
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  // ---- Plots: hedgerows, tracks, barns ------------------------------------------------------

  updatePlots(player, force = false) {
    const ci = Math.floor(player.pos.x / P), cj = Math.floor(player.pos.z / P);
    if (!force && ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const keep = new Set();
    for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) {
      const key = `${i},${j}`;
      keep.add(key);
      if (!this.plots.has(key)) this.plots.set(key, this.buildPlot(i, j));
    }
    for (const [key, b] of this.plots) {
      if (keep.has(key)) continue;
      this.group.remove(b.group);
      for (const g of b.geos) g.dispose();
      for (const s of b.solids) this.colliders.remove(s);
      this.plots.delete(key);
    }
  }

  buildPlot(i, j) {
    const p = this.plot(i, j);
    const kit = new Kit();
    const x0 = i * P, z0 = j * P;
    const solids = [];
    const solid = (x, z, hw, hd, rot = 0) => {
      const b = { x, z, hw, hd, rot, y0: -5, y1: 10 };
      this.colliders.add(b);
      solids.push(b);
    };
    const dry = (x, z) => this.heightAt(x, z) > WATER + 0.4;
    // Hedgerows along the west and north edges: clumps of shrubs, a tree now and then.
    const clumps = [], trunks = [];
    const edge = (along, gap, skipStart) => {
      for (let s = 1; s < P; s += 2.6) {
        if (Math.abs(s - gap) < 4 || (skipStart && s < 8)) continue;
        const x = along === 'z' ? x0 : x0 + s, z = along === 'z' ? z0 + s : z0;
        if (!dry(x, z)) continue;
        const k = hash(Math.round(x * 3), Math.round(z * 3), 50, this.seed);
        const tree = k < 0.18;
        const sc = tree ? 3.4 + k * 6 : 1.6 + k * 1.4;
        clumps.push([x + (k - 0.5) * 1.2, this.heightAt(x, z) + (tree ? 5.5 : sc * 0.7), z + (hash(i, j, s, this.seed) - 0.5) * 1.2, sc, k]);
        if (tree) {
          trunks.push([x, this.heightAt(x, z), z]);
          clumps.push([x + 1.5, this.heightAt(x, z) + 7.5, z - 1, sc * 0.7, k]);
        }
      }
      // The hedge is a wall you can only cross at the gap.
      const segs = [[0, gap - 4], [gap + 4, P]];
      for (const [a, b] of segs) {
        const s0 = skipStart ? Math.max(a, 8) : a;
        if (b - s0 < 0.5) continue;
        if (along === 'z') solid(x0, z0 + (s0 + b) / 2, HEDGE * 0.6, (b - s0) / 2);
        else solid(x0 + (s0 + b) / 2, z0, (b - s0) / 2, HEDGE * 0.6);
      }
    };
    edge('z', p.gapW, false);
    edge('x', p.gapN, p.pathW);
    const geos = [];
    const group = new THREE.Group();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    if (clumps.length) {
      if (!this.clumpGeo) {
        this.clumpGeo = new THREE.IcosahedronGeometry(1, 1);
        const pp = this.clumpGeo.attributes.position;
        for (let k = 0; k < pp.count; k++) {
          const f = 1 + (Math.sin(pp.getX(k) * 9 + pp.getY(k) * 7) * 0.12);
          pp.setXYZ(k, pp.getX(k) * f, pp.getY(k) * f * 0.85, pp.getZ(k) * f);
        }
        this.clumpGeo.computeVertexNormals();
        this.trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 6, 7).translate(0, 3, 0);
        this.own.geos.push(this.clumpGeo, this.trunkGeo);
      }
      const im = new THREE.InstancedMesh(this.clumpGeo, this.M.leaves, clumps.length);
      const col = new THREE.Color();
      clumps.forEach(([x, y, z, sc, k], n) => {
        im.setMatrixAt(n, m4.compose(v.set(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * 20), s.set(sc, sc * 0.9, sc)));
        im.setColorAt(n, col.setRGB(0.16 + k * 0.08, 0.26 + k * 0.1, 0.12 + k * 0.04));
      });
      im.computeBoundingSphere();
      group.add(im);
      if (trunks.length) {
        const tm = new THREE.InstancedMesh(this.trunkGeo, this.M.trunk, trunks.length);
        trunks.forEach(([x, y, z], n) => tm.setMatrixAt(n, m4.makeTranslation(x, y, z)));
        tm.computeBoundingSphere();
        group.add(tm);
      }
    }
    // Dirt tracks: two ruts with grass between, following the ground.
    const track = (along) => {
      for (const [off, key, w] of [[-0.8, 'track', 0.7], [0.8, 'track', 0.7], [0, 'verge', 0.9]]) {
        const segs = 35;
        const g = new THREE.PlaneGeometry(w, P, 1, segs).rotateX(-Math.PI / 2);
        const pa = g.attributes.position;
        for (let k = 0; k < pa.count; k++) {
          const lx = pa.getX(k) + off, lz = pa.getZ(k) + P / 2;
          const x = along === 'z' ? x0 + 5 + lx : x0 + lz, z = along === 'z' ? z0 + lz : z0 + 5 + lx;
          pa.setXYZ(k, x, this.heightAt(x, z) + 0.04 + (key === 'verge' ? 0.01 : 0), z);
        }
        g.computeVertexNormals();
        kit.parts[key] = (kit.parts[key] || []).concat([g]);
      }
    };
    if (p.pathW) track('z');
    if (p.pathN) track('x');
    // A barn: brick walls, a grey sloping roof, big doors (one open).
    if (p.barn && dry(p.cx, p.cz) && dry(p.cx + 9, p.cz) && dry(p.cx - 9, p.cz)) {
      const y = Math.min(this.heightAt(p.cx - 9, p.cz - 5), this.heightAt(p.cx + 9, p.cz + 5), this.heightAt(p.cx, p.cz)) - 0.2;
      const W = 18, D = 9, H = 4.2, RH = 3.6, t = 0.3;
      const c = Math.cos(p.rot), sn = Math.sin(p.rot);
      const at = (lx, lz) => [p.cx + lx * c + lz * sn, p.cz - lx * sn + lz * c];
      const box = (key, lx, ly, lz, w, h, d, uv = 0.25) => {
        const [x, z] = at(lx, lz);
        kit.box(key, x, y + ly, z, w, h, d, p.rot, uv);
      };
      const wsolid = (lx, lz, hw, hd) => {
        const [x, z] = at(lx, lz);
        solid(x, z, hw, hd, p.rot);
      };
      box('brick', 0, H / 2, -D / 2, W, H, t);
      box('brick', -W / 2, H / 2, 0, t, H, D);
      box('brick', W / 2, H / 2, 0, t, H, D);
      box('brick', -5.5, H / 2, D / 2, W / 2 - 1.5 + 2, H, t);
      box('brick', 6.5, H / 2, D / 2, W / 2 - 3.5 + 2, H, t);
      wsolid(0, -D / 2, W / 2, t);
      wsolid(-W / 2, 0, t, D / 2);
      wsolid(W / 2, 0, t, D / 2);
      wsolid(-5.5, D / 2, (W / 2 - 1.5 + 2) / 2, t);
      wsolid(6.5, D / 2, (W / 2 - 3.5 + 2) / 2, t);
      // Gable ends.
      const tri = new THREE.Shape();
      tri.moveTo(-D / 2, 0);
      tri.lineTo(D / 2, 0);
      tri.lineTo(0, RH);
      tri.lineTo(-D / 2, 0);
      for (const sx of [-1, 1]) {
        const g = new THREE.ShapeGeometry(tri);
        g.attributes.uv.array.forEach((val, k, a) => (a[k] = val * 0.25));
        const [x, z] = at(sx * W / 2, 0);
        kit.add('brick', g, x, y + H, z, 0, p.rot + Math.PI / 2 * sx, 0);
        g.dispose();
      }
      // Roof slopes.
      const len = Math.hypot(D / 2 + 0.6, RH);
      const ang = Math.atan2(RH, D / 2 + 0.6);
      for (const sz of [-1, 1]) {
        const g = new THREE.BoxGeometry(W + 0.8, 0.15, len);
        g.attributes.uv.array.forEach((val, k, a) => (a[k] = val * 4));
        const [x, z] = at(0, sz * (D / 4 + 0.15));
        kit.add('roof', g, x, y + H + RH / 2, z, sz * ang, p.rot, 0);
        g.dispose();
      }
      // The doorway's dormer and doors: one leaf shut, one open.
      box('door', 3.0, 1.9, D / 2 + 0.05, 2.4, 3.8, 0.08);
      box('door', 3.0 + 3.0, 1.9, D / 2 + 1.2, 0.08, 3.8, 2.4);
      box('roof', 1.8, H + 0.2, D / 2 + 0.3, 5.2, 0.12, 1.0);
      box('floor', 0, 0.02, 0, W - 0.6, 0.04, D - 0.6);
      // Inside: hay bales, a few planks.
      for (let k = 0; k < 6; k++) box('hay', -6 + (k % 3) * 1.3, 0.45 + Math.floor(k / 3) * 0.9, -2.8, 1.2, 0.85, 1.6);
      wsolid(-4.7, -2.8, 2.1, 0.9);
      for (let k = 0; k < 5; k++) box('planks', 5 + k * 0.05, 0.08 + k * 0.08, -3.2, 3.6, 0.06, 0.25);
      // A diary page on a bale, and supplies.
      const page = at(-6, -2.0);
      box('paper', -6, 1.82, -2.4, 0.3, 0.01, 0.22);
      const it = at(2, -1.5);
      p.item = { x: it[0], z: it[1], id: ['water', 'water', 'battery', 'medkit', 'pipe'][Math.floor(hash(i, j, 60, this.seed) * 5)] };
      p.page = { x: page[0], z: page[1] };
      p.inside = { x: p.cx, z: p.cz };
      p.barnY = y;
      p.built = true;
    }
    // A small wooden shed.
    if (p.shed && dry(p.sx, p.sz)) {
      const y = this.heightAt(p.sx, p.sz) - 0.1;
      kit.box('planks', p.sx, y + 1.2, p.sz, 3.2, 2.4, 2.6, p.rot, 0.5);
      const g = new THREE.BoxGeometry(3.6, 0.1, 3.0);
      kit.add('roof', g, p.sx, y + 2.5, p.sz, 0.12, p.rot, 0);
      g.dispose();
      kit.box('dark', p.sx + Math.sin(p.rot) * 1.32, y + 1, p.sz + Math.cos(p.rot) * 1.32, 0.9, 1.9, 0.05, p.rot);
      solid(p.sx, p.sz, 1.7, 1.4, p.rot);
    }
    const own = { geos, mats: this.own.mats, textures: this.own.textures };
    const built = kit.build({ ...this.M }, own);
    group.add(built);
    this.group.add(group);
    // Supplies, once.
    this.placed ||= new Set();
    const key = `${i},${j}`;
    if (p.item && !this.placed.has(key)) {
      this.placed.add(key);
      this.ctx.placeItem?.(p.item.id, p.item.x, p.item.z);
    }
    return { plan: p, group, geos, solids };
  }

  // ---- Per frame ------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    const px = player.pos.x, pz = player.pos.z;
    this.updatePlots(player);
    this.ground.recenter(px, pz);
    this.wheat.recenter(px, pz);
    this.wheat.wind.value = this.time;
    this.sky.position.set(px, 0, pz);
    this.sky.material.uniforms.time.value = this.time;
    this.water.position.x = px;
    this.water.position.z = pz;
    this.sun.position.set(px + 60, 120, pz + 40);
    this.sun.target.position.set(px, 0, pz);
    this.updateWeather(dt, player);
    this.updateBarns(dt, player);
    this.updateWorms(dt, player);
    this.updateExits(dt, player);
    if (this.done) return;
    // Calm: the mind settles here.
    player.sanity = Math.min(100, player.sanity + 0.15 * dt);
    if (player.health <= 0) {
      this.done = true;
      ctx.onDeath('The worms came up for you. They\'d never had anything that wasn\'t wheat.');
    }
  }

  updateWeather(dt, player) {
    const W = this.weather, { ctx } = this;
    W.t += dt;
    if (W.state === 'dry' && W.t > W.next) {
      W.state = 'rain';
      W.t = 0;
      W.dur = this.rng.range(30, 60);
      ctx.hud.message('A light rain starts falling on the wheat.', 3);
    } else if (W.state === 'rain' && W.t > W.dur) {
      W.state = 'dry';
      W.t = 0;
      W.next = this.rng.range(90, 160);
    }
    W.k += ((W.state === 'rain' ? 1 : 0) - W.k) * Math.min(1, dt * 0.4);
    this.rain.material.opacity = W.k * 0.45;
    this.rain.position.set(player.pos.x, player.pos.y - 2 + (-(this.time * 14) % 20 + 20) % 20 - 10, player.pos.z);
    this.sky.material.uniforms.dark.value = W.k;
    this.hemi.intensity = 1.7 - W.k * 0.5;
    // Gusts through the crop.
    this.gustT = (this.gustT ?? 4) - dt;
    if (this.gustT <= 0) {
      this.gustT = this.rng.range(6, 14);
      this.gusting = 3;
      ctx.audio.gust?.(this.rng.range(-1, 1), 0.16, 3);
      ctx.audio.rustle?.(this.rng.range(-1, 1), 0.1, 3);
    }
    this.gusting = Math.max(0, (this.gusting || 0) - dt);
    this.wheat.gust.value = Math.sin(Math.min(1, this.gusting / 3) * Math.PI);
    if (W.k > 0.3 && this.rng.chance(dt * 3)) ctx.audio.drip?.(this.rng.range(-1, 1), 0.05);
  }

  updateBarns(dt, player) {
    const { ctx } = this;
    for (const b of this.plots.values()) {
      const p = b.plan;
      if (!p.built) continue;
      if (!p.toldBarn && Math.hypot(p.cx - player.pos.x, p.cz - player.pos.z) < 22) {
        p.toldBarn = true;
        if (!this.told.barn) {
          this.told.barn = true;
          ctx.hud.message('A big old brick barn, its doors standing open. Empty, mostly.', 3);
        }
      }
      if (p.page && !p.read && Math.hypot(p.page.x - player.pos.x, p.page.z - player.pos.z) < 1.6) {
        p.read = true;
        if (this.diary < DIARY.length) {
          ctx.hud.message(DIARY[this.diary], 9);
          this.diary++;
          if (this.diary === DIARY.length) ctx.award?.('diary10');
        } else ctx.hud.message('A page with nothing written on it but a drawing of a barn.', 3);
      }
    }
  }

  // Stand still on the soil and the worms come up.
  updateWorms(dt, player) {
    const { ctx } = this;
    const crop = this.cropAt(player.pos.x, player.pos.z);
    const soil = crop in CROPS || crop === 'canola';
    const moving = player.speed > 0.4;
    this.still = soil && !moving ? this.still + dt : 0;
    if (this.still > 22 && !this.worms) {
      this.worms = { t: 0, x: player.pos.x, z: player.pos.z };
      ctx.hud.message('The soil around your feet is moving. Something underneath has noticed you.', 4);
      this.buildWormMesh();
      this.wormMesh.visible = true;
    }
    if (!this.worms) return;
    const w = this.worms;
    w.t += dt;
    const d = Math.hypot(player.pos.x - w.x, player.pos.z - w.z);
    if (d > 5) {
      // You walked away: they sink back.
      w.t -= dt;
      w.away = (w.away || 0) + dt;
      if (w.away > 2) {
        this.worms = null;
        this.still = 0;
        this.wormMesh.visible = false;
        return;
      }
    } else {
      w.away = 0;
    }
    if (d <= 5 && w.t > 4) {
      player.damage(4 * dt);
      if (!this.told.wormBite) {
        this.told.wormBite = true;
        ctx.hud.message('They\'re trying to burrow into your skin. Move!', 2.5);
        ctx.audio.chitter?.(0, 0.3);
      }
    }
    // Animate: wriggling up out of the soil.
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const up = Math.max(0, Math.min(1, (w.t + 2) / 3)) * (1 - (w.away || 0) / 2);
    for (let k = 0; k < this.wormMesh.count; k++) {
      const a = k * 2.399, r = 0.5 + (k % 7) * 0.45;
      const x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
      q.setFromEuler(new THREE.Euler(Math.sin(this.time * 6 + k) * 0.6, k, Math.cos(this.time * 5 + k) * 0.6));
      this.wormMesh.setMatrixAt(k, m4.compose(v.set(x, this.heightAt(x, z) + 0.1 * up - 0.12, z), q, s.set(1, up, 1)));
    }
    this.wormMesh.instanceMatrix.needsUpdate = true;
  }

  buildWormMesh() {
    if (this.wormMesh) return;
    const g = new THREE.CapsuleGeometry(0.035, 0.32, 3, 6).translate(0, 0.16, 0);
    this.own.geos.push(g);
    this.wormMesh = new THREE.InstancedMesh(g, this.M.worm, 40);
    this.wormMesh.frustumCulled = false;
    this.group.add(this.wormMesh);
  }

  updateExits(dt, player) {
    const { ctx } = this;
    const px = player.pos.x, pz = player.pos.z;
    // Following a track.
    const moved = Math.hypot(px - this.lastPos.x, pz - this.lastPos.z);
    this.lastPos = { x: px, z: pz };
    if (this.onTrack(px, pz) && moved < 2) {
      this.roadDist += moved;
      if (this.roadDist > 160 && !this.told.road1) {
        this.told.road1 = true;
        ctx.hud.message('The track goes on and on between the fields. Far off, very faintly, traffic?', 4);
      }
      if (this.roadDist > 340 && !this.told.road2) {
        this.told.road2 = true;
        ctx.hud.message('The ruts in the track are deeper here. Tarmac shows through the dirt in places.', 4);
      }
      if (this.roadDist > 480) {
        this.done = true;
        ctx.hud.message('The track turns into a road, the road into a street, and the street is lined with buildings.', 4);
        ctx.onEscape('level11', 'walk');
        return;
      }
    }
    // Canola.
    const pl = this.plotAt(px, pz);
    if (pl.canola) {
      const d = Math.hypot(px - pl.kx, pz - pl.kz);
      if (d < 14 && !this.told[`canola${pl.i},${pl.j}`]) {
        this.told[`canola${pl.i},${pl.j}`] = true;
        ctx.hud.message('A patch of bright yellow flowers in the middle of the wheat. Canola. It doesn\'t belong here.', 4);
      }
      if (d < 2.5) {
        this.done = true;
        ctx.hud.message('You push into the yellow flowers. They close over your head, and keep going.', 4);
        ctx.onEscape('level184', 'walk');
        return;
      }
    }
    // A lake.
    const depth = WATER - this.heightAt(px, pz);
    player.speedMul = depth > 0.3 ? 0.55 : 1;
    if (depth > 0.2 && !this.told.lake) {
      this.told.lake = true;
      ctx.hud.message('The water is cold and clear, and tastes of earth. Press E to drink. It gets deep fast.', 4);
    }
    if (depth > 1.4) {
      this.done = true;
      ctx.audio.splash?.(0, 0.5, true);
      ctx.hud.message('You swim out and dive. The bottom never comes. Then the water is salt, and grey, and goes on forever.', 5);
      ctx.onEscape('level7', 'noclip');
    }
  }

  photoSubjects() {
    if (!this.worms) return [];
    return [{ type: 'worms', x: this.worms.x, y: this.heightAt(this.worms.x, this.worms.z) + 0.1, z: this.worms.z, range: 8, noLos: true }];
  }

  drink(player) {
    const { ctx } = this;
    if (WATER - this.heightAt(player.pos.x, player.pos.z) > 0.05) {
      player.sanity = Math.min(100, player.sanity + 15);
      player.health = Math.min(100, player.health + 5);
      ctx.audio.drink();
      const filled = player.count('water') < 2 && player.give('water');
      ctx.hud.message(filled ? 'Earthy, clear water. You fill a bottle too.' : 'Earthy, clear water.', 2.5);
      return;
    }
    if (!player.takeItem('water')) {
      ctx.hud.message('No Almond Water. (The lakes are safe to drink.)', 2);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    return {
      hum: 0, exitGain: 0, exitPan: 0, drone: 0, machine: 0, jazz: 0,
      wind: 0.1 + (this.gusting ? 0.06 : 0) + this.weather.k * 0.05,
      waves: WATER - this.heightAt(player.pos.x, player.pos.z) > -2 ? 0.05 : 0,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere() {
    const k = this.weather.k;
    this.fog.setRGB(0.76, 0.78, 0.8).lerp(new THREE.Color(0.56, 0.58, 0.6), k);
    return { fogColor: this.fog, fogDensity: 0.0055 + k * 0.012, warp: 0, aberr: 0.12, grain: 0.04, soften: 0.12 };
  }

  hudInfo() {
    const warn = this.worms && this.worms.t > 2 ? 'THE SOIL IS MOVING' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const b of this.plots.values()) for (const g of b.geos) g.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL10 = {
  id: 'level10',
  number: 10,
  name: 'Level 10',
  title: 'Bumper Crop',
  difficulty: 1,
  next: 'level11',
  create: (ctx) => new Level10(ctx),
};
