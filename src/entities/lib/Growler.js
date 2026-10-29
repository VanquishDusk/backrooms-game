import * as THREE from 'three';
import { Entity } from './Entity.js';
import { cableSkin } from './textures.js';

// Growler: a hulking body made of cables, twisted and bundled like muscle,
// loose ends fizzing. Enormously strong and not at all clever: it charges
// at noise in a straight line, slams into walls, forgets why, and growls.
//
// States: roam -> listen -> charge (straight line) -> attack | stunned

export class Growler extends Entity {
  build() {
    this.radius = 0.42;
    const cable = this.mat(0xffffff, { map: cableSkin() });
    const copper = this.mat(0xb06a30);
    this.eyes = this.mat(0xff2010, { emissive: true });
    // Bundles: a cylinder made of many twisted cables.
    const bundle = (parent, len, r, n, twist = 0.6) => {
      const g = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6, aa = a + t * twist * Math.PI;
          pts.push(new THREE.Vector3(Math.cos(aa) * r, -t * len, Math.sin(aa) * r));
        }
        const geo = this.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r * 0.38, 5));
        g.add(this.mesh(geo, cable));
      }
      parent.add(g);
      return g;
    };
    const j = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    this.hips = j(this.root, 0, 0.95, 0);
    this.spine = j(this.hips, 0, 0, 0);
    // Torso: wide, hunched, grown out of the hips.
    const torso = bundle(this.spine, 0.8, 0.2, 10, 0.8);
    torso.rotation.x = Math.PI;
    torso.scale.set(1.5, 1, 1.1);
    this.chest = j(this.spine, 0, 0.8, 0);
    // Head: a knot of cable, two red pinpricks.
    this.head = j(this.chest, 0, 0.08, 0.15);
    const knot = this.mesh(this.geo(new THREE.TorusKnotGeometry(0.11, 0.045, 40, 6, 2, 3)), cable, 0, 0.08, 0);
    this.head.add(knot);
    for (const s of [-1, 1]) this.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.018, 6, 4)), this.eyes, s * 0.05, 0.1, 0.13));
    // Long, heavy arms hanging to the knees.
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = j(this.chest, s * 0.38, -0.05, 0);
      bundle(sh, 0.5, 0.075, 6, 1);
      const el = j(sh, 0, -0.5, 0);
      bundle(el, 0.55, 0.085, 7, 1.2);
      const fist = j(el, 0, -0.6, 0);
      fist.add(this.mesh(this.geo(new THREE.SphereGeometry(0.13, 10, 8)), cable));
      // Bare copper ends sprouting from the knuckles.
      for (let k = 0; k < 4; k++) fist.add(this.mesh(this.geo(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4)), copper, (k - 1.5) * 0.04, -0.12, 0.05));
      this.arms.push({ sh, el, s });
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = j(this.hips, s * 0.18, 0, 0);
      bundle(hip, 0.48, 0.08, 6, 0.8);
      const kn = j(hip, 0, -0.48, 0);
      bundle(kn, 0.47, 0.07, 6, 0.8);
      this.legs.push({ hip, kn, s });
    }
    // Loose cables trailing from its back.
    this.tails = [];
    for (let i = 0; i < 4; i++) {
      const t = j(this.chest, (i - 1.5) * 0.12, -0.1, -0.2);
      bundle(t, 0.6 + i * 0.1, 0.02, 1, 0);
      t.rotation.x = -2.4;
      this.tails.push(t);
    }
    this.gaitScale = 2.4;
    this.chargeDir = null;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    if (this.rng.chance(dt * 0.25)) this.sound('arc', player, 0.12, 14);
    switch (this.state) {
      case 'idle':
      case 'roam':
        this.setState('roam');
        this.wander(dt, 0.7);
        if (this.rng.chance(dt * 0.15)) this.sound('growl', player, 0.3, 20);
        if (this.hears(player) || this.canSee(player, 12, 1.2)) {
          this.setState('listen');
          this.sound('growl', player, 0.5, 24);
          out.push({ type: 'detect' });
        }
        break;
      case 'listen':
        // Slow to understand. Turns toward where the noise was, then goes.
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 2);
        if (this.stateTime > 1.1) {
          this.setState('charge');
          this.chargeDir = this.heading;
        }
        break;
      case 'charge': {
        // A straight line. No pathfinding; walls are your friend.
        const ox = this.pos.x, oz = this.pos.z;
        this.moveToward(this.pos.x + Math.sin(this.chargeDir) * 3, this.pos.z + Math.cos(this.chargeDir) * 3, 5.2, dt, 0.5);
        const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        if (d < 1.3 && !this.cooldown) {
          this.setState('attack');
          this.sound('snarl', player, 0.6, 20);
        } else if (moved < 5.2 * dt * 0.3 && this.stateTime > 0.3) {
          // Hit a wall.
          this.setState('stunned');
          this.sound('thud', player, 0.6, 22);
          this.sound('clank', player, 0.4, 22);
        } else if (this.stateTime > 3) this.setState('roam');
        break;
      }
      case 'attack':
        if (this.stateTime > 0.35 && !this.hit) {
          this.hit = true;
          if (d < 1.6) out.push({ type: 'attack', damage: 38, sanity: 6, cause: 'A Growler hit you. Just once was enough.' });
        }
        if (this.stateTime > 0.9) {
          this.hit = false;
          this.cooldown = 2;
          this.setState('listen');
        }
        break;
      case 'stunned':
        if (this.stateTime > 2.2) this.setState('roam');
        break;
    }
  }

  animate() {
    const s = this.preview || this.state;
    const amt = s === 'move' ? 1 : Math.min(1, this.moveSpeed / 3);
    const ph = this.gait * Math.PI * 2;
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(ph + (l.s > 0 ? Math.PI : 0)) * 0.6 * amt;
      l.kn.rotation.x = Math.max(0, -Math.sin(ph + (l.s > 0 ? Math.PI : 0))) * 0.8 * amt;
    }
    this.hips.position.y = 0.95 - Math.abs(Math.sin(ph)) * 0.06 * amt;
    this.spine.rotation.x = 0.45 + (s === 'charge' ? 0.3 : 0);
    this.head.rotation.x = -0.5;
    const swing = Math.sin(ph) * 0.5 * amt;
    for (const a of this.arms) {
      a.sh.rotation.x = a.s * swing + 0.2;
      a.sh.rotation.z = a.s * 0.15;
      a.el.rotation.x = -0.3;
      if (s === 'attack' || s === 'detect') {
        const k = this.preview ? (Math.sin(this.time * 4) + 1) / 2 : Math.min(1, this.stateTime / 0.35);
        a.sh.rotation.x = -2.6 + k * 3;
        a.el.rotation.x = -0.4;
      }
      if (s === 'stunned') a.sh.rotation.x = 0.1 + Math.sin(this.time * 9) * 0.1;
    }
    this.head.rotation.z = s === 'stunned' ? Math.sin(this.time * 7) * 0.4 : s === 'listen' ? Math.sin(this.time * 2) * 0.3 : 0;
    this.tails.forEach((t, i) => (t.rotation.z = Math.sin(this.time * 2 + i) * 0.2));
    this.eyes.color.setRGB(1, 0.1 + Math.random() * 0.1, 0.05);
  }
}
