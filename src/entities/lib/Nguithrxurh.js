import * as THREE from 'three';
import { Entity } from './Entity.js';
import { chitinSkin, webSkin, flesh } from './textures.js';

// Nguithr'xurh: a grey, insect-like thing the length of a person, with far
// too many jointed limbs, that lives upside down on the ceiling beside its
// round web. It creeps overhead, waiting. Walk beneath it and it drops on
// you, then scuttles back up the wall.
//
// States: lurk (on the ceiling, by its web) -> stalk (overhead) -> drop ->
//         attack (on the floor) -> climb (back up)
// opts.ceiling: ceiling height (default: the map's height)

export class Nguithrxurh extends Entity {
  build() {
    this.radius = 0.3;
    const shell = this.mat(0xffffff, { map: chitinSkin() });
    const joint = this.mat(0x4a4844);
    const raw = this.mat(0xffffff, { map: flesh('mixed') });
    this.body = new THREE.Group();
    this.root.add(this.body);
    // Segmented body: head, thorax, a long ribbed abdomen.
    const seg = (r, z, sx = 1, sy = 0.7) => {
      const m = this.mesh(this.geo(new THREE.SphereGeometry(r, 14, 10)), shell, 0, 0, z);
      m.scale.set(sx, sy, 1.25);
      this.body.add(m);
      return m;
    };
    seg(0.13, 0.42);
    seg(0.17, 0.18, 1.1);
    for (let i = 0; i < 4; i++) seg(0.16 - i * 0.025, -0.1 - i * 0.17, 1.05 - i * 0.05, 0.75);
    // Mandibles and a cluster of small black eyes.
    this.mandibles = [];
    for (const s of [-1, 1]) {
      const m = new THREE.Group();
      m.position.set(s * 0.06, -0.02, 0.52);
      const g = this.geo(new THREE.ConeGeometry(0.025, 0.16, 6));
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, 0.07);
      m.add(this.mesh(g, joint));
      m.rotation.y = -s * 0.3;
      this.body.add(m);
      this.mandibles.push({ m, s });
    }
    const eye = this.mat(0x050505);
    for (let i = 0; i < 6; i++) this.body.add(this.mesh(this.geo(new THREE.SphereGeometry(0.018, 6, 5)), eye, (i % 3 - 1) * 0.045, 0.06 + Math.floor(i / 3) * 0.03, 0.5));
    // Gross: a wet split along its underside.
    const split = this.mesh(this.geo(new THREE.SphereGeometry(0.08, 8, 6)), raw, 0, -0.1, -0.2);
    split.scale.set(0.6, 0.4, 3);
    this.body.add(split);
    // Fourteen legs, three-jointed, splayed.
    this.legs = [];
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) {
        const base = new THREE.Group();
        base.position.set(s * 0.12, 0, 0.32 - i * 0.12);
        this.body.add(base);
        const a = this.limb(base, 0.32, 0.022, joint);
        a.g.rotation.z = s * -0.9;
        const b = this.limb(a.end, 0.38, 0.018, shell);
        b.g.rotation.z = s * 1.6;
        const c = this.limb(b.end, 0.26, 0.012, joint);
        c.g.rotation.z = s * 0.4;
        this.legs.push({ base, a: a.g, b: b.g, s, phase: i * 0.9 + (s > 0 ? Math.PI : 0) });
      }
    }
    // Its web: a round sheet on the ceiling at home.
    this.webMat = new THREE.MeshBasicMaterial({ map: webSkin(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(this.webMat);
    this.web = new THREE.Mesh(this.geo(new THREE.CircleGeometry(1.1, 24)), this.webMat);
    this.web.rotation.x = Math.PI / 2;
    this.ctx.scene.add(this.web);
    this.home = [this.pos.x, this.pos.z];
    this.height = 0; // 0 on the floor .. 1 on the ceiling
    this.height = 1;
    this.gaitScale = 7;
  }

  limb(parent, len, r, mat) {
    const g = new THREE.Group();
    const geo = this.geo(new THREE.CylinderGeometry(r * 0.7, r, len, 5));
    geo.translate(0, len / 2, 0);
    g.add(this.mesh(geo, mat));
    parent.add(g);
    const end = new THREE.Group();
    end.position.y = len;
    g.add(end);
    return { g, end };
  }

  // Ceiling height where it lives (opts.ceiling overrides the map's).
  get ceilingY() {
    return this.opts.ceiling ?? this.map.height;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    switch (this.state) {
      case 'idle':
      case 'lurk':
        this.setState('lurk');
        this.height = 1;
        // Shift about near the web.
        if (Math.hypot(this.pos.x - this.home[0], this.pos.z - this.home[1]) > 2.5) this.moveToward(this.home[0], this.home[1], 0.6, dt, 3);
        else if (this.rng.chance(dt * 0.4)) this.moveToward(this.home[0] + this.rng.range(-1.5, 1.5), this.home[1] + this.rng.range(-1.5, 1.5), 0.5, dt);
        if (this.rng.chance(dt * 0.2)) this.sound('chitter', player, 0.12, 12);
        if (d < 8 && this.lineOfSight(player.pos.x, player.pos.z)) this.setState('stalk');
        break;
      case 'stalk':
        // Creeping along the ceiling to get above you.
        this.height = 1;
        this.pathTo(player.pos.x, player.pos.z, player.speed > 0.5 ? 2.2 : 1.4, dt);
        if (this.rng.chance(dt * 0.8)) this.sound('scratch', player, 0.15, 12);
        if (d < 0.9 && !this.cooldown) {
          this.setState('drop');
          this.sound('hiss', player, 0.5, 16);
          out.push({ type: 'detect' });
        }
        if (d > 12 || Math.hypot(this.pos.x - this.home[0], this.pos.z - this.home[1]) > 14) this.setState('lurk');
        break;
      case 'drop':
        this.height = Math.max(0, 1 - this.stateTime / 0.35);
        if (this.height === 0) {
          this.setState('attack');
          this.sound('thud', player, 0.5, 14);
          if (d < 1.4) out.push({ type: 'attack', damage: 26, sanity: 12, cause: 'It dropped from the ceiling, all legs.' });
        }
        break;
      case 'attack':
        this.height = 0;
        this.moveToward(player.pos.x, player.pos.z, 1.5, dt, 10);
        if (this.stateTime > 1.2) {
          this.cooldown = 6;
          this.setState('climb');
          this.sound('chitter', player, 0.4, 14);
        }
        break;
      case 'climb':
        this.height = Math.min(1, this.stateTime / 1.2);
        if (this.height < 1) this.moveToward(this.pos.x + Math.sin(this.heading + Math.PI), this.pos.z + Math.cos(this.heading + Math.PI), 2.5, dt);
        if (this.height >= 1) this.setState('lurk');
        break;
    }
  }

  animate(dt) {
    const s = this.preview || this.state;
    const top = this.preview ? (s === 'attack' || s === 'detect' ? 0 : 1) : this.height;
    // On the ceiling it hangs upside down, belly up to the tiles.
    const y = top * (this.ceilingY - 0.22) + (1 - top) * 0.22;
    this.body.position.y = y;
    this.body.rotation.z = top > 0.5 ? Math.PI : 0;
    this.body.rotation.x = s === 'drop' ? 0.8 : 0;
    const move = s === 'move' || this.moveSpeed > 0.1 || s === 'stalk';
    const rate = s === 'attack' || s === 'detect' ? 16 : move ? 11 : 1.5;
    for (const l of this.legs) {
      const w = Math.sin(this.time * rate + l.phase);
      l.base.rotation.y = w * (move ? 0.35 : 0.06);
      l.a.rotation.x = Math.max(0, w) * (move ? 0.5 : 0.08);
      l.b.rotation.z = l.s * (1.6 + (s === 'attack' ? Math.sin(this.time * 20 + l.phase) * 0.6 : 0));
    }
    for (const m of this.mandibles) m.m.rotation.y = -m.s * (0.3 + Math.abs(Math.sin(this.time * (s === 'attack' ? 18 : 3))) * 0.4);
    this.web.position.set(this.home[0], this.ceilingY - 0.01, this.home[1]);
  }

  dispose() {
    this.ctx.scene.remove(this.web);
    super.dispose();
  }
}
