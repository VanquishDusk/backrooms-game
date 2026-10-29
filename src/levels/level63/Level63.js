import * as THREE from 'three';
import { ChunkedBuilders } from '../../world/tubes.js';
import { utilityDoorTexture } from '../../world/textures.js';
import { disposeTextures } from '../../world/props.js';
import { generateLevel63, BASE } from './generate.js';

// Level 63 — "Tranquility".
//
//  - High in an endless sky: wooden platforms on stilts, rope bridges, plank
//    bridges, ladders up to a second tier, monkey bars across some gaps
//  - Walls of living vine rise out of the void in the distance and keep
//    shifting into new patterns
//  - A day-night cycle that never gets dark; clouds form and drift through
//  - Meditation Points: round platforms with a bench. It's quieter there;
//    sit down and your thoughts settle (sanity comes back fast)
//  - Nothing lives here. Wind, creaking rope, the vines
//  - The only way out is down: fall into the void and you wake up
//    somewhere else, somewhere safe

const DIRV = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const STEP_UP = 0.45;
const GRAVITY = 14;
const DAY = 420; // seconds for a full day
const WAKE = ['level4', 'level1'];
const THOUGHTS = [
  'The wind drops. Your breathing slows to match it.',
  'You let one worry go, then another.',
  'For the first time in a long time, nothing is following you.',
  'The vines shift far off. It doesn\'t matter.',
  'You remember something from before the Backrooms. It\'s still yours.',
  'Your thoughts line up, quietly, one after another.',
];

