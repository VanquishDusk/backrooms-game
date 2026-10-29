import * as THREE from 'three';
import { Entity } from './Entity.js';
import { scleraSkin, flesh } from './textures.js';

// Watcher (Entity 96): a giant floating eyeball trailing optic nerves.
// It glides in silence, scanning. When it fixes on you its pupil swells and
// glows, and it fires a beam that turns anything caught in it to grey dust.
// Break line of sight before the beam fires.
//
// States: drift -> fix (track you) -> charge -> fire -> cooldown

export class Watcher extends Entity {
  build() {
    this.radius = 0.75;
    this.size = 0.85;
    this.eye = new THREE.Group();
    this.eye.position.y = 1.85;
    this.root.add(this.eye);
    const sclera = this.mat(0xffffff, { map: scleraSkin() });
    this.eye.add(this.mesh(this.geo(new THREE.SphereGeometry(this.size, 24, 18)), sclera));
    // Iris and pupil on the front (+z).
    const iris = this.mesh(this.geo(new THREE.SphereGeometry(this.size * 0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), this.mat(0x6a7a3a), 0, 0, this.size * 0.82);
    iris.rotation.x = Math.PI / 2;
    iris.scale.y = 0.3;
    this.eye.add(iris);
    this.pupilMat = this.mat(0x050505, { emissive: true });
    this.pupil = this.mesh(this.geo(new THREE.CircleGeometry(this.size * 0.18, 20)), this.pupilMat, 0, 0, this.size * 0.96);
    this.eye.add(this.pupil);
    // Optic nerves and veins trailing behind, swaying.
    const nerve = this.mat(0xffffff, { map: flesh('red') });
    this.nerves = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const chain = [];
      let parent = this.eye;
      const segs = 5;
      for (let k = 0; k < segs; k++) {
        const len = 0.38 - k * 0.04, r = 0.065 - k * 0.01;
        const g = this.geo(new THREE.CylinderGeometry(r * 0.8, r, len, 6));
        g.translate(0, -len / 2, 0);
        const j = new THREE.Group();
        if (k === 0) {
          j.position.set(Math.cos(a) * this.size * 0.35, Math.sin(a) * this.size * 0.35, -this.size * 0.85);
          j.rotation.set(-1.2 - Math.sin(a) * 0.4, 0, Math.cos(a) * 0.5);
        } else {
          j.position.y = -(0.38 - (k - 1) * 0.04);
        }
        j.add(this.mesh(g, nerve));
        parent.add(j);
        parent = j;
        chain.push(j);
      }
      this.nerves.push({ chain, phase: this.rng.next() * 6 });
    }
    // The beam.
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffe0e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mats.push(this.beamMat);
    const bg = this.geo(new THREE.CylinderGeometry(0.06, 0.12, 1, 10, 1, true));
    bg.translate(0, 0.5, 0);
    bg.rotateX(Math.PI / 2);
    this.beam = this.mesh(bg, this.beamMat, 0, 0, this.size * 0.9);
    this.eye.add(this.beam);
    this.pos.y = 0;
    this.gazeYaw = this.heading;
    this.gazePitch = 0;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const toYaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const see = d < 24 && this.lineOfSight(player.pos.x, player.pos.z) && (this.canSee(player, 24, 1.4) || this.state !== 'drift');
    switch (this.state) {
      case 'idle':
      case 'drift':
        this.setState('drift');
        this.wander(dt, 0.7);
        if (see && this.canSee(player, 24, 1.4)) {
          this.setState('fix');
          out.push({ type: 'detect' });
        }
        break;
      case 'fix':
        this.turnTo(toYaw, dt, 2.2);
        if (!see) this.setState(this.stateTime > 4 ? 'drift' : 'fix');
        if (!see && this.stateTime > 2) this.setState('drift');
        if (see && this.stateTime > 0.8 && !this.cooldown) {
          this.setState('charge');
          this.sound('charge', player, 0.35, 30, 1.5);
        }
        break;
      case 'charge':
        this.turnTo(toYaw, dt, 1.6);
        if (this.stateTime > 1.5) {
          this.setState('fire');
          this.sound('staticBurst', player, 0.5, 30);
          // Still in its sight when it fires? Dust.
          if (see && Math.abs(wrapA(toYaw - this.heading)) < 0.25) {
            out.push({ type: 'attack', damage: 70, sanity: 15, cause: 'The Watcher looked at you, and you turned to grey dust.' });
          }
        }
        break;
      case 'fire':
        if (this.stateTime > 0.6) {
          this.cooldown = 5;
          this.setState('fix');
        }
        break;
    }
    this.target = player;
  }

  animate(dt, player) {
    const s = this.preview || this.state;
    this.pos.y = 0;
    this.eye.position.y = 1.85 + Math.sin(this.time * 0.9) * 0.08;
    // Glances about while drifting; locks on otherwise.
    const look = s === 'drift' || s === 'idle' || s === 'move' ? Math.sin(this.time * 0.7) * 0.6 : 0;
    this.eye.rotation.y = look;
    if (player && s !== 'drift' && s !== 'idle' && !this.preview) {
      const dy = 1.5 - this.eye.position.y;
      this.eye.rotation.x = -Math.atan2(dy, Math.max(0.5, this.distTo(player)));
    } else this.eye.rotation.x = Math.sin(this.time * 0.5) * 0.15;
    const charging = s === 'charge' || s === 'detect';
    const k = charging ? Math.min(1, this.preview ? 1 : this.stateTime / 1.5) : 0;
    this.pupil.scale.setScalar(s === 'fix' ? 0.7 : 1 + k * 0.9);
    this.pupilMat.color.setRGB(k * 1, k * 0.25, k * 0.2);
    const firing = s === 'fire' || s === 'attack';
    this.beamMat.opacity = firing ? 0.85 * (1 - (this.preview ? 0 : this.stateTime / 0.6)) : charging ? 0.15 * k : 0;
    const len = firing || charging ? (player && !this.preview ? this.distTo(player) + 1 : 6) : 0.01;
    this.beam.scale.set(1 + k, 1 + k, len);
    for (const n of this.nerves) {
      n.chain.forEach((j, k2) => {
        if (k2) j.rotation.x = Math.sin(this.time * 1.6 + n.phase + k2) * 0.25;
        if (k2) j.rotation.z = Math.cos(this.time * 1.2 + n.phase + k2 * 0.7) * 0.2;
      });
    }
  }
}

function wrapA(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
