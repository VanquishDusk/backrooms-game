import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js';
import { Kit, Colliders, paintTex } from '../level94/kit.js';
import { hash } from '../level11/city.js';

// Level 13 — "The Boiling Frogs".
//
// An endless, outdated apartment building: miles of beige painted-block
// hallways with terrazzo floors and fluorescent tubes, apartment doors one
// after another, elevators and stairwells. 290 floors. Some apartments are
// open: a kitchen-living room with a television playing old shows, a
// bedroom, a bathroom, a fridge that's always full.
//
// It's comfortable. That's the danger. The longer you spend in the
// apartments, the more you want to stay (the COMFORT bar), and the slower
// you get. Fill it and you never leave. It drains again out in the halls.
//
// Ways out:
//   - A plain, flush door with no number: Level 0 (or 114, 327, 395, 410)
//   - Ride the elevators / take the stairs all the way down to floor 1:
//     Level 208 (elevator) or Level 70 (stairs)
//   - An apartment with a chessboard and two chairs: touch the board, 157
//   - A door marked 235: try it, 235
//   - A red door: 275
//   - A stretch of deeper-yellow wallpaper: walk into it, 289
//   - A stairwell marked UP that keeps going up: 280
// Floor 283 is the B.N.T.G.'s Free Home Project.

const CELL = 20;
const CW = 2.6; // corridor width
const H = 2.7;
const AW = (CELL - CW) / 2; // apartment width and depth
const PLAIN = ['level0', 'level0', 'level0', 'level114', 'level327', 'level395', 'level410'];

