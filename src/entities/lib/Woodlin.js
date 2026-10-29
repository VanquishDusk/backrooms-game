import * as THREE from 'three';
import { Entity } from './Entity.js';
import { buildHumanoid, resetPose, walk, reach } from './rig.js';
import { woodSkin } from './textures.js';

// Woodlin: a small, jointed figure of dark lacquered wood, like an artist's
// mannequin left behind in a hotel corridor. A blank oval face with two
// knot-holes for eyes and ball joints at every limb. It is furniture while
// you watch it. Look away and it moves, in clicks and clatters.
//
// States: still (watched) -> creep (unwatched) -> lunge -> attack -> scatter

export class Woodlin extends Entity {
  build() {
    this.radius = 0.25;
    const wood = this.mat(0xffffff, { map: woodSkin() });
    const dark = this.mat(0x1a0e06);
    this.rig = buildHumanoid({
      mat: wood, legLen: 0.55, torsoLen: 0.4, armLen: 0.55, headR: 0.09, headLen: 0.2,
      limbR: 0.03, torsoR: 0.11, shoulder: 0.14, hipW: 0.07, neckLen: 0.07,
    });
    this.root.add(this.rig.root);
    const rig = this.rig;
    // Ball joints, mannequin-style.
    const ball = (parent, r = 0.04) => parent.add(this.mesh(this.geo(new THREE.SphereGeometry(r, 10, 8)), wood));
    for (const a of [rig.armL, rig.armR]) {
      ball(a.shoulder);
      ball(a.elbow, 0.033);
    }
    for (const l of [rig.legL, rig.legR]) {
      ball(l.hip, 0.045);
      ball(l.knee, 0.038);
    }
    ball(rig.neck, 0.035);
    // Knot-hole eyes, set deep.
    for (const s of [-1, 1]) rig.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.02, 8, 6)), dark, s * 0.035, 0.11, 0.08));
    // A pale glint in the holes when it's close and hunting.
    this.glint = this.mat(0xffe8b0, { emissive: true, transparent: true, opacity: 0 });
    for (const s of [-1, 1]) rig.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.008, 6, 4)), this.glint, s * 0.035, 0.11, 0.095));
    this.frozenPose = null;
    this.gaitScale = 5;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const watched = this.seenBy(player, 0.55, 26) && (player.flashlight || this.lightAt(this.pos.x, this.pos.z) > 0.08 || d < 4);
    if (watched) {
      // Furniture. Utterly still, whatever pose it was caught in.
      if (this.state !== 'still') this.sound('creak', player, 0.18, 14);
      this.setState('still');
      return;
    }
    switch (this.state) {
      case 'idle':
      case 'still':
      case 'creep':
        this.setState('creep');
        if (d < 26) this.pathTo(player.pos.x, player.pos.z, 3.2, dt);
        else this.wander(dt, 1.2);
        if (this.rng.chance(dt * 1.5)) this.sound('tink', player, 0.08, 14);
        if (d < 1.6 && !this.cooldown) this.setState('lunge');
        break;
      case 'lunge':
        this.moveToward(player.pos.x, player.pos.z, 4.5, dt, 12);
        if (d < 0.75) {
          this.setState('attack');
          out.push({ type: 'attack', damage: 14, sanity: 6, cause: 'Splinters. Little wooden hands. You never saw it move.' });
          this.sound('crack', player, 0.4, 14);
        } else if (this.stateTime > 1) this.setState('creep');
        break;
      case 'attack':
        if (this.stateTime > 0.5) {
          this.cooldown = 3;
          this.setState('creep');
        }
        break;
    }
  }

  animate(dt) {
    const s = this.preview || this.state;
    const rig = this.rig;
    this.glint.opacity = s === 'lunge' || s === 'attack' || s === 'detect' ? 1 : 0;
    if (s === 'still' || s === 'idle') {
      // Hold whatever pose it had; in the viewer, a mannequin's stiff stand.
      if (this.preview) {
        resetPose(rig);
        rig.head.rotation.z = 0.35;
        rig.armR.shoulder.rotation.z = 0.5;
      }
      return;
    }
    resetPose(rig);
    const amt = Math.min(1, this.moveSpeed / 2);
    // Snapping, stop-motion movement: the pose updates in steps.
    const phase = Math.floor(this.gait * 3) / 3;
    walk(rig, phase * Math.PI * 2, s === 'move' ? 1 : amt, { stride: 1.3, armSwing: 1.2 });
    rig.spine.rotation.x = 0.35;
    rig.head.rotation.x = -0.3;
    rig.head.rotation.z = Math.sin(Math.floor(this.time * 6)) * 0.3;
    if (s === 'lunge' || s === 'attack' || s === 'detect') {
      reach(rig, 1);
      rig.spine.rotation.x = 0.6;
    }
  }
}
