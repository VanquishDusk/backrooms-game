import * as THREE from 'three';
import { DIRS } from '../world/GridMap.js';

// Something that hunts the halls of Level 1 when the lights go out. It
// can't (or won't) follow you into the corridors.

export class Hound {
  /**
   * @param {(i:number)=>boolean} canWalk  cell index -> may it go there
   */
  constructor(scene, world, rng, canWalk) {
    this.scene = scene;
    this.world = world;
    this.map = world.map;
    this.rng = rng;
    this.canWalk = canWalk;
    this.state = 'gone'; // gone | prowl | hunt | retreat | leaving
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.timer = 0;
    this.flow = new Int32Array(this.map.cols * this.map.rows);
    this.flowTimer = 0;
    this.gait = 0;
    this.opacity = 0;
    this.wander = null;
    this.stepAcc = 0;

    const mat = new THREE.MeshBasicMaterial({ color: 0x080706, transparent: true });
    this.mat = mat;
    const g = new THREE.Group();
    this.geos = [];
    const box = (w, h, d) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.geos.push(geo);
      return geo;
    };
    const body = new THREE.Mesh(box(0.42, 0.38, 1.25), mat);
    body.position.y = 0.78;
    const neck = new THREE.Mesh(box(0.2, 0.2, 0.45), mat);
    neck.position.set(0, 0.92, 0.72);
    neck.rotation.x = -0.6;
    const head = new THREE.Mesh(box(0.26, 0.24, 0.42), mat);
    head.position.set(0, 1.0, 1.0);
    g.add(body, neck, head);
    this.legs = [];
    for (const [lx, lz] of [[-0.17, 0.48], [0.17, 0.48], [-0.17, -0.48], [0.17, -0.48]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.72, lz);
      const leg = new THREE.Mesh(box(0.07, 0.78, 0.07), mat);
      leg.position.y = -0.38;
      pivot.add(leg);
      g.add(pivot);
      this.legs.push(pivot);
    }
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false, transparent: true });
    for (const ex of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(box(0.04, 0.025, 0.02), this.eyeMat);
      eye.position.set(ex, 1.05, 1.215);
      g.add(eye);
    }
    g.visible = false;
    this.mesh = g;
    scene.add(g);
  }

  get active() {
    return this.state !== 'gone';
  }

  cellIndex(x, z) {
    const [cx, cy] = this.map.cellAt(x, z);
    return this.map.idx(cx, cy);
  }

  // BFS over walkable cells from the player (distance field to follow).
  buildFlow(player) {
    const { map } = this;
    const flow = this.flow;
    flow.fill(-1);
    const start = this.cellIndex(player.pos.x, player.pos.z);
    if (!this.canWalk(start)) return false;
    const q = [start];
    flow[start] = 0;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      const cx = cur % map.cols, cy = (cur / map.cols) | 0;
      for (let d = 0; d < 4; d++) {
        if (!map.canMove(cx, cy, d)) continue;
        const ni = map.idx(cx + DIRS[d][0], cy + DIRS[d][1]);
        if (flow[ni] !== -1 || !this.canWalk(ni)) continue;
        flow[ni] = flow[cur] + 1;
        q.push(ni);
      }
    }
    return true;
  }

  seenBy(player) {
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    const cos = (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / Math.max(d, 0.01);
    return cos > 0.55 && this.map.hasLineOfSight(player.pos.x, player.pos.z, this.pos.x, this.pos.z);
  }

  spawn(player) {
    const { map } = this;
    const cands = [];
    for (let i = 0; i < map.cols * map.rows; i++) {
      if (!this.canWalk(i)) continue;
      const [x, z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (d < 18 || d > 34) continue;
      if (map.hasLineOfSight(player.pos.x, player.pos.z, x, z)) continue;
      cands.push([x, z]);
    }
    if (!cands.length) return false;
    const [x, z] = this.rng.pick(cands);
    this.pos.set(x, 0, z);
    this.state = 'prowl';
    this.timer = 0;
    this.wander = null;
    return true;
  }

  leave() {
    if (this.state !== 'gone') this.state = 'leaving';
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return 0;
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, dt * 8);
    return step;
  }

  // Next waypoint along the flow field, or null if there's no path.
  nextWaypoint(player) {
    const { map } = this;
    const here = this.cellIndex(this.pos.x, this.pos.z);
    const hd = this.flow[here];
    if (hd < 0) return null;
    if (hd <= 1) return [player.pos.x, player.pos.z];
    const cx = here % map.cols, cy = (here / map.cols) | 0;
    for (let d = 0; d < 4; d++) {
      if (!map.canMove(cx, cy, d)) continue;
      const ni = map.idx(cx + DIRS[d][0], cy + DIRS[d][1]);
      if (this.flow[ni] === hd - 1) return map.cellCenter(cx + DIRS[d][0], cy + DIRS[d][1]);
    }
    return null;
  }

  // Returns events: 'growl' | 'bite' | 'step'.
  // Weapons: it reels for a few seconds.
  stun(seconds) {
    this.stunned = Math.max(this.stunned || 0, seconds);
  }

  update(dt, player) {
    const events = [];
    if (this.state === 'gone') return events;
    if (this.stunned > 0) {
      this.stunned -= dt;
      return events;
    }
    this.timer += dt;
    const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    let speed = 0;

    this.flowTimer -= dt;
    let reachable = this.flow[this.cellIndex(this.pos.x, this.pos.z)] >= 0;
    if (this.flowTimer <= 0) {
      reachable = this.buildFlow(player) && this.flow[this.cellIndex(this.pos.x, this.pos.z)] >= 0;
      this.flowTimer = 0.4;
    }

    switch (this.state) {
      case 'prowl': {
        this.opacity = Math.min(1, this.opacity + dt);
        const hears = dist < 13 || (player.sprinting && dist < 30) || (dist < 22 && this.map.hasLineOfSight(player.pos.x, player.pos.z, this.pos.x, this.pos.z));
        if (hears && reachable) {
          this.state = 'hunt';
          events.push('growl');
          break;
        }
        if (!this.wander || Math.hypot(this.wander[0] - this.pos.x, this.wander[1] - this.pos.z) < 0.5) {
          // Drift toward the player's general area, through walkable cells.
          const { map } = this;
          const [cx, cy] = map.cellAt(this.pos.x, this.pos.z);
          const opts = [];
          for (let d = 0; d < 4; d++) {
            if (!map.canMove(cx, cy, d)) continue;
            const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
            if (!this.canWalk(map.idx(nx, ny))) continue;
            const [wx, wz] = map.cellCenter(nx, ny);
            const toward = Math.hypot(wx - player.pos.x, wz - player.pos.z) < dist ? 2 : 1;
            for (let k = 0; k < toward; k++) opts.push([wx, wz]);
          }
          this.wander = opts.length ? this.rng.pick(opts) : [this.pos.x, this.pos.z];
        }
        speed = this.moveToward(this.wander[0], this.wander[1], 1.5, dt);
        break;
      }
      case 'hunt': {
        if (!reachable) {
          // You slipped into a corridor. It paces, waiting.
          this.state = 'prowl';
          this.wander = null;
          events.push('growl');
          break;
        }
        const wp = this.nextWaypoint(player);
        if (wp) speed = this.moveToward(wp[0], wp[1], this.seenBy(player) ? 3.3 : 3.9, dt);
        if (dist < 1.1 && !player.dead) {
          events.push('bite');
          this.state = 'retreat';
          this.timer = 0;
        }
        break;
      }
      case 'retreat': {
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z;
        const al = Math.hypot(ax, az) || 1;
        const tx = this.pos.x + (ax / al) * 2, tz = this.pos.z + (az / al) * 2;
        speed = this.moveToward(tx, tz, 2.8, dt);
        this.world.collide(this.pos, 0.4);
        if (this.timer > 3) {
          this.state = 'hunt';
          events.push('growl');
        }
        break;
      }
      case 'leaving': {
        this.opacity = Math.max(0, this.opacity - dt * 1.2);
        if (this.opacity <= 0) this.state = 'gone';
        break;
      }
    }

    // Animate.
    this.gait += speed * 5.5;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.gait + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(0.7, speed / dt * 0.25 || 0);
    });
    if (speed > 0) {
      this.stepAcc += speed;
      if (this.stepAcc > 0.9) {
        this.stepAcc = 0;
        events.push('step');
      }
    }
    this.mat.opacity = this.opacity;
    this.eyeMat.opacity = this.opacity;
    this.mesh.visible = this.opacity > 0.02;
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(this.gait * 0.5)) * 0.04, this.pos.z);
    this.mesh.rotation.y = this.heading;
    return events;
  }

  dispose() {
    this.scene.remove(this.mesh);
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
    this.eyeMat.dispose();
  }
}
