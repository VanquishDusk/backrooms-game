import * as THREE from 'three';
import { DIRS } from '../../world/GridMap.js';

// Base class for every entity in the library.
//
// An entity owns a `root` group in the scene, a position on the level's
// grid, and a state machine (`state`, `stateTime`, `setState`). Subclasses
// implement:
//   build()                     create meshes under this.root
//   think(dt, player, out)      AI; push events into `out`
//   animate(dt, player)         pose the model for the current state
// Events pushed to `out` are plain objects, e.g.
//   { type: 'attack', damage, sanity, cause }  the manager applies these
//   { type: 'detect' }                          the entity noticed the player
// Materials made with this.mat() are tinted by the level's baked light and
// the player's flashlight every frame, so entities sit in the scene's
// lighting (and vanish in the dark) like everything else.

const _v = new THREE.Vector3();

export class Entity {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.world = ctx.world;
    this.map = ctx.world.map;
    this.rng = ctx.rng;
    this.opts = opts;
    this.pos = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0);
    this.heading = opts.heading ?? 0;
    this.radius = 0.32;
    this.state = 'idle';
    this.stateTime = 0;
    this.time = this.rng.next() * 100;
    this.moveSpeed = 0; // m/s actually moved last frame (drives animation)
    this.gait = 0;
    this.cooldown = 0;
    this.alive = true;
    this.preview = null; // viewer pose override: 'idle' | 'move' | 'detect' | 'attack'
    this.lit = [];
    this.geos = [];
    this.mats = [];
    this.flow = new Int32Array(this.map.cols * this.map.rows);
    this.flowTimer = 0;
    this.flowGoal = -1;
    this.wanderTarget = null;
    this.root = new THREE.Group();
    ctx.scene.add(this.root);
    this.build();
    this.syncRoot();
  }

  // ---- Construction helpers --------------------------------------------

  // Light-reactive material. `emissive: true` keeps it at full colour.
  mat(color, opts = {}) {
    const m = new THREE.MeshBasicMaterial({
      color,
      map: opts.map || null,
      transparent: !!opts.transparent || opts.opacity != null,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      alphaTest: opts.alphaTest ?? 0,
      fog: opts.fog ?? true,
      depthWrite: opts.depthWrite ?? true,
    });
    this.mats.push(m);
    if (!opts.emissive) this.lit.push({ mat: m, base: new THREE.Color(color) });
    return m;
  }

  geo(g) {
    this.geos.push(g);
    return g;
  }

  mesh(g, m, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (this.onState) this.onState(s);
  }

  // ---- Senses ----------------------------------------------------------

  distTo(player) {
    return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
  }

  lightAt(x, z) {
    const [r, g, b] = this.world.sampleLight(x, z);
    return ((r + g + b) / 3) * (this.ctx.shared ? this.ctx.shared.globalLight.value : 1);
  }

  lineOfSight(x, z) {
    return this.map.hasLineOfSight(this.pos.x, this.pos.z, x, z);
  }

  // Can this entity see the player? Players in the dark are only noticed
  // up close or when their flashlight is on.
  canSee(player, range = 18, fov = 1.2) {
    const d = this.distTo(player);
    if (d > range) return false;
    const a = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (Math.abs(wrap(a - this.heading)) > fov) return false;
    if (!this.lineOfSight(player.pos.x, player.pos.z)) return false;
    const lit = this.lightAt(player.pos.x, player.pos.z) > 0.18 || player.flashlight;
    return lit || d < range * 0.35;
  }

  // How far away this entity can hear the player right now.
  hearingRange(player) {
    if (player.sprinting) return 26;
    if (player.speed > 0.6) return player.coveringEars ? 8 : 11;
    return 3;
  }

  hears(player) {
    return this.distTo(player) < this.hearingRange(player);
  }

  // Is the player looking at this entity?
  seenBy(player, cosLimit = 0.6, range = 30) {
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    const cos = (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / Math.max(d, 0.01);
    return cos > cosLimit && this.map.hasLineOfSight(player.pos.x, player.pos.z, this.pos.x, this.pos.z);
  }

  // ---- Movement --------------------------------------------------------

  // Turn toward a heading at `rate` rad/s.
  turnTo(target, dt, rate = 6) {
    const d = wrap(target - this.heading);
    this.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  moveToward(x, z, speed, dt, turnRate = 7) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) return true;
    this.turnTo(Math.atan2(dx, dz), dt, turnRate);
    const step = Math.min(d, speed * dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.world.collide(this.pos, this.radius);
    this.moveSpeed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    return d < 0.15;
  }

  // Follow a flow field toward a world point through walkable cells.
  pathTo(x, z, speed, dt, canWalk = null) {
    const { map } = this;
    const [gx, gy] = map.cellAt(x, z);
    const goal = map.idx(gx, gy);
    this.flowTimer -= dt;
    if (goal !== this.flowGoal || this.flowTimer <= 0) {
      this.buildFlow(goal, canWalk);
      this.flowGoal = goal;
      this.flowTimer = 0.4;
    }
    const [cx, cy] = map.cellAt(this.pos.x, this.pos.z);
    const here = this.flow[map.idx(cx, cy)];
    if (here < 0) return false; // no path
    if (here <= 1 && this.lineOfSight(x, z)) {
      this.moveToward(x, z, speed, dt);
      return true;
    }
    for (let d = 0; d < 4; d++) {
      if (!map.canMove(cx, cy, d)) continue;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (this.flow[map.idx(nx, ny)] === here - 1) {
        const [tx, tz] = map.cellCenter(nx, ny);
        this.moveToward(tx, tz, speed, dt);
        return true;
      }
    }
    return false;
  }

  buildFlow(goal, canWalk) {
    const { map } = this;
    const flow = this.flow;
    flow.fill(-1);
    flow[goal] = 0;
    const q = [goal];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      const cx = cur % map.cols, cy = (cur / map.cols) | 0;
      for (let d = 0; d < 4; d++) {
        if (!map.canMove(cx, cy, d)) continue;
        const ni = map.idx(cx + DIRS[d][0], cy + DIRS[d][1]);
        if (flow[ni] !== -1 || (canWalk && !canWalk(ni))) continue;
        flow[ni] = flow[cur] + 1;
        q.push(ni);
      }
    }
  }

  // Amble between neighbouring cells.
  wander(dt, speed, canWalk = null) {
    const { map } = this;
    if (!this.wanderTarget || Math.hypot(this.wanderTarget[0] - this.pos.x, this.wanderTarget[1] - this.pos.z) < 0.2) {
      const [cx, cy] = map.cellAt(this.pos.x, this.pos.z);
      const opts = [];
      for (let d = 0; d < 4; d++) {
        if (!map.canMove(cx, cy, d)) continue;
        const ni = map.idx(cx + DIRS[d][0], cy + DIRS[d][1]);
        if (canWalk && !canWalk(ni)) continue;
        const c = map.cellCenter(cx + DIRS[d][0], cy + DIRS[d][1]);
        opts.push([c[0] + this.rng.range(-0.5, 0.5), c[1] + this.rng.range(-0.5, 0.5)]);
      }
      this.wanderTarget = opts.length ? this.rng.pick(opts) : [this.pos.x, this.pos.z];
    }
    return this.moveToward(this.wanderTarget[0], this.wanderTarget[1], speed, dt, 3);
  }

  // ---- Sound -----------------------------------------------------------

  // Play an AudioEngine one-shot from this entity's position.
  sound(name, player, vol = 0.3, range = 24, ...args) {
    const audio = this.ctx.audio;
    if (!audio || !audio[name] || !player) return;
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return;
    const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / Math.max(d, 1);
    audio[name](Math.max(-1, Math.min(1, pan)), vol * (1 - d / range) ** 1.4, ...args);
  }

  // ---- Frame -----------------------------------------------------------

  update(dt, player) {
    const out = [];
    this.time += dt;
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.moveSpeed = 0;
    if (this.preview) {
      this.state = this.preview;
      this.moveSpeed = this.preview === 'move' ? this.previewSpeed ?? 1.5 : 0;
    } else if (this.alive && player) {
      this.think(dt, player, out);
    }
    this.gait += this.moveSpeed * dt * (this.gaitScale ?? 3.2);
    this.animate(dt, player);
    this.syncRoot();
    this.applyLight(player);
    return out;
  }

  syncRoot() {
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.root.rotation.y = this.heading;
  }

  // Tint light-reactive materials by the light around the entity.
  applyLight(player) {
    if (!this.lit.length) return;
    const sh = this.ctx.shared;
    let k = 0.06 + this.lightAt(this.pos.x, this.pos.z) * 1.35;
    if (sh && sh.flOn.value > 0.01) {
      _v.set(this.pos.x, 1.2, this.pos.z).sub(sh.flPos.value);
      const d = _v.length();
      const spot = Math.max(0, Math.min(1, (_v.normalize().dot(sh.flDir.value) - 0.86) / 0.11));
      k += sh.flOn.value * spot * 2.2 / (1 + d * d * 0.07);
    }
    k = Math.min(1.6, k * (this.lightBoost ?? 1));
    for (const { mat, base } of this.lit) mat.color.setRGB(base.r * k, base.g * k, base.b * k);
  }

  // Remove from the scene and free GPU resources (shared textures stay cached).
  dispose() {
    this.alive = false;
    this.ctx.scene.remove(this.root);
    for (const g of this.geos) g.dispose();
    if (this.rig) for (const g of this.rig.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  // Default hooks.
  build() {}
  think() {}
  animate() {}
}

export function wrap(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
