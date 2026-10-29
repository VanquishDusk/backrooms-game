import * as THREE from 'three';
import { Entity } from '../../entities/lib/Entity.js';
import { buildHumanoid, resetPose, walk, idle, reach } from '../../entities/lib/rig.js';
import { partyYellow, partyFace } from '../../entities/lib/textures.js';

// The host. Whoever throws the party at the end of the Backrooms: very tall,
// a black suit, white gloves, a smooth yellow head with the Partygoers'
// grin pulled too wide. It never runs. It doesn't need to.
//
// Modes:
//   watch  stands at the end of an aisle, looking at you; gone if you come
//          close or stare too long
//   hunt   walks after you, always, wherever you go
// Emits { type: 'caught' } and { type: 'vanish' } for the level to handle.

export class Host extends Entity {
  build() {
    const suit = this.mat(0x16161a);
    const shirt = this.mat(0xe8e8e4);
    const glove = this.mat(0xf4f4f0);
    const head = this.mat(0xffffff, { map: partyYellow() });
    this.rig = buildHumanoid({
      mat: suit, torsoMat: suit, headMat: head, handMat: glove, legLen: 1.08, torsoLen: 0.68, armLen: 0.92,
      headR: 0.17, headLen: 0.4, limbR: 0.06, torsoR: 0.21, torsoDepth: 0.7, handLen: 0.16, neckLen: 0.1, shoulder: 0.25,
    });
    this.root.add(this.rig.root);
    // A white shirt front and a black tie.
    const front = this.mesh(this.geo(new THREE.PlaneGeometry(0.16, 0.5)), shirt, 0, this.rig.p.torsoLen * 0.55, 0.148);
    const tie = this.mesh(this.geo(new THREE.PlaneGeometry(0.05, 0.4)), suit, 0, this.rig.p.torsoLen * 0.55, 0.15);
    this.rig.chest.parent.add(front, tie);
    front.position.y = this.rig.p.torsoLen * 0.55;
    tie.position.y = this.rig.p.torsoLen * 0.55;
    this.faceMat = new THREE.MeshBasicMaterial({ map: partyFace(true), transparent: true, depthWrite: false });
    this.mats.push(this.faceMat);
    this.lit.push({ mat: this.faceMat, base: new THREE.Color(1, 1, 1) });
    const fg = this.geo(new THREE.SphereGeometry(0.178, 20, 14, -0.85, 1.7, 0.6, 1.7));
    const face = this.mesh(fg, this.faceMat, 0, this.rig.p.headLen / 2, 0);
    face.scale.set(1.08, this.rig.p.headLen / 0.3, 1);
    face.rotation.y = Math.PI / 2;
    this.rig.head.add(face);
    // A tall black party hat with a gold band.
    const hat = this.mesh(this.geo(new THREE.ConeGeometry(0.11, 0.42, 14)), this.mat(0x0c0c0c), 0, this.rig.p.headLen + 0.18, 0);
    const band = this.mesh(this.geo(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 14)), this.mat(0xc8a040), 0, this.rig.p.headLen + 0.02, 0);
    this.rig.head.add(hat, band);
    this.radius = 0.38;
    this.mode = this.opts.mode || 'watch';
    this.speed = this.opts.speed || 2.0;
    this.nextStep = 0;
    this.nextLaugh = 4;
    this.stared = 0;
    this.gaitScale = 2.2;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 2);
    if (this.mode === 'watch') {
      const looked = this.seenBy(player, 0.85, 45) && this.lineOfSight(player.pos.x, player.pos.z);
      this.stared = looked ? this.stared + dt : Math.max(0, this.stared - dt * 0.5);
      if (d < 10 || this.stared > 2.2 || this.stateTime > 25) out.push({ type: 'vanish' });
      return;
    }
    // Hunting: a steady walk, never a run.
    this.pathTo(player.pos.x, player.pos.z, this.speed, dt);
    this.nextStep -= dt;
    if (this.moveSpeed > 0.3 && this.nextStep <= 0) {
      this.nextStep = 0.72;
      // Heavy, even footsteps.
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
      const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / Math.max(d, 1);
      if (d < 30) this.ctx.audio.step?.(false, 0.9 * (1 - d / 30), Math.max(-1, Math.min(1, pan)));
    }
    this.nextLaugh -= dt;
    if (this.nextLaugh <= 0) {
      this.nextLaugh = this.rng.range(6, 12);
      this.sound('giggle', player, 0.35, 30, true);
    }
    if (d < 1.15 && this.cooldown <= 0) {
      this.cooldown = 3;
      out.push({ type: 'caught' });
    }
  }

  animate(dt) {
    const rig = this.rig;
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 1.8);
    walk(rig, this.gait * Math.PI * 2, amt, { stride: 0.7, armSwing: 0.2 });
    idle(rig, this.time, 1);
    // Arms held slightly out, as if to welcome you.
    rig.armL.shoulder.rotation.z = -0.35;
    rig.armR.shoulder.rotation.z = 0.35;
    if (this.mode === 'hunt' && this.state !== 'idle') reach(rig, 0.35);
    rig.head.rotation.z = Math.sin(this.time * 0.7) * 0.18;
  }
}

// Someone else, lost here too. You can't quite perceive them: they're only
// there at the edge of your attention, and gone when you come close.
export class Ghost extends Entity {
  build() {
    this.coat = this.mat(0x4a4e58, { transparent: true, opacity: 0.5 });
    this.skin = this.mat(0xb8a898, { transparent: true, opacity: 0.5 });
    this.rig = buildHumanoid({ mat: this.coat, headMat: this.skin, handMat: this.skin, legLen: 0.9, torsoLen: 0.56 });
    this.root.add(this.rig.root);
    for (const m of [this.coat, this.skin]) m.depthWrite = false;
    this.pose = this.rng.pick(['stand', 'stand', 'browse', 'lost']);
    this.heading = this.opts.heading ?? this.rng.range(0, Math.PI * 2);
  }

  think(dt, player) {
    const d = this.distTo(player);
    // Fully there at a distance, nothing up close.
    const a = Math.max(0, Math.min(1, (d - 3) / 9)) * 0.55;
    this.coat.opacity = this.skin.opacity = a;
    this.root.visible = a > 0.02;
    if (d < 9 && this.rng.chance(dt * 0.05)) this.sound('whisper', player, 0.12, 14);
  }

  animate() {
    const rig = this.rig;
    resetPose(rig);
    idle(rig, this.time, 1);
    if (this.pose === 'browse') {
      rig.armR.shoulder.rotation.x = -1.1;
      rig.head.rotation.x = 0.25;
    } else if (this.pose === 'lost') {
      rig.head.rotation.x = 0.45;
      rig.spine.rotation.x = 0.12;
    }
  }
}
