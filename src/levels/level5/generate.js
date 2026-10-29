import { GridMap, EDGE_OPEN, EDGE_WALL, EDGE_EXIT, EDGE_BARS, DIRS } from '../../world/GridMap.js';

// Level 5 layout: the Terror Hotel.
//
//  - The Main Hall (west): long carpeted corridors lined with numbered
//    guest rooms, most of them locked; lobbies and lounges where the
//    corridors meet; the grand lobby with its stair up to Level 4; brass
//    elevators; the Homely Hotel's reception and dining room; a M.E.G.
//    "Housekeeping" closet
//  - The Beverly Room (the Eternal Ballroom) against the east side, with a
//    back door into the boiler room
//  - The Boiler Room (east): narrow pipe-lined service passages between
//    boiler halls, tank rooms and catwalk galleries over machinery pits.
//    The deeper you go the hotter it gets; the deepest hall has a furnace
//    with stairs down to Level 6

export const CELL = 2.8;
export const SIZE = 44;
export const CEIL = { CORR: 3.4, ROOM: 3.4, LOBBY: 5.6, BALL: 7.5, STAIR: 6.8, ELEV: 3.0, BCORR: 3.3, BOILER: 5.4, GALLERY: 6.2, VOID: 3.4 };
export const HEIGHT = 7.5;
export const ZONE = { CORR: 0, ROOM: 1, LOBBY: 2, BALL: 3, STAIR: 4, ELEV: 5, BCORR: 6, BROOM: 7, VOID: 8 };

const HOTEL = new Set([ZONE.CORR, ZONE.ROOM, ZONE.LOBBY, ZONE.BALL, ZONE.STAIR, ZONE.ELEV]);
export const inHotel = (z) => HOTEL.has(z);

