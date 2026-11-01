import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js?v=20261101b';
import { GridMap, EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js?v=20261101b';
import { EntityManager } from '../../entities/lib/index.js?v=20261101b';
import { Entity } from '../../entities/lib/Entity.js?v=20261101b';
import { buildHumanoid, resetPose, walk } from '../../entities/lib/rig.js?v=20261101b';
import { Colliders } from '../level94/kit.js?v=20261101b';
import { B, ROAD, IN0, IN1, LOT, isRoad, isSidewalk, blockPlan, blockSolids, buildMaterials, buildBlock, treeGeometries } from './suburbs.js?v=20261101b';

// Level 9 — "The Suburbs".
//
// An endless neighbourhood at midnight. Wet asphalt, fallen leaves,
// puddles, dark houses (some you can go into, some clipped through each
// other), most of the street lamps dead. Something is always watching.
//
//   - Sidewalks are safer than the street
//   - Houses hold supplies
//   - When the fog rolls in, the Mangled come out of it. They won't step
//     onto the sidewalk
//   - The Neighborhood Watch stands in the yards and watches you
//   - Ways out: follow the arrow signs (Level 11), follow a walkway into a
//     grass field (Level 9.1), wander off it into the grass (Level 10), or
//     crawl into a playground tube that glows white inside (Level 283)

const GX = 13, GZ = 10; // blocks covered by the entity grid
const GC = 4; // its cell size
const SPAWN_BLOCK = [4, 4];
const EXIT_BLOCKS = 5;

// ---- The Mangled ----------------------------------------------------------------------

class Mangled extends Entity {
  build() {
    const skin = this.mat(0xb8aca0);
    const dark = this.mat(0x3a2a24);
    this.rig = buildHumanoid({ mat: skin, legMat: dark, legLen: 1.05, torsoLen: 0.6, armLen: 1.05, headR: 0.12, headLen: 0.3, limbR: 0.045, torsoR: 0.15, torsoDepth: 0.6, neckLen: 0.2, shoulder: 0.2 });
    this.root.add(this.rig.root);
    // A mouth that goes too far down.
    const mouth = this.mesh(this.geo(new THREE.SphereGeometry(0.05, 6, 5)), this.mat(0x080404, { emissive: true }), 0, 0.1, 0.1);
    mouth.scale.set(0.8, 2.6, 0.5);
    this.rig.head.add(mouth);
    this.radius = 0.35;
    this.canWalk = this.opts.canWalk;
    this.twist = this.rng.range(-1, 1);
    this.state = 'hunt';
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    if (this.state === 'fade') return;
    // It won't set foot on the sidewalk: it waits at the curb instead.
    const px = this.pos.x, pz = this.pos.z;
    const playerSafe = isSidewalk(player.pos.x, player.pos.z);
    let moved = false;
    if (!(playerSafe && d < 5)) moved = this.pathTo(player.pos.x, player.pos.z, d < 12 ? 4.3 : 3.2, dt, this.canWalk);
    if (isSidewalk(this.pos.x, this.pos.z)) {
      this.pos.x = px;
      this.pos.z = pz;
      moved = false;
    }
    this.waiting = !moved && d < 14;
    if (this.waiting) this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 3);
    if (d < 1.2 && !this.cooldown && !playerSafe) {
      this.cooldown = 1.3;
      this.sound('snarl', player, 0.4, 20);
      out.push({ type: 'attack', damage: 26, sanity: 10, cause: 'The Mangled came out of the fog.' });
    }
  }

  animate(dt) {
    const rig = this.rig;
    resetPose(rig);
    const t = this.time;
    walk(rig, this.gait * Math.PI * 2, Math.min(1, this.moveSpeed / 3), { stride: 1.3, armSwing: 0.2 });
    // Everything bent the wrong way.
    rig.head.rotation.z = 1.2 * this.twist + Math.sin(t * 7) * 0.15;
    rig.neck.rotation.x = 0.6;
    rig.spine.rotation.x = 0.5;
    rig.armL.shoulder.rotation.z = -2.6 + Math.sin(t * 9) * 0.2;
    rig.armR.shoulder.rotation.x = -2.2;
    rig.armR.elbow.rotation.x = 1.8;
    rig.armL.elbow.rotation.z = -1.4;
    if (this.waiting) rig.spine.rotation.z = Math.sin(t * 2) * 0.2;
    this.root.position.y += Math.abs(Math.sin(t * 13)) * 0.04;
  }
}

