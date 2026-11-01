import * as THREE from 'three';
import { Level10, CROPS, P, hash } from '../level10/Level10.js?v=20261101b';
import { Kit } from '../level94/kit.js?v=20261101b';
import { buildHumanoid, resetPose, walk, idle } from '../../entities/lib/rig.js?v=20261101b';

// Level 10.2 — "Hay Bale Heaven".
//
// Level 10's fields under a clear blue sky: golden stubble scattered with
// round hay bales and tall stacks, healthy green pasture, oak trees, flower
// patches, metal fences running off forever. Cows and sheep, easily upset.
// It's beautiful. That's what it wants you to think.
//
//   - Don't touch the hay bales. The Hayruler, tall, made of hay, three
//     eyes and no mouth, tends them, and it screams, and it comes
//   - The bales get to you: some people can't bear them (they make you
//     sick), some never want to leave (the COMFORT bar). Which one you are
//     is decided when you arrive. Photos show it too
//   - The flowers' scent does things to your head: lilac (visions), daisy
//     (sharp senses, endless breath), dandelion (bliss), violet (rage)
//   - The Harvesters live in a hut of hay. They're friendly, and they'll
//     trade. Don't go inside
//   - Long days, short cold nights with a rain of Almond Water that leaves
//     puddles. Jump in a puddle: Level 4
//   - A hay bale that isn't all there, fading in and out: the real level,
//     seeping through. Touch it and you fall through the floor to Level 10
//   - Now and then, in the middle of the day, the sky goes black. And when
//     you run, you see this place for what it really is

Object.assign(CROPS, {
  grass: { ground: [0.4, 0.6, 0.24], tuft: 0x8ad860, h: 0.42 },
  lilac: { ground: [0.4, 0.58, 0.26], tuft: 0xc89aff, h: 0.55 },
  daisy: { ground: [0.4, 0.6, 0.26], tuft: 0xffffff, h: 0.45 },
  dandelion: { ground: [0.42, 0.6, 0.24], tuft: 0xffd820, h: 0.4 },
  violet: { ground: [0.38, 0.55, 0.26], tuft: 0x7a40e8, h: 0.42 },
});
const FLOWERS = ['lilac', 'daisy', 'dandelion', 'violet'];
const DAY = 360, NIGHT = 95;
const LAIR = [1, -1];
const SPAWN = { x: 34, z: 40 };
const LINES = [
  '"Welcome, traveller! How has your day been?"',
  '"Silly goose, isn\'t it clear? You\'re in heaven."',
  '"I choose not to dwell on names. Names are for the old place."',
  '"Mind the bales, friend. He doesn\'t like them touched."',
  '"Stay a while. Everyone stays a while. Then they stay."',
  '"Someone wants to join us! Oh, how wonderful."',
];

export class Level102 extends Level10 {
  constructor(ctx) {
    super(ctx);
    this.spawn = { x: SPAWN.x, z: SPAWN.z, yaw: -0.76 };
    this.lastPos = { x: SPAWN.x, z: SPAWN.z };
    this.feel = this.rng.chance(0.5) ? 'comfort' : 'unease';
    this.comfort = 0;
    this.truth = 0;
    this.truthFlash = 0;
    this.fumes = null;
    this.fumeT = 0;
    this.fumeCool = 0;
    this.puddles = [];
    this.talked = new Set();
    this.blackSky = 0;
    this.blackAt = this.rng.chance(0.6) ? this.rng.range(90, 250) : 1e9;
    this.buildHayruler();
    this.buildPuddleMat();
    this.tint = new THREE.Color(1, 1, 1);
    this.nextBird = 3;
    this.updatePlots({ pos: { x: SPAWN.x, z: SPAWN.z } }, true);
    this.script = [
      [1.5, 'Golden fields under a clear blue sky. Round hay bales everywhere, as far as you can see. It\'s beautiful. It smells of summer.'],
      [10, 'Metal fences divide the fields, running off forever. Somewhere a cow lows. Somewhere, very far off, something tall is walking between the bales.'],
    ];
  }

  // ---- The land -----------------------------------------------------------------------------

  heightAt(x, z) {
    const n = this.noise;
    return 6 + (n(x / 260, z / 260) - 0.5) * 10 + (n(x / 70 + 4, z / 70) - 0.5) * 2 + (n(x / 19, z / 19 + 2) - 0.5) * 0.3;
  }

  plot(i, j) {
    const h = (k) => hash(i, j, k, this.seed);
    const spawn = i === 0 && j === 0;
    const lair = i === LAIR[0] && j === LAIR[1];
    const r = h(1);
    const crop = spawn || lair ? 'stubble' : r < 0.48 ? 'stubble' : r < 0.78 ? 'grass' : 'wheat';
    const flowers = [];
    if (!spawn && !lair && (crop === 'grass' || h(2) < 0.25)) {
      const n = 1 + Math.floor(h(3) * 2.5);
      for (let k = 0; k < n; k++) flowers.push({ x: i * P + 12 + h(10 + k) * (P - 24), z: j * P + 12 + h(20 + k) * (P - 24), r: 4 + h(30 + k) * 5, type: FLOWERS[Math.floor(h(40 + k) * 4)] });
    }
    return {
      i, j, crop, flowers, lair, spawn,
      gapW: 10 + h(4) * (P - 24), gapN: 10 + h(5) * (P - 24),
      pathW: false, pathN: false, barn: false, shed: false, canola: false,
      four: (i === 0 && j === 1) || (!spawn && !lair && h(6) < 0.13),
      fx: i * P + 15 + h(7) * (P - 30), fz: j * P + 15 + h(8) * (P - 30),
      cx: i * P + P / 2, cz: j * P + P / 2,
    };
  }

  inHedge(x, z) {
    const lx = ((x % P) + P) % P, lz = ((z % P) + P) % P;
    return lx < 1.2 || lz < 1.2;
  }