export class Level13 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.cameraFar = 140;
    this.own = { geos: [], mats: [], textures: [] };
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(10);
    this.buildMaterials();
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x6a5a48, 0.9);
    this.group.add(this.hemi);
    this.pool = Array.from({ length: 6 }, () => {
      const l = new THREE.PointLight(0xf4f8ff, 0, 12, 1.4);
      this.group.add(l);
      return l;
    });
    this.floor = 120 + Math.floor(this.rng.next() * 90);
    this.cells = new Map();
    this.spawn = { x: 5, z: CW / 2, yaw: -Math.PI / 2 };
    this.world = {
      collide: (pos, r) => this.colliders.collide(pos, r),
      groundAt: () => 0,
      sampleLight: () => [0.7, 0.7, 0.65],
      ceilingHeight: () => H,
    };
    this.time = 0;
    this.done = false;
    this.told = {};
    this.comfort = 0;
    this.itemsTaken = new Set();
    this.fridgeAt = new Map();
    this.stairsUp = 0;
    this.updateCells({ pos: { x: this.spawn.x, z: this.spawn.z } });
    this.script = [
      [1.5, `A hallway. Beige painted block, a terrazzo floor, fluorescent tubes going on and on. A sign by the elevators says FLOOR ${this.floor}.`],
      [9, 'Doors, one after another. Somewhere behind one of them, a television, and a studio audience laughing.'],
    ];
  }

  // ---- Materials -----------------------------------------------------------------------------

  buildMaterials() {
    const own = this.own;
    const rnd = Math.random;
    const noise = (c, w, h, n, a, rgb, s = 2) => {
      for (let i = 0; i < n; i++) {
        c.fillStyle = `rgba(${rgb},${(rnd() * a).toFixed(3)})`;
        c.fillRect(rnd() * w, rnd() * h, rnd() * s + 0.5, rnd() * s + 0.5);
      }
    };
    const T = {};
    T.block = paintTex(own, 256, 256, (c, w, h) => {
      c.fillStyle = '#cfc6ae';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 4000, 0.06, '80,70,50');
      // Painted cinder block: the joints show through the paint.
      c.fillStyle = 'rgba(90,80,60,0.18)';
      for (let y = 0; y < h; y += 32) {
        c.fillRect(0, y, w, 2);
        for (let x = (y / 32) % 2 ? 32 : 0; x < w; x += 64) c.fillRect(x, y, 2, 32);
      }
      c.fillStyle = 'rgba(255,255,240,0.12)';
      for (let y = 2; y < h; y += 32) c.fillRect(0, y, w, 1);
    });
    T.terrazzo = paintTex(own, 128, 256, (c, w, h) => {
      c.fillStyle = '#8c8982';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 6000, 0.5, '40,40,40', 1.5);
      noise(c, w, h, 4000, 0.4, '220,215,200', 1.5);
      // Dark border strips along both walls.
      c.fillStyle = 'rgba(30,28,26,0.75)';
      c.fillRect(0, 0, 12, h);
      c.fillRect(w - 12, 0, 12, h);
    });
    T.ceiling = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#e6e4de';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 5000, 0.12, '90,90,80', 1.2);
    });
    T.door = paintTex(own, 64, 128, (c, w, h) => {
      c.fillStyle = '#7a5c40';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        c.fillStyle = `rgba(${rnd() < 0.5 ? '40,25,15' : '150,115,80'},0.2)`;
        c.fillRect(0, rnd() * h, w, 1);
      }
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 2;
      c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = '#c8a860';
      c.fillRect(w - 12, 62, 6, 6);
      c.fillRect(24, 22, 16, 8);
      c.fillStyle = '#c8b8a0';
      c.fillRect(29, 38, 6, 3); // peephole
    }, false);
    T.door235 = paintTex(own, 64, 128, (c, w, h) => {
      c.drawImage(T.door.image, 0, 0);
      c.fillStyle = '#e8d8a0';
      c.fillRect(10, 18, 44, 22);
      c.fillStyle = '#2a1a10';
      c.font = 'bold 18px Arial';
      c.textAlign = 'center';
      c.fillText('235', 32, 36);
    }, false);
    T.plain = paintTex(own, 64, 128, (c, w, h) => {
      c.fillStyle = '#ddd6c8';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 300, 0.05, '60,60,50');
      c.fillStyle = '#9a9488';
      c.fillRect(w - 11, 62, 5, 5);
    }, false);
    T.carpet = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#7e6c58';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 9000, 0.25, '40,30,20', 1.2);
      noise(c, w, h, 6000, 0.2, '170,150,120', 1.2);
    });
    T.lino = paintTex(own, 128, 128, (c, w, h) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#c8bc9a' : '#e2d8bc';
        c.fillRect(x * 32, y * 32, 32, 32);
      }
      noise(c, w, h, 1500, 0.08, '60,50,40');
    });
    T.tile = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#e8eae6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(120,130,130,0.4)';
      for (let k = 0; k <= w; k += 16) {
        c.fillRect(k, 0, 1, h);
        c.fillRect(0, k, w, 1);
      }
    });
    T.wallInt = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#e6e0d2';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 1500, 0.05, '80,70,60');
    });
    T.yellow = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#c8a430';
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        c.fillStyle = 'rgba(120,90,10,0.25)';
        c.fillRect(x, 0, 6, h);
      }
      noise(c, w, h, 2000, 0.15, '90,70,10');
    });
    T.chess = paintTex(own, 64, 64, (c) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        c.fillStyle = (x + y) % 2 ? '#2a1e14' : '#e8dcc0';
        c.fillRect(x * 8, y * 8, 8, 8);
      }
    }, false);
    T.signs = paintTex(own, 256, 128, (c) => {
      // Four little signs: STAIRS, STAIRS UP, ELEVATOR, B.N.T.G.
      const draw = (y, bg, fg, t) => {
        c.fillStyle = bg;
        c.fillRect(0, y, 256, 32);
        c.fillStyle = fg;
        c.font = 'bold 20px Arial';
        c.textAlign = 'center';
        c.fillText(t, 128, y + 23);
      };
      draw(0, '#1e5a2e', '#fff', 'STAIRS ▼');
      draw(32, '#e8e8e8', '#222', 'STAIRS ▲');
      draw(64, '#2a2a2c', '#e8d890', 'ELEVATOR ▼ ▲');
      draw(96, '#8a1c1c', '#ffe8a0', 'B.N.T.G. FREE HOMES');
    }, false);
    // The television: one shared screen, redrawn a few times a second.
    const tc = document.createElement('canvas');
    tc.width = 64;
    tc.height = 48;
    this.tvCanvas = tc;
    this.tvTex = new THREE.CanvasTexture(tc);
    own.textures.push(this.tvTex);
    const L = (o) => {
      const m = new THREE.MeshLambertMaterial(o);
      own.mats.push(m);
      return m;
    };
    this.M = {
      block: L({ map: T.block }),
      terrazzo: L({ map: T.terrazzo }),
      ceiling: L({ map: T.ceiling }),
      trim: L({ color: 0xe8e4da }),
      base: L({ color: 0x3a3632 }),
      door: L({ map: T.door }),
      door235: L({ map: T.door235 }),
      plain: L({ map: T.plain }),
      red: L({ color: 0x9a1a14 }),
      frame: L({ color: 0xd8d0c0 }),
      tube: L({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 1.2 }),
      tubeOff: L({ color: 0xb8b8b0 }),
      fixture: L({ color: 0xd8d8d2 }),
      exit: L({ color: 0x400808, emissive: 0xff2a1a, emissiveIntensity: 1 }),
      carpet: L({ map: T.carpet }),
      lino: L({ map: T.lino }),
      tile: L({ map: T.tile }),
      wallInt: L({ map: T.wallInt }),
      yellow: L({ map: T.yellow }),
      white: L({ color: 0xece8e0 }),
      steel: L({ color: 0x9a9c9e }),
      counter: L({ color: 0xc8b890 }),
      wood: L({ color: 0x6a4e34 }),
      sofa: L({ color: 0x7a6a5a }),
      cushion: L({ color: 0xece4d4 }),
      box: L({ color: 0xa8804c }),
      bed: L({ color: 0x5a6a8a }),
      tv: L({ color: 0x2a2620 }),
      screen: L({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.tvTex, emissiveIntensity: 1 }),
      chess: L({ map: T.chess }),
      signs: L({ map: T.signs, emissive: 0xffffff, emissiveMap: T.signs, emissiveIntensity: 0.4 }),
      light: L({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 1 }),
    };
    this.T = T;
  }

  // ---- Plans ------------------------------------------------------------------------------------

  // Cheap description of a cell; anything floor-independent (stairs, lifts)
  // is in the same place on every floor.
  plan(i, j) {
    const f = this.floor;
    const h = (k) => hash(i, j, k + f * 131, this.seed);
    const hf = (k) => hash(i, j, k, this.seed); // same on every floor
    const spawnCell = i === 0 && j === 0;
    const nearSpawn = Math.abs(i) <= 1 && Math.abs(j) <= 1;
    const p = {
      i, j,
      wallW: !nearSpawn && h(1) < 0.18, // a dead end across the west corridor
      wallN: !nearSpawn && h(2) < 0.18 && !(i === 0),
      apts: [],
      sides: [],
    };
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const k = row * 2 + col;
      const open = (spawnCell && row === 0 && col === 1) || h(10 + k) < (f === 283 ? 0.6 : 0.3);
      p.apts.push({ row, col, open, chess: open && h(20 + k) < 0.07, num: f * 100 + ((i * 7 + j * 13 + k) % 90 + 10 + 90) % 90 + 10, item: open && h(30 + k) < 0.5 ? ['water', 'water', 'milk', 'battery', 'medkit'][Math.floor(h(40 + k) * 5)] : null });
    }
    // Things on the side walls (the east face of this block, and the west).
    for (const side of ['w', 'e']) for (const slot of [0, 1]) {
      const r = hf(50 + (side === 'e' ? 2 : 0) + slot), r2 = h(60 + (side === 'e' ? 2 : 0) + slot);
      let type = null;
      if ((i === 1 && j === 0 && side === 'w' && slot === 0) || r < 0.06) type = 'elevator';
      else if ((i === 0 && j === 1 && side === 'w' && slot === 1) || r < 0.11) type = 'stairs';
      else if (r < 0.118) type = 'stairsUp';
      else if (r2 < 0.05) type = 'plain';
      else if (r2 < 0.065) type = 'red';
      else if (r2 < 0.078) type = 'd235';
      else if (r2 < 0.1) type = 'yellow';
      if (spawnCell && type && type !== 'elevator' && type !== 'stairs') type = null;
      if (type) p.sides.push({ side, slot, type, target: type === 'plain' ? PLAIN[Math.floor(h(70 + slot) * PLAIN.length)] : null });
    }
    return p;
  }

  // ---- Streaming -----------------------------------------------------------------------------------

  updateCells(player, force = false) {
    const ci = Math.floor(player.pos.x / CELL), cj = Math.floor(player.pos.z / CELL);
    if (!force && ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const keep = new Set();
    for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) {
      const key = `${i},${j}`;
      keep.add(key);
      if (!this.cells.has(key)) this.cells.set(key, this.makeCell(i, j));
    }
    for (const [key, c] of this.cells) {
      if (keep.has(key)) continue;
      this.dropCell(c);
      this.cells.delete(key);
    }
  }

  dropCell(c) {
    this.group.remove(c.group);
    for (const g of c.geos) g.dispose();
    for (const s of c.solids) this.colliders.remove(s);
  }

  // A new floor: everything rebuilt (stairs and lifts stay where they are).
  rebuild(player) {
    for (const c of this.cells.values()) this.dropCell(c);
    this.cells.clear();
    this.updateCells(player, true);
  }

  makeCell(i, j) {
    const kit = new Kit();
    const p = this.plan(i, j);
    const X0 = i * CELL, Z0 = j * CELL;
    const solids = [], tubes = [], acts = [], zones = [], apts = [];
    const solid = (x0, z0, x1, z1, y1 = H) => {
      const s = this.colliders.add({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, rot: 0, y0: -1, y1 });
      solids.push(s);
    };
    const flat = (key, x0, z0, x1, z1, y, up, uvFn) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 3));
      const ny = up ? 1 : -1;
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvFn ? uvFn() : [x0 / 2, z0 / 2, x0 / 2, z1 / 2, x1 / 2, z1 / 2, x1 / 2, z0 / 2], 2));
      g.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      (kit.parts[key] ||= []).push(g);
    };
    // Vertical quad facing left of a->b (seen from above).
    const quad = (key, ax, az, bx, bz, y0, y1, tw = 2, th = 2, u0 = 0) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) return;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, y0 / th, u0 + len / tw, y0 / th, u0 + len / tw, y1 / th, u0, y1 / th], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      (kit.parts[key] ||= []).push(g);
    };
    // ---- Corridors: the west strip, the north strip, the junction ----
    const bx0 = X0 + CW, bz0 = Z0 + CW, bx1 = X0 + CELL, bz1 = Z0 + CELL;
    flat('terrazzo', X0, bz0, bx0, bz1, 0, true, () => [0, bz0 / 4, 0, bz1 / 4, 1, bz1 / 4, 1, bz0 / 4]);
    flat('terrazzo', bx0, Z0, bx1, bz0, 0, true, () => [bx0 / 4, 1, bx0 / 4, 0, bx1 / 4, 0, bx1 / 4, 1]);
    flat('terrazzo', X0, Z0, bx0, bz0, 0, true, () => [0.2, 0.2, 0.2, 0.3, 0.8, 0.3, 0.8, 0.2]);
    flat('ceiling', X0, Z0, bx1, bz0, H, false);
    flat('ceiling', X0, bz0, bx0, bz1, H, false);
    flat('ceiling', bx0, bz0, bx1, bz1, H + 0.001, false);
    // Lights down the middle of each corridor; some dead, some flickering.
    const tube = (x, z, alongX, k) => {
      const r = hash(Math.round(x * 3), Math.round(z * 3), this.floor, this.seed);
      const on = r > 0.1;
      kit.box('fixture', x, H - 0.04, z, alongX ? 1.3 : 0.18, 0.06, alongX ? 0.18 : 1.3);
      kit.box(on ? 'tube' : 'tubeOff', x, H - 0.09, z, alongX ? 1.2 : 0.06, 0.05, alongX ? 0.06 : 1.2);
      if (on) tubes.push({ x, z, flicker: r < 0.18 });
    };
    for (let k = 0; k < 3; k++) {
      tube(X0 + CW / 2, Z0 + CW + 3.5 + k * 6, false, k);
      tube(X0 + CW + 3.5 + k * 6, Z0 + CW / 2, true, k);
    }
    if (hash(i, j, 5, this.seed) < 0.25) kit.box('exit', X0 + CW / 2, H - 0.25, Z0 + CW + 0.4, 0.5, 0.18, 0.06);
    // Dead ends.
    if (p.wallW) {
      kit.box('block', X0 + CW / 2, H / 2, Z0 + CELL / 2 + 2, CW, H, 0.2);
      solid(X0, Z0 + CELL / 2 + 1.9, bx0, Z0 + CELL / 2 + 2.1);
    }
    if (p.wallN) {
      kit.box('block', X0 + CELL / 2 + 2, H / 2, Z0 + CW / 2, 0.2, H, CW);
      solid(X0 + CELL / 2 + 1.9, Z0, X0 + CELL / 2 + 2.1, bz0);
    }
    // ---- The block: four apartments facing the north and south corridors ----
    // Walls facing the corridors, with a dark baseboard and crown moulding.
    const faces = [
      { ax: bx0, az: bz0, bx: bx0, bz: bz1, side: 'w' }, // faces -x
      { ax: bx0, az: bz1, bx: bx1, bz: bz1, side: 's' }, // faces +z
      { ax: bx1, az: bz1, bx: bx1, bz: bz0, side: 'e' }, // faces +x
      { ax: bx1, az: bz0, bx: bx0, bz: bz0, side: 'n' }, // faces -z
    ];
    // Door positions on the north and south faces.
    const doors = { n: [], s: [] };
    for (const a of p.apts) {
      const cx = bx0 + (a.col + 0.5) * AW;
      doors[a.row === 0 ? 'n' : 's'].push({ x: cx, a });
    }
    for (const f of faces) {
      const len = Math.hypot(f.bx - f.ax, f.bz - f.az);
      const dx = (f.bx - f.ax) / len, dz = (f.bz - f.az) / len;
      const nx = -dz, nz = dx;
      // Openings along the face: doors (open ones leave a gap).
      const gaps = [];
      if (f.side === 'n' || f.side === 's') for (const d of doors[f.side]) if (d.a.open) gaps.push([Math.abs(d.x - f.ax) - 0.5, Math.abs(d.x - f.ax) + 0.5]);
      gaps.sort((a, b) => a[0] - b[0]);
      let s0 = 0;
      for (const [g0, g1] of [...gaps, [len, len]]) {
        quad('block', f.ax + dx * s0, f.az + dz * s0, f.ax + dx * g0, f.az + dz * g0, 0, H, 2, 2, s0 / 2);
        s0 = g1;
      }
      for (const [g0, g1] of gaps) quad('block', f.ax + dx * g0, f.az + dz * g0, f.ax + dx * g1, f.az + dz * g1, 2.1, H, 2, 2);
      const mx = (f.ax + f.bx) / 2 + nx * 0.03, mz = (f.az + f.bz) / 2 + nz * 0.03;
      kit.box('base', mx, 0.06, mz, Math.abs(dx) * len + 0.02, 0.12, Math.abs(dz) * len + 0.02);
      kit.box('trim', mx + nx * 0.03, H - 0.06, mz + nz * 0.03, Math.abs(dx) * len + 0.1, 0.12, Math.abs(dz) * len + 0.1);
      // Doors.
      if (f.side === 'n' || f.side === 's') for (const d of doors[f.side]) {
        const dz0 = f.az + nz * 0.04;
        if (!d.a.open) {
          kit.add('door', new THREE.PlaneGeometry(0.95, 2.05), d.x, 1.025, dz0, 0, f.side === 'n' ? Math.PI : 0, 0);
          kit.box('frame', d.x, 2.1, f.az + nz * 0.03, 1.15, 0.08, 0.06);
          for (const s of [-1, 1]) kit.box('frame', d.x + s * 0.54, 1.05, f.az + nz * 0.03, 0.08, 2.1, 0.06);
        } else {
          kit.add('door', new THREE.BoxGeometry(0.95, 2.05, 0.04).translate(0.475, 1.025, 0), d.x - 0.48, 0, f.az - nz * 0.05, 0, (f.side === 'n' ? Math.PI : 0) + (f.side === 'n' ? 1.3 : -1.3), 0);
        }
      }
      // Side-wall specials.
      if (f.side === 'w' || f.side === 'e') for (const sp of p.sides.filter((q) => q.side === f.side)) {
        const z = bz0 + (sp.slot + 0.5) * AW;
        const x = f.ax + nx * 0.04, ry = f.side === 'w' ? -Math.PI / 2 : Math.PI / 2;
        const sign = (row) => {
          const g = new THREE.PlaneGeometry(0.9, 0.22);
          const uv = g.attributes.uv;
          for (let n = 0; n < 4; n++) uv.setY(n, 1 - (row + 1 - uv.getY(n)) / 4);
          kit.add('signs', g, x + nx * 0.01, 2.35, z, 0, ry, 0);
          g.dispose();
        };
        const act = { x: f.ax + nx * 0.7, z, type: sp.type, target: sp.target };
        if (sp.type === 'elevator') {
          for (const s of [-1, 1]) {
            kit.add('steel', new THREE.PlaneGeometry(1.1, 2.15), x, 1.075, z + s * 0.75, 0, ry, 0);
            kit.box('frame', x, 1.1, z + s * 0.75 + 0.6, 0.05, 2.2, 0.08);
          }
          kit.box('base', x, 1.2, z, 0.05, 0.3, 0.14);
          sign(2);
          acts.push({ ...act, z: z - 0.75, type: 'down' }, { ...act, z: z + 0.75, type: 'up' });
          continue;
        }
        if (sp.type === 'yellow') {
          const yx = f.ax + nx * 0.02;
          if (f.side === 'w') quad('yellow', yx, z - 1.6, yx, z + 1.6, 0.12, H - 0.12, 1.5, 1.5);
          else quad('yellow', yx, z + 1.6, yx, z - 1.6, 0.12, H - 0.12, 1.5, 1.5);
          zones.push({ x: f.ax + nx * 0.35, z, r: 1.6, target: 'level289' });
          continue;
        }
        const mat = sp.type === 'red' ? 'red' : sp.type === 'd235' ? 'door235' : sp.type === 'plain' ? 'plain' : 'door';
        kit.add(mat, new THREE.PlaneGeometry(0.95, 2.05), x, 1.025, z, 0, ry, 0);
        if (sp.type !== 'plain') {
          kit.box('frame', x, 2.1, z, 0.06, 0.08, 1.15);
          for (const s of [-1, 1]) kit.box('frame', x, 1.05, z + s * 0.54, 0.06, 2.1, 0.08);
        }
        if (sp.type === 'stairs') sign(0);
        if (sp.type === 'stairsUp') sign(1);
        acts.push(act);
      }
    }
    // ---- Apartments ----
    for (const a of p.apts) {
      const ax0 = bx0 + a.col * AW, ax1 = ax0 + AW;
      const north = a.row === 0;
      const az0 = north ? bz0 : bz1 - AW, az1 = north ? bz0 + AW : bz1;
      if (!a.open) {
        solid(ax0, az0, ax1, az1);
        continue;
      }
      apts.push(this.apartment(kit, a, ax0, az0, ax1, az1, north, solid, acts, i, j));
    }
    // B.N.T.G. banners on floor 283.
    if (this.floor === 283) {
      const g = new THREE.PlaneGeometry(1.8, 0.45);
      const uv = g.attributes.uv;
      for (let n = 0; n < 4; n++) uv.setY(n, 1 - (4 - uv.getY(n)) / 4);
      kit.add('signs', g, X0 + CELL / 2, 2.2, bz0 - 0.04, 0, Math.PI, 0);
      g.dispose();
    }
    const own = { geos: [], mats: [], textures: [] };
    const group = kit.build(this.M, own);
    this.group.add(group);
    return { i, j, group, geos: own.geos, solids, tubes, acts, zones, apts };
  }

  // A small apartment: kitchen and living room at the front, a bedroom and
  // a bathroom behind. Built in local coordinates (front at lz = 0).
  apartment(kit, a, ax0, az0, ax1, az1, north, solid, acts, ci, cj) {
    const W = ax1 - ax0, D = az1 - az0;
    const fz = north ? az0 : az1, inz = north ? 1 : -1;
    const X = (lx) => ax0 + lx, Z = (lz) => fz + inz * lz;
    const box = (key, lx, ly, lz, w, h, d, col = true) => {
      kit.box(key, X(lx), ly, Z(lz), w, h, d);
      if (col) solid(X(lx) - w / 2, Z(lz) - d / 2, X(lx) + w / 2, Z(lz) + d / 2, ly + h / 2);
    };
    const t = 0.1;
    // Floors and ceiling.
    const fl = (key, lx0, lz0, lx1, lz1) => {
      const x0 = X(lx0), x1 = X(lx1), z0 = Math.min(Z(lz0), Z(lz1)), z1 = Math.max(Z(lz0), Z(lz1));
      kit.box(key, (x0 + x1) / 2, 0.005, (z0 + z1) / 2, x1 - x0, 0.01, z1 - z0);
    };
    fl('carpet', 0, 0, W, 5);
    fl('lino', 0.05, 0.05, 2.6, 5);
    fl('carpet', 0, 5, 5, D);
    fl('tile', 5, 5, W, D);
    kit.box('wallInt', (ax0 + ax1) / 2, H - 0.005, (az0 + az1) / 2, W, 0.01, D);
    // Inner walls (the outer faces belong to the corridor).
    const wall = (lx0, lz0, lx1, lz1) => box('wallInt', (lx0 + lx1) / 2, H / 2, (lz0 + lz1) / 2, Math.max(t, Math.abs(lx1 - lx0)), H, Math.max(t, Math.abs(lz1 - lz0)));
    wall(0.05, 0, 0.05, D);
    wall(W - 0.05, 0, W - 0.05, D);
    wall(0, D - 0.05, W, D - 0.05);
    wall(0, 0.05, W / 2 - 0.55, 0.05);
    wall(W / 2 + 0.55, 0.05, W, 0.05);
    box('wallInt', W / 2, 2.4, 0.05, 1.1, 0.6, t, false);
    // Partition between the front room and the back rooms, with doorways.
    wall(0, 5, 3.4, 5);
    wall(4.3, 5, 6.2, 5);
    wall(7.0, 5, W, 5);
    wall(5, 5, 5, D);
    // Kitchen along the left wall.
    box('counter', 0.4, 0.45, 1.4, 0.65, 0.9, 1.6);
    box('white', 0.4, 0.45, 2.6, 0.65, 0.9, 0.7); // stove
    for (const [dx, dz] of [[-0.12, -0.15], [0.12, 0.15]]) kit.add('base', new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10), X(0.4 + dx), 0.91, Z(2.6 + dz));
    box('white', 0.45, 0.9, 3.6, 0.75, 1.8, 0.75); // fridge
    acts.push({ x: X(1.3), z: Z(3.6), type: 'fridge', key: `${this.floor}:${ci},${cj}:${a.row}${a.col}` });
    // The living room: sofa facing the television, boxes not unpacked.
    box('sofa', 6.4, 0.25, 3.9, 2.2, 0.5, 0.85);
    box('sofa', 6.4, 0.65, 4.25, 2.2, 0.5, 0.2, false);
    box('cushion', 5.6, 0.55, 3.85, 0.5, 0.15, 0.5, false);
    box('wood', 6.4, 0.22, 2.7, 1.1, 0.44, 0.55);
    box('tv', 6.4, 0.35, 0.45, 0.9, 0.7, 0.45);
    box('tv', 6.4, 0.95, 0.5, 0.7, 0.5, 0.45);
    const scr = new THREE.PlaneGeometry(0.5, 0.36);
    kit.add('screen', scr, X(6.4), 0.97, Z(0.5) + inz * 0.23, 0, north ? 0 : Math.PI, 0);
    scr.dispose();
    const tvAt = { x: X(6.4), z: Z(2.5) };
    if (hash(ci, cj, a.row * 2 + a.col, this.seed) < 0.6) box('box', 3.6, 0.22, 2.2, 0.55, 0.44, 0.45);
    if (hash(cj, ci, a.row * 2 + a.col, this.seed) < 0.5) box('box', 1.4 + 0.2, 0.18, 4.4, 0.6, 0.36, 0.5);
    if (a.chess) {
      box('wood', 4.0, 0.72, 3.0, 0.8, 0.04, 0.8);
      kit.add('chess', new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), X(4.0), 0.745, Z(3.0));
      box('wood', 4.0, 0.36, 3.0, 0.08, 0.72, 0.08, false);
      for (const s of [-1, 1]) {
        box('wood', 4.0 + s * 0.75, 0.45, 3.0, 0.42, 0.05, 0.42, false);
        box('wood', 4.0 + s * 0.95, 0.75, 3.0, 0.05, 0.55, 0.42, false);
      }
      acts.push({ x: X(4.0), z: Z(3.0), type: 'chess' });
    }
    // Bedroom.
    box('bed', 2.0, 0.28, D - 1.2, 1.5, 0.45, 2.0);
    box('cushion', 2.0, 0.55, D - 0.35, 1.3, 0.12, 0.35, false);
    box('wood', 4.3, 0.45, D - 0.4, 0.8, 0.9, 0.45);
    // Bathroom.
    box('white', W - 0.45, 0.28, 6.9, 0.75, 0.55, 1.6); // tub
    box('white', 5.5, 0.22, D - 0.4, 0.4, 0.44, 0.55); // toilet
    box('white', 6.6, 0.8, D - 0.3, 0.5, 0.15, 0.4, false); // sink
    // Ceiling lights.
    for (const [lx, lz] of [[W / 2, 2.5], [2.5, 6.9], [6.8, 6.9]]) kit.box('light', X(lx), H - 0.03, Z(lz), 0.4, 0.04, 0.4);
    return {
      x0: ax0, z0: Math.min(az0, az1), x1: ax1, z1: Math.max(az0, az1), tv: tvAt, light: { x: X(W / 2), z: Z(2.5) },
      item: a.item, key: `${this.floor}:${ci},${cj}:${a.row}${a.col}`, door: { x: X(W / 2), z: fz },
    };
  }

  // ---- Per frame --------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    this.updateCells(player);
    this.drawTV(dt);
    const px = player.pos.x, pz = player.pos.z;
    // Which apartment are we in?
    let inside = null;
    for (const c of this.cells.values()) for (const a of c.apts) {
      if (px > a.x0 && px < a.x1 && pz > a.z0 && pz < a.z1) inside = a;
      if (a.item && !this.itemsTaken.has(a.key) && Math.hypot(a.light.x - px, a.light.z - pz) < 20) {
        this.itemsTaken.add(a.key);
        ctx.placeItem?.(a.item, a.light.x + 0.6, a.light.z);
      }
    }
    if (inside && inside !== this.inside && !this.told.apt) {
      this.told.apt = true;
      ctx.hud.message('Somebody\'s home, except nobody is. The television\'s on. The fridge hums. It\'s warm in here. You could sit down for a minute.', 5);
    }
    this.inside = inside;
    // The pull of the apartments: comfort builds inside, faster near the TV,
    // faster the longer you've been here; it fades out in the halls.
    const nearTV = inside && Math.hypot(inside.tv.x - px, inside.tv.z - pz) < 2.2;
    const rate = (1 + this.time / 500) * (nearTV ? 1.6 : 0.7);
    if (inside) {
      this.comfort = Math.min(100, this.comfort + rate * dt);
      player.sanity = Math.min(100, player.sanity + (nearTV ? 1.2 : 0.6) * dt);
    } else this.comfort = Math.max(0, this.comfort - 0.9 * dt);
    player.speedMul = 1 - this.comfort * 0.0055;
    if (this.comfort > 40 && !this.told.c40) {
      this.told.c40 = true;
      ctx.hud.message('You feel heavy. Comfortable. What was the hurry, anyway?', 4);
    }
    if (this.comfort > 75 && !this.told.c75) {
      this.told.c75 = true;
      ctx.hud.message('Maybe you could just stay. Just for tonight. The show\'s about to start.', 4);
    }
    if (this.comfort < 20) this.told.c75 = false;
    if (this.comfort >= 100) {
      this.done = true;
      ctx.onDeath('You stayed. You watched the reruns, and ate what the fridge gave you, for years. One day the apartment was empty again, ready for someone new.');
      return;
    }
    // The halls wear on you a little; the apartments don't.
    if (!inside) player.sanity = Math.max(0, player.sanity - 0.03 * dt);
    // Walking into the yellow wallpaper.
    for (const c of this.cells.values()) for (const z of c.zones) {
      const d = Math.hypot(z.x - px, z.z - pz);
      if (d < 3.5 && !this.told.yellow) {
        this.told.yellow = true;
        ctx.hud.message('A stretch of wallpaper a deeper, richer yellow than anything else in this building. It looks soft.', 4);
      }
      if (d < 0.8) return this.leave('level289', 'noclip', 'You lean on the yellow wall, and it lets you in.');
    }
    // Hints, once each, for the odd doors.
    for (const c of this.cells.values()) for (const a of c.acts) {
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d > 5) continue;
      const tip = { red: 'A red door. The only red door you\'ve seen in here.', d235: 'A door with a plate that says 235. The numbers on the other doors here are all four digits.', plain: 'A plain, flush door with no number, no peephole, no frame. Easy to miss.', stairsUp: 'A stairwell marked STAIRS ▲, painted white. All the others only went down.' }[a.type];
      if (tip && !this.told[a.type]) {
        this.told[a.type] = true;
        ctx.hud.message(tip, 4);
      }
    }
    this.updateLights(player);
    if (this.rng.chance(dt * 0.05)) ctx.audio.door?.();
    if (this.rng.chance(dt * 0.04)) ctx.audio.voice?.(this.rng.range(-1, 1), 0.04);
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('The hallways went on, and on, and you stopped.');
    }
  }

  drawTV(dt) {
    this.tvT = (this.tvT || 0) - dt;
    if (this.tvT > 0) return;
    this.tvT = 0.12;
    const c = this.tvCanvas.getContext('2d');
    const t = this.time;
    // An old black-and-white show: a figure, a set, scanlines, snow.
    c.fillStyle = '#8a8a86';
    c.fillRect(0, 0, 64, 48);
    c.fillStyle = '#5a5a58';
    c.fillRect(0, 32, 64, 16);
    const scene = Math.floor(t / 6) % 3;
    c.fillStyle = '#d8d8d2';
    if (scene === 0) {
      c.fillRect(20 + Math.sin(t) * 6, 12, 8, 20);
      c.beginPath();
      c.arc(24 + Math.sin(t) * 6, 9, 4, 0, Math.PI * 2);
      c.fill();
      c.fillRect(40, 18, 6, 14);
    } else if (scene === 1) {
      c.beginPath();
      c.arc(32, 22, 12 + Math.sin(t * 3) * 1, 0, Math.PI * 2);
      c.fill();
    } else {
      c.font = 'bold 9px Arial';
      c.fillText('THE END', 13, 26);
    }
    const img = c.getImageData(0, 0, 64, 48);
    for (let k = 0; k < img.data.length; k += 4) {
      const n = (Math.random() - 0.5) * 50 - ((k / 256) % 2 < 1 ? 12 : 0);
      img.data[k] += n;
      img.data[k + 1] += n;
      img.data[k + 2] += n;
    }
    c.putImageData(img, 0, 0);
    this.tvTex.needsUpdate = true;
  }

  updateLights(player) {
    const px = player.pos.x, pz = player.pos.z;
    const cands = [];
    for (const c of this.cells.values()) {
      for (const tb of c.tubes) {
        if (tb.flicker && Math.sin(this.time * 13 + tb.x) > 0.6) continue;
        cands.push({ x: tb.x, y: H - 0.3, z: tb.z, d: Math.hypot(tb.x - px, tb.z - pz), warm: false });
      }
      for (const a of c.apts) cands.push({ x: a.light.x, y: H - 0.4, z: a.light.z, d: Math.hypot(a.light.x - px, a.light.z - pz) * 0.8, warm: true });
    }
    cands.sort((a, b) => a.d - b.d);
    this.pool.forEach((l, k) => {
      const c = cands[k];
      if (!c || c.d > 30) {
        l.intensity = 0;
        return;
      }
      l.position.set(c.x, c.y, c.z);
      l.color.setHex(c.warm ? 0xffe2b8 : 0xeef4ff);
      l.intensity = c.warm ? 3 : 2.6;
    });
  }

  // The act button.
  nearAct(player) {
    const px = player.pos.x, pz = player.pos.z;
    let best = null, bd = 1.3;
    for (const c of this.cells.values()) for (const a of c.acts) {
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  fire(player) {
    if (this.done) return;
    const a = this.nearAct(player);
    if (!a) return;
    const { ctx } = this;
    switch (a.type) {
      case 'fridge': {
        const last = this.fridgeAt.get(a.key);
        if (last != null && this.time - last < 90) {
          ctx.hud.message('The fridge is empty. It\'ll be full again later. It always is.', 3);
          return;
        }
        this.fridgeAt.set(a.key, this.time);
        player.health = Math.min(100, player.health + 20);
        player.sanity = Math.min(100, player.sanity + 10);
        this.comfort = Math.min(100, this.comfort + 8);
        const gave = this.rng.chance(0.4) && player.give?.(this.rng.chance(0.5) ? 'water' : 'milk');
        ctx.audio.pickup?.();
        ctx.hud.message(gave ? 'A microwave dinner, and a bottle for later. It tastes like being nine years old.' : 'A microwave dinner. It tastes like being nine years old.', 3.5);
        return;
      }
      case 'chess':
        return this.leave('level157', 'noclip', 'You touch a piece on the chessboard. The board tips, and the room tips with it.');
      case 'red':
        return this.leave('level275', 'door', 'You open the red door and step through.');
      case 'd235':
        return this.leave('level235', 'door', 'You try the handle of 235. It opens, onto somewhere that isn\'t this building.');
      case 'plain':
        return this.leave(a.target, 'door', 'The plain door opens onto somewhere else entirely.');
      case 'stairs':
        return this.changeFloor(player, this.floor - 1, 'stairs');
      case 'stairsUp':
        this.stairsUp++;
        if (this.stairsUp >= 4) return this.leave('level280', 'walk', 'Up, and up. You stop counting floors. The stairs don\'t stop.');
        return this.changeFloor(player, this.floor + 1, 'up');
      case 'down':
        return this.changeFloor(player, Math.max(1, this.floor - (12 + Math.floor(this.rng.next() * 34))), 'lift');
      case 'up': {
        let to = this.floor < 283 && this.rng.chance(0.35) ? 283 : Math.min(290, this.floor + 12 + Math.floor(this.rng.next() * 34));
        if (this.floor >= 290) {
          ctx.hud.message('The button for up doesn\'t light. This is the top floor.', 3);
          return;
        }
        return this.changeFloor(player, to, 'lift');
      }
    }
  }

  changeFloor(player, to, how) {
    const { ctx } = this;
    if (to <= 1) {
      if (how === 'lift') return this.leave('level208', 'door', 'The lift goes down past floor 1, and keeps going. When the doors open, it isn\'t a lobby.');
      return this.leave('level70', 'walk', 'Down the last flight, past floor 1, into a basement that doesn\'t belong to this building.');
    }
    ctx.fade?.(1, 0.15);
    ctx.audio[how === 'lift' ? 'bell' : 'step']?.(0, 0.1);
    this.floor = to;
    setTimeout(() => ctx.fade?.(0, 0.8), 250);
    this.rebuild(player);
    const weird = how === 'up' && this.stairsUp >= 2 ? ' The stairs feel longer than they should.' : '';
    ctx.hud.message(how === 'lift' ? `Ding. FLOOR ${to}.` : `FLOOR ${to}.${weird}`, 3);
    if (to === 283) ctx.hud.message('FLOOR 283. Banners: B.N.T.G. FREE HOME PROJECT. A home for everyone. More doors are open up here.', 5);
    if (to <= 30 && !this.told.low) {
      this.told.low = true;
      ctx.hud.message(`FLOOR ${to}. Getting close to the bottom.`, 3);
    }
  }

  leave(target, how, msg) {
    this.done = true;
    this.ctx.hud.message(msg, 5);
    this.ctx.onEscape(target, how);
  }

  drink(player) {
    if (this.inside) {
      player.sanity = Math.min(100, player.sanity + 10);
      this.comfort = Math.min(100, this.comfort + 3);
      this.ctx.audio.drink();
      this.ctx.hud.message('Water from the kitchen tap.', 2);
      return;
    }
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. (The kitchens have running water.)', 2);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads -------------------------------------------------------------------

  audioMix(player) {
    const nearTV = this.inside && Math.hypot(this.inside.tv.x - player.pos.x, this.inside.tv.z - player.pos.z) < 6;
    return {
      hum: this.inside ? 0.03 : 0.07, exitGain: 0, exitPan: 0, drone: 0, machine: 0,
      jazz: this.inside ? (nearTV ? 0.28 : 0.12) : 0.04, jazzMuffle: this.inside ? 2200 : 500,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const k = this.comfort / 100;
    this.fogC = this.fogC || new THREE.Color();
    this.fogC.setRGB(0.16 + k * 0.1, 0.15 + k * 0.07, 0.12 + k * 0.03);
    const insane = 1 - player.sanity / 100;
    return {
      fogColor: this.fogC,
      fogDensity: 0.028,
      warp: insane * insane * 0.5 + k * k * 0.5, aberr: 0.1 + insane * 0.4, grain: 0.07, soften: 0.2 + k * 0.5, fovMul: 1 - k * 0.12,
    };
  }

  hudInfo(player) {
    const a = this.nearAct(player);
    const labels = { fridge: 'OPEN FRIDGE', chess: 'TOUCH BOARD', red: 'OPEN DOOR', d235: 'TRY 235', plain: 'OPEN DOOR', stairs: 'STAIRS ▼', stairsUp: 'STAIRS ▲', down: 'LIFT ▼', up: 'LIFT ▲' };
    const warn = this.comfort > 80 ? 'GET OUT OF HERE' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true, act: a ? labels[a.type] : null, bars: { home: this.comfort } };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.cells.values()) this.dropCell(c);
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL13 = {
  id: 'level13',
  number: 13,
  name: 'Level 13',
  title: 'The Boiling Frogs',
  difficulty: 2,
  next: 'level0',
  create: (ctx) => new Level13(ctx),
};
