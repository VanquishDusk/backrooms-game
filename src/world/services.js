import { DIRS, EDGE_WALL, EDGE_EXIT } from './GridMap.js';

// Wall and ceiling services for industrial grid levels (Levels 2 and 3).
//
// planServices() plans everything bolted to the walls and ceilings, as pure data:
// pipe polylines, brackets, ledges, cables, ceiling ducts and trays, the
// 45-degree corner cuts, and the collision boxes all of that needs.
//
// Wall services follow "faces": a run of wall along one side of a tunnel.
// Faces meeting at an inside corner are linked into chains, and a chain
// shares one bundle profile, so pipes run continuously, turn corners with an
// elbow, follow a 45-degree cut along the diagonal, and only dive into the
// wall (or rise into the ceiling) where the wall itself ends.

const T = 0.08; // half wall thickness (GridWorld WALL_T / 2)
const SQ2 = Math.SQRT2;

// Bundle profiles. o = distance from the wall face to the pipe's centre.
// A level can pass its own (opts.profiles / opts.pick).
export const UTILITY_PROFILES = {
  heavy: (rng) => [
    { k: 'lag', r: 0.17, o: 0.2, y: rng.range(0.42, 0.55) },
    { k: 'lag', r: 0.12, o: 0.15, y: rng.range(0.92, 1.02) },
    ...(rng.chance(0.7) ? [{ k: 'red', r: 0.038, o: 0.33, y: 1.24 }] : []),
    { k: 'rust', r: 0.06, o: 0.09, y: rng.range(1.48, 1.6) },
    { k: 'conduit', r: 0.021, o: 0.04, y: 2.22 },
    { k: 'conduit', r: 0.021, o: 0.04, y: 2.3 },
    { k: 'cable', r: 0.028, o: 0.05, y: 2.42 },
  ],
  mixed: (rng) => [
    { k: 'galv', r: 0.04, o: 0.06, y: 0.38 },
    { k: 'rust', r: 0.07, o: 0.1, y: rng.range(0.9, 1.0) },
    { k: 'rust', r: 0.045, o: 0.08, y: 1.13 },
    { k: 'lag', r: 0.15, o: 0.18, y: rng.range(1.45, 1.55) },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.2 },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.27 },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.34 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.45 },
  ],
  ledge: (rng) => [
    { k: 'rust', r: 0.08, o: 0.12, y: rng.range(1.25, 1.32) },
    { k: 'rust', r: 0.05, o: 0.09, y: 1.52 },
    { k: 'conduit', r: 0.022, o: 0.04, y: 2.28 },
    { k: 'cable', r: 0.028, o: 0.05, y: 2.42 },
  ],
  conduit: (rng) => [
    { k: 'galv', r: 0.05, o: 0.07, y: rng.range(1.82, 1.95) },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.16 },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.23 },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.3 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.42 },
  ],
  bare: () => [
    { k: 'cable', r: 0.028, o: 0.045, y: 2.4 },
  ],
  room: () => [
    { k: 'galv', r: 0.06, o: 0.08, y: 2.1 },
    { k: 'conduit', r: 0.022, o: 0.04, y: 2.3 },
    { k: 'conduit', r: 0.022, o: 0.04, y: 2.38 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.48 },
  ],
  door: () => [],
};
export const LEDGE = { h: 0.78, d: 0.32 };

/**
 * layout: { map, kind (0 = tunnel), doors [{edge}], chamfers, runs, inRun }
 * opts: {
 *   profiles   name -> (rng) => pipe list (default UTILITY_PROFILES)
 *   pick       (rng, run) => profile name for a tunnel chain
 *   H          ceiling height the services hang from (default map.height)
 *   ceilingOk  (x, y) => whether ceiling services may run through a cell
 *   ceilingKinds  pipe kinds to pick from for ceiling runs
 * }
 */
