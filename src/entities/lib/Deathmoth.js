import * as THREE from 'three';
import { Entity } from './Entity.js';
import { mothFur, mothWing } from './textures.js';

// Deathmoth: a moth the size of a dog. Fuzzy, dark body; broad, dusty wings
// with a staring eyespot on each; feathered antennae; too many legs.
// They circle light fixtures and are drawn to a flashlight.
//
// opts.variant: 'drone' (passive, flees if crowded) | 'soldier' (attacks)
// States: seek (find a light) -> orbit -> drawn (to your flashlight)
//         -> dive (soldier attack) -> climb; flee (drone)

export class Deathmoth extends Entity {
  build() {
    this.variant = this.opts.variant || 'drone';
    const soldier = this.variant === 'soldier';
    this.size = soldier ? 1.25 : 0.95;
    this.radius = 0.2;
    const fur = this.mat(0xffffff, { map: mothFur() });
    const leg = this.mat(0x1a120c);
    const eye = this.mat(soldier ? 0x6a1010 : 0x1a1410);
    const body = new THREE.Group();
    body.scale.setScalar(this.size);
    this.body = body;
    this.root.add(body);
    const abdomen = this.mesh(this.geo(new THREE.SphereGeometry(0.12, 14, 10)), fur, 0, 0, -0.17);
    abdomen.scale.set(0.85, 0.8, 1.7);
    const thorax = this.mesh(this.geo(new THREE.SphereGeometry(0.11, 14, 10)), fur, 0, 0.01, 0.04);
    thorax.scale.set(1, 0.95, 1.1);
    const head = this.mesh(this.geo(new THREE.SphereGeometry(0.07, 12, 8)), fur, 0, 0, 0.17);
    body.add(abdomen, thorax, head);
    // Abdomen segments.
    for (let i = 0; i < 4; i++) {
      const ring = this.mesh(this.geo(new THREE.TorusGeometry(0.1 - i * 0.012, 0.012, 5, 12)), leg, 0, 0, -0.1 - i * 0.07);
      body.add(ring);
    }
    for (const s of [-1, 1]) body.add(this.mesh(this.geo(new THREE.SphereGeometry(0.035, 8, 6)), eye, s * 0.05, 0.02, 0.21));
    // Feathered antennae.
    this.antennae = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(s * 0.03, 0.05, 0.2);
      a.rotation.set(-0.9, 0, s * 0.45);
      const stalk = this.mesh(this.geo(new THREE.CylinderGeometry(0.004, 0.006, 0.22, 4)), leg, 0, 0.11, 0);
      a.add(stalk);
      for (let k = 0; k < 8; k++) {
        const barb = this.mesh(this.geo(new THREE.BoxGeometry(0.06 - k * 0.005, 0.003, 0.003)), leg, 0, 0.03 + k * 0.024, 0);
        a.add(barb);
      }
      body.add(a);
      this.antennae.push(a);
    }
    // Six legs.
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const l = this.mesh(this.geo(new THREE.CylinderGeometry(0.006, 0.008, 0.2, 4)), leg, s * 0.09, -0.08, 0.08 - i * 0.07);
        l.rotation.set(0.3, 0, s * 0.9);
        body.add(l);
      }
    }
    // Wings: fore and hind on each side, hinged at the thorax.
    const wingMat = this.mat(0xffffff, { map: mothWing(), alphaTest: 0.4, side: THREE.DoubleSide });
    this.wings = [];
    const wing = (side, fore) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.07, 0.06, fore ? 0.06 : -0.04);
      const w = fore ? 0.62 : 0.46, h = fore ? 0.44 : 0.38;
      const g = this.geo(new THREE.PlaneGeometry(w, h));
      g.translate(w / 2, 0, 0);
      g.rotateX(-Math.PI / 2);
      const m = this.mesh(g, wingMat);
      m.scale.x = side;
      m.rotation.y = fore ? side * -0.25 : side * 0.35;
      pivot.add(m);
      body.add(pivot);
      this.wings.push({ pivot, side, fore });
    };
    wing(-1, true);
    wing(1, true);
    wing(-1, false);
    wing(1, false);
    this.pos.y = 2;
    this.orbitA = this.rng.next() * Math.PI * 2;
    this.target = null;
    this.flapRate = 13;
    this.nextBuzz = this.rng.range(0, 1.5);
  }

  nearestLight(maxD = 16) {
    let best = null, bd = maxD;
    for (const [i, d] of this.world.lightsNear(this.pos.x, this.pos.z, maxD)) {
      const l = this.world.lights[i];
      if (l.state === 'off' || l.layer) continue;
      if (d < bd && this.lineOfSight(l.x, l.z)) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  fly(tx, ty, tz, speed, dt) {
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (dx / d) * step;
    this.pos.y += (dy / d) * step;
    this.pos.z += (dz / d) * step;
    this.world.collide(this.pos, this.radius);
    this.pos.y = Math.max(0.4, Math.min(this.top() - 0.25, this.pos.y));
    this.turnTo(Math.atan2(this.pos.x - ox, this.pos.z - oz) || this.heading, dt, 5);
    this.moveSpeed = step / dt;
  }

  // Ceiling height here (levels with ceilings of different heights).
  top(x = this.pos.x, z = this.pos.z) {
    return this.world.ceilingHeight ? this.world.ceilingHeight(x, z) : this.map.height;
  }

  // Is the player's flashlight a brighter lure than the ceiling lights?
  lured(player) {
    if (!player.flashlight) return false;
    const d = this.distTo(player);
    return d < 11 && this.lineOfSight(player.pos.x, player.pos.z);
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const soldier = this.variant === 'soldier';
    const wobble = (k) => Math.sin(this.time * (2.3 + k) + k * 7) * 0.35;
    this.nextBuzz -= dt;
    if (this.nextBuzz <= 0) {
      this.nextBuzz = this.rng.range(0.7, 1.4);
      this.sound('chitter', player, soldier ? 0.3 : 0.2, 16);
    }
    switch (this.state) {
      case 'idle':
      case 'seek': {
        this.setState('seek');
        this.target = this.nearestLight();
        if (this.target) this.setState('orbit');
        else this.fly(this.pos.x + Math.sin(this.time * 0.7) * 2, 1.8 + wobble(1), this.pos.z + Math.cos(this.time * 0.6) * 2, 1.2, dt);
        break;
      }
      case 'orbit': {
        // Spiral around the fixture, bumping into it now and then.
        const l = this.target;
        this.orbitA += dt * (1.6 + Math.sin(this.time * 0.9) * 0.8);
        const r = 0.7 + Math.sin(this.time * 1.7) * 0.35;
        this.fly(l.x + Math.cos(this.orbitA) * r, Math.min((l.glowY ?? Infinity) + 0.1, this.top(l.x, l.z) - 0.55) + wobble(2) * 0.6, l.z + Math.sin(this.orbitA) * r, 2.6, dt);
        if (this.lured(player)) this.setState('drawn');
        if (soldier && d < 6.5 && !this.cooldown) this.setState('dive');
        if (!soldier && d < 1.6) this.setState('flee');
        if (this.stateTime > 8 && this.rng.chance(dt * 0.1)) this.setState('seek');
        break;
      }
      case 'drawn': {
        // Circling your head and your light.
        this.orbitA += dt * 2.2;
        const fx = player.pos.x - Math.sin(player.yaw) * 1.2, fz = player.pos.z - Math.cos(player.yaw) * 1.2;
        this.fly(fx + Math.cos(this.orbitA) * 0.6, 1.7 + wobble(3) * 0.5, fz + Math.sin(this.orbitA) * 0.6, 3.2, dt);
        if (!this.lured(player)) this.setState('seek');
        if (soldier && !this.cooldown && this.stateTime > 1) this.setState('dive');
        if (!soldier && d < 0.9 && !this.cooldown) {
          out.push({ type: 'attack', damage: 2, sanity: 4, cause: 'Smothered by dusty wings.' });
          this.cooldown = 2;
        }
        break;
      }
      case 'dive':
        if (this.stateTime < 0.05) this.sound('hiss', player, 0.35, 16);
        this.fly(player.pos.x, 1.55, player.pos.z, 7, dt);
        if (d < 0.7) {
          out.push({ type: 'attack', damage: 9, sanity: 6, cause: 'The Deathmoths swarmed you.' });
          this.cooldown = 5;
          this.setState('climb');
        } else if (this.stateTime > 2) this.setState('climb');
        break;
      case 'climb':
        this.fly(this.pos.x - Math.sin(this.heading) * 3, this.top() - 0.4, this.pos.z - Math.cos(this.heading) * 3, 4, dt);
        if (this.stateTime > 1.2) this.setState(this.lured(player) ? 'drawn' : 'seek');
        break;
      case 'flee': {
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
        this.fly(this.pos.x + (ax / l) * 3, this.top() - 0.4, this.pos.z + (az / l) * 3, 3.5, dt);
        if (this.stateTime > 2) this.setState('seek');
        break;
      }
    }
  }

  animate(dt) {
    const s = this.preview || this.state;
    if (this.preview) this.pos.y = 1.6 + Math.sin(this.time * 2) * 0.08;
    const fast = s === 'dive' || s === 'attack' || s === 'flee' || s === 'climb';
    const rate = fast ? 22 : this.flapRate;
    const flap = Math.sin(this.time * rate);
    for (const w of this.wings) {
      // Wings sweep up and down around the body's long axis.
      const lag = w.fore ? 0 : 0.5;
      w.pivot.rotation.z = w.side * (0.15 + Math.sin(this.time * rate - lag) * (fast ? 1.0 : 0.85));
    }
    this.body.position.y = -flap * 0.03;
    this.body.rotation.x = s === 'dive' || s === 'attack' ? 0.6 : -0.15 + Math.sin(this.time * 1.3) * 0.08;
    this.body.rotation.z = Math.sin(this.time * 2.1) * 0.15;
    for (const [i, a] of this.antennae.entries()) a.rotation.y = Math.sin(this.time * 4 + i) * 0.15;
  }
}
