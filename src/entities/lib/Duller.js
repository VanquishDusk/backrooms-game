import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildHumanoid, resetPose, walk, idle, reach } from './rig.js';
import { dullGrey } from './textures.js';

// Duller: a washed-out grey figure with no clear features, as if someone
// had been photocopied too many times. When it holds still it fades into
// its surroundings. It never behaves the same way twice: it freezes,
// drifts, follows, flees, or suddenly charges. Its touch festers.
//
// States (switched at random intervals): freeze | drift | follow | charge
// | retreat, plus attack.

export class Duller extends Entity {
  build() {
    const grey = this.mat(0xffffff, { map: dullGrey(), transparent: true, opacity: 0.9, depthWrite: true });
    this.grey = grey;
    this.rig = buildHumanoid({
      mat: grey, legLen: 0.92, torsoLen: 0.58, armLen: 0.76, headR: 0.115, headLen: 0.27, limbR: 0.05, torsoR: 0.16,
    });
    this.root.add(this.rig.root);
    // A smudge where a face would be.
    const smudge = this.mesh(this.geo(new THREE.SphereGeometry(0.07, 10, 8)), this.mat(0x3a3a3a, { opacity: 0.35, depthWrite: false }), 0, this.rig.p.headLen * 0.5, 0.075);
    smudge.scale.set(1.3, 0.8, 0.4);
    this.rig.head.add(smudge);
    this.fade = 1;
    this.nextMood = 0;
    this.phaseOffset = this.rng.next() * 3;
  }

  pickMood(player) {
    const d = this.distTo(player);
    const r = this.rng.next();
    if (d < 9 && r < 0.25) return 'charge';
    if (r < 0.45) return 'freeze';
    if (r < 0.65) return 'follow';
    if (r < 0.8) return 'retreat';
    return 'drift';
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    this.nextMood -= dt;
    if (this.nextMood <= 0 && this.state !== 'attack') {
      this.nextMood = this.rng.range(2.5, 7);
      const m = this.pickMood(player);
      if (m === 'charge') {
        this.sound('groan', player, 0.35);
        out.push({ type: 'detect' });
      }
      this.setState(m);
    }
    switch (this.state) {
      case 'idle':
      case 'drift':
        this.setState('drift');
        this.wander(dt, 0.7);
        break;
      case 'freeze':
        // Perfectly still. It blends in.
        break;
      case 'follow':
        if (d > 4) this.pathTo(player.pos.x, player.pos.z, 1.3, dt);
        else this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 2);
        break;
      case 'retreat': {
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
        this.moveToward(this.pos.x + (ax / l) * 2, this.pos.z + (az / l) * 2, 1.6, dt);
        break;
      }
      case 'charge':
        this.pathTo(player.pos.x, player.pos.z, 3.6, dt);
        if (d < 1.0 && !this.cooldown) this.setState('attack');
        break;
      case 'attack':
        if (this.stateTime > 0.3 && !this.hit) {
          this.hit = true;
          if (d < 1.4) out.push({ type: 'attack', damage: 12, infect: 25, cause: "A Duller's touch festered." });
        }
        if (this.stateTime > 0.7) {
          this.hit = false;
          this.cooldown = 3;
          this.nextMood = 0;
          this.setState('retreat');
        }
        break;
    }
    if (this.rng.chance(dt * 0.04)) this.sound('groan', player, 0.15, 18);
  }

  animate(dt) {
    const s = this.preview || this.state;
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2.2);
    // Its limbs are never quite in step with each other.
    walk(rig, this.gait * Math.PI * 2, amt, { stride: 0.9 });
    rig.armL.shoulder.rotation.x += Math.sin(this.time * 0.7 + this.phaseOffset) * 0.2;
    rig.legR.hip.rotation.x += Math.sin(this.gait * 3.3) * 0.12 * amt;
    idle(rig, this.time, 1);
    rig.head.rotation.z = Math.sin(this.time * 0.37 + this.phaseOffset) * 0.35;
    if (s === 'charge' || s === 'attack') reach(rig, s === 'attack' ? 1 : 0.5);
    // Fading: nearly invisible while frozen, solid when moving.
    const target = s === 'freeze' || s === 'idle' ? 0.22 : s === 'charge' || s === 'attack' ? 1 : 0.7;
    this.fade += (target - this.fade) * Math.min(1, dt * 1.5);
    this.grey.opacity = this.fade * (0.9 + Math.random() * 0.1);
    // Its outline won't hold still.
    const j = 0.012 * (1.2 - this.fade);
    rig.root.position.set((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j);
    rig.root.scale.set(1 + (Math.random() - 0.5) * j, 1, 1 + (Math.random() - 0.5) * j);
  }
}
