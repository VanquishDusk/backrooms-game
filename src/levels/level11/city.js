import * as THREE from 'three';
import { paintTex } from '../level94/kit.js';

// Level 11's city, as plans and materials. A block is B metres square and
// owns the road along its west and north edges (with the crossing at its
// north-west corner) and the sidewalks round its edge. Inside, two rows of
// buildings stand back to back with an alley between them, each row facing
// its own street. How tall they are depends on the district: towers
// downtown, offices and apartments in midtown, brick shops further out.

export const B = 100;
export const R = 16; // road width: parking, two lanes, two lanes, parking
export const WALK = 5;
export const IN0 = R + WALK; // where the lots start
export const IN1 = B - WALK; // where they end
export const ALLEY0 = 55;
export const ALLEY1 = 61;
export const GF = 5; // the storefront storey
export const FH = 3.6; // every floor above it
export const SHOP_D = 11; // how deep a shop you can walk into goes
export const CEIL = 4.2;
export const SIDE = 0.15; // kerb height

export function hash(i, j, k = 0, seed = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 1442695041 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const mod = (a, n) => ((a % n) + n) % n;
export const isRoad = (x, z) => mod(x, B) < R || mod(z, B) < R;
export function isSidewalk(x, z) {
  if (isRoad(x, z)) return false;
  const lx = mod(x, B), lz = mod(z, B);
  return lx < IN0 || lz < IN0 || lx > IN1 || lz > IN1;
}
export function inAlley(x, z) {
  const lx = mod(x, B), lz = mod(z, B);
  return lx > IN0 && lx < IN1 && lz > ALLEY0 && lz < ALLEY1;
}

function vnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, zi, 77, seed), b = hash(xi + 1, zi, 77, seed), c = hash(xi, zi + 1, 77, seed), d = hash(xi + 1, zi + 1, 77, seed);
  return a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz);
}

// 0 (low brick shops) .. 1 (downtown towers).
export function density(i, j, seed, spawn) {
  let d = vnoise(i / 3.4, j / 3.4, seed) * 0.8 + vnoise(i / 1.3, j / 1.3, seed + 5) * 0.3 - 0.05;
  d += 0.18 * Math.max(0, 1 - Math.hypot(i - spawn[0], j - spawn[1]) / 3);
  return Math.max(0, Math.min(1, d));
}

// ---- Names ----------------------------------------------------------------------------

export const AVENUES = ['HOPE', 'GRAND', 'OLIVE', 'MAIN', 'SPRING', 'BROADWAY', 'HILL', 'UNION', 'PARK', 'MARKET', 'CENTRAL', 'WATER', 'CHURCH', 'MILL', 'BRIDGE', 'KING', 'QUEEN', 'HARBOR', 'LIBERTY', 'FRONT', 'MAPLE', 'CEDAR', 'LAUREL', 'MADISON', 'MONROE', 'WARREN', 'LINCOLN', 'FRANKLIN', 'JEFFERSON', 'ADAMS', 'TEMPLE', 'COURT'];
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
export const avenueName = (i) => `${AVENUES[mod(i, 32)]} ${['AVE', 'ST', 'BLVD', 'ST'][mod(i, 4)]}`;
export const streetName = (j) => `${ordinal(mod(j, 32) + 1)} ST`;

export const NORMAL_SHOPS = [
  ['QUICK MART', 'store'], ['LAUNDROMAT', 'laundry'], ['DRY CLEANERS', 'racks'], ['PHARMACY', 'store'], ['DELI', 'counter'],
  ['COFFEE', 'cafe'], ['DINER', 'cafe'], ['BARBER', 'chairs'], ['HARDWARE', 'store'], ['BOOKS', 'store'], ['SHOE REPAIR', 'counter'],
  ['BANK', 'counter'], ['INSURANCE', 'office'], ['TRAVEL AGENCY', 'office'], ['OPTICIAN', 'counter'], ['CELL PHONES', 'counter'],
  ['ELECTRONICS', 'store'], ['PAWN SHOP', 'store'], ['TAILOR', 'racks'], ['REAL ESTATE', 'office'], ['TOYS', 'store'], ['RECORDS', 'store'],
  ['PET SUPPLIES', 'store'], ['NOODLE BAR', 'cafe'], ['GYM', 'gym'], ['POST OFFICE', 'counter'], ['VIDEO RENTAL', 'store'],
  ['U.B.D.S. DEPOT', 'office'], ['DENTIST', 'office'], ['CAMP AMBER', 'school'], ['LIQUOR', 'store'], ['NAIL SALON', 'chairs'],
];
export const DEPOT = { name: 'MALT MARTERS', kind: 'depot' };
// Shops that are really doors to somewhere else. `w` weights how often.
export const EXIT_SHOPS = [
  { name: 'FUN ZONE', kind: 'arcade', exit: 'level20', w: 1 },
  { name: 'CASPIAN\'S ANTIQUES', kind: 'antiques', exit: 'level232', w: 1 },
  { name: 'PAPA PEDRO\'S PIZZA PALACE OF PLEASANTRIES', kind: 'cafe', exit: 'level458', w: 1.2 },
  { name: 'FRIVOLOUS FRANK\'S FABULOUS FROZEN FOOD', kind: 'freezers', exit: 'level55', w: 1 },
  { name: 'MR. HOLLOWAY\'S GRAND EXHIBIT', kind: 'exhibit', exit: 'level126', w: 0.8 },
  { name: 'CINEMA', kind: 'cinema', exit: 'level68', w: 1 },
  { name: 'ARCADE', kind: 'arcade', exit: 'level808', w: 1 },
  { name: 'SECOND CHANCE THRIFT', kind: 'racks', exit: 'level179', w: 1 },
  { name: 'BAKERY', kind: 'counter', exit: 'level304', w: 1 },
  { name: 'THE OLD ANCHOR PUB', kind: 'pub', exit: 'level370', w: 1 },
  { name: 'MATTRESS KINGDOM', kind: 'beds', exit: 'level900', w: 0.8 },
  { name: 'FLOWERS', kind: 'flowers', exit: 'level214', w: 1 },
  { name: 'PURE WATER SUPPLY', kind: 'store', exit: 'level119', w: 0.8 },
  { name: 'TRATTORIA', kind: 'cafe', exit: 'level213', w: 1 },
  { name: 'GENERAL HOSPITAL', kind: 'hospital', exit: 'level511', w: 0.5 },
  { name: 'PLAZA MALL', kind: 'mall', exit: 'level33', w: 0.5 },
];
const EXIT_W = EXIT_SHOPS.reduce((a, s) => a + s.w, 0);
export const SIGN_NAMES = [...NORMAL_SHOPS.map((s) => s[0]), DEPOT.name, ...EXIT_SHOPS.map((s) => s.name), 'M.E.G. BASE BETA', 'NICK\'S GASLIGHT', 'HOTEL'];
export const signSlot = (name) => SIGN_NAMES.indexOf(name);