export class Level63 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.shared = ctx.shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel63(rng.fork('layout'));
    this.layout = layout;
    this.cameraFar = 1400;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.geos = [];
    this.mats = [];
    this.textures = {};
    this.surfaces = [];
    this.rails = [];
    this.buildMaterials(ctx.renderer);
    this.buildSky();
    this.buildClouds(rng.fork('clouds'));
    this.buildVines(rng.fork('vines'));
    this.buildStructures(rng.fork('build'));

    const sp = layout.spawn;
    const link = layout.links.find((l) => l.a === sp.id || l.b === sp.id);
    const tx = link ? (link.a === sp.id ? link.bx : link.ax) : sp.x, tz = link ? (link.a === sp.id ? link.bz : link.az) : sp.z - 5;
    this.spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-(tx - sp.x), -(tz - sp.z)) };
    this.y = sp.y;
    this.vy = 0;
    this.lowest = Math.min(...layout.platforms.map((p) => p.y));
    this.world = {
      collide: (pos, r) => this.collide(pos, r),
      groundAt: () => this.y,
      sampleLight: () => [0.85, 0.85, 0.85],
    };
    this.time = this.rng.range(0, DAY * 0.3);
    this.done = false;
    this.fallTime = 0;
    this.sitting = false;
    this.still = 0;
    this.nextThought = 4;
    this.nextGust = 3;
    this.nextCreak = 1;
    this.nextShift = 12;
    this.letGo = false;
    this.fogColor = new THREE.Color();
    this.told = {};
  }

  // ---- Materials and textures -------------------------------------------------------

  buildMaterials(renderer) {
    const t = this.textures;
    t.deck = planks(renderer, '#b0946c', 5);
    t.dark = woodGrain(renderer, '#7a6046');
    t.rail = woodGrain(renderer, '#9a7c5a');
    t.rope = ropeTex(renderer);
    t.door = utilityDoorTexture(renderer, 'locked');
    const lam = (map, color = 0xffffff) => {
      const m = new THREE.MeshLambertMaterial({ map, color });
      this.mats.push(m);
      return m;
    };
    this.m = {
      deck: lam(t.deck), beam: lam(t.dark), post: lam(t.dark, 0xd8d0c8), rail: lam(t.rail), rope: lam(t.rope),
      iron: lam(null, 0x3a3c3e), bench: lam(t.deck, 0xe0d4c0), steel: lam(null, 0x6a6e70), door: lam(t.door),
    };
    // Sky light and sun; the day-night cycle moves them.
    this.hemi = new THREE.HemisphereLight(0xbcd4f0, 0x6a7a90, 1.3);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 1.3);
    this.group.add(this.hemi, this.sun, this.sun.target);
  }

  // ---- Sky -----------------------------------------------------------------------

  buildSky() {
    const geo = new THREE.SphereGeometry(1000, 48, 24);
    this.geos.push(geo);
    this.skyU = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      depth: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color() },
      moonDir: { value: new THREE.Vector3(0, -1, 0) },
      night: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith, horizon, depth, sunCol, sunDir, moonDir;
        uniform float night;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.55)) : mix(horizon, depth, pow(-d.y, 0.7));
          // The sun: a hot disc and a wide glow.
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 60.0) * 0.45 + pow(s, 6.0) * 0.12);
          // At night, a moon and a few stars (it never gets dark here).
          float m = max(dot(d, moonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * night * (pow(m, 1400.0) * 2.0 + pow(m, 40.0) * 0.15);
          float st = step(0.9985, hash(floor(d * 400.0))) * night * smoothstep(0.0, 0.3, d.y);
          col += st * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mats.push(mat);
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  // Colours over the day: [elevation, zenith, horizon, depth below, sun].
  palette(elev) {
    const keys = [
      [-1.0, '#2a3e78', '#6a86b8', '#4a6aa0', '#9ab0e0'],
      [-0.2, '#2a3e78', '#7a8cc0', '#5a76aa', '#c8a0c0'],
      [0.0, '#3a5a9a', '#f0a87a', '#7a90c0', '#ffb070'],
      [0.18, '#2459a6', '#a8c4e4', '#8eb0da', '#fff0d0'],
      [1.0, '#16469a', '#7ea6d8', '#a8c6ea', '#fff8e8'],
    ];
    let i = 0;
    while (i < keys.length - 2 && elev > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1];
    const t = Math.max(0, Math.min(1, (elev - a[0]) / (b[0] - a[0])));
    const mix = (k) => new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t);
    return { zenith: mix(1), horizon: mix(2), depth: mix(3), sun: mix(4) };
  }

  updateSky(dt, player) {
    const ph = (this.time / DAY) * Math.PI * 2;
    const elev = Math.sin(ph);
    const sd = new THREE.Vector3(Math.cos(ph) * 0.8, elev, Math.cos(ph) * 0.6).normalize();
    const pal = this.palette(elev);
    const U = this.skyU;
    U.zenith.value.copy(pal.zenith);
    U.horizon.value.copy(pal.horizon);
    U.depth.value.copy(pal.depth);
    U.sunCol.value.copy(pal.sun).multiplyScalar(Math.max(0, Math.min(1, elev * 4 + 0.6)));
    U.sunDir.value.copy(sd);
    U.moonDir.value.copy(sd).negate();
    U.night.value = Math.max(0, Math.min(1, -elev * 3));
    this.horizon = pal.horizon;
    this.sky.position.copy(player.pos);
    // Light: sun by day, a bright moon by night. Never dark.
    const day = Math.max(0, Math.min(1, elev * 3 + 0.3));
    const src = elev > -0.05 ? sd : U.moonDir.value;
    this.sun.position.set(player.pos.x + src.x * 50, player.pos.y + src.y * 50, player.pos.z + src.z * 50);
    this.sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
    this.sun.color.copy(pal.sun).lerp(new THREE.Color(0xb8c8f0), 1 - day);
    this.sun.intensity = 0.7 + 0.7 * day;
    this.hemi.color.copy(pal.zenith).lerp(new THREE.Color(0xffffff), 0.55);
    this.hemi.groundColor.copy(pal.depth).multiplyScalar(0.8);
    this.hemi.intensity = 1.1 + 0.35 * day;
    this.vineTint = 0.55 + 0.45 * day;
  }

  // ---- Clouds --------------------------------------------------------------------

  buildClouds(rng) {
    this.cloudTex = [0, 1, 2, 3].map((k) => cloudTexture(k));
    this.clouds = [];
    for (let k = 0; k < 44; k++) {
      const mat = new THREE.SpriteMaterial({ map: this.cloudTex[k % 4], transparent: true, depthWrite: false, fog: true, opacity: 0 });
      this.mats.push(mat);
      const s = new THREE.Sprite(mat);
      this.group.add(s);
      const c = { s, mat };
      this.respawnCloud(c, rng, true, k < 10);
      this.clouds.push(c);
    }
    this.cloudRng = rng;
  }

  respawnCloud(c, rng, first = false, near = false) {
    const a = rng.range(0, Math.PI * 2);
    const r = near ? rng.range(25, 70) : rng.range(70, 520);
    const y = near ? BASE + rng.range(-6, 14) : BASE + rng.range(-140, 160);
    c.s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const w = near ? rng.range(14, 30) : rng.range(40, 140);
    c.s.scale.set(w, w * rng.range(0.38, 0.55), 1);
    c.base = near ? rng.range(0.25, 0.45) : rng.range(0.7, 0.95);
    c.life = rng.range(60, 160);
    c.age = first ? rng.range(0, c.life) : 0;
    c.v = rng.range(0.6, 2.4);
  }

  updateClouds(dt) {
    const wind = new THREE.Vector3(1, 0, 0.35).normalize();
    for (const c of this.clouds) {
      c.age += dt;
      if (c.age > c.life) this.respawnCloud(c, this.cloudRng);
      // Clouds form out of nothing, drift, and thin away again.
      const k = Math.min(1, c.age / 12, (c.life - c.age) / 12);
      c.mat.opacity = Math.max(0, k) * c.base;
      c.s.position.addScaledVector(wind, c.v * dt);
    }
  }

  // ---- The vine walls ------------------------------------------------------------

  buildVines(rng) {
    this.vineTex = [0, 1, 2].map((k) => vineTexture(this.ctx.renderer, k));
    this.vines = [];
    // Separate walls far out in the void, with open sky between them.
    const walls = 8;
    let idx = 0;
    for (let w = 0; w < walls; w++) {
      const a0 = (w / walls) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const R = rng.range(430, 640), span = rng.range(0.28, 0.5);
      const top = BASE + rng.range(70, 190), bottom = BASE - 600;
      for (const [layer, rr] of [[0, R + 10], [1, R]]) {
        // One curved sheet per layer, ragged along its top and ends.
        const wd = span * rr, ht = top - bottom + (layer ? rng.range(-40, -10) : 0);
        const geo = new THREE.PlaneGeometry(wd, ht, 16, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const a = a0 + pos.getX(i) / rr;
          const y = bottom + ht / 2 + pos.getY(i);
          pos.setXYZ(i, Math.cos(a) * rr, y, Math.sin(a) * rr);
        }
        geo.computeBoundingSphere();
        this.geos.push(geo);
        const map = this.vineTex[(idx + layer) % 3].clone();
        map.needsUpdate = true;
        map.repeat.set(wd / 46, ht / 46);
        map.offset.set(rng.next(), rng.next());
        const mat = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, fog: true, color: layer ? 0x3f7a30 : 0x24501f });
        const seed = rng.range(0, 100);
        mat.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRaw;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvRaw = uv;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRaw;').replace('#include <alphatest_fragment>', `
            float topEdge = 0.86 + 0.06 * sin(vRaw.x * 23.0 + ${seed.toFixed(2)}) + 0.04 * sin(vRaw.x * 71.0 + ${(seed * 2.3).toFixed(2)});
            float ends = smoothstep(0.0, 0.08 + 0.05 * sin(vRaw.y * 30.0), vRaw.x) * smoothstep(1.0, 0.92 - 0.05 * sin(vRaw.y * 27.0), vRaw.x);
            diffuseColor.a *= step(vRaw.y, topEdge) * ends;
            #include <alphatest_fragment>`);
        };
        this.mats.push(mat);
        const m = new THREE.Mesh(geo, mat);
        this.group.add(m);
        this.vines.push({ m, map, mat, layer, wall: w, speed: rng.range(-0.002, 0.002), shift: 0, target: null, base: mat.color.clone(), at: [Math.cos(a0) * rr, Math.sin(a0) * rr] });
        idx++;
      }
    }
    this.vineWalls = walls;
    this.textures.vineClones = this.vines.map((v) => v.map);
  }

  updateVines(dt, player) {
    for (const v of this.vines) {
      v.map.offset.y += v.speed * dt;
      v.map.offset.x += Math.sin(this.time * 0.05 + v.layer) * 0.0006 * dt;
      // A shift: the pattern unravels and knits itself into another.
      if (v.target != null) {
        v.shift += dt / 5;
        const sh = Math.max(0, v.shift);
        const k = sh < 0.5 ? 1 - sh * 2 : (sh - 0.5) * 2;
        v.mat.alphaTest = 0.3 + (1 - k) * 0.6;
        if (sh >= 0.5 && v.map.image !== this.vineTex[v.target].image) {
          v.map.image = this.vineTex[v.target].image;
          v.map.needsUpdate = true;
        }
        if (v.shift >= 1) {
          v.target = null;
          v.mat.alphaTest = 0.3;
        }
      }
      v.mat.color.copy(v.base).multiplyScalar(this.vineTint ?? 1);
    }
    this.nextShift -= dt;
    if (this.nextShift <= 0) {
      this.nextShift = this.rng.range(8, 18);
      const wall = this.rng.int(0, this.vineWalls - 1);
      let at = null;
      for (const v of this.vines) {
        if (v.wall !== wall || v.target != null) continue;
        v.target = this.rng.int(0, 2);
        v.shift = this.rng.range(-0.3, 0);
        at = v.at;
      }
      if (at) this.ctx.audio.rustle(this.panTo(player, at[0], at[1]), 0.07, 3.5);
    }
  }

  // ---- Structures ------------------------------------------------------------------

  buildStructures(rng) {
    const cb = new ChunkedBuilders(40);
    const { platforms, links } = this.layout;
    const byId = new Map(platforms.map((p) => [p.id, p]));
    for (const p of platforms) {
      if (p.r) this.roundDeck(cb, p, rng);
      else this.squareDeck(cb, p, rng);
    }
    for (const l of links) {
      if (l.type === 'ladder') this.ladder(cb, l, byId);
      else if (l.type === 'monkey') this.monkeyBars(cb, l);
      else this.bridge(cb, l, l.type === 'rope');
    }
    this.metalDoor(cb, this.layout.spawn, rng);
    for (const g of cb.finish(this.group, this.m)) this.geos.push(g);
  }

  addRail(ax, az, bx, bz, y) {
    this.rails.push({ ax, az, bx, bz, y });
  }

  inGap(p, x, z, pad = 0) {
    return p.gaps.some((g) => Math.hypot(g.x - x, g.z - z) < g.w / 2 + pad);
  }

  squareDeck(cb, p, rng) {
    const h = p.half, y = p.y;
    this.surfaces.push({ kind: 'rect', cx: p.x, cz: p.z, c: 1, s: 0, hx: h, hz: h, y0: y, y1: y, sag: 0 });
    cb.at('deck', p.x, p.z).box(p.x, y - 0.08, p.z, 2 * h, 0.16, 2 * h);
    const b = cb.at('beam', p.x, p.z);
    // Rim and joists.
    for (const [dx, dz, sx, sz] of [[0, -h, 2 * h + 0.2, 0.2], [0, h, 2 * h + 0.2, 0.2], [-h, 0, 0.2, 2 * h], [h, 0, 0.2, 2 * h]]) b.box(p.x + dx, y - 0.25, p.z + dz, sx, 0.22, sz);
    for (let k = -1; k <= 1; k++) b.box(p.x + k * h * 0.6, y - 0.32, p.z, 0.16, 0.2, 2 * h);
    // Stilts down into the void, braced near the top.
    const post = cb.at('post', p.x, p.z);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = p.x + sx * (h - 0.15), pz = p.z + sz * (h - 0.15);
      post.box(px, y - 0.3 - 30, pz, 0.26, 60, 0.26);
    }
    // One ring of knee braces under the deck.
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      const A = [p.x + ax * (h - 0.15), p.z + az * (h - 0.15)], B = [p.x + bx * (h - 0.15), p.z + bz * (h - 0.15)];
      const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      b.cylinder([A[0], y - 2.2, A[1]], [M[0], y - 0.4, M[1]], 0.06, 5);
      b.cylinder([B[0], y - 2.2, B[1]], [M[0], y - 0.4, M[1]], 0.06, 5);
    }
    // Railings, with gaps where bridges and ladders join.
    for (let d = 0; d < 4; d++) {
      if (!p.rails[d]) continue;
      const n = DIRV[d], t = [-n[1], n[0]];
      const ex = p.x + n[0] * (h - 0.05), ez = p.z + n[1] * (h - 0.05);
      let run = null;
      const flush = (s1) => {
        if (!run) return;
        const [s0] = run;
        if (s1 - s0 > 0.2) {
          const ax = ex + t[0] * s0, az = ez + t[1] * s0, bx = ex + t[0] * s1, bz = ez + t[1] * s1;
          this.addRail(ax, az, bx, bz, y);
          const r = cb.at('rail', ax, az);
          r.cylinder([ax, y + 1.0, az], [bx, y + 1.0, bz], 0.045, 6);
          r.cylinder([ax, y + 0.55, az], [bx, y + 0.55, bz], 0.03, 5);
          const len = s1 - s0, np = Math.max(1, Math.round(len / 1.4));
          for (let k = 0; k <= np; k++) {
            const s = s0 + (len * k) / np;
            r.box(ex + t[0] * s, y + 0.5, ez + t[1] * s, 0.09, 1.0, 0.09);
          }
        }
        run = null;
      };
      for (let s = -h; s <= h + 1e-6; s += 0.1) {
        const gap = this.inGap(p, ex + t[0] * s, ez + t[1] * s);
        if (!gap && !run) run = [s];
        if (gap) flush(s);
      }
      flush(h);
    }
  }

  roundDeck(cb, p, rng) {
    const r = p.r, y = p.y;
    this.surfaces.push({ kind: 'circle', cx: p.x, cz: p.z, r, y });
    cb.at('deck', p.x, p.z).cylinder([p.x, y - 0.16, p.z], [p.x, y, p.z], r, 28, { caps: true, uScale: 6 });
    const b = cb.at('beam', p.x, p.z);
    b.cylinder([p.x, y - 0.36, p.z], [p.x, y - 0.16, p.z], r + 0.08, 28);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      cb.at('post', p.x, p.z).box(p.x + Math.cos(a) * (r - 0.3), y - 30.3, p.z + Math.sin(a) * (r - 0.3), 0.26, 60, 0.26);
    }
    // A ring of railing, open at the bridge.
    const n = 40;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const ax = p.x + Math.cos(a0) * (r - 0.06), az = p.z + Math.sin(a0) * (r - 0.06);
      const bx = p.x + Math.cos(a1) * (r - 0.06), bz = p.z + Math.sin(a1) * (r - 0.06);
      if (this.inGap(p, (ax + bx) / 2, (az + bz) / 2, 0.1)) continue;
      this.addRail(ax, az, bx, bz, y);
      const rr = cb.at('rail', ax, az);
      rr.cylinder([ax, y + 0.95, az], [bx, y + 0.95, bz], 0.04, 5);
      if (k % 2 === 0) rr.box(ax, y + 0.47, az, 0.08, 0.95, 0.08);
    }
    // The bench, facing out over the void (away from the bridge).
    const g = p.gaps[0];
    const away = g ? Math.atan2(p.z - g.z, p.x - g.x) : 0;
    const c = Math.cos(away), s = Math.sin(away);
    const bench = cb.at('bench', p.x, p.z);
    const rot = Math.atan2(-s, c) + Math.PI / 2;
    bench.box(p.x, y + 0.45, p.z, 1.7, 0.07, 0.46, rot);
    for (const k of [-0.7, 0.7]) bench.box(p.x - s * k, y + 0.22, p.z + c * k, 0.4, 0.44, 0.08, rot + Math.PI / 2);
    p.bench = { x: p.x, z: p.z, yaw: Math.atan2(-c, -s) };
    this.addRail(p.x - s * 0.85, p.z + c * 0.85, p.x + s * 0.85, p.z - c * 0.85, y);
  }

  // A bridge from (ax, ay, az) to (bx, by, bz): rope (sagging planks on ropes) or plank (rails on posts).
  bridge(cb, l, rope) {
    const dx = l.bx - l.ax, dz = l.bz - l.az, L = Math.hypot(dx, dz);
    const c = dx / L, s = dz / L, n = [-s, c];
    const sag = rope ? Math.min(1.1, L * 0.06) : Math.min(0.15, L * 0.01);
    const yAt = (t) => l.ay + (l.by - l.ay) * t - sag * Math.sin(Math.PI * t);
    const P = (t, lat, dy = 0) => [l.ax + dx * t + n[0] * lat, yAt(t) + dy, l.az + dz * t + n[1] * lat];
    this.surfaces.push({ kind: 'rect', cx: (l.ax + l.bx) / 2, cz: (l.az + l.bz) / 2, c, s, hx: L / 2 + 0.12, hz: 0.78, y0: l.ay, y1: l.by, sag, rope });
    const rotY = Math.atan2(-dz, dx);
    const step = rope ? 0.34 : 0.27;
    const nP = Math.max(2, Math.floor(L / step));
    for (let k = 0; k < nP; k++) {
      const t = (k + 0.5) / nP;
      const [x, y, z] = P(t, 0);
      cb.at('deck', x, z).box(x, y - 0.03, z, rope ? 0.24 : 0.25, 0.05, 1.5, rotY);
    }
    const seg = 14;
    const line = (mat, lat, dy, r) => {
      for (let k = 0; k < seg; k++) {
        const a = P(k / seg, lat, dy), b = P((k + 1) / seg, lat, dy);
        cb.at(mat, a[0], a[2]).cylinder(a, b, r, 5, { vScale: 3 });
      }
    };
    for (const side of [-1, 1]) {
      if (rope) {
        line('rope', side * 0.74, 1.0, 0.03);
        line('rope', side * 0.62, -0.07, 0.025);
        for (let k = 0; k <= nP; k += 2) {
          const t = k / nP;
          const a = P(t, side * 0.74, 1.0), b = P(t, side * 0.64, -0.03);
          cb.at('rope', a[0], a[2]).cylinder(a, b, 0.012, 4);
        }
      } else {
        line('rail', side * 0.74, 1.0, 0.045);
        const np = Math.max(2, Math.round(L / 1.6));
        for (let k = 0; k <= np; k++) {
          const [x, y, z] = P(k / np, side * 0.74);
          cb.at('rail', x, z).box(x, y + 0.5, z, 0.09, 1.0, 0.09, rotY);
        }
        line('beam', side * 0.7, -0.12, 0.07);
      }
      // Rails for the body: the bridge's sides.
      for (let k = 0; k < 8; k++) {
        const a = P(k / 8, side * 0.8), b = P((k + 1) / 8, side * 0.8);
        this.addRail(a[0], a[2], b[0], b[2], (a[1] + b[1]) / 2);
      }
    }
    // Stout posts at each end.
    for (const t of [0, 1]) {
      for (const side of [-1, 1]) {
        const [x, y, z] = P(t, side * 0.8);
        cb.at('post', x, z).box(x, y + 0.2, z, 0.2, 1.6, 0.2, rotY);
      }
    }
  }

  monkeyBars(cb, l) {
    const dx = l.bx - l.ax, dz = l.bz - l.az, L = Math.hypot(dx, dz);
    const c = dx / L, s = dz / L, n = [-s, c];
    const P = (t, lat, dy) => [l.ax + dx * t + n[0] * lat, l.ay + (l.by - l.ay) * t + dy, l.az + dz * t + n[1] * lat];
    this.surfaces.push({ kind: 'rect', cx: (l.ax + l.bx) / 2, cz: (l.az + l.bz) / 2, c, s, hx: L / 2 + 0.12, hz: 0.5, y0: l.ay, y1: l.by, sag: 0, monkey: true });
    const top = 2.35;
    for (const side of [-1, 1]) {
      const a = P(0, side * 0.45, top), b = P(1, side * 0.45, top);
      cb.at('beam', a[0], a[2]).cylinder(a, b, 0.06, 6);
      for (const t of [0, 1]) {
        const q = P(t, side * 0.45, top + 0.05), g = P(t, side * 0.45, 0);
        cb.at('beam', q[0], q[2]).cylinder(g, q, 0.08, 6);
      }
      for (let k = 0; k < 8; k++) {
        const A = P(k / 8, side * 0.55, 0), B = P((k + 1) / 8, side * 0.55, 0);
        this.addRail(A[0], A[2], B[0], B[2], (A[1] + B[1]) / 2);
      }
    }
    const nR = Math.floor(L / 0.4);
    for (let k = 1; k < nR; k++) {
      const t = k / nR;
      const a = P(t, -0.45, top), b = P(t, 0.45, top);
      cb.at('iron', a[0], a[2]).cylinder(a, b, 0.025, 6);
    }
  }

  ladder(cb, l, byId) {
    const dx = l.bx - l.ax, dz = l.bz - l.az, L = Math.hypot(dx, dz);
    const c = dx / L, s = dz / L, n = [-s, c];
    this.surfaces.push({ kind: 'rect', cx: (l.ax + l.bx) / 2, cz: (l.az + l.bz) / 2, c, s, hx: L / 2, hz: 0.45, y0: l.ay, y1: l.by, sag: 0, ladder: true });
    const mx = (l.ax + l.bx) / 2, mz = (l.az + l.bz) / 2;
    for (const side of [-1, 1]) {
      const x = mx + n[0] * side * 0.32, z = mz + n[1] * side * 0.32;
      cb.at('beam', x, z).cylinder([x, l.ay, z], [x, l.by + 1.1, z], 0.045, 6);
      this.addRail(l.ax + n[0] * side * 0.5, l.az + n[1] * side * 0.5, l.bx + n[0] * side * 0.5, l.bz + n[1] * side * 0.5, (l.ay + l.by) / 2);
    }
    for (let y = l.ay + 0.3; y < l.by + 0.9; y += 0.3) {
      cb.at('rail', mx, mz).cylinder([mx - n[0] * 0.32, y, mz - n[1] * 0.32], [mx + n[0] * 0.32, y, mz + n[1] * 0.32], 0.025, 5);
    }
    void byId;
  }

  // The door you came through: a metal door standing on its own. It doesn't open from this side.
  metalDoor(cb, p, rng) {
    const free = [0, 1, 2, 3].filter((d) => !p.gaps.some((g) => Math.hypot(g.x - (p.x + DIRV[d][0] * p.half), g.z - (p.z + DIRV[d][1] * p.half)) < 2.6));
    const d = free.length ? rng.pick(free) : 0;
    const n = DIRV[d], t = [-n[1], n[0]];
    const x = p.x + n[0] * (p.half - 1.0), z = p.z + n[1] * (p.half - 1.0), y = p.y;
    const rotY = Math.atan2(-t[1], t[0]);
    const m = cb.at('steel', x, z);
    for (const sd of [-1, 1]) m.box(x + t[0] * sd * 0.6, y + 1.1, z + t[1] * sd * 0.6, 0.12, 2.2, 0.16, rotY);
    m.box(x, y + 2.25, z, 1.32, 0.12, 0.16, rotY);
    cb.at('door', x, z).box(x, y + 1.05, z, 1.08, 2.1, 0.06, rotY);
    this.addRail(x - t[0] * 0.66, z - t[1] * 0.66, x + t[0] * 0.66, z + t[1] * 0.66, y);
    this.door = { x, z };
  }

  // ---- Physics -----------------------------------------------------------------------

  heightOf(sf, x, z) {
    const dx = x - sf.cx, dz = z - sf.cz;
    if (sf.kind === 'circle') return dx * dx + dz * dz <= sf.r * sf.r ? sf.y : null;
    const lx = dx * sf.c + dz * sf.s, lz = -dx * sf.s + dz * sf.c;
    if (Math.abs(lx) > sf.hx || Math.abs(lz) > sf.hz) return null;
    const t = Math.max(0, Math.min(1, (lx + sf.hx) / (2 * sf.hx)));
    return sf.y0 + (sf.y1 - sf.y0) * t - sf.sag * Math.sin(Math.PI * t);
  }

  // The highest surface under (x, z) you could be standing on from height y.
  ground(x, z, y) {
    let best = null;
    for (const sf of this.surfaces) {
      if (sf.monkey && this.letGo) continue;
      const h = this.heightOf(sf, x, z);
      if (h == null || h > y + STEP_UP) continue;
      if (!best || h > best.h) best = { h, sf };
    }
    return best;
  }

  collide(pos, r) {
    const y = pos.y ?? this.y;
    for (let it = 0; it < 2; it++) {
      for (const s of this.rails) {
        if (Math.abs(y - s.y) > 1.1) continue;
        const ex = s.bx - s.ax, ez = s.bz - s.az;
        const l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((pos.x - s.ax) * ex + (pos.z - s.az) * ez) / l2));
        const cx = s.ax + ex * t, cz = s.az + ez * t;
        const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
        if (d >= r || d < 1e-6) continue;
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      }
    }
  }

  // ---- Per-frame -----------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    const { ctx } = this;
    this.time += dt;
    this.updateSky(dt, player);
    this.updateClouds(dt);
    this.updateVines(dt, player);

    // Standing, climbing, hanging, falling.
    const g = this.ground(player.pos.x, player.pos.z, this.y);
    // Small drops (a bridge's sag, a step down) are walked, not fallen.
    if (g && g.h >= this.y - (this.vy > -1 ? 0.35 : 0.06)) {
      if (this.vy < -9) ctx.audio.thud(0, 0.3);
      this.y = g.h;
      this.vy = 0;
      this.on = g.sf;
      if (!g.sf.monkey) this.letGo = false;
    } else {
      this.on = null;
      this.vy = Math.max(-45, this.vy - GRAVITY * dt);
      this.y += this.vy * dt;
      if (g && this.y <= g.h) {
        this.y = g.h;
        this.vy = 0;
      }
    }
    player.pos.y = this.y;

    // Into the void.
    if (!g && this.y < this.lowest - 4) {
      this.fallTime += dt;
      if (!this.told.fall) {
        this.told.fall = true;
        ctx.hud.message('You fall. The wind roars, then goes quiet.', 3);
        ctx.audio.gust(0, 0.35, 3);
      }
      if (this.fallTime > 2.4) {
        this.done = true;
        // Sometimes you don't wake up anywhere you know. Somewhere prettier.
        if (this.rng.chance(0.25)) {
          ctx.hud.message('You fall, and fall, and land softly on a bed of red leaves under the stars.', 5);
          ctx.onEscape('level14', 'walk');
        } else {
          ctx.hud.message('You lose consciousness, and wake up somewhere else.', 4);
          ctx.onEscape(this.rng.pick(WAKE), 'walk');
        }
        return;
      }
    }

    // Ladders are slow; monkey bars cost grip.
    const on = this.on;
    player.speedMul = this.sitting ? 0 : on?.ladder ? 0.55 : on?.monkey ? 0.6 : 1;
    if (on?.monkey) {
      player.stamina = Math.max(0, player.stamina - 9 * dt);
      player.staminaLock = Math.max(player.staminaLock, 0.2);
      if (!this.told.monkey) {
        this.told.monkey = true;
        ctx.hud.message('Monkey bars. You hang on as long as your stamina lasts.', 3.5);
      }
      if (player.stamina <= 0) {
        this.letGo = true;
        ctx.hud.message('Your grip gives out.', 2);
      }
    }
    if (on?.ladder && !this.told.ladder) {
      this.told.ladder = true;
      ctx.hud.message('A ladder. Walk into it to climb.', 2.5);
    }

    this.updateMeditation(dt, player);
    // Peaceful: the mind mends itself here.
    player.sanity = Math.min(100, player.sanity + (this.sitting ? 6 : 0.5) * dt);
    if (this.sitting) player.health = Math.min(100, player.health + 2 * dt);
    this.updateAmbient(dt, player);
  }

  updateMeditation(dt, player) {
    const { ctx } = this;
    this.nearMedi = 0;
    let bench = null;
    for (const m of this.layout.meditation) {
      const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
      this.nearMedi = Math.max(this.nearMedi, Math.max(0, Math.min(1, (9 - d) / 5)));
      if (d < 1.1 && Math.abs(this.y - m.y) < 0.5) bench = m;
    }
    if (this.sitting) {
      if ((ctx.moveIntent?.() ?? 0) > 0.3 || !bench) {
        this.sitting = false;
        player.ceiling = Infinity;
        ctx.hud.message('You stand up, steadier than before.', 2);
        return;
      }
      player.ceiling = 1.35;
      this.nextThought -= dt;
      if (this.nextThought <= 0) {
        this.nextThought = 9;
        ctx.hud.message(this.rng.pick(THOUGHTS), 6);
      }
      return;
    }
    player.ceiling = Infinity;
    if (!bench) {
      this.still = 0;
      return;
    }
    if (!this.told.bench) {
      this.told.bench = true;
      ctx.hud.message('A Meditation Point. Stand still by the bench to sit.', 3.5);
    }
    this.still = player.speed < 0.15 ? this.still + dt : 0;
    if (this.still > 1.2) {
      this.sitting = true;
      this.nextThought = 2.5;
      player.vel.set(0, 0);
      ctx.hud.message('You sit. Everything is very quiet.', 3);
    }
  }

  updateAmbient(dt, player) {
    const a = this.ctx.audio;
    const quiet = this.sitting ? 0.2 : 1 - this.nearMedi * 0.65;
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.nextGust = this.rng.range(5, 13);
      a.gust(this.rng.range(-1, 1), 0.16 * quiet, this.rng.range(2.5, 4.5));
    }
    this.nextCreak -= dt;
    if (this.nextCreak <= 0) {
      this.nextCreak = this.rng.range(1.2, 3.5);
      const onRope = this.on?.rope && player.speed > 0.3;
      if (onRope) a.creak(this.rng.range(-0.4, 0.4), 0.16 * quiet);
      else if (this.rng.chance(0.35)) a.creak(this.rng.range(-1, 1), 0.05 * quiet);
    }
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    const quiet = this.sitting ? 0.2 : 1 - (this.nearMedi || 0) * 0.65;
    return { hum: 0, exitGain: 0, exitPan: 0, drone: 0, machine: 0, jazz: 0, wind: 0.14 * quiet, sanity: player.sanity, ears: player.coveringEars };
  }

  atmosphere(dt, player) {
    this.fogColor.copy(this.horizon || new THREE.Color(0x9cc0e8));
    return {
      fogColor: this.fogColor,
      fogDensity: 0.0013,
      warp: 0,
      aberr: 0.15,
      grain: 0.03,
      soften: 0.12,
    };
  }

  hudInfo(player) {
    const w = this.on?.monkey && player.stamina < 35 && !this.letGo ? 'YOUR GRIP IS SLIPPING' : null;
    return { warn: w, warnCovered: w, coverLabel: 'EARS', health: false };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.cloudTex) t.dispose();
    for (const t of this.vineTex) t.dispose();
    for (const t of this.textures.vineClones) t.dispose();
    delete this.textures.vineClones;
    disposeTextures(this.textures);
  }
}

