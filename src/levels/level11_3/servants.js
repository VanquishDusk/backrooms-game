import * as THREE from 'three';
import { Entity } from '../../entities/lib/Entity.js';
import { buildHumanoid, resetPose, walk, idle, reach, lookAt } from '../../entities/lib/rig.js';

// The Red Light District's people, who aren't.
//
// Servants (Entity 187) follow you in loose packs: they keep their distance,
// stop dead when you look at them, and spread out round you. Then, when
// there are enough of them, or you've let yourself get cornered, they all
// come at once. Out on the edge of the city they're ragged and clumsy; deeper
// in, clean, suited and quick.
//
// Ambassadors don't touch you. They talk, and the Servants listen.

const _v = new THREE.Vector3();

export class Servant extends Entity {
  build() {
    const clean = !!this.opts.clean;
    this.clean = clean;
    const r = this.rng;
    const suit = this.mat(clean ? 0x16161a : r.pick([0x3a3430, 0x2a2e30, 0x4a3e34]));
    const shirt = this.mat(clean ? 0xd8d4cc : 0x6a6458);
    const skin = this.mat(clean ? 0xd8c4b4 : 0x9a8a7a);
    const shoes = this.mat(0x0c0c0c);
    this.rig = buildHumanoid({
      mat: suit, torsoMat: suit, armMat: suit, forearmMat: suit, handMat: skin, headMat: skin, legMat: suit, footMat: shoes,
      legLen: 0.9, torsoLen: 0.58, armLen: 0.72, headR: 0.11, headLen: 0.25, shoulder: 0.21, hipW: 0.09, torsoR: 0.17, limbR: 0.05,
    });
    this.root.add(this.rig.root);
    // A white shirt front and tie on the clean ones; red eyes on all of them.
    if (clean) {
      const front = this.mesh(this.geo(new THREE.BoxGeometry(0.12, 0.3, 0.02)), shirt, 0, this.rig.p.torsoLen * 0.6, 0.16);
      this.rig.spine.add(front);
      const tie = this.mesh(this.geo(new THREE.BoxGeometry(0.035, 0.26, 0.025)), this.mat(0x7a0a10), 0, this.rig.p.torsoLen * 0.58, 0.172);
      this.rig.spine.add(tie);
    }
    const eye = this.mat(0xff1a1a, { emissive: true });
    for (const ex of [-0.04, 0.04]) {
      const e = this.mesh(this.geo(new THREE.SphereGeometry(0.014, 6, 4)), eye, ex, this.rig.p.headLen * 0.6, 0.1);
      this.rig.head.add(e);
    }
    this.radius = 0.32;
    this.slot = this.opts.slot ?? r.range(0, Math.PI * 2);
    this.keep = r.range(11, 18);
    this.state = 'stalk';
    this.stareT = 0;
    this.lurch = clean ? 0 : r.range(0.4, 1);
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const pack = this.opts.pack;
    const faceP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const watched = this.seenBy(player, 0.93, 28);
    const sp = this.clean ? 1 : 0.8;
    // Guards keep to their post until you come close.
    const g = this.opts.guard;
    if (g && this.state === 'stalk' && d > 42 && !pack?.close) {
      if (Math.hypot(g.x - this.pos.x, g.z - this.pos.z) > 2) this.pathTo(g.x, g.z, 1.2, dt);
      else this.turnTo(faceP, dt, 1);
      return;
    }
    switch (this.state) {
      case 'stalk': {
        if (pack?.close && d < 45) {
          this.setState('rush');
          break;
        }
        // Stop dead when looked at.
        if (watched && d > 4) {
          this.moveSpeed = 0;
          this.turnTo(faceP, dt, 3);
          this.stareT += dt;
          if (this.stareT > 6 && pack) pack.close = true;
          break;
        }
        this.stareT = Math.max(0, this.stareT - dt * 0.5);
        // Hold a place in the ring round you.
        const a = this.slot + (pack?.spin || 0);
        const tx = player.pos.x + Math.sin(a) * this.keep, tz = player.pos.z + Math.cos(a) * this.keep;
        const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        if (far > 1.5) this.pathTo(tx, tz, (d > 30 ? 3.2 : 1.7) * sp, dt);
        else this.turnTo(faceP, dt, 2);
        if (d < 3.5) this.setState('rush');
        break;
      }
      case 'rush':
        this.pathTo(player.pos.x, player.pos.z, (this.clean ? 4.6 : 3.7) * (1 - this.lurch * 0.15 * Math.abs(Math.sin(this.time * 3))), dt);
        if (d < 1.15 && !this.cooldown) this.setState('attack');
        if (d > 60) {
          this.setState('stalk');
          if (pack) pack.close = false;
        }
        break;
      case 'attack':
        this.moveToward(player.pos.x, player.pos.z, 1.5, dt);
        if (this.stateTime > 0.3 && !this.hit) {
          this.hit = true;
          if (d < 1.5) out.push({ type: 'attack', damage: this.clean ? 20 : 15, sanity: 6, cause: this.clean ? 'The Servants closed in, neat and silent, and took you to Mother.' : 'The Servants caught you in the red light.' });
          this.sound('thud', player, 0.3);
        }
        if (this.stateTime > 0.7) {
          this.hit = false;
          this.cooldown = 1.3;
          this.setState('rush');
        }
        break;
    }
  }