export function planServices(layout, rng, opts = {}) {
  const { map, kind, doors, chamfers } = layout;
  const cs = map.cellSize, N = map.cols;
  const H = opts.H ?? map.height;
  const PROFILES = opts.profiles || UTILITY_PROFILES;
  const pickProfile = opts.pick || pickUtility;
  const ceilingOk = opts.ceilingOk || (() => true);
  const wall = (x, y, d) => {
    const v = map.getEdge(map.edge(x, y, d));
    return v === EDGE_WALL || v === EDGE_EXIT;
  };
  const isTunnel = (x, y) => kind[map.idx(x, y)] === 0;
  const doorOn = (x, y, d) => doors.some((o) => sameEdge(o.edge, map.edge(x, y, d)));
  const chamferAt = new Map(chamfers.map((c) => [map.idx(c.x, c.y), c]));

  // ---- Faces ---------------------------------------------------------------
  // A run of wall on side d of consecutive, connected cells along axis a.
  const runs = [];
  const runOf = new Map(); // `${x},${y},${d}` -> run index
  for (let d = 0; d < 4; d++) {
    const a = d >= 2 ? 0 : 2; // along x for N/S walls, along y for E/W walls
    const back = a ^ 1;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!wall(x, y, d) || runOf.has(`${x},${y},${d}`)) continue;
        // Only start where the previous cell doesn't continue this face.
        const px = x + DIRS[back][0], py = y + DIRS[back][1];
        if (map.canMove(x, y, back) && wall(px, py, d) && isTunnel(px, py) === isTunnel(x, y)) continue;
        const cells = [[x, y]];
        let cx = x, cy = y;
        for (;;) {
          const nx = cx + DIRS[a][0], ny = cy + DIRS[a][1];
          if (!map.canMove(cx, cy, a) || !wall(nx, ny, d) || isTunnel(nx, ny) !== isTunnel(cx, cy)) break;
          cx = nx;
          cy = ny;
          cells.push([cx, cy]);
        }
        const id = runs.length;
        for (const [ux, uy] of cells) runOf.set(`${ux},${uy},${d}`, id);
        const tunnel = isTunnel(x, y);
        runs.push({ id, d, a, cells, tunnel, door: cells.some(([ux, uy]) => doorOn(ux, uy, d)) });
      }
    }
  }

  // Geometry of a run: wall line, interior normal, along-axis extent.
  for (const r of runs) {
    const [x0, y0] = r.cells[0], [x1, y1] = r.cells[r.cells.length - 1];
    const n = [-DIRS[r.d][0], -DIRS[r.d][1]]; // points into the tunnel
    r.n = n;
    r.dir = [DIRS[r.a][0], DIRS[r.a][1]];
    if (r.a === 0) {
      r.line = (r.d === 2 ? y0 + 1 : y0) * cs; // z of the wall
      r.s0 = x0 * cs;
      r.s1 = (x1 + 1) * cs;
    } else {
      r.line = (r.d === 0 ? x0 + 1 : x0) * cs; // x of the wall
      r.s0 = y0 * cs;
      r.s1 = (y1 + 1) * cs;
    }
  }
  // 2D point on a run's wall at along-coordinate s, `off` metres out from the wall line.
  const at = (r, s, off) => (r.a === 0 ? [s, r.line + r.n[1] * off] : [r.line + r.n[0] * off, s]);

  // ---- Ends and links --------------------------------------------------------
  for (const r of runs) {
    r.ends = [null, null];
    for (const k of [0, 1]) {
      const [cx, cy] = r.cells[k ? r.cells.length - 1 : 0];
      const dir = k ? r.a : r.a ^ 1;
      if (!map.canMove(cx, cy, dir) || isTunnel(cx + DIRS[dir][0], cy + DIRS[dir][1]) !== isTunnel(cx, cy)) {
        // Inside corner: link to the face on side `dir` of the same cell.
        const partner = runOf.get(`${cx},${cy},${dir}`);
        const ch = chamferAt.get(map.idx(cx, cy));
        const linkable = partner != null && !r.door && !runs[partner].door && runs[partner].tunnel === r.tunnel && map.canMove(cx, cy, dir) === false;
        r.ends[k] = { type: linkable ? (ch && ch.walls.includes(r.d) && ch.walls.includes(dir) ? 'chamfer' : 'corner') : 'dive', partner, cell: [cx, cy], dir, ch };
      } else {
        r.ends[k] = { type: 'dive' };
      }
    }
  }

  // Chains of linked faces share a profile.
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const r of runs) {
    for (const e of r.ends) if (e.type !== 'dive') parent[find(r.id)] = find(e.partner);
  }
  const chains = new Map();
  for (const r of runs) {
    const root = find(r.id);
    if (!chains.has(root)) chains.set(root, []);
    chains.get(root).push(r);
  }

  const out = {
    pipes: [], // { k, r, pts: [[x,y,z], ...] }
    struts: [], // { x, z, y0, y1, a } a = axis of the wall (0 = x, 1 = z)
    arms: [], // boxes [cx, cy, cz, sx, sy, sz]
    ledges: [], // boxes [x0, z0, x1, z1]
    boxes: [], // collision [x0, z0, x1, z1]
    chamferQuads: [], // { a: [x,z], b: [x,z], n: [nx,nz], cell }
    hangers: [], // { x, z, y }
    trays: [], // { a: [x,z], b: [x,z], y, w }
    signs: [], // { x, z, y, nx, nz }
    clutter: [], // { x, z, nx, nz, room }
    faces: runs,
    depthOf: new Map(), // `${x},${y},${side}` -> how far low services stick out
  };

  // Collision for a 45-degree cut: a staircase of boxes filling the triangle.
  function staircase(g, leg) {
    const steps = Math.ceil(leg / 0.25);
    for (let k = 0; k < steps; k++) {
      const t0 = (k / steps) * leg, t1 = ((k + 1) / steps) * leg;
      const reach = leg - (t0 + t1) / 2;
      const p0 = add(g.C, scale(g.alongA, t0));
      const p1 = add(g.C, add(scale(g.alongA, t1), scale(g.alongB, reach)));
      out.boxes.push([Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])]);
    }
  }

  // ---- Chamfers ------------------------------------------------------------------
  // The cut: corner point C of the two wall lines, legs along each wall.
  const chamferGeom = new Map();
  for (const ch of chamfers) {
    const [wa, wb] = ch.walls; // the two walled sides
    const cx = ch.x * cs, cz = ch.y * cs;
    const C = [cx + (wa === 0 || wb === 0 ? cs : 0), cz + (wa === 2 || wb === 2 ? cs : 0)];
    // Unit vectors from C along each wall, into the cell.
    const alongA = wa >= 2 ? [C[0] === cx ? 1 : -1, 0] : [0, C[1] === cz ? 1 : -1];
    const alongB = wb >= 2 ? [C[0] === cx ? 1 : -1, 0] : [0, C[1] === cz ? 1 : -1];
    const A = [C[0] + alongA[0] * ch.leg, C[1] + alongA[1] * ch.leg];
    const B = [C[0] + alongB[0] * ch.leg, C[1] + alongB[1] * ch.leg];
    const m = norm([alongA[0] + alongB[0], alongA[1] + alongB[1]]); // into the tunnel
    // Visible face: the hypotenuse clipped to the two wall faces.
    const fa = intersect(A, sub(B, A), add(C, scale(alongB, T)), alongA);
    const fb = intersect(A, sub(B, A), add(C, scale(alongA, T)), alongB);
    const g = { C, A, B, m, ch };
    chamferGeom.set(map.idx(ch.x, ch.y), g);
    out.chamferQuads.push({ a: fa, b: fb, n: m, cell: [ch.x, ch.y] });
    g.alongA = alongA;
    g.alongB = alongB;
    staircase(g, ch.leg);
  }

  // Pipe line of a run for offset `o`: point + direction.
  const lineOf = (r, o) => [at(r, r.s0, T + o), r.dir];

  // Where a pipe at offset o meets the corner at end k of run r.
  // Returns the point(s) to add *after* this run's straight part.
  const cornerPoints = (r, k, o) => {
    const e = r.ends[k];
    const p = runs[e.partner];
    const [P1, D1] = lineOf(r, o);
    const [P2, D2] = lineOf(p, o);
    if (e.type === 'corner') return [intersect(P1, D1, P2, D2)];
    const g = chamferGeom.get(map.idx(e.cell[0], e.cell[1]));
    const HP = add(g.A, scale(g.m, o + 0.02));
    const HD = sub(g.B, g.A);
    return [intersect(P1, D1, HP, HD), intersect(P2, D2, HP, HD)];
  };

  // ---- Bundles along chains --------------------------------------------------------
  for (const list of chains.values()) {
    // Order the chain: start from a run with an unlinked end.
    const first = list.find((r) => r.ends.some((e) => e.type === 'dive')) || list[0];
    const order = []; // [run, forward]
    const seen = new Set();
    let cur = first;
    let fwd = !(first.ends[0].type !== 'dive' && first.ends[1].type === 'dive');
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      order.push([cur, fwd]);
      const exitEnd = cur.ends[fwd ? 1 : 0];
      if (exitEnd.type === 'dive') break;
      const next = runs[exitEnd.partner];
      // Enter the next run from whichever of its ends links back to cur.
      const entering = next.ends[0].type !== 'dive' && next.ends[0].partner === cur.id ? 0 : 1;
      fwd = entering === 0;
      cur = next;
    }
    const sample = list[0];
    const pname = sample.door ? 'door' : !sample.tunnel ? 'room' : pickProfile(rng, sample);
    const profile = (PROFILES[pname] || UTILITY_PROFILES[pname] || (() => []))(rng);
    for (const [r] of order) r.profile = pname;
    const closed = order.length > 1 && order[0][0].ends[order[0][1] ? 0 : 1].type !== 'dive';

    for (const p of profile) {
      const pts2 = []; // [x, z]
      const stubs = [null, null];
      order.forEach(([r, f], i) => {
        const startEnd = r.ends[f ? 0 : 1];
        if (i === 0) {
          if (startEnd.type === 'dive' || !closed) {
            const s = f ? r.s0 + p.r + 0.14 : r.s1 - p.r - 0.14;
            const pt = at(r, s, T + p.o);
            pts2.push(pt);
            stubs[0] = { r, pt };
          } else {
            pts2.push(...cornerPoints(r, f ? 0 : 1, p.o).reverse());
          }
        }
        const endK = f ? 1 : 0;
        const e = r.ends[endK];
        if (e.type === 'dive') {
          const s = f ? r.s1 - p.r - 0.14 : r.s0 + p.r + 0.14;
          const pt = at(r, s, T + p.o);
          pts2.push(pt);
          stubs[1] = { r, pt };
        } else if (i < order.length - 1 || closed) {
          pts2.push(...cornerPoints(r, endK, p.o));
        }
      });
      if (pts2.length < 2) continue;
      const pts = pts2.map(([x, z]) => [x, p.y, z]);
      // Open ends: dive into the wall, or rise into the ceiling.
      for (const k of [0, 1]) {
        const st = stubs[k];
        if (!st) continue;
        const rise = p.y > 1.7 ? rng.chance(0.6) : rng.chance(0.2);
        const tip = rise
          ? [st.pt[0], H + 0.05, st.pt[1]]
          : [st.pt[0] - st.r.n[0] * (p.o + 0.04), p.y, st.pt[1] - st.r.n[1] * (p.o + 0.04)];
        if (k === 0) pts.unshift(tip);
        else pts.push(tip);
      }
      out.pipes.push({ k: p.k, r: p.r, pts, flanges: p.k === 'rust' || p.k === 'galv' || p.k === 'red' });
    }

    // Per-run extras: brackets, ledges, collision, signs, clutter spots.
    const lowDepth = profile.filter((p) => p.y - p.r < 1.35).reduce((m, p) => Math.max(m, p.o + p.r), 0);
    const strutPipes = profile.filter((p) => p.k !== 'cable');
    for (const [r] of order) {
      const lo = r.s0 + (r.ends[0].type === 'dive' ? 0 : r.ends[0].type === 'chamfer' ? r.ends[0].ch.leg : T);
      const hi = r.s1 - (r.ends[1].type === 'dive' ? 0 : r.ends[1].type === 'chamfer' ? r.ends[1].ch.leg : T);
      if (hi - lo < 0.05) continue;
      const depth = pname === 'ledge' ? Math.max(LEDGE.d, lowDepth) : lowDepth;
      for (const [cx, cy] of r.cells) out.depthOf.set(`${cx},${cy},${r.d}`, depth);
      // Low pipes crossing a 45-degree cut need collision along the diagonal too.
      for (const e of r.ends) if (e.type === 'chamfer' && depth > 0) staircase(chamferGeom.get(map.idx(e.cell[0], e.cell[1])), e.ch.leg + depth * SQ2);
      if (depth > 0) {
        const a = at(r, lo, T), b = at(r, hi, T + depth);
        out.boxes.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
      }
      if (pname === 'ledge') {
        const a = at(r, lo - (r.ends[0].type === 'dive' ? T : 0), T - 0.01), b = at(r, hi + (r.ends[1].type === 'dive' ? T : 0), T + LEDGE.d);
        out.ledges.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
      }
      // Strut channel brackets.
      if (strutPipes.length) {
        const ys = strutPipes.map((p) => [p.y - p.r, p.y + p.r]);
        const y0 = Math.min(...ys.map((v) => v[0])) - 0.06, y1 = Math.max(...ys.map((v) => v[1])) + 0.04;
        const span = hi - lo;
        const nb = Math.max(1, Math.floor(span / 1.9));
        for (let i = 0; i < nb; i++) {
          const s = lo + (span * (i + 0.5)) / nb;
          const [x, z] = at(r, s, T + 0.02);
          out.struts.push({ x, z, y0: pname === 'ledge' ? Math.max(y0, LEDGE.h) : y0, y1, a: r.a === 0 ? 0 : 1 });
          for (const p of strutPipes) {
            if (p.o < 0.1) continue;
            const [ax, az] = at(r, s, T + p.o / 2);
            const len = p.o;
            out.arms.push(r.a === 0 ? [ax, p.y - p.r - 0.018, az, 0.035, 0.03, len] : [ax, p.y - p.r - 0.018, az, len, 0.03, 0.035]);
          }
          // A sign between the brackets, now and then.
          if (i < nb - 1 && r.tunnel && rng.chance(0.07)) {
            const [sx, sz] = at(r, s + span / nb / 2, T + 0.006);
            out.signs.push({ x: sx, z: sz, y: 1.86, nx: r.n[0], nz: r.n[1] });
          }
        }
      }
      // Floor clutter goes against faces with nothing low on them.
      if (lowDepth === 0 && pname !== 'ledge' && !r.door && hi - lo > 1.2) {
        const n = r.tunnel ? (rng.chance(0.35) ? 1 : 0) : 2;
        for (let i = 0; i < n; i++) {
          const s = rng.range(lo + 0.5, hi - 0.5);
          const [x, z] = at(r, s, T);
          out.clutter.push({ x, z, nx: r.n[0], nz: r.n[1], a: r.a, room: !r.tunnel });
        }
      }
    }
  }

  // ---- Ceiling services along straight runs --------------------------------------
  const { runs: straight, inRun } = layout;
  for (const run of straight) {
    if (run.service === 'none') continue;
    // z-runs give way where they cross an x-run (those pass straight through).
    const segs = [];
    let curSeg = [];
    for (const [x, y] of run.cells) {
      if ((run.axis === 1 && inRun[0][map.idx(x, y)] >= 0) || !ceilingOk(x, y)) {
        if (curSeg.length) segs.push(curSeg);
        curSeg = [];
        continue;
      }
      curSeg.push([x, y]);
    }
    if (curSeg.length) segs.push(curSeg);
    for (const seg of segs) {
      if (seg.length < 2 && run.axis === 1) continue;
      const [ax, ay] = seg[0], [bx, by] = seg[seg.length - 1];
      const ca = map.cellCenter(ax, ay), cb = map.cellCenter(bx, by);
      const dir = run.axis === 0 ? [1, 0] : [0, 1];
      const lat = run.axis === 0 ? [0, 1] : [1, 0];
      // Services turn up into the slab before each end (clear of corner cuts).
      const extA = -0.5, extB = -0.5;
      const p0 = sub(ca, scale(dir, extA)), p1 = add(cb, scale(dir, extB));
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (len < 1) continue;
      const side = run.side;
      const items = [];
      if (run.service === 'duct' && run.axis === 0) {
        items.push({ k: 'duct', r: 0.26, off: side * 0.42, y: H - 0.36 });
      } else if (run.service === 'tray') {
        out.trays.push({ a: add(p0, scale(lat, side * 0.45)), b: add(p1, scale(lat, side * 0.45)), y: H - 0.32, w: 0.34, axis: run.axis });
      } else {
        const n = rng.int(2, 3);
        let off = 0.22;
        for (let i = 0; i < n; i++) {
          const k = rng.pick(opts.ceilingKinds || ['galv', 'rust', 'rust', 'lag']);
          const r = k === 'lag' ? rng.range(0.09, 0.12) : rng.range(0.035, 0.075);
          off += r;
          items.push({ k, r, off: side * off, y: H - 0.1 - r - (run.axis === 1 ? 0.03 : 0) });
          off += r + 0.04;
        }
      }
      for (const it of items) {
        const a = add(p0, scale(lat, it.off)), b = add(p1, scale(lat, it.off));
        const pts = [[a[0], it.y, a[1]], [b[0], it.y, b[1]]];
        pts.unshift([a[0], H + 0.05, a[1]]);
        pts.push([b[0], H + 0.05, b[1]]);
        out.pipes.push({ k: it.k, r: it.r, pts, flanges: it.k !== 'lag' && it.k !== 'duct', ceiling: true });
      }
      // Hangers: threaded rod and a trapeze every ~1.6 m.
      if (items.length || run.service === 'tray') {
        const nh = Math.max(1, Math.round(len / 1.6));
        for (let i = 0; i < nh; i++) {
          const s = (i + 0.5) / nh;
          const c = [p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s];
          const offs = run.service === 'tray' ? [side * 0.45] : items.map((it) => it.off);
          const lowY = run.service === 'tray' ? H - 0.34 : Math.min(...items.map((it) => it.y - it.r)) - 0.02;
          const minO = Math.min(...offs) - (run.service === 'tray' ? 0.2 : 0.12);
          const maxO = Math.max(...offs) + (run.service === 'tray' ? 0.2 : 0.12);
          out.hangers.push({ x: c[0], z: c[1], lat, o0: minO, o1: maxO, y: lowY, axis: run.axis });
        }
      }
    }
  }

  return out;
}