export function generateLevel5(rng) {
  const N = SIZE;
  const map = new GridMap(N, N, CELL, HEIGHT);
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, EDGE_WALL);
  for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, EDGE_WALL);
  const total = N * N;
  const zone = new Uint8Array(total).fill(ZONE.VOID);
  const roomOf = new Int16Array(total).fill(-1);
  const ceil = new Float32Array(total).fill(CEIL.VOID);
  const idx = (x, y) => map.idx(x, y);
  const rooms = [];
  const addRoom = (r) => {
    r.id = rooms.length;
    r.cells = [];
    r.doors = [];
    rooms.push(r);
    return r;
  };
  const claim = (r, x, y, z) => {
    const i = idx(x, y);
    zone[i] = z;
    roomOf[i] = r.id;
    r.cells.push([x, y]);
  };
  const HX = N - rng.int(13, 15); // the boiler room starts here

  // ---- Reserved spaces in the Main Hall ---------------------------------------------
  const reserved = new Int16Array(total).fill(-1);
  const fits = (x, y, w, h, m = 1) => {
    if (x < 1 || y < 1 || x + w > HX - 1 || y + h > N - 1) return false;
    for (let yy = y - m; yy < y + h + m; yy++) for (let xx = x - m; xx < x + w + m; xx++) if (map.inBounds(xx, yy) && reserved[idx(xx, yy)] >= 0) return false;
    return true;
  };
  const reserve = (r, x, y, w, h) => {
    Object.assign(r, { x, y, w, h });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) reserved[idx(xx, yy)] = r.id;
  };
  // The ballroom against the boiler room.
  const ball = addRoom({ kind: 'ballroom' });
  {
    const w = rng.int(6, 7), h = rng.int(11, 13);
    const y = rng.int(4, N - h - 4);
    ball.x = HX - w;
    reserve(ball, HX - w, y, w, h);
  }
  // The grand lobby, with its stair bay (2 x 3 cells) off one end.
  const grand = addRoom({ kind: 'grand' });
  for (let t = 0; t < 400; t++) {
    const w = rng.int(6, 7), h = rng.int(7, 8);
    const x = rng.int(3, HX - w - 10), y = rng.int(5, N - h - 5);
    const up = rng.chance(0.5); // bay above (-y) or below (+y)
    const bx = x + Math.floor((w - 2) / 2), by = up ? y - 3 : y + h;
    if (!fits(Math.min(x, bx), Math.min(y, by), w, h + 3, 1)) continue;
    reserve(grand, x, y, w, h);
    grand.bay = { x: bx, y: by, w: 2, h: 3, dir: up ? 3 : 2 };
    for (let yy = by; yy < by + 3; yy++) for (let xx = bx; xx < bx + 2; xx++) reserved[idx(xx, yy)] = grand.id;
    break;
  }
  const want = [['lounge', [4, 5], [4, 6]], ['lounge', [4, 5], [4, 5]], ['homely', [4, 5], [5, 6]], ['housekeeping', [2, 2], [3, 3]], ['lounge', [4, 4], [4, 5]]];
  for (const [kind, ws, hs] of want) {
    const r = addRoom({ kind });
    for (let t = 0; t < 300; t++) {
      let w = rng.int(ws[0], ws[1]), h = rng.int(hs[0], hs[1]);
      if (rng.chance(0.5)) [w, h] = [h, w];
      const x = rng.int(1, HX - w - 2), y = rng.int(1, N - h - 1);
      if (!fits(x, y, w, h, 2)) continue;
      reserve(r, x, y, w, h);
      break;
    }
  }
  for (const r of rooms.slice()) {
    if (r.w == null) continue;
    const z = r.kind === 'ballroom' ? ZONE.BALL : r.kind === 'housekeeping' ? ZONE.ROOM : ZONE.LOBBY;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) claim(r, x, y, z);
    r.ceil = r.kind === 'ballroom' ? CEIL.BALL : r.kind === 'housekeeping' ? CEIL.ROOM : r.kind === 'homely' ? 4.4 : CEIL.LOBBY;
    for (const [x, y] of r.cells) ceil[idx(x, y)] = r.ceil;
    if (r.bay) {
      const b = r.bay;
      const stair = addRoom({ kind: 'stair', x: b.x, y: b.y, w: 2, h: 3, dir: b.dir, lobby: r.id });
      for (let y = b.y; y < b.y + 3; y++) for (let x = b.x; x < b.x + 2; x++) {
        claim(stair, x, y, ZONE.STAIR);
        ceil[idx(x, y)] = CEIL.STAIR;
      }
      r.stair = stair.id;
    }
  }

  // ---- Corridors ----------------------------------------------------------------------
  // Horizontal corridors every 5 cells (4-deep blocks of rooms between),
  // vertical ones every 8-11.
  const ys = [];
  for (let p = rng.int(2, 4); p < N - 2; p += 5) ys.push(p);
  const xs = [];
  for (let p = rng.int(2, 4); p < HX - 3; p += rng.int(8, 11)) xs.push(p);
  xs.push(HX - 1 - (rng.chance(0.5) ? 0 : 0)); // a corridor along the boiler room wall
  const isFree = (x, y) => reserved[idx(x, y)] < 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < HX; x++) {
      if (!isFree(x, y)) continue;
      if (ys.includes(y) || xs.includes(x)) zone[idx(x, y)] = ZONE.CORR;
    }
  }
  // A few corridors stop short.
  for (const y of ys) {
    if (!rng.chance(0.25)) continue;
    const from = rng.chance(0.5);
    for (let k = 0; k < rng.int(2, 6); k++) {
      const x = from ? k : HX - 2 - k;
      if (isFree(x, y) && !xs.includes(x)) zone[idx(x, y)] = ZONE.VOID;
    }
  }
  // A ring around every reserved space, so each one has corridor on all sides.
  for (const r of rooms) {
    if (r.w == null || r.kind === 'stair') continue;
    const x0 = r.x - 1, x1 = r.x + r.w, y0 = r.y - 1, y1 = r.y + r.h;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
        if (!map.inBounds(x, y) || x >= HX || !isFree(x, y)) continue;
        zone[idx(x, y)] = ZONE.CORR;
      }
    }
  }
  // Spurs: join each ring to the nearest corridor line.
  for (const r of rooms) {
    if (r.w == null || r.kind === 'stair') continue;
    const x0 = r.x - 1, x1 = r.x + r.w, y0 = r.y - 1, y1 = r.y + r.h;
    const paths = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!map.inBounds(x, y) || zone[idx(x, y)] !== ZONE.CORR) continue;
        const sides = [];
        if (x === x0) sides.push(1);
        if (x === x1) sides.push(0);
        if (y === y0) sides.push(3);
        if (y === y1) sides.push(2);
        for (const d of sides) {
          const path = [];
          for (let k = 1; k <= 6; k++) {
            const px = x + DIRS[d][0] * k, py = y + DIRS[d][1] * k;
            if (!map.inBounds(px, py) || px >= HX || !isFree(px, py)) break;
            if (zone[idx(px, py)] === ZONE.CORR) {
              paths.push(path);
              break;
            }
            path.push([px, py]);
          }
        }
      }
    }
    paths.sort((a, b) => a.length - b.length);
    if (!paths.length || paths[0].length === 0) continue;
    for (const [px, py] of paths[0]) zone[idx(px, py)] = ZONE.CORR;
    const other = paths.filter((p) => p.length && Math.abs(p[0][0] - paths[0][0][0]) + Math.abs(p[0][1] - paths[0][0][1]) > 6);
    if (other.length && rng.chance(0.5)) for (const [px, py] of other[0]) zone[idx(px, py)] = ZONE.CORR;
  }
  for (let i = 0; i < total; i++) if (zone[i] === ZONE.CORR) ceil[i] = CEIL.CORR;

  // ---- Guest rooms -----------------------------------------------------------------------
  // Two cells deep off a corridor, one (sometimes two) wide.
  const isCorr = (x, y) => map.inBounds(x, y) && zone[idx(x, y)] === ZONE.CORR;
  const open = (x, y) => map.inBounds(x, y) && x < HX && zone[idx(x, y)] === ZONE.VOID && isFree(x, y);
  let number = 100 + rng.int(0, 3) * 100;
  const guest = [];
  for (const pass of [0, 1]) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < HX; x++) {
        if (!open(x, y)) continue;
        // Pass 0: rooms facing horizontal corridors; pass 1: vertical ones.
        const dirs = pass === 0 ? [3, 2] : [1, 0];
        for (const d of dirs) {
          const cx = x + DIRS[d][0], cy = y + DIRS[d][1];
          if (!isCorr(cx, cy)) continue;
          const back = d ^ 1;
          const cells = [[x, y]];
          const bx = x + DIRS[back][0], by = y + DIRS[back][1];
          if (open(bx, by)) cells.push([bx, by]);
          const r = addRoom({ kind: 'guest', door: { x, y, d }, number: number++ });
          for (const [ux, uy] of cells) {
            claim(r, ux, uy, ZONE.ROOM);
            ceil[idx(ux, uy)] = CEIL.ROOM;
          }
          guest.push(r);
          break;
        }
      }
    }
  }
  // Suites: some neighbouring rooms off the same corridor knock through.
  for (const r of guest) {
    if (r.merged || !rng.chance(0.15)) continue;
    const side = r.door.d >= 2 ? 0 : 2;
    const [x, y] = r.cells[0];
    const nx = x + DIRS[side][0], ny = y + DIRS[side][1];
    if (!map.inBounds(nx, ny)) continue;
    const o = rooms[roomOf[idx(nx, ny)]];
    if (!o || o === r || o.kind !== 'guest' || o.merged || o.door.d !== r.door.d || o.cells.length !== r.cells.length) continue;
    o.merged = r.id;
    for (const [ux, uy] of o.cells) {
      roomOf[idx(ux, uy)] = r.id;
      r.cells.push([ux, uy]);
    }
    o.cells = [];
    r.suite = true;
  }
  // Leftover cells join a neighbouring guest room, or stay solid.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < HX; x++) {
      if (!open(x, y)) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!map.inBounds(nx, ny) || zone[idx(nx, ny)] !== ZONE.ROOM) continue;
        const r = rooms[roomOf[idx(nx, ny)]];
        if (r.kind !== 'guest' || r.cells.length >= 3) continue;
        claim(r, x, y, ZONE.ROOM);
        ceil[idx(x, y)] = CEIL.ROOM;
        break;
      }
    }
  }

  // ---- Boiler room --------------------------------------------------------------------------
  // Halls first, then a maze of narrow passages on a 2-cell lattice between them.
  const BW = N - HX;
  const bwant = ['boiler', 'gallery', 'boiler', 'tanks', 'gallery', 'boiler', 'pumps', 'tanks', 'boiler'];
  const halls = [];
  for (const kind of bwant) {
    for (let t = 0; t < 200; t++) {
      let w, h;
      if (kind === 'gallery') [w, h] = rng.chance(0.5) ? [3, rng.int(6, 8)] : [rng.int(6, 8), 3];
      else if (kind === 'boiler') [w, h] = rng.chance(0.5) ? [rng.int(4, 5), rng.int(5, 6)] : [rng.int(5, 6), rng.int(4, 5)];
      else [w, h] = [rng.int(3, 4), rng.int(3, 4)];
      if (w > BW - 2) continue;
      // Odd lattice alignment so halls sit between passages.
      const x = HX + 1 + 2 * rng.int(0, Math.floor((BW - 2 - w) / 2));
      const y = 1 + 2 * rng.int(0, Math.floor((N - 2 - h) / 2));
      if (halls.some((o) => x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y)) continue;
      const r = addRoom({ kind, x, y, w, h });
      r.ceil = kind === 'gallery' ? CEIL.GALLERY : CEIL.BOILER;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        claim(r, xx, yy, ZONE.BROOM);
        ceil[idx(xx, yy)] = r.ceil;
      }
      halls.push(r);
      break;
    }
  }
  // Maze nodes at (HX + even, even); passages carved between them.
  const node = (x, y) => x >= HX && x < N && y >= 0 && y < N && (x - HX) % 2 === 0 && y % 2 === 0 && zone[idx(x, y)] === ZONE.VOID;
  const nodes = [];
  for (let y = 0; y < N; y += 2) for (let x = HX; x < N; x += 2) if (node(x, y)) nodes.push([x, y]);
  const seen = new Set();
  const carve = (x, y) => {
    zone[idx(x, y)] = ZONE.BCORR;
    ceil[idx(x, y)] = CEIL.BCORR;
  };
  const link = (x, y, d) => {
    const e = map.edge(x, y, d);
    map.setEdge(e, EDGE_OPEN);
  };
  for (const start of nodes) {
    const key = (p) => `${p[0]},${p[1]}`;
    if (seen.has(key(start))) continue;
    seen.add(key(start));
    carve(...start);
    const stack = [start];
    while (stack.length) {
      const cur = rng.chance(0.75) ? stack[stack.length - 1] : rng.pick(stack);
      const opts = [];
      for (let d = 0; d < 4; d++) {
        const mx = cur[0] + DIRS[d][0], my = cur[1] + DIRS[d][1];
        const nx = cur[0] + DIRS[d][0] * 2, ny = cur[1] + DIRS[d][1] * 2;
        if (!node(nx, ny) || zone[idx(mx, my)] !== ZONE.VOID) continue;
        opts.push([d, mx, my, nx, ny]);
      }
      if (!opts.length) {
        stack.splice(stack.indexOf(cur), 1);
        continue;
      }
      const [d, mx, my, nx, ny] = rng.pick(opts);
      carve(mx, my);
      carve(nx, ny);
      link(cur[0], cur[1], d);
      link(mx, my, d);
      seen.add(key([nx, ny]));
      stack.push([nx, ny]);
    }
  }
  // Loops: knock through some of the walls between passages.
  for (let y = 0; y < N; y++) {
    for (let x = HX; x < N; x++) {
      if (zone[idx(x, y)] !== ZONE.VOID) continue;
      for (const [d, e] of [[0, 1], [2, 3]]) {
        const ax = x + DIRS[d][0], ay = y + DIRS[d][1], bx = x + DIRS[e][0], by = y + DIRS[e][1];
        if (!map.inBounds(ax, ay) || !map.inBounds(bx, by)) continue;
        if (zone[idx(ax, ay)] !== ZONE.BCORR || zone[idx(bx, by)] !== ZONE.BCORR || !rng.chance(0.08)) continue;
        carve(x, y);
        link(x, y, d);
        link(x, y, e);
      }
    }
  }
  // Halls open onto the passages through one or two doors.
  for (const h of halls) {
    const cand = [];
    for (const [x, y] of h.cells) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (map.inBounds(nx, ny) && zone[idx(nx, ny)] === ZONE.BCORR) cand.push([x, y, d]);
      }
    }
    rng.shuffle(cand);
    // Galleries are entered at the ends of their catwalk.
    if (h.kind === 'gallery') {
      const along = h.w > h.h ? 0 : 2;
      const mid = along === 0 ? h.y + 1 : h.x + 1;
      const ends = cand.filter(([x, y, d]) => (along === 0 ? y === mid && (d === 0 || d === 1) : x === mid && (d === 2 || d === 3)));
      if (ends.length) {
        cand.length = 0;
        cand.push(...ends);
      } else {
        h.kind = 'boiler';
        h.ceil = CEIL.BOILER;
        for (const [x, y] of h.cells) ceil[idx(x, y)] = CEIL.BOILER;
      }
    }
    for (const c of cand.slice(0, h.kind === 'gallery' ? 2 : rng.int(1, 2))) h.doors.push({ x: c[0], y: c[1], d: c[2] });
  }

  // ---- Walls between spaces ----------------------------------------------------------------
  const spaceOf = (i) => {
    const z = zone[i];
    if (z === ZONE.CORR) return -2;
    if (z === ZONE.VOID) return -10 - i; // every void cell is its own block
    if (z === ZONE.BCORR) return -3;
    return roomOf[i];
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      if (zone[i] === ZONE.BCORR) continue; // maze passages keep their carved edges
      for (const d of [0, 2]) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!map.inBounds(nx, ny)) continue;
        const j = idx(nx, ny);
        if (zone[j] === ZONE.BCORR) continue;
        if (spaceOf(i) === spaceOf(j) && zone[i] !== ZONE.VOID) map.setEdge(map.edge(x, y, d), EDGE_OPEN);
      }
    }
  }
  const openEdge = (x, y, d, v = EDGE_OPEN) => {
    map.setEdge(map.edge(x, y, d), v);
  };
  for (const h of halls) for (const dd of h.doors) openEdge(dd.x, dd.y, dd.d);
  // Galleries: catwalk cells down the middle, the pit to either side.
  for (const h of halls) {
    if (h.kind !== 'gallery') continue;
    const along = h.w > h.h ? 0 : 1;
    h.along = along;
    h.walk = [];
    for (const [x, y] of h.cells) {
      const mid = along === 0 ? y === h.y + 1 : x === h.x + 1;
      if (mid) {
        h.walk.push([x, y]);
        continue;
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!map.inBounds(nx, ny) || roomOf[idx(nx, ny)] !== h.id) continue;
        if (along === 0 ? ny === h.y + 1 : nx === h.x + 1) map.setEdge(map.edge(x, y, d), EDGE_BARS);
      }
    }
  }
  // Corridors run straight into lobbies; elsewhere a lobby is walled.
  for (const r of rooms) {
    if (r.kind !== 'grand' && r.kind !== 'lounge' && r.kind !== 'homely') continue;
    r.arches = [];
    for (const [x, y] of r.cells) {
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!isCorr(nx, ny)) continue;
        // The corridor has to carry on straight out for two more cells.
        const fx = nx + DIRS[d][0], fy = ny + DIRS[d][1];
        const gx = fx + DIRS[d][0], gy = fy + DIRS[d][1];
        if (!isCorr(fx, fy) || !isCorr(gx, gy)) continue;
        if (r.arches.length >= (r.kind === 'homely' ? 2 : 4) || r.arches.some((a) => Math.abs(a.x - x) + Math.abs(a.y - y) < 2)) continue;
        openEdge(x, y, d);
        r.arches.push({ x, y, d });
      }
    }
    if (!r.arches.length) {
      // Nothing runs straight in: open one side onto the ring corridor.
      const c = [];
      for (const [x, y] of r.cells) for (let d = 0; d < 4; d++) if (isCorr(x + DIRS[d][0], y + DIRS[d][1])) c.push({ x, y, d });
      const a = rng.pick(c);
      openEdge(a.x, a.y, a.d);
      r.arches.push(a);
    }
  }
  // Guest room doors: the edge stays a wall unless the door is open.
  for (const r of guest) {
    if (!r.cells.length) continue;
    r.state = rng.chance(0.24) ? 'open' : 'locked';
    if (r.suite) r.state = rng.chance(0.6) ? 'open' : 'locked';
    if (r.state === 'open') openEdge(r.door.x, r.door.y, r.door.d);
  }
  // Housekeeping: one door.
  for (const r of rooms.filter((q) => q.kind === 'housekeeping')) {
    const c = [];
    for (const [x, y] of r.cells) for (let d = 0; d < 4; d++) if (isCorr(x + DIRS[d][0], y + DIRS[d][1])) c.push({ x, y, d });
    const dd = rng.pick(c);
    openEdge(dd.x, dd.y, dd.d);
    r.doors.push(dd);
  }
  // The ballroom: grand double doors from the hall, a back door to the boiler room.
  {
    const c = [];
    for (const [x, y] of ball.cells) for (let d = 0; d < 4; d++) if (isCorr(x + DIRS[d][0], y + DIRS[d][1])) c.push({ x, y, d });
    rng.shuffle(c);
    // Prefer doors on the long walls, spread apart.
    const picked = [];
    for (const a of c) {
      if (picked.length >= 3) break;
      if (picked.some((p) => Math.abs(p.x - a.x) + Math.abs(p.y - a.y) < 4)) continue;
      picked.push(a);
    }
    for (const a of picked) {
      openEdge(a.x, a.y, a.d);
      ball.doors.push({ ...a, grand: true });
    }
  }
  // The stair bay: entered from the lobby (no entity follows you up).
  const stairRoom = rooms.find((r) => r.kind === 'stair');
  if (stairRoom) {
    const b = stairRoom;
    const inner = b.dir === 3 ? b.y + 2 : b.y; // row touching the lobby
    for (let x = b.x; x < b.x + 2; x++) openEdge(x, inner, b.dir ^ 1, EDGE_EXIT);
  }

  // ---- Hall <-> boiler room connections ------------------------------------------------------
  // Service doors from corridors along the boundary; the ballroom's back door.
  const boilerLinks = [];
  const linkToMaze = (x, y) => {
    // From boiler-side cell (x, y), carve east until a passage is reached.
    let cx = x, cy = y;
    for (let k = 0; k < 6; k++) {
      if (zone[idx(cx, cy)] === ZONE.BCORR) return true;
      if (zone[idx(cx, cy)] !== ZONE.VOID) return false;
      carve(cx, cy);
      const nx = cx + 1;
      if (nx >= N) return false;
      if (zone[idx(nx, cy)] === ZONE.BROOM) return false;
      openEdge(cx, cy, 0);
      cx = nx;
    }
    return zone[idx(cx, cy)] === ZONE.BCORR;
  };
  const tryLink = (x, y, from) => {
    // x, y: hotel-side cell at HX - 1.
    const bx = HX, by = y;
    if (zone[idx(bx, by)] === ZONE.BROOM) return false;
    const snapshot = zone.slice(), csnap = ceil.slice();
    if (!linkToMaze(bx, by)) {
      zone.set(snapshot);
      ceil.set(csnap);
      return false;
    }
    openEdge(x, y, 0);
    boilerLinks.push({ x, y, d: 0, from });
    return true;
  };
  {
    // Where a corridor runs straight at the boiler room wall, first.
    const lines = rng.shuffle(ys.filter((y) => isCorr(HX - 1, y) && isCorr(HX - 2, y)));
    const others = [];
    for (let y = 1; y < N - 1; y++) if (isCorr(HX - 1, y) && !lines.includes(y)) others.push(y);
    const cands = [...lines, ...rng.shuffle(others)];
    let n = 0;
    for (const y of cands) {
      if (n >= 2) break;
      if (boilerLinks.some((l) => Math.abs(l.y - y) < 8)) continue;
      if (tryLink(HX - 1, y, 'service')) n++;
    }
    const back = ball.cells.filter(([x]) => x === HX - 1).map(([, y]) => y);
    rng.shuffle(back);
    for (const y of back) if (tryLink(HX - 1, y, 'ballroom')) break;
  }

  // ---- Elevators -------------------------------------------------------------------------------
  // Car cells take the place of guest rooms off lobbies and corridors.
  const elevators = [];
  const makeCar = (r, fx, fy, d, where) => {
    // r: the guest room giving up its front cell; (fx, fy) that cell; d = facing.
    for (const [x, y] of r.cells) {
      zone[idx(x, y)] = ZONE.VOID;
      roomOf[idx(x, y)] = -1;
      for (let k = 0; k < 4; k++) if (map.inBounds(x + DIRS[k][0], y + DIRS[k][1])) map.setEdge(map.edge(x, y, k), EDGE_WALL);
    }
    r.cells = [];
    r.kind = 'gone';
    const car = addRoom({ kind: 'elevator', where });
    claim(car, fx, fy, ZONE.ELEV);
    ceil[idx(fx, fy)] = CEIL.ELEV;
    openEdge(fx, fy, d, EDGE_EXIT);
    car.door = { x: fx, y: fy, d };
    elevators.push(car);
    return car;
  };
  const guestFacing = (pred) => guest.filter((r) => r.kind === 'guest' && r.cells.length && !r.suite && pred(r));
  // Two banks in the grand lobby's ring corridor, one in each lounge's.
  const nearRoom = (room, r) => {
    const [x, y] = r.cells[0];
    return x >= room.x - 2 && x <= room.x + room.w + 1 && y >= room.y - 2 && y <= room.y + room.h + 1;
  };
  for (const host of rooms.filter((r) => r.kind === 'grand' || r.kind === 'lounge')) {
    const list = guestFacing((r) => nearRoom(host, r));
    rng.shuffle(list);
    const n = host.kind === 'grand' ? 3 : 1;
    for (const r of list.slice(0, n)) makeCar(r, r.door.x, r.door.y, r.door.d, host.kind);
  }
  // A few more at corridor ends.
  {
    const list = guestFacing(() => true);
    rng.shuffle(list);
    for (const r of list.slice(0, 3)) makeCar(r, r.door.x, r.door.y, r.door.d, 'corridor');
  }
  // The maintenance lift: off a boiler passage dead end.
  {
    const ends = [];
    for (let y = 0; y < N; y++) {
      for (let x = HX; x < N; x++) {
        if (zone[idx(x, y)] !== ZONE.BCORR) continue;
        const exits = [0, 1, 2, 3].filter((d) => map.canMove(x, y, d));
        if (exits.length !== 1) continue;
        const back = exits[0] ^ 1;
        const nx = x + DIRS[back][0], ny = y + DIRS[back][1];
        if (map.inBounds(nx, ny) && zone[idx(nx, ny)] === ZONE.VOID) ends.push([x, y, back, nx, ny]);
      }
    }
    if (ends.length) {
      const [x, y, d, nx, ny] = rng.pick(ends);
      const car = addRoom({ kind: 'elevator', where: 'maintenance' });
      claim(car, nx, ny, ZONE.ELEV);
      ceil[idx(nx, ny)] = CEIL.ELEV;
      openEdge(x, y, d, EDGE_EXIT);
      car.door = { x: nx, y: ny, d: d ^ 1 };
      elevators.push(car);
    }
  }

  // ---- Spawn: at the foot of the grand stair, looking into the lobby ---------------------------
  let spawn;
  if (stairRoom) {
    const b = stairRoom;
    const inner = b.dir === 3 ? b.y + 2 : b.y;
    const ly = inner + DIRS[b.dir ^ 1][1];
    spawn = { x: b.x, y: ly, dir: b.dir ^ 1, wx: (b.x + 1) * CELL, wz: (ly + 0.5) * CELL + DIRS[b.dir ^ 1][1] * 0.2 };
  } else {
    const c = grand.cells[0];
    spawn = { x: c[0], y: c[1], dir: 2, wx: (c[0] + 0.5) * CELL, wz: (c[1] + 0.5) * CELL };
  }
  const spawnYaw = Math.atan2(-DIRS[spawn.dir][0], -DIRS[spawn.dir][1]);

  // Unreachable pockets: connect them (guest rooms aside, which may be locked).
  for (let guard = 0; guard < 200; guard++) {
    const dist = map.bfs(spawn.x, spawn.y);
    const cand = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        const z = zone[i];
        if (dist[i] >= 0 || z === ZONE.VOID || z === ZONE.ROOM || z === ZONE.ELEV || z === ZONE.STAIR) continue;
        if (z === ZONE.BROOM && rooms[roomOf[i]].kind === 'gallery') continue;
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (!map.inBounds(nx, ny) || dist[idx(nx, ny)] < 0) continue;
          const zn = zone[idx(nx, ny)];
          if (zn === ZONE.ROOM || zn === ZONE.ELEV || zn === ZONE.STAIR) continue;
          if ((zn === ZONE.BROOM || z === ZONE.BROOM) && zn !== z) {
            // A new hall door.
            const hr = rooms[roomOf[z === ZONE.BROOM ? i : idx(nx, ny)]];
            if (hr.kind === 'gallery') continue;
            cand.push([x, y, d, hr, z === ZONE.BROOM ? [x, y, d] : [nx, ny, d ^ 1]]);
          } else cand.push([x, y, d]);
        }
      }
    }
    if (!cand.length) break;
    const c = rng.pick(cand);
    openEdge(c[0], c[1], c[2]);
    if (c[3]) c[3].doors.push({ x: c[4][0], y: c[4][1], d: c[4][2] });
    const za = zone[idx(c[0], c[1])], zb = zone[idx(c[0] + DIRS[c[2]][0], c[1] + DIRS[c[2]][1])];
    if (inHotel(za) !== inHotel(zb)) {
      const hx = inHotel(za) ? c[0] : c[0] + DIRS[c[2]][0], hy = inHotel(za) ? c[1] : c[1] + DIRS[c[2]][1];
      boilerLinks.push({ x: hx, y: hy, d: inHotel(za) ? c[2] : c[2] ^ 1, from: 'service' });
    }
  }
  const dist = map.bfs(spawn.x, spawn.y);

  // ---- The deep end: the hall farthest from the hotel holds the furnace -----------------------
  const bdist = (() => {
    const starts = boilerLinks.map((l) => [HX, l.y]);
    const best = new Int32Array(total).fill(-1);
    for (const [sx, sy] of starts) {
      const dd = map.bfs(sx, sy);
      for (let i = 0; i < total; i++) if (dd[i] >= 0 && (best[i] < 0 || dd[i] < best[i])) best[i] = dd[i];
    }
    return best;
  })();
  let furnace = null, far = -1;
  for (const h of halls) {
    if (h.kind === 'gallery') continue;
    const d = Math.max(...h.cells.map(([x, y]) => bdist[idx(x, y)]));
    if (d > far) {
      far = d;
      furnace = h;
    }
  }
  if (furnace) furnace.kind = 'furnace';
  const maxB = Math.max(1, ...bdist);
  const heat = new Float32Array(total);
  for (let i = 0; i < total; i++) if (bdist[i] >= 0 && !inHotel(zone[i])) heat[i] = Math.min(1, bdist[i] / maxB);
  if (furnace) for (const [x, y] of furnace.cells) heat[idx(x, y)] = 1;

  // ---- Destinations for the elevators -------------------------------------------------------------
  const cars = elevators.filter((e) => e.where !== 'maintenance');
  rng.shuffle(cars);
  cars.forEach((c, k) => {
    if (k === 0) c.dest = { type: 'level', target: 'level3', floor: '3' };
    else if (k === 1) c.dest = { type: 'death', floor: '13' };
    else {
      c.dest = { type: 'floor', floor: String(rng.pick([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12])) };
      if (rng.chance(0.25)) c.flaky = true; // shows 12, sometimes 13
    }
  });
  for (const e of elevators) if (e.where === 'maintenance') e.dest = { type: 'maintenance', floor: 'B' };

  // ---- Lights ----------------------------------------------------------------------------------------
  const lights = [];
  const warm = [1.0, 0.68, 0.38];
  const addLight = (l) => {
    lights.push({ state: 'on', power: 0.6, color: warm, hide: true, ...l });
    return lights.length - 1;
  };
  const roll = (off, flick) => {
    const t = rng.next();
    return t < off ? 'off' : t < off + flick ? 'flicker' : 'on';
  };
  // Corridor sconces: on alternating walls every other cell.
  const sconces = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < HX; x++) {
      if (zone[idx(x, y)] !== ZONE.CORR || (x + y) % 2) continue;
      const walls = [0, 1, 2, 3].filter((d) => map.getEdge(map.edge(x, y, d)) === EDGE_WALL);
      if (!walls.length) continue;
      const d = walls[(x * 7 + y * 3) % walls.length];
      const [cx, cz] = map.cellCenter(x, y);
      const n = [-DIRS[d][0], -DIRS[d][1]];
      const wx = cx + DIRS[d][0] * (CELL / 2 - 0.08), wz = cz + DIRS[d][1] * (CELL / 2 - 0.08);
      const li = addLight({ x: wx + n[0] * 0.35, z: wz + n[1] * 0.35, power: 0.62, state: roll(0.12, 0.07), kind: 'sconce' });
      sconces.push({ li, x: wx, z: wz, n, cell: [x, y], d });
    }
  }
  // Boiler room: caged bulbs in the passages, pendants in the halls.
  for (let y = 0; y < N; y++) {
    for (let x = HX; x < N; x++) {
      const i = idx(x, y);
      if (zone[i] === ZONE.BCORR && (x + y) % 3 === 0) {
        const [cx, cz] = map.cellCenter(x, y);
        addLight({ x: cx, z: cz, power: 0.5, color: [1, 0.78, 0.48], state: roll(0.18, 0.12), type: 'bulb', ceil: CEIL.BCORR });
      }
    }
  }
  for (const h of halls) {
    if (h.kind === 'furnace') continue;
    if (h.kind === 'gallery') {
      h.walk.forEach(([x, y], k) => {
        if (k % 2 === 0) addLight({ x: (x + 0.5) * CELL, z: (y + 0.5) * CELL, power: 0.8, color: [1, 0.82, 0.56], state: roll(0.1, 0.1), type: 'dome', ceil: h.ceil, room: h.id });
      });
      continue;
    }
    for (let y = h.y; y < h.y + h.h; y += 2) {
      for (let x = h.x; x < h.x + h.w; x += 2) {
        const bx = (x + Math.min(x + 2, h.x + h.w)) / 2, by = (y + Math.min(y + 2, h.y + h.h)) / 2;
        addLight({ x: bx * CELL, z: by * CELL, power: 0.75, color: [1, 0.8, 0.52], state: roll(0.12, 0.1), type: 'dome', ceil: h.ceil, room: h.id });
      }
    }
  }
  if (furnace) {
    const [cx, cz] = [(furnace.x + furnace.w / 2) * CELL, (furnace.y + furnace.h / 2) * CELL];
    furnace.glow = addLight({ x: cx, z: cz, power: 1.6, color: [1, 0.42, 0.12], type: 'none', kind: 'furnace' });
  }
  // Elevator cars.
  for (const e of elevators) {
    const [cx, cz] = map.cellCenter(e.door.x, e.door.y);
    e.light = addLight({ x: cx, z: cz, power: 0.5, color: e.where === 'maintenance' ? [0.9, 0.85, 0.7] : [1, 0.82, 0.55], kind: 'car', state: e.where === 'maintenance' ? 'flicker' : 'on' });
  }

  return {
    map, zone, roomOf, rooms, ceil, heat, HX, ys, xs, spawn, spawnYaw, spawnDist: dist, guest: guest.filter((r) => r.kind === 'guest' && r.cells.length),
    halls, furnace, elevators, boilerLinks, lights, sconces, stair: stairRoom, grand, ball, bdist,
  };
}
