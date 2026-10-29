import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildHumanoid, resetPose, walk, reach } from './rig.js';
import { flesh } from './textures.js';

// Wretch: what's left of a person who stayed too long. Skinless red flesh,
// hunched almost double, ribs showing, one arm far longer than the other,
// head hanging off to one side. It moves in jerks and spasms. Leave it
// alone and it shambles about; get close or shine a light in its face and
// it comes at you in an erratic zig-zag.
//
// States: shamble -> agitated -> charge -> attack -> (calm down)

export class Wretch extends Entity {
  build() {
    const meat = this.mat(0xffffff, { map: flesh('red') });
    const bone = this.mat(0xd8c8b0);
    this.rig = buildHumanoid({
      mat: meat, legLen: 0.82, torsoLen: 0.6, armLen: 0.82, headR: 0.1, headLen: 0.24, limbR: 0.045,
      torsoR: 0.15, torsoDepth: 0.55, hipW: 0.11, handLen: 0.2,
    });
    this.root.add(this.rig.root);
    const rig = this.rig;
    // Irregular proportions: a long left arm and a withered right one.
    rig.armL.shoulder.scale.y = 1.25;
    rig.armR.shoulder.scale.y = 0.72;
    rig.legL.hip.scale.y = 0.95;
    // Ribs and a knotted spine.
    for (let i = 0; i < 5; i++) {
      const rib = this.mesh(this.geo(new THREE.TorusGeometry(0.15, 0.012, 5, 14, Math.PI)), bone, 0, 0.2 + i * 0.07, 0);
      rib.rotation.y = Math.PI / 2;
      rib.scale.z = 0.6;
      rig.spine.add(rib);
    }
    for (let i = 0; i < 7; i++) rig.spine.add(this.mesh(this.geo(new THREE.SphereGeometry(0.03, 6, 5)), bone, 0, 0.05 + i * 0.08, -0.09));
    // Exposed teeth in a lipless mouth.
    const jaw = this.mesh(this.geo(new THREE.BoxGeometry(0.11, 0.03, 0.04)), bone, 0, 0.06, 0.095);
    rig.head.add(jaw);
    for (const s of [-1, 1]) rig.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.022, 8, 6)), this.mat(0x0a0404), s * 0.04, 0.14, 0.09));
    this.jerk = 0;
    this.nextJerk = 0;
    this.zig = 0;
    this.agitation = 0;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    // Light in its eyes riles it up.
    const lit = player.flashlight && this.seenBy(player, 0.92, 12);
    if (d < 5 || lit) this.agitation += dt;
    else this.agitation = Math.max(0, this.agitation - dt * 0.4);

    // Spasms: sudden stops and darts.
    this.nextJerk -= dt;
    if (this.nextJerk <= 0) {
      this.nextJerk = this.rng.range(0.25, 1.4);
      this.jerk = this.rng.range(-1, 1);
    }
    const jerkySpeed = (base) => base * (0.25 + 1.6 * Math.abs(Math.sin(this.time * 3.7 + this.jerk * 5)));

    switch (this.state) {
      case 'idle':
      case 'shamble':
        this.setState('shamble');
        if (this.rng.chance(dt * 0.3)) this.pauseUntil = this.time + this.rng.range(0.5, 2.5);
        if (!(this.pauseUntil > this.time)) this.wander(dt, jerkySpeed(0.7));
        if (this.rng.chance(dt * 0.06)) this.sound('groan', player, 0.25);
        if (this.agitation > 0.6) {
          this.setState('agitated');
          this.sound('gurgle', player, 0.4);
          out.push({ type: 'detect' });
        }
        break;
      case 'agitated':
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) + this.jerk * 0.5, dt, 8);
        if (this.stateTime > 1.6) {
          this.setState('charge');
          this.sound('groan', player, 0.5);
        }
        if (this.agitation < 0.1) this.setState('shamble');
        break;
      case 'charge': {
        // Zig-zag: aim off to one side, then the other.
        this.zig += dt;
        const side = Math.sin(this.zig * 2.6 + this.jerk) * 1.6;
        const ax = player.pos.x - this.pos.x, az = player.pos.z - this.pos.z, l = Math.hypot(ax, az) || 1;
        const tx = player.pos.x + (-az / l) * side * Math.min(1, d / 4);
        const tz = player.pos.z + (ax / l) * side * Math.min(1, d / 4);
        if (this.lineOfSight(tx, tz)) this.moveToward(tx, tz, jerkySpeed(3.4), dt, 9);
        else this.pathTo(player.pos.x, player.pos.z, jerkySpeed(3.4), dt);
        if (d < 1.1 && !this.cooldown) this.setState('attack');
        if (d > 18 || this.stateTime > 14) {
          this.agitation = 0;
          this.setState('shamble');
        }
        break;
      }
      case 'attack':
        if (this.stateTime > 0.25 && !this.hit) {
          this.hit = true;
          if (d < 1.5) out.push({ type: 'attack', damage: 20, sanity: 5, cause: 'The Wretch dragged you down with it.' });
          this.sound('gurgle', player, 0.5);
        }
        if (this.stateTime > 0.7) {
          this.hit = false;
          this.cooldown = 1.3;
          this.setState('charge');
        }
        break;
    }
  }

  animate(dt) {
    const s = this.preview || this.state;
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2.4);
    walk(rig, this.gait * Math.PI * 2, amt, { stride: 0.8, armSwing: 0.3 });
    // Hunched almost double, head hanging to one side.
    rig.spine.rotation.x = 0.75 + Math.sin(this.time * 1.1) * 0.05;
    rig.neck.rotation.x = -0.55;
    rig.head.rotation.z = 0.6 + Math.sin(this.time * 0.8) * 0.1;
    rig.hips.position.y -= 0.12;
    rig.legL.knee.rotation.x += 0.35;
    rig.legR.knee.rotation.x += 0.35;
    rig.legL.hip.rotation.x -= 0.25;
    rig.legR.hip.rotation.x -= 0.25;
    // The long arm drags; the short one is clutched to the chest.
    rig.armL.shoulder.rotation.x = -0.6 + Math.sin(this.gait * 3) * 0.2 * amt;
    rig.armR.shoulder.rotation.x = -1.2;
    rig.armR.elbow.rotation.x = -1.6;
    // Spasms.
    const spasm = Math.sin(this.time * 23 + this.jerk * 9) > 0.93 ? 1 : 0;
    rig.head.rotation.y = this.jerk * 0.6 * spasm + Math.sin(this.time * 0.6) * 0.2;
    rig.spine.rotation.z = spasm * this.jerk * 0.25;
    if (s === 'agitated' || s === 'detect') {
      rig.head.rotation.y = Math.sin(this.time * 31) * 0.3;
      rig.spine.rotation.z = Math.sin(this.time * 19) * 0.12;
      rig.armL.shoulder.rotation.z = -0.4 + Math.sin(this.time * 17) * 0.2;
    }
    if (s === 'charge' || s === 'attack') {
      rig.spine.rotation.x = 0.55;
      reach(rig, s === 'attack' ? 1 : 0.5);
      rig.spine.rotation.x += 0.4;
      rig.armR.shoulder.rotation.x = -1.1;
    }
  }
}
