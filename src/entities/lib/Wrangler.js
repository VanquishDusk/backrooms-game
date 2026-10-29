import * as THREE from 'three';
import { Entity } from './Entity.js';
import { scaleSkin, wranglerFace } from './textures.js';

// Wrangler: a massive snake-like creature with a face that shouldn't be on
// a snake: a calm, stretched human face, or an insect's. It burrows through
// floors and walls, surfaces near you, and sways: slow, looping, hypnotic.
// Keep watching and you find yourself walking toward it. Then it strikes.
//
// opts.variant: 'human' | 'insect' (the face)
// States: burrow (underground, closing in) -> emerge -> sway (hypnotises
//         whoever watches) -> strike -> sink (back under)

const SEGS = 22;
const SPACING = 0.3;

export class Wrangler extends Entity {
  build() {
    this.variant = this.opts.variant || 'human';
    this.radius = 0.35;
    const hide = this.mat(0xffffff, { map: scaleSkin() });
    const belly = this.mat(0x8a7a5a);
    // The body lives in world space, following the path the head has taken.
    this.trailGroup = new THREE.Group();
    this.ctx.scene.add(this.trailGroup);
    this.segs = [];
    for (let i = 0; i < SEGS; i++) {
      const r = 0.44 * (1 - i / SEGS) + 0.08;
      const m = this.mesh(this.geo(new THREE.SphereGeometry(r, 12, 9)), i % 3 ? hide : belly);
      m.scale.z = 1.4;
      this.trailGroup.add(m);
      this.segs.push({ m, r });
    }
    // Head: a heavy wedge carrying the face.
    this.head = new THREE.Group();
    this.trailGroup.add(this.head);
    const skull = this.mesh(this.geo(new THREE.SphereGeometry(0.34, 16, 12)), hide);
    skull.scale.set(1, 0.85, 1.25);
    this.head.scale.setScalar(1.35);
    this.head.add(skull);
    const faceMat = new THREE.MeshBasicMaterial({ map: wranglerFace(this.variant), transparent: true, depthWrite: false });
    this.mats.push(faceMat);
    this.lit.push({ mat: faceMat, base: new THREE.Color(1, 1, 1) });
    const face = this.mesh(this.geo(new THREE.PlaneGeometry(0.5, 0.56)), faceMat, 0, 0.02, 0.42);
    this.head.add(face);
    if (this.variant === 'insect') {
      this.mandibles = [];
      for (const s of [-1, 1]) {
        const g = this.geo(new THREE.ConeGeometry(0.04, 0.3, 6));
        g.rotateX(Math.PI / 2);
        g.translate(0, 0, 0.15);
        const m = this.mesh(g, this.mat(0x2a2418), s * 0.1, -0.15, 0.38);
        this.head.add(m);
        this.mandibles.push({ m, s });
      }
    }
    // A trail of where the head has been (ground points).
    this.trail = [];
    for (let i = 0; i < SEGS * 3; i++) this.trail.push([this.pos.x - Math.sin(this.heading) * i * SPACING / 3, this.pos.z - Math.cos(this.heading) * i * SPACING / 3]);
    this.surface = 1; // 0 = underground, 1 = up
    this.rise = 0; // how high the head is reared
    this.radius = 0.4;
  }