// ---- Textures -------------------------------------------------------------------------

function finishTex(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  return t;
}

// Weathered deck planks, one metre square.
function planks(renderer, base, n) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const w = S / n;
  for (let k = 0; k < n; k++) {
    const v = 0.85 + Math.random() * 0.25;
    const col = new THREE.Color(base).multiplyScalar(v);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(0, k * w, S, w);
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,28,16' : '200,180,150'},${(Math.random() * 0.18).toFixed(3)})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      const y = k * w + Math.random() * w;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S * 0.3, y + (Math.random() - 0.5) * 6, S * 0.7, y + (Math.random() - 0.5) * 6, S, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,14,8,0.85)';
    ctx.fillRect(0, k * w, S, 2);
    ctx.fillStyle = 'rgba(30,30,30,0.7)';
    for (const x of [14, S - 18]) for (const dy of [0.3, 0.7]) ctx.fillRect(x, k * w + w * dy, 3, 3);
  }
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(30,20,10,${(Math.random() * 0.12).toFixed(3)})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 1);
  }
  return finishTex(c, renderer);
}

function woodGrain(renderer, base) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,12,6' : '170,140,110'},${(Math.random() * 0.2).toFixed(3)})`;
    ctx.fillRect(x, 0, 1 + Math.random(), S);
  }
  return finishTex(c, renderer);
}

