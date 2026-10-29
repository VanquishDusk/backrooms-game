import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildHumanoid, resetPose, walk, idle, reach, lookAt } from './rig.js';
import { fabric, skinTone } from './textures.js';

// Faceling: an ordinary-looking person in ordinary clothes, with a smooth,
// completely blank face. Most are passive and simply stop to "watch" you.
// Some are not.
//
// opts.variant: 'passive' (default) | 'hostile' | 'child' (small, hostile)
// States: wander -> watch (passive) | stalk -> chase -> attack (hostile)

const SHIRTS = ['#6b7a8c', '#8c3b3b', '#3f5e3f', '#c9c1a8', '#2d2d33', '#8a6a3a', '#4d3f66'];
const PANTS = ['#2f3b52', '#3a3530', '#5a5246', '#1e1e22', '#4a4a48'];
const SKIN = ['#d8b49a', '#b98a6a', '#8a5e44', '#e6c8b0', '#6a4632'];
const HAIR = ['#1a1410', '#3a2a1a', '#6a4a2a', '#8a8070', null];

export class Faceling extends Entity {
  build() {
    const variant = this.opts.variant || 'passive';
    this.variant = variant;
    this.hostile = variant !== 'passive';
    const child = variant === 'child';
    const r = this.rng;
    const skin = this.mat(0xffffff, { map: skinTone(r.pick(SKIN)) });
    const shirt = this.mat(0xffffff, { map: fabric(r.pick(SHIRTS)) });
    const pants = this.mat(0xffffff, { map: fabric(r.pick(PANTS)) });
    const shoes = this.mat(0x1c1a18);
    const s = child ? 0.62 : r.range(0.95, 1.05);
    this.rig = buildHumanoid({
      mat: shirt, torsoMat: shirt, armMat: shirt, forearmMat: r.chance(0.5) ? skin : shirt, handMat: skin,
      headMat: skin, legMat: pants, footMat: shoes,
      legLen: 0.88 * s, torsoLen: 0.56 * s, armLen: 0.7 * s, headR: 0.11 * (child ? 1.15 : 1), headLen: 0.25 * (child ? 1.05 : 1),
      shoulder: 0.2 * s, hipW: 0.09 * s, torsoR: 0.17 * s, limbR: 0.05 * s,
    });
    this.root.add(this.rig.root);
    // Hair, sometimes. No eyes, nose or mouth. Ever.
    const hair = r.pick(HAIR);
    if (hair) {
      const h = this.mesh(this.geo(new THREE.SphereGeometry(0.118 * (child ? 1.15 : 1), 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), this.mat(hair), 0, this.rig.p.headLen * 0.55, -0.01);
      h.scale.set(1, 1.05, 1.1);
      this.rig.head.add(h);
    }
    // Faint brow and cheek shading so the blankness reads as a face that isn't there.
    const shade = this.mat(0x000000, { opacity: 0.12, depthWrite: false });
    const brow = this.mesh(this.geo(new THREE.BoxGeometry(0.14, 0.02, 0.01)), shade, 0, this.rig.p.headLen * 0.62, 0.105);
    this.rig.head.add(brow);
    this.speedMul = child ? 1.15 : 1;
    this.watchTime = 0;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const sees = this.canSee(player, 14, 1.6);
    switch (this.state) {
      case 'idle':
      case 'wander':
        this.setState('wander');
        if (this.rng.chance(dt * 0.15)) this.pauseUntil = this.time + this.rng.range(1, 4);
        if (!(this.pauseUntil > this.time)) this.wander(dt, 0.9 * this.speedMul);
        if (sees && d < (this.hostile ? 9 : 5)) {
          this.setState(this.hostile ? 'stalk' : 'watch');
          out.push({ type: 'detect' });
        }
        break;
      case 'watch':
        // Stop. Turn. Face you with no face. Back away if you get too close.
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 1.5);
        if (d < 1.6) {
          const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
          const h = this.heading;
          this.moveToward(this.pos.x + ax / l, this.pos.z + az / l, 0.6, dt);
          this.heading = h;
        }
        if (d > 8 || this.stateTime > 12) this.setState('wander');
        break;
      case 'stalk':
        // Walks at you, head tilted, never hurrying. Until it does.
        this.pathTo(player.pos.x, player.pos.z, 1.4 * this.speedMul, dt);
        if (d < 4.5) {
          this.setState('chase');
          this.sound('whisper', player, 0.25);
        }
        if (d > 18) this.setState('wander');
        break;
      case 'chase':
        this.pathTo(player.pos.x, player.pos.z, 3.9 * this.speedMul, dt);
        if (d < 1.0 && !this.cooldown) this.setState('attack');
        if (d > 16) this.setState('stalk');
        break;
      case 'attack':
        this.moveToward(player.pos.x, player.pos.z, 1.5, dt);
        if (this.stateTime > 0.35 && !this.hit) {
          this.hit = true;
          if (d < 1.4) out.push({ type: 'attack', damage: this.variant === 'child' ? 14 : 18, cause: 'The faceling had no face, and no mercy.' });
          this.sound('thud', player, 0.3);
        }
        if (this.stateTime > 0.8) {
          this.hit = false;
          this.cooldown = 1.4;
          this.setState('chase');
        }
        break;
    }
  }

  animate(dt, player) {
    const s = this.preview || this.state;
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2.2);
    walk(rig, this.gait * Math.PI * 2, amt, { armSwing: s === 'chase' ? 0.3 : 0.8 });
    idle(rig, this.time, 1 - amt);
    if (s === 'chase' || s === 'attack') {
      reach(rig, s === 'attack' ? 1 : 0.6);
      rig.head.rotation.z = Math.sin(this.time * 7) * 0.15;
    }
    if (s === 'stalk' || s === 'detect') rig.head.rotation.z = 0.45 + Math.sin(this.time * 1.3) * 0.05;
    if ((s === 'watch' || s === 'stalk' || s === 'detect') && player) {
      lookAt(rig, this.root, new THREE.Vector3(player.pos.x, 1.6, player.pos.z));
      if (s !== 'watch') rig.head.rotation.z = 0.45;
    }
  }
}