export const STYLE_NAMES = ['stone', 'glass', 'granite', 'concrete', 'brick', 'tan', 'white'];
export const STYLES = {
  stone: { bay: 3, base: 'baseLight', refl: 0.4 },
  glass: { bay: 3, base: 'baseDark', refl: 0.72 },
  granite: { bay: 3, base: 'baseDark', refl: 0.5 },
  concrete: { bay: 3, base: 'baseLight', refl: 0.5 },
  brick: { bay: 3, base: 'brickBase', refl: 0.28 },
  tan: { bay: 3, base: 'baseLight', refl: 0.3 },
  white: { bay: 3, base: 'baseLight', refl: 0.42 },
  boarded: { bay: 3, base: 'brickBase', refl: 0 },
  overgrown: { bay: 3, base: 'brickBase', refl: 0.1 },
};
export const TEX_W = 12; // a facade texture covers four bays...
export const TEX_H = 6 * FH; // ...and six floors

// ---- The plan of a block (cheap: no geometry) ------------------------------------------

export function blockPlan(i, j, seed, spawn, special = null) {
  const h = (k) => hash(i, j, k, seed);
  const d = density(i, j, seed, spawn);
  const isSpawn = i === spawn[0] && j === spawn[1];
  const plan = { i, j, d, special, lots: [], isSpawn };
  const x0 = i * B, z0 = j * B;
  // The alley between the rows.
  const ar = h(3);
  plan.alley = isSpawn || special ? 'plain' : ar < 0.66 ? 'plain' : ar < 0.8 ? 'closed' : ar < 0.9 ? 'neon' : 'grimy';
  if (special === 'times') {
    plan.alley = 'none';
    return plan;
  }
  for (let row = 0; row < 2; row++) {
    const rz0 = z0 + (row === 0 ? IN0 : ALLEY1), rz1 = z0 + (row === 0 ? ALLEY0 : IN1);
    if (special === 'meg' && row === 0) {
      plan.lots.push(megLot(x0, rz0, rz1));
      continue;
    }
    let x = x0 + IN0, k = 0;
    while (x < x0 + IN1 - 0.5) {
      const hh = (n) => hash(i * 13 + k, j * 13 + row, n, seed);
      let w = d > 0.62 ? 20 + hh(1) * 16 : d > 0.35 ? 14 + hh(1) * 12 : 9 + hh(1) * 9;
      if (x0 + IN1 - x - w < 9) w = x0 + IN1 - x;
      plan.lots.push(makeLot(hh, x, x + w, rz0, rz1, row, d, isSpawn && row === 1 && k === 0));
      x += w;
      k++;
    }
  }
  // A sewer grate left open in the gutter, now and then.
  if (!isSpawn && h(5) < 0.22) plan.grate = { x: x0 + R + 10 + h(6) * (B - R - 22), z: z0 + R - 0.55, target: h(7) < 0.5 ? 'level34' : 'level218' };
  // A bus stop.
  if (!isSpawn && h(8) < 0.35) plan.busStop = { x: x0 + R + 22 + h(9) * 40, z: z0 + R + 1.6 };
  return plan;
}

function megLot(x0, z0, z1) {
  return {
    type: 'building', x0: x0 + IN0, x1: x0 + IN1, z0, z1, row: 0, front: 'n',
    style: 'concrete', floors: 6, H: GF + 6 * FH, depth: z1 - z0, podium: null, crown: false, antenna: true, u0: 0,
    shop: { name: 'M.E.G. BASE BETA', kind: 'meg', open: true, exit: 'level115', x0: x0 + IN0 + 29, x1: x0 + IN0 + 45, depth: 13 },
    meg: true, water: false, banner: -1,
  };
}