function pickUtility(rng) {
  const r = rng.next();
  return r < 0.3 ? 'heavy' : r < 0.6 ? 'mixed' : r < 0.73 ? 'ledge' : r < 0.91 ? 'conduit' : 'bare';
}

// ---- 2D helpers ---------------------------------------------------------------
function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function scale(a, k) { return [a[0] * k, a[1] * k]; }
function norm(a) { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }
// Intersection of lines P1 + t*D1 and P2 + s*D2.
function intersect(P1, D1, P2, D2) {
  const den = D1[0] * D2[1] - D1[1] * D2[0];
  if (Math.abs(den) < 1e-9) return [...P2];
  const t = ((P2[0] - P1[0]) * D2[1] - (P2[1] - P1[1]) * D2[0]) / den;
  return [P1[0] + D1[0] * t, P1[1] + D1[1] * t];
}

export function sameEdge(a, b) {
  return a.h === b.h && a.x === b.x && a.y === b.y;
}

// ---- Geometry -------------------------------------------------------------------

const PIPE_SEG = { lag: 9, duct: 11, rust: 7, galv: 6, red: 6, conduit: 4, cable: 4, black: 7, brass: 8, copper: 6 };
const PIPE_V = { lag: 0.5, duct: 1.4, rust: 0.7, galv: 0.6, red: 0.6, conduit: 0.5, cable: 0.5 };
const NO_CAPS = ['top', 'bottom'];
const NO_TOP = ['top'];

