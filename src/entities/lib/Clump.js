import * as THREE from 'three';
import { Entity } from './Entity.js';
import { flesh, paleSkin } from './textures.js';

// Clump: a knot of human limbs fused into a mass of flesh. Arms and legs
// jut out at every angle, hands still clenching. It wedges itself into
// tight spaces and waits, twitching. Get close and it lunges, then hauls
// itself after you, limbs paddling.
//
// States: hide (seek a tight spot) -> wait -> lunge -> crawl -> (back to hide)

export class Clump extends Entity {
  build() {
    this.radius = 0.45;
    const meat = this.mat(0xffffff, { map: flesh('mixed') });
    const skin = this.mat(0xb89282, { map: paleSkin() });
    const raw = this.mat(0xffffff, { map: flesh('red') });
    const core = new THREE.Group();
    core.position.y = 0.55;
    this.core = core;
    this.root.add(core);
    // Lumpy central mass: several deformed spheres.
    const lump = (r, x, y, z, m) => {
      const g = this.geo(new THREE.SphereGeometry(r, 14, 10));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 1 + (Math.sin(p.getX(i) * 23) * Math.cos(p.getZ(i) * 19) + Math.sin(p.getY(i) * 31)) * 0.08;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      core.add(this.mesh(g, m, x, y, z));
    };
    lump(0.42, 0, 0, 0, meat);
    lump(0.28, 0.25, 0.15, 0.1, raw);
    lump(0.24, -0.22, 0.05, -0.18, meat);
    lump(0.2, 0.05, 0.3, -0.1, skin);
    lump(0.18, -0.1, -0.12, 0.28, raw);
    // Limbs: arms and legs radiating out of the mass.
    this.limbs = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const theta = (i / n) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      const phi = this.rng.range(0.4, 1.9); // from straight up to below the equator
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      const leg = this.rng.chance(0.35);
      const len1 = leg ? 0.42 : 0.32, len2 = leg ? 0.42 : 0.3, r = leg ? 0.055 : 0.04;
      const base = new THREE.Group();
      base.position.copy(dir).multiplyScalar(0.33);
      // Point the limb outward along `dir`.
      base.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      core.add(base);
      const m1 = this.rng.chance(0.6) ? skin : meat;
      const u = this.geo(new THREE.CylinderGeometry(r * 0.85, r, len1, 7));
      u.translate(0, len1 / 2, 0);
      base.add(this.mesh(u, m1));
      const joint = new THREE.Group();
      joint.position.y = len1;
      joint.rotation.x = this.rng.range(0.4, 1.2) * (this.rng.chance(0.5) ? 1 : -1);
      base.add(joint);
      const l = this.geo(new THREE.CylinderGeometry(r * 0.7, r * 0.85, len2, 7));
      l.translate(0, len2 / 2, 0);
      joint.add(this.mesh(l, m1));
      const end = this.mesh(this.geo(new THREE.BoxGeometry(leg ? 0.08 : 0.07, leg ? 0.2 : 0.13, leg ? 0.05 : 0.025)), skin, 0, len2 + 0.05, 0);
      joint.add(end);
      this.limbs.push({ base, joint, rest: joint.rotation.x, phase: this.rng.next() * Math.PI * 2, low: dir.y < 0.3 });
    }
    this.hideSpot = null;
  }

  // Tight spaces: cells walled on three sides (or at least two).
  findHideSpot(player) {
    const { map } = this;
    let best = null, bestScore = -1;
    const [cx, cy] = map.cellAt(this.pos.x, this.pos.z);
    for (let y = Math.max(0, cy - 8); y < Math.min(map.rows, cy + 9); y++) {
      for (let x = Math.max(0, cx - 8); x < Math.min(map.cols, cx + 9); x++) {
        let walls = 0;
        for (let d = 0; d < 4; d++) if (!map.canMove(x, y, d)) walls++;
        if (walls < 2 || walls > 3) continue;
        const [wx, wz] = map.cellCenter(x, y);
        const away = player ? Math.min(12, Math.hypot(wx - player.pos.x, wz - player.pos.z)) : 6;
        const score = walls * 10 + away - Math.hypot(wx - this.pos.x, wz - this.pos.z) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = [wx, wz];
        }
      }
    }
    return best || [this.pos.x, this.pos.z];
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    switch (this.state) {
      case 'idle':
      case 'hide':
        this.setState('hide');
        if (!this.hideSpot) this.hideSpot = this.findHideSpot(player);
        if (this.pathTo(this.hideSpot[0], this.hideSpot[1], 1.4, dt) && Math.hypot(this.hideSpot[0] - this.pos.x, this.hideSpot[1] - this.pos.z) < 0.3) this.setState('wait');
        if (d < 3) this.setState('lunge');
        break;
      case 'wait':
        if (this.rng.chance(dt * 0.15)) this.sound('boneCrack', player, 0.18, 14);
        if (d < 3.6 && this.lineOfSight(player.pos.x, player.pos.z)) {
          this.setState('lunge');
          this.sound('gurgle', player, 0.5);
          out.push({ type: 'detect' });
        }
        break;
      case 'lunge':
        this.moveToward(player.pos.x, player.pos.z, 6.5, dt, 14);
        if (d < 0.95 && !this.cooldown) {
          out.push({ type: 'attack', damage: 28, cause: 'The Clump pulled you into itself.' });
          this.sound('boneCrack', player, 0.5);
          this.cooldown = 2;
          this.setState('crawl');
        } else if (this.stateTime > 0.8) this.setState('crawl');
        break;
      case 'crawl':
        this.pathTo(player.pos.x, player.pos.z, 1.9, dt);
        if (this.rng.chance(dt * 0.5)) this.sound(this.rng.chance(0.5) ? 'gurgle' : 'boneCrack', player, 0.3, 18);
        if (d < 0.95 && !this.cooldown) {
          out.push({ type: 'attack', damage: 16, cause: 'The Clump pulled you into itself.' });
          this.cooldown = 1.8;
        }
        if (d > 14 || this.stateTime > 12) {
          this.hideSpot = this.findHideSpot(player);
          this.setState('hide');
        }
        break;
    }
  }

  animate(dt) {
    const s = this.preview || this.state;
    const moving = this.moveSpeed > 0.2;
    const fast = s === 'lunge' || s === 'attack';
    const twitch = s === 'wait' || s === 'idle' || s === 'hide';
    for (const l of this.limbs) {
      let a = l.rest;
      if (moving || s === 'move' || s === 'crawl') {
        // Limbs near the floor paddle it along; the rest flail.
        a += Math.sin(this.gait * Math.PI * 2 * (fast ? 2 : 1) + l.phase) * (l.low ? 0.9 : 0.4);
      } else if (twitch) {
        a += (Math.sin(this.time * 17 + l.phase) > 0.97 ? 0.5 : 0) + Math.sin(this.time * 1.3 + l.phase) * 0.05;
      } else if (s === 'detect') {
        a += Math.sin(this.time * 9 + l.phase) * 0.6;
      }
      if (fast) a = l.rest * 0.2 + Math.sin(this.time * 18 + l.phase) * 0.3; // limbs flung forward
      l.joint.rotation.x = a;
    }
    // The mass heaves and lurches.
    const roll = moving ? this.gait * 1.5 : 0;
    this.core.rotation.set(Math.sin(roll) * 0.25, Math.sin(this.time * 0.4) * 0.2, Math.cos(roll) * 0.2);
    this.core.position.y = 0.55 + (moving ? Math.abs(Math.sin(this.gait * Math.PI * 2)) * 0.08 : 0) + Math.sin(this.time * 1.6) * 0.015;
    const breathe = 1 + Math.sin(this.time * (twitch ? 1.2 : 4)) * 0.03;
    this.core.scale.set(breathe, 1 / breathe, breathe);
    if (fast) this.core.position.y += 0.15;
  }
}
