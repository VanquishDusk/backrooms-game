import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js?v=20261101b';
import { Kit, Colliders, paintTex } from '../level94/kit.js?v=20261101b';
import { hash } from '../level11/city.js?v=20261101b';
import { buildHumanoid, resetPose, idle } from '../../entities/lib/rig.js?v=20261101b';

// Level 6.1 — "Snackroom".
//
// An endless 1980s mall food court: wide halls with navy-blue tables and
// chairs, pillars, planters and benches under skylights that show only
// darkness (the halls are lit like daylight anyway), sunken seating pits,
// 80s hits on the speakers. Off the halls, a labyrinth of snack bars and
// restaurants from every age: a red 1950s bar, an old tavern, diners,
// noodle joints, and rooms packed with vending machines. The food never
// runs out, the vending machines are free, and the Facelings who work the
// counters are friendly. It's safe.
//
//   - The back door of a restaurant doesn't go back out to the hall: it
//     comes out in another restaurant
//   - Vending machines and counters give food and drink (act button)
//   - Ways out: sliding glass doors with daylight behind them (Level 11),
//     crawl into a vent (Level 3), the rusty steel door the M.E.G. guards
//     (Level 6), or a wall that's bent wrong (The Blue Channel)

const CELL = 26;
const HALL = 6; // the hall strip along each cell's west and north edges
const H = 6; // hall ceiling
const RH = 3.4; // restaurant ceiling
const NAMES = ['CLIPPERS', 'LIQUORETTE', 'THE SNACK SHACK', 'BURGER BARN', 'NOODLE NOOK', 'PIZZA PALACE', 'TACO TOWN', 'CAFE 81', 'THE ROYAL OAK', 'MILKSHAKE CITY', '', 'THE GREASY SPOON', 'SODA FOUNTAIN', 'DONUT HOLE', 'HOT DOG HUT', 'CASHEW CORNER'];
const STYLE = ['bar', 'bar', 'snack', 'diner', 'snack', 'diner', 'snack', 'diner', 'tavern', 'diner', 'snack', 'diner', 'diner', 'snack', 'snack', 'snack'];
const SPECIAL = { '2,0': 'meg', '-1,1': 'glass', '1,-2': 'bent', '0,0': 'hall', '0,-1': 'rest', '1,0': 'rest', '1,-1': 'vend' };

