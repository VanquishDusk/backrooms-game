import * as THREE from 'three';
import { Level11 } from '../level11/Level11.js';
import { EDGE_WALL } from '../../world/GridMap.js';
import { Kit } from '../level94/kit.js';
import { B, R, SIDE, GF, mod, hash, isRoad, inAlley, blockPlan } from '../level11/city.js';
import { Servant, Ambassador } from './servants.js';

// Level 11.3 — "The Red Light District".
//
// Level 11 gone wrong: the same endless city of steel and glass, but under a
// moonless sky, every window and lamp burning crimson. The buildings are
// empty, stripped. Smaller apartments and warehouses at the waterfront;
// towers further in, and at the heart of it, the domed Embassy, humming.
// Above it all, the Vortex: a red storm that never moves, shot through with
// red lightning.
//
//   - The air is bad: hallucinations, figures at the edge of your sight,
//     whispers. A face mask (found in the empty shops) halves it
//   - Servants follow you in packs, keep their distance, freeze when you look
//     at them, spread out round you... then close in all at once. Don't get
//     cornered in an alley or a shop. Deeper in, they're neater and faster
//   - Ambassadors talk. Don't listen too long, and don't walk towards them
//   - The only known way out: the bridges at the waterfront that run out
//     over the black water forever. They lead back to Level 11. They're
//     guarded. (The bridge you arrive on is broken off behind you.)

const SHORE = 5 * B + R; // where the water starts
const EMB = [3, 0];
const EMB_C = { x: EMB[0] * B + 58, z: EMB[1] * B + 58 };
const BROKEN = 3;
const BROKEN_END = SHORE + 140;
const ESCAPE = 260;
const VORTEX = new THREE.Vector3(EMB_C.x, 330, EMB_C.z - 40);
const isBridge = (i) => mod(i, 3) === 0;
const deckY = (z) => (z <= SHORE ? SIDE : Math.min(8, SIDE + (z - SHORE) * 0.13));
const RED = new THREE.Color(1, 0.16, 0.2);

export class Level113 extends Level11 {
  constructor(ctx) {
    super(ctx);
    // No sun, no cranes, no pizzas, no shadows: it's always night here.
    this.cranes.dispose();
    this.cranes = { update: () => null, subjects: () => [], dispose() {}, flocks: [], spawnFlock() {} };
    this.pizzas.clear();
    this.shadows = false;
    this.sun.castShadow = false;
    if (this.renderer && this.prevShadow) this.renderer.shadowMap.enabled = this.prevShadow.enabled;
    const groundAt = (x, z) => {
      if (z > SHORE) return this.onBridge(x, z) ? deckY(z) : 0.05;
      return isRoad(x, z) ? 0 : SIDE;
    };
    this.world.groundAt = groundAt;
    this.buildWater();
    this.buildRain();
    this.buildPhantoms();
    this.packs = [];
    this.weather = { rain: 0, target: 0, next: this.rng.range(30, 60) };
    this.flash = 0;
    this.vflash = 0;
    this.nextBolt = this.rng.range(6, 14);
    this.nextPhantom = 8;
    this.nextWhisper = 5;
    this.nextEnt = 35;
    this.contam = 0;
    // Arrive on a broken bridge, looking at the city across the water.
    this.spawn = { x: BROKEN * B + R / 2 + 2, z: SHORE + 112, yaw: 0.04 };
    this.updateBlocks({ pos: { x: this.spawn.x, z: this.spawn.z } }, true);
    this.script = [
      [1.5, 'A bridge over black water, and a city burning red on the other side. No moon. The air tastes of metal.'],
      [9, 'Behind you, the bridge you came over just stops, torn off above the water. The only way is into the city.'],
      [18, 'Somewhere out there, other bridges must go back. They say the bridges are watched.'],
    ];
  }

  // ---- The city, retuned --------------------------------------------------------------

