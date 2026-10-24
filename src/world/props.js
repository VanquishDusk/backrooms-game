import * as THREE from 'three';

// Small set-dressing meshes. They use unlit materials tinted once by the
// baked light where they stand, which is plenty for objects this small.

const WALL_FACE = 0.09; // half wall thickness + a hair

export class PropKit {
  constructor(sampleLight) {
    this.sampleLight = sampleLight;
    this.geos = [];
    this.mats = [];
  }

  // Basic material whose colour is pre-multiplied by local light.
  mat(hex, x, z, opts = {}) {
    const [r, g, b] = this.sampleLight(x, z);
    const k = Math.max(opts.minLight ?? 0.3, ((r + g + b) / 3) * 1.35);
    const c = new THREE.Color(hex);
    const m = new THREE.MeshBasicMaterial({
      color: opts.unlit ? c : new THREE.Color(c.r * k * (0.6 + r * 0.4), c.g * k * (0.6 + g * 0.4), c.b * k * (0.6 + b * 0.4)),
      transparent: !!opts.opacity,
      opacity: opts.opacity ?? 1,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.mats.push(m);
    return m;
  }

  box(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.geos.push(g);
    return g;
  }

  cyl(rt, rb, h, seg = 10) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.geos.push(g);
    return g;
  }

  mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }

  // ---- Doors ---------------------------------------------------------------

