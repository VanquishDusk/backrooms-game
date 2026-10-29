// Level 63 layout: wooden platforms on stilts high over the void, joined
// by rope bridges, plank bridges and monkey bars; ladders up to a second
// tier of smaller platforms; circular Meditation Points on the edges.
//
// Everything is plain data for the level to build and walk on:
//   platforms  { id, x, z, y, half (square) | r (round), kind, rails: [side -> bool], gaps: [{x, z, w}] }
//   links      { type: 'rope' | 'plank' | 'monkey' | 'ladder', a, b (platform ids), ax, az, ay, bx, bz, by }

export const SPACING = 17;
export const GRID = 6;
export const BASE = 40; // height of the lowest tier above the "ground" (there is none)
export const TIER = 7;

export function generateLevel63(rng) {
  const platforms = [];
  const links = [];
  const add = (p) => {
    p.id = platforms.length;
    p.gaps = [];
    platforms.push(p);
    return p;
  };
  // ---- Sites on a jittered grid --------------------------------------------------
  const site = [];
  const off = ((GRID - 1) * SPACING) / 2;
  const heightAt = (gx, gy) => BASE + Math.sin(gx * 1.3 + gy * 0.7) * 1.6 + Math.cos(gy * 1.1 - gx * 0.4) * 1.2;
  for (let gy = 0; gy < GRID; gy++) {
    site.push([]);
    for (let gx = 0; gx < GRID; gx++) {
      const centre = Math.abs(gx - 2.5) < 1 && Math.abs(gy - 2.5) < 1;
      if (!centre && !rng.chance(0.82)) {
        site[gy].push(null);
        continue;
      }
      const p = add({
        x: gx * SPACING - off + rng.range(-2.5, 2.5),
        z: gy * SPACING - off + rng.range(-2.5, 2.5),
        y: heightAt(gx, gy) + rng.range(-0.6, 0.6),
        half: rng.range(2.6, 4.2),
        kind: 'deck',
        gx,
        gy,
        tier: 0,
        used: [false, false, false, false],
      });
      site[gy].push(p);
    }
  }
  const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const edgePoint = (p, d, lateral = 0) => [p.x + DIR[d][0] * p.half + DIR[d][1] * lateral, p.z + DIR[d][1] * p.half + DIR[d][0] * lateral];
  // ---- Base-tier links: a spanning tree over the grid, plus some loops ----------------
  const cand = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const a = site[gy][gx];
      if (!a) continue;
      for (const d of [0, 2]) {
        const nx = gx + DIR[d][0], ny = gy + DIR[d][1];
        if (nx >= GRID || ny >= GRID || !site[ny][nx]) continue;
        cand.push([a, site[ny][nx], d]);
      }
    }
  }
  rng.shuffle(cand);
  const parent = platforms.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b, d, tree) => {
    const [ax, az] = edgePoint(a, d);
    const [bx, bz] = edgePoint(b, d ^ 1);
    const type = tree ? (rng.chance(0.65) ? 'rope' : 'plank') : rng.chance(0.6) ? 'monkey' : rng.chance(0.5) ? 'rope' : 'plank';
    links.push({ type, a: a.id, b: b.id, ax, az, ay: a.y, bx, bz, by: b.y });
    a.used[d] = b.used[d ^ 1] = true;
    a.gaps.push({ x: ax, z: az, w: 2.0 });
    b.gaps.push({ x: bx, z: bz, w: 2.0 });
  };
  for (const [a, b, d] of cand) {
    if (find(a.id) === find(b.id)) continue;
    parent[find(a.id)] = find(b.id);
    join(a, b, d, true);
  }
  for (const [a, b, d] of cand) {
    if (a.used[d] || b.used[d ^ 1] || !rng.chance(0.4)) continue;
    join(a, b, d, false);
  }
  // Islands left over (sites with no neighbours): drop them.
  const root = find(site[2][2]?.id ?? site[3][3].id);
  const base = platforms.filter((p) => find(p.id) === root);
  // ---- Upper tier: some platforms have a ladder up to a smaller deck -------------
  const uppers = [];
  for (const p of base) {
    if (!rng.chance(0.4)) continue;
    const free = [0, 1, 2, 3].filter((d) => !p.used[d]);
    if (!free.length) continue;
    const d = rng.pick(free);
    const half = rng.range(2.0, 2.8);
    const [ex, ez] = edgePoint(p, d);
    const u = add({ x: ex + DIR[d][0] * half, z: ez + DIR[d][1] * half, y: p.y + TIER, half, kind: 'deck', tier: 1, used: [false, false, false, false], gx: p.gx, gy: p.gy });
    p.used[d] = u.used[d ^ 1] = true;
    links.push({ type: 'ladder', a: p.id, b: u.id, ax: ex - DIR[d][0] * 0.9, az: ez - DIR[d][1] * 0.9, ay: p.y, bx: ex + DIR[d][0] * 0.9, bz: ez + DIR[d][1] * 0.9, by: u.y });
    p.gaps.push({ x: ex, z: ez, w: 1.3 });
    u.gaps.push({ x: ex, z: ez, w: 1.3 });
    u.dir = d;
    uppers.push(u);
  }
  // Sky bridges between upper decks that face each other across a gap.
  for (let i = 0; i < uppers.length; i++) {
    for (let j = i + 1; j < uppers.length; j++) {
      const a = uppers[i], b = uppers[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : dz > 0 ? 2 : 3;
      const len = Math.hypot(dx, dz);
      if (len > 24 || len < 9 || a.used[d] || b.used[d ^ 1]) continue;
      if (Math.abs(Math.abs(d < 2 ? dz : dx)) > 3) continue;
      join(a, b, d, rng.chance(0.7));
    }
  }
  // ---- Meditation Points off the outside of the structure -------------------------
  const medi = [];
  const outer = rng.shuffle(base.filter((p) => p.gx === 0 || p.gy === 0 || p.gx === GRID - 1 || p.gy === GRID - 1));
  for (const p of outer) {
    if (medi.length >= 4) break;
    const d = p.gx === 0 ? 1 : p.gx === GRID - 1 ? 0 : p.gy === 0 ? 3 : 2;
    if (p.used[d]) continue;
    if (medi.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 30)) continue;
    const r = 3.6, gap = rng.range(6, 9);
    const [ex, ez] = edgePoint(p, d);
    const m = add({ x: ex + DIR[d][0] * (gap + r), z: ez + DIR[d][1] * (gap + r), y: p.y + rng.range(-0.8, 0.8), r, kind: 'meditation', tier: 0, used: [false, false, false, false] });
    links.push({ type: rng.chance(0.6) ? 'rope' : 'plank', a: p.id, b: m.id, ax: ex, az: ez, ay: p.y, bx: m.x - DIR[d][0] * r, bz: m.z - DIR[d][1] * r, by: m.y });
    p.used[d] = true;
    p.gaps.push({ x: ex, z: ez, w: 2.0 });
    m.gaps.push({ x: m.x - DIR[d][0] * r, z: m.z - DIR[d][1] * r, w: 2.0 });
    medi.push(m);
  }
  // A few railings are missing: the edge just stops.
  const keep = new Set([...base, ...uppers, ...medi].map((p) => p.id));
  const live = platforms.filter((p) => keep.has(p.id));
  for (const p of live) p.rails = [0, 1, 2, 3].map(() => p.kind === 'meditation' || rng.chance(0.82));
  const liveLinks = links.filter((l) => keep.has(l.a) && keep.has(l.b));
  // ---- Spawn: the middle of the structure ----------------------------------------
  const spawn = site[2][2] || site[3][3] || base[0];
  return { platforms: live, links: liveLinks, spawn, meditation: medi };
}