  plan(i, j) {
    const key = `${i},${j}`;
    let p = this.plans.get(key);
    if (p) return p;
    if (j >= 5) {
      p = { i, j, d: 0, lots: [], water: true, bridge: isBridge(i), broken: i === BROKEN, alley: 'none', special: null };
    } else {
      const n = hash(i, j, 999, this.seed);
      const dens = Math.max(0, Math.min(1, 0.36 + (4 - j) * 0.17 + (n - 0.5) * 0.25));
      p = blockPlan(i, j, this.seed, [3, -9], null, dens);
      if (i === EMB[0] && j === EMB[1]) {
        p.lots = [];
        p.alley = 'none';
        p.special = 'embassy';
      }
      // Stripped: nothing open for business, no ways out.
      p.grate = null;
      p.busStop = null;
      if (p.alley === 'neon' || p.alley === 'grimy') p.alley = 'closed';
      for (const L of p.lots) {
        L.poster = false;
        L.windowEnt = false;
        if (L.type === 'abandoned') {
          L.type = 'building';
          L.style = 'boarded';
          L.shop = null;
        }
        const s = L.shop;
        if (s && s.kind !== 'lobby') {
          const r = hash(Math.round(L.x0), Math.round(L.z0), 77, this.seed);
          s.open = !!(s.open || s.exit) && L.depth >= 12.5;
          s.exit = null;
          s.kind = 'empty';
          s.item = s.open && r < 0.22 ? (r < 0.12 ? 'mask' : r < 0.17 ? 'battery' : 'medkit') : null;
          s.item2 = null;
        }
      }
    }
    this.plans.set(key, p);
    return p;
  }

