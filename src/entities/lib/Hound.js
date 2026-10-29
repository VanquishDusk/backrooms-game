import * as THREE from 'three';
import { Entity } from './Entity.js';
import { houndSkin } from './textures.js';

// Hound: a hairless, emaciated human body forced onto all fours. Human
// hands for front paws, knees bent the wrong way, a stretched jaw full of
// teeth and pits for eyes.
//
// Hunts by sound: sprinting carries far. Sprints in bursts when it sees
// you. Lore says staring one down while standing still makes it hesitate.
// States: prowl -> track (heard you) -> chase (sees you) -> attack -> recover;
//         hesitate (stared down).

export class Hound extends Entity {
  build() {
    this.radius = 0.38;
    this.gaitScale = 2.4;
    const skin = this.mat(0xffffff, { map: houndSkin() });
    const dark = this.mat(0x1a1210);
    const teeth = this.mat(0xd8cdb8);
    const body = new THREE.Group();
    body.position.y = 0.74;
    this.body = body;
    this.root.add(body);
    // Ribcage and gut: an emaciated torso, ribs showing.
    const torso = this.mesh(this.geo(new THREE.CapsuleGeometry(0.21, 0.72, 6, 14)), skin);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1.05, 1, 0.85);
    body.add(torso);
    // Hunched human shoulders and shoulder blades.
    const shoulders = this.mesh(this.geo(new THREE.SphereGeometry(0.26, 14, 10)), skin, 0, 0.04, 0.32);
    shoulders.scale.set(1.15, 0.85, 0.9);
    body.add(shoulders);
    for (const s of [-1, 1]) {
      const blade = this.mesh(this.geo(new THREE.BoxGeometry(0.13, 0.03, 0.17)), skin, s * 0.11, 0.23, 0.26);
      blade.rotation.z = s * 0.35;
      body.add(blade);
    }
    // Sunken hips.
    body.add(this.mesh(this.geo(new THREE.SphereGeometry(0.19, 12, 9)), skin, 0, 0, -0.42));
    for (let i = 0; i < 6; i++) {
      const rib = this.mesh(this.geo(new THREE.TorusGeometry(0.215, 0.014, 5, 14, Math.PI)), skin, 0, 0, 0.14 - i * 0.07);
      rib.rotation.z = Math.PI;
      body.add(rib);
    }
    // Spine ridge.
    for (let i = 0; i < 10; i++) body.add(this.mesh(this.geo(new THREE.SphereGeometry(0.035, 6, 5)), skin, 0, 0.2 - Math.abs(i - 3) * 0.006, 0.44 - i * 0.1));
    // Neck and the long, human-ish head.
    const neck = new THREE.Group();
    neck.position.set(0, 0.1, 0.5);
    body.add(neck);
    const neckM = this.mesh(this.geo(new THREE.CylinderGeometry(0.06, 0.08, 0.32, 8)), skin, 0, 0.08, 0.1);
    neckM.rotation.x = 1.1;
    neck.add(neckM);
    const head = new THREE.Group();
    head.position.set(0, 0.16, 0.26);
    neck.add(head);
    // A bald, human skull pulled into a muzzle.
    const skull = this.mesh(this.geo(new THREE.SphereGeometry(0.15, 16, 12)), skin, 0, 0.02, -0.02);
    skull.scale.set(1, 0.95, 1.05);
    head.add(skull);
    const muzzle = this.mesh(this.geo(new THREE.CylinderGeometry(0.075, 0.11, 0.22, 10)), skin, 0, -0.02, 0.15);
    muzzle.rotation.x = Math.PI / 2;
    head.add(muzzle);
    // Small, human ears.
    for (const s of [-1, 1]) {
      const ear = this.mesh(this.geo(new THREE.SphereGeometry(0.035, 8, 6)), skin, s * 0.145, 0.01, -0.03);
      ear.scale.set(0.4, 1, 0.8);
      head.add(ear);
    }
    // Eye pits.
    for (const s of [-1, 1]) head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.032, 8, 6)), dark, s * 0.065, 0.06, 0.11));
    // Jaw that hinges open, lined with teeth.
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.07, 0.06);
    head.add(jaw);
    const jawM = this.mesh(this.geo(new THREE.BoxGeometry(0.14, 0.04, 0.22)), skin, 0, -0.02, 0.1);
    jaw.add(jawM);
    for (let i = 0; i < 7; i++) {
      const tth = this.mesh(this.geo(new THREE.ConeGeometry(0.009, 0.04, 4)), teeth, -0.055 + i * 0.018, 0.01, 0.19);
      jaw.add(tth);
      const up = this.mesh(this.geo(new THREE.ConeGeometry(0.009, 0.04, 4)), teeth, -0.055 + i * 0.018, -0.08, 0.24);
      up.rotation.x = Math.PI;
      head.add(up);
    }
    this.head = head;
    this.jaw = jaw;
    this.neck = neck;
    // Legs: human arms in front (hands flat), human legs behind (bent back).
    this.legs = [];
    const limb = (x, z, front) => {
      const hip = new THREE.Group();
      hip.position.set(x, -0.02, z);
      body.add(hip);
      const upperLen = front ? 0.42 : 0.4, lowerLen = front ? 0.42 : 0.45;
      const u = this.mesh(this.geo(new THREE.CylinderGeometry(0.05, front ? 0.075 : 0.085, upperLen, 8)), skin, 0, -upperLen / 2, 0);
      hip.add(u);
      const knee = new THREE.Group();
      knee.position.y = -upperLen;
      hip.add(knee);
      knee.add(this.mesh(this.geo(new THREE.CylinderGeometry(0.035, 0.05, lowerLen, 8)), skin, 0, -lowerLen / 2, 0));
      const paw = this.mesh(this.geo(new THREE.BoxGeometry(front ? 0.09 : 0.08, 0.03, front ? 0.16 : 0.2)), skin, 0, -lowerLen, front ? 0.05 : 0.07);
      knee.add(paw);
      if (front) {
        // Long fingers.
        for (let f = 0; f < 4; f++) knee.add(this.mesh(this.geo(new THREE.BoxGeometry(0.012, 0.012, 0.09)), skin, -0.03 + f * 0.02, -lowerLen, 0.16));
      }
      this.legs.push({ hip, knee, front, rest: front ? [0.25, -0.5] : [-0.6, 0.95] });
    };
    limb(-0.2, 0.36, true);
    limb(0.2, 0.36, true);
    limb(-0.15, -0.42, false);
    limb(0.15, -0.42, false);
    this.stamina = 4;
    this.lastHeard = null;
    this.lostTime = 0;
    this.stareTime = 0;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const sees = this.canSee(player, 16, 1.3);
    const hears = this.hears(player);
    if (hears || sees) {
      this.lastHeard = [player.pos.x, player.pos.z];
      this.lostTime = 0;
    } else {
      this.lostTime += dt;
    }
    // Being stared down while standing still unnerves it.
    const staredAt = this.seenBy(player, 0.85, 10) && player.speed < 0.3;
    this.stareTime = staredAt ? this.stareTime + dt : Math.max(0, this.stareTime - dt);
    this.stamina = Math.min(4, this.stamina + dt * (this.state === 'chase' ? 0 : 0.6));

    switch (this.state) {
      case 'idle':
      case 'prowl':
        this.setState('prowl');
        this.wander(dt, 1.1);
        if (Math.random() < dt * 0.02) this.sound('howl', player, 0.25, 45);
        if (sees) {
          this.setState('chase');
          this.sound('growl', player, 0.5);
          out.push({ type: 'detect' });
        } else if (hears) {
          this.setState('track');
          this.sound('growl', player, 0.35);
        }
        break;
      case 'track':
        if (this.lastHeard) this.pathTo(this.lastHeard[0], this.lastHeard[1], 2.6, dt);
        if (sees) {
          this.setState('chase');
          out.push({ type: 'detect' });
        } else if (this.lostTime > 8) this.setState('prowl');
        break;
      case 'chase': {
        if (this.stareTime > 1.5 && d > 2.5) {
          this.setState('hesitate');
          this.sound('growl', player, 0.3);
          break;
        }
        const sprint = this.stamina > 0.2;
        if (sprint) this.stamina -= dt;
        this.pathTo(player.pos.x, player.pos.z, sprint ? 5.0 : 3.1, dt);
        if (d < 1.25 && !this.cooldown) this.setState('attack');
        if (this.lostTime > 6) this.setState('track');
        break;
      }
      case 'attack':
        this.moveToward(player.pos.x, player.pos.z, 3, dt, 10);
        if (this.stateTime > 0.3 && !this.bit) {
          this.bit = true;
          this.sound('snarl', player, 0.6);
          if (d < 1.6) out.push({ type: 'attack', damage: 22, cause: 'Torn apart by a Hound.' });
        }
        if (this.stateTime > 0.6) {
          this.bit = false;
          this.cooldown = 1.6;
          this.setState('recover');
        }
        break;
      case 'recover': {
        // Circle back out before going in again.
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
        this.moveToward(this.pos.x + (ax / l) * 2 + az / l, this.pos.z + (az / l) * 2 - ax / l, 3, dt);
        if (this.stateTime > 1.4) this.setState('chase');
        break;
      }
      case 'hesitate': {
        // Lower, back away, growl. Then try again.
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 4);
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
        const h = this.heading;
        this.pos.x += (ax / l) * 0.7 * dt;
        this.pos.z += (az / l) * 0.7 * dt;
        this.world.collide(this.pos, this.radius);
        this.heading = h;
        this.moveSpeed = 0.7;
        if (this.stareTime < 0.2 || this.stateTime > 5) this.setState('chase');
        break;
      }
    }
    // Paws on concrete.
    if (this.moveSpeed > 0.5 && Math.floor(this.gait * 2) !== this.lastStep) {
      this.lastStep = Math.floor(this.gait * 2);
      this.sound('pad', player, this.moveSpeed > 3 ? 0.35 : 0.2, 22);
    }
  }

  animate(dt, player) {
    const s = this.preview || this.state;
    const g = this.gait;
    const amt = Math.min(1, this.moveSpeed / 3);
    const run = this.moveSpeed > 3.5;
    this.legs.forEach((l, i) => {
      // Diagonal pairs move together; a gallop when running.
      const ph = g * Math.PI * 2 + (run ? (l.front ? 0 : Math.PI * 0.6) + (i % 2) * 0.3 : (i === 0 || i === 3 ? 0 : Math.PI));
      l.hip.rotation.x = l.rest[0] + Math.sin(ph) * 0.65 * amt;
      l.knee.rotation.x = l.rest[1] + (l.front ? -1 : 1) * Math.max(0, Math.cos(ph)) * 0.6 * amt;
    });
    this.body.position.y = 0.74 + Math.abs(Math.sin(g * Math.PI * 2)) * 0.05 * amt + (s === 'hesitate' ? -0.12 : 0);
    this.body.rotation.x = run ? Math.sin(g * Math.PI * 2) * 0.08 : 0;
    // Head: sniffing low while prowling, up when tracking, snapping when attacking.
    let headX = 0.1, jaw = 0.05;
    if (s === 'prowl' || s === 'idle') headX = 0.35 + Math.sin(this.time * 2.3) * 0.15;
    if (s === 'track' || s === 'detect') headX = -0.15 + Math.sin(this.time * 9) * 0.05;
    if (s === 'chase' || s === 'move') jaw = 0.25;
    if (s === 'hesitate') {
      headX = 0.25;
      jaw = 0.35 + Math.sin(this.time * 20) * 0.05;
    }
    if (s === 'attack') {
      const k = this.preview ? (Math.sin(this.time * 6) * 0.5 + 0.5) : Math.min(1, this.stateTime / 0.3);
      headX = -0.3 * k;
      jaw = 0.8 * k;
      this.neck.position.z = 0.5 + 0.15 * k;
    } else this.neck.position.z = 0.5;
    this.head.rotation.x = headX;
    this.head.rotation.z = Math.sin(this.time * 1.7) * 0.12;
    this.jaw.rotation.x = jaw;
  }
}