function makeLot(hh, x0, x1, z0, z1, row, d, forceShop) {
  const w = x1 - x0;
  const r = hh(2);
  let type = 'building';
  if (!forceShop) {
    if (r < 0.05 && d < 0.75) type = 'plaza';
    else if (r < 0.08 && d < 0.5) type = 'parking';
    else if (r < 0.105 && w > 14) type = 'construction';
    else if (r < 0.125 && d < 0.55) type = 'abandoned';
  }
  const lot = { type, x0, x1, z0, z1, row, front: row === 0 ? 'n' : 's' };
  if (type !== 'building' && type !== 'abandoned') return lot;
  // How tall.
  const tall = hh(3);
  let floors, style;
  const tower = d > 0.62 || (d > 0.42 && hh(9) < 0.18);
  if (type === 'abandoned') {
    floors = 1 + Math.floor(tall * 2);
    style = hh(4) < 0.4 ? 'overgrown' : 'boarded';
  } else if (tower) {
    floors = Math.round(10 + tall * tall * 26 + d * 4);
    style = ['glass', 'granite', 'stone', 'concrete', 'white', 'glass'][Math.floor(hh(4) * 6)];
  } else if (d > 0.3) {
    floors = 4 + Math.floor(tall * 9);
    style = ['stone', 'concrete', 'tan', 'brick', 'white', 'stone'][Math.floor(hh(4) * 6)];
  } else {
    floors = 1 + Math.floor(tall * 3.4);
    style = ['brick', 'brick', 'tan', 'white', 'stone'][Math.floor(hh(4) * 5)];
  }
  const rowD = z1 - z0;
  const depth = floors <= 3 ? Math.min(rowD, 15 + hh(5) * 20) : rowD;
  lot.style = style;
  lot.floors = floors;
  lot.H = GF + floors * FH;
  lot.depth = depth;
  if (row === 0) lot.z1 = z0 + depth;
  else lot.z0 = z1 - depth;
  lot.u0 = Math.floor(hh(6) * 4) * 0.25;
  // Towers stand on a podium and step back.
  lot.podium = tower && w > 17 ? { floors: 2 + Math.floor(hh(7) * 3), inset: 2 + hh(8) * 3.5, front: hh(10) < 0.5 } : null;
  lot.crown = tower && hh(11) < 0.35;
  lot.antenna = tower && hh(12) < 0.3;
  lot.water = !tower && floors >= 4 && (style === 'brick' || style === 'stone' || style === 'tan') && hh(13) < 0.45;
  lot.banner = tower && hh(14) < 0.22 ? Math.floor(hh(15) * 4) : -1;
  lot.billboard = !tower && floors <= 3 && type === 'building' && hh(16) < 0.3 ? Math.floor(hh(17) * 8) : -1;
  lot.poster = type === 'building' && hh(18) < 0.04;
  lot.windowEnt = type === 'building' && !tower && hh(31) < 0.05;
  lot.hedge = tower && hh(19) < 0.4;
  // The storefront.
  if (type === 'abandoned') {
    const sw = Math.min(w - 2, 6);
    const sx0 = x0 + (w - sw) / 2;
    lot.shop = { name: null, kind: style, abandoned: true, exit: style === 'overgrown' ? 'level990' : 'level713', x0: sx0, x1: sx0 + sw };
    return lot;
  }
  if (w >= 9) {
    const sw = Math.min(w - 2, 8 + hh(20) * 5);
    const sx0 = x0 + 1 + hh(21) * (w - 2 - sw);
    const sr = hh(22);
    let shop;
    if (tower && hh(23) < 0.45 && !forceShop) shop = { kind: 'lobby' };
    else if (forceShop || sr < 0.6 || depth < SHOP_D + 1.5) {
      const s = NORMAL_SHOPS[Math.floor(hh(24) * NORMAL_SHOPS.length)];
      shop = { name: s[0], kind: s[1], open: forceShop || (sr > 0.42 && depth >= SHOP_D + 1.5) };
    } else if (sr < 0.82) {
      const s = NORMAL_SHOPS[Math.floor(hh(24) * NORMAL_SHOPS.length)];
      shop = { name: s[0], kind: s[1], open: true };
    } else if (sr < 0.86) shop = { ...DEPOT, open: true };
    else {
      let t = hh(25) * EXIT_W, s = EXIT_SHOPS[0];
      for (const e of EXIT_SHOPS) {
        t -= e.w;
        if (t <= 0) {
          s = e;
          break;
        }
      }
      shop = { name: s.name, kind: s.kind, exit: s.exit, open: true };
    }
    shop.x0 = shop.kind === 'lobby' ? x0 + 1 : sx0;
    shop.x1 = shop.kind === 'lobby' ? x1 - 1 : sx0 + sw;
    if (shop.name && shop.name.length > 22) {
      // Long names need the room.
      shop.x0 = x0 + 0.8;
      shop.x1 = x1 - 0.8;
    }
    shop.awning = !tower && hh(26) < 0.45 ? Math.floor(hh(27) * 4) : -1;
    shop.depth = SHOP_D;
    shop.item = shop.open && (shop.kind === 'depot' || hh(28) < 0.5) ? ['water', 'water', 'water', 'battery', 'medkit', 'flare', 'pipe', 'milk'][Math.floor(hh(29) * 8)] : null;
    shop.item2 = shop.kind === 'depot' ? ['water', 'medkit', 'battery', 'milk'][Math.floor(hh(30) * 4)] : null;
    lot.shop = shop;
  }
  return lot;
}

// Rectangles where nothing can walk, for the entity grid.
export function blockSolids(plan) {
  const out = [];
  for (const L of plan.lots) {
    if (L.type === 'building' || L.type === 'abandoned') out.push({ x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z1 });
    if (L.type === 'construction') out.push({ x0: L.x0 + 0.5, z0: L.z0 + 0.5, x1: L.x1 - 0.5, z1: L.z1 - 0.5 });
  }
  return out;
}

// ---- Textures and materials -------------------------------------------------------------

const rnd = Math.random;