export class Level9 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.cameraFar = 260;
    this.own = { geos: [], mats: [], textures: [] };
    const { T, M } = buildMaterials(this.own);
    this.T = T;
    this.M = M;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(12);
    this.blocks = new Map();
    this.treeGeos = treeGeometries();
    this.own.geos.push(...this.treeGeos);
    this.clump = new THREE.IcosahedronGeometry(1, 1);
    this.leafGeo = new THREE.PlaneGeometry(0.16, 0.16).rotateX(-Math.PI / 2);
    this.own.geos.push(this.clump, this.leafGeo);
    this.soft = this.softTex();
    this.haloMat = new THREE.SpriteMaterial({ map: this.soft, color: 0xe8f4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
    this.haloWarm = new THREE.SpriteMaterial({ map: this.soft, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
    this.own.mats.push(this.haloMat, this.haloWarm);
    // The exit's direction: the arrows on every street sign point this way.
    this.exitDir = rng.chance(0.5) ? [1, 0] : [0, 1];
    this.exitBlock = [SPAWN_BLOCK[0] + this.exitDir[0] * EXIT_BLOCKS, SPAWN_BLOCK[1] + this.exitDir[1] * EXIT_BLOCKS];
    this.itemsPlaced = new Set();
    this.watchGone = new Set();

    this.hemi = new THREE.HemisphereLight(0x50687a, 0x1a2a1a, 0.6);
    this.spot = new THREE.SpotLight(0xfff2e0, 0, 34, 0.5, 0.5, 1.2);
    this.group.add(this.hemi, this.spot, this.spot.target);
    this.pool = Array.from({ length: 8 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 34, 1.15);
      this.group.add(l);
      return l;
    });

    this.buildGrid();
    const x0 = SPAWN_BLOCK[0] * B, z0 = SPAWN_BLOCK[1] * B;
    // Under the one street lamp that works, looking down the road.
    this.spawn = { x: x0 + 26, z: z0 + IN0 - 1.2, yaw: -Math.PI / 2 + 0.35 };
    this.lastPos = { x: this.spawn.x, z: this.spawn.z };
    this.world = {
      map: this.grid,
      collide: (pos, r) => this.colliders.collide(pos, r, pos.y ?? 0),
      groundAt: (x, z) => (isRoad(x, z) ? 0 : 0.12),
      sampleLight: (x, z) => {
        const l = this.lightAt(x, z);
        return [l, l, l];
      },
      ceilingHeight: () => 6,
      lights: [],
      lightsNear: (x, z, r) => this.world.lights.map((l, k) => [k, Math.hypot(l.x - x, l.z - z)]).filter((p) => p[1] <= r),
    };
    this.updateBlocks({ pos: { x: this.spawn.x, z: this.spawn.z } });
    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('ents'), shared });
    this.time = 0;
    this.done = false;
    this.told = {};
    this.fogState = { state: 'clear', t: 0, next: this.rng.range(90, 140), k: 0 };
    this.fog = new THREE.Color();
    this.nextCricket = 1;
    this.nextEnt = 30;
    this.offPath = 0;
    this.script = [
      [1.5, 'A street, at midnight. Wet asphalt, fallen leaves, dark houses. Most of the street lamps are dead.'],
      [8, 'The sidewalk feels safer than the road. You couldn\'t say why.'],
      [16, 'The street sign on the corner has an arrow on it, and a small "11".'],
    ];
    this.startEntities = true;
  }

  softTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.own.textures.push(t);
    return t;
  }

  plan(i, j) {
    const p = blockPlan(i, j, this.seed, SPAWN_BLOCK);
    if (i === this.exitBlock[0] && j === this.exitBlock[1]) p.highway = true;
    return p;
  }

  // ---- The grid entities walk on --------------------------------------------------------

  buildGrid() {
    const NX = (GX * B) / GC, NZ = (GZ * B) / GC;
    const map = new GridMap(NX, NZ, GC, 4);
    const blocked = new Uint8Array(NX * NZ);
    this.sidewalkCell = new Uint8Array(NX * NZ);
    const plans = new Map();
    for (let i = 0; i < GX; i++) for (let j = 0; j < GZ; j++) plans.set(`${i},${j}`, blockSolids(this.plan(i, j)));
    for (let y = 0; y < NZ; y++) for (let x = 0; x < NX; x++) {
      const cx = (x + 0.5) * GC, cz = (y + 0.5) * GC;
      const k = y * NX + x;
      this.sidewalkCell[k] = isSidewalk(cx, cz) ? 1 : 0;
      for (const b of plans.get(`${Math.floor(cx / B)},${Math.floor(cz / B)}`) || []) {
        const dx = cx - b.x, dz = cz - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < b.hw + 1 && Math.abs(lz) < b.hd + 1) blocked[k] = 1;
      }
    }
    const at = (x, y) => (x < 0 || y < 0 || x >= NX || y >= NZ ? 1 : blocked[y * NX + x]);
    for (let y = 0; y <= NZ; y++) for (let x = 0; x < NX; x++) map.setH(x, y, at(x, y - 1) || at(x, y) ? EDGE_WALL : EDGE_OPEN);
    for (let y = 0; y < NZ; y++) for (let x = 0; x <= NX; x++) map.setV(x, y, at(x - 1, y) || at(x, y) ? EDGE_WALL : EDGE_OPEN);
    this.grid = map;
    this.noSidewalk = (ni) => !this.sidewalkCell[ni];
  }

  // ---- Streaming blocks -------------------------------------------------------------------

  updateBlocks(player) {
    const ci = Math.floor(player.pos.x / B), cj = Math.floor(player.pos.z / B);
    if (ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const keep = new Set();
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const key = `${i},${j}`;
      keep.add(key);
      if (!this.blocks.has(key)) this.blocks.set(key, this.makeBlock(i, j));
    }
    for (const [key, b] of this.blocks) {
      if (keep.has(key)) continue;
      this.group.remove(b.group);
      for (const g of b.geos) g.dispose();
      for (const s of b.solids) this.colliders.remove(s);
      this.blocks.delete(key);
    }
    this.world.lights.length = 0;
    for (const b of this.blocks.values()) for (const l of b.lamps) if (l.state !== 'off') this.world.lights.push({ x: l.x, z: l.z, state: 'on' });
  }

  makeBlock(i, j) {
    const plan = this.plan(i, j);
    const key = `${i},${j}`;
    const built = buildBlock(plan, this.M, this.shared, this.seed, this.exitDir, this.colliders);
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    if (plan.highway) this.highwaySign(built.kit, i, j);
    const group = built.kit.build(this.M, own);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // Trees, instanced.
    for (let v = 0; v < 3; v++) {
      const list = built.trees.filter((t) => t.v === v);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.treeGeos[v], this.M.bark, list.length);
      list.forEach((t, k) => mesh.setMatrixAt(k, m4.compose(p.set(t.x, 0.1, t.z), q.setFromAxisAngle(up, t.rot), s.setScalar(t.s))));
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    const leafy = built.trees.filter((t) => t.leafy);
    if (leafy.length) {
      const fol = new THREE.InstancedMesh(this.clump, this.M.foliage, leafy.length * 6);
      const col = new THREE.Color();
      let n = 0;
      let seed = i * 31 + j * 17;
      const r = () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);
      for (const t of leafy) for (let k = 0; k < 6; k++) {
        const a = r() * Math.PI * 2, rr = r() * 1.8 * t.s;
        fol.setMatrixAt(n, m4.compose(p.set(t.x + Math.cos(a) * rr, (4.6 + r() * 2.2) * t.s, t.z + Math.sin(a) * rr), q.setFromAxisAngle(up, r() * 6), s.set(1.6 * t.s, 1.2 * t.s, 1.6 * t.s)));
        const base = [0x6a2a14, 0x8a3a12, 0x4a3a18, 0x7a1e16, 0x2a3a1e, 0x5a4a14][t.c];
        fol.setColorAt(n, col.set(base).multiplyScalar(0.8 + r() * 0.4));
        n++;
      }
      fol.computeBoundingSphere();
      group.add(fol);
    }
    // Leaves on the road, gathered along the curbs.
    {
      const n = 260;
      const lv = new THREE.InstancedMesh(this.leafGeo, this.M.leaf, n);
      const col = new THREE.Color();
      let seed = i * 101 + j * 37 + 5;
      const r = () => ((seed = (seed * 16807 + 7) % 2147483647) / 2147483647);
      for (let k = 0; k < n; k++) {
        const onX = r() < 0.5, along = ROAD + r() * (B - ROAD);
        const edge = r() < 0.75 ? (r() < 0.5 ? 0.3 + r() * 1.2 : ROAD - 0.3 - r() * 1.2) : r() * ROAD;
        const x = i * B + (onX ? edge : along), z = j * B + (onX ? along : edge);
        lv.setMatrixAt(k, m4.compose(p.set(x, 0.015, z), q.setFromAxisAngle(up, r() * 6), s.setScalar(0.7 + r() * 0.8)));
        lv.setColorAt(k, col.set([0x6a2a14, 0x8a4a1a, 0x5a3a14, 0x7a1e14, 0x3a3018][Math.floor(r() * 5)]));
      }
      lv.computeBoundingSphere();
      group.add(lv);
    }
    // Halos round the lamps that work.
    for (const l of built.lamps) {
      if (l.state === 'off') continue;
      const h = new THREE.Sprite(l.warm ? this.haloWarm : this.haloMat);
      h.position.set(l.x, l.y + 0.2, l.z);
      h.scale.setScalar(2.4);
      group.add(h);
      l.halo = h;
    }
    // Supplies left in the houses, once.
    if (!this.itemsPlaced.has(key)) {
      this.itemsPlaced.add(key);
      for (const it of built.items) this.ctx.placeItem?.(it.id, it.x, it.z);
    }
    // A watcher.
    let watch = null;
    if (plan.watch && !this.watchGone.has(key)) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.8).translate(0, 1.4, 0), this.M.watch);
      own.geos.push(w.geometry);
      w.position.set(plan.watch.x, 0.1, plan.watch.z);
      group.add(w);
      watch = { mesh: w, key, x: plan.watch.x, z: plan.watch.z };
    }
    this.group.add(group);
    return { i, j, plan, group, geos: own.geos, solids: built.solids, lamps: built.lamps, houses: built.houses, watch };
  }

  highwaySign(kit, i, j) {
    const x0 = i * B, z0 = j * B;
    const [dx] = this.exitDir;
    // A gantry over the road the arrows lead down.
    if (dx) {
      const x = x0 + B / 2;
      for (const z of [z0 - 0.6, z0 + ROAD + 0.6]) kit.add('metal', new THREE.CylinderGeometry(0.15, 0.15, 6.5, 8), x, 3.25, z);
      kit.box('metal', x, 6.3, z0 + ROAD / 2, 0.3, 0.3, ROAD + 1.4);
      kit.add('highway', new THREE.PlaneGeometry(4, 2), x - 0.2, 5.1, z0 + ROAD / 2, 0, -Math.PI / 2, 0);
    } else {
      const z = z0 + B / 2;
      for (const x of [x0 - 0.6, x0 + ROAD + 0.6]) kit.add('metal', new THREE.CylinderGeometry(0.15, 0.15, 6.5, 8), x, 3.25, z);
      kit.box('metal', x0 + ROAD / 2, 6.3, z, ROAD + 1.4, 0.3, 0.3);
      kit.add('highway', new THREE.PlaneGeometry(4, 2), x0 + ROAD / 2, 5.1, z - 0.2, 0, Math.PI, 0);
    }
  }

  // ---- Light ----------------------------------------------------------------------------------

  lightAt(x, z) {
    let l = 0.05;
    for (const b of this.blocks.values()) for (const lp of b.lamps) {
      if (lp.state === 'off' || lp.dark) continue;
      const d = Math.hypot(lp.x - x, lp.z - z);
      if (d < 12) l += (1 - d / 12) * 0.6;
    }
    return Math.min(1, l);
  }

  updateLights(dt, player) {
    const cands = [];
    for (const b of this.blocks.values()) {
      for (const lp of b.lamps) {
        if (lp.state === 'off') continue;
        // Flickering: mostly on, then a stutter, then dark for a while.
        if (lp.state === 'flicker') {
          const t = this.time + lp.ph;
          lp.dark = Math.sin(t * 0.7) > 0.55 || (Math.sin(t * 23) > 0.4 && Math.sin(t * 1.9) > 0.2);
          if (lp.halo) lp.halo.visible = !lp.dark;
        }
        if (lp.dark) continue;
        cands.push({ x: lp.x, y: lp.y, z: lp.z, color: lp.warm ? [1, 0.68, 0.36] : [0.8, 0.95, 1], power: 18, d: Math.hypot(lp.x - player.pos.x, lp.z - player.pos.z) });
      }
      const f = b.plan.floodlight;
      if (f) cands.push({ x: f.x, y: f.y, z: f.z, color: [0.3, 1, 0.65], power: 3, d: Math.hypot(f.x - player.pos.x, f.z - player.pos.z) });
    }
    cands.sort((a, b) => a.d - b.d);
    this.pool.forEach((pl, k) => {
      const c = cands[k];
      if (!c || c.d > 80) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(c.x, c.y, c.z);
      pl.color.setRGB(...c.color);
      pl.intensity = c.power;
    });
    const cp = Math.cos(player.pitch);
    const f = new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
    this.spot.position.set(player.pos.x, player.pos.y + player.eye - 0.1, player.pos.z);
    this.spot.target.position.copy(this.spot.position).addScaledVector(f, 10);
    this.spot.intensity = player.flashlight ? 40 : 0;
  }

  // ---- Per frame -------------------------------------------------------------------------------

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
    this.updateLights(dt, player);
    this.updateFog(dt, player);
    this.updateWatch(dt, player);
    this.updateAmbient(dt, player);
    this.trickle(dt, player);
    const res = this.entities.update(dt, player, ctx);
    for (const e of this.entities.list) e.root.visible = e.distTo(player) < 80;
    this.updateExits(dt, player);
    if (this.done) return;
    // Being watched wears on you; the sidewalk and the inside of a house less so.
    const indoors = this.indoors(player);
    const onWalk = isSidewalk(player.pos.x, player.pos.z);
    const drain = indoors ? 0 : (onWalk ? 0.06 : 0.14) + (this.fogState.k * 0.25) + (this.watched ? 0.5 : 0);
    player.sanity = Math.max(0, Math.min(100, player.sanity - drain * dt + (indoors ? 0.15 * dt : 0)));
    if (player.health <= 0 || player.sanity <= 0 || res.dead) {
      this.done = true;
      ctx.onDeath(player.sanity <= 0 ? 'The neighbourhood watched you until you stopped moving.' : res.cause);
    }
  }

  indoors(player) {
    for (const b of this.blocks.values()) for (const h of b.houses) {
      const dx = player.pos.x - h.cx, dz = player.pos.z - h.cz, c = Math.cos(h.rot), s = Math.sin(h.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < h.w / 2 - 0.2 && Math.abs(lz) < h.d / 2 - 0.2) return true;
    }
    return false;
  }

  spawnStart(player) {
    const m = this.entities;
    const far = (type, opts = {}) => m.spawnFar(type, player, { min: 30, max: 90, opts });
    far('smiler');
    far('smiler');
    far('hound');
    far('skinstealer');
    far('wretch');
    for (let k = 0; k < 3; k++) far('deathrat', { variant: 'grey' });
    for (let k = 0; k < 2; k++) far('deathmoth', { variant: 'drone' });
  }

  // Keep a few things around you as you walk.
  trickle(dt, player) {
    this.nextEnt -= dt;
    if (this.nextEnt > 0) return;
    this.nextEnt = this.rng.range(40, 70);
    if (player.pos.x < 0 || player.pos.z < 0 || player.pos.x > GX * B || player.pos.z > GZ * B) return;
    const near = this.entities.list.filter((e) => e.alive && e.distTo(player) < 90 && e.type !== 'mangled').length;
    if (near >= 5) return;
    this.entities.spawnFar(this.rng.pick(['smiler', 'hound', 'skinstealer', 'deathrat', 'wretch']), player, { min: 40, max: 90 });
  }

  updateFog(dt, player) {
    const F = this.fogState, { ctx } = this;
    F.t += dt;
    if (F.state === 'clear' && F.t > F.next) {
      F.state = 'in';
      F.t = 0;
      ctx.hud.message('Fog is rolling down the street. Get on the sidewalk.', 4);
      ctx.audio.gust?.(0, 0.2, 4);
    } else if (F.state === 'in') {
      F.k = Math.min(1, F.t / 10);
      if (F.t > 10) {
        F.state = 'thick';
        F.t = 0;
        this.spawnMangled(player, this.rng.int(1, 2));
      }
    } else if (F.state === 'thick' && F.t > 35) {
      F.state = 'out';
      F.t = 0;
    } else if (F.state === 'out') {
      F.k = Math.max(0, 1 - F.t / 10);
      if (F.t > 10) {
        F.state = 'clear';
        F.t = 0;
        F.k = 0;
        F.next = this.rng.range(110, 180);
        for (const e of this.entities.list.filter((x) => x.type === 'mangled')) this.entities.remove(e);
        if (player.health > 0) ctx.award?.('fog9');
        ctx.hud.message('The fog thins, and whatever was in it is gone.', 3);
      }
    }
  }

  spawnMangled(player, n) {
    for (let k = 0; k < n; k++) {
      const e = this.entities.spawnFar('smiler', player, { min: 18, max: 30 });
      if (!e) continue;
      const { x, z } = e.pos;
      this.entities.remove(e);
      const m = new Mangled({ scene: this.scene, world: this.world, audio: this.ctx.audio, rng: this.rng.fork('mangled' + this.time + k), shared: this.shared }, { x, z, canWalk: this.noSidewalk });
      m.type = 'mangled';
      this.entities.list.push(m);
    }
    if (!this.told.mangled) {
      this.told.mangled = true;
      this.ctx.hud.message('Shapes in the fog, coming down the middle of the street. Something wrong with the way they move.', 4);
    }
  }

  updateWatch(dt, player) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    this.watched = false;
    this.watchers = [];
    for (const b of this.blocks.values()) {
      const w = b.watch;
      if (!w || this.watchGone.has(w.key)) continue;
      const dx = w.x - player.pos.x, dz = w.z - player.pos.z, d = Math.hypot(dx, dz);
      w.mesh.rotation.y = Math.atan2(-dx, -dz);
      if (d < 11) {
        // Up close, there's nobody there.
        this.watchGone.add(w.key);
        w.mesh.visible = false;
        continue;
      }
      const inView = d < 50 && (dx * fx + dz * fz) / d > 0.7;
      if (inView) {
        this.watched = true;
        this.watchers.push(w);
        if (!this.told.watch) {
          this.told.watch = true;
          this.ctx.hud.message('Someone is standing in a yard, very tall and very still, watching you.', 4);
        }
      }
    }
  }

  updateAmbient(dt, player) {
    const a = this.ctx.audio;
    this.nextCricket -= dt;
    if (this.nextCricket <= 0) {
      this.nextCricket = this.rng.range(0.5, 2) * (1 + this.fogState.k * 2);
      a.cricket?.(this.rng.range(-1, 1), 0.035 * (1 - this.fogState.k));
    }
    if (this.rng.chance(dt * 0.08)) a.rustle(this.rng.range(-1, 1), 0.07, 2.5);
    if (this.rng.chance(dt * 0.02)) a.howl(this.rng.range(-1, 1), 0.05);
    // Flickering lamps buzz.
    for (const b of this.blocks.values()) for (const lp of b.lamps) {
      if (lp.state !== 'flicker' || !lp.dark) continue;
      if (Math.hypot(lp.x - player.pos.x, lp.z - player.pos.z) < 10 && this.rng.chance(dt * 0.5)) a.flickerBuzz?.(0.3, 0.05);
    }
  }

  updateExits(dt, player) {
    const { ctx } = this;
    const p = player.pos;
    // Following the arrows.
    const along = p.x * this.exitDir[0] + p.z * this.exitDir[1];
    const goal = (this.exitBlock[0] * this.exitDir[0] + this.exitBlock[1] * this.exitDir[1]) * B + B / 2;
    if (along > goal - 40 && !this.told.highway) {
      this.told.highway = true;
      ctx.hud.message('Up ahead, over the road, a big green sign: LEVEL 11 — NEXT EXIT.', 4);
    }
    if (along > goal) {
      this.done = true;
      ctx.hud.message('You keep following the arrows, street after street, until the houses give way to an on-ramp.', 4);
      ctx.onEscape('level11', 'walk');
      return;
    }
    for (const b of this.blocks.values()) {
      const pl = b.plan;
      if (pl.tubeAt && Math.hypot(pl.tubeAt.x - p.x, pl.tubeAt.z - p.z) < 1.1) {
        this.done = true;
        ctx.hud.message('You crawl into the tube. It\'s bright white inside, and much, much longer than it looked.', 4);
        ctx.onEscape('level283', 'noclip');
        return;
      }
      const W = pl.walkway;
      if (!W) continue;
      const inField = p.x > b.i * B + IN0 && p.x < b.i * B + IN1 && p.z > b.j * B + IN0 && p.z < b.j * B + IN1;
      if (!inField) continue;
      if (!this.told.field) {
        this.told.field = true;
        ctx.hud.message('A field of long grass where a block of houses should be. A stone walkway leads out into it.', 4);
      }
      const pathX = W.x + Math.sin((p.z - b.j * B) * 0.2) * 1.5;
      const onPath = Math.abs(p.x - pathX) < 1.6 && p.z < W.z1 + 1;
      if (onPath && p.z > W.z1 - 1) {
        this.done = true;
        ctx.hud.message('The walkway ends, and when you look up, the houses are gone. Just grass, under the stars.', 4);
        ctx.onEscape('level9_1', 'walk');
        return;
      }
      if (!onPath && p.z > b.j * B + IN0 + 5) {
        this.offPath += dt;
        if (this.offPath > 3.5) {
          this.done = true;
          ctx.hud.message('You wander off the path into the grass. When you turn round, the streetlights are a long way off. Then they\'re gone.', 5);
          ctx.onEscape('level10', 'walk');
          return;
        }
      } else this.offPath = 0;
    }
  }

  photoSubjects() {
    return (this.watchers || []).map((w) => ({ type: 'watch', x: w.x, y: 1.6, z: w.z, range: 50, noLos: true }));
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. (Search the houses.)', 1.8);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    let drone = 0.03 + (this.watched ? 0.08 : 0);
    for (const e of this.entities.list) {
      if (!['chase', 'hunt', 'attack', 'stalk', 'lunge'].includes(e.state)) continue;
      drone = Math.max(drone, 0.25 * Math.max(0, 1 - e.distTo(player) / 30));
    }
    return {
      hum: 0, exitGain: 0, exitPan: 0, drone, machine: 0, jazz: 0,
      wind: 0.05 + this.fogState.k * 0.04,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    const k = this.fogState.k;
    this.fog.setRGB(0.012, 0.022, 0.02).lerp(new THREE.Color(0.2, 0.13, 0.07), k);
    return {
      fogColor: this.fog,
      fogDensity: 0.016 + k * 0.05,
      warp: insane * insane, aberr: 0.15 + insane * 0.8, grain: 0.08, soften: 0.25,
    };
  }

  hudInfo(player) {
    const warn = this.fogState.k > 0.3 && !isSidewalk(player.pos.x, player.pos.z) && !this.indoors(player) ? 'GET OFF THE STREET' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.scene.remove(this.group);
    this.entities.dispose();
    for (const b of this.blocks.values()) for (const g of b.geos) g.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL9 = {
  id: 'level9',
  number: 9,
  name: 'Level 9',
  title: 'The Suburbs',
  difficulty: 5,
  next: 'level11',
  create: (ctx) => new Level9(ctx),
};