  recordTrail() {
    const [hx, hz] = this.trail[0];
    if (Math.hypot(this.pos.x - hx, this.pos.z - hz) > SPACING / 3) {
      this.trail.unshift([this.pos.x, this.pos.z]);
      this.trail.length = SEGS * 3;
    }
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const watched = this.seenBy(player, 0.8, 14);
    switch (this.state) {
      case 'idle':
      case 'burrow':
        this.setState('burrow');
        this.surface = Math.max(0, this.surface - dt * 0.8);
        // Under the floor it ignores walls, closing in on noise or just roaming.
        if (this.surface === 0) {
          const tx = d < 30 ? player.pos.x : this.pos.x + Math.sin(this.time * 0.3) * 3;
          const tz = d < 30 ? player.pos.z : this.pos.z + Math.cos(this.time * 0.3) * 3;
          const dx = tx - this.pos.x, dz = tz - this.pos.z;
          this.turnTo(Math.atan2(dx, dz), dt, 1.5);
          this.pos.x += Math.sin(this.heading) * 1.6 * dt;
          this.pos.z += Math.cos(this.heading) * 1.6 * dt;
          this.pos.x = Math.max(0.5, Math.min(this.map.width - 0.5, this.pos.x));
          this.pos.z = Math.max(0.5, Math.min(this.map.depth - 0.5, this.pos.z));
          this.moveSpeed = 1.6;
          if (this.rng.chance(dt * 0.8)) this.sound('thud', player, 0.15, 20);
          if (d < 6 && d > 3 && this.stateTime > 3) {
            // Surface somewhere open.
            const probe = { x: this.pos.x, z: this.pos.z };
            this.world.collide(probe, this.radius);
            this.pos.x = probe.x;
            this.pos.z = probe.z;
            this.setState('emerge');
            this.sound('crack', player, 0.5, 22);
            out.push({ type: 'detect' });
          }
        }
        break;
      case 'emerge':
        this.surface = Math.min(1, this.surface + dt * 0.9);
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 2);
        if (this.surface >= 1) this.setState('sway');
        break;
      case 'sway':
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 1);
        if (this.rng.chance(dt * 0.4)) this.sound('groan', player, 0.2, 16);
        // Hypnosis: watching it draws you in, a step at a time.
        if (watched && d > 1.5) {
          const k = Math.min(1, this.stateTime / 3) * 0.55;
          player.pos.x += ((this.pos.x - player.pos.x) / d) * k * dt;
          player.pos.z += ((this.pos.z - player.pos.z) / d) * k * dt;
          player.sanity = Math.max(0, player.sanity - 1.2 * dt);
          this.mesmer = true;
        } else this.mesmer = false;
        if (d < 2.3 && !this.cooldown) {
          this.setState('strike');
          this.sound('hiss', player, 0.6, 20);
        }
        if (this.stateTime > 14 || d > 16) this.setState('sink');
        break;
      case 'strike':
        if (this.stateTime > 0.3 && !this.hit) {
          this.hit = true;
          if (d < 2.6) out.push({ type: 'attack', damage: 40, sanity: 15, cause: 'You walked right up to the Wrangler. You wanted to.' });
        }
        if (this.stateTime > 0.8) {
          this.hit = false;
          this.cooldown = 4;
          this.setState('sink');
        }
        break;
      case 'sink':
        this.surface = Math.max(0, this.surface - dt * 0.9);
        if (this.surface === 0) this.setState('burrow');
        break;
    }
  }

  animate() {
    const s = this.preview || this.state;
    if (this.preview) {
      this.surface = 1;
      this.pos.x += Math.sin(this.time * 0.6) * 0.004;
    }
    this.recordTrail();
    const sway = s === 'sway' || s === 'idle' || s === 'detect';
    const strike = s === 'strike' || s === 'attack';
    const rear = strike ? 1.4 : sway ? 2.0 : s === 'move' ? 0.7 : 0.8;
    this.rise += (rear - this.rise) * 0.08;
    const under = (1 - this.surface) * -1.6;
    // Head: figure-of-eight swaying when hypnotising; lunges when striking.
    const sx = sway ? Math.sin(this.time * 1.3) * 0.45 : 0;
    const sy = sway ? Math.sin(this.time * 2.6) * 0.18 : 0;
    const lunge = strike ? Math.sin(Math.min(1, (this.preview ? (this.time % 1.2) : this.stateTime) / 0.3) * Math.PI) * 1.2 : 0;
    const c = Math.cos(this.heading), sn = Math.sin(this.heading);
    const hx = this.pos.x + c * sx + sn * lunge, hz = this.pos.z - sn * sx + c * lunge;
    this.head.position.set(hx, under + this.rise + sy, hz);
    this.head.rotation.set(-0.1 + (strike ? 0.3 : 0), this.heading + sx * 0.4, Math.sin(this.time * 1.3) * (sway ? 0.25 : 0));
    // Body: rises from the ground behind the head, then trails along it.
    for (let i = 0; i < SEGS; i++) {
      const t = this.trail[Math.min(this.trail.length - 1, (i + 1) * 3)];
      const up = Math.max(0, 1 - (i + 1) / 6);
      const y = under + this.segs[i].r * 0.9 + up * up * (this.rise - 0.2);
      const wob = Math.sin(this.time * 3 - i * 0.5) * 0.08 * (s === 'move' || s === 'burrow' ? 1 : 0.3);
      const blend = up * 0.8;
      const x = t[0] * (1 - blend) + hx * blend + c * wob, z = t[1] * (1 - blend) + hz * blend - sn * wob;
      const m = this.segs[i].m;
      m.position.set(x, y, z);
      const prev = i ? this.segs[i - 1].m.position : this.head.position;
      m.lookAt(prev);
      m.visible = y > -this.segs[i].r * 1.2;
    }
    this.head.visible = this.head.position.y > -0.3;
    if (this.mandibles) for (const md of this.mandibles) md.m.rotation.y = -md.s * (0.2 + Math.abs(Math.sin(this.time * (strike ? 14 : 2))) * 0.4);
  }

  dispose() {
    this.ctx.scene.remove(this.trailGroup);
    super.dispose();
  }
}