function noise(ctx, w, h, n, a, rgb, s = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${rgb},${(rnd() * a).toFixed(3)})`;
    ctx.fillRect(rnd() * w, rnd() * h, rnd() * s + 0.5, rnd() * s + 0.5);
  }
}

// One facade: a colour map, a mask of the glass (how much it reflects), and
// a mask of which windows are lit at night.
function facade(own, style) {
  const W = 256, H = 384, bw = 64, fh = 64;
  const cells = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    const office = style === 'glass' || style === 'granite' || style === 'concrete';
    cells.push({ r, c, lit: rnd() < (office ? 0.42 : 0.3), blind: rnd() < 0.3, warm: office ? rnd() < 0.25 : rnd() < 0.85, k: 0.6 + rnd() * 0.4, glass: rnd() });
  }
  // Window rectangle in a cell, per style.
  const win = {
    stone: [16, 12, 32, 38], tan: [17, 13, 30, 36], white: [12, 12, 40, 36], brick: [19, 10, 26, 40],
    granite: [9, 4, 46, 56], glass: [2, 2, 60, 48], concrete: [0, 18, 64, 28], boarded: [19, 10, 26, 40], overgrown: [19, 10, 26, 40],
  }[style];
  const drawWalls = (ctx) => {
    if (style === 'brick' || style === 'boarded' || style === 'overgrown') {
      ctx.fillStyle = '#7e4636';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? -6 : 0; x < W; x += 12) {
        const v = rnd() * 26;
        ctx.fillStyle = `rgb(${136 + v},${72 + v * 0.5},${54 + v * 0.4})`;
        ctx.fillRect(x + 0.5, y + 0.5, 11, 5);
      }
      noise(ctx, W, H, 2000, 0.15, '30,20,15');
    } else {
      const base = { stone: '#cdb894', tan: '#d2a25e', white: '#deddd6', granite: '#403e3b', glass: '#46525e', concrete: '#b3b0a8' }[style];
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      noise(ctx, W, H, 5000, 0.12, style === 'granite' ? '200,200,200' : '60,50,40', 1.5);
      if (style === 'white') {
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
        for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1);
      }
      if (style === 'stone' || style === 'tan') {
        // Stone courses and streaks of grime.
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        for (let y = 0; y < H; y += 16) ctx.fillRect(0, y, W, 1);
        for (let i = 0; i < 18; i++) {
          const g = ctx.createLinearGradient(0, 0, 0, 60);
          ctx.fillStyle = 'rgba(40,35,30,0.08)';
          ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 5, 30 + rnd() * 60);
        }
      }
    }
    if (style === 'granite') {
      // Pale vertical fins between the bays.
      for (let c = 0; c <= 4; c++) {
        ctx.fillStyle = '#8c8a84';
        ctx.fillRect(c * bw - 4, 0, 8, H);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(c * bw + 4, 0, 2, H);
      }
    }
  };
  const map = paintTex(own, W, H, (ctx) => {
    drawWalls(ctx);
    for (const cl of cells) {
      const [wx, wy, ww, wh] = win;
      const x = cl.c * bw + wx, y = cl.r * fh + wy;
      if (style === 'glass') {
        const v = cl.glass * 18;
        ctx.fillStyle = `rgb(${36 + v},${54 + v},${74 + v})`;
        ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = 'rgb(30,38,46)';
        ctx.fillRect(cl.c * bw, cl.r * fh + 50, bw, 14); // spandrel
        ctx.fillStyle = 'rgba(160,180,200,0.15)';
        ctx.fillRect(x + ww / 2 - 1, y, 2, wh);
        continue;
      }
      // Recess, then glass.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x - 2, y - 2, ww + 4, wh + 4);
      const v = cl.glass * 14;
      ctx.fillStyle = `rgb(${24 + v},${30 + v},${38 + v})`;
      ctx.fillRect(x, y, ww, wh);
      if (style === 'brick' || style === 'boarded' || style === 'overgrown') {
        ctx.strokeStyle = '#e8e2d4';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, ww, wh);
        ctx.fillStyle = '#c8bca0';
        ctx.fillRect(x - 4, y - 6, ww + 8, 5); // lintel
        ctx.fillRect(x - 3, y + wh + 1, ww + 6, 4); // sill
        ctx.fillStyle = '#e8e2d4';
        ctx.fillRect(x, y + wh / 2 - 1, ww, 2);
      } else if (style === 'concrete') {
        ctx.fillStyle = 'rgba(200,200,200,0.35)';
        for (let mx = 0; mx < bw; mx += 21) ctx.fillRect(cl.c * bw + mx, y, 2, wh);
      } else {
        ctx.fillStyle = 'rgba(190,190,180,0.5)';
        ctx.fillRect(x + ww / 2 - 1, y, 2, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x - 2, y + wh + 1, ww + 4, 3);
      }
      if (cl.blind && style !== 'boarded') {
        ctx.fillStyle = 'rgba(214,206,186,0.85)';
        ctx.fillRect(x + 1, y + 1, ww - 2, wh * (0.3 + cl.glass * 0.5));
      }
      if (style === 'boarded') {
        ctx.fillStyle = '#6a5a44';
        for (let p = 0; p < 4; p++) ctx.fillRect(x - 3, y + 3 + p * 10, ww + 6, 7);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let p = 0; p < 4; p++) ctx.fillRect(x - 3, y + 9 + p * 10, ww + 6, 1);
      }
    }
    if (style === 'overgrown') {
      // Ivy, thick at the bottom.
      for (let i = 0; i < 2600; i++) {
        const y = H * Math.pow(rnd(), 0.6), x = rnd() * W;
        ctx.fillStyle = `rgba(${30 + rnd() * 40},${70 + rnd() * 60},${20 + rnd() * 30},0.85)`;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + rnd() * 3, 1.5 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  const spec = paintTex(own, W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (style === 'boarded') return;
    for (const cl of cells) {
      const [wx, wy, ww, wh] = win;
      const x = cl.c * bw + wx, y = cl.r * fh + wy;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, ww, wh);
      if (style === 'glass') {
        ctx.fillStyle = '#999';
        ctx.fillRect(cl.c * bw, cl.r * fh + 50, bw, 14);
      }
      if (cl.blind) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x + 1, y + 1, ww - 2, wh * (0.3 + cl.glass * 0.5));
      }
    }
  });
  const emis = paintTex(own, W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (style === 'boarded' || style === 'overgrown') return;
    for (const cl of cells) {
      if (!cl.lit) continue;
      const [wx, wy, ww, wh] = win;
      const x = cl.c * bw + wx, y = cl.r * fh + wy;
      const k = cl.k;
      ctx.fillStyle = cl.warm ? `rgb(${255 * k},${200 * k},${120 * k})` : `rgb(${215 * k},${230 * k},${255 * k})`;
      ctx.fillRect(x, y, ww, wh);
      if (cl.blind) {
        ctx.fillStyle = cl.warm ? `rgb(${255 * k},${225 * k},${170 * k})` : `rgb(${240 * k},${240 * k},${230 * k})`;
        ctx.fillRect(x + 1, y + 1, ww - 2, wh * (0.3 + cl.glass * 0.5));
      }
    }
  });
  return { map, spec, emis };
}

// What the dark glass reflects: a pale sky over a band of other buildings.
function envTexture(own) {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H / 2);
  g.addColorStop(0, '#6f8aa6');
  g.addColorStop(0.7, '#b8c2c8');
  g.addColorStop(1, '#ddd2b8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H / 2);
  ctx.fillStyle = '#3c4048';
  ctx.fillRect(0, H / 2, W, H / 2);
  for (let x = 0; x < W;) {
    const w = 8 + rnd() * 26, h = 10 + rnd() * 70;
    ctx.fillStyle = `rgb(${50 + rnd() * 50},${54 + rnd() * 50},${60 + rnd() * 50})`;
    ctx.fillRect(x, H / 2 - h, w, h + 2);
    ctx.fillStyle = 'rgba(200,210,220,0.18)';
    for (let y = H / 2 - h + 3; y < H / 2; y += 5) ctx.fillRect(x + 2, y, w - 4, 2);
    x += w + rnd() * 3;
  }
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  own.textures.push(t);
  return t;
}

const SIGN_COLORS = [
  ['#1c2a44', '#f4e8c8'], ['#8a1c1c', '#fff2d8'], ['#14422a', '#f2f2e0'], ['#f2ead8', '#1c1c1c'], ['#2a2a2a', '#ffcc33'],
  ['#e8b020', '#2a1a10'], ['#2c4a7a', '#ffffff'], ['#5a1a4a', '#ffd6f0'], ['#e8e4dc', '#a01818'], ['#103a40', '#9ff0e8'],
];

function fitText(ctx, text, maxW, size, font = 'bold') {
  let s = size;
  ctx.font = `${font} ${s}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 1;
    ctx.font = `${font} ${s}px Arial, Helvetica, sans-serif`;
  }
  return s;
}

