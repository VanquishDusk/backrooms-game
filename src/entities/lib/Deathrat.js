import * as THREE from 'three';
import { Entity } from './Entity.js';
import { ratFur } from './textures.js';

// Deathrat: a rat that has adapted to the Backrooms. It looks like where it
// lives: grey-brown in the halls, pale and eyeless in the dark levels,
// rust-coloured in the industrial ones. It forages for abandoned food and
// spilled liquid, flees from light and attention, and bites if cornered or
// ignored too close.
//
// opts.variant: 'grey' | 'pale' (dark levels: eyeless) | 'rust'
// States: forage -> flee | bite

export class Deathrat extends Entity {
  build() {
    this.variant = this.opts.variant || 'grey';
    this.radius = 0.12;
    const fur = this.mat(0xffffff, { map: ratFur(this.variant) });
    const pink = this.mat(0xc88a84);
    this.body = new THREE.Group();
    this.root.add(this.body);
    const torso = this.mesh(this.geo(new THREE.SphereGeometry(0.1, 12, 9)), fur, 0, 0.1, 0);
    torso.scale.set(0.85, 0.75, 1.8);
    this.body.add(torso);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.11, 0.18);
    this.body.add(this.head);
    const skull = this.mesh(this.geo(new THREE.ConeGeometry(0.06, 0.16, 10)), fur, 0, 0, 0.05);
    skull.rotation.x = Math.PI / 2;
    this.head.add(skull);
    this.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.012, 6, 4)), pink, 0, 0, 0.13));
    for (const s of [-1, 1]) {
      const ear = this.mesh(this.geo(new THREE.SphereGeometry(0.03, 8, 6)), pink, s * 0.04, 0.04, -0.02);
      ear.scale.set(1, 1, 0.3);
      this.head.add(ear);
      if (this.variant !== 'pale') this.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.01, 6, 4)), this.mat(0x050000), s * 0.03, 0.02, 0.06));
    }
    // Yellow teeth.
    this.head.add(this.mesh(this.geo(new THREE.BoxGeometry(0.012, 0.018, 0.006)), this.mat(0xc8b060), 0, -0.02, 0.125));
    // Tail: a chain of segments that swishes.
    this.tail = [];
    let parent = this.body;
    for (let k = 0; k < 6; k++) {
      const g = new THREE.Group();
      if (k === 0) g.position.set(0, 0.08, -0.17);
      else g.position.z = -0.05;
      const geo = this.geo(new THREE.CylinderGeometry(0.008 - k * 0.001, 0.009 - k * 0.001, 0.05, 4));
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, -0.025);
      g.add(this.mesh(geo, pink));
      parent.add(g);
      parent = g;
      this.tail.push(g);
    }
    this.feet = [];
    for (const [x, z] of [[-0.05, 0.1], [0.05, 0.1], [-0.06, -0.08], [0.06, -0.08]]) {
      const f = this.mesh(this.geo(new THREE.SphereGeometry(0.02, 6, 4)), pink, x, 0.02, z);
      this.body.add(f);
      this.feet.push(f);
    }
    this.gaitScale = 14;
    this.nextSqueak = this.rng.range(1, 5);
    this.pause = 0;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    this.nextSqueak -= dt;
    if (this.nextSqueak <= 0) {
      this.nextSqueak = this.rng.range(2, 7);
      this.sound('squeak', player, 0.18, 12);
    }
    const lit = player.flashlight && this.seenBy(player, 0.85, 10);
    switch (this.state) {
      case 'idle':
      case 'forage':
        this.setState('forage');
        // Dart, stop and sniff, dart.
        this.pause -= dt;
        if (this.pause <= 0) {
          if (this.wander(dt, 1.8)) this.pause = this.rng.range(0.4, 2);
        }
        if (lit || (d < 3 && this.seenBy(player, 0.6, 6))) this.setState('flee');
        else if (d < 0.9 && !this.cooldown) this.setState('bite');
        break;
      case 'flee': {
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
        const ox = this.pos.x, oz = this.pos.z;
        this.moveToward(this.pos.x + (ax / l) * 2, this.pos.z + (az / l) * 2, 3.5, dt, 14);
        // Cornered: it turns and bites.
        if (Math.hypot(this.pos.x - ox, this.pos.z - oz) < 3.5 * dt * 0.2 && d < 1.2 && !this.cooldown) this.setState('bite');
        if (this.stateTime > 2.5 && d > 5) this.setState('forage');
        break;
      }
      case 'bite':
        this.moveToward(player.pos.x, player.pos.z, 3, dt, 14);
        if (d < 0.5) {
          out.push({ type: 'attack', damage: 5, sanity: 2, cause: 'Deathrats. Dozens of them, in the end.' });
          this.sound('squeak', player, 0.4, 10);
          this.cooldown = 3;
          this.setState('flee');
        } else if (this.stateTime > 1.2) this.setState('flee');
        break;
    }
  }

  animate() {
    const s = this.preview || this.state;
    const amt = s === 'move' ? 1 : Math.min(1, this.moveSpeed / 2);
    const ph = this.gait * Math.PI * 2;
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.02 * amt;
    this.feet.forEach((f, i) => (f.position.y = 0.02 + Math.max(0, Math.sin(ph + i * 1.6)) * 0.025 * amt));
    // Sniffing: head bobs and twitches.
    this.head.rotation.x = amt < 0.2 ? Math.sin(this.time * 18) * 0.08 - 0.15 : 0;
    this.head.rotation.y = amt < 0.2 ? Math.sin(this.time * 2.3) * 0.4 : 0;
    if (s === 'bite' || s === 'attack' || s === 'detect') {
      this.body.rotation.x = -0.35;
      this.head.rotation.x = -0.3 + Math.sin(this.time * 25) * 0.15;
    } else this.body.rotation.x = 0;
    this.tail.forEach((t, k) => (t.rotation.y = Math.sin(this.time * (amt > 0.2 ? 9 : 3) - k * 0.6) * 0.3));
  }
}
