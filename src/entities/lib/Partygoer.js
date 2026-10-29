import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildHumanoid, resetPose, walk, reach } from './rig.js';
import { partyYellow, partyFace } from './textures.js';

// Partygoer: smooth, featureless yellow figures with a face like a drawn-on
// =). They're thrilled to see you. They wave, they dance, they toot a
// party horn, they want you to come to the party. Don't.
//
// States: party (dancing) -> greet (approach, waving) -> invite (dance at
// arm's length) -> reveal (the smile tears wider) -> chase -> attack

export class Partygoer extends Entity {
  build() {
    const yellow = this.mat(0xffffff, { map: partyYellow() });
    this.rig = buildHumanoid({
      mat: yellow, legLen: 0.86, torsoLen: 0.56, armLen: 0.74, headR: 0.17, headLen: 0.36,
      limbR: 0.065, torsoR: 0.19, torsoDepth: 0.8, handLen: 0.12, neckLen: 0.06,
    });
    this.root.add(this.rig.root);
    this.faceHappy = new THREE.MeshBasicMaterial({ map: partyFace(false), transparent: true, depthWrite: false });
    this.faceAngry = new THREE.MeshBasicMaterial({ map: partyFace(true), transparent: true, depthWrite: false });
    this.mats.push(this.faceHappy, this.faceAngry);
    this.lit.push({ mat: this.faceHappy, base: new THREE.Color(1, 1, 1) }, { mat: this.faceAngry, base: new THREE.Color(1, 1, 1) });
    // The face wraps a little around the round head.
    const fg = this.geo(new THREE.SphereGeometry(0.178, 20, 14, -0.75, 1.5, 0.75, 1.5));
    this.face = this.mesh(fg, this.faceHappy, 0, this.rig.p.headLen / 2, 0);
    // Local x is the outward axis before the turn; the head is 1.05 deep.
    this.face.scale.set(1.08, this.rig.p.headLen / 0.34, 1);
    this.face.rotation.y = Math.PI / 2;
    this.rig.head.add(this.face);
    // Party hat, striped.
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#d02a6a' : '#2a8ad0';
      ctx.fillRect(0, i * 8, 64, 8);
    }
    this.hatTex = new THREE.CanvasTexture(c);
    const hat = this.mesh(this.geo(new THREE.ConeGeometry(0.1, 0.28, 14)), this.mat(0xffffff, { map: this.hatTex }), 0.03, this.rig.p.headLen + 0.1, 0);
    hat.rotation.z = -0.25;
    this.rig.head.add(hat);
    this.angry = false;
    this.nextToot = 1;
  }

  setAngry(on) {
    this.angry = on;
    this.face.material = on ? this.faceAngry : this.faceHappy;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const looking = this.seenBy(player, 0.5, 30);
    this.nextToot -= dt;
    switch (this.state) {
      case 'idle':
      case 'party':
        this.setState('party');
        // Always on the lookout for guests: anyone in sight nearby will do.
        if (this.canSee(player, 14, 1.8) || (d < 8 && this.lineOfSight(player.pos.x, player.pos.z))) this.setState('greet');
        break;
      case 'greet':
        if (d > 2.6) this.pathTo(player.pos.x, player.pos.z, 1.7, dt);
        else this.setState('invite');
        if (this.nextToot <= 0) {
          this.nextToot = this.rng.range(1.5, 3);
          this.sound(this.rng.chance(0.5) ? 'partyHorn' : 'giggle', player, 0.3);
        }
        if (d > 20) this.setState('party');
        break;
      case 'invite':
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 4);
        if (d > 3.5) this.pathTo(player.pos.x, player.pos.z, 1.7, dt);
        if (this.nextToot <= 0) {
          this.nextToot = this.rng.range(1.2, 2.5);
          this.sound('giggle', player, 0.3);
        }
        // Step too close, turn away, or keep it waiting.
        if (d < 1.6 || (!looking && this.stateTime > 1.5) || this.stateTime > 7) {
          this.setState('reveal');
          this.setAngry(true);
          this.sound('giggle', player, 0.5, 26, true);
          out.push({ type: 'detect' });
        }
        break;
      case 'reveal':
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 10);
        if (this.stateTime > 0.6) this.setState('chase');
        break;
      case 'chase':
        this.pathTo(player.pos.x, player.pos.z, 4.7, dt);
        if (this.nextToot <= 0) {
          this.nextToot = this.rng.range(1, 2);
          this.sound('giggle', player, 0.35, 24, true);
        }
        if (d < 1.1 && !this.cooldown) this.setState('attack');
        break;
      case 'attack':
        this.moveToward(player.pos.x, player.pos.z, 2, dt);
        if (this.stateTime > 0.3 && !this.hit) {
          this.hit = true;
          if (d < 1.5) out.push({ type: 'attack', damage: 25, sanity: 8, cause: 'You joined the party. =)' });
        }
        if (this.stateTime > 0.7) {
          this.hit = false;
          this.cooldown = 1.4;
          this.setState('chase');
        }
        break;
    }
  }

  animate(dt) {
    const s = this.preview || this.state;
    if (this.preview) this.setAngry(s === 'attack' || s === 'detect');
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2.4);
    walk(rig, this.gait * Math.PI * 2, amt, { stride: 0.9 });
    // A bouncy little step even when walking.
    rig.hips.position.y += Math.abs(Math.sin(this.gait * Math.PI * 2)) * 0.05 * amt;
    const t = this.time;
    if (s === 'party' || s === 'idle' || s === 'invite') {
      // Dancing: bob, sway, arms up.
      rig.hips.position.y += Math.abs(Math.sin(t * 5)) * 0.06;
      rig.spine.rotation.z = Math.sin(t * 2.5) * 0.15;
      rig.head.rotation.z = Math.sin(t * 2.5 + 1) * 0.2;
      rig.armL.shoulder.rotation.z = -2.4 + Math.sin(t * 5) * 0.3;
      rig.armR.shoulder.rotation.z = 2.4 + Math.sin(t * 5 + 1) * 0.3;
    }
    if (s === 'greet' || s === 'move') {
      // Waving hello.
      rig.armR.shoulder.rotation.z = 2.7;
      rig.armR.elbow.rotation.z = 0.3 + Math.sin(t * 9) * 0.6;
      rig.head.rotation.z = Math.sin(t * 3) * 0.12;
    }
    if (s === 'reveal' || s === 'detect') {
      // The head tilts too far and stays there.
      rig.head.rotation.z = Math.min(1, this.stateTime * 2) * 0.7 + (this.preview ? 0.7 : 0);
      rig.armL.shoulder.rotation.z = -0.5;
      rig.armR.shoulder.rotation.z = 0.5;
    }
    if (s === 'chase' || s === 'attack') {
      reach(rig, s === 'attack' ? 1 : 0.7);
      rig.head.rotation.z = 0.6 + Math.sin(t * 11) * 0.1;
    }
  }

  dispose() {
    super.dispose();
    this.hatTex.dispose();
  }
}
