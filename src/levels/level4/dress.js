// Furniture for Level 4's office floor. Deliberately sparse: most rooms are
// empty, and what's left looks like it was forgotten when everyone left.
// Each function takes a Dresser and a room frame and returns interactables.

// An office chair: five-star base, gas lift, seat, back.
function chair(D, o, x, z, rot) {
  const f = D.sub(o, x, z, rot);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    D.cyl('steel', f, [0, 0.06, 0], [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3], 0.018, 4);
  }
  D.cyl('steel', f, [0, 0.06, 0], [0, 0.42, 0], 0.025, 6);
  D.box('fabric', f, 0, 0.46, 0, 0.46, 0.08, 0.44);
  D.box('fabric', f, 0, 0.78, -0.21, 0.42, 0.5, 0.06);
}

function desk(D, o, x, z, rot, w = 1.4) {
  const f = D.sub(o, x, z, rot);
  D.box('laminate', f, 0, 0.73, 0, w, 0.04, 0.72);
  for (const s of [-1, 1]) D.box('cabinet', f, s * (w / 2 - 0.03), 0.36, 0, 0.04, 0.72, 0.68);
  D.box('cabinet', f, 0, 0.45, -0.33, w - 0.1, 0.5, 0.02);
  return f;
}

function filing(D, o, x, z, rot, drawers = 4) {
  const f = D.sub(o, x, z, rot);
  const h = drawers * 0.33;
  D.box('cabinet', f, 0, h / 2, 0, 0.46, h, 0.62);
  for (let k = 0; k < drawers; k++) D.box('chrome', f, 0, 0.22 + k * 0.33, 0.32, 0.14, 0.025, 0.02);
}

// A board on a wall: tile 0 whiteboard, 1 cork, 2 poster. (x, y, z) local, facing local +z.
function board(D, f, x, y, z, tile, w = 1.6, h = 0.8) {
  const u0 = tile / 3, u1 = (tile + 1) / 3;
  D.quad('boards', f, [[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]], [0, 0, 1], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
}

// Wall frame: local +z out of the wall at the room's wall `side`.
function wallFrame(D, o, L, W, side, at = 0) {
  // side: 0 = -z wall, 1 = +z wall, 2 = -x wall, 3 = +x wall
  if (side === 0) return D.sub(o, at, -W / 2, 0);
  if (side === 1) return D.sub(o, at, W / 2, Math.PI);
  if (side === 2) return D.sub(o, -L / 2, at, Math.PI / 2);
  return D.sub(o, L / 2, at, -Math.PI / 2);
}

export function office(D, fr) {
  const { o, L, W } = fr;
  const out = {};
  if (D.rng.chance(0.65) && D.free(o, -0.8, -0.3, 0.8, 0.9)) {
    const f = desk(D, o, 0, 0, 0);
    D.solidRect(o, -0.72, -0.38, 0.72, 0.38);
    if (D.rng.chance(0.4)) {
      // An old beige monitor, dark.
      D.box('plastic', f, -0.2, 0.95, -0.1, 0.42, 0.38, 0.38);
      D.box('screen', f, -0.2, 0.96, 0.095, 0.34, 0.27, 0.01);
    }
    if (D.rng.chance(0.75)) chair(D, o, D.rng.range(-0.3, 0.3), 0.75, Math.PI + D.rng.range(-0.6, 0.6));
  }
  if (D.rng.chance(0.45)) {
    const x = L / 2 - 0.35, z = -W / 2 + 0.4;
    if (D.free(o, x - 0.25, z - 0.32, x + 0.25, z + 0.32)) {
      filing(D, o, x, z, -Math.PI / 2, D.rng.pick([2, 4]));
      D.solidRect(o, x - 0.32, z - 0.25, x + 0.32, z + 0.25);
    }
  }
  if (D.rng.chance(0.4)) board(D, wallFrame(D, o, L, W, 0), 0, 1.5, 0.01, D.rng.int(0, 2));
  return out;
}

// Open plan: a few clusters of cubicles, half of them taken apart.
export function openPlan(D, fr) {
  const { o, L, W } = fr;
  for (let x = -L / 2 + 1.6; x < L / 2 - 1.4; x += 3.2) {
    for (let z = -W / 2 + 1.6; z < W / 2 - 1.4; z += 3.2) {
      if (!D.rng.chance(0.18) || !D.free(o, x - 1.25, z - 1.25, x + 1.25, z + 1.25)) continue;
      // A cross of partitions making four desks.
      D.box('partition', o, x, 0.65, z, 2.4, 1.3, 0.06);
      D.box('partition', o, x, 0.65, z, 0.06, 1.3, 2.4);
      D.box('chrome', o, x, 1.31, z, 2.42, 0.02, 0.08);
      D.solidRect(o, x - 1.2, z - 0.05, x + 1.2, z + 0.05);
      D.solidRect(o, x - 0.05, z - 1.2, x + 0.05, z + 1.2);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (!D.rng.chance(0.55)) continue;
        D.box('laminate', o, x + sx * 0.6, 0.73, z + sz * 0.33, 1.1, 0.04, 0.6);
        if (D.rng.chance(0.5)) chair(D, o, x + sx * 0.6, z + sz * 0.95, sz > 0 ? Math.PI : 0);
      }
    }
  }
  return {};
}