// Every shop sign in one texture: 4 columns x 16 rows of 512 x 64.
function signAtlas(own) {
  return paintTex(own, 2048, 1024, (ctx) => {
    SIGN_NAMES.forEach((name, k) => {
      const x = (k % 4) * 512, y = Math.floor(k / 4) * 64;
      let [bg, fg] = SIGN_COLORS[k % SIGN_COLORS.length];
      if (name === 'MALT MARTERS') [bg, fg] = ['#1e5a28', '#f8f0c0'];
      if (name === 'M.E.G. BASE BETA') [bg, fg] = ['#0e1a2e', '#e8eef8'];
      if (name === 'FUN ZONE' || name === 'ARCADE') [bg, fg] = ['#1a0a2a', '#ff5ae0'];
      if (name === 'GENERAL HOSPITAL') [bg, fg] = ['#f4f4f4', '#c41818'];
      if (name === 'CINEMA') [bg, fg] = ['#5a0a0a', '#ffd84a'];
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, 512, 64);
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, 504, 56);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitText(ctx, name, 480, 40);
      ctx.fillText(name, x + 256, y + 34);
    });
  }, false);
}

// Street name signs: white on blue, like the one on the corner of Hope.
function streetAtlas(own) {
  return paintTex(own, 1024, 512, (ctx) => {
    for (let k = 0; k < 64; k++) {
      const x = (k % 4) * 256, y = Math.floor(k / 4) * 32;
      const name = k < 32 ? avenueName(k) : streetName(k - 32);
      ctx.fillStyle = '#1d5aa6';
      ctx.fillRect(x, y, 256, 32);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, 250, 26);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitText(ctx, name, 230, 20);
      ctx.fillText(name, x + 128, y + 17);
    }
  }, false);
}

const ADS = [
  { bg: ['#9fd4ec', '#e8f6fc'], fg: '#0e3a5a', t: 'ALMOND WATER', s: 'Stay hydrated, wanderer.' },
  { bg: ['#0c1a30', '#22385a'], fg: '#f2f6ff', t: 'M.E.G.', s: 'Lost? Come and find us. Base Beta.' },
  { bg: ['#5a3a1a', '#8a5a2a'], fg: '#ffd040', t: 'U.B.D.S.', s: 'We deliver. Everywhere. Eventually.' },
  { bg: ['#8a0e14', '#c8202a'], fg: '#ffe9a0', t: 'NEW TIMES SQUARE', s: 'Everything is for sale. - B.N.T.G.' },
  { bg: ['#1e5a28', '#3a8a40'], fg: '#fff6c8', t: 'MALT MARTERS', s: 'Nobody goes hungry. Nobody.' },
  { bg: ['#c8141e', '#f03a3a'], fg: '#ffffff', t: 'ASTRO COLA', s: 'Out of this world.' },
  { bg: ['#e06a14', '#f29a3a'], fg: '#ffffff', t: 'PEGASUS RESIDENCES', s: 'Apartments available. Forever.' },
  { bg: ['#e8a01a', '#f8c84a'], fg: '#3a1e08', t: 'CAMP AMBER', s: 'Learn the levels. Live longer.' },
];
export const AD_COUNT = ADS.length;

