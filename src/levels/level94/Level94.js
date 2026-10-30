import * as THREE from 'three';
import { GridMap, EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js';
import { disposeTextures } from '../../world/props.js';
import { EntityManager } from '../../entities/lib/index.js';
import { Colliders } from './kit.js';
import { makeTerrain, buildGround, buildSky, TOWN } from './terrain.js';
import { buildMaterials, buildTown, buildWaterTower, buildCastle, buildHillProp } from './town.js';
import { buildCastleInterior, CC, ROOMS, THRONE_DOOR } from './castle.js';
import { Animation, RoboMan, nightmareTextures } from './toons.js';

// Level 94 — "Motion".
//
// A 1930s town as if it were made for a stop-motion film: little painted
// houses, picket fences, round old cars, Almond Milk vans, a fountain of
// Almond Water, and siren poles that play a cheerful cartoon tune all day.
// It's safe in the daytime. At dusk the music winds down and stops, and at
// night the Animations come out, with Smilers, Skin-Stealers, Hounds,
// Deathmoths and Deathrats. Get indoors.
//
// Past the town the green hills go on forever: cars parked nowhere, odd
// bits of houses, a water tower. Above them all, a castle on a mountain of
// glass. Inside: a bright fun-house guarded by wind-up Robo-Men who don't
// like you touching things, and the Animated King, who'll set you a test.
// Pass it, and he sends you on your way.

const CYCLE = 420; // seconds for a whole day
const DUSK = 215, NIGHT = 245, DAWN = 395;
const MAIN = ['level0', 'level1', 'level2', 'level3', 'level4', 'level5'];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Level94 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    this.cameraFar = 1000;
    this.own = { geos: [], mats: [], textures: [] };
    this.terrain = makeTerrain(rng.fork('terrain'));
    const { T, M } = buildMaterials(this.own);
    this.T = T;
    this.M = M;
    this.colliders = new Colliders();
    this.outside = new THREE.Group();
    scene.add(this.outside);
    this.ground = buildGround(this.terrain, this.own);
    this.sky = buildSky(this.own, rng.fork('sky'));
    this.town = buildTown(M, this.own, rng.fork('town'), this.colliders);
    this.tower = buildWaterTower(M, this.own, this.terrain, this.colliders);
    this.castleOut = buildCastle(M, this.own, this.terrain, this.colliders);
    this.outside.add(this.ground.mesh, this.sky.group, this.town.group, this.tower.group, this.castleOut.group);
    this.hills = new THREE.Group();
    this.outside.add(this.hills);
    this.cells = new Map();
    this.hillTimer = 0;
    // Light: sky, sun, the street lamps nearest you, the houses' lamps.
    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x9a9a86, 1.6);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
    this.sunTarget = new THREE.Object3D();
    this.sun.target = this.sunTarget;
    scene.add(this.hemi, this.sun, this.sunTarget);
    this.lampLights = [0, 1, 2, 3].map(() => {
      const l = new THREE.PointLight(0xffc878, 0, 16, 1.6);
      scene.add(l);
      return l;
    });
    this.houseLights = this.town.houses.filter((h) => h.enterable).map((h) => {
      const l = new THREE.PointLight(0xffd090, 0, 9, 1.4);
      l.position.set(h.light.x, h.light.y, h.light.z);
      scene.add(l);
      return l;
    });
    this.lights3 = [this.hemi, this.sun, this.sunTarget, ...this.lampLights, ...this.houseLights];

    // The town on a grid, for the entities that walk its streets at night.
    this.townGrid = this.buildTownGrid();
    // Deathmoths circle the street lamps; give them some.
    const lampLights = this.town.lamps.map((l) => ({ x: l.x, z: l.z, state: 'on' }));
    this.townWorld = {
      map: this.townGrid,
      lights: lampLights,
      lightsNear: (x, z, r) => lampLights.map((l, i) => [i, Math.hypot(l.x - x, l.z - z)]).filter((p) => p[1] <= r),
      ceilingHeight: () => 7,
      collide: (pos, r) => this.colliders.collide(pos, r, 0),
      sampleLight: (x, z) => {
        const l = this.lightLevel(x, z);
        return [l, l, l];
      },
    };
    this.townEntities = new EntityManager({ scene, world: this.townWorld, audio: ctx.audio, rng: this.rng.fork('town-ents'), shared });
    this.outWorld = {
      collide: (pos, r) => this.colliders.collide(pos, r, this.py ?? 0),
      groundAt: (x, z) => this.terrain.groundAt(x, z),
      sampleLight: (x, z) => {
        const l = this.lightLevel(x, z);
        return [l, l, l];
      },
      map: this.townGrid,
    };

    // You arrive inside a house, as if it had let you in.
    const home = this.town.houses.find((h) => h.enterable);
    this.home = home;
    this.spawn = { x: home.inside.x, z: home.inside.z, yaw: Math.atan2(-(home.door.x - home.inside.x), -(home.door.z - home.inside.z)) };
    this.area = 'town';
    this.time = 0;
    this.clock = 30;
    this.done = false;
    this.told = {};
    this.nightOn = false;
    this.fog = new THREE.Color();
    this.white = document.createElement('div');
    Object.assign(this.white.style, { position: 'fixed', inset: '0', background: '#fff', opacity: '0', pointerEvents: 'none', zIndex: '8' });
    document.body.appendChild(this.white);
    this.frame = 0;
    this.nextCricket = 2;
    this.updateHills({ pos: { x: this.spawn.x, z: this.spawn.z } }, true);
    this.ground.recenter(this.spawn.x, this.spawn.z);
    this.script = [
      [1.5, 'A little house. A rug, a radio, a sofa. Everything looks handmade, like a model, but it\'s all real.'],
      [7, 'Outside, somewhere, a tinny cartoon tune is playing.'],
    ];
  }

  get world() {
    return this.area === 'castle' ? this.castle.world : this.outWorld;
  }

  // Outside, the town grid can't judge sight lines over the hills.
  get photoNoLos() {
    return this.area !== 'castle';
  }

  photoSubjects() {
    if (this.area !== 'castle' || !this.castle) return [];
    const p = new THREE.Vector3();
    this.castle.king.head.getWorldPosition(p);
    return [{ type: 'king', x: p.x, y: p.y, z: p.z, range: 40, noLos: true }];
  }

  get entities() {
    return this.area === 'castle' ? this.castleEntities : this.townEntities;
  }

  // ---- The town grid -------------------------------------------------------------------

  buildTownGrid() {
    const N = 100, cs = 2;
    const map = new GridMap(N, N, cs, 4);
    const blocked = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = (x + 0.5) * cs, cz = (y + 0.5) * cs;
      if (Math.hypot(cx - TOWN.x, cz - TOWN.z) > TOWN.r + 2) blocked[y * N + x] = 1;
    }
    for (const b of this.colliders.all) {
      if (b.hw * b.hd < 0.1 || b.y0 > 1) continue;
      const r = Math.hypot(b.hw, b.hd);
      for (let y = Math.floor((b.z - r) / cs); y <= Math.floor((b.z + r) / cs); y++) {
        for (let x = Math.floor((b.x - r) / cs); x <= Math.floor((b.x + r) / cs); x++) {
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const dx = (x + 0.5) * cs - b.x, dz = (y + 0.5) * cs - b.z;
          const c = Math.cos(b.rot), s = Math.sin(b.rot);
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          if (Math.abs(lx) < b.hw + 0.4 && Math.abs(lz) < b.hd + 0.4) blocked[y * N + x] = 1;
        }
      }
    }
    const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 1 : blocked[y * N + x]);
    for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, at(x, y - 1) || at(x, y) ? EDGE_WALL : EDGE_OPEN);
    for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, at(x - 1, y) || at(x, y) ? EDGE_WALL : EDGE_OPEN);
    this.townBlocked = blocked;
    return map;
  }

  inTown(x, z) {
    const m = this.townGrid;
    if (x < 0 || z < 0 || x >= m.width || z >= m.depth) return false;
    const [cx, cy] = m.cellAt(x, z);
    return !this.townBlocked[m.idx(cx, cy)];
  }

  // ---- Light and time ------------------------------------------------------------------------

  // 1 = full day, 0 = night.
  get daylight() {
    const t = this.clock % CYCLE;
    if (t < DUSK) return 1;
    if (t < NIGHT) return 1 - smooth(DUSK, NIGHT, t);
    if (t < DAWN) return 0;
    return smooth(DAWN, CYCLE, t);
  }

  get phase() {
    const t = this.clock % CYCLE;
    return t < DUSK ? 'day' : t < NIGHT ? 'dusk' : t < DAWN ? 'night' : 'dawn';
  }

  lightLevel(x, z) {
    let l = 0.12 + this.daylight * 0.8;
    if (this.daylight < 0.6) {
      for (const lp of this.town.lamps) {
        const d = Math.hypot(lp.x - x, lp.z - z);
        if (d < 7) l += (1 - d / 7) * 0.5 * (1 - this.daylight);
      }
    }
    return Math.min(1, l);
  }

  updateSky(dt, player) {
    const S = this.sky;
    const day = this.daylight;
    const t = this.clock % CYCLE;
    // The sun crosses the sky through the day; the moon at night.
    const k = t < NIGHT ? t / NIGHT : (t - NIGHT) / (CYCLE - NIGHT);
    const a = Math.PI * (0.12 + 0.76 * k);
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.9 + 0.1, 0.35).normalize();
    S.mat.uniforms.sunDir.value.copy(dir);
    const dusk = this.phase === 'dusk' || this.phase === 'dawn' ? 1 - Math.abs(day - 0.5) * 2 : 0;
    S.mat.uniforms.top.value.setRGB(0.35, 0.6, 0.88).multiplyScalar(0.15 + day * 0.85).lerp(new THREE.Color(0.06, 0.08, 0.2), (1 - day) * 0.8);
    S.mat.uniforms.horizon.value.setRGB(0.78, 0.86, 0.94).lerp(new THREE.Color(1.0, 0.62, 0.4), dusk * 0.8).lerp(new THREE.Color(0.1, 0.13, 0.25), (1 - day) * (1 - dusk));
    S.mat.uniforms.sunColor.value.set(day > 0.3 ? 0xfff8e0 : 0xe8eef8);
    S.mat.uniforms.night.value = 1 - day;
    S.starMat.opacity = smooth(0.5, 0, day);
    S.group.position.set(player.pos.x, 0, player.pos.z);
    // Clouds drift, a frame at a time.
    if (this.frameTick) {
      for (const c of S.clouds) {
        const u = c.userData;
        u.a += (u.speed * STEP_ANGLE) / u.r;
        c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
      }
    }
    S.cloudMat.color.setScalar(0.3 + day * 0.7).lerp(new THREE.Color(1, 0.7, 0.55), dusk * 0.5);
    // Lights.
    this.hemi.intensity = 0.35 + day * 1.85;
    this.hemi.color.setRGB(0.87, 0.93, 1).lerp(new THREE.Color(0.35, 0.42, 0.7), 1 - day);
    this.sun.intensity = 0.2 + day * 1.6;
    this.sun.color.setRGB(1, 0.96, 0.88).lerp(new THREE.Color(1, 0.6, 0.4), dusk).lerp(new THREE.Color(0.5, 0.6, 0.9), (1 - day) * (1 - dusk));
    this.sun.position.set(player.pos.x + dir.x * 200, dir.y * 200, player.pos.z + dir.z * 200);
    this.sunTarget.position.set(player.pos.x, 0, player.pos.z);
    // Lamps, windows and porch lights come on as it gets dark.
    const night = 1 - day;
    this.M.glow.color.setRGB(0.85 + night * 0.15, 0.83 + night * 0.05, 0.77 - night * 0.25);
    this.M.window.emissive.setRGB(night * 0.9, night * 0.7, night * 0.35);
    for (const l of this.houseLights) l.intensity = 0.6 + night * 3;
    if (this.frameTick || !this.lampOrder) {
      this.lampOrder = this.town.lamps.map((lp) => [lp, Math.hypot(lp.x - player.pos.x, lp.z - player.pos.z)]).sort((p, q) => p[1] - q[1]);
    }
    this.lampLights.forEach((l, i) => {
      const lp = this.lampOrder[i];
      if (!lp) return;
      l.position.set(lp[0].x, lp[0].y - 0.3, lp[0].z);
      l.intensity = night > 0.3 ? 5 * night : 0;
    });
  }

  // ---- The hills ---------------------------------------------------------------------------------

  updateHills(player, force = false) {
    const cs = 70;
    const ci = Math.floor(player.pos.x / cs), cj = Math.floor(player.pos.z / cs);
    if (!force && ci === this.lastCi && cj === this.lastCj) return;
    this.lastCi = ci;
    this.lastCj = cj;
    const keep = new Set();
    for (let i = ci - 3; i <= ci + 3; i++) {
      for (let j = cj - 3; j <= cj + 3; j++) {
        const key = `${i},${j}`;
        keep.add(key);
        if (this.cells.has(key)) continue;
        const cell = { group: null, solids: [] };
        this.cells.set(key, cell);
        const x = (i + 0.5) * cs, z = (j + 0.5) * cs;
        if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r + 40) continue;
        const m = this.terrain.mountain, t = this.terrain.tower;
        if (Math.hypot(x - m.x, z - m.z) < m.R + 15 || Math.hypot(x - t.x, z - t.z) < 25) continue;
        const r = hash01(i, j);
        const type = r < 0.12 ? 'car' : r < 0.15 ? 'van' : r < 0.27 ? 'furniture' : r < 0.36 ? 'room' : r < 0.43 ? 'house' : r < 0.49 ? 'fence' : null;
        if (!type) continue;
        const px = x + (hash01(i, j, 7) - 0.5) * 40, pz = z + (hash01(i, j, 9) - 0.5) * 40;
        const rot = hash01(i, j, 11) * Math.PI * 2;
        const y = this.terrain.heightAt(px, pz);
        const rng = { int: (a, b) => a + Math.floor(hash01(i, j, 13) * (b - a + 1)), range: (a, b) => a + hash01(i, j, 17) * (b - a), chance: (p) => hash01(i, j, 19) < p };
        const built = buildHillProp(type, rng, px, y, pz, rot, this.M, this.cellOwn(), this.colliders);
        cell.group = built.group;
        cell.solids = built.solids;
        cell.type = type;
        cell.at = { x: px, z: pz, rot, y };
        this.hills.add(built.group);
      }
    }
    for (const [key, cell] of this.cells) {
      if (keep.has(key)) continue;
      if (cell.group) {
        this.hills.remove(cell.group);
        cell.group.traverse((o) => o.geometry && o.geometry.dispose());
      }
      for (const b of cell.solids) this.colliders.remove(b);
      this.cells.delete(key);
    }
  }

  // Hill props are built and thrown away as you walk; keep their geometry out of `own`.
  cellOwn() {
    return { geos: [], mats: this.own.mats, textures: this.own.textures };
  }

  // ---- Per frame ---------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    const prevFrame = this.frame;
    this.frame = Math.floor(this.time * 12);
    this.frameTick = this.frame !== prevFrame;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    if (this.trans) this.updateTransition(dt, player);
    if (this.done) return;
    if (this.area === 'castle') this.updateCastle(dt, player);
    else this.updateOutside(dt, player);
    if (this.done) return;
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      ctx.onDeath(this.nightmare ? 'You became one of the Animations.' : player.sanity <= 0 ? 'The night got into your head. You\'re one of the Animations now.' : this.entities.lastCause || 'Something in the town found you after dark.');
    }
  }

  updateOutside(dt, player) {
    const { ctx } = this;
    this.clock += dt;
    this.py = player.pos.y;
    this.ground.recenter(player.pos.x, player.pos.z);
    this.updateSky(dt, player);
    this.hillTimer -= dt;
    if (this.hillTimer <= 0) {
      this.hillTimer = 0.5;
      this.updateHills(player);
    }
    this.castleOut.glassMat.uniforms.time.value = this.time;
    // The fountain flows, twelve frames a second.
    if (this.frameTick) this.T.water.offset.y = (this.T.water.offset.y - 0.08) % 1;
    // The siren horns bounce to the music.
    const playing = this.phase === 'day';
    for (const s of this.town.sirens) {
      s.horns.forEach((h, i) => {
        const b = playing ? Math.abs(Math.sin(this.frame * 0.52 + i)) * 0.18 : 0;
        h.scale.set(1 + b, 1 + b, 1 - b * 0.5);
      });
    }
    // Indoors? (The Animations won't come into a lit house.)
    player.hidden = this.town.houses.some((h) => h.enterable && this.insideHouse(h, player));
    this.updateNight(dt, player);
    // Almond Milk from the back of a van.
    for (const v of this.town.vans) {
      if (v.taken || Math.hypot(v.x - player.pos.x, v.z - player.pos.z) > 1.6) continue;
      if (player.give('milk')) {
        v.taken = true;
        ctx.audio.clank?.(0, 0.2);
        ctx.hud.message('You take a bottle of Almond Milk from a crate in the back of the van.', 3);
      } else if (!this.told.milkFull) {
        this.told.milkFull = true;
        ctx.hud.message('Crates of Almond Milk, but your bag is full.', 2.5);
      }
    }
    // Hints.
    const fd = Math.hypot(this.town.fountain.x - player.pos.x, this.town.fountain.z - player.pos.z);
    if (fd < 8 && !this.told.fountain) {
      this.told.fountain = true;
      ctx.hud.message('The fountain runs with Almond Water. Press E (or the bottle) to drink, and fill a bottle.', 4);
    }
    const tw = this.tower.tap;
    if (Math.hypot(tw.x - player.pos.x, tw.z - player.pos.z) < 3 && !this.told.tower) {
      this.told.tower = true;
      ctx.hud.message('A tap at the foot of the water tower. Almond Water. Press E to drink and fill a bottle.', 4);
    }
    const m = this.terrain.mountain;
    const dm = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
    if (dm < m.R + 4 && !this.told.glass) {
      this.told.glass = true;
      ctx.hud.message('Your foot finds something hard and clear, sloping up into the sky. A mountain you can\'t see.', 4);
    }
    if (dm > m.R && !this.told.castleSeen && Math.hypot(player.pos.x - TOWN.x, player.pos.z - TOWN.z) > TOWN.r + 30) {
      this.told.castleSeen = true;
      ctx.hud.message('Over the hills, a castle hangs in the sky.', 3);
    }
    // The castle door.
    const D = this.castleOut.door;
    if (Math.hypot(D.x - player.pos.x, D.z - player.pos.z) < 1.8 && Math.abs(player.pos.y - D.y) < 3) this.startTransition(() => this.enterCastle(player));
    // Day is safe and steadying; night isn't.
    const night = 1 - this.daylight;
    const outOfTown = Math.hypot(player.pos.x - TOWN.x, player.pos.z - TOWN.z) > TOWN.r + 20;
    player.sanity = Math.max(0, Math.min(100, player.sanity + (night > 0.5 ? -(0.2 + (outOfTown ? 0.2 : 0)) * (player.hidden ? 0.2 : 1) : 0.08) * dt));
  }

  insideHouse(h, player) {
    const dx = player.pos.x - h.x, dz = player.pos.z - h.z;
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < h.w / 2 - 0.15 && Math.abs(lz) < h.d / 2 - 0.1;
  }

  updateNight(dt, player) {
    const { ctx } = this;
    const ph = this.phase;
    if (ph === 'dusk' && !this.told[`dusk${this.day()}`]) {
      this.told[`dusk${this.day()}`] = true;
      ctx.hud.message('The music is slowing down. The sky is turning orange. Night is coming: get indoors.', 5);
    }
    if (ph === 'night' && !this.nightOn) {
      this.nightOn = true;
      ctx.hud.message('The music has stopped. Something somewhere goes BOING.', 4);
      ctx.audio.boing?.(0, 0.3);
      this.spawnNight(player);
    }
    if ((ph === 'dawn' || ph === 'day') && this.nightOn) {
      this.nightOn = false;
      if (player.health > 0) ctx.award?.('night94');
      for (const e of [...this.townEntities.list]) this.townEntities.remove(e);
      ctx.hud.message('The sun\'s coming up. The Animations fold up flat and slide away under the doors.', 4);
    }
    if (this.nightOn) {
      // More Animations wander in as the night goes on.
      this.nextToon = (this.nextToon ?? 20) - dt;
      if (this.nextToon <= 0 && this.townEntities.list.filter((e) => e.type === 'animation').length < 9) {
        this.nextToon = this.rng.range(15, 30);
        this.spawnAnimation(player);
      }
      this.nextCricket -= dt;
      if (this.nextCricket <= 0) {
        this.nextCricket = this.rng.range(0.6, 2.5);
        ctx.audio.cricket?.(this.rng.range(-1, 1), 0.04);
      }
    }
    const res = this.townEntities.update(dt, player, ctx);
    for (const ev of res.events) if (ev.type === 'detect' && ev.entity.type === 'animation' && !this.told.spotted) {
      this.told.spotted = true;
      ctx.hud.message('It\'s seen you. RUN, and get inside a lit house.', 3);
    }
    for (const e of this.townEntities.list) {
      if (e.type !== 'animation') e.root.visible = e.distTo(player) < 60;
    }
  }

  day() {
    return Math.floor(this.clock / CYCLE);
  }

  spawnNight(player) {
    const m = this.townEntities;
    const far = (type, opts = {}) => m.spawnFar(type, player, { min: 18, max: 60, opts });
    far('smiler');
    far('smiler');
    far('hound');
    far('hound');
    far('skinstealer');
    far('deathmoth', { variant: 'soldier' });
    far('deathmoth', { variant: 'soldier' });
    for (let k = 0; k < 4; k++) far('deathrat', { variant: 'grey' });
    for (let k = 0; k < 4; k++) this.spawnAnimation(player);
  }

  spawnAnimation(player) {
    for (let tries = 0; tries < 30; tries++) {
      const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(25, 55);
      const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
      if (this.inTown(player.pos.x, player.pos.z) && !this.inTown(x, z) && Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r) continue;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      if (((x - player.pos.x) * fx + (z - player.pos.z) * fz) / r > 0.3) continue;
      const e = new Animation({ scene: this.scene, world: this.townWorld, audio: this.ctx.audio, rng: this.rng.fork('toon' + tries + this.time), shared: this.shared }, { x, z, heightAt: (px, pz) => this.terrain.heightAt(px, pz), inTown: (px, pz) => this.inTown(px, pz) });
      e.type = 'animation';
      this.townEntities.list.push(e);
      this.ctx.audio.boing?.(this.panTo(player, x, z), 0.15);
      return e;
    }
    return null;
  }

  // Weapons stun the Animations (through the manager) and the nightmares.
  stun(x, z, { range, seconds }) {
    let n = 0;
    for (const nm of this.nightmares || []) {
      if (Math.hypot(nm.x - x, nm.z - z) < range + 0.5) {
        nm.stun = seconds;
        n++;
      }
    }
    return n;
  }

  // ---- The castle ---------------------------------------------------------------------------------

  enterCastle(player) {
    if (!this.castle) {
      this.castle = buildCastleInterior(this.shared, this.own, this.rng.fork('castle'));
      this.scene.add(this.castle.world.group);
      this.castleEntities = new EntityManager({ scene: this.scene, world: this.castle.world, audio: this.ctx.audio, rng: this.rng.fork('robots'), shared: this.shared });
      for (const r of this.castle.robots) {
        const e = new RoboMan({ scene: this.scene, world: this.castle.world, audio: this.ctx.audio, rng: this.rng.fork('robo' + r.x), shared: this.shared }, { x: r.x, z: r.z });
        e.type = 'roboman';
        this.castleEntities.list.push(e);
      }
      this.used = new Set();
      this.hasInvite = false;
    }
    this.area = 'castle';
    this.outside.visible = false;
    for (const e of this.townEntities.list) e.root.visible = false;
    this.castle.world.group.visible = true;
    for (const e of this.castleEntities.list) e.root.visible = true;
    const s = this.castle.start;
    player.pos.set(s.x, 0, s.z);
    player.yaw = s.yaw;
    player.pitch = 0;
    player.hidden = false;
    this.hemi.intensity = 1.5;
    this.hemi.color.set(0xffffff);
    this.sun.intensity = 0.4;
    for (const l of this.lampLights) l.intensity = 0;
    for (const l of this.houseLights) l.intensity = 0;
    this.ctx.hud.message('Inside, it\'s much bigger than it looked, and very bright. The cartoonish look of everything is gone.', 5);
  }

  updateCastle(dt, player) {
    const { ctx } = this;
    const C = this.castle;
    const room = C.roomAt(player.pos.x, player.pos.z);
    this.room = room;
    this.castle.world.flush();
    player.speedMul = 1;
    // Interacting with anything makes any Robo-Man watching come for you.
    for (const it of C.interact) {
      if (it.once && this.used.has(it)) continue;
      const inside = it.region
        ? player.pos.x > it.region.x0 && player.pos.x < it.region.x1 && player.pos.z > it.region.z0 && player.pos.z < it.region.z1
        : Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < it.r;
      if (!inside) {
        if (it.region) it.inside = false;
        if (!it.region && !it.once) it.near = false;
        continue;
      }
      if (it.region) player.speedMul = 0.5;
      if (it.region ? it.inside : it.near) continue;
      if (it.region) it.inside = true;
      else it.near = true;
      this.used.add(it);
      ctx.hud.message(it.msg, it.id === 'invite' ? 7 : 3.5);
      if (it.id === 'chest' && it.item) {
        if (player.give(it.item)) ctx.audio.pickup();
        else ctx.hud.message('There\'s something in it, but your bag is full.', 2.5);
      }
      if (it.id === 'jack') ctx.audio.boing?.(0, 0.4);
      if (it.id === 'invite') this.hasInvite = true;
      for (const e of this.castleEntities.list) {
        if (e.type !== 'roboman') continue;
        if (e.distTo(player) < 24 && e.lineOfSight(player.pos.x, player.pos.z)) e.alert();
      }
    }
    // The balls shift around you as you wade through.
    if (room === 'pit' && this.frameTick) {
      const m4 = new THREE.Matrix4();
      C.ballPos.forEach((p, i) => {
        const d = Math.hypot(p[0] - player.pos.x, p[2] - player.pos.z);
        if (d > 1.6) return;
        const dx = (p[0] - player.pos.x) / Math.max(d, 0.1), dz = (p[2] - player.pos.z) / Math.max(d, 0.1);
        p[0] += dx * 0.12;
        p[2] += dz * 0.12;
        p[1] = 0.17 + Math.random() * 0.45;
        C.balls.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2]));
      });
      C.balls.instanceMatrix.needsUpdate = true;
    }
    // The grand hall goes on forever, unless you've been invited.
    if (room === 'hall') {
      if (!this.hasInvite && player.pos.x < 8) {
        player.pos.x += 30;
        if (!this.told.hallLoop) {
          this.told.hallLoop = true;
          ctx.hud.message('The hall goes on and on. Banners, lamps, banners. Perhaps you\'re expected somewhere first.', 4);
        }
      }
      if (this.hasInvite && !this.throneOpen) {
        this.throneOpen = true;
        const w = this.castle.world;
        for (const x of THRONE_DOOR.x) w.removeWall({ h: true, x, y: THRONE_DOOR.h });
        w.flush();
        ctx.hud.message('At the far end of the hall, a great doorway stands open.', 4);
      }
    }
    if (room === 'throne') this.updateThrone(dt, player);
    const res = this.castleEntities.update(dt, player, ctx);
    void res;
  }

  updateThrone(dt, player) {
    const { ctx } = this;
    const K = this.castle.king;
    // The King moves on twelve frames a second too.
    if (this.frameTick) {
      const t = this.frame / 12;
      K.head.rotation.z = Math.sin(t * 2.1) * 0.15;
      K.head.position.y = 3.1 + Math.abs(Math.sin(t * 4.2)) * 0.12;
      K.arms[0].rotation.z = -0.6 - Math.abs(Math.sin(t * 3)) * (this.kingTalk ? 0.9 : 0.2);
    }
    if (!this.kingStart) {
      this.kingStart = this.time;
      ctx.hud.message('THE ANIMATED KING: "Well, well, well! A visitor! And not one line of ink on you!"', 5);
    }
    const t = this.time - this.kingStart;
    this.kingTalk = t < 14;
    if (t > 5 && !this.told.king2) {
      this.told.king2 = true;
      ctx.hud.message('THE KING: "Everyone here is animated, you know. Ever so much nicer. No pain, no fear. Just the next frame, and the next."', 6);
    }
    if (t > 11 && !this.told.king3) {
      this.told.king3 = true;
      ctx.hud.message('THE KING: "But first, a little test! Show me what you\'re afraid of... in ANIMATION!"', 4);
    }
    if (t > 15 && !this.nightmare) this.startNightmare(player);
    if (this.nightmare) this.updateNightmare(dt, player);
  }

  startNightmare() {
    this.nightmare = { t: 0, next: 1, list: [] };
    this.nightmares = this.nightmare.list;
    this.nmTex = this.nmTex || nightmareTextures(this.own);
    this.shared.globalLight.value = 0.35;
    this.ctx.audio.slideWhistle?.(0, 0.4, false);
    this.ctx.hud.message('The lights go down. Everything turns black and white, and the drawings start to move.', 4);
  }

  updateNightmare(dt, player) {
    const { ctx } = this;
    const N = this.nightmare;
    if (N.won) return;
    N.t += dt;
    const W = this.castle.world;
    const th = ROOMS.throne;
    // Spawn your nightmares at the edges of the room.
    N.next -= dt;
    if (N.next <= 0 && N.t < 56 && N.list.length < 7) {
      N.next = this.rng.range(2.5, 4.5) * (1 - N.t / 120);
      const kind = this.rng.pick(['hound', 'smiler', 'party', 'moth']);
      const mat = new THREE.SpriteMaterial({ map: this.nmTex[kind][0], transparent: true });
      this.own.mats.push(mat);
      const sp = new THREE.Sprite(mat);
      const s = kind === 'smiler' ? 2.4 : kind === 'hound' ? 2.2 : 2.0;
      sp.scale.set(s, s, 1);
      const side = this.rng.int(0, 3);
      const x = side < 2 ? (th.x0 + 1 + this.rng.next() * (th.x1 - th.x0 - 1)) * CC : (side === 2 ? th.x0 + 1 : th.x1) * CC;
      const z = side >= 2 ? (th.y0 + 1 + this.rng.next() * (th.y1 - th.y0 - 1)) * CC : (side === 0 ? th.y0 + 1 : th.y1) * CC;
      sp.position.set(x, s / 2, z);
      W.group.add(sp);
      N.list.push({ sp, kind, x, z, s, speed: this.rng.range(2.8, 4.2), stun: 0, cd: 0 });
      ctx.audio.boing?.(this.panTo(player, x, z), 0.25);
    }
    for (const n of N.list) {
      n.cd = Math.max(0, n.cd - dt);
      if (n.stun > 0) {
        n.stun -= dt;
      } else if (this.frameTick) {
        const dx = player.pos.x - n.x, dz = player.pos.z - n.z, d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d, n.speed / 12);
        const p = { x: n.x + (dx / d) * step, z: n.z + (dz / d) * step };
        W.collide(p, 0.4);
        n.x = p.x;
        n.z = p.z;
        if (d < 1.1 && !n.cd) {
          n.cd = 1.2;
          player.damage(7);
          player.sanity = Math.max(0, player.sanity - 5);
          ctx.hurtFlash(0.6);
          ctx.vibrate([60, 30, 90]);
          ctx.audio.slideWhistle?.(0, 0.3, true);
        }
      }
      if (this.frameTick) {
        n.sp.material.map = this.nmTex[n.kind][Math.floor(this.frame / 2) % 2];
        n.sp.position.set(n.x, n.s / 2 + (n.kind === 'moth' ? 1 + Math.sin(this.frame) * 0.3 : Math.abs(Math.sin(this.frame * 0.8)) * 0.15), n.z);
      }
      n.sp.material.opacity = n.stun > 0 ? 0.5 : 1;
    }
    if (N.t > 60) {
      N.won = true;
      ctx.award?.('king');
      for (const n of N.list) W.group.remove(n.sp);
      N.list.length = 0;
      this.shared.globalLight.value = 1;
      ctx.hud.message('THE KING laughs and claps his big white gloves. "Very good! Very good indeed! Off you pop!" There\'s a burst of light.', 5);
      this.white.style.transition = 'opacity 0.4s';
      this.white.style.opacity = '1';
      const dest = this.rng.chance(0.4) ? 'level94' : this.rng.pick(MAIN);
      setTimeout(() => {
        if (this.disposed) return;
        this.done = true;
        ctx.onEscape(dest, 'noclip');
      }, 1800);
    }
  }

  // ---- Transitions -----------------------------------------------------------------------------

  startTransition(fn) {
    if (this.trans) return;
    this.trans = { t: 0, fn, fired: false };
    this.white.style.transition = 'opacity 1.2s';
    this.white.style.opacity = '1';
  }

  updateTransition(dt, player) {
    const tr = this.trans;
    tr.t += dt;
    player.vel.set(0, 0);
    if (!tr.fired && tr.t > 1.3) {
      tr.fired = true;
      tr.fn();
      this.white.style.transition = 'opacity 1.8s';
      this.white.style.opacity = '0';
    }
    if (tr.t > 3) this.trans = null;
  }

  // ---- Values the game reads every frame ---------------------------------------------

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  drink(player) {
    const { ctx } = this;
    const near = (p, r) => Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < r;
    if (this.area !== 'castle' && (near(this.town.fountain, 7.5) || near(this.tower.tap, 3))) {
      player.sanity = Math.min(100, player.sanity + 30);
      ctx.audio.drink();
      const filled = player.count('water') < 2 && player.give('water');
      ctx.hud.message(filled ? 'You drink the Almond Water, and fill a bottle for later.' : 'You drink the Almond Water. Cool and sweet.', 2.5);
      return;
    }
    if (!player.takeItem('water')) {
      ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    ctx.audio.drink();
  }

  audioMix(player) {
    const out = this.area !== 'castle';
    let band = 0, pan = 0, mode = 'play';
    if (out) {
      let best = Infinity;
      for (const s of this.town.sirens) {
        const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
        if (d < best) {
          best = d;
          pan = this.panTo(player, s.x, s.z) * 0.6;
        }
      }
      const ph = this.phase;
      band = ph === 'day' || ph === 'dusk' ? 0.55 / (1 + (best / 35) ** 2) + 0.05 : 0;
      mode = ph === 'dusk' ? 'wind' : 'play';
      if (player.hidden) band *= 0.5;
    } else if (this.nightmare && !this.nightmare.won) {
      band = 0.5;
      mode = 'nightmare';
    }
    let drone = 0;
    for (const e of this.entities.list) {
      if (!['chase', 'take', 'hunt', 'attack'].includes(e.state)) continue;
      drone = Math.max(drone, 0.2 * Math.max(0, 1 - e.distTo(player) / 30));
    }
    return {
      hum: out ? 0 : 0.03, exitGain: 0, exitPan: 0, drone, machine: 0, jazz: 0,
      wind: out ? 0.04 + (1 - this.daylight) * 0.03 : 0,
      band, bandOpts: { mode, pan },
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    if (this.area === 'castle') {
      const nm = this.nightmare && !this.nightmare.won;
      this.fog.set(nm ? 0x0a0a0a : 0xf4f0e8);
      return {
        fogColor: this.fog, fogDensity: nm ? 0.03 : 0.006,
        warp: insane * insane + (nm ? 0.3 : 0), aberr: nm ? 1 : 0.15, grain: nm ? 0.12 : 0.03,
        soften: this.room === 'bright' ? 0.6 : 0.1, craft: nm ? 1 : 0, mono: nm ? 1 : 0,
      };
    }
    this.fog.copy(this.sky.mat.uniforms.horizon.value);
    return {
      fogColor: this.fog,
      fogDensity: 0.0024 + (1 - this.daylight) * 0.004,
      warp: insane * insane * 1.1, aberr: 0.15 + insane * 0.6, grain: 0.07, soften: 0.06, craft: 1,
    };
  }

  hudInfo() {
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    this.white.remove();
    this.townEntities.dispose();
    if (this.castleEntities) this.castleEntities.dispose();
    this.scene.remove(this.outside);
    for (const l of this.lights3) this.scene.remove(l);
    for (const cell of this.cells.values()) if (cell.group) cell.group.traverse((o) => o.geometry && o.geometry.dispose());
    if (this.castle) {
      this.scene.remove(this.castle.world.group);
      this.castle.world.dispose();
    }
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

const STEP_ANGLE = 1.2;

function hash01(i, j, k = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const LEVEL94 = {
  id: 'level94',
  number: 94,
  name: 'Level 94',
  title: 'Motion',
  difficulty: 3,
  next: 'level0',
  create: (ctx) => new Level94(ctx),
};