export function conference(D, fr) {
  const { o, L, W } = fr;
  const tl = Math.min(3.2, L - 2), tw = 1.1;
  if (D.free(o, -tl / 2 - 0.4, -tw / 2 - 0.6, tl / 2 + 0.4, tw / 2 + 0.6)) {
    D.box('laminate', o, 0, 0.74, 0, tl, 0.05, tw);
    for (const x of [-tl / 3, tl / 3]) D.cyl('steel', o, [x, 0, 0], [x, 0.72, 0], 0.06, 8);
    D.solidRect(o, -tl / 2, -tw / 2, tl / 2, tw / 2);
    // A speakerphone in the middle, and chairs, some pushed back.
    D.box('screen', o, 0, 0.79, 0, 0.26, 0.05, 0.26);
    for (let x = -tl / 2 + 0.45; x < tl / 2 - 0.2; x += 0.75) {
      for (const s of [-1, 1]) if (D.rng.chance(0.7)) chair(D, o, x + D.rng.range(-0.1, 0.1), s * (tw / 2 + 0.35 + D.rng.range(0, 0.3)), s > 0 ? Math.PI : 0);
    }
  }
  board(D, wallFrame(D, o, L, W, 2), 0, 1.5, 0.01, 0, 1.8, 0.9);
  return {};
}

// Break room: vending machines, a water cooler, a counter, a table.
export function breakRoom(D, fr) {
  const { o, L, W } = fr;
  const out = { vending: [], coolers: [] };
  // Vending machines against the -z wall.
  for (let x = -L / 2 + 0.6; x < L / 2 - 0.5 && out.vending.length < 2; x += 1.05) {
    if (!D.free(o, x - 0.46, -W / 2, x + 0.46, -W / 2 + 0.85)) continue;
    out.vending.push(vending(D, D.sub(o, x, -W / 2 + 0.42)));
    D.solidRect(o, x - 0.46, -W / 2, x + 0.46, -W / 2 + 0.85);
  }
  // Counter with a sink and a microwave against the +z wall.
  const cl = Math.min(2.2, L - 1.2);
  if (D.free(o, -cl / 2, W / 2 - 0.65, cl / 2, W / 2)) {
    const f = D.sub(o, 0, W / 2 - 0.32, Math.PI);
    D.box('laminate', f, 0, 0.9, 0, cl, 0.04, 0.62);
    D.box('cabinet', f, 0, 0.44, 0.02, cl, 0.88, 0.56);
    D.box('chrome', f, -cl / 4, 0.905, 0, 0.5, 0.012, 0.4);
    D.box('enamel', f, cl / 4, 1.07, -0.05, 0.5, 0.3, 0.36);
    D.box('screen', f, cl / 4 - 0.05, 1.07, 0.131, 0.3, 0.2, 0.01);
    D.solidRect(o, -cl / 2, W / 2 - 0.65, cl / 2, W / 2);
  }
  // Water cooler in a corner.
  const cx = L / 2 - 0.4, cz = -W / 2 + 0.4;
  if (D.free(o, cx - 0.25, cz - 0.25, cx + 0.25, cz + 0.25)) {
    out.coolers.push(cooler(D, D.sub(o, cx, cz)));
    D.solidRect(o, cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2);
  }
  // A small round table and chairs.
  if (D.free(o, -0.9, -0.9, 0.9, 0.9)) {
    D.cyl('laminate', o, [0, 0.72, 0], [0, 0.75, 0], 0.5, 16, { caps: true });
    D.cyl('steel', o, [0, 0, 0], [0, 0.72, 0], 0.04, 6);
    D.cyl('steel', o, [0, 0, 0], [0, 0.02, 0], 0.3, 10, { caps: true });
    D.solidRect(o, -0.45, -0.45, 0.45, 0.45);
    for (let k = 0; k < 3; k++) if (D.rng.chance(0.7)) {
      const a = k * 2.1 + D.rng.range(-0.3, 0.3);
      chair(D, o, Math.cos(a) * 0.8, Math.sin(a) * 0.8, -a - Math.PI / 2);
    }
  }
  return out;
}