  cropAt(x, z) {
    const p = this.plotAt(x, z);
    const lx = x - p.i * P, lz = z - p.j * P;
    if (lx < 1.2 || lz < 1.2) return 'track';
    for (const f of p.flowers) if (Math.hypot(x - f.x, z - f.z) < f.r) return f.type;
    if (p.lair && Math.abs(x - p.cx) < 11 && Math.abs(z - p.cz) < 11) return 'yard';
    return p.crop;
  }

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, dark: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 }, black: { value: 0 }, truth: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform float time, dark, night, black, truth;
        uniform vec3 sunDir;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 col = mix(vec3(0.72, 0.84, 0.96), vec3(0.22, 0.48, 0.86), pow(y, 0.6));
          // A few fair-weather clouds.
          vec2 uv = d.xz / (0.2 + y) * 1.5 + vec2(time * 0.006, 0.0);
          float c = smoothstep(0.62, 0.85, n(uv) * 0.6 + n(uv * 2.7) * 0.4);
          col = mix(col, vec3(1.0), c * 0.75 * (1.0 - dark));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.95, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 8.0) * 0.25) * (1.0 - night);
          // Night: deep blue and stars.
          vec3 nc = mix(vec3(0.05, 0.07, 0.14), vec3(0.01, 0.015, 0.04), y);
          float st = step(0.997, h(floor(d.xz / (0.3 + y) * 220.0))) * smoothstep(0.1, 0.4, y);
          nc += st;
          col = mix(col, nc, night);
          col = mix(col, col * 0.6, dark);
          // The sky going black in the middle of the day; and the truth: black, with a red sore of a sun.
          col = mix(col, vec3(0.0), black);
          vec3 tc = vec3(0.04, 0.0, 0.0) + vec3(0.6, 0.05, 0.02) * pow(s, 20.0) + vec3(0.25, 0.02, 0.0) * (1.0 - y);
          col = mix(col, tc, truth);
          if (d.y < 0.0) col *= 0.7;
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

  // Materials only this level uses (made on first need: the Level 10
  // constructor builds the first plots before ours has run).
  mats102() {
    if (this.M.steel) return this.M;
    const L = (o) => {
      const m = new THREE.MeshLambertMaterial(o);
      this.own.mats.push(m);
      return m;
    };
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ecd08c';
    g.fillRect(0, 0, 64, 64);
    for (let k = 0; k < 500; k++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '170,130,60' : '255,240,190'},0.5)`;
      const x = Math.random() * 64, y = Math.random() * 64;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 3);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.own.textures.push(t);
    Object.assign(this.M, {
      bale: L({ map: t, color: 0xffffff, emissive: 0x4a3a1c, emissiveMap: t }),
      ghost: new THREE.MeshLambertMaterial({ map: t, color: 0xfff6e0, transparent: true, opacity: 0.6, emissive: 0x6a5020, emissiveIntensity: 0.6, depthWrite: false }),
      steel: L({ color: 0xa8acb0 }),
      sticks: L({ color: 0x4a3420 }),
      blood: L({ color: 0x4a0606, transparent: true, opacity: 0.85, depthWrite: false }),
      cowW: L({ color: 0xece8e0 }),
      cowB: L({ color: 0x1a1816 }),
      wool: L({ color: 0xe8e2d4 }),
      oak: L({ color: 0x5a4632 }),
      overalls: L({ color: 0x3a4a6a }),
      plaid: L({ color: 0x8a2a20 }),
      skin: L({ color: 0xd8b49a }),
      straw: L({ color: 0xe0c070 }),
      eye: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    });
    this.own.mats.push(this.M.ghost, this.M.eye);
    this.baleBase = this.M.bale.color.clone();
    return this.M;
  }

  buildPlot(i, j) {
    const M = this.mats102();
    const p = this.plot(i, j);
    const kit = new Kit();
    const x0 = i * P, z0 = j * P;
    const solids = [], bales = [], animals = [], harvesters = [];
    const geos = [];
    const group = new THREE.Group();
    const h = (k) => hash(i, j, k, this.seed);
    const gy = (x, z) => this.heightAt(x, z);
    const solid = (x, z, hw, hd, rot = 0, y1 = 10) => {
      const b = { x, z, hw, hd, rot, y0: -5, y1: 40 };
      this.colliders.add(b);
      solids.push(b);
    };
    // Metal fences on the west and north edges, with an open gate.
    const fence = (along, gap) => {
      const pos = (s) => (along === 'z' ? [x0, z0 + s] : [x0 + s, z0]);
      for (let s = 0; s < P; s += 3) {
        const inGap = s > gap - 4 && s < gap + 4;
        const [x, z] = pos(s);
        if (!inGap || Math.abs(s - (gap - 4)) < 1.5 || Math.abs(s - (gap + 4)) < 1.5) kit.add('steel', this.postGeo(), x, gy(x, z), z);
        if (inGap) continue;
        const [x1, z1] = pos(s + 3);
        const y0 = gy(x, z), y1 = gy(x1, z1), dy = y1 - y0;
        for (const hh of [0.45, 0.85, 1.2]) {
          if (along === 'x') kit.add('steel', new THREE.BoxGeometry(3, 0.05, 0.05), x + 1.5, (y0 + y1) / 2 + hh, z, 0, 0, Math.atan2(dy, 3));
          else kit.add('steel', new THREE.BoxGeometry(0.05, 0.05, 3), x, (y0 + y1) / 2 + hh, z + 1.5, -Math.atan2(dy, 3), 0, 0);
        }
      }
      for (const [a, b] of [[0, gap - 4], [gap + 4, P]]) {
        if (b - a < 0.5) continue;
        if (along === 'z') solid(x0, z0 + (a + b) / 2, 0.15, (b - a) / 2);
        else solid(x0 + (a + b) / 2, z0, (b - a) / 2, 0.15);
      }
      // The gate, swung open.
      const [gx, gz] = pos(gap - 4);
      const gyy = gy(gx, gz);
      for (const hh of [0.4, 0.8, 1.15]) kit.add('steel', new THREE.BoxGeometry(along === 'x' ? 0.05 : 3.6, 0.06, along === 'x' ? 3.6 : 0.05), gx + (along === 'x' ? 0.3 : 1.8), gyy + hh, gz + (along === 'x' ? 1.8 : 0.3));
    };
    fence('z', p.gapW);
    fence('x', p.gapN);
    // Hay bales: round ones lying about, tall stacks, small square ones.
    const nB = p.crop === 'stubble' ? 12 + Math.floor(h(50) * 14) : 2 + Math.floor(h(50) * 5);
    const placed = [];
    for (let k = 0; k < nB * 4 && placed.length < nB; k++) {
      const x = x0 + 5 + h(100 + k) * (P - 10), z = z0 + 5 + h(200 + k) * (P - 10);
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 4)) continue;
      if (p.spawn && Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) continue;
      if (p.lair && Math.abs(x - p.cx) < 15 && Math.abs(z - p.cz) < 18) continue;
      if (p.flowers.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 2)) continue;
      if (p.four && Math.hypot(p.fx - x, p.fz - z) < 6) continue;
      const t = h(300 + k), rot = h(400 + k) * Math.PI, y = gy(x, z);
      if (t < 0.8) {
        kit.add('bale', this.roundGeo(), x, y + 0.86, z, 0, rot, 0);
        bales.push({ x, z, hw: 0.8, hd: 0.9, rot });
        solid(x, z, 0.8, 0.9, rot);
      } else if (t < 0.9) {
        const layers = 5 + Math.floor(h(500 + k) * 3);
        for (let l = 0; l < layers; l++) for (const side of [-0.6, 0.6]) {
          const lr = rot + (l % 2) * Math.PI / 2;
          kit.add('bale', new THREE.BoxGeometry(1.15, 0.6, 2.35), x + Math.cos(lr) * side, y + 0.3 + l * 0.6, z - Math.sin(lr) * side, 0, lr, 0);
        }
        bales.push({ x, z, hw: 1.2, hd: 1.2, rot });
        solid(x, z, 1.2, 1.2, rot);
      } else {
        kit.add('bale', new THREE.BoxGeometry(1.0, 0.45, 0.5), x, y + 0.23, z, 0, rot, 0);
        kit.add('bale', new THREE.BoxGeometry(1.0, 0.45, 0.5), x + 0.2, y + 0.68, z + 0.05, 0, rot + 0.2, 0);
        bales.push({ x, z, hw: 0.55, hd: 0.3, rot });
        solid(x, z, 0.55, 0.3, rot);
      }
      placed.push([x, z]);
    }
    // Oak trees and bushes.
    const oaks = p.crop === 'grass' ? 3 + Math.floor(h(60) * 5) : Math.floor(h(60) * 3);
    const clumps = [], trunks = [];
    for (let k = 0; k < oaks + 4; k++) {
      const bush = k >= oaks;
      const x = bush ? x0 + 1.5 : x0 + 6 + h(600 + k) * (P - 12), z = bush ? z0 + 4 + h(620 + k) * (P - 8) : z0 + 6 + h(640 + k) * (P - 12);
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 5) || (p.spawn && Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) || (p.lair && Math.abs(x - p.cx) < 15 && Math.abs(z - p.cz) < 18)) continue;
      if (bush && Math.abs(z - z0 - p.gapW) < 6) continue;
      const y = gy(x, z), sc = bush ? 1 + h(660 + k) * 0.6 : 2.6 + h(660 + k) * 1.6;
      if (bush) clumps.push([x + 0.8, y + sc * 0.6, z, sc, h(680 + k)]);
      else {
        trunks.push([x, y, z, sc / 3]);
        for (let c = 0; c < 6; c++) {
          const a = c * 1.1 + h(700 + k);
          clumps.push([x + Math.cos(a) * sc * 0.8, y + sc * 1.9 + (c % 3) * 0.7, z + Math.sin(a) * sc * 0.8, sc * 0.8, h(720 + k + c)]);
        }
        solid(x, z, 0.4, 0.4);
      }
    }
    if (clumps.length) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      const im = new THREE.InstancedMesh(this.leafGeo(), M.leaves, clumps.length);
      clumps.forEach(([x, y, z, sc, k], n) => {
        im.setMatrixAt(n, m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, k * 20), s.set(sc, sc * 0.85, sc)));
        im.setColorAt(n, col.setRGB(0.28 + k * 0.12, 0.5 + k * 0.15, 0.18 + k * 0.06));
      });
      im.computeBoundingSphere();
      group.add(im);
      if (trunks.length) {
        const tm = new THREE.InstancedMesh(this.oakGeo(), M.oak, trunks.length);
        trunks.forEach(([x, y, z, sc], n) => tm.setMatrixAt(n, m4.compose(v.set(x, y, z), q.identity(), s.set(sc, sc, sc))));
        tm.computeBoundingSphere();
        group.add(tm);
      }
      geos.push();
    }
    // The Harvesters' hut of hay, stained by the door.
    let lair = null;
    if (p.lair) {
      const cx = p.cx, cz = p.cz, y = gy(cx, cz) - 0.1;
      const W = 9, D = 8;
      for (let l = 0; l < 4; l++) {
        for (let s = -W / 2 + 0.6; s < W / 2; s += 1.2) {
          kit.add('bale', new THREE.BoxGeometry(1.15, 0.6, 0.6), cx + s, y + 0.3 + l * 0.6, cz - D / 2, 0, 0, 0);
          if (Math.abs(s) > 1.2 || l === 3) kit.add('bale', new THREE.BoxGeometry(1.15, 0.6, 0.6), cx + s, y + 0.3 + l * 0.6, cz + D / 2, 0, 0, 0);
        }
        for (let s = -D / 2 + 0.6; s < D / 2; s += 1.2) for (const sx of [-1, 1]) kit.add('bale', new THREE.BoxGeometry(0.6, 0.6, 1.15), cx + sx * W / 2, y + 0.3 + l * 0.6, cz + s, 0, 0, 0);
      }
      for (let k = 0; k < 16; k++) kit.add('sticks', new THREE.BoxGeometry(0.08, 0.08, 6.5), cx - W / 2 + 0.3 + k * 0.56, y + 3.6, cz, 0.18 * (k % 2 ? 1 : -1), 0, 0);
      kit.add('straw', new THREE.BoxGeometry(W + 1, 0.3, D + 1), cx, y + 3.9, cz, 0, 0, 0);
      for (const [dx, dy, w, hh] of [[-1.6, 0.8, 0.9, 1.4], [1.5, 1.2, 0.6, 0.9], [-0.4, 2.1, 1.2, 0.5]]) kit.add('blood', new THREE.PlaneGeometry(w, hh), cx + dx, y + dy, cz + D / 2 + 0.32, 0, 0, 0);
      kit.add('blood', new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2), cx + 0.3, y + 0.14, cz + D / 2 + 1.5);
      solid(cx, cz - D / 2, W / 2 + 0.3, 0.3);
      solid(cx - W / 2, cz, 0.3, D / 2);
      solid(cx + W / 2, cz, 0.3, D / 2);
      solid(cx - 3, cz + D / 2, 1.7, 0.3);
      solid(cx + 3, cz + D / 2, 1.7, 0.3);
      lair = { x: cx, z: cz, door: { x: cx, z: cz + D / 2 }, x0: cx - W / 2 + 0.3, x1: cx + W / 2 - 0.3, z0: cz - D / 2 + 0.3, z1: cz + D / 2 - 0.2 };
      for (let k = 0; k < 6; k++) {
        const a = -0.9 + k * 0.36;
        const hx = cx + Math.sin(a) * 9, hz = cz + D / 2 + 2 + Math.cos(a) * 6;
        const hv = this.harvester(hx, hz, k);
        group.add(hv.root);
        geos.push(...hv.geos);
        harvesters.push(hv);
      }
    }
    // Cows and sheep in the pasture.
    if (p.crop === 'grass') {
      const n = Math.floor(h(70) * 4);
      for (let k = 0; k < n; k++) {
        const x = x0 + 10 + h(800 + k) * (P - 20), z = z0 + 10 + h(820 + k) * (P - 20);
        const a = this.animal(h(840 + k) < 0.5 ? 'cow' : 'sheep', x, z);
        group.add(a.root);
        geos.push(...a.geos);
        animals.push(a);
      }
    }
    // The bale that isn't all there.
    let four = null;
    if (p.four) {
      const mesh = new THREE.Mesh(this.roundGeo(), M.ghost);
      mesh.position.set(p.fx, gy(p.fx, p.fz) + 0.86, p.fz);
      group.add(mesh);
      four = { x: p.fx, z: p.fz, mesh };
    }
    const built = kit.build(this.M, { geos, mats: this.own.mats, textures: this.own.textures });
    group.add(built);
    this.group.add(group);
    return { plan: p, group, geos, solids, bales, animals, harvesters, lair, four };
  }

  postGeo() {
    if (!this._post) {
      this._post = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6).translate(0, 0.7, 0);
      this.own.geos.push(this._post);
    }
    return this._post;
  }

  roundGeo() {
    if (!this._round) {
      this._round = new THREE.CylinderGeometry(0.86, 0.86, 1.55, 22).rotateZ(Math.PI / 2);
      this.own.geos.push(this._round);
    }
    return this._round;
  }

  leafGeo() {
    if (!this._leaf) {
      this._leaf = new THREE.IcosahedronGeometry(1, 1);
      const pp = this._leaf.attributes.position;
      for (let k = 0; k < pp.count; k++) {
        const f = 1 + Math.sin(pp.getX(k) * 9 + pp.getY(k) * 7) * 0.12;
        pp.setXYZ(k, pp.getX(k) * f, pp.getY(k) * f, pp.getZ(k) * f);
      }
      this._leaf.computeVertexNormals();
      this.own.geos.push(this._leaf);
    }
    return this._leaf;
  }

  oakGeo() {
    if (!this._oak) {
      this._oak = new THREE.CylinderGeometry(0.28, 0.45, 6, 8).translate(0, 3, 0);
      this.own.geos.push(this._oak);
    }
    return this._oak;
  }

  harvester(x, z, k) {
    const M = this.M;
    const rig = buildHumanoid({ mat: M.plaid, torsoMat: M.overalls, armMat: M.plaid, forearmMat: M.skin, handMat: M.skin, headMat: M.skin, legMat: M.overalls, footMat: M.cowB });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12), M.straw);
    hat.position.y = rig.p.headLen + 0.06;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14), M.straw);
    brim.position.y = rig.p.headLen - 0.01;
    rig.head.add(hat, brim);
    rig.geos.push(hat.geometry, brim.geometry);
    rig.root.position.set(x, this.heightAt(x, z), z);
    return { root: rig.root, rig, geos: rig.geos, x, z, k, t: k * 1.7 };
  }

  animal(kind, x, z) {
    const M = this.M;
    const root = new THREE.Group();
    const geos = [];
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      geos.push(geo);
      root.add(m);
      return m;
    };
    const legs = [];
    if (kind === 'cow') {
      add(new THREE.BoxGeometry(0.75, 0.75, 1.7), M.cowW, 0, 1.05, 0);
      add(new THREE.BoxGeometry(0.77, 0.4, 0.5), M.cowB, 0, 1.15, 0.2);
      add(new THREE.BoxGeometry(0.77, 0.35, 0.4), M.cowB, 0, 1.0, -0.5);
      add(new THREE.BoxGeometry(0.4, 0.42, 0.55), M.cowB, 0, 1.25, 1.05);
      for (const [lx, lz] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) legs.push(add(new THREE.BoxGeometry(0.14, 0.7, 0.14).translate(0, -0.35, 0), M.cowW, lx, 0.7, lz));
    } else {
      add(new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.85, 1.3), M.wool, 0, 0.75, 0);
      add(new THREE.BoxGeometry(0.24, 0.26, 0.32), M.cowB, 0, 0.85, 0.65);
      for (const [lx, lz] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]]) legs.push(add(new THREE.BoxGeometry(0.08, 0.45, 0.08).translate(0, -0.225, 0), M.cowB, lx, 0.45, lz));
    }
    root.position.set(x, this.heightAt(x, z), z);
    return { kind, root, geos, legs, x, z, home: [x, z], heading: Math.random() * 6, state: 'graze', t: 0, gait: 0 };
  }

  // ---- The Hayruler -----------------------------------------------------------------------------

  buildHayruler() {
    const M = this.M;
    const root = new THREE.Group();
    const geos = [];
    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      geos.push(geo);
      parent.add(m);
      return m;
    };
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.22, 1.6, 0);
      add(hip, new THREE.CylinderGeometry(0.16, 0.12, 1.6, 7).translate(0, -0.8, 0), M.bale, 0, 0, 0);
      root.add(hip);
      legs.push(hip);
      const sh = new THREE.Group();
      sh.position.set(s * 0.48, 2.6, 0);
      add(sh, new THREE.CylinderGeometry(0.11, 0.08, 1.5, 7).translate(0, -0.75, 0), M.bale, 0, 0, 0);
      // Six-inch fingers.
      for (let f = 0; f < 4; f++) add(sh, new THREE.BoxGeometry(0.03, 0.16 * 1.6, 0.03).translate(0, -0.13, 0), M.sticks, (f - 1.5) * 0.04, -1.5, 0.02);
      root.add(sh);
      arms.push(sh);
    }
    add(root, new THREE.BoxGeometry(0.9, 1.1, 0.5), M.bale, 0, 2.15, 0);
    const head = new THREE.Group();
    head.position.set(0, 3.0, 0);
    root.add(head);
    add(head, new THREE.BoxGeometry(0.5, 0.6, 0.45), M.bale, 0, 0, 0);
    add(head, new THREE.ConeGeometry(0.08, 0.32, 6).rotateX(Math.PI / 2), M.bale, 0, -0.05, 0.38);
    for (const [ex, ey] of [[-0.13, 0.12], [0.13, 0.12], [0, 0.24]]) add(head, new THREE.SphereGeometry(0.05, 8, 6), M.eye, ex, ey, 0.23);
    // Straw sticking out everywhere.
    for (let k = 0; k < 24; k++) {
      const m = add(root, new THREE.BoxGeometry(0.02, 0.4, 0.02), M.straw, (Math.random() - 0.5) * 0.9, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.5);
      m.rotation.set(Math.random() * 2, Math.random() * 3, Math.random() * 2);
    }
    this.group.add(root);
    for (const g of geos) this.own.geos.push(g);
    const x = 150, z = 110;
    this.hay = { root, head, legs, arms, x, z, heading: 0, state: 'tend', t: 0, target: null, stunned: 0, gait: 0 };
    root.position.set(x, this.heightAt(x, z), z);
  }

  updateHayruler(dt, player) {
    const H = this.hay, { ctx } = this;
    const px = player.pos.x, pz = player.pos.z;
    const d = Math.hypot(H.x - px, H.z - pz);
    H.t += dt;
    let speed = 0;
    if (H.stunned > 0) H.stunned -= dt;
    else if (H.state === 'chase') {
      speed = 4.25;
      H.target = [px, pz];
      if (d < 1.4) {
        this.done = true;
        ctx.audio.shriek?.(0, 0.6);
        ctx.onDeath('The Hayruler caught you, and screamed without a mouth, and pulled you apart with its long, long fingers. Then it went back to tending its hay.');
        return;
      }
      if (d > 100 || H.t > 40) {
        H.state = 'tend';
        H.t = 0;
        H.target = null;
        ctx.hud.message('The screaming stops. When you look back, it\'s gone back to its hay, stroking a bale with its long fingers.', 4);
      }
      if (this.rng.chance(dt * 0.5)) ctx.audio.shriek?.(Math.max(-1, Math.min(1, (H.x - px) / 30)), 0.3 * Math.max(0.2, 1 - d / 80));
    } else {
      // Tending: walk from bale to bale, and stand by each one a while.
      speed = 0.9;
      if (!H.target || Math.hypot(H.target[0] - H.x, H.target[1] - H.z) < 2) {
        if (H.target && H.wait == null) H.wait = this.rng.range(4, 9);
        if (H.wait != null) {
          H.wait -= dt;
          speed = 0;
          if (H.wait <= 0) {
            H.wait = null;
            const all = [];
            for (const b of this.plots.values()) for (const bl of b.bales) if (Math.hypot(bl.x - H.x, bl.z - H.z) < 50) all.push(bl);
            const bl = all.length ? this.rng.pick(all) : null;
            H.target = bl ? [bl.x + 1.6, bl.z + 1.6] : [H.x + this.rng.range(-20, 20), H.z + this.rng.range(-20, 20)];
          }
        } else H.target = [H.x + this.rng.range(-20, 20), H.z + this.rng.range(-20, 20)];
      }
      // Keep it somewhere in the region, never far.
      if (d > 170) {
        const a = this.rng.range(0, Math.PI * 2);
        H.x = px + Math.cos(a) * 110;
        H.z = pz + Math.sin(a) * 110;
        H.target = null;
      }
      if (d < 30 && !this.told.hay) {
        this.told.hay = true;
        ctx.hud.message('Something tall walks between the bales: a figure made of hay, straw spilling out of it. Three eyes. No mouth. It touches each bale as it passes, gently.', 6);
      }
    }
    if (H.target && speed > 0) {
      const dx = H.target[0] - H.x, dz = H.target[1] - H.z, l = Math.hypot(dx, dz) || 1;
      H.x += (dx / l) * speed * dt;
      H.z += (dz / l) * speed * dt;
      H.heading = Math.atan2(dx, dz);
    }
    H.gait += speed * dt * 1.4;
    const sw = Math.sin(H.gait * 2) * Math.min(1, speed / 2) * 0.7;
    H.legs[0].rotation.x = sw;
    H.legs[1].rotation.x = -sw;
    H.arms[0].rotation.x = H.state === 'chase' ? -1.3 + sw * 0.3 : -sw * 0.6;
    H.arms[1].rotation.x = H.state === 'chase' ? -1.3 - sw * 0.3 : sw * 0.6;
    H.head.rotation.z = H.stunned > 0 ? Math.sin(this.time * 17) * 0.3 : Math.sin(this.time * 0.7) * 0.15;
    H.root.position.set(H.x, this.heightAt(H.x, H.z), H.z);
    H.root.rotation.y = H.heading;
  }

  provokeHay(player) {
    const H = this.hay, { ctx } = this;
    if (H.state !== 'chase') {
      const d = Math.hypot(H.x - player.pos.x, H.z - player.pos.z);
      if (d > 80) {
        // It comes from wherever you aren't looking.
        const a = player.yaw + Math.PI + this.rng.range(-0.6, 0.6);
        H.x = player.pos.x - Math.sin(a) * 70;
        H.z = player.pos.z - Math.cos(a) * 70;
      }
      ctx.hud.message('You brush against a hay bale. Across the fields, something SCREAMS. RUN.', 4);
      ctx.audio.shriek?.(0, 0.55);
    }
    H.state = 'chase';
    H.t = 0;
  }

  stun(x, z, opts) {
    const H = this.hay;
    if (Math.hypot(H.x - x, H.z - z) > (opts.range || 2) + 1) return 0;
    H.stunned = opts.seconds || 3;
    return 1;
  }

  // ---- Per frame -------------------------------------------------------------------------------

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
    this.water.position.set(px, -50, pz);
    this.updateDay(dt, player);
    this.updateBales(dt, player);
    this.updateHayruler(dt, player);
    if (this.done) return;
    this.updateAnimals(dt, player);
    this.updateHarvesters(dt, player);
    if (this.done) return;
    this.updateFlowers(dt, player);
    this.updateFour(dt, player);
    if (this.done) return;
    this.updateTruth(dt, player);
    this.updateAmbient(dt, player);
    if (this.comfort >= 100) {
      this.done = true;
      ctx.onDeath('You stayed. You lay down among the bales in the warm sun, and the Harvesters came and smiled, and you were home. You\'re still there.');
      return;
    }
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      ctx.onDeath(this.feel === 'unease' ? 'The bales made you sick, and sicker, until you couldn\'t get up.' : 'The flowers got into your head and never left.');
    }
  }

  updateDay(dt, player) {
    const { ctx } = this;
    const cyc = DAY + NIGHT;
    const t = (this.time + 50) % cyc;
    const night = t < DAY ? Math.max(0, 1 - t / 12, (t - DAY + 14) / 14) : 1;
    this.night = Math.max(0, Math.min(1, night));
    const e = t < DAY ? Math.sin((Math.PI * t) / DAY) : -0.3;
    const az = (t / DAY) * Math.PI;
    const sd = new THREE.Vector3(Math.cos(az), Math.max(-0.2, e), 0.35).normalize();
    this.sky.material.uniforms.sunDir.value.copy(sd);
    this.sky.material.uniforms.time.value = this.time;
    this.sky.material.uniforms.night.value = this.night;
    const px = player.pos.x, pz = player.pos.z;
    this.sun.position.set(px + sd.x * 100, sd.y * 100 + 5, pz + sd.z * 100);
    this.sun.target.position.set(px, 0, pz);
    // The sky going black in the middle of the day.
    if (this.time > this.blackAt && this.time < this.blackAt + 28 && this.night < 0.1) {
      if (!this.told.black) {
        this.told.black = true;
        ctx.hud.message('In the middle of the day, the sky goes black. Pitch black. The fields are still lit, from nowhere.', 5);
        ctx.audio.staticBurst?.(0.2);
      }
      this.blackSky = Math.min(1, this.blackSky + dt * 0.8);
    } else this.blackSky = Math.max(0, this.blackSky - dt * 0.5);
    this.sky.material.uniforms.black.value = this.blackSky;
    this.sun.intensity = (1 - this.night) * 1.7 * (1 - this.blackSky * 0.5);
    this.hemi.intensity = 0.45 + (1 - this.night) * 1.25 - this.blackSky * 0.4;
    this.hemi.color.setRGB(0.95 - this.night * 0.6, 0.97 - this.night * 0.55, 1);
    // Night: cold, and a rain of Almond Water that leaves puddles.
    if (this.night > 0.8 && !this.wasNight) {
      this.wasNight = true;
      ctx.hud.message('Night comes fast, and cold. Then rain: it smells of almonds. Almond Water, falling from the sky, pooling in the stubble.', 5);
    }
    if (this.night < 0.2) this.wasNight = false;
    const raining = this.night > 0.6;
    this.rain.material.opacity += ((raining ? 0.4 : 0) - this.rain.material.opacity) * Math.min(1, dt);
    this.rain.material.color.setHex(0xd8ecff);
    this.rain.position.set(px, player.pos.y - 2 + (-(this.time * 14) % 20 + 20) % 20 - 10, pz);
    if (raining && this.puddles.length < 10 && this.rng.chance(dt * 0.8)) {
      const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(4, 26);
      this.addPuddle(px + Math.cos(a) * r, pz + Math.sin(a) * r);
    }
    // They dry up by midday.
    if (t > DAY * 0.4 && t < DAY * 0.5 && this.puddles.length) for (const pd of this.puddles.splice(0)) this.group.remove(pd.mesh);
    if (this.puddles.length && !this.told.puddle) {
      const near = this.puddles.find((pd) => Math.hypot(pd.x - px, pd.z - pz) < 8);
      if (near) {
        this.told.puddle = true;
        ctx.hud.message('A puddle of Almond Water, shining. It looks deeper than it should. You could jump in.', 4);
      }
    }
    for (const pd of this.puddles) pd.mesh.material.opacity = 0.55 + Math.sin(this.time * 2 + pd.x) * 0.08;
    // Wind in the crop.
    this.gustT = (this.gustT ?? 4) - dt;
    if (this.gustT <= 0) {
      this.gustT = this.rng.range(6, 14);
      this.gusting = 3;
      ctx.audio.gust?.(this.rng.range(-1, 1), 0.12, 3);
    }
    this.gusting = Math.max(0, (this.gusting || 0) - dt);
    this.wheat.gust.value = Math.sin(Math.min(1, this.gusting / 3) * Math.PI);
  }

  buildPuddleMat() {
    this.puddleMat = new THREE.MeshLambertMaterial({ color: 0xb8e0ff, emissive: 0x3a6a8a, transparent: true, opacity: 0.6, depthWrite: false });
    this.own.mats.push(this.puddleMat);
    this.puddleGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    this.own.geos.push(this.puddleGeo);
  }

  addPuddle(x, z) {
    if (this.cropAt(x, z) === 'track') return;
    const r = this.rng.range(0.9, 1.8);
    const mesh = new THREE.Mesh(this.puddleGeo, this.puddleMat);
    mesh.position.set(x, this.heightAt(x, z) + 0.06, z);
    mesh.scale.set(r, 1, r * this.rng.range(0.6, 1));
    this.group.add(mesh);
    this.puddles.push({ x, z, r, mesh });
  }

  updateBales(dt, player) {
    const px = player.pos.x, pz = player.pos.z;
    let near = 99;
    for (const b of this.plots.values()) {
      if (Math.abs(b.plan.cx - px) > P || Math.abs(b.plan.cz - pz) > P) continue;
      for (const bl of b.bales) {
        const dx = px - bl.x, dz = pz - bl.z, c = Math.cos(bl.rot), s = Math.sin(bl.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const d = Math.max(Math.abs(lx) - bl.hw, Math.abs(lz) - bl.hd);
        near = Math.min(near, d);
        if (d < 0.36) this.provokeHay(player);
      }
    }
    // How the bales make you feel.
    if (near < 4 && !this.told.feel) {
      this.told.feel = true;
      this.ctx.hud.message(this.feel === 'comfort' ? 'Close to the bales, a warm, sleepy contentment comes over you. It\'s so peaceful. You could stay here. You could stay here forever.' : 'Close to the bales, your stomach turns. Something about them is deeply, physically wrong.', 5);
    }
    if (near < 7) {
      if (this.feel === 'comfort') this.comfort = Math.min(100, this.comfort + 0.9 * dt);
      else player.health = Math.max(0, player.health - 0.45 * dt);
      this.nausea = Math.min(1, (this.nausea || 0) + dt * 0.3);
    } else {
      this.comfort = Math.max(0, this.comfort - 0.5 * dt);
      this.nausea = Math.max(0, (this.nausea || 0) - dt * 0.2);
    }
    if (this.feel === 'comfort') player.speedMul = 1 - this.comfort * 0.004;
  }

  updateAnimals(dt, player) {
    const px = player.pos.x, pz = player.pos.z;
    for (const b of this.plots.values()) for (const a of b.animals) {
      const dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz);
      if (d > 80) continue;
      a.t += dt;
      let speed = 0;
      if (a.state === 'graze') {
        if (this.rng.chance(dt * 0.3)) a.heading += this.rng.range(-1, 1);
        speed = this.rng.chance(0.5) ? 0.3 : 0;
        if (Math.hypot(a.home[0] - a.x, a.home[1] - a.z) > 12) a.heading = Math.atan2(a.home[0] - a.x, a.home[1] - a.z);
        if (d < 4.5) {
          a.state = 'glare';
          a.t = 0;
          this.ctx.audio.growl?.(0, 0.15);
          if (!this.told.cow) {
            this.told.cow = true;
            this.ctx.hud.message(`The ${a.kind} stops chewing and stares at you. Its ears go flat. Back off.`, 3);
          }
        }
      } else if (a.state === 'glare') {
        a.heading = Math.atan2(dx, dz);
        if (a.t > 1.2) {
          if (d < 6) {
            a.state = 'charge';
            a.t = 0;
          } else a.state = 'graze';
        }
      } else if (a.state === 'charge') {
        speed = a.kind === 'cow' ? 5 : 4;
        if (d < 1.3 && !a.hit) {
          a.hit = true;
          player.damage?.(a.kind === 'cow' ? 14 : 8);
          this.ctx.hurtFlash?.(0.4);
          player.pos.x += (dx / (d || 1)) * 1.2;
          player.pos.z += (dz / (d || 1)) * 1.2;
        }
        if (a.t > 1.6) {
          a.state = 'graze';
          a.hit = false;
        }
      }
      if (speed) {
        const pos = { x: a.x + Math.sin(a.heading) * speed * dt, z: a.z + Math.cos(a.heading) * speed * dt };
        this.colliders.collide(pos, 0.5);
        a.x = pos.x;
        a.z = pos.z;
        a.gait += speed * dt * 4;
      }
      a.legs.forEach((l, k) => (l.rotation.x = Math.sin(a.gait + (k % 2) * Math.PI) * 0.4 * Math.min(1, speed)));
      a.root.position.set(a.x, this.heightAt(a.x, a.z), a.z);
      a.root.rotation.y = a.heading;
    }
  }

  nearHarvester(player) {
    for (const b of this.plots.values()) for (const hv of b.harvesters) if (Math.hypot(hv.x - player.pos.x, hv.z - player.pos.z) < 2.6) return hv;
    return null;
  }

  updateHarvesters(dt, player) {
    const { ctx } = this;
    const px = player.pos.x, pz = player.pos.z;
    for (const b of this.plots.values()) {
      for (const hv of b.harvesters) {
        hv.t += dt;
        const d = Math.hypot(hv.x - px, hv.z - pz);
        resetPose(hv.rig);
        idle(hv.rig, hv.t, 1);
        if (d < 15) hv.root.rotation.y = Math.atan2(px - hv.x, pz - hv.z);
        if (d < 25 && !this.told.harv) {
          this.told.harv = true;
          ctx.hud.message('People! In straw hats and overalls, standing outside a hut made of hay bales. They wave. They\'re all smiling.', 5);
        }
        // Run from them after you've talked, and for a moment you see it.
        if (this.talked.size && player.sprinting && d < 12 && !this.told.ranFrom) {
          this.told.ranFrom = true;
          this.truthFlash = 2.5;
          ctx.hud.message('You run, and for a second the fields aren\'t golden at all. They\'re grey and dead and the sky is black, and the Harvesters\' smiles go all the way round.', 5);
        }
      }
      const L = b.lair;
      if (!L) continue;
      const dd = Math.hypot(L.door.x - px, L.door.z - pz);
      if (dd < 9 && !this.told.lair) {
        this.told.lair = true;
        ctx.hud.message('The hay hut smells of iron. Something dark and dried is smeared on the bales round the door. "Come in, come in," says a Harvester. "We\'ll see if you\'re worthy."', 6);
      }
      if (px > L.x0 && px < L.x1 && pz > L.z0 && pz < L.z1) {
        this.done = true;
        const worthy = this.comfort > 50;
        ctx.onDeath(worthy ? 'They closed the circle round you and held a lilac under your nose, and you breathed in, and you were worthy. You\'re a Harvester now. You don\'t dwell on names.' : 'They closed the circle round you and held a lilac under your nose, and decided. The wheat here can\'t feed them. You could.');
        return;
      }
    }
  }

  updateFlowers(dt, player) {
    const { ctx } = this;
    const c = this.cropAt(player.pos.x, player.pos.z);
    this.fumeCool = Math.max(0, this.fumeCool - dt);
    if (FLOWERS.includes(c) && this.fumeCool <= 0) {
      this.fumeT += dt;
      if (this.fumeT > 1.2) {
        this.fumeT = 0;
        this.fumeCool = 30;
        this.fumes = { type: c, t: 25 };
        ctx.hud.message({
          lilac: 'Sweet, heavy lilac. The colours start to breathe, and things move at the edge of your eye.',
          daisy: 'Daisies. Everything goes sharp: every stalk, every sound. You could run forever.',
          dandelion: 'Dandelions. A warm, silly bliss. Nothing could be wrong here. Nothing at all.',
          violet: 'Violets. Your jaw clenches. Your fists clench. You want to hit something, anything.',
        }[c], 4);
      }
    } else this.fumeT = 0;
    if (this.fumes) {
      const f = this.fumes;
      f.t -= dt;
      if (f.type === 'lilac') player.sanity = Math.max(0, player.sanity - 0.25 * dt);
      if (f.type === 'daisy') player.stamina = 100;
      if (f.type === 'dandelion') {
        player.sanity = Math.min(100, player.sanity + 0.6 * dt);
        if (this.feel === 'comfort') this.comfort = Math.min(100, this.comfort + 0.5 * dt);
      }
      if (f.type === 'violet') player.sanity = Math.max(0, player.sanity - 0.15 * dt);
      if (f.t <= 0) this.fumes = null;
    }
  }

  updateFour(dt, player) {
    const { ctx } = this;
    for (const b of this.plots.values()) {
      const f = b.four;
      if (!f) continue;
      const k = this.time * 2.3 + f.x;
      f.mesh.material.opacity = Math.max(0, 0.35 + Math.sin(k) * 0.35 + (Math.sin(k * 7.1) > 0.8 ? 0.3 : 0));
      f.mesh.scale.set(0.5 + Math.abs(Math.sin(k * 0.6)) * 1.2, 1 + Math.sin(k * 1.3) * 0.15, 1);
      f.mesh.rotation.y = Math.sin(k * 0.4) * 0.6;
      const d = Math.hypot(f.x - player.pos.x, f.z - player.pos.z);
      if (d < 22 && !this.told.four) {
        this.told.four = true;
        ctx.hud.message('One hay bale isn\'t all there. It fades in and out of the world, thinner and thicker, like it\'s turning in a direction you can\'t see.', 5);
      }
      if (d < 1.3) {
        this.done = true;
        ctx.hud.message('You reach for the bale that isn\'t all there, and your hand goes into it, and so does the rest of you, down through the floor.', 5);
        ctx.onEscape('level10', 'noclip');
        return;
      }
    }
  }

  updateTruth(dt, player) {
    this.truthFlash = Math.max(0, this.truthFlash - dt);
    const target = Math.max(this.hay.state === 'chase' ? 0.85 : 0, this.blackSky * 0.5, this.truthFlash > 0 ? 1 : 0, player.sanity < 25 ? (Math.sin(this.time * 0.7) > 0.95 ? 1 : 0) : 0);
    this.truth += (target - this.truth) * Math.min(1, dt * 3);
    this.sky.material.uniforms.truth.value = this.truth;
    // The bales go rotten and dark.
    this.M.bale.color.copy(this.baleBase).lerp(new THREE.Color(0.35, 0.12, 0.08), this.truth);
    if (this.hay.state === 'chase' && !this.told.runbales && this.truth > 0.6) {
      this.told.runbales = true;
      this.ctx.hud.message('RUN FROM THE BALES', 2.5);
    }
  }

  updateAmbient(dt, player) {
    const a = this.ctx.audio;
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = this.rng.range(2, 7);
      if (this.night < 0.5) a.pigeon?.(this.rng.range(-1, 1), 0.03);
      else a.cricket?.(this.rng.range(-1, 1), 0.04);
    }
    if (this.night < 0.5 && this.rng.chance(dt * 0.05)) a.rustle?.(this.rng.range(-1, 1), 0.08, 1.5);
  }

  // ---- The act button, photos, drinking ---------------------------------------------------------

  inPuddle(player) {
    return this.puddles.find((pd) => Math.hypot(pd.x - player.pos.x, pd.z - player.pos.z) < pd.r * 0.9);
  }

  fire(player) {
    if (this.done) return;
    const { ctx } = this;
    if (this.inPuddle(player)) {
      this.done = true;
      ctx.audio.splash?.(0, 0.5, true);
      ctx.hud.message('You jump into the puddle, and there\'s no bottom. You come up somewhere dry, under fluorescent light.', 5);
      ctx.onEscape('level4', 'noclip');
      return;
    }
    const hv = this.nearHarvester(player);
    if (hv) {
      const first = !this.talked.has(hv.k);
      this.talked.add(hv.k);
      ctx.hud.message(LINES[(hv.k + this.talked.size) % LINES.length] + (first ? ' They press something into your hands. "For the road. Not that you\'ll need the road."' : ''), 5);
      if (first) {
        const item = ['water', 'milk', 'medkit', 'water', 'battery', 'flare'][hv.k];
        if (!player.give?.(item)) ctx.placeItem?.(item, player.pos.x, player.pos.z);
      }
    }
  }

  // Photos show how you feel about the place.
  photoFilter(src) {
    const W = src.width, H = src.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (this.feel === 'comfort') {
      g.filter = 'saturate(1.9) brightness(1.15) contrast(1.05)';
      g.drawImage(src, 0, 0);
      g.filter = 'none';
      const glow = g.createRadialGradient(W * 0.75, H * 0.15, 0, W * 0.75, H * 0.15, W * 0.7);
      glow.addColorStop(0, 'rgba(255,240,190,0.55)');
      glow.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    } else {
      g.filter = 'sepia(1) hue-rotate(-35deg) saturate(3) contrast(1.4) brightness(0.65)';
      g.drawImage(src, 0, 0);
      g.filter = 'none';
      // Smoke above, fire below, skulls in the stubble.
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(10,5,5,${(0.2 + Math.random() * 0.3).toFixed(2)})`;
        g.beginPath();
        g.arc(Math.random() * W, Math.random() * H * 0.45, 30 + Math.random() * 70, 0, Math.PI * 2);
        g.fill();
      }
      const fire = g.createLinearGradient(0, H, 0, H * 0.55);
      fire.addColorStop(0, 'rgba(255,90,10,0.75)');
      fire.addColorStop(1, 'rgba(255,40,0,0)');
      g.fillStyle = fire;
      g.fillRect(0, H * 0.55, W, H * 0.45);
      for (let k = 0; k < 9; k++) {
        const x = Math.random() * W, y = H * (0.65 + Math.random() * 0.3), s = 8 + Math.random() * 14;
        g.fillStyle = '#d8ccb0';
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - s * 0.6, y + s * 0.5, s * 1.2, s * 0.6);
        g.fillStyle = '#100808';
        g.beginPath();
        g.arc(x - s * 0.38, y, s * 0.26, 0, Math.PI * 2);
        g.arc(x + s * 0.38, y, s * 0.26, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c.toDataURL('image/jpeg', 0.92);
  }

  photoSubjects() {
    const H = this.hay;
    return [{ type: 'hayruler', x: H.x, y: 2.5, z: H.z, range: 60, noLos: true }];
  }

  drink(player) {
    if (this.inPuddle(player)) {
      player.sanity = Math.min(100, player.sanity + 15);
      this.ctx.audio.drink();
      this.ctx.hud.message('Almond Water, straight from the puddle. Rain-cold and sweet.', 2.5);
      return;
    }
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. (At night it rains Almond Water.)', 2);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  audioMix(player) {
    const chase = this.hay.state === 'chase';
    return {
      hum: 0, exitGain: 0, exitPan: 0, drone: chase ? 0.3 : this.truth * 0.2, machine: 0, jazz: 0,
      wind: 0.08 + (this.gusting ? 0.05 : 0) + this.night * 0.03,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere() {
    const tr = this.truth;
    this.fog.setRGB(0.74, 0.84, 0.94).lerp(new THREE.Color(0.06, 0.07, 0.12), this.night).lerp(new THREE.Color(0.05, 0.05, 0.05), this.blackSky).lerp(new THREE.Color(0.14, 0.03, 0.02), tr);
    const f = this.fumes?.type;
    const fk = this.fumes ? Math.min(1, this.fumes.t / 5) : 0;
    this.tint.setRGB(1, 1, 1);
    if (f === 'violet') this.tint.setRGB(1, 1 - 0.25 * fk * (0.6 + 0.4 * Math.sin(this.time * 6)), 1 - 0.25 * fk);
    if (f === 'dandelion') this.tint.setRGB(1, 1, 1 - 0.12 * fk);
    if (tr > 0.01) this.tint.lerp(new THREE.Color(1.1, 0.55, 0.45), tr);
    return {
      fogColor: this.fog,
      fogDensity: 0.004 + this.night * 0.006 + tr * 0.01,
      warp: (f === 'lilac' ? 0.9 * fk : 0) + (this.feel === 'unease' ? (this.nausea || 0) * 0.35 : 0) + tr * 0.3,
      aberr: 0.1 + (f === 'lilac' ? 1.5 * fk : 0) + tr * 0.8,
      grain: 0.04 + tr * 0.1, soften: f === 'dandelion' ? 0.6 * fk : 0.12, mono: tr * 0.5,
      shake: f === 'violet' ? 0.5 * fk : 0, fovMul: f === 'daisy' ? 1 - 0.08 * fk : 1, tint: this.tint,
    };
  }

  hudInfo(player) {
    const chase = this.hay.state === 'chase';
    const act = this.inPuddle(player) ? 'JUMP IN' : this.nearHarvester(player) ? 'TALK' : null;
    const warn = chase ? 'RUN' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true, act, bars: this.feel === 'comfort' ? { home: this.comfort } : null };
  }

  dispose() {
    for (const pd of this.puddles) this.group.remove(pd.mesh);
    super.dispose();
  }
}

export const LEVEL10_2 = {
  id: 'level10_2',
  number: 10.2,
  name: 'Level 10.2',
  title: 'Hay Bale Heaven',
  difficulty: 1,
  next: 'level10',
  create: (ctx) => new Level102(ctx),
};