function adAtlas(own) {
  return paintTex(own, 1024, 1024, (ctx) => {
    ADS.forEach((a, k) => {
      const x = (k % 2) * 512, y = Math.floor(k / 2) * 256;
      const g = ctx.createLinearGradient(x, y, x + 512, y + 256);
      g.addColorStop(0, a.bg[0]);
      g.addColorStop(1, a.bg[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 512, 256);
      // A big shape for some life.
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = a.fg;
      ctx.beginPath();
      ctx.arc(x + 420, y + 128, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (k === 0) {
        // A bottle.
        ctx.fillStyle = '#f6fbff';
        ctx.fillRect(x + 410, y + 70, 44, 140);
        ctx.fillRect(x + 422, y + 44, 20, 30);
        ctx.fillStyle = '#5ab0e0';
        ctx.fillRect(x + 410, y + 120, 44, 50);
      }
      ctx.fillStyle = a.fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, a.t, 360, 64);
      ctx.fillText(a.t, x + 28, y + 100);
      fitText(ctx, a.s, 380, 26, '');
      ctx.fillText(a.s, x + 30, y + 170);
    });
  }, false);
}

const BANNERS = [
  { bg: '#e2701c', fg: '#ffffff', t: 'PEGASUS', s: 'Apartment Residences' },
  { bg: '#0e1a30', fg: '#e8eef8', t: 'M.E.G.', s: 'We are still looking' },
  { bg: '#b8121c', fg: '#ffffff', t: 'ASTRO', s: 'Cola' },
  { bg: '#4a0e18', fg: '#ffd890', t: 'HOTEL', s: 'Vacancies' },
];

function bannerAtlas(own) {
  return paintTex(own, 512, 1024, (ctx) => {
    BANNERS.forEach((b, k) => {
      const x = k * 128;
      ctx.fillStyle = b.bg;
      ctx.fillRect(x, 0, 128, 1024);
      ctx.fillStyle = b.fg;
      ctx.save();
      ctx.translate(x + 74, 980);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, b.t, 640, 84);
      ctx.fillText(b.t, 0, 0);
      fitText(ctx, b.s, 600, 22, '');
      ctx.fillText(b.s, 0, -46);
      ctx.restore();
    });
  }, false);
}