  /**
   * A door set into the face of a wall edge, facing `side` (the cell it opens
   * from). Returns { group, x, z, nx, nz } where (x, z) is the door's centre
   * on the wall face and (nx, nz) points out of the wall.
   */
  door(map, edge, side, style) {
    const cs = map.cellSize;
    let x, z, nx = 0, nz = 0;
    if (edge.h) {
      x = (edge.x + 0.5) * cs;
      nz = side.y === edge.y ? 1 : -1;
      z = edge.y * cs + nz * WALL_FACE;
    } else {
      z = (edge.y + 0.5) * cs;
      nx = side.x === edge.x ? 1 : -1;
      x = edge.x * cs + nx * WALL_FACE;
    }
    const lx = x + nx * 0.5, lz = z + nz * 0.5;
    const g = new THREE.Group();
    const W = 0.95, H = 2.1, T = 0.05;
    const frame = this.mat(style.frame, lx, lz);
    g.add(this.mesh(this.box(0.08, H + 0.08, T), frame, -W / 2 - 0.04, (H + 0.08) / 2, T / 2));
    g.add(this.mesh(this.box(0.08, H + 0.08, T), frame, W / 2 + 0.04, (H + 0.08) / 2, T / 2));
    g.add(this.mesh(this.box(W + 0.16, 0.08, T), frame, 0, H + 0.04, T / 2));
    const panel = this.mesh(this.box(W, H, 0.04), this.mat(style.panel, lx, lz), 0, H / 2, 0.02);
    g.add(panel);
    // Recessed panels so it reads as a door from a distance.
    const inset = this.mat(style.inset ?? style.panel, lx, lz);
    for (const [py, ph] of [[1.45, 0.75], [0.55, 0.8]]) {
      g.add(this.mesh(this.box(W * 0.7, ph, 0.01), inset, 0, py, 0.045));
    }
    g.add(this.mesh(this.cyl(0.03, 0.03, 0.06, 8).rotateX(Math.PI / 2), this.mat(style.knob ?? 0xb8a060, lx, lz, { minLight: 0.5 }), W / 2 - 0.1, 1.0, 0.07));
    if (style.glow) {
      // Light spilling out from under the door.
      const glow = new THREE.Mesh(this.box(W, 0.02, 0.3), new THREE.MeshBasicMaterial({ color: style.glow, transparent: true, opacity: 0.8 }));
      this.mats.push(glow.material);
      glow.position.set(0, 0.01, 0.15);
      g.add(glow);
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(nx, nz);
    return { group: g, x, z, nx, nz };
  }

  // ---- Construction clutter ------------------------------------------------

  bucket(x, z) {
    const g = new THREE.Group();
    g.add(this.mesh(this.cyl(0.15, 0.13, 0.36, 12), this.mat(0xe8e8e0, x, z), 0, 0.18, 0));
    g.add(this.mesh(this.cyl(0.152, 0.152, 0.03, 12), this.mat(0x9c4a2a, x, z), 0, 0.37, 0));
    g.position.set(x, 0, z);
    return g;
  }

  sawhorse(x, z, rot) {
    const g = new THREE.Group();
    const wood = this.mat(0xb08a58, x, z);
    g.add(this.mesh(this.box(1.1, 0.08, 0.1), wood, 0, 0.72, 0));
    for (const sx of [-0.45, 0.45]) {
      for (const sz of [-1, 1]) {
        const leg = this.mesh(this.box(0.06, 0.78, 0.06), wood, sx, 0.36, sz * 0.12);
        leg.rotation.x = sz * 0.28;
        g.add(leg);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return g;
  }

  drywall(x, z, rot) {
    const sheet = this.mesh(this.box(1.2, 2.2, 0.03), this.mat(0xcfccc2, x, z), 0, 1.08, 0);
    sheet.rotation.x = -0.18;
    const g = new THREE.Group();
    g.add(sheet);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return g;
  }

  ladder(x, z, rot) {
    const g = new THREE.Group();
    const m = this.mat(0xc9b25a, x, z);
    for (const sx of [-0.22, 0.22]) g.add(this.mesh(this.box(0.05, 1.9, 0.06), m, sx, 0.95, 0));
    for (let i = 0; i < 6; i++) g.add(this.mesh(this.box(0.44, 0.04, 0.05), m, 0, 0.25 + i * 0.3, 0));
    g.rotation.x = -0.12;
    const outer = new THREE.Group();
    outer.add(g);
    outer.position.set(x, 0, z);
    outer.rotation.y = rot;
    return outer;
  }

  tarp(x, z, rot) {
    const geo = new THREE.PlaneGeometry(1.6, 1.2, 4, 3);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4) * 0.05 + Math.random() * 0.03);
    geo.computeVertexNormals();
    this.geos.push(geo);
    const m = this.mesh(geo, this.mat(0xd8dde0, x, z, { opacity: 0.7, doubleSide: true }), 0, 0.03, 0);
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return g;
  }

  // ---- Remodel fixtures ----------------------------------------------------

  // Wall outlet; `face` = { x, z, nx, nz } on a wall face.
  outlet(face) {
    const g = new THREE.Group();
    const lx = face.x + face.nx * 0.4, lz = face.z + face.nz * 0.4;
    g.add(this.mesh(this.box(0.08, 0.12, 0.012), this.mat(0xe0dccb, lx, lz, { minLight: 0.5 }), 0, 0, 0));
    const slot = this.mat(0x222018, lx, lz, { unlit: true });
    for (const dy of [-0.025, 0.025]) g.add(this.mesh(this.box(0.03, 0.018, 0.004), slot, 0, dy, 0.008));
    g.position.set(face.x, 0.32, face.z);
    g.rotation.y = Math.atan2(face.nx, face.nz);
    return g;
  }

  toilet(x, z, rot) {
    const g = new THREE.Group();
    const white = this.mat(0xf2f2ee, x, z, { minLight: 0.45 });
    g.add(this.mesh(this.cyl(0.2, 0.15, 0.4, 14), white, 0, 0.2, 0.05));
    g.add(this.mesh(this.box(0.42, 0.38, 0.18), white, 0, 0.6, -0.2));
    g.add(this.mesh(this.cyl(0.22, 0.22, 0.04, 14), white, 0, 0.42, 0.05));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return g;
  }

  sink(x, z, rot) {
    const g = new THREE.Group();
    const white = this.mat(0xf2f2ee, x, z, { minLight: 0.45 });
    g.add(this.mesh(this.box(0.55, 0.14, 0.42), white, 0, 0.82, 0));
    g.add(this.mesh(this.cyl(0.07, 0.09, 0.75, 10), white, 0, 0.38, -0.05));
    g.add(this.mesh(this.box(0.04, 0.16, 0.04), this.mat(0xb0b4b8, x, z, { minLight: 0.5 }), 0, 0.96, -0.14));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return g;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// Distance test for walking "into" a door built by PropKit.door.
export function nearDoor(door, px, pz) {
  const dx = px - door.x, dz = pz - door.z;
  const normal = dx * door.nx + dz * door.nz;
  const lateral = Math.abs(dx * door.nz - dz * door.nx);
  return normal > -0.05 && normal < 0.48 && lateral < 0.5;
}
