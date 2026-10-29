import { DIRS, EDGE_OPEN, EDGE_BARS } from './GridMap.js';

// Places set dressing in local frames ({ x, z, rot }, local x along, z
// across) into ChunkedBuilders by material name, records solid footprints
// (they must exist before the world builds collision) and keeps doorways
// clear. Used to furnish rooms in Levels 3 and 4.

const T = 0.08; // half wall thickness

export class Dresser {
  constructor({ cb, rng, map, solid, lights, group, ownGeos, ceilOf }) {
    this.ceilOf = ceilOf || (() => map.height);
    this.cb = cb;
    this.rng = rng;
    this.map = map;
    this.solid = solid;
    this.lights = lights;
    this.group = group;
    this.ownGeos = ownGeos;
    this.zones = []; // keep-clear circles in front of doorways
    this.signs = []; // { o, lx, ly, lz, face, tile, scale? }
  }

  // Local (x along, y up, z across) -> world for a frame { x, z, rot }.
  at(o, lx, ly, lz) {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    return [o.x + lx * c + lz * s, ly, o.z - lx * s + lz * c];
  }

  // A child frame at local (lx, lz), turned a further `rot`.
  sub(o, lx, lz, rot = 0) {
    const [x, , z] = this.at(o, lx, 0, lz);
    return { x, z, rot: o.rot + rot };
  }

  box(mat, o, lx, ly, lz, sx, sy, sz, skip = null) {
    const [x, y, z] = this.at(o, lx, ly, lz);
    this.cb.at(mat, x, z).box(x, y, z, sx, sy, sz, o.rot, 1, skip);
  }

  cyl(mat, o, a, b, r, seg = 8, opts = {}) {
    const A = this.at(o, ...a), B = this.at(o, ...b);
    this.cb.at(mat, (A[0] + B[0]) / 2, (A[2] + B[2]) / 2).cylinder(A, B, r, seg, opts);
  }

  cone(mat, o, a, b, ra, rb, seg = 10, opts = {}) {
    const A = this.at(o, ...a), B = this.at(o, ...b);
    this.cb.at(mat, (A[0] + B[0]) / 2, (A[2] + B[2]) / 2).frustum(A, B, ra, rb, seg, opts);
  }

  ball(mat, o, c, r, seg = 10, rings = 6, sy = 1) {
    const C = this.at(o, ...c);
    this.cb.at(mat, C[0], C[2]).sphere(C, r, seg, rings, sy);
  }

  // A run of pipe through local points, with a ball at each bend.
  pipe(mat, o, pts, r, seg = 8) {
    for (let i = 0; i < pts.length - 1; i++) {
      this.cyl(mat, o, pts[i], pts[i + 1], r, seg);
      if (i > 0) this.ball(mat, o, pts[i], r * 1.08, seg, 4);
    }
  }

  // Quad from local corners, facing local normal n; double = both sides.
  quad(mat, o, pts, n, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], double = false) {
    const W = pts.map((p) => this.at(o, ...p));
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const N = [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
    const b = this.cb.at(mat, (W[0][0] + W[2][0]) / 2, (W[0][2] + W[2][2]) / 2);
    b.quad(W[0], W[1], W[2], W[3], N, ...uv);
    if (double) b.quad(W[0], W[1], W[2], W[3], [-N[0], -N[1], -N[2]], ...uv);
  }

  // Handwheel (valve) in the local x-y plane at c.
  wheel(mat, o, c, R = 0.11) {
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      this.cyl(mat, o, [c[0] + Math.cos(a0) * R, c[1] + Math.sin(a0) * R, c[2]], [c[0] + Math.cos(a1) * R, c[1] + Math.sin(a1) * R, c[2]], 0.012, 4);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      this.cyl(mat, o, c, [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2]], 0.008, 4);
    }
  }

  // World AABB of a local rectangle.
  rect(o, lx0, lz0, lx1, lz1) {
    const pts = [[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]].map(([x, z]) => this.at(o, x, 0, z));
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  }

  solidRect(o, lx0, lz0, lx1, lz1) {
    const r = this.rect(o, lx0, lz0, lx1, lz1);
    this.solid.push(r);
    return r;
  }

  // Is a local rectangle clear of doorways and of anything already solid?
  free(o, lx0, lz0, lx1, lz1) {
    const [x0, z0, x1, z1] = this.rect(o, lx0, lz0, lx1, lz1);
    for (const z of this.zones) {
      const cx = Math.max(x0, Math.min(x1, z.x)), cz = Math.max(z0, Math.min(z1, z.z));
      if (Math.hypot(cx - z.x, cz - z.z) < z.r) return false;
    }
    return !this.solid.some((b) => x0 < b[2] && x1 > b[0] && z0 < b[3] && z1 > b[1]);
  }

  // Room frame: centre, rotation (local x along the long side), inner size.
  frame(r) {
    const cs = this.map.cellSize;
    const along = r.w >= r.h;
    const o = { x: (r.x + r.w / 2) * cs, z: (r.y + r.h / 2) * cs, rot: along ? 0 : -Math.PI / 2 };
    const L = (along ? r.w : r.h) * cs - 2 * T, W = (along ? r.h : r.w) * cs - 2 * T;
    // Doorways need room to walk through.
    for (const d of r.doors || []) {
      const [cx, cz] = this.map.cellCenter(d.x, d.y);
      this.zones.push({ x: cx + DIRS[d.d][0] * (cs / 2 - 0.9), z: cz + DIRS[d.d][1] * (cs / 2 - 0.9), r: 1.3 });
    }
    return { o, L, W, H: this.ceilOf(r) };
  }

  // A light for the world (baked) and the fixtures.
  light(l) {
    this.lights.push({ state: 'on', axis: 0, section: -1, room: -1, ...l });
  }
}

// Inside furnished rooms a body can't always walk straight from one cell
// centre to the next (pews, desks, machines). Entities path cell to cell,
// so mark those steps as barred: invisible, see-through, and not in the
// collision (call this after the world has built it). Steps that would cut
// anything off from `start` are reopened.
export function blockFurnishedSteps(map, world, furnished, start) {
  const blocked = [];
  const walk = (sx, sz, tx, tz) => {
    const p = { x: sx, z: sz };
    world.collide(p, 0.32);
    for (let i = 0; i < 120; i++) {
      const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz);
      if (l < 0.05) break;
      const st = Math.min(0.05, l);
      p.x += (dx / l) * st;
      p.z += (dz / l) * st;
      world.collide(p, 0.32);
    }
    return Math.hypot(tx - p.x, tz - p.z) < 0.6;
  };
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      if (!furnished(map.idx(x, y))) continue;
      for (const d of [0, 2]) {
        if (!map.canMove(x, y, d)) continue;
        const [ax, az] = map.cellCenter(x, y), [bx, bz] = map.cellCenter(x + DIRS[d][0], y + DIRS[d][1]);
        if (walk(ax, az, bx, bz) && walk(bx, bz, ax, az)) continue;
        const e = map.edge(x, y, d);
        map.setEdge(e, EDGE_BARS);
        blocked.push([e, map.idx(x, y), map.idx(x + DIRS[d][0], y + DIRS[d][1])]);
      }
    }
  }
  for (let pass = 0; pass < 40; pass++) {
    const dist = map.bfs(start[0], start[1]);
    const reopen = blocked.filter(([e, a, b]) => map.getEdge(e) === EDGE_BARS && (dist[a] >= 0) !== (dist[b] >= 0));
    if (!reopen.length) break;
    for (const [e] of reopen) map.setEdge(e, EDGE_OPEN);
  }
}