export function storage(D, fr) {
  const { o, L, W } = fr;
  // Chairs stacked high, boxes, a folded table against the wall.
  for (let i = 0; i < 3; i++) {
    const x = D.rng.range(-L / 2 + 0.6, L / 2 - 0.6), z = D.rng.range(-W / 2 + 0.6, W / 2 - 0.6);
    if (!D.free(o, x - 0.4, z - 0.4, x + 0.4, z + 0.4)) continue;
    if (D.rng.chance(0.5)) {
      const n = D.rng.int(3, 7);
      for (let k = 0; k < n; k++) {
        D.box('fabric', o, x, 0.46 + k * 0.1, z, 0.46, 0.06, 0.44);
        D.box('steel', o, x, 0.75 + k * 0.1, z - 0.21, 0.42, 0.42, 0.03);
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) D.box('steel', o, x + sx * 0.2, 0.22, z + sz * 0.2, 0.025, 0.44, 0.025);
    } else {
      let y = 0;
      for (let k = 0; k < D.rng.int(1, 3); k++) {
        const s = D.rng.range(0.4, 0.6), h = D.rng.range(0.3, 0.45);
        D.box('cardboard', o, x + D.rng.range(-0.05, 0.05), y + h / 2, z, s, h, s * 0.8);
        y += h;
      }
    }
    D.solidRect(o, x - 0.32, z - 0.32, x + 0.32, z + 0.32);
  }
  return {};
}

// M.E.G. outpost: banner, tables, supplies, cots, a note.
export function megOutpost(D, fr) {
  const { o, L, W } = fr;
  const out = { crates: [], note: null, coolers: [] };
  if (D.free(o, -1.1, -0.5, 1.1, 0.5)) {
    for (const x of [-0.55, 0.55]) {
      D.box('olive', o, x, 0.74, 0, 1.05, 0.04, 0.8);
      for (const [dx, dz] of [[-0.48, -0.35], [0.48, -0.35], [-0.48, 0.35], [0.48, 0.35]]) D.box('steel', o, x + dx, 0.36, dz, 0.03, 0.72, 0.03);
    }
    D.box('olive', o, 0.6, 0.86, -0.15, 0.36, 0.2, 0.24);
    D.cyl('steel', o, [0.72, 0.96, -0.2], [0.76, 1.45, -0.24], 0.006, 4);
    D.quad('paper', o, [[-0.4, 0.763, -0.1], [-0.1, 0.763, -0.1], [-0.1, 0.763, 0.3], [-0.4, 0.763, 0.3]], [0, 1, 0]);
    D.solidRect(o, -1.1, -0.42, 1.1, 0.42);
    const [nx, , nz] = D.at(o, -0.25, 0, 0.1);
    out.note = { x: nx, z: nz };
    chair(D, o, -0.4, 0.8, Math.PI);
  }
  for (const x of [L / 2 - 0.5]) {
    for (const z of [-W / 2 + 0.5, W / 2 - 0.5]) {
      if (!D.free(o, x - 0.4, z - 0.4, x + 0.4, z + 0.4)) continue;
      const [wx, , wz] = D.at(o, x, 0, z);
      out.crates.push({ x: wx, z: wz, size: 0.66, rot: o.rot });
      D.solid.push([wx - 0.38, wz - 0.38, wx + 0.38, wz + 0.38]);
    }
  }
  for (const x of [-L / 2 + 0.55]) {
    for (const z of [-W / 2 + 1.05, W / 2 - 1.05]) {
      if (!D.free(o, x - 0.4, z - 0.95, x + 0.4, z + 0.95)) continue;
      D.box('olive', o, x, 0.32, z, 0.78, 0.08, 1.9);
      D.box('canvas', o, x, 0.39, z + 0.72, 0.6, 0.1, 0.32);
      D.solidRect(o, x - 0.4, z - 0.95, x + 0.4, z + 0.95);
    }
  }
  const cx = L / 2 - 0.4, cz = 0;
  if (D.free(o, cx - 0.25, cz - 0.25, cx + 0.25, cz + 0.25)) {
    out.coolers.push(cooler(D, D.sub(o, cx, cz)));
    D.solidRect(o, cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2);
  }
  out.banner = wallFrame(D, o, L, W, 0);
  return out;
}