export class Level61 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.cameraFar = 160;
    this.own = { geos: [], mats: [], textures: [] };
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(10);
    this.buildMaterials();
    this.hemi = new THREE.HemisphereLight(0xfff6ea, 0xb8a890, 2.8);
    this.group.add(this.hemi);
    this.pool = Array.from({ length: 8 }, () => {
      const l = new THREE.PointLight(0xffd8b0, 0, 14, 1.4);
      this.group.add(l);
      return l;
    });
    this.cells = new Map();
    this.used = new Map();
    this.spawn = { x: 4.2, z: 3, yaw: -Math.PI / 2 - 0.15 };
    this.world = {
      collide: (pos, r) => this.colliders.collide(pos, r),
      groundAt: () => 0,
      sampleLight: () => [0.85, 0.85, 0.8],
      ceilingHeight: () => H,
    };
    this.time = 0;
    this.done = false;
    this.told = {};
    this.megTry = 0;
    this.updateCells({ pos: { x: this.spawn.x, z: this.spawn.z } });
    this.script = [
      [1.5, 'A food court. An endless one: navy-blue tables, pillars, planters, snack bars as far as you can see. Somebody\'s playing an 80s hit on the speakers.'],
      [9, 'The skylights show only darkness. It\'s bright as day in here anyway. It smells of fries and coffee.'],
      [18, 'The vending machines don\'t take money. Help yourself.'],
    ];
  }

  // ---- Materials --------------------------------------------------------------------------

  buildMaterials() {
    const own = this.own;
    const r = Math.random;
    const noise = (c, w, h, n, a, rgb) => {
      for (let i = 0; i < n; i++) {
        c.fillStyle = `rgba(${rgb},${(r() * a).toFixed(3)})`;
        c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
    };
    const T = {};
    T.floor = paintTex(own, 128, 128, (c, w, h) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#d8cbb0' : '#e6dcc4';
        c.fillRect(x * 32, y * 32, 32, 32);
      }
      noise(c, w, h, 2500, 0.18, '120,100,80');
      c.fillStyle = 'rgba(80,60,40,0.25)';
      for (let k = 0; k <= w; k += 32) {
        c.fillRect(k, 0, 1, h);
        c.fillRect(0, k, w, 1);
      }
    });
    T.wall = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#e8dccb';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 1200, 0.06, '90,70,50');
      c.fillStyle = '#c86a3a';
      c.fillRect(0, 98, w, 6);
      c.fillStyle = '#2a5a8a';
      c.fillRect(0, 106, w, 4);
    });
    T.ceiling = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#ece6da';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.1)';
      for (let k = 0; k <= w; k += 32) {
        c.fillRect(k, 0, 1, h);
        c.fillRect(0, k, w, 1);
      }
    });
    T.red = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#7a1a16';
      c.fillRect(0, 0, w, h);
      noise(c, w, h, 2000, 0.15, '20,0,0');
      c.fillStyle = '#4a2a14';
      c.fillRect(0, 84, w, 44);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 0; x < w; x += 16) c.fillRect(x, 84, 1, 44);
    });
    T.wood = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#5a3018';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        c.fillStyle = `rgba(${r() < 0.5 ? '30,12,4' : '120,70,30'},0.4)`;
        c.fillRect(0, y, w, 15);
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.fillRect(0, y + 15, w, 1);
      }
      noise(c, w, h, 1500, 0.15, '20,8,0');
    });
    T.checker = paintTex(own, 64, 64, (c) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f2eee4';
        c.fillRect(x * 16, y * 16, 16, 16);
      }
    });
    T.bottles = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#2a1408';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        c.fillStyle = '#6a3a1a';
        c.fillRect(0, y + 29, w, 3);
        for (let x = 2; x < w; x += 7 + r() * 4) {
          const bh = 16 + r() * 10;
          c.fillStyle = ['#2a5a2a', '#6a2a1a', '#c8a050', '#e8e0c0', '#1a1a3a', '#8a5a20'][Math.floor(r() * 6)];
          c.fillRect(x, y + 29 - bh, 5, bh);
          c.fillRect(x + 1.5, y + 29 - bh - 5, 2, 5);
          c.fillStyle = 'rgba(255,255,255,0.3)';
          c.fillRect(x + 1, y + 29 - bh + 2, 1, bh - 4);
        }
      }
    });
    T.glass = paintTex(own, 256, 64, (c, w, h) => {
      c.fillStyle = '#1a1a10';
      c.fillRect(0, 0, w, h);
      for (let k = 0; k < 90; k++) {
        c.fillStyle = ['#d8e870', '#f8f0d0', '#e85a4a', '#5a7ae8', '#90d060', '#f8c040'][Math.floor(r() * 6)];
        c.beginPath();
        const x = r() * w, y = r() * h;
        c.moveTo(x, y);
        for (let s = 0; s < 5; s++) c.lineTo(x + (r() - 0.5) * 22, y + (r() - 0.5) * 18);
        c.fill();
      }
      c.strokeStyle = '#1a1a10';
      c.lineWidth = 2;
      for (let k = 0; k < 60; k++) {
        c.beginPath();
        c.moveTo(r() * w, r() * h);
        c.lineTo(r() * w, r() * h);
        c.stroke();
      }
    }, false);
    T.vend = paintTex(own, 64, 128, (c, w, h) => {
      c.fillStyle = '#141416';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0a1420';
      c.fillRect(4, 8, 42, 80);
      for (let y = 12; y < 84; y += 12) {
        c.fillStyle = '#5a5a5a';
        c.fillRect(4, y + 9, 42, 1);
        for (let x = 6; x < 44; x += 7) {
          c.fillStyle = ['#e83a2a', '#f8c830', '#3a8ae8', '#f2f2ea', '#e87a2a', '#6ac84a', '#c83a8a'][Math.floor(r() * 7)];
          c.fillRect(x, y, 5, 8);
        }
      }
      c.fillStyle = '#3a3a40';
      c.fillRect(49, 30, 11, 22);
      c.fillStyle = '#9ac8ff';
      c.fillRect(50, 20, 9, 6);
      c.fillStyle = '#2a2a2a';
      c.fillRect(6, 98, 38, 14);
    }, false);
    T.cooler = paintTex(own, 64, 128, (c, w, h) => {
      c.fillStyle = '#c81e1e';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0a1830';
      c.fillRect(5, 6, 40, 104);
      for (let y = 10; y < 104; y += 16) for (let x = 7; x < 43; x += 5) {
        c.fillStyle = ['#9ad8ff', '#d8f0ff', '#8ae86a', '#f8a8d8', '#f8e870'][Math.floor(r() * 5)];
        c.fillRect(x, y, 3, 12);
      }
      c.fillStyle = '#e8e8e8';
      c.fillRect(48, 24, 13, 34);
    }, false);
    T.signs = paintTex(own, 1024, 256, (c) => {
      NAMES.forEach((n, k) => {
        const x = (k % 4) * 256, y = Math.floor(k / 4) * 64;
        const bg = ['#8a1414', '#1a1a1a', '#f8e8c0', '#1e3a6a', '#e8a020', '#103a2a', '#e8e0d0', '#5a1a5a'][k % 8];
        const fg = ['#ffe8a0', '#ff4ad8', '#c81e1e', '#ffffff', '#2a1408', '#f8e8a0', '#1e3a6a', '#f8d8f0'][k % 8];
        c.fillStyle = bg;
        c.fillRect(x, y, 256, 64);
        c.fillStyle = fg;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `bold ${n.length > 12 ? 26 : 34}px Georgia, serif`;
        c.fillText(n || '    ', x + 128, y + 34);
      });
    }, false);
    T.daylight = paintTex(own, 64, 64, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fff6e0');
      g.addColorStop(1, '#ffd8a0');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }, false);
    T.bent = paintTex(own, 64, 64, (c, w, h) => {
      c.fillStyle = '#d8ccbc';
      c.fillRect(0, 0, w, h);
      for (let k = 0; k < 6; k++) {
        c.strokeStyle = `rgba(40,60,140,${0.15 + k * 0.05})`;
        c.lineWidth = 3;
        c.beginPath();
        for (let x = 0; x <= w; x += 4) c.lineTo(x, 10 + k * 9 + Math.sin(x * 0.2 + k) * 4);
        c.stroke();
      }
    });
    const L = (o) => {
      const m = new THREE.MeshLambertMaterial(o);
      own.mats.push(m);
      return m;
    };
    this.M = {
      floor: L({ map: T.floor }),
      wall: L({ map: T.wall, emissive: 0x2a2620, emissiveMap: T.wall }),
      ceiling: L({ map: T.ceiling, emissive: 0x6a6458, emissiveMap: T.ceiling }),
      sky: L({ color: 0x050608 }),
      skyframe: L({ color: 0xc8c4bc }),
      navy: L({ color: 0x1e2e5a }),
      chrome: L({ color: 0xb8bcc0 }),
      pillar: L({ color: 0xe8e0d0 }),
      planter: L({ color: 0xa8603a }),
      leaf: L({ color: 0x3a7a3a }),
      bench: L({ color: 0x6a4a2a }),
      pit: L({ color: 0x9a3a2a }),
      red: L({ map: T.red }),
      wood: L({ map: T.wood }),
      darkwood: L({ map: T.wood, color: 0x8a6a5a }),
      checker: L({ map: T.checker }),
      bottles: L({ map: T.bottles, emissive: 0x3a1a08, emissiveMap: T.bottles }),
      glass: L({ map: T.glass, emissive: 0xffffff, emissiveMap: T.glass, emissiveIntensity: 1 }),
      vend: L({ map: T.vend, emissive: 0xffffff, emissiveMap: T.vend, emissiveIntensity: 0.55 }),
      cooler: L({ map: T.cooler, emissive: 0xffffff, emissiveMap: T.cooler, emissiveIntensity: 0.5 }),
      vendside: L({ color: 0x18181a }),
      signs: L({ map: T.signs, emissive: 0xffffff, emissiveMap: T.signs, emissiveIntensity: 0.5 }),
      counter: L({ color: 0xd8c8a0 }),
      booth: L({ color: 0xa81e2a }),
      white: L({ color: 0xf2eee6 }),
      orange: L({ color: 0xe8781e }),
      steel: L({ color: 0x5a4a3c }),
      rust: L({ color: 0x6a3a1e }),
      megGreen: L({ color: 0x3a4a34 }),
      daylight: L({ map: T.daylight, emissive: 0xffffff, emissiveMap: T.daylight, emissiveIntensity: 1 }),
      frame: L({ color: 0x8a8a8a }),
      vent: L({ color: 0x8a8c8e }),
      ventHole: new THREE.MeshBasicMaterial({ color: 0x080808 }),
      bent: L({ map: T.bent }),
      clock: L({ color: 0xf8f0e0, emissive: 0x6a5a40 }),
      skin: L({ color: 0xd8b49a }),
      apron: L({ color: 0xf2f2f2 }),
      shirt: L({ color: 0xc83a2a }),
      pants: L({ color: 0x2a2a30 }),
    };
    own.mats.push(this.M.ventHole);
  }

  // ---- Plans ------------------------------------------------------------------------------

  plan(i, j) {
    const h = (k) => hash(i, j, k, this.seed);
    let type = SPECIAL[`${i},${j}`];
    if (!type) {
      const r = h(1);
      type = r < 0.38 ? 'hall' : r < 0.78 ? 'rest' : r < 0.92 ? 'vend' : r < 0.95 ? 'glass' : r < 0.97 ? 'meg' : 'bent';
    }
    const name = i === 0 && j === -1 ? 0 : i === 1 && j === 0 ? 1 : Math.floor(h(2) * NAMES.length);
    return { i, j, type, name, style: STYLE[name], vent: h(3) < 0.35, pit: type === 'hall' && h(4) < 0.4, pile: type === 'vend' && h(5) < 0.3 };
  }

  updateCells(player) {
    const ci = Math.floor(player.pos.x / CELL), cj = Math.floor(player.pos.z / CELL);
    if (ci === this.ci && cj === this.cj) return;
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
      this.group.remove(c.group);
      for (const g of c.geos) g.dispose();
      for (const s of c.solids) this.colliders.remove(s);
      this.cells.delete(key);
    }
  }

  makeCell(i, j) {
    const p = this.plan(i, j);
    const kit = new Kit();
    const X0 = i * CELL, Z0 = j * CELL;
    const bx0 = X0 + HALL, bz0 = Z0 + HALL, bx1 = X0 + CELL, bz1 = Z0 + CELL;
    const out = { solids: [], acts: [], lights: [], staff: [], zones: [], doors: [] };
    const solid = (x0, z0, x1, z1, y1 = H) => {
      const s = this.colliders.add({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, rot: 0, y0: -1, y1 });
      out.solids.push(s);
    };
    const box = (key, x0, y0, z0, x1, y1, z1, col = false, uv = 0.25) => {
      kit.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), 0, uv);
      if (col) solid(x0, z0, x1, z1, y1);
    };
    // Floor and ceiling for the whole cell.
    const fl = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
    fl.attributes.uv.array.forEach((v, k, a) => (a[k] = v * CELL / 2));
    kit.add('floor', fl, X0 + CELL / 2, 0, Z0 + CELL / 2);
    fl.dispose();
    // Skylights down the halls: dark glass in a pale frame.
    const ceil = (x0, z0, x1, z1) => box('ceiling', x0, H, z0, x1, H + 0.2, z1);
    ceil(X0, Z0, X0 + 1.2, bz1);
    ceil(X0 + HALL - 1.2, Z0 + HALL, X0 + HALL, bz1);
    box('sky', X0 + 1.2, H + 0.15, Z0 + HALL, X0 + HALL - 1.2, H + 0.2, bz1);
    ceil(X0, Z0, bx1, Z0 + 1.2);
    ceil(X0 + HALL, Z0 + HALL - 1.2, bx1, Z0 + HALL);
    box('sky', X0 + HALL, H + 0.15, Z0 + 1.2, bx1, H + 0.2, Z0 + HALL - 1.2);
    box('sky', X0 + 1.2, H + 0.15, Z0 + 1.2, X0 + HALL - 1.2, H + 0.2, Z0 + HALL - 1.2);
    for (let k = 0; k <= 4; k++) {
      box('skyframe', X0 + 1.2, H - 0.05, Z0 + HALL + k * 5, X0 + HALL - 1.2, H + 0.15, Z0 + HALL + k * 5 + 0.15);
      box('skyframe', X0 + HALL + k * 5, H - 0.05, Z0 + 1.2, X0 + HALL + k * 5 + 0.15, H + 0.15, Z0 + HALL - 1.2);
    }
    // A pillar at the crossing.
    kit.add('pillar', new THREE.CylinderGeometry(0.45, 0.45, H, 14).translate(0, H / 2, 0), X0 + HALL / 2, 0, Z0 + HALL / 2);
    solid(X0 + HALL / 2 - 0.45, Z0 + HALL / 2 - 0.45, X0 + HALL / 2 + 0.45, Z0 + HALL / 2 + 0.45);
    out.lights.push({ x: X0 + HALL / 2, y: H - 1, z: Z0 + HALL / 2 + 8, warm: false });
    // The block.
    const t = 0.25;
    const wallsAround = (mat, doorN, doorS) => {
      // West and east walls are full; north and south have a door gap.
      box(mat, bx0, 0, bz0, bx0 + t, H, bz1, true);
      box(mat, bx1 - t, 0, bz0, bx1, H, bz1, true);
      const seg = (z, door, key) => {
        if (door == null) return box(key, bx0, 0, z, bx1, H, z + t, true);
        box(key, bx0, 0, z, door - 1.1, H, z + t, true);
        box(key, door + 1.1, 0, z, bx1, H, z + t, true);
        box(key, door - 1.1, 2.5, z, door + 1.1, H, z + t);
      };
      seg(bz0, doorN, mat);
      seg(bz1 - t, doorS, mat);
    };
    const mid = (bx0 + bx1) / 2;
    if (p.type === 'hall') {
      this.hallFurniture(kit, p, out, solid, bx0, bz0, bx1, bz1);
    } else if (p.type === 'rest') {
      this.restaurant(kit, p, out, solid, box, bx0, bz0, bx1, bz1, wallsAround);
    } else if (p.type === 'vend') {
      wallsAround('wall', mid, null);
      this.vendRoom(kit, p, out, solid, box, bx0, bz0, bx1, bz1);
    } else if (p.type === 'glass') {
      // A shopfront of glass doors, daylight pouring through.
      box('wall', bx0, 0, bz0 + 2, bx1, H, bz1, true);
      for (let k = 0; k < 4; k++) {
        const x = bx0 + 2 + k * 4.5;
        box('daylight', x, 0, bz0 + 1.98, x + 4.2, 3, bz0 + 2.0);
        box('frame', x - 0.05, 0, bz0 + 1.9, x + 0.05, 3, bz0 + 2);
      }
      box('frame', bx0, 3, bz0 + 1.9, bx1, 3.15, bz0 + 2);
      out.zones.push({ x0: bx0 + 2, x1: bx1 - 2, z0: bz0 + 1.2, z1: bz0 + 2.4, type: 'glass' });
      out.lights.push({ x: mid, y: 2.5, z: bz0 + 0.8, warm: true, power: 6 });
    } else if (p.type === 'meg') {
      wallsAround('wall', null, null);
      box('rust', mid - 0.9, 0, bz0 - 0.06, mid + 0.9, 2.4, bz0);
      box('steel', mid - 1.1, 2.4, bz0 - 0.08, mid + 1.1, 2.6, bz0);
      for (let k = 0; k < 7; k++) box('rust', mid - 0.88, 0.2 + k * 0.32, bz0 - 0.09, mid + 0.88, 0.25 + k * 0.32, bz0 - 0.06);
      out.acts.push({ x: mid, z: bz0 - 0.9, type: 'meg' });
      for (const s of [-1.8, 1.8]) {
        const g = this.person(mid + s, bz0 - 1.2, Math.PI, 'megGreen', 'megGreen');
        out.staff.push(g);
      }
      // Sandbags.
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) box('megGreen', mid + s * (2.6 + k * 0.7) - 0.3, 0, bz0 - 0.9, mid + s * (2.6 + k * 0.7) + 0.3, 0.45, bz0 - 0.4, true);
    } else if (p.type === 'bent') {
      wallsAround('wall', null, null);
      // A stretch of the wall that bows inward, wrong.
      const g = new THREE.PlaneGeometry(4, H, 12, 6);
      const pa = g.attributes.position;
      for (let k = 0; k < pa.count; k++) pa.setZ(k, -Math.sin(((pa.getX(k) + 2) / 4) * Math.PI) * 0.9 * Math.sin(((pa.getY(k) + H / 2) / H) * Math.PI));
      g.computeVertexNormals();
      kit.add('bent', g, mid, H / 2, bz0 - 0.02, 0, Math.PI, 0);
      g.dispose();
      out.zones.push({ x0: mid - 1.5, x1: mid + 1.5, z0: bz0 - 1.2, z1: bz0 - 0.3, type: 'bent' });
    }
    // A vent low on the hall wall.
    if (p.vent && p.type !== 'hall' && p.type !== 'glass') {
      const z = bz0 + 3 + hash(i, j, 9, this.seed) * (CELL - HALL - 6);
      box('vent', bx0 - 0.04, 0.2, z - 0.45, bx0, 0.9, z + 0.45);
      box('ventHole', bx0 - 0.05, 0.28, z - 0.37, bx0 - 0.04, 0.82, z + 0.37);
      for (let k = 0; k < 5; k++) box('vent', bx0 - 0.07, 0.32 + k * 0.11, z - 0.38, bx0 - 0.05, 0.35 + k * 0.11, z + 0.38);
      out.acts.push({ x: bx0 - 0.8, z, type: 'vent' });
    }
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const group = kit.build(this.M, own);
    for (const s of out.staff) {
      group.add(s.root);
      own.geos.push(...s.geos);
    }
    this.group.add(group);
    return { i, j, plan: p, group, geos: own.geos, ...out };
  }

  // Navy tables and chairs, planters, benches, maybe a sunken seating pit.
  hallFurniture(kit, p, out, solid, bx0, bz0, bx1, bz1) {
    const h = (k) => hash(p.i, p.j, 50 + k, this.seed);
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    if (p.pit) {
      kit.add('pit', new THREE.CylinderGeometry(6, 6, 0.04, 32), cx, 0.02, cz);
      kit.add('wood', new THREE.TorusGeometry(5.6, 0.35, 6, 32).rotateX(Math.PI / 2), cx, 0.4, cz);
      kit.add('planter', new THREE.CylinderGeometry(1.2, 1.3, 0.8, 16), cx, 0.4, cz);
      kit.add('leaf', new THREE.IcosahedronGeometry(1.1, 1), cx, 1.4, cz);
      solid(cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2, 2);
    }
    for (let k = 0; k < 6; k++) {
      const x = bx0 + 2.5 + h(k) * (bx1 - bx0 - 5), z = bz0 + 2.5 + h(k + 10) * (bz1 - bz0 - 5);
      if (p.pit && Math.hypot(x - cx, z - cz) < 7) continue;
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 3) continue;
      kit.add('navy', new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), x, 0.74, z);
      kit.add('chrome', new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), x, 0.36, z);
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + h(k + 20);
        const sx = x + Math.cos(a) * 0.85, sz = z + Math.sin(a) * 0.85;
        kit.add('navy', new THREE.BoxGeometry(0.42, 0.06, 0.42), sx, 0.45, sz, 0, -a, 0);
        kit.add('navy', new THREE.BoxGeometry(0.06, 0.45, 0.42), sx + Math.cos(a) * 0.2, 0.7, sz + Math.sin(a) * 0.2, 0, -a, 0);
        kit.add('chrome', new THREE.CylinderGeometry(0.025, 0.025, 0.45, 5), sx, 0.22, sz);
      }
      solid(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 1);
    }
    for (let k = 0; k < 3; k++) {
      const x = bx0 + 1 + h(30 + k) * (bx1 - bx0 - 2), z = bz0 + 1 + h(40 + k) * (bz1 - bz0 - 2);
      if (p.pit && Math.hypot(x - cx, z - cz) < 7) continue;
      kit.add('planter', new THREE.BoxGeometry(1, 0.7, 1), x, 0.35, z);
      kit.add('leaf', new THREE.IcosahedronGeometry(0.7, 1), x, 1.2, z, 0, k, 0, 1, 1.3, 1);
      solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1.6);
    }
    out.lights.push({ x: cx, y: H - 1, z: cz, warm: false });
  }

  restaurant(kit, p, out, solid, box, bx0, bz0, bx1, bz1, wallsAround) {
    const mid = (bx0 + bx1) / 2;
    const st = p.style;
    const wallMat = st === 'bar' || st === 'tavern' ? 'red' : 'wall';
    wallsAround(wallMat, mid, mid);
    // Interior ceiling, floor.
    box(st === 'bar' || st === 'tavern' ? 'darkwood' : 'ceiling', bx0, RH, bz0, bx1, RH + 0.1, bz1);
    box(st === 'diner' ? 'checker' : st === 'snack' ? 'floor' : 'wood', bx0 + 0.25, 0.005, bz0 + 0.25, bx1 - 0.25, 0.015, bz1 - 0.25, false, 0.5);
    // The sign over the front.
    const g = new THREE.PlaneGeometry(6, 1.5);
    const uv = g.attributes.uv;
    const c = p.name % 4, r = Math.floor(p.name / 4);
    for (let k = 0; k < 4; k++) uv.setXY(k, (c + uv.getX(k)) / 4, 1 - (r + 1 - uv.getY(k)) / 4);
    kit.add('signs', g, mid, 3.6, bz0 - 0.03, 0, Math.PI, 0);
    g.dispose();
    // The counter along the east wall, with a Faceling behind it.
    const cx = bx1 - 3;
    box(st === 'bar' || st === 'tavern' ? 'darkwood' : 'counter', cx - 0.5, 0, bz0 + 3, cx + 0.5, 1.05, bz1 - 3, true);
    box(st === 'bar' || st === 'tavern' ? 'bottles' : 'white', bx1 - 0.35, 0.9, bz0 + 2.5, bx1 - 0.26, 2.9, bz1 - 2.5);
    out.acts.push({ x: cx - 1.2, z: (bz0 + bz1) / 2, type: 'counter' });
    out.staff.push(this.person(cx + 1.2, (bz0 + bz1) / 2 + 2, -Math.PI / 2, 'apron', 'pants'));
    // Stools at the counter, tables or booths in the room.
    for (let k = 0; k < 5; k++) {
      const z = bz0 + 4 + k * 2.6;
      kit.add(st === 'bar' || st === 'tavern' ? 'wood' : 'booth', new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), cx - 1.0, 0.75, z);
      kit.add('chrome', new THREE.CylinderGeometry(0.03, 0.03, 0.75, 5), cx - 1.0, 0.37, z);
    }
    if (st === 'bar' || st === 'tavern') {
      // A carved wooden arch over the bar, set with lit stained glass.
      kit.add('darkwood', new THREE.TorusGeometry(4.5, 0.25, 8, 24, Math.PI).rotateY(Math.PI / 2), cx, 0.6, (bz0 + bz1) / 2);
      const gg = new THREE.PlaneGeometry(9, 0.8);
      kit.add('glass', gg, cx - 0.3, 3.0, (bz0 + bz1) / 2, 0, Math.PI / 2, 0);
      gg.dispose();
      kit.add('clock', new THREE.CylinderGeometry(0.35, 0.35, 0.05, 16).rotateZ(Math.PI / 2), cx - 0.32, 2.4, (bz0 + bz1) / 2);
      out.lights.push({ x: mid, y: RH - 0.4, z: (bz0 + bz1) / 2, warm: true, red: true, power: 5 });
    } else out.lights.push({ x: mid, y: RH - 0.4, z: (bz0 + bz1) / 2, warm: true, power: 4 });
    for (let k = 0; k < 4; k++) {
      const x = bx0 + 2.5, z = bz0 + 3 + k * 4;
      if (st === 'diner') {
        box('booth', x - 1.4, 0, z - 0.9, x + 1.4, 0.45, z - 0.4, true);
        box('booth', x - 1.4, 0.45, z - 1.0, x + 1.4, 1.2, z - 0.85);
        box('white', x - 1.2, 0.72, z - 0.35, x + 1.2, 0.78, z + 0.35, true);
        box('booth', x - 1.4, 0, z + 0.4, x + 1.4, 0.45, z + 0.9, true);
      } else {
        kit.add('wood', new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), x + 1, 0.74, z);
        kit.add('darkwood', new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), x + 1, 0.36, z);
        solid(x + 0.5, z - 0.5, x + 1.5, z + 0.5, 1);
      }
    }
    // The back door: it opens into some other restaurant.
    out.doors.push({ x: mid, z: bz1 - 0.8 });
    out.room = { x0: bx0, x1: bx1, z0: bz0, z1: bz1, front: { x: mid, z: bz0 + 1.2 }, bar: st === 'bar' || st === 'tavern', name: NAMES[p.name] || 'a restaurant with no name' };
  }

  vendRoom(kit, p, out, solid, box, bx0, bz0, bx1, bz1) {
    const h = (k) => hash(p.i, p.j, 80 + k, this.seed);
    const mid = (bx0 + bx1) / 2;
    box('ceiling', bx0, RH, bz0, bx1, RH + 0.1, bz1);
    const machine = (x, z, ry, y = 0, tilt = 0) => {
      const cool = h(Math.round(x * 3 + z)) < 0.3;
      kit.add('vendside', new THREE.BoxGeometry(1.0, 1.85, 0.85).translate(0, 0.925, 0), x, y, z, tilt, ry, 0);
      const f = new THREE.PlaneGeometry(0.96, 1.8).translate(0, 0.92, 0.43);
      kit.add(cool ? 'cooler' : 'vend', f, x, y, z, tilt, ry, 0);
      f.dispose();
    };
    // Rows along the walls, a few in the middle, sometimes a heap.
    const n = Math.floor((bx1 - bx0 - 2) / 1.1);
    for (let k = 0; k < n; k++) {
      const x = bx0 + 1.2 + k * 1.1;
      if (Math.abs(x - mid) < 1.4) continue;
      machine(x, bz0 + 0.8, 0);
      out.acts.push({ x, z: bz0 + 1.8, type: 'vend', key: `${p.i},${p.j},n${k}` });
      machine(x, bz1 - 0.8, Math.PI);
      out.acts.push({ x, z: bz1 - 1.8, type: 'vend', key: `${p.i},${p.j},s${k}` });
    }
    solid(bx0, bz0, mid - 1.4, bz0 + 1.3, 2);
    solid(mid + 1.4, bz0, bx1, bz0 + 1.3, 2);
    solid(bx0, bz1 - 1.3, bx1, bz1, 2);
    if (p.pile) {
      for (let k = 0; k < 9; k++) machine(mid - 3 + h(k) * 6, (bz0 + bz1) / 2 - 2 + h(k + 9) * 4, h(k + 20) * 6, Math.floor(k / 4) * 0.9, (h(k + 30) - 0.5) * 1.2);
      solid(mid - 4, (bz0 + bz1) / 2 - 3, mid + 4, (bz0 + bz1) / 2 + 3, 3);
    } else {
      for (let k = 0; k < 3; k++) {
        const x = mid - 3 + k * 3, z = (bz0 + bz1) / 2;
        machine(x, z, h(k) < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        solid(x - 0.45, z - 0.55, x + 0.45, z + 0.55, 2);
      }
    }
    // Windows with an orange daylight glow.
    for (const z of [bz0 + 6, bz0 + 12]) box('daylight', bx1 - 0.27, 1.2, z - 1, bx1 - 0.25, 2.6, z + 1);
    out.lights.push({ x: mid, y: RH - 0.4, z: (bz0 + bz1) / 2, warm: false, power: 4 });
  }

  // A Faceling at work (or a guard): blank face, apron.
  person(x, z, ry, shirt, pants) {
    const M = this.M;
    const rig = buildHumanoid({ mat: M[shirt], torsoMat: M[shirt], armMat: M.shirt, forearmMat: M.skin, handMat: M.skin, headMat: M.skin, legMat: M[pants], footMat: M.pants });
    rig.root.position.set(x, 0, z);
    rig.root.rotation.y = ry;
    return { root: rig.root, rig, geos: rig.geos, x, z, t: Math.random() * 10 };
  }

  // ---- Per frame -------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    this.updateCells(player);
    const px = player.pos.x, pz = player.pos.z;
    this.inside = null;
    for (const c of this.cells.values()) {
      for (const s of c.staff) {
        s.t += dt;
        resetPose(s.rig);
        idle(s.rig, s.t, 1);
        if (Math.hypot(s.x - px, s.z - pz) < 6) s.root.rotation.y = Math.atan2(px - s.x, pz - s.z);
      }
      const r = c.room;
      if (r && px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1) this.inside = r;
      // Back doors come out in another restaurant.
      for (const d of c.doors) {
        if (Math.hypot(d.x - px, d.z - pz) < 0.7) {
          const rooms = [...this.cells.values()].filter((o) => o.room && o !== c);
          const to = rooms.length ? this.rng.pick(rooms).room : null;
          if (to) {
            ctx.fade?.(1, 0.06);
            setTimeout(() => ctx.fade?.(0, 0.6), 100);
            player.pos.x = to.front.x;
            player.pos.z = to.front.z + 1.5;
            player.yaw = Math.PI;
            ctx.audio.door?.();
            if (!this.told.back) {
              this.told.back = true;
              ctx.hud.message(`You go out the back door... and you're walking into ${to.name}, through its front. The hall should be behind you. It isn't.`, 5);
            }
            return;
          }
        }
      }
      for (const z of c.zones) {
        const near = px > z.x0 - 4 && px < z.x1 + 4 && pz > z.z0 - 5 && pz < z.z1 + 5;
        if (near && !this.told[z.type]) {
          this.told[z.type] = true;
          ctx.hud.message(z.type === 'glass' ? 'Sliding glass doors, and real daylight behind them. A street. A restaurant awning across the road.' : 'A stretch of wall that bows inward, wrong, like it\'s been pushed from the other side. Faint blue lines ripple across it.', 5);
        }
        if (px > z.x0 && px < z.x1 && pz > z.z0 && pz < z.z1) {
          this.done = true;
          if (z.type === 'glass') {
            ctx.hud.message('The doors slide open with a hiss, and you step out into daylight, outside a restaurant in a quiet city.', 5);
            ctx.onEscape('level11', 'walk');
          } else {
            ctx.audio.staticBurst?.(0.3);
            ctx.hud.message('You press into the bent wall and it folds round you, cold and blue.', 5);
            ctx.onEscape('blue_channel', 'noclip');
          }
          return;
        }
      }
    }
    if (this.inside && this.inside !== this.lastRoom) {
      this.lastRoom = this.inside;
      ctx.hud.message(this.inside.bar ? `${this.inside.name}. Red walls, dark wood, a stained-glass arch over the bar. A Faceling polishes a glass and nods at you.` : `${this.inside.name}. A Faceling behind the counter gives you a little wave. No face, but somehow you know it's smiling.`, 4);
    }
    if (!this.inside) this.lastRoom = null;
    this.updateLights(player);
    player.sanity = Math.min(100, player.sanity + 0.2 * dt);
    if (this.rng.chance(dt * 0.02)) ctx.audio.clank?.(this.rng.range(-1, 1), 0.04);
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('Even here.');
    }
  }

  updateLights(player) {
    const px = player.pos.x, pz = player.pos.z;
    const cands = [];
    for (const c of this.cells.values()) for (const l of c.lights) cands.push({ ...l, d: Math.hypot(l.x - px, l.z - pz) });
    cands.sort((a, b) => a.d - b.d);
    this.pool.forEach((pl, k) => {
      const c = cands[k];
      if (!c || c.d > 40) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(c.x, c.y, c.z);
      pl.color.setHex(c.red ? 0xff6a4a : c.warm ? 0xffd8a8 : 0xfff4e8);
      pl.intensity = (c.power || 3) * 1.6;
    });
  }

  nearAct(player) {
    let best = null, bd = 1.4;
    for (const c of this.cells.values()) for (const a of c.acts) {
      const d = Math.hypot(a.x - player.pos.x, a.z - player.pos.z);
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
    if (a.type === 'vend' || a.type === 'counter') {
      const key = a.key || `${Math.round(a.x)},${Math.round(a.z)}`;
      const last = this.used.get(key);
      if (last != null && this.time - last < 40) {
        ctx.hud.message(a.type === 'vend' ? 'Sold out. It\'ll be restocked. It always is.' : 'The Faceling holds up a finger: give it a minute.', 2.5);
        return;
      }
      this.used.set(key, this.time);
      player.health = Math.min(100, player.health + (a.type === 'counter' ? 25 : 12));
      player.sanity = Math.min(100, player.sanity + 8);
      ctx.audio.pickup?.();
      const drink = this.rng.chance(a.type === 'vend' ? 0.45 : 0.3);
      const item = drink ? this.rng.pick(['water', 'water', 'milk']) : null;
      const got = item && player.give?.(item);
      ctx.hud.message(a.type === 'vend'
        ? (got ? `Clunk. ${item === 'milk' ? 'A carton of Almond Milk' : 'A bottle of Almond Water'}, and a bag of chips for now. No coin slot. Free.` : 'Clunk. A candy bar. It\'s free; it always is.')
        : (got ? 'The Faceling slides you a plate of fries and a burger, and a bottle for the road.' : 'The Faceling slides you a plate of fries and a burger. It won\'t take anything for it.'), 3.5);
      return;
    }
    if (a.type === 'vent') {
      this.done = true;
      ctx.hud.message('You pull the grille off and crawl into the vent. It sucks you in, and down, into heat and noise and machinery.', 5);
      ctx.onEscape('level3', 'noclip');
      return;
    }
    if (a.type === 'meg') {
      this.megTry++;
      if (this.megTry === 1) {
        this.megT = this.time;
        ctx.hud.message('A M.E.G. guard steps in front of the rusty steel door. "Restricted. That\'s the way to Level 6, and you don\'t want Level 6." Behind the door, faintly, screaming.', 6);
      } else if (this.time - this.megT < 20) {
        this.done = true;
        ctx.hud.message('"Your funeral." The guard hauls the steel door open. It\'s pitch black on the other side.', 5);
        ctx.onEscape('level6', 'door');
      } else {
        this.megTry = 1;
        this.megT = this.time;
        ctx.hud.message('"Still restricted." The guard doesn\'t move. (Ask again, quickly, if you really mean it.)', 4);
      }
    }
  }

  drink(player) {
    if (this.inside) {
      player.sanity = Math.min(100, player.sanity + 12);
      this.ctx.audio.drink();
      this.ctx.hud.message('A glass of plain, clean water. Real water. Rare, out there.', 2.5);
      return;
    }
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. (The vending machines are free.)', 2);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  audioMix(player) {
    return {
      hum: 0.03, exitGain: 0, exitPan: 0, drone: 0, machine: 0.02,
      jazz: this.inside ? 0.32 : 0.14, jazzMuffle: this.inside ? 5000 : 1800,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    this.fogC = this.fogC || new THREE.Color();
    if (this.inside?.bar) this.fogC.setRGB(0.18, 0.06, 0.04);
    else this.fogC.setRGB(0.78, 0.72, 0.62);
    return { fogColor: this.fogC, fogDensity: this.inside?.bar ? 0.03 : 0.011, warp: 0, aberr: 0.1, grain: 0.05, soften: 0.18 };
  }

  hudInfo(player) {
    const a = this.nearAct(player);
    const labels = { vend: 'VEND', counter: 'GET FOOD', vent: 'CRAWL IN', meg: 'STEEL DOOR' };
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: true, act: a ? labels[a.type] : null };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.cells.values()) for (const g of c.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL6_1 = {
  id: 'level6_1',
  number: 6.1,
  name: 'Level 6.1',
  title: 'Snackroom',
  difficulty: 0,
  next: 'level11',
  create: (ctx) => new Level61(ctx),
};