export function buildMaterials(own) {
  const T = {};
  const M = {};
  const L = (o) => {
    const m = new THREE.MeshLambertMaterial(o);
    own.mats.push(m);
    return m;
  };
  T.env = envTexture(own);
  for (const s of [...STYLE_NAMES, 'boarded', 'overgrown']) {
    const f = facade(own, s);
    M[s] = L({ map: f.map, specularMap: f.spec, envMap: T.env, reflectivity: STYLES[s].refl, combine: THREE.MixOperation, emissive: 0xffffff, emissiveMap: f.emis, emissiveIntensity: 0 });
    M[s].userData.refl = STYLES[s].refl;
  }
  T.asphalt = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5e5e5c';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 16000, 0.3, '150,150,146', 1.4);
    noise(ctx, w, h, 8000, 0.35, '20,20,22', 1.6);
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = 'rgba(20,20,20,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let x = rnd() * w, y = rnd() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) ctx.lineTo((x += (rnd() - 0.5) * 34), (y += (rnd() - 0.5) * 34));
      ctx.stroke();
    }
  });
  T.concrete = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a8a59e';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 9000, 0.18, '50,50,50', 1.5);
    noise(ctx, w, h, 5000, 0.16, '230,228,220', 1.5);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = 'rgba(40,40,40,0.06)';
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 20, 4 + rnd() * 14, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  T.baseDark = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2c2b2a';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 3000, 0.25, '120,118,112', 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 1, h);
  });
  T.baseLight = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#bdb4a2';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 3000, 0.15, '60,50,40', 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 1);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) ctx.fillRect(x, y, 1, 32);
  });
  T.brickBase = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6e3c2e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < w; x += 16) {
      const v = rnd() * 24;
      ctx.fillStyle = `rgb(${124 + v},${64 + v * 0.5},${48 + v * 0.4})`;
      ctx.fillRect(x + 0.5, y + 0.5, 15, 7);
    }
  });
  T.roof = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5a5854';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 6000, 0.3, '20,20,20', 1.5);
    noise(ctx, w, h, 3000, 0.25, '160,155,145', 1.2);
  });
  // A shop window you can't see into: big dark panes, a door in the middle.
  T.shopDark = paintTex(own, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1c1e20';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#14191e';
    ctx.fillRect(6, 6, 116, 116);
    ctx.fillRect(134, 6, 116, 116);
    ctx.fillStyle = 'rgba(200,210,220,0.08)';
    ctx.fillRect(12, 10, 30, 108);
    ctx.fillRect(140, 10, 30, 108);
    ctx.fillStyle = '#2e3236';
    ctx.fillRect(0, 98, w, 4);
  }, true);
  T.shopSpec = paintTex(own, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(6, 6, 116, 116);
    ctx.fillRect(134, 6, 116, 116);
  }, true);
  T.lobbyEmis = paintTex(own, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe2b0';
    ctx.fillRect(6, 6, 116, 116);
    ctx.fillRect(134, 6, 116, 116);
  }, true);
  T.signs = signAtlas(own);
  T.streets = streetAtlas(own);
  T.ads = adAtlas(own);
  T.banners = bannerAtlas(own);
  T.tile = paintTex(own, 128, 128, (ctx, w, h) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#d8d4ca' : '#c4beb2';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
    noise(ctx, w, h, 1500, 0.1, '40,40,40');
  });
  T.wallInt = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e4ddcc';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 1500, 0.06, '60,50,40');
    ctx.fillStyle = '#7a6a58';
    ctx.fillRect(0, h - 10, w, 10);
  });
  T.ceiling = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8e6e0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x <= w; x += 32) ctx.fillRect(x, 0, 1, h);
    for (let y = 0; y <= h; y += 32) ctx.fillRect(0, y, w, 1);
    noise(ctx, w, h, 800, 0.08, '80,80,80');
  });
  T.goods = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9a9a96';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#c83a2a', '#e8c040', '#3a7ac8', '#f2f2ea', '#3a9a4a', '#e87a2a', '#8a3ac8', '#222'];
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = '#5a5a58';
      ctx.fillRect(0, y + 29, w, 3);
      for (let x = 1; x < w;) {
        const bw = 5 + rnd() * 12;
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        const bh = 12 + rnd() * 15;
        ctx.fillRect(x, y + 29 - bh, bw - 1, bh);
        x += bw;
      }
    }
  });
  T.wood = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6a4a30';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '30,20,10' : '150,110,70'},0.2)`;
      ctx.fillRect(0, rnd() * h, w, 1 + rnd() * 2);
    }
  });
  T.fence = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(170,175,175,1)';
    ctx.lineWidth = 2;
    for (let k = -64; k < 128; k += 10) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + 64, 64);
      ctx.moveTo(k + 64, 0);
      ctx.lineTo(k, 64);
      ctx.stroke();
    }
  });
  T.foliage = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4a6e34';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${40 + rnd() * 70},${90 + rnd() * 80},${30 + rnd() * 40},0.8)`;
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 1.5 + rnd() * 2.5, 1 + rnd() * 1.5, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  Object.assign(M, {
    baseDark: L({ map: T.baseDark, envMap: T.env, reflectivity: 0.15, combine: THREE.MixOperation }),
    baseLight: L({ map: T.baseLight }),
    brickBase: L({ map: T.brickBase }),
    roof: L({ map: T.roof }),
    parapet: L({ color: 0x8a867e }),
    shopDark: L({ map: T.shopDark, specularMap: T.shopSpec, envMap: T.env, reflectivity: 0.55, combine: THREE.MixOperation }),
    lobby: L({ map: T.shopDark, specularMap: T.shopSpec, envMap: T.env, reflectivity: 0.5, combine: THREE.MixOperation, emissive: 0xffffff, emissiveMap: T.lobbyEmis, emissiveIntensity: 0.1 }),
    shopGlass: L({ color: 0x9ab0c0, transparent: true, opacity: 0.22, envMap: T.env, reflectivity: 0.35, combine: THREE.MixOperation, depthWrite: false }),
    frame: L({ color: 0x2a2c2e }),
    frameLight: L({ color: 0xb8b8b4 }),
    sign: L({ map: T.signs, emissive: 0xffffff, emissiveMap: T.signs, emissiveIntensity: 0.15 }),
    street: L({ map: T.streets, side: THREE.DoubleSide }),
    ads: L({ map: T.ads, emissive: 0xffffff, emissiveMap: T.ads, emissiveIntensity: 0.1 }),
    screens: L({ map: T.ads, emissive: 0xffffff, emissiveMap: T.ads, emissiveIntensity: 0.6 }),
    banners: L({ map: T.banners, emissive: 0xffffff, emissiveMap: T.banners, emissiveIntensity: 0.05 }),
    awn0: L({ color: 0x8a1c1c, side: THREE.DoubleSide }),
    awn1: L({ color: 0x1e4a2a, side: THREE.DoubleSide }),
    awn2: L({ color: 0x1c2e5a, side: THREE.DoubleSide }),
    awn3: L({ color: 0xc8a030, side: THREE.DoubleSide }),
    metal: L({ color: 0x3a3c3e }),
    pole: L({ color: 0x6a6c6a }),
    kerb: L({ map: T.concrete, color: 0xd8d4cc }),
    curbRed: L({ color: 0xa83228 }),
    decal: L({ color: 0x1c1c1c }),
    hole: L({ color: 0x020202 }),
    yellow: L({ color: 0xe0b020 }),
    paint: L({ color: 0xe8e8e2 }),
    tile: L({ map: T.tile }),
    wallInt: L({ map: T.wallInt }),
    ceiling: L({ map: T.ceiling }),
    panel: L({ color: 0xffffff, emissive: 0xfff6e4, emissiveIntensity: 1 }),
    goods: L({ map: T.goods }),
    wood: L({ map: T.wood }),
    shelf: L({ color: 0xb8b8b2 }),
    screen: L({ color: 0x101820, emissive: 0x4ab8ff, emissiveIntensity: 0.9 }),
    screenPink: L({ color: 0x201020, emissive: 0xff4ad8, emissiveIntensity: 0.9 }),
    fabric: L({ color: 0x8a2a3a }),
    linen: L({ color: 0xece8de }),
    chrome: L({ color: 0xc8ccd0, envMap: T.env, reflectivity: 0.6, combine: THREE.MixOperation }),
    exitDoor: L({ color: 0x000000, emissive: 0xffd7a0, emissiveIntensity: 0.8 }),
    fence: L({ map: T.fence, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    scaffold: L({ color: 0xd8a020 }),
    rebar: L({ color: 0x6a4a3a }),
    concreteRaw: L({ color: 0x9a9890 }),
    dirt: L({ color: 0x6a5a48 }),
    plank: L({ color: 0x8a6a48 }),
    dumpster: L({ color: 0x2a5a3a }),
    trash: L({ color: 0x1a1a1c }),
    hedge: L({ map: T.foliage }),
    bark: L({ color: 0x8a8070 }),
    foliage: L({ color: 0xffffff, map: T.foliage }),
    lampHead: L({ color: 0x9a9a98, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    neonPink: L({ color: 0x401030, emissive: 0xff3ac8, emissiveIntensity: 1.4 }),
    neonCyan: L({ color: 0x103040, emissive: 0x3ae8ff, emissiveIntensity: 1.4 }),
    neonYellow: L({ color: 0x403810, emissive: 0xffd83a, emissiveIntensity: 1.4 }),
    lantern: L({ color: 0x601010, emissive: 0xff3a1a, emissiveIntensity: 1.2 }),
    megGreen: L({ color: 0x3a4a3a }),
    sandbag: L({ color: 0x9a8a64 }),
    flagMeg: L({ color: 0x14243a, side: THREE.DoubleSide }),
    poster: L({ color: 0xffffff, map: posterTex(own) }),
    windowEnt: L({ color: 0xffffff, map: windowEntTex(own), emissive: 0xffffff, emissiveMap: windowEntTex(own), emissiveIntensity: 0.15 }),
    car: L({ vertexColors: true, envMap: T.env, reflectivity: 0.25, combine: THREE.MixOperation }),
  });
  // Traffic lights: three lenses for each direction.
  for (const g of ['ew', 'ns']) for (const [c, col] of [['r', 0xff2a1a], ['y', 0xffb21a], ['g', 0x3aff8a]]) {
    M[`sig_${g}_${c}`] = L({ color: 0x1a1a1a, emissive: col, emissiveIntensity: 0 });
  }
  return { T, M };
}

// A window that isn't quite a window: the glass is too white, and if you
// look long enough there's a face in it.
function windowEntTex(own) {
  return paintTex(own, 128, 160, (ctx, w, h) => {
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f8f8f4';
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#d8d6d0';
    ctx.fillRect(w / 2 - 2, 10, 4, h - 20);
    ctx.fillRect(10, h / 2 - 2, w - 20, 4);
    ctx.fillStyle = 'rgba(40,40,40,0.18)';
    ctx.beginPath();
    ctx.ellipse(44, 62, 9, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(84, 62, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(48, 108, 32, 4);
  }, false);
}

function posterTex(own) {
  return paintTex(own, 128, 192, (ctx, w, h) => {
    ctx.fillStyle = '#e8e0c8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a2a4a';
    ctx.fillRect(6, 6, w - 12, 110);
    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath();
    ctx.arc(64, 52, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(40, 74, 48, 40);
    ctx.fillStyle = '#a01818';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('WE WANT', 64, 140);
    ctx.fillText('YOU', 64, 164);
    ctx.font = '10px Arial';
    ctx.fillStyle = '#1a2a4a';
    ctx.fillText('ENLIST TODAY', 64, 182);
  }, false);
}

// The ground: one big plane, coloured by where it is. Roads get asphalt,
// lane lines, crossings and stop lines; everywhere else is pavement slabs.
export function groundMaterial(T, own) {
  const m = new THREE.MeshLambertMaterial({ map: T.asphalt });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tConc = { value: T.concrete };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
varying vec2 vW;
uniform sampler2D tConc;
float band(float x, float c, float hw) { return step(abs(x - c), hw); }
float rng2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Markings on a road segment: a = metres along it, b = across it.
vec2 roadPaint(float a, float b, float endDirA, float endDirB) {
  float W = 0.0, Y = 0.0;
  float mid = step(${(R + 5).toFixed(1)}, a) * step(a, ${(B - 5).toFixed(1)});
  Y += (band(b, 7.82, 0.08) + band(b, 8.18, 0.08)) * step(${(R + 4.2).toFixed(1)}, a) * step(a, ${(B - 4.2).toFixed(1)});
  W += (band(b, 2.3, 0.06) + band(b, 13.7, 0.06)) * mid;
  W += (band(b, 5.15, 0.07) + band(b, 10.85, 0.07)) * step(fract(a / 9.0), 0.33) * mid;
  // Zebra crossings at both ends.
  float cw = (step(${(R + 0.8).toFixed(1)}, a) * step(a, ${(R + 4.0).toFixed(1)}) + step(${(B - 4.0).toFixed(1)}, a) * step(a, ${(B - 0.8).toFixed(1)}));
  W += cw * step(fract((b - 0.3) / 1.2), 0.5) * step(0.9, b) * step(b, ${(R - 0.9).toFixed(1)});
  // Stop lines.
  W += step(${(R + 4.5).toFixed(1)}, a) * step(a, ${(R + 4.9).toFixed(1)}) * step(endDirA * (b - 8.0), 0.0) * step(0.4, abs(b - 8.0));
  W += step(${(B - 4.9).toFixed(1)}, a) * step(a, ${(B - 4.5).toFixed(1)}) * step(endDirB * (b - 8.0), 0.0) * step(0.4, abs(b - 8.0));
  return vec2(min(W, 1.0), min(Y, 1.0));
}
vec3 groundColor(vec2 w) {
  vec2 l = mod(w, ${B.toFixed(1)});
  bool rx = l.y < ${R.toFixed(1)};
  bool rz = l.x < ${R.toFixed(1)};
  if (!rx && !rz) {
    vec3 c = texture2D(tConc, w * 0.25).rgb;
    vec2 g = fract(w / 1.6);
    float joint = max(step(g.x, 0.025), step(g.y, 0.025));
    c *= 1.0 - 0.22 * joint;
    float dc = min(min(l.x - ${R.toFixed(1)}, l.y - ${R.toFixed(1)}), min(${B.toFixed(1)} - l.x, ${B.toFixed(1)} - l.y));
    c *= mix(0.8, 1.0, smoothstep(0.12, 0.4, dc));
    c *= 0.92 + 0.12 * rng2(floor(w / 1.6));
    if (l.x > ${IN0.toFixed(1)} && l.x < ${IN1.toFixed(1)} && l.y > ${ALLEY0.toFixed(1)} && l.y < ${ALLEY1.toFixed(1)}) c *= 0.62;
    return c;
  }
  vec3 c = texture2D(map, w * 0.12).rgb;
  // Patches of newer and older asphalt.
  c *= 0.86 + 0.22 * rng2(floor(w / 7.0));
  vec2 p = vec2(0.0);
  if (rx && !rz) {
    p = roadPaint(l.x, l.y, 1.0, -1.0);
    c *= 1.0 - 0.1 * (band(l.y, 3.7, 0.5) + band(l.y, 6.6, 0.5) + band(l.y, 9.4, 0.5) + band(l.y, 12.3, 0.5));
  } else if (rz && !rx) {
    p = roadPaint(l.y, l.x, -1.0, 1.0);
    c *= 1.0 - 0.1 * (band(l.x, 3.7, 0.5) + band(l.x, 6.6, 0.5) + band(l.x, 9.4, 0.5) + band(l.x, 12.3, 0.5));
  }
  // Gutters: a darker strip along the kerb.
  float gut = rx && !rz ? min(l.y, ${R.toFixed(1)} - l.y) : rz && !rx ? min(l.x, ${R.toFixed(1)} - l.x) : 9.0;
  c *= mix(0.75, 1.0, smoothstep(0.0, 0.5, gut));
  c = mix(c, vec3(0.82, 0.82, 0.78), p.x * 0.85);
  c = mix(c, vec3(0.82, 0.6, 0.12), p.y * 0.9);
  return c;
}`)
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= groundColor(vW);');
  };
  own.mats.push(m);
  return m;
}