function ropeTex(renderer) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a7e52';
  ctx.fillRect(0, 0, S, S);
  for (let k = -S; k < S * 2; k += 10) {
    ctx.strokeStyle = '#c8aa78';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, k);
    ctx.lineTo(S, k + S * 0.6);
    ctx.stroke();
  }
  return finishTex(c, renderer);
}

// Cumulus: piled soft puffs, sunlit tops, grey undersides.
function cloudTexture(seed) {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const puffs = [];
  for (let k = 0; k < 26; k++) {
    const x = W * (0.15 + rnd() * 0.7), y = H * (0.35 + rnd() * 0.35);
    const r = 18 + rnd() * 30 * (1 - Math.abs(x / W - 0.5));
    puffs.push([x, y - r * 0.3, r]);
  }
  // Shadowed base first, then the bright body offset upward.
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y + r * 0.25, 0, x, y + r * 0.25, r);
    g.addColorStop(0, 'rgba(150,160,178,0.75)');
    g.addColorStop(1, 'rgba(150,160,178,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y - r * 0.15, 0, x, y - r * 0.15, r * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(244,246,250,0.6)');
    g.addColorStop(1, 'rgba(240,244,250,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  return new THREE.CanvasTexture(c);
}

// A tangle of vines: thick trunks winding upward, tendrils, leaves; the
// gaps between them transparent.
function vineTexture(renderer, seed) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  let s = seed * 7919 + 17;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const vine = (x, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let px = x, py = -20;
    ctx.moveTo(px, py);
    while (py < S + 20) {
      const nx = px + (rnd() - 0.5) * 60, ny = py + 30 + rnd() * 40;
      ctx.quadraticCurveTo(px + (rnd() - 0.5) * 80, (py + ny) / 2, nx, ny);
      px = nx;
      py = ny;
    }
    ctx.stroke();
  };
  // Wrap horizontally: draw each vine three times.
  for (let k = 0; k < 9; k++) {
    const x = rnd() * S, w = 5 + rnd() * 12;
    const col = `rgb(${40 + rnd() * 30 | 0},${90 + rnd() * 60 | 0},${30 + rnd() * 25 | 0})`;
    const save = s;
    for (const off of [-S, 0, S]) {
      s = save;
      vine(x + off, w, col);
    }
  }
  for (let k = 0; k < 160; k++) {
    const x = rnd() * S, y = rnd() * S;
    ctx.fillStyle = `rgb(${50 + rnd() * 40 | 0},${110 + rnd() * 70 | 0},${35 + rnd() * 30 | 0})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + rnd() * 5, 1.5 + rnd() * 2.5, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTex(c, renderer);
}

export const LEVEL63 = {
  id: 'level63',
  number: 63,
  name: 'Level 63',
  title: 'Tranquility',
  difficulty: 0,
  next: 'level4',
  create: (ctx) => new Level63(ctx),
};