  buildGrid() {
    super.buildGrid();
    // Nothing walks on the water, except along the bridges.
    const map = this.grid;
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
      const [wx, wz] = map.cellCenter(x, y);
      if (wz < SHORE + 1) continue;
      if (this.onBridge(wx, wz, 1.5)) continue;
      map.setH(x, y, EDGE_WALL);
      map.setH(x, y + 1, EDGE_WALL);
      map.setV(x, y, EDGE_WALL);
      map.setV(x + 1, y, EDGE_WALL);
    }
  }

  onBridge(x, z, m = 0.6) {
    const i = Math.floor(x / B), lx = x - i * B;
    if (!isBridge(i) || lx < m || lx > R - m) return false;
    return !(i === BROKEN && z > BROKEN_END);
  }

  guideSign() {}

  makeShell(b) {
    if (b.plan.water) return this.waterBlock(b);
    super.makeShell(b);
    if (b.plan.special === 'embassy') this.embassy(b);
  }

  makeDetail(b) {
    if (b.plan.water) {
      const carMesh = new THREE.InstancedMesh(this.G.car, this.M.car, 1);
      carMesh.count = 0;
      const group = new THREE.Group();
      group.add(carMesh);
      this.group.add(group);
      b.detail = { group, solids: [], lamps: b.shell.lamps || [], cars: [], trees: [], planters: [], exits: [], neon: [], stalls: [], carMesh, billboards: [] };
      b.detailGeos = [];
      b.carSolids = [];
      return;
    }
    super.makeDetail(b);
  }

  // A stretch of water: the sea wall, and maybe a bridge running out over it.
  waterBlock(b) {
    const kit = new Kit();
    const solids = [], lamps = [];
    const solid = (x0, z0, x1, z1, y1 = 30) => {
      const s = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, rot: 0, y0: -1, y1 };
      this.colliders.add(s);
      solids.push(s);
    };
    const { i, j } = b.plan;
    const X0 = i * B, Z0 = j * B;
    const bridge = b.plan.bridge;
    // The sea wall along the waterfront, open where a bridge starts.
    if (j === 5) {
      const segs = bridge ? [[X0 + R, X0 + B]] : [[X0, X0 + B]];
      for (const [a, c] of segs) {
        kit.box('kerb', (a + c) / 2, 0.45, SHORE + 0.3, c - a, 0.9, 0.6);
        solid(a, SHORE, c, SHORE + 0.6, 30);
      }
    }
    if (bridge) {
      const z0 = Math.max(Z0, SHORE), zEnd = b.plan.broken ? Math.min(Z0 + B, BROKEN_END) : Z0 + B;
      if (zEnd > z0) {
        const bx = X0 + R / 2;
        for (let z = z0; z < zEnd; z += 4) {
          const z1 = Math.min(zEnd, z + 4), zm = (z + z1) / 2, y = deckY(zm);
          kit.add('baseDark', new THREE.BoxGeometry(R, 0.9, z1 - z + 0.02).translate(0, -0.45, 0), bx, y, zm, Math.atan2(deckY(z1) - deckY(z), z1 - z) * -1, 0, 0);
          for (const s of [-1, 1]) kit.add('metal', new THREE.BoxGeometry(0.12, 1.0, z1 - z + 0.02).translate(0, 0.5, 0), bx + s * (R / 2 - 0.2), y, zm);
        }
        solid(X0, z0, X0 + 0.5, zEnd);
        solid(X0 + R - 0.5, z0, X0 + R, zEnd);
        // Piers: pairs of columns tied by a beam, like the ones in the bay.
        for (let z = Math.ceil(z0 / 24) * 24; z < zEnd; z += 24) {
          const y = deckY(z) - 0.9;
          if (y < 1) continue;
          for (const dx of [-5, -2, 2, 5]) kit.box('baseDark', bx + dx, y / 2, z, 0.7, y, 0.7);
          kit.box('baseDark', bx, y * 0.55, z, 11, 0.5, 0.6);
        }
        // Lamp posts with red globes.
        for (let z = Math.ceil(z0 / 30) * 30 + 6; z < zEnd; z += 30) {
          const side = (Math.round(z / 30) % 2) ? 1 : -1;
          const x = bx + side * (R / 2 - 0.4), y = deckY(z);
          kit.add('pole', this.G.pole, x, y, z, 0, 0, 0, 1, 7, 1);
          kit.add('lampHead', new THREE.SphereGeometry(0.28, 10, 8), x, y + 7.2, z);
          lamps.push({ x, y: y + 7, z });
        }
        if (b.plan.broken && zEnd === BROKEN_END) {
          // Torn off: a ragged edge, rebar hanging out over nothing.
          for (let k = 0; k < 9; k++) kit.box('baseDark', bx - R / 2 + 0.9 + k * 1.75, deckY(zEnd) - 0.5 - (k % 3) * 0.3, zEnd + (k % 2) * 0.8, 1.6, 0.8, 1.5);
          for (let k = 0; k < 12; k++) kit.add('rebar', new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), bx - R / 2 + 0.6 + k * 1.3, deckY(zEnd) - 0.8, zEnd + 1.2, 0.9 + (k % 3) * 0.3, 0, 0);
          solid(X0, zEnd - 0.4, X0 + R, zEnd);
        }
      }
    }
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const group = kit.build(this.M, own);
    this.group.add(group);
    b.shell = { group, solids, shops: [], exits: [], billboards: [], lights: [], lamps };
    b.shellGeos = own.geos;
  }

  // The Embassy: a domed capitol lit pink-red from below.
  embassy(b) {
    const M = this.redMats();
    const kit = new Kit();
    const { x: cx, z: cz } = EMB_C;
    const solids = [];
    const solid = (x, z, hw, hd, y1 = 40) => {
      const s = { x, z, hw, hd, rot: 0, y0: -1, y1 };
      this.colliders.add(s);
      solids.push(s);
    };
    const front = cz + 9; // the face towards the south
    // Steps and podium.
    for (let k = 0; k < 5; k++) kit.box('embStone', cx, 0.15 + k * 0.3, front + 4 - k * 0.7, 30 - k, 0.3, 2);
    kit.box('embStone', cx, 0.9, cz, 56, 1.8, 20);
    // Main hall with a portico of columns.
    kit.box('embStone', cx, 1.8 + 7, cz, 40, 14, 16);
    for (let k = 0; k < 10; k++) {
      const x = cx - 13.5 + k * 3;
      kit.add('embStone', new THREE.CylinderGeometry(0.55, 0.65, 11, 12), x, 1.8 + 5.5, front + 0.6);
      if (k < 9) kit.box('embWin', x + 1.5, 6, front - 0.95, 1.6, 5, 0.1);
    }
    kit.box('embStone', cx, 13.6, front + 0.6, 30, 1.6, 2.4);
    kit.add('embStone', new THREE.CylinderGeometry(0.01, 15.5, 3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.16), cx, 15.9, front + 0.6);
    // Wings.
    for (const s of [-1, 1]) {
      kit.box('embStone', cx + s * 24, 1.8 + 5, cz, 12, 10, 14);
      for (let k = 0; k < 3; k++) kit.box('embWin', cx + s * (20 + k * 3.5), 6.5, cz + 7.05, 1.5, 4, 0.1);
    }
    // Drum, colonnade, dome, lantern, spire.
    kit.add('embStone', new THREE.CylinderGeometry(9, 9.5, 6, 24), cx, 15.8 + 3, cz);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      kit.add('embStone', new THREE.CylinderGeometry(0.35, 0.4, 5.5, 8), cx + Math.sin(a) * 10.2, 16 + 2.75, cz + Math.cos(a) * 10.2);
      kit.box('embWin', cx + Math.sin(a) * 9.05, 19, cz + Math.cos(a) * 9.05, 1.0, 3, 1.0);
    }
    kit.add('embStone', new THREE.CylinderGeometry(10.6, 10.6, 1, 24), cx, 22, cz);
    kit.add('embDome', new THREE.SphereGeometry(9.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), cx, 22.4, cz);
    kit.add('embStone', new THREE.CylinderGeometry(1.4, 1.6, 3, 12), cx, 33.5, cz);
    kit.add('embWin', new THREE.CylinderGeometry(1.2, 1.2, 1.8, 12), cx, 33.6, cz);
    kit.add('embDome', new THREE.ConeGeometry(1.1, 4, 12), cx, 37, cz);
    kit.add('lampHead', new THREE.SphereGeometry(0.3, 8, 6), cx, 39.2, cz);
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const group = kit.build(M, own);
    b.shell.group.add(group);
    b.shellGeos.push(...own.geos);
    solid(cx, cz, 28, 10);
    solid(cx, front + 0.6, 15, 1.4);
    b.shell.solids.push(...solids);
  }

  // Materials only this level uses, made on first need (the Level 11
  // constructor builds the first blocks before ours has run).
  redMats() {
    if (this.M.embStone) return this.M;
    const L = (o) => {
      const m = new THREE.MeshLambertMaterial(o);
      this.own.mats.push(m);
      return m;
    };
    this.M.embStone = L({ map: this.T.baseLight, color: 0xe8d8d0, emissive: 0xff3a5a, emissiveIntensity: 0.28 });
    this.M.embDome = L({ color: 0x8a5058, emissive: 0xff2a4a, emissiveIntensity: 0.22 });
    this.M.embWin = L({ color: 0x401010, emissive: 0xff6a5a, emissiveIntensity: 1.4 });
    return this.M;
  }

  // ---- Sky, water, rain, phantoms ---------------------------------------------------------

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        vortexDir: { value: new THREE.Vector3(0, 1, 0) },
        time: { value: 0 },
        flash: { value: 0 },
        vflash: { value: 0 },
        // Unused here, kept so Level 11's code can write them.
        sunDir: { value: new THREE.Vector3() }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, night: { value: 1 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform vec3 vortexDir;
        uniform float time, flash, vflash;
        varying vec3 vDir;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec3 d = normalize(vDir);
          float up = max(d.y, 0.0);
          vec3 col = mix(vec3(0.62, 0.09, 0.14), vec3(0.1, 0.015, 0.03), pow(up, 0.55));
          // Low cloud, lit red from below.
          float cl = vn(vec2(atan(d.z, d.x) * 6.0, up * 14.0) + time * 0.01);
          col *= 0.85 + cl * 0.3;
          // The Vortex.
          vec3 v = normalize(vortexDir);
          float c = dot(d, v);
          if (c > 0.55) {
            vec3 t1 = normalize(cross(v, vec3(0.0, 0.0, 1.0)));
            vec3 t2 = cross(v, t1);
            float a = atan(dot(d, t2), dot(d, t1));
            float r = acos(clamp(c, -1.0, 1.0));
            float k = smoothstep(0.36, 0.03, r);
            float sw = 0.5 + 0.5 * sin(a * 4.0 - r * 42.0 + time * 0.9);
            sw *= 0.6 + 0.4 * vn(vec2(a * 3.0, r * 20.0 - time * 0.4));
            vec3 storm = mix(vec3(0.08, 0.0, 0.02), vec3(0.95, 0.15, 0.2), sw);
            storm *= smoothstep(0.012, 0.07, r);
            float bolt = vflash * step(0.75, vn(vec2(a * 9.0, r * 40.0 + time * 7.0)));
            storm += vec3(1.0, 0.55, 0.6) * bolt * k;
            col = mix(col, storm, k * 0.9);
          }
          col += vec3(0.7, 0.2, 0.25) * flash;
          if (d.y < 0.0) col = vec3(0.3, 0.04, 0.07);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.own.mats.push(mat);
    this.skyMat = mat;
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat);
    this.skyMesh.renderOrder = -1;
    this.skyMesh.frustumCulled = false;
    this.own.geos.push(this.skyMesh.geometry);
    this.group.add(this.skyMesh);
  }

  buildWater() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0c0204';
    g.fillRect(0, 0, 256, 256);
    // Broken streaks of reflected red light.
    for (let k = 0; k < 900; k++) {
      const v = Math.random();
      g.fillStyle = `rgba(${200 + v * 55},${20 + v * 40},${30 + v * 30},${(0.2 + v * 0.6).toFixed(2)})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 6, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 30);
    t.colorSpace = THREE.SRGBColorSpace;
    this.own.textures.push(t);
    this.waterTex = t;
    const m = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff });
    this.own.mats.push(m);
    const geo = new THREE.PlaneGeometry(2400, 1200).rotateX(-Math.PI / 2);
    this.own.geos.push(geo);
    this.water = new THREE.Mesh(geo, m);
    this.group.add(this.water);
  }

  buildRain() {
    const N = 1600;
    const pos = new Float32Array(N * 6);
    this.drops = [];
    for (let k = 0; k < N; k++) this.drops.push([Math.random() * 40 - 20, Math.random() * 18, Math.random() * 40 - 20]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({ color: 0xff6a7a, transparent: true, opacity: 0.35 });
    this.own.geos.push(g);
    this.own.mats.push(m);
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  buildPhantoms() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.filter = 'blur(2px)';
    g.beginPath();
    g.arc(32, 22, 12, 0, Math.PI * 2);
    g.fill();
    g.fillRect(18, 34, 28, 60);
    g.fillRect(12, 38, 8, 48);
    g.fillRect(44, 38, 8, 48);
    g.fillRect(20, 92, 10, 66);
    g.fillRect(34, 92, 10, 66);
    const t = new THREE.CanvasTexture(c);
    this.own.textures.push(t);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, depthWrite: false, color: 0x000000 });
    this.own.mats.push(m);
    const geo = new THREE.PlaneGeometry(0.75, 1.85).translate(0, 0.92, 0);
    this.own.geos.push(geo);
    this.phantoms = Array.from({ length: 3 }, () => {
      const p = new THREE.Mesh(geo, m);
      p.visible = false;
      this.group.add(p);
      return { mesh: p, t: 0 };
    });
  }

  // ---- Light ----------------------------------------------------------------------------

  updateSun(dt, player) {
    this.hour = 0;
    this.sky = { day: 0, night: 1, e: -30, gold: 0 };
    this.sun.intensity = 0;
    this.hemi.color.setRGB(0.55, 0.1, 0.14);
    this.hemi.groundColor.setRGB(0.12, 0.02, 0.03);
    this.hemi.intensity = 1.1 + (this.flash || 0) * 6;
    const px = player.pos.x, pz = player.pos.z;
    this.skyMesh.position.set(px, 0, pz);
    this.ground.position.set(Math.round(px / B) * B, 0, Math.round(pz / B) * B);
    if (this.water) this.water.position.set(Math.round(px / 10) * 10, 0.04, SHORE + 600);
    const u = this.skyMat.uniforms;
    u.vortexDir.value.copy(VORTEX).sub(new THREE.Vector3(px, 1.6, pz)).normalize();
    u.time.value = this.time || 0;
    u.flash.value = this.flash || 0;
    u.vflash.value = this.vflash || 0;
    this.horizon = this.horizon || new THREE.Color();
    this.horizon.setRGB(0.3, 0.04, 0.07);
    const M = this.M;
    for (const s of ['stone', 'glass', 'granite', 'concrete', 'brick', 'tan', 'white', 'overgrown', 'boarded']) {
      M[s].emissive.copy(RED);
      M[s].emissiveIntensity = 1.6;
      M[s].reflectivity = M[s].userData.refl * 0.3;
    }
    M.sign.emissive.copy(RED);
    M.sign.emissiveIntensity = 0.5;
    M.ads.emissive.copy(RED);
    M.ads.emissiveIntensity = 0.7;
    M.banners.emissiveIntensity = 0.5;
    M.lobby.emissive.copy(RED);
    M.lobby.emissiveIntensity = 1;
    M.lampHead.emissive.setRGB(1, 0.1, 0.15);
    M.lampHead.emissiveIntensity = 2;
    M.panel.emissive.setRGB(1, 0.2, 0.22);
    M.shopDark.reflectivity = 0.15;
  }

  lightAt() {
    return 0.22;
  }

  updateLights(dt, player) {
    super.updateLights(dt, player);
    for (const l of this.pool) l.color.setRGB(1, 0.13, 0.17);
  }

  updateSignals() {
    const on = Math.sin(this.time * 3) > 0;
    for (const g of ['ew', 'ns']) {
      this.M[`sig_${g}_r`].emissiveIntensity = on ? 2.4 : 0.04;
      this.M[`sig_${g}_y`].emissiveIntensity = 0.04;
      this.M[`sig_${g}_g`].emissiveIntensity = 0.04;
    }
  }

  // ---- Entities -----------------------------------------------------------------------------

  servant(x, z, opts) {
    const e = new Servant({ scene: this.scene, world: this.world, audio: this.ctx.audio, rng: this.rng.fork('sv' + this.entities.list.length + this.time), shared: this.shared }, { x, z, ...opts });
    e.type = 'servant';
    this.entities.list.push(e);
    return e;
  }

  pack(n, near, opts = {}) {
    const pack = { close: false, spin: this.rng.range(0, 6), t: 0, members: [] };
    for (let k = 0; k < n; k++) {
      let x = near.x + this.rng.range(-4, 4), z = near.z + this.rng.range(-4, 4);
      if (opts.far) {
        const e = this.entities.spawnFar('faceling', near.player, { min: 35, max: 70 });
        if (!e) continue;
        x = e.pos.x;
        z = e.pos.z;
        this.entities.remove(e);
      }
      const clean = opts.clean ?? z < 2 * B;
      const g = opts.guard ? { x, z } : null;
      pack.members.push(this.servant(x, z, { pack, slot: (k / n) * Math.PI * 2, clean, guard: g }));
    }
    this.packs.push(pack);
    return pack;
  }

  spawnStart(player) {
    // A loose pack at the end of your bridge.
    this.pack(3, { x: BROKEN * B + R / 2, z: SHORE - 12 }, { clean: false });
    // Guards at the bridges either side, and further along.
    for (const i of [0, 6, -3, 9]) this.pack(3, { x: i * B + R / 2, z: SHORE - 6 }, { clean: false, guard: true });
    // The Embassy's guard, and an Ambassador on its steps.
    this.pack(5, { x: EMB_C.x, z: EMB_C.z + 26 }, { clean: true, guard: true });
    const amb = new Ambassador({ scene: this.scene, world: this.world, audio: this.ctx.audio, rng: this.rng.fork('amb'), shared: this.shared }, { x: EMB_C.x, z: EMB_C.z + 15 });
    amb.type = 'ambassador';
    this.entities.list.push(amb);
    const amb2 = new Ambassador({ scene: this.scene, world: this.world, audio: this.ctx.audio, rng: this.rng.fork('amb2'), shared: this.shared }, { x: 1 * B + 10, z: 2 * B + 10 });
    amb2.type = 'ambassador';
    this.entities.list.push(amb2);
  }

  trickle(dt, player) {
    this.nextEnt -= dt;
    if (this.nextEnt > 0) return;
    this.nextEnt = this.rng.range(28, 50);
    const p = player.pos;
    if (p.x < 0 || p.z < 0 || p.x > 7 * B || p.z > SHORE) return;
    const near = this.entities.list.filter((e) => e.type === 'servant' && e.distTo(player) < 60).length;
    if (near >= 9) return;
    this.pack(2 + Math.floor(this.rng.next() * 2 + (p.z < 3 * B ? 1 : 0)), { x: p.x, z: p.z, player }, { far: true });
    for (const o of [...this.entities.list]) if (o.type === 'servant' && o.distTo(player) > 150 && !o.opts.guard) this.entities.remove(o);
  }

  updatePacks(dt, player) {
    const cornered = inAlley(player.pos.x, player.pos.z) || this.inside;
    for (const pk of this.packs) {
      pk.members = pk.members.filter((e) => e.alive);
      if (!pk.members.length) continue;
      pk.spin += dt * 0.04;
      const near = pk.members.filter((e) => e.distTo(player) < 18).length;
      const close = pk.members.some((e) => e.distTo(player) < 30);
      if (close) pk.t += dt;
      if (!pk.close && ((near >= 3) || (cornered && close) || pk.t > 55)) {
        pk.close = true;
        if (!this.told.close) {
          this.told.close = true;
          this.ctx.hud.message('They\'ve stopped pretending. They\'re all coming at once. RUN.', 3);
        }
      }
    }
    this.packs = this.packs.filter((pk) => pk.members.length);
  }

  // ---- Per frame ------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    if (this.startEntities) {
      this.startEntities = false;
      this.spawnStart(player);
    }
    this.updateBlocks(player);
    this.buildPending(false);
    this.updateWeather(dt, player);
    this.updateSun(dt, player);
    this.updateLights(dt, player);
    this.updateSignals(dt, player);
    this.updateChanges(dt, player);
    this.waterTex.offset.x = Math.sin(this.time * 0.2) * 0.02;
    this.waterTex.offset.y = this.time * 0.004;
    // Inside an empty shop?
    this.inside = null;
    for (const b of this.blocks.values()) for (const s of b.shell?.shops || []) {
      if (player.pos.x > s.x0 && player.pos.x < s.x1 && player.pos.z > s.z0 && player.pos.z < s.z1) this.inside = s;
    }
    if (this.inside && !this.told.shop) {
      this.told.shop = true;
      ctx.hud.message('Empty. Stripped to the walls, like everything here. A good place to get trapped.', 4);
    }
    this.updatePacks(dt, player);
    this.trickle(dt, player);
    for (const e of this.entities.list) e.pos.y = this.world.groundAt(e.pos.x, e.pos.z);
    const res = this.entities.update(dt, player, ctx);
    let ambNear = null;
    for (const ev of res.events) {
      if (ev.type === 'speak') {
        ctx.hud.message(ev.text, 5);
        player.sanity = Math.max(0, player.sanity - 3);
        // The Servants listen.
        for (const pk of this.packs) if (pk.members.some((m) => m.distTo(player) < 50)) pk.close = true;
      }
    }
    for (const e of this.entities.list) {
      e.root.visible = e.distTo(player) < 110;
      if (e.type === 'servant' && !this.told.servant && e.distTo(player) < 30 && e.root.visible) {
        this.told.servant = true;
        ctx.hud.message('People, standing in the red light, a long way off. They don\'t move while you look at them. When you look again, they\'re closer.', 5);
      }
      if (e.type === 'ambassador' && e.distTo(player) < 12) ambNear = e;
    }
    const masked = player.count?.('mask') > 0;
    // An Ambassador draws you in, if you look at it.
    if (ambNear && !masked && ambNear.seenBy(player, 0.8, 12)) {
      const dx = ambNear.pos.x - player.pos.x, dz = ambNear.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d > 1.6) {
        player.pos.x += (dx / d) * 0.55 * dt;
        player.pos.z += (dz / d) * 0.55 * dt;
      }
      player.sanity = Math.max(0, player.sanity - 0.6 * dt);
    }
    this.updateAir(dt, player, masked);
    this.updateExits(dt, player);
    if (this.done) return;
    if (player.health <= 0 || player.sanity <= 0 || res.dead) {
      this.done = true;
      ctx.onDeath(player.sanity <= 0 ? 'The red got into your head. You walked to the Embassy on your own. Mother was waiting.' : res.cause);
    }
  }

  // The bad air: sanity, and things that aren't there.
  updateAir(dt, player, masked) {
    const { ctx } = this;
    const p = player.pos;
    const out = p.z > SHORE + 20 ? 0.4 : 1;
    const deep = Math.max(0, Math.min(1, (SHORE - p.z) / (5 * B)));
    this.contam = out * (0.6 + deep * 0.6) * (masked ? 0.5 : 1);
    player.sanity = Math.max(0, player.sanity - 0.07 * this.contam * dt);
    if (!masked && !this.told.mask && this.time > 40) {
      this.told.mask = true;
      ctx.hud.message('Your head swims. Something in the air. A mask would help, if you could find one.', 4);
    }
    if (masked && !this.told.masked) {
      this.told.masked = true;
      ctx.hud.message('You put the mask on. The air tastes less of metal. Your thoughts come a little clearer.', 4);
    }
    // Figures at the edge of your sight.
    this.nextPhantom -= dt * this.contam;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    if (this.nextPhantom <= 0) {
      this.nextPhantom = this.rng.range(6, 14);
      const ph = this.phantoms.find((q) => !q.mesh.visible);
      if (ph) {
        const a = player.yaw + (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(0.95, 1.3);
        const d = this.rng.range(10, 24);
        ph.mesh.position.set(p.x - Math.sin(a) * d, this.world.groundAt(p.x - Math.sin(a) * d, p.z - Math.cos(a) * d), p.z - Math.cos(a) * d);
        ph.mesh.visible = true;
        ph.t = 0;
        if (this.rng.chance(0.4)) ctx.audio.phantomSteps?.(this.rng.range(-1, 1));
      }
    }
    for (const ph of this.phantoms) {
      if (!ph.mesh.visible) continue;
      ph.t += dt;
      const dx = ph.mesh.position.x - p.x, dz = ph.mesh.position.z - p.z, d = Math.hypot(dx, dz) || 1;
      ph.mesh.rotation.y = Math.atan2(-dx, -dz);
      if ((dx * fx + dz * fz) / d > 0.85 || ph.t > 4) ph.mesh.visible = false;
    }
    this.nextWhisper -= dt * this.contam;
    if (this.nextWhisper <= 0) {
      this.nextWhisper = this.rng.range(8, 20);
      ctx.audio.whisper?.(this.rng.range(-1, 1), 0.12);
      if (this.rng.chance(0.3)) ctx.hud.message(this.rng.pick(['Someone says your name, close behind you. Nobody\'s there.', '"Yusuf?" A voice, from a doorway. "Is that you?"', 'Mother. Someone, somewhere, is saying Mother.', 'You hear footsteps keeping pace with yours. They stop when you stop.']), 3);
    }
  }

  updateWeather(dt, player) {
    const { ctx } = this;
    const W = this.weather;
    W.next -= dt;
    if (W.next <= 0) {
      W.target = W.target > 0 ? 0 : this.rng.range(0.6, 1);
      W.next = W.target ? this.rng.range(40, 80) : this.rng.range(50, 100);
      ctx.hud.message(W.target ? this.rng.pick(['It starts to rain. Cold, thin rain, and the light runs red in it.', 'The air goes hot and heavy, then the rain comes.']) : 'The rain stops. Water drips off everything.', 3);
    }
    W.rain += (W.target - W.rain) * Math.min(1, dt * 0.3);
    // Rain round the camera.
    const pos = this.rain.geometry.attributes.position;
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
    const n = Math.floor(this.drops.length * W.rain);
    for (let k = 0; k < this.drops.length; k++) {
      const d = this.drops[k];
      d[1] -= dt * 22;
      if (d[1] < 0) d[1] += 18;
      const on = k < n;
      const x = px + d[0], y = py + d[1] - 2, z = pz + d[2];
      pos.setXYZ(k * 2, x, on ? y : -50, z);
      pos.setXYZ(k * 2 + 1, x + 0.05, on ? y - 0.6 : -50, z);
    }
    pos.needsUpdate = true;
    // Red lightning: in the Vortex all the time, across the sky in storms.
    this.flash = Math.max(0, this.flash - dt * 3);
    this.vflash = Math.max(0, this.vflash - dt * 2.5);
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      const big = W.rain > 0.3 && this.rng.chance(0.6);
      this.nextBolt = this.rng.range(3, 9) * (big ? 1.5 : 1);
      this.vflash = 1;
      if (big) {
        this.flash = 1;
        setTimeout(() => ctx.audio.crash?.(this.rng.range(-1, 1), 0.35), 600 + Math.random() * 1500);
      } else ctx.audio.crack?.(this.rng.range(-1, 1), 0.06);
    }
  }

  updateExits(dt, player) {
    const { ctx } = this;
    const p = player.pos;
    // The Embassy.
    const de = Math.hypot(p.x - EMB_C.x, p.z - EMB_C.z);
    if (de < 70 && !this.told.embassy) {
      this.told.embassy = true;
      ctx.hud.message('The Embassy: a great domed building lit pink and red from below, like a capitol. Something inside it is humming, low and constant. It gets into your teeth.', 6);
      ctx.award?.('embassy113');
    }
    // The bridges.
    if (p.z > SHORE + 2 && this.onBridge(p.x, p.z, 0)) {
      const i = Math.floor(p.x / B);
      if (i === BROKEN) {
        if (p.z > BROKEN_END - 25 && !this.told.broken) {
          this.told.broken = true;
          ctx.hud.message('The bridge ends here, torn off over the black water. There\'s no going back this way.', 4);
        }
        return;
      }
      const out = p.z - SHORE;
      if (out > 40 && !this.told.b1) {
        this.told.b1 = true;
        ctx.hud.message('This bridge goes on, out over the black water. Behind you, the red city. Ahead, nothing at all.', 4);
      }
      if (out > 150 && !this.told.b2) {
        this.told.b2 = true;
        ctx.hud.message('Far ahead, very faint: ordinary city lights. Warm ones. Not red.', 4);
      }
      if (out > ESCAPE) {
        this.done = true;
        ctx.hud.message('The red fades behind you. The bridge comes down into a city you know: Level 11, quiet, ordinary, wonderful.', 5);
        ctx.award?.('out113');
        ctx.onEscape('level11', 'walk');
      }
    }
  }

  photoSubjects() {
    return [];
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. (The taps here are all dry.)', 2);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  audioMix(player) {
    let drone = 0.1 + this.contam * 0.05;
    for (const e of this.entities.list) {
      if (e.type !== 'servant' || e.state !== 'rush') continue;
      drone = Math.max(drone, 0.35 * Math.max(0, 1 - e.distTo(player) / 35));
    }
    const de = Math.hypot(player.pos.x - EMB_C.x, player.pos.z - EMB_C.z);
    return {
      hum: 0, exitGain: 0, exitPan: 0, drone, machine: Math.max(0, 0.35 * (1 - de / 160)), jazz: 0,
      wind: 0.05 + this.weather.rain * 0.06, city: 0.03, waves: player.pos.z > SHORE - 30 ? 0.12 : 0,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    this.fogC = this.fogC || new THREE.Color();
    this.fogC.setRGB(0.24 + this.flash * 0.4, 0.035 + this.flash * 0.1, 0.06 + this.flash * 0.1);
    return {
      fogColor: this.fogC,
      fogDensity: 0.0042 + this.weather.rain * 0.003,
      warp: this.contam * 0.35 + insane * insane * 0.6, aberr: 0.3 + insane * 0.8, grain: 0.12, soften: 0.3,
    };
  }

  hudInfo(player) {
    const coming = this.entities.list.some((e) => e.type === 'servant' && e.state === 'rush' && e.distTo(player) < 30);
    const warn = coming ? 'THEY\'RE COMING' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }
}

export const LEVEL11_3 = {
  id: 'level11_3',
  number: 11.3,
  name: 'Level 11.3',
  title: 'The Red Light District',
  difficulty: 5,
  next: 'level11',
  create: (ctx) => new Level113(ctx),
};
