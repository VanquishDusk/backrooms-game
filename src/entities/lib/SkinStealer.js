import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildHumanoid, resetPose, walk, idle, reach, lookAt } from './rig.js';
import { fabric, skinTone, paleSkin, stolenFace } from './textures.js';

// Skin-Stealer: wears a person. At a distance it passes for a lost
// wanderer: ordinary clothes, a face, a wave, a call for help. Up close
// the proportions are slightly wrong. Then the skin comes off: a pale,
// gaunt thing, far too tall, limbs too long, eyes black, mouth torn wide.
//
// States: mimic -> approach -> (lure) -> reveal -> hunt -> attack

export class SkinStealer extends Entity {
  build() {
    const r = this.rng;
    this.skinDisguise = this.mat(0xffffff, { map: skinTone(r.pick(['#d8b49a', '#c49a7a', '#9a6e50'])) });
    this.clothes = this.mat(0xffffff, { map: fabric(r.pick(['#5a6a4a', '#7a4a3a', '#4a5a7a', '#8a8070'])) });
    this.pants = this.mat(0xffffff, { map: fabric('#3a3a40') });
    this.pale = this.mat(0xc9c5bd, { map: paleSkin() });
    this.rig = buildHumanoid({
      mat: this.clothes, torsoMat: this.clothes, armMat: this.clothes, forearmMat: this.skinDisguise,
      handMat: this.skinDisguise, headMat: this.skinDisguise, legMat: this.pants, footMat: this.mat(0x221c18),
      legLen: 0.92, torsoLen: 0.58, armLen: 0.8, headR: 0.11, headLen: 0.26, limbR: 0.048, torsoR: 0.16,
    });
    this.root.add(this.rig.root);
    // A face painted on the head: almost right.
    this.faceNormal = new THREE.MeshBasicMaterial({ map: stolenFace(false), transparent: true, depthWrite: false });
    this.faceReveal = new THREE.MeshBasicMaterial({ map: stolenFace(true), transparent: true, depthWrite: false });
    this.mats.push(this.faceNormal, this.faceReveal);
    this.lit.push({ mat: this.faceNormal, base: new THREE.Color(1, 1, 1) }, { mat: this.faceReveal, base: new THREE.Color(1, 1, 1) });
    this.face = this.mesh(this.geo(new THREE.PlaneGeometry(0.2, 0.2)), this.faceNormal, 0, this.rig.p.headLen * 0.48, 0.112);
    this.rig.head.add(this.face);
    this.hair = this.mesh(this.geo(new THREE.SphereGeometry(0.117, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), this.mat(0x2a1e14), 0, this.rig.p.headLen * 0.58, -0.01);
    this.rig.head.add(this.hair);
    this.revealed = 0; // 0..1 transformation progress
    this.awayTime = 0;
    this.nextCall = 2;
  }

  // Blend the body from disguise to true form.
  setReveal(k) {
    this.revealed = k;
    const rig = this.rig;
    const swap = k > 0.5;
    const skin = swap ? this.pale : this.skinDisguise;
    rig.headMesh.material = skin;
    rig.neck.children[0].material = skin;
    for (const a of [rig.armL, rig.armR]) {
      a.hand.children[0].material = skin;
      a.elbow.children[0].material = swap ? this.pale : this.skinDisguise;
      a.shoulder.children[0].material = swap ? this.pale : this.clothes;
      a.shoulder.scale.y = 1 + 0.45 * k;
    }
    rig.torsoMesh.material = swap ? this.pale : this.clothes;
    rig.torsoMesh.scale.x = 1 - 0.3 * k;
    for (const l of [rig.legL, rig.legR]) l.hip.children[0].material = l.knee.children[0].material = swap ? this.pale : this.pants;
    rig.neck.scale.y = 1 + 1.3 * k;
    rig.root.scale.y = 1 + 0.15 * k;
    this.face.material = swap ? this.faceReveal : this.faceNormal;
    this.face.scale.setScalar(1 + 0.2 * k);
    this.hair.visible = k < 0.6;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const looking = this.seenBy(player, 0.5, 30);
    this.awayTime = !looking && d < 9 ? this.awayTime + dt : 0;
    switch (this.state) {
      case 'idle':
      case 'mimic':
        this.setState('mimic');
        this.wander(dt, 0.8);
        if (this.canSee(player, 16, 1.6)) this.setState('approach');
        break;
      case 'approach':
        // A lost wanderer, glad to see someone.
        if (d > 3.2) this.pathTo(player.pos.x, player.pos.z, 1.25, dt);
        else this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 3);
        this.nextCall -= dt;
        if (this.nextCall <= 0) {
          this.nextCall = this.rng.range(3, 6);
          this.sound('voice', player, 0.3, 26);
        }
        // Get too close, turn your back, or wait too long.
        if (d < 2.2 || this.awayTime > 2.5 || this.stateTime > 25) {
          this.setState('reveal');
          this.sound('shriek', player, 0.6, 30);
          out.push({ type: 'detect' });
        }
        if (d > 22) this.setState('mimic');
        break;
      case 'reveal':
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 6);
        this.setReveal(Math.min(1, this.stateTime / 1.1));
        if (this.stateTime > 1.2) this.setState('hunt');
        break;
      case 'hunt':
        this.pathTo(player.pos.x, player.pos.z, 4.5, dt);
        if (d < 1.15 && !this.cooldown) this.setState('attack');
        break;
      case 'attack':
        this.moveToward(player.pos.x, player.pos.z, 2, dt);
        if (this.stateTime > 0.3 && !this.hit) {
          this.hit = true;
          if (d < 1.5) out.push({ type: 'attack', damage: 30, sanity: 10, cause: 'It was wearing someone you thought you knew.' });
          this.sound('snarl', player, 0.5);
        }
        if (this.stateTime > 0.75) {
          this.hit = false;
          this.cooldown = 1.5;
          this.setState('hunt');
        }
        break;
    }
  }

  animate(dt, player) {
    const s = this.preview || this.state;
    if (this.preview) this.setReveal(s === 'attack' || s === 'detect' ? 1 : 0);
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2.5);
    const k = this.revealed;
    walk(rig, this.gait * Math.PI * 2, amt, { stride: 1 + k * 0.4, armSwing: k > 0.5 ? 0.2 : 0.8 });
    idle(rig, this.time, 1 - amt);
    if (k < 0.5) {
      // The tell: every so often the head snaps at an angle a neck shouldn't allow.
      const tw = (this.time % 7) < 0.25 ? 1 : 0;
      rig.head.rotation.z += tw * 0.9;
      if ((s === 'approach' || s === 'move') && player) {
        // Waving.
        rig.armR.shoulder.rotation.z = 2.6;
        rig.armR.elbow.rotation.z = 0.4 + Math.sin(this.time * 7) * 0.5;
        lookAt(rig, this.root, new THREE.Vector3(player.pos.x, 1.6, player.pos.z));
      }
    } else {
      // True form: hunched forward, arms hanging past the knees, head cocked.
      rig.spine.rotation.x = 0.35 * k;
      rig.head.rotation.z = 0.5 * k + Math.sin(this.time * 13) * 0.06;
      rig.head.rotation.x = -0.35 * k;
      for (const a of [rig.armL, rig.armR]) a.elbow.rotation.x -= 0.2;
      if (s === 'attack') reach(rig, 1);
      if (s === 'reveal') {
        // Convulsing as it splits open.
        rig.spine.rotation.z = Math.sin(this.time * 30) * 0.15;
        rig.armL.shoulder.rotation.z = -1.2;
        rig.armR.shoulder.rotation.z = 1.2;
      }
    }
  }
}