// A wanderers' camp: sleeping bags, a lantern, tins, a note.
export function camp(D, fr) {
  const { o, L, W } = fr;
  const out = { note: null, lantern: null };
  for (let i = 0; i < 3; i++) {
    const x = -L / 2 + 0.7 + i * 0.85, z = W / 2 - 1.1;
    if (!D.free(o, x - 0.35, z - 0.9, x + 0.35, z + 0.9)) continue;
    D.box(D.rng.pick(['red', 'olive', 'fabric']), o, x, 0.07, z, 0.7, 0.12, 1.8);
    D.box('canvas', o, x, 0.15, z + 0.7, 0.5, 0.12, 0.3);
  }
  D.cyl('olive', o, [0, 0, 0], [0, 0.22, 0], 0.08, 8, { caps: true });
  out.lantern = D.at(o, 0, 0.3, 0);
  for (let k = 0; k < 6; k++) {
    const x = D.rng.range(-0.8, 0.8), z = D.rng.range(-0.8, 0.3);
    D.cyl('chrome', o, [x, 0, z], [x, 0.11, z], 0.035, 6, { caps: true });
  }
  const [nx, , nz] = D.at(o, 0.4, 0, -0.3);
  out.note = { x: nx, z: nz };
  D.quad('paper', o, [[0.3, 0.004, -0.45], [0.55, 0.004, -0.45], [0.55, 0.004, -0.12], [0.3, 0.004, -0.12]], [0, 1, 0]);
  return out;
}

// An empty room, now and then with one chair facing the wall.
export function emptyRoom(D, fr) {
  const { o, L, W } = fr;
  if (D.rng.chance(0.12) && D.free(o, -0.3, -W / 2 + 0.3, 0.3, -W / 2 + 0.9)) chair(D, o, 0, -W / 2 + 0.6, Math.PI);
  else if (D.rng.chance(0.15)) {
    const x = D.rng.range(-L / 2 + 0.5, L / 2 - 0.5), z = D.rng.range(-W / 2 + 0.5, W / 2 - 0.5);
    if (D.free(o, x - 0.3, z - 0.3, x + 0.3, z + 0.3)) D.box('cardboard', o, x, 0.2, z, 0.5, 0.4, 0.4);
  }
  return {};
}

// ---- Water sources (built facing local +z, backs to a wall) --------------------

export function vending(D, f) {
  D.box('vendcase', f, 0, 0.92, 0, 0.9, 1.84, 0.8);
  D.quad('vendfront', f, [[-0.43, 0.08, 0.401], [0.43, 0.08, 0.401], [0.43, 1.8, 0.401], [-0.43, 1.8, 0.401]], [0, 0, 1]);
  const [x, , z] = D.at(f, 0, 0, 0.75);
  return { type: 'vending', x, z, uses: 3, f };
}

export function cooler(D, f) {
  D.box('enamel', f, 0, 0.5, 0, 0.32, 1.0, 0.32);
  D.box('screen', f, 0, 0.82, 0.162, 0.1, 0.14, 0.01);
  D.cyl('jug', f, [0, 1.0, 0], [0, 1.42, 0], 0.15, 12, { caps: true });
  D.cyl('jug', f, [0, 1.42, 0], [0, 1.47, 0], 0.07, 10, { caps: true });
  const [x, , z] = D.at(f, 0, 0, 0.55);
  return { type: 'cooler', x, z, uses: 2, f };
}

export function fountain(D, f) {
  D.box('chrome', f, 0, 0.86, 0.17, 0.42, 0.14, 0.34);
  D.box('chrome', f, 0, 0.62, 0.05, 0.22, 0.36, 0.1);
  D.cyl('chrome', f, [0.06, 0.94, 0.1], [0.06, 0.97, 0.16], 0.012, 5);
  const [x, , z] = D.at(f, 0, 0, 0.6);
  return { type: 'fountain', x, z, uses: Infinity, f };
}