function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Builds a planServices() plan into ChunkedBuilders. Pipes go to a builder
 * named after their kind (lag, rust, galv, red, conduit, cable, duct, or
 * any custom kind); brackets, hangers and trays to 'strut'; ledges to
 * 'ledge'; valves to 'red'/'rust'/'galv'. H = ceiling the hangers hang from.
 */
export function buildServices(cb, plan, rng, H) {
  for (const p of plan.pipes) {
    const name = p.k;
    const seg = PIPE_SEG[p.k] || 6;
    const vScale = PIPE_V[p.k] || 0.6;
    let v = 0;
    const pts = p.pts;
    // Bends: each segment runs on past the corner by r*tan(angle/2), so
    // the two overlap into a solid joint without extra elbow geometry.
    const ext = pts.map((q, j) => {
      if (j === 0 || j === pts.length - 1) return 0;
      const a = pts[j - 1], c = pts[j + 1];
      const d1 = unit([q[0] - a[0], q[1] - a[1], q[2] - a[2]]), d2 = unit([c[0] - q[0], c[1] - q[1], c[2] - q[2]]);
      const cos = Math.max(-0.99, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]));
      return Math.min(1, Math.sqrt((1 - cos) / (1 + cos))) * p.r;
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const d = [(c[0] - a[0]) / len, (c[1] - a[1]) / len, (c[2] - a[2]) / len];
      const a2 = [a[0] - d[0] * ext[i], a[1] - d[1] * ext[i], a[2] - d[2] * ext[i]];
      const c2 = [c[0] + d[0] * ext[i + 1], c[1] + d[1] * ext[i + 1], c[2] + d[2] * ext[i + 1]];
      const b = cb.at(name, (a[0] + c[0]) / 2, (a[2] + c[2]) / 2);
      b.cylinder(a2, c2, p.r, seg, { vScale, v0: v - ext[i] * vScale });
      v += len * vScale;
      // Flanged joints every few metres on bare metal pipe.
      if (p.flanges && p.r >= 0.035 && len > 1.2) {
        const n = Math.floor(len / 3.2);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1), t2 = t + 0.05 / len;
          const f0 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
          const f1 = [a[0] + (c[0] - a[0]) * t2, a[1] + (c[1] - a[1]) * t2, a[2] + (c[2] - a[2]) * t2];
          b.cylinder(f0, f1, p.r * 1.4, seg);
        }
      }
      // Lagging has metal bands at its seams.
      if (p.k === 'lag' && len > 1.5 && Math.abs(c[1] - a[1]) < 0.01) {
        const n = Math.floor(len / 1.7);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1), t2 = t + 0.03 / len;
          const f0 = [a[0] + (c[0] - a[0]) * t, a[1], a[2] + (c[2] - a[2]) * t];
          const f1 = [a[0] + (c[0] - a[0]) * t2, a[1], a[2] + (c[2] - a[2]) * t2];
          cb.at('galv', f0[0], f0[2]).cylinder(f0, f1, p.r * 1.03, seg);
        }
      }
      // A valve now and then.
      if ((p.k === 'rust' || p.k === 'red') && p.r >= 0.05 && len > 2 && !p.ceiling && rng.chance(0.18)) {
        const t = rng.range(0.3, 0.7);
        const m = [a[0] + (c[0] - a[0]) * t, a[1], a[2] + (c[2] - a[2]) * t];
        valve(cb, m, [c[0] - a[0], 0, c[2] - a[2]], p.r);
      }
    }
  }
  // Strut channel brackets and their arms.
  for (const s of plan.struts) {
    cb.at('strut', s.x, s.z).box(s.x, (s.y0 + s.y1) / 2, s.z, s.a === 0 ? 0.042 : 0.045, s.y1 - s.y0, s.a === 0 ? 0.045 : 0.042, 0, 1, NO_CAPS);
  }
  for (const [x, y, z, sx, sy, sz] of plan.arms) cb.at('strut', x, z).box(x, y, z, sx, sy, sz, 0, 1, NO_TOP);
  // Ledges.
  for (const [x0, z0, x1, z1] of plan.ledges) {
    cb.at('ledge', (x0 + x1) / 2, (z0 + z1) / 2).aabb(x0, 0, z0, x1, LEDGE.h, z1, 1, ['bottom']);
  }
  // Cable trays with their load.
  for (const t of plan.trays) {
    const b = cb.at('strut', (t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2);
    const x0 = Math.min(t.a[0], t.b[0]), x1 = Math.max(t.a[0], t.b[0]);
    const z0 = Math.min(t.a[1], t.b[1]), z1 = Math.max(t.a[1], t.b[1]);
    const w = t.w / 2;
    if (t.axis === 0) {
      b.aabb(x0, t.y - 0.01, z0 - w, x1, t.y, z0 + w);
      b.aabb(x0, t.y, z0 - w, x1, t.y + 0.08, z0 - w + 0.012);
      b.aabb(x0, t.y, z0 + w - 0.012, x1, t.y + 0.08, z0 + w);
    } else {
      b.aabb(x0 - w, t.y - 0.01, z0, x0 + w, t.y, z1);
      b.aabb(x0 - w, t.y, z0, x0 - w + 0.012, t.y + 0.08, z1);
      b.aabb(x0 + w - 0.012, t.y, z0, x0 + w, t.y + 0.08, z1);
    }
    const cables = cb.at('cable', (x0 + x1) / 2, (z0 + z1) / 2);
    for (let k = 0; k < 5; k++) {
      const o = -w + 0.04 + k * ((t.w - 0.08) / 4);
      const r = 0.018 + (k % 2) * 0.008;
      const y = t.y + r + (k % 3 === 1 ? 0.02 : 0);
      if (t.axis === 0) cables.cylinder([x0, y, z0 + o], [x1, y, z0 + o], r, 5);
      else cables.cylinder([x0 + o, y, z0], [x0 + o, y, z1], r, 5);
    }
  }
  // Hangers: threaded rods and a trapeze bar.
  for (const h of plan.hangers) {
    const b = cb.at('strut', h.x, h.z);
    const p0 = [h.x + h.lat[0] * h.o0, h.z + h.lat[1] * h.o0];
    const p1 = [h.x + h.lat[0] * h.o1, h.z + h.lat[1] * h.o1];
    for (const p of [p0, p1]) b.cylinder([p[0], H, p[1]], [p[0], h.y - 0.02, p[1]], 0.008, 4);
    const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
    const len = h.o1 - h.o0 + 0.04;
    b.box(cx, h.y - 0.02, cz, h.axis === 0 ? 0.04 : len, 0.04, h.axis === 0 ? len : 0.04);
  }
}

// Handwheel valve on a pipe: body, stem and a red wheel.
export function valve(cb, m, along, r) {
  const b = cb.at('red', m[0], m[2]);
  const l = Math.hypot(along[0], along[2]) || 1;
  const d = [along[0] / l, 0, along[2] / l];
  cb.at('rust', m[0], m[2]).cylinder([m[0] - d[0] * r * 1.6, m[1], m[2] - d[2] * r * 1.6], [m[0] + d[0] * r * 1.6, m[1], m[2] + d[2] * r * 1.6], r * 1.5, 8, { caps: true });
  const top = [m[0], m[1] + r * 1.5 + 0.12, m[2]];
  cb.at('galv', m[0], m[2]).cylinder([m[0], m[1] + r, m[2]], top, 0.012, 5);
  const R = 0.11;
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
    b.cylinder([top[0] + Math.cos(a0) * R, top[1], top[2] + Math.sin(a0) * R], [top[0] + Math.cos(a1) * R, top[1], top[2] + Math.sin(a1) * R], 0.012, 4);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.cylinder(top, [top[0] + Math.cos(a) * R, top[1], top[2] + Math.sin(a) * R], 0.008, 4);
  }
}
