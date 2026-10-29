import * as THREE from 'three';

// Fast geometry writer for dense industrial clutter: pipes, elbows, struts,
// boxes. Appends straight into flat arrays (no per-piece BufferGeometry), so
// thousands of pipe runs build in a few milliseconds. UVs are in metres
// unless noted, so world textures tile at a physical scale.

const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);

export class TubeBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  vert(x, y, z, nx, ny, nz, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
  }

  /**
   * Cylinder from a to b ([x, y, z]). u wraps the circumference once per
   * `uScale` texture widths; v runs along the length in metres * vScale.
   */
  cylinder(a, b, r, seg = 8, { uScale = 1, vScale = 1, v0 = 0, caps = false } = {}) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    if (len < 1e-4) return;
    _d.divideScalar(len);
    _u.crossVectors(_d, Math.abs(_d.y) > 0.95 ? RIGHT : UP).normalize();
    _w.crossVectors(_d, _u);
    const base = this.vertexCount;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const nx = _u.x * c + _w.x * s, ny = _u.y * c + _w.y * s, nz = _u.z * c + _w.z * s;
      const u = (i / seg) * uScale;
      this.vert(a[0] + nx * r, a[1] + ny * r, a[2] + nz * r, nx, ny, nz, u, v0);
      this.vert(b[0] + nx * r, b[1] + ny * r, b[2] + nz * r, nx, ny, nz, u, v0 + len * vScale);
    }
    for (let i = 0; i < seg; i++) {
      const k = base + i * 2;
      this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    if (caps) {
      for (const [p, sgn] of [[a, -1], [b, 1]]) {
        const c0 = this.vertexCount;
        this.vert(p[0], p[1], p[2], _d.x * sgn, _d.y * sgn, _d.z * sgn, 0.5, 0.5);
        for (let i = 0; i <= seg; i++) {
          const t = (i / seg) * Math.PI * 2;
          const c = Math.cos(t), s = Math.sin(t);
          const nx = _u.x * c + _w.x * s, ny = _u.y * c + _w.y * s, nz = _u.z * c + _w.z * s;
          this.vert(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, _d.x * sgn, _d.y * sgn, _d.z * sgn, 0.5 + c * 0.5, 0.5 + s * 0.5);
        }
        for (let i = 0; i < seg; i++) {
          if (sgn > 0) this.idx.push(c0, c0 + 1 + i, c0 + 2 + i);
          else this.idx.push(c0, c0 + 2 + i, c0 + 1 + i);
        }
      }
    }
  }

  // Tapered cylinder (cone frustum) from a (radius ra) to b (radius rb).
  frustum(a, b, ra, rb, seg = 10, { caps = false } = {}) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    if (len < 1e-4) return;
    _d.divideScalar(len);
    _u.crossVectors(_d, Math.abs(_d.y) > 0.95 ? RIGHT : UP).normalize();
    _w.crossVectors(_d, _u);
    const slope = (ra - rb) / len;
    const base = this.vertexCount;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const rx = _u.x * c + _w.x * s, ry = _u.y * c + _w.y * s, rz = _u.z * c + _w.z * s;
      const nl = Math.hypot(1, slope);
      const nx = (rx + _d.x * slope) / nl, ny = (ry + _d.y * slope) / nl, nz = (rz + _d.z * slope) / nl;
      this.vert(a[0] + rx * ra, a[1] + ry * ra, a[2] + rz * ra, nx, ny, nz, i / seg, 0);
      this.vert(b[0] + rx * rb, b[1] + ry * rb, b[2] + rz * rb, nx, ny, nz, i / seg, len);
    }
    for (let i = 0; i < seg; i++) {
      const k = base + i * 2;
      this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    if (caps) {
      if (rb > 0.001) this.cylinder(b, [b[0] + _d.x * 0.001, b[1] + _d.y * 0.001, b[2] + _d.z * 0.001], rb, seg, { caps: true });
      if (ra > 0.001) this.cylinder([a[0] - _d.x * 0.001, a[1] - _d.y * 0.001, a[2] - _d.z * 0.001], a, ra, seg, { caps: true });
    }
  }

  // Low-poly sphere (pipe elbows, bulbs).
  sphere(c, r, seg = 8, rings = 5, sy = 1) {
    const base = this.vertexCount;
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI;
      const yy = Math.cos(phi), sr = Math.sin(phi);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        const nx = Math.cos(t) * sr, nz = Math.sin(t) * sr;
        this.vert(c[0] + nx * r, c[1] + yy * r * sy, c[2] + nz * r, nx, yy, nz, i / seg, j / rings);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  // Generic quad; winding is fixed up to face `n`.
  quad(a, b, c, d, n, uva, uvb, uvc, uvd) {
    const base = this.vertexCount;
    for (const [p, t] of [[a, uva], [b, uvb], [c, uvc], [d, uvd]]) this.vert(p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  /**
   * Box centred on (cx, cy, cz) with size (sx, sy, sz), turned `rotY`
   * radians about its vertical axis. UVs in metres * uvScale.
   * `skip` omits faces by name: 'top', 'bottom', 'px', 'nx', 'pz', 'nz'.
   */
  box(cx, cy, cz, sx, sy, sz, rotY = 0, uvScale = 1, skip = null) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const P = (lx, ly, lz) => [cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c];
    const N = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, k = uvScale;
    const faces = [
      ['px', N(1, 0, 0), [P(hx, -hy, -hz), P(hx, -hy, hz), P(hx, hy, hz), P(hx, hy, -hz)], sz, sy],
      ['nx', N(-1, 0, 0), [P(-hx, -hy, hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(-hx, hy, hz)], sz, sy],
      ['pz', N(0, 0, 1), [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)], sx, sy],
      ['nz', N(0, 0, -1), [P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)], sx, sy],
      ['top', N(0, 1, 0), [P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)], sx, sz],
      ['bottom', N(0, -1, 0), [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, -hy, -hz), P(-hx, -hy, -hz)], sx, sz],
    ];
    for (const [name, n, [a, b, cc, d], w, h] of faces) {
      if (skip && skip.includes(name)) continue;
      this.quad(a, b, cc, d, n, [0, 0], [w * k, 0], [w * k, h * k], [0, h * k]);
    }
  }

  // Axis-aligned box from min to max corner.
  aabb(x0, y0, z0, x1, y1, z1, uvScale = 1, skip = null) {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, uvScale, skip);
  }

  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const n = this.vertexCount;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Builders bucketed by material name and spatial chunk, so each chunk of a
 * big level is its own mesh and gets frustum-culled.
 */
export class ChunkedBuilders {
  constructor(chunkSize) {
    this.size = chunkSize;
    this.map = new Map();
  }

  at(name, x, z) {
    const key = `${name}|${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.map.get(key);
    if (!b) {
      b = new TubeBuilder();
      b.name = name;
      this.map.set(key, b);
    }
    return b;
  }

  // Adds one mesh per (material, chunk) to `group`; returns the geometries.
  finish(group, materials) {
    const geos = [];
    for (const b of this.map.values()) {
      const g = b.build();
      if (!g) continue;
      geos.push(g);
      const mat = materials[b.name];
      if (!mat) throw new Error(`No material for ${b.name}`);
      group.add(new THREE.Mesh(g, mat));
    }
    this.map.clear();
    return geos;
  }
}