  animate(dt, player) {
    const s = this.preview || this.state;
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2.4);
    walk(rig, this.gait * Math.PI * 2, amt, { armSwing: this.clean ? 0.25 : 0.7 });
    idle(rig, this.time, 1 - amt);
    if (!this.clean) {
      rig.spine.rotation.x = 0.25 + this.lurch * 0.15;
      rig.head.rotation.z = Math.sin(this.time * 1.7) * 0.25 * this.lurch;
    }
    if (s === 'rush' || s === 'attack') reach(rig, s === 'attack' ? 1 : 0.5);
    if (player && (s === 'stalk' || s === 'rush')) lookAt(rig, this.root, _v.set(player.pos.x, 1.6, player.pos.z));
  }
}

const LINES = [
  'You look tired. Mother has a place for you.',
  'Why go back to the cold? It\'s warm here. Stay.',
  'Yusuf stayed. Yusuf is very happy now.',
  'The Cataclysm is coming. Wouldn\'t you rather be inside when it does?',
  'The bridges only go back to where you were lost. Here, you are found.',
  'Take off that mask. Breathe. Doesn\'t it feel better?',
  'We have been expecting you. Come to the Embassy.',
];

export class Ambassador extends Entity {
  build() {
    const coat = this.mat(0x1a0608);
    const face = this.mat(0xf0e8e0, { emissive: true });
    const r = this.rng;
    this.rig = buildHumanoid({
      mat: coat, torsoMat: coat, armMat: coat, forearmMat: coat, handMat: this.mat(0xe8dcd0), headMat: face, legMat: coat, footMat: this.mat(0x080808),
      legLen: 1.15, torsoLen: 0.72, armLen: 0.95, headR: 0.12, headLen: 0.3, shoulder: 0.22, hipW: 0.1, torsoR: 0.16, limbR: 0.05,
    });
    this.root.add(this.rig.root);
    // A long coat to the knees, and a hat.
    const skirt = this.mesh(this.geo(new THREE.CylinderGeometry(0.2, 0.34, 0.8, 10, 1, true)), coat, 0, 0.75, 0);
    this.root.add(skirt);
    const hat = this.mesh(this.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 10)), coat, 0, this.rig.p.headLen + 0.1, 0);
    const brim = this.mesh(this.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12)), coat, 0, this.rig.p.headLen - 0.02, 0);
    this.rig.head.add(hat, brim);
    this.radius = 0.4;
    this.state = 'idle';
    this.nextLine = 2;
    this.line = r.int(0, LINES.length - 1);
    this.home = [this.pos.x, this.pos.z];
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 1.2);
    if (d < 26 && this.lineOfSight(player.pos.x, player.pos.z)) {
      this.setState('speak');
      // It walks towards you, slowly, never hurrying.
      if (d > 3) this.pathTo(player.pos.x, player.pos.z, 0.8, dt);
      this.nextLine -= dt;
      if (this.nextLine <= 0) {
        this.nextLine = 7;
        out.push({ type: 'speak', text: `A tall figure in a long coat, its face a smooth white plate: "${LINES[this.line % LINES.length]}"` });
        this.line++;
        this.sound('whisper', player, 0.35, 30);
      }
    } else {
      this.setState('idle');
      if (Math.hypot(this.home[0] - this.pos.x, this.home[1] - this.pos.z) > 4) this.pathTo(this.home[0], this.home[1], 0.7, dt);
    }
  }

  animate(dt, player) {
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 1.5);
    walk(rig, this.gait * Math.PI * 2, amt, { armSwing: 0.1, stride: 0.8 });
    idle(rig, this.time, 1 - amt);
    if (this.state === 'speak') {
      rig.armR.shoulder.rotation.x = -0.9 + Math.sin(this.time * 0.8) * 0.1;
      rig.armR.elbow.rotation.x = -0.6;
      if (player) lookAt(rig, this.root, _v.set(player.pos.x, 1.6, player.pos.z));
    }
  }
}
