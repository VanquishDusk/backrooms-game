import * as THREE from 'three';

// Level 11's harmless locals.
//   - Lucky Cranes: folded-paper cranes that fly in flocks over the streets.
//     Now and then one comes down to you; touch it and your luck turns.
//   - Living Pizzas: slices of pizza that hop about on the pavement. They
//     don't want to be eaten, and they're quicker than they look.

function craneGeometry() {
  // A folded crane: a diamond body, a neck and a tail sticking up.
  const v = [
    0, 0, 0.32, -0.07, 0, 0, 0, 0.09, 0, // body front-left
    0, 0, 0.32, 0, 0.09, 0, 0.07, 0, 0,
    0, 0, -0.3, 0, 0.09, 0, -0.07, 0, 0,
    0, 0, -0.3, 0.07, 0, 0, 0, 0.09, 0,
    0, 0.02, 0.18, 0, 0.3, 0.42, 0.02, 0.02, 0.12, // neck
    0, 0.02, -0.18, 0, 0.26, -0.4, 0.02, 0.02, -0.12, // tail
    0, 0.3, 0.42, 0, 0.24, 0.5, 0.02, 0.27, 0.4, // head
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function wingGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0.42, 0.04, -0.02, 0, 0, -0.14], 3));
  g.computeVertexNormals();
  return g;
}

const PAPER = [0xf4efe2, 0xd83a2e, 0xe8b830, 0xf4efe2, 0x5a8ad8, 0xf0a0b8];

export class Cranes {
  constructor(group, rng) {
    this.group = group;
    this.rng = rng;
    this.body = craneGeometry();
    this.wing = wingGeometry();
    this.mats = PAPER.map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    this.flocks = [];
    this.list = [];
    this.nextVisit = 50;
    this.visitor = null;
  }

  makeCrane(scale = 1) {
    const root = new THREE.Group();
    const m = this.rng.pick(this.mats);
    root.add(new THREE.Mesh(this.body, m));
    const wl = new THREE.Mesh(this.wing, m);
    const wr = new THREE.Mesh(this.wing, m);
    wr.scale.x = -1;
    root.add(wl, wr);
    root.scale.setScalar(scale);
    this.group.add(root);
    return { root, wl, wr, ph: this.rng.range(0, 6) };
  }

  // A flock circling somewhere round (x, z).
  spawnFlock(x, z, n = 8) {
    const f = { cx: x, cz: z, y: this.rng.range(9, 20), r: this.rng.range(6, 14), t: this.rng.range(0, 6), speed: this.rng.range(0.18, 0.3) * (this.rng.chance(0.5) ? 1 : -1), birds: [] };
    for (let k = 0; k < n; k++) {
      const c = this.makeCrane(this.rng.range(1.1, 1.6));
      c.off = [this.rng.range(-3, 3), this.rng.range(-2, 2), this.rng.range(0, 6)];
      f.birds.push(c);
      this.list.push(c);
    }
    this.flocks.push(f);
    return f;
  }

  update(dt, player, time, onLuck) {
    const px = player.pos.x, pz = player.pos.z;
    for (const f of this.flocks) {
      f.t += dt * f.speed;
      // Drift along with you, slowly, so they're never far.
      const dx = px - f.cx, dz = pz - f.cz, d = Math.hypot(dx, dz);
      if (d > 70) {
        f.cx += (dx / d) * dt * 6;
        f.cz += (dz / d) * dt * 6;
      }
      for (const c of f.birds) {
        if (c === this.visitor?.c) continue;
        const a = f.t + c.off[2];
        const x = f.cx + Math.cos(a) * (f.r + c.off[0]), z = f.cz + Math.sin(a) * (f.r + c.off[0]);
        const y = f.y + c.off[1] + Math.sin(time * 0.7 + c.ph) * 0.6;
        c.root.position.set(x, y, z);
        c.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) * Math.sign(f.speed) + (f.speed < 0 ? Math.PI : 0);
        this.flap(c, time, 1);
      }
    }
    // Every so often one comes down to you.
    this.nextVisit -= dt;
    if (!this.visitor && this.nextVisit <= 0 && this.flocks.length) {
      this.nextVisit = this.rng.range(70, 120);
      const f = this.rng.pick(this.flocks);
      const c = f.birds[0];
      this.visitor = { c, t: 0, from: c.root.position.clone(), told: false };
      return 'visit';
    }
    if (this.visitor) {
      const v = this.visitor, c = v.c;
      v.t += dt;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const target = new THREE.Vector3(px + fx * 2.5, 1.7 + Math.sin(time * 1.3) * 0.25, pz + fz * 2.5);
      if (v.t < 30) {
        c.root.position.lerp(target, Math.min(1, dt * 0.6));
        c.root.rotation.y = Math.atan2(px - c.root.position.x, pz - c.root.position.z);
        this.flap(c, time, 0.6);
        const d = Math.hypot(c.root.position.x - px, c.root.position.z - pz);
        if (d < 1.3 && Math.abs(c.root.position.y - 1.6) < 0.8) {
          onLuck?.();
          v.t = 30;
        }
      } else {
        c.root.position.y += dt * 4;
        this.flap(c, time, 1.6);
        if (v.t > 36) this.visitor = null;
      }
    }
    return null;
  }

  flap(c, time, rate) {
    const w = Math.sin(time * 9 * rate + c.ph) * 0.7;
    c.wl.rotation.z = w;
    c.wr.rotation.z = -w;
  }

  subjects() {
    const out = [];
    if (this.visitor) out.push({ type: 'luckycrane', x: this.visitor.c.root.position.x, y: this.visitor.c.root.position.y, z: this.visitor.c.root.position.z, range: 14 });
    for (const f of this.flocks) out.push({ type: 'luckycrane', x: f.cx, y: f.y, z: f.cz, range: 40, noLos: true });
    return out;
  }

  dispose() {
    for (const c of this.list) this.group.remove(c.root);
    this.body.dispose();
    this.wing.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// ---- Living Pizzas ------------------------------------------------------------------------

function sliceGeometry() {
  // A wedge of pizza: point at +z, crust along the back.
  const s = new THREE.Shape();
  s.moveTo(0, 0.42);
  s.lineTo(-0.2, -0.05);
  s.quadraticCurveTo(0, -0.12, 0.2, -0.05);
  s.lineTo(0, 0.42);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.06, 0);
  return g;
}

