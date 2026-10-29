import * as THREE from 'three';
import { Entity } from './Entity.js';
import { smilerFace } from './textures.js';

// Smiler: nothing but two glowing eyes and an enormous grin, floating in the
// dark. It can only exist where it's dark. It drifts closer while you're in
// the dark with it; shine a light on it too long and it lunges.
//
// States: lurk -> watch -> stalk -> attack (-> vanish). Fades out in light.

export class Smiler extends Entity {
  build() {
    this.radius = 0.25;
    this.faceClosed = new THREE.MeshBasicMaterial({ map: smilerFace(false), transparent: true, depthWrite: false, fog: false });
    this.faceOpen = new THREE.MeshBasicMaterial({ map: smilerFace(true), transparent: true, depthWrite: false, fog: false });
    this.mats.push(this.faceClosed, this.faceOpen);
    this.face = this.mesh(this.geo(new THREE.PlaneGeometry(0.75, 0.75)), this.faceClosed, 0, 1.65, 0.05);
    // A faint smear of deeper darkness around the face.
    this.shade = this.mesh(this.geo(new THREE.SphereGeometry(0.5, 14, 10)), this.mat(0x000000, { opacity: 0.55, depthWrite: false }), 0, 1.55, -0.1);
    this.shade.scale.set(1, 1.5, 0.6);
    this.root.add(this.shade, this.face);
    this.visibility = 0;
    this.agitation = 0;
    this.home = null;
  }

  dark(x, z) {
    return this.lightAt(x, z) < 0.14;
  }

  canWalk = (i) => {
    const [x, z] = this.map.cellCenter(i % this.map.cols, (i / this.map.cols) | 0);
    return this.dark(x, z);
  };

  // Move somewhere dark, away from the player.
  relocate(player) {
    const { map } = this;
    const cands = [];
    for (let i = 0; i < map.cols * map.rows; i++) {
      const [x, z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
      if (!this.dark(x, z)) continue;
      const d = player ? Math.hypot(x - player.pos.x, z - player.pos.z) : 20;
      if (d > 14 && d < 40) cands.push([x, z]);
    }
    if (cands.length) {
      const [x, z] = this.rng.pick(cands);
      this.pos.set(x, 0, z);
    }
    this.visibility = 0;
    this.setState('lurk');
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const inDark = this.dark(this.pos.x, this.pos.z);
    const playerDark = this.dark(player.pos.x, player.pos.z);
    this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 2);

    // Light hurts it: it fades and slips back into the dark.
    const lit = this.litBy(player);
    this.agitation = lit ? this.agitation + dt : Math.max(0, this.agitation - dt * 0.5);
    const targetVis = inDark ? 1 : 0;
    this.visibility += (targetVis - this.visibility) * Math.min(1, dt * 3);
    if (!inDark && this.state !== 'attack') {
      if (this.visibility < 0.05) this.relocate(player);
      return;
    }

    switch (this.state) {
      case 'idle':
      case 'lurk':
        this.setState('lurk');
        if (d < 12) this.setState('watch');
        break;
      case 'watch':
        if (this.stateTime > 1.5 && Math.random() < dt * 0.3) this.sound('hiss', player, 0.18);
        if (d > 15) this.setState('lurk');
        else if (d < 8 && playerDark) {
          this.setState('stalk');
          out.push({ type: 'detect' });
        }
        if (this.agitation > 1.2) this.setState('attack');
        break;
      case 'stalk':
        this.pathTo(player.pos.x, player.pos.z, 1.1, dt, this.canWalk);
        if (d < 2.2 || this.agitation > 1.2) this.setState('attack');
        else if (!playerDark && d > 4) this.setState('watch');
        break;
      case 'attack':
        if (this.stateTime < 0.05) this.sound('shriek', player, 0.5);
        this.moveToward(player.pos.x, player.pos.z, 7, dt, 12);
        if (d < 0.8 && !this.cooldown) {
          out.push({ type: 'attack', damage: 45, sanity: 20, cause: "A Smiler's grin was the last thing you saw." });
          this.cooldown = 4;
          this.relocate(player);
        } else if (this.stateTime > 1.6) {
          this.relocate(player);
        }
        break;
    }
  }

  // Is the player's flashlight on it?
  litBy(player) {
    if (!player.flashlight) return false;
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 12) return false;
    const cos = (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / Math.max(d, 0.01);
    return cos > 0.9 && this.lineOfSight(player.pos.x, player.pos.z);
  }

  animate(dt) {
    const s = this.preview || this.state;
    const attacking = s === 'attack';
    this.face.material = attacking ? this.faceOpen : this.faceClosed;
    const vis = this.preview ? 1 : this.visibility;
    // Blink every few seconds.
    const blink = (this.time % 4.3) < 0.12 ? 0.15 : 1;
    const grin = s === 'watch' || s === 'stalk' || s === 'detect' ? 1.15 : attacking ? 1.35 : 1;
    this.face.scale.set(grin, grin * (s === 'attack' ? 1.1 : 1) * (blink < 1 && !attacking ? 0.96 : 1), 1);
    this.face.material.opacity = vis * (blink < 1 && !attacking ? 0.75 : 1) * (0.85 + 0.15 * Math.sin(this.time * 13));
    this.face.position.y = 1.65 + Math.sin(this.time * 1.4) * 0.06;
    this.face.position.x = (Math.random() - 0.5) * 0.01 * grin;
    this.face.rotation.z = Math.sin(this.time * 0.9) * 0.08;
    this.shade.material.opacity = 0.5 * vis;
  }
}