export class Pizzas {
  constructor(group, rng, world) {
    this.group = group;
    this.rng = rng;
    this.world = world;
    this.slice = sliceGeometry();
    this.crust = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6).rotateZ(Math.PI / 2);
    this.pep = new THREE.CircleGeometry(0.035, 8).rotateX(-Math.PI / 2);
    this.eye = new THREE.SphereGeometry(0.018, 6, 4);
    this.mCheese = new THREE.MeshLambertMaterial({ color: 0xf2c24a });
    this.mCrust = new THREE.MeshLambertMaterial({ color: 0xc8843a });
    this.mPep = new THREE.MeshLambertMaterial({ color: 0xa82418 });
    this.mEye = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.list = [];
  }

  spawn(x, z) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.add(new THREE.Mesh(this.slice, this.mCheese));
    const c = new THREE.Mesh(this.crust, this.mCrust);
    c.position.set(0, 0.045, -0.08);
    body.add(c);
    for (const [px, pz] of [[0, 0.18], [-0.07, 0.04], [0.08, 0.06]]) {
      const p = new THREE.Mesh(this.pep, this.mPep);
      p.position.set(px, 0.064, pz);
      body.add(p);
    }
    for (const ex of [-0.05, 0.05]) {
      const e = new THREE.Mesh(this.eye, this.mEye);
      e.position.set(ex, 0.08, 0.0);
      body.add(e);
    }
    root.add(body);
    root.scale.setScalar(1.6);
    this.group.add(root);
    const p = { root, body, x, z, home: [x, z], heading: this.rng.range(0, 6), hop: this.rng.range(0, 1), state: 'wander', t: 0, y: 0.15 };
    this.list.push(p);
    return p;
  }

  update(dt, player, groundAt, audio) {
    const res = [];
    for (const p of this.list) {
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
      p.t += dt;
      let speed = 0.5;
      if (d < 4.5) {
        // Run for it.
        p.state = 'flee';
        p.heading = Math.atan2(dx, dz) + Math.sin(p.t * 3) * 0.5;
        speed = 2.6;
        if (!p.squeaked) {
          p.squeaked = true;
          res.push({ type: 'squeak', p, d });
        }
      } else {
        if (p.state === 'flee' && d > 8) {
          p.state = 'wander';
          p.squeaked = false;
        }
        if (this.rng.chance(dt * 0.5)) p.heading += this.rng.range(-1.2, 1.2);
        // Don't stray far from home.
        const hx = p.home[0] - p.x, hz = p.home[1] - p.z;
        if (Math.hypot(hx, hz) > 10) p.heading = Math.atan2(hx, hz);
      }
      // Hop.
      p.hop += dt * (speed > 1 ? 3.2 : 1.6);
      const ph = p.hop % 1;
      const air = ph < 0.55;
      if (air) {
        const pos = { x: p.x + Math.sin(p.heading) * speed * dt * 1.8, z: p.z + Math.cos(p.heading) * speed * dt * 1.8 };
        this.world.collide(pos, 0.2);
        p.x = pos.x;
        p.z = pos.z;
      }
      const gy = groundAt(p.x, p.z);
      p.root.position.set(p.x, gy + (air ? Math.sin((ph / 0.55) * Math.PI) * 0.35 : 0), p.z);
      p.root.rotation.y = p.heading;
      p.body.rotation.x = air ? -0.25 : 0;
      p.body.scale.set(1, air ? 1 : 0.8 + ph * 0.2, 1);
      if (d < 0.7 && !p.caught) {
        p.caught = true;
        res.push({ type: 'touch', p });
      }
      if (d > 1.5) p.caught = false;
    }
    return res;
  }

  subjects() {
    return this.list.map((p) => ({ type: 'livingpizza', x: p.x, y: 0.4, z: p.z, range: 10 }));
  }

  clear() {
    for (const p of this.list) this.group.remove(p.root);
    this.list = [];
  }

  dispose() {
    this.clear();
    for (const g of [this.slice, this.crust, this.pep, this.eye]) g.dispose();
    for (const m of [this.mCheese, this.mCrust, this.mPep, this.mEye]) m.dispose();
  }
}
