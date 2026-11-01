import * as THREE from 'three';
import { Kit } from '../level94/kit.js';
import {
  B, R, IN0, IN1, ALLEY0, ALLEY1, GF, FH, CEIL, SIDE, TEX_W, TEX_H, STYLES,
  hash, mod, signSlot, avenueName, streetName, AD_COUNT,
} from './city.js';

// Geometry for Level 11's blocks. A block is built in two layers: the shell
// (buildings, storefronts, signs, pavement), which stands for a couple of
// blocks around you, and the detail (trees, lamps, traffic lights, parked
// cars, shop furniture, alley clutter), only for the blocks next to you.

// ---- Small geometry helpers -------------------------------------------------------------

// A vertical quad from (ax, az) to (bx, bz), facing to the left of a->b as
// seen from above (so going round a rectangle x0z0 -> x0z1 -> x1z1 -> x1z0
// faces outward). UVs in metres over (tw x th), offset by u0 tiles and v0 metres.
function quad(kit, key, ax, az, bx, bz, y0, y1, tw = TEX_W, th = TEX_H, u0 = 0, v0 = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01 || y1 - y0 < 0.01) return;
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  const u1 = u0 + len / tw, va = (y0 - v0) / th, vb = (y1 - v0) / th;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, va, u1, va, u1, vb, u0, vb], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  (kit.parts[key] ||= []).push(g);
}

// A horizontal quad over [x0,x1] x [z0,z1] at height y, facing up (or down).
function flat(kit, key, x0, z0, x1, z1, y, up = true, tw = 4, th = 4) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 3));
  const ny = up ? 1 : -1;
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / tw, z0 / th, x0 / tw, z1 / th, x1 / tw, z1 / th, x1 / tw, z0 / th], 2));
  g.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  (kit.parts[key] ||= []).push(g);
}

// A quad whose UVs pick one slot of an atlas.
function atlasQuad(kit, key, ax, az, bx, bz, y0, y1, u0, v0, u1, v1) {
  const len = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  (kit.parts[key] ||= []).push(g);
}

// Atlas slot UVs (flipY: row 0 is at the top of the canvas).
export function signUV(slot) {
  const c = slot % 4, r = Math.floor(slot / 4);
  return [c / 4, 1 - (r + 1) / 16, (c + 1) / 4, 1 - r / 16];
}
function streetUV(slot) {
  const c = slot % 4, r = Math.floor(slot / 4);
  return [c / 4, 1 - (r + 1) / 16, (c + 1) / 4, 1 - r / 16];
}
export function adUV(slot) {
  const c = slot % 2, r = Math.floor(slot / 2);
  return [c / 2, 1 - (r + 1) / 4, (c + 1) / 2, 1 - r / 4];
}

const rect = (x0, z0, x1, z1, y1 = 60, y0 = -1) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, rot: 0, y0, y1 });

// Shared prop geometries, made once per level.
export function propGeometries() {
  const G = {
    trunk: new THREE.CylinderGeometry(0.12, 0.2, 3.4, 6).translate(0, 1.7, 0),
    clump: new THREE.IcosahedronGeometry(1, 1),
    shrub: new THREE.IcosahedronGeometry(0.6, 1),
    pole: new THREE.CylinderGeometry(0.09, 0.12, 1, 8).translate(0, 0.5, 0),
    lens: new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateX(Math.PI / 2),
    disc: new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
    can: new THREE.CylinderGeometry(0.3, 0.27, 0.95, 10).translate(0, 0.475, 0),
    hydrant: new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8).translate(0, 0.35, 0),
    cap: new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    bag: new THREE.SphereGeometry(0.35, 7, 5),
    lanternG: new THREE.SphereGeometry(0.22, 8, 6),
    tank: new THREE.CylinderGeometry(2, 2, 3.2, 14, 1, true).translate(0, 1.6, 0),
    cone: new THREE.ConeGeometry(2.2, 1.2, 14).translate(0, 0.6, 0),
  };
  G.car = carGeometry();
  return G;
}

// A plain modern car, one geometry with vertex colours: white where the
// paint goes (tinted per instance), dark glass, black tyres.
function carGeometry() {
  const parts = [];
  const add = (g, x, y, z, c) => {
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) col.set(c, k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  add(new THREE.BoxGeometry(1.82, 0.62, 4.5), 0, 0.62, 0, [1, 1, 1]);
  add(new THREE.BoxGeometry(1.6, 0.5, 2.3), 0, 1.18, -0.15, [0.09, 0.1, 0.12]);
  add(new THREE.BoxGeometry(1.62, 0.07, 2.0), 0, 1.45, -0.15, [0.92, 0.92, 0.92]);
  add(new THREE.BoxGeometry(1.84, 0.14, 0.2), 0, 0.5, 2.27, [0.15, 0.15, 0.15]);
  add(new THREE.BoxGeometry(1.84, 0.14, 0.2), 0, 0.5, -2.27, [0.15, 0.15, 0.15]);
  add(new THREE.BoxGeometry(0.4, 0.12, 0.04), -0.6, 0.78, 2.26, [1.6, 1.5, 1.2]);
  add(new THREE.BoxGeometry(0.4, 0.12, 0.04), 0.6, 0.78, 2.26, [1.6, 1.5, 1.2]);
  add(new THREE.BoxGeometry(0.4, 0.12, 0.04), -0.6, 0.78, -2.26, [0.8, 0.05, 0.05]);
  add(new THREE.BoxGeometry(0.4, 0.12, 0.04), 0.6, 0.78, -2.26, [0.8, 0.05, 0.05]);
  for (const [x, z] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.4], [0.86, -1.4]]) add(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateZ(Math.PI / 2), x, 0.34, z, [0.05, 0.05, 0.05]);
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const CAR_COLORS = [0xb8bcc0, 0x18191c, 0xe8e8e4, 0x6a1a1a, 0x1c2a4a, 0xa89a7a, 0x4a4e52, 0x2a4a3a, 0x8a8e92, 0xc8b88a];

// ---- The shell ----------------------------------------------------------------------------

export function buildShell(plan, M, own, colliders, seed) {
  const kit = new Kit();
  const out = { solids: [], shops: [], exits: [], billboards: [], meshes: [], lights: [] };
  const X0 = plan.i * B, Z0 = plan.j * B;
  const solid = (b) => {
    colliders.add(b);
    out.solids.push(b);
  };
  // Pavement, raised a kerb's height, and the kerbs.
  flat(kit, 'ground', X0 + R, Z0 + R, X0 + B, Z0 + B, SIDE);
  quad(kit, 'kerb', X0 + R, Z0 + R, X0 + R, Z0 + B, 0, SIDE, 4, 1);
  quad(kit, 'kerb', X0 + R, Z0 + B, X0 + B, Z0 + B, 0, SIDE, 4, 1);
  quad(kit, 'kerb', X0 + B, Z0 + B, X0 + B, Z0 + R, 0, SIDE, 4, 1);
  quad(kit, 'kerb', X0 + B, Z0 + R, X0 + R, Z0 + R, 0, SIDE, 4, 1);
  for (const L of plan.lots) {
    if (L.type === 'building' || L.type === 'abandoned') building(kit, L, M, out, solid, seed);
    else if (L.type === 'construction') construction(kit, L, out, solid, seed);
  }
  if (plan.special === 'times') timesSquare(kit, plan, out, solid, M);
  const group = kit.build(M, own);
  group.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = !m.material.transparent;
    m.receiveShadow = true;
  });
  for (const b of out.billboards) group.add(b.mesh);
  return { group, ...out };
}

function building(kit, L, M, out, solid, seed) {
  const { x0, x1, z0, z1, H } = L;
  const st = STYLES[L.style];
  const base = st.base;
  const key = L.style;
  const north = L.front === 'n';
  const fz = north ? z0 : z1;
  const out1 = north ? -1 : 1; // outward along z
  const shop = L.shop;
  const u0 = L.u0 || 0;
  // The masses: one box, or a podium with a tower stepped back on it, and
  // maybe a crown on top.
  const masses = [];
  let top = H;
  if (L.crown) top = H - 3 * FH;
  if (L.podium) {
    const Hp = GF + L.podium.floors * FH;
    masses.push({ x0, x1, z0, z1, y0: 0, y1: Hp });
    const ins = L.podium.inset;
    const tz0 = north ? z0 + (L.podium.front ? ins : 0.01) : z0 + ins;
    const tz1 = north ? z1 - ins : z1 - (L.podium.front ? ins : 0.01);
    masses.push({ x0: x0 + ins, x1: x1 - ins, z0: tz0, z1: tz1, y0: Hp, y1: top });
  } else masses.push({ x0, x1, z0, z1, y0: 0, y1: top });
  if (L.crown) {
    const m = masses[masses.length - 1];
    masses.push({ x0: m.x0 + 2.2, x1: m.x1 - 2.2, z0: m.z0 + 2.2, z1: m.z1 - 2.2, y0: top, y1: H });
  }
  for (const m of masses) {
    const ground = m.y0 === 0;
    const ya = ground ? GF : m.y0;
    const corners = [[m.x0, m.z0], [m.x0, m.z1], [m.x1, m.z1], [m.x1, m.z0]];
    for (let s = 0; s < 4; s++) {
      const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
      quad(kit, key, ax, az, bx, bz, ya, m.y1, TEX_W, TEX_H, u0 + s * 0.37, GF);
      // The base, on every side but the front.
      const isFront = ground && ((north && s === 3) || (!north && s === 1));
      if (ground && !isFront) quad(kit, base, ax, az, bx, bz, 0, GF, 4, 4);
      // Parapet.
      quad(kit, 'parapet', ax, az, bx, bz, m.y1, m.y1 + 0.9, 4, 1);
    }
    flat(kit, 'roof', m.x0, m.z0, m.x1, m.z1, m.y1 + 0.02, true, 4, 4);
    flat(kit, 'parapet', m.x0, m.z0, m.x1, m.z1, m.y1 + 0.9, true, 4, 4);
  }
  // Rooftop clutter.
  const rh = (k) => hash(Math.round(x0 * 7), Math.round(z0 * 7), k, seed);
  const tm = masses[masses.length - 1];
  const nUnits = 1 + Math.floor(rh(1) * 3);
  for (let k = 0; k < nUnits; k++) {
    const w = 1.5 + rh(2 + k) * 2.5, d = 1.5 + rh(5 + k) * 2;
    const cx = tm.x0 + 2 + rh(8 + k) * Math.max(0.1, tm.x1 - tm.x0 - 4), cz = tm.z0 + 2 + rh(11 + k) * Math.max(0.1, tm.z1 - tm.z0 - 4);
    kit.box('metal', cx, H + 0.8, cz, w, 1.6, d);
  }
  if (L.water) {
    const cx = tm.x0 + 3 + rh(20) * Math.max(0.1, tm.x1 - tm.x0 - 6), cz = tm.z0 + 3 + rh(21) * Math.max(0.1, tm.z1 - tm.z0 - 6);
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) kit.box('metal', cx + dx, H + 2, cz + dz, 0.2, 4, 0.2);
    kit.box('metal', cx, H + 4.05, cz, 4.4, 0.15, 4.4);
    kit.add('wood', new THREE.CylinderGeometry(2, 2, 3.2, 14, 1, true).translate(0, 1.6, 0), cx, H + 4.1, cz);
    kit.add('metal', new THREE.ConeGeometry(2.2, 1.2, 14).translate(0, 0.6, 0), cx, H + 7.3, cz);
  }
  if (L.antenna) {
    const cx = (tm.x0 + tm.x1) / 2, cz = (tm.z0 + tm.z1) / 2;
    kit.add('metal', new THREE.CylinderGeometry(0.08, 0.25, 16, 6).translate(0, 8, 0), cx, H + 0.9, cz);
    out.lights.push({ type: 'beacon', x: cx, y: H + 17, z: cz });
  }

  // ---- The front at street level ----
  const fq = (k, xa, xb, ya, yb, tw = 4, th = 4, uo = 0, vo = 0, off = 0) => {
    if (xb - xa < 0.01) return;
    const z = fz + out1 * off;
    if (north) quad(kit, k, xb, z, xa, z, ya, yb, tw, th, uo, vo);
    else quad(kit, k, xa, z, xb, z, ya, yb, tw, th, uo, vo);
  };
  if (!shop) {
    fq(base, x0, x1, 0, GF);
    solid(rect(x0, z0, x1, z1, H));
  } else if (shop.abandoned) {
    const mid = (shop.x0 + shop.x1) / 2;
    fq(base, x0, mid - 0.75, 0, GF);
    fq(base, mid + 0.75, x1, 0, GF);
    fq(base, mid - 0.75, mid + 0.75, 2.5, GF);
    fq('hole', mid - 0.75, mid + 0.75, SIDE, 2.5, 4, 4, 0, 0, -0.15);
    // Planks nailed across, one hanging loose.
    kit.box('plank', mid, 1.0, fz + out1 * 0.05, 1.7, 0.18, 0.05);
    kit.add('plank', new THREE.BoxGeometry(1.7, 0.18, 0.05), mid, 2.0, fz + out1 * 0.05, 0, 0, 0.5);
    solid(rect(x0, z0, x1, z1, H));
    out.exits.push({
      type: 'door', x: mid, z: fz + out1 * 0.4, r: 0.75, target: shop.exit, how: 'door',
      warnR: L.style === 'redwin' ? 14 : 6, warn: L.style === 'redwin' ? 'A building where every window glows a deep, wet red. Nothing else on the street is lit like that. Its door hangs open.' : L.style === 'overgrown' ? 'An old building, swallowed by ivy. The door hangs open on darkness, and something green and damp breathes out of it.' : 'A boarded-up building. One plank over the door has come loose. It\'s pitch black inside.',
      msg: L.style === 'redwin' ? 'You step inside, into red light. When you come out the other side, the whole city is red, and the sky has no moon.' : L.style === 'overgrown' ? 'You squeeze in through the doorway, under the ivy. It smells of rain and leaves. When you look back, there is no door.' : 'You squeeze in past the planks. Dust, darkness, and the door is gone behind you.',
    });
  } else if (shop.kind === 'lobby') {
    fq(base, x0, shop.x0, 0, GF);
    fq(base, shop.x1, x1, 0, GF);
    fq(base, shop.x0, shop.x1, GF - 0.4, GF);
    fq('lobby', shop.x0, shop.x1, SIDE, GF - 0.4, 3.2, GF - 0.55, 0, SIDE);
    solid(rect(x0, z0, x1, z1, H));
  } else {
    const sx0 = shop.x0, sx1 = shop.x1;
    const signY0 = GF - 1.35, signY1 = GF - 0.3;
    fq(base, x0, sx0, 0, GF);
    fq(base, sx1, x1, 0, GF);
    fq(base, sx0, sx1, signY1, GF);
    // The sign.
    const [a0, b0, a1, b1] = signUV(signSlot(shop.name));
    const z = fz + out1 * 0.05;
    if (north) atlasQuad(kit, 'sign', sx1 - 0.15, z, sx0 + 0.15, z, signY0, signY1, a0, b0, a1, b1);
    else atlasQuad(kit, 'sign', sx0 + 0.15, z, sx1 - 0.15, z, signY0, signY1, a0, b0, a1, b1);
    fq('frame', sx0, sx1, signY0 - 0.05, signY0 + 0.01, 4, 4, 0, 0, 0.02);
    if (shop.awning >= 0) {
      const w = sx1 - sx0, cx = (sx0 + sx1) / 2;
      kit.add(`awn${shop.awning}`, new THREE.PlaneGeometry(w, 1.71), cx, signY0 - 0.35, fz + out1 * 0.8, 1.215, north ? 0 : Math.PI, 0);
      kit.add(`awn${shop.awning}`, new THREE.PlaneGeometry(w, 0.32), cx, signY0 - 0.81, fz + out1 * 1.6, 0, 0, 0);
    }
    if (!shop.open) {
      fq('shopDark', sx0, sx1, SIDE, signY0, 3.2, signY0 - SIDE, 0, SIDE, 0.01);
      solid(rect(x0, z0, x1, z1, H));
    } else {
      shopRoom(kit, L, shop, out, solid, signY0);
    }
  }
  // Posters, banners, billboards.
  if (L.poster) {
    const px = shop && shop.x0 - x0 > 1.4 ? x0 + 0.6 : x1 - 1.3;
    fq('poster', px, px + 0.7, 1.1, 2.15, 0.7, 1.05, 0, 1.1, 0.03);
    out.exits.push({ type: 'poster', x: px + 0.35, z: fz + out1 * 0.5, r: 0.75, face: [0, -out1], target: 'level49', how: 'noclip', warnR: 3, warn: 'A faded recruitment poster: WE WANT YOU. The soldier\'s eyes seem to follow you. You could touch it.', msg: 'You put your hand on the poster. It\'s warm, and it gives, like cloth over nothing. You fall through it.' });
  }
  if (L.windowEnt) {
    const wx = shop && shop.x1 < x1 - 2.4 ? x1 - 1.9 : x0 + 0.5;
    fq('windowEnt', wx, wx + 1.4, 0.9, 2.65, 1.4, 1.75, 0, 0.9, 0.03);
    out.exits.push({ type: 'poster', x: wx + 0.7, z: fz + out1 * 0.5, r: 0.7, target: 'level12', how: 'noclip', warnR: 4, warn: 'A ground-floor window, too bright, too white. There\'s something in the glass, like a face. It\'s not a reflection.', msg: 'You touch the white window and it isn\'t there. You fall into white.' });
  }
  if (L.banner >= 0) {
    const bx = north ? x1 - 2.5 : x0 + 2.5;
    const g = new THREE.PlaneGeometry(2.6, 18);
    const uv = g.attributes.uv;
    const k = L.banner;
    for (let n = 0; n < 4; n++) uv.setX(n, (k + uv.getX(n)) / 4);
    kit.add('banners', g, bx, Math.min(H - 12, GF + 22), fz + out1 * 0.4, 0, north ? Math.PI : 0, 0);
    g.dispose();
  }
  if (L.billboard >= 0) {
    const cx = (x0 + x1) / 2, cz = fz - out1 * 3;
    const w = Math.min(10, x1 - x0 - 1), h = w * 0.45;
    for (const dx of [-w * 0.35, w * 0.35]) kit.box('metal', cx + dx, H + 1.5, cz, 0.25, 3, 0.25);
    kit.box('metal', cx, H + 3 + h / 2, cz - out1 * 0.15, w + 0.3, h + 0.3, 0.2);
    const g = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(g, M.ads);
    mesh.position.set(cx, H + 3 + h / 2, cz + out1 * 0.0);
    mesh.rotation.y = north ? Math.PI : 0;
    setAd(mesh, L.billboard);
    mesh.castShadow = true;
    out.billboards.push({ mesh, slot: L.billboard, x: cx, y: H + 3 + h / 2, z: cz, nx: 0, nz: out1, seen: L.billboard });
  }
}

export function setAd(mesh, slot) {
  const [a0, b0, a1, b1] = adUV(slot % AD_COUNT);
  const uv = mesh.geometry.attributes.uv;
  uv.setXY(0, a0, b1);
  uv.setXY(1, a1, b1);
  uv.setXY(2, a0, b0);
  uv.setXY(3, a1, b0);
  uv.needsUpdate = true;
}

// A shop you can walk into: glass front, door, a lit room behind it.
function shopRoom(kit, L, shop, out, solid, signY0) {
  const { x0, x1, z0, z1, H } = L;
  const north = L.front === 'n';
  const fz = north ? z0 : z1;
  const out1 = north ? -1 : 1;
  const D = shop.depth;
  const sx0 = shop.x0, sx1 = shop.x1, mid = (sx0 + sx1) / 2;
  const rz0 = north ? z0 : z1 - D, rz1 = north ? z0 + D : z1;
  const back = north ? rz1 : rz0;
  const doorW = shop.kind === 'meg' || shop.kind === 'mall' || shop.kind === 'hospital' ? 2.8 : 1.8;
  const dx0 = mid - doorW / 2, dx1 = mid + doorW / 2;
  const fq = (k, xa, xb, ya, yb, tw = 4, th = 4, off = 0) => {
    const z = fz + out1 * off;
    if (north) quad(kit, k, xb, z, xa, z, ya, yb, tw, th);
    else quad(kit, k, xa, z, xb, z, ya, yb, tw, th);
  };
  // Glass either side of the door, and above it.
  fq('shopGlass', sx0, dx0, SIDE, signY0, 4, 4, 0.01);
  fq('shopGlass', dx1, sx1, SIDE, signY0, 4, 4, 0.01);
  fq('shopGlass', dx0, dx1, 2.5, signY0, 4, 4, 0.01);
  for (const x of [sx0 + 0.05, dx0, dx1, sx1 - 0.05]) kit.box('frame', x, (SIDE + signY0) / 2, fz + out1 * 0.02, 0.09, signY0 - SIDE, 0.12);
  kit.box('frame', mid, 2.5, fz + out1 * 0.02, doorW, 0.1, 0.12);
  kit.box('frame', (sx0 + dx0) / 2, SIDE + 0.2, fz + out1 * 0.02, dx0 - sx0, 0.4, 0.12);
  kit.box('frame', (dx1 + sx1) / 2, SIDE + 0.2, fz + out1 * 0.02, sx1 - dx1, 0.4, 0.12);
  // The room: floor, ceiling, walls (facing in).
  flat(kit, 'tile', sx0, rz0, sx1, rz1, SIDE + 0.01, true, 2, 2);
  flat(kit, 'ceiling', sx0, rz0, sx1, rz1, CEIL, false, 2, 2);
  quad(kit, 'wallInt', sx0, rz1, sx0, rz0, SIDE, CEIL, 4, CEIL);
  quad(kit, 'wallInt', sx1, rz0, sx1, rz1, SIDE, CEIL, 4, CEIL);
  // The back wall faces the front; and the inside of the wall above the glass.
  if (north) {
    quad(kit, 'wallInt', sx1, back, sx0, back, SIDE, CEIL, 4, CEIL);
    quad(kit, 'wallInt', sx0, fz + 0.02, sx1, fz + 0.02, signY0, CEIL, 4, CEIL);
  } else {
    quad(kit, 'wallInt', sx0, back, sx1, back, SIDE, CEIL, 4, CEIL);
    quad(kit, 'wallInt', sx1, fz - 0.02, sx0, fz - 0.02, signY0, CEIL, 4, CEIL);
  }
  // Ceiling lights.
  const n = Math.max(1, Math.round((sx1 - sx0) / 5));
  for (let k = 0; k < n; k++) for (const f of [0.3, 0.7]) {
    const lx = sx0 + (k + 0.5) * (sx1 - sx0) / n, lz = rz0 + (rz1 - rz0) * f;
    flat(kit, 'panel', lx - 0.6, lz - 0.3, lx + 0.6, lz + 0.3, CEIL - 0.02, false, 1, 1);
  }
  // Walls round it.
  if (sx0 - x0 > 0.05) solid(rect(x0, rz0, sx0, rz1, H));
  if (x1 - sx1 > 0.05) solid(rect(sx1, rz0, x1, rz1, H));
  solid(north ? rect(x0, rz1, x1, z1, H) : rect(x0, z0, x1, rz0, H));
  solid(rect(sx0, fz - 0.06, dx0, fz + 0.06, signY0));
  solid(rect(dx1, fz - 0.06, sx1, fz + 0.06, signY0));
  // A door at the back, if this shop is really a way out.
  const info = { x0: sx0, x1: sx1, z0: rz0, z1: rz1, front: L.front, mid, fz, back, kind: shop.kind, name: shop.name, exit: shop.exit, item: shop.item, item2: shop.item2, light: { x: mid, y: CEIL - 1.3, z: (rz0 + rz1) / 2 } };
  if (shop.exit) {
    const bz = back + out1 * 0.03;
    if (north) quad(kit, 'exitDoor', mid + 0.65, bz, mid - 0.65, bz, SIDE, 2.4, 4, 4);
    else quad(kit, 'exitDoor', mid - 0.65, bz, mid + 0.65, bz, SIDE, 2.4, 4, 4);
    for (const x of [mid - 0.72, mid + 0.72]) kit.box('wood', x, 1.3, back + out1 * 0.06, 0.12, 2.5, 0.1);
    kit.box('wood', mid, 2.5, back + out1 * 0.06, 1.56, 0.12, 0.1);
    info.door = { x: mid, z: back + out1 * 0.7 };
  }
  out.shops.push(info);
}

// A fenced construction site: a half-built concrete frame and a crane.
function construction(kit, L, out, solid, seed) {
  const { x0, x1, z0, z1 } = L;
  const north = L.front === 'n';
  const fz = north ? z0 : z1;
  const h = (k) => hash(Math.round(x0), Math.round(z0), k, seed);
  const fx0 = x0 + 0.4, fx1 = x1 - 0.4, fz0 = z0 + 0.4, fz1 = z1 - 0.4;
  const gate0 = (x0 + x1) / 2 - 2.2, gate1 = (x0 + x1) / 2 + 2.2;
  const fenceH = 2.4;
  const ff = fz + (north ? 0.4 : -0.4);
  // Fence (front with a gate, the other three sides solid).
  const segs = [[fx0, fz0, fx0, fz1], [fx1, fz1, fx1, fz0], north ? [fx0, fz1, fx1, fz1] : [fx1, fz0, fx0, fz0]];
  segs.push([fx0, ff, gate0, ff], [gate1, ff, fx1, ff]);
  for (const [ax, az, bx, bz] of segs) {
    quad(kit, 'fence', ax, az, bx, bz, SIDE, fenceH, 2, 2);
    solid(rect(Math.min(ax, bx) - 0.05, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, Math.max(az, bz) + 0.05, fenceH));
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= len; s += 3) kit.box('metal', ax + (bx - ax) * s / len, fenceH / 2, az + (bz - az) * s / len, 0.06, fenceH, 0.06);
  }
  flat(kit, 'dirt', fx0, fz0, fx1, fz1, SIDE + 0.02, true, 4, 4);
  // The frame.
  const cx0 = x0 + 3, cx1 = x1 - 3;
  const cz0 = north ? z0 + 6 : z0 + 3, cz1 = north ? z1 - 3 : z1 - 6;
  const floors = 3 + Math.floor(h(1) * 5);
  const nx = Math.max(2, Math.round((cx1 - cx0) / 6)), nz = Math.max(2, Math.round((cz1 - cz0) / 6));
  for (let f = 0; f < floors; f++) {
    const y = SIDE + f * FH;
    if (f > 0) kit.box('concreteRaw', (cx0 + cx1) / 2, y, (cz0 + cz1) / 2, cx1 - cx0, 0.3, cz1 - cz0);
    for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
      const px = cx0 + (cx1 - cx0) * a / nx, pz = cz0 + (cz1 - cz0) * b / nz;
      const top = f === floors - 1;
      kit.box(top && (a + b) % 2 ? 'rebar' : 'concreteRaw', px, y + FH / 2, pz, top ? 0.25 : 0.5, FH, top ? 0.25 : 0.5);
      if (f === 0) solid(rect(px - 0.3, pz - 0.3, px + 0.3, pz + 0.3, 8));
    }
  }
  // Scaffolding up one side.
  const sz = north ? cz0 - 1.2 : cz1 + 1.2;
  for (let f = 0; f < floors; f++) {
    for (let x = cx0; x <= cx1 + 0.01; x += 2.5) kit.box('scaffold', x, SIDE + f * FH + FH / 2, sz, 0.06, FH, 0.06);
    kit.box('scaffold', (cx0 + cx1) / 2, SIDE + (f + 1) * FH - 0.05, sz, cx1 - cx0, 0.06, 0.06);
    kit.box('plank', (cx0 + cx1) / 2, SIDE + (f + 1) * FH - 0.1, sz, cx1 - cx0, 0.05, 0.9);
  }
  // A tower crane.
  const mx = cx1 + 1.5 > x1 - 1 ? cx0 - 1.5 : cx1 + 1.5;
  const mz = (cz0 + cz1) / 2;
  const mh = 30 + floors * FH;
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) kit.box('scaffold', mx + dx, mh / 2, mz + dz, 0.12, mh, 0.12);
  for (let y = 2; y < mh; y += 3) {
    kit.box('scaffold', mx, y, mz - 0.8, 1.6, 0.08, 0.08);
    kit.box('scaffold', mx, y, mz + 0.8, 1.6, 0.08, 0.08);
    kit.box('scaffold', mx - 0.8, y, mz, 0.08, 0.08, 1.6);
    kit.box('scaffold', mx + 0.8, y, mz, 0.08, 0.08, 1.6);
  }
  const jr = h(2) * Math.PI * 2;
  const jx = Math.cos(jr), jz = Math.sin(jr);
  kit.add('scaffold', new THREE.BoxGeometry(36, 1.2, 1.2), mx + jx * 12, mh + 0.6, mz + jz * 12, 0, -jr, 0);
  kit.add('concreteRaw', new THREE.BoxGeometry(3, 2, 2), mx - jx * 6, mh, mz - jz * 6, 0, -jr, 0);
  kit.box('yellow', mx, mh - 1, mz, 2.2, 2, 2.2);
  kit.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 14, 4).translate(0, -7, 0), mx + jx * 24, mh, mz + jz * 24);
  kit.box('concreteRaw', mx + jx * 24, mh - 14, mz + jz * 24, 1.2, 0.6, 1.2);
  // Cones and barriers at the gate, a heap of sand.
  for (let k = 0; k < 4; k++) kit.add('awn0', new THREE.ConeGeometry(0.18, 0.6, 8).translate(0, 0.3, 0), gate0 + k * 1.4 + 0.3, SIDE, ff + (north ? -0.6 : 0.6));
  kit.add('dirt', new THREE.ConeGeometry(2.5, 1.6, 10).translate(0, 0.8, 0), cx0 + 1, SIDE, north ? z1 - 2.5 : z0 + 2.5);
  out.exits.push({
    type: 'zone', x0: cx0 + 0.5, x1: cx1 - 0.5, z0: cz0 + 0.5, z1: cz1 - 0.5, dwell: 1.6, target: 'level325', how: 'noclip',
    warnRect: [fx0, fz0, fx1, fz1],
    warn: 'A construction site, gate open, nobody working. The bare ground floor slab looks wrong, somehow. Like it hasn\'t decided to be solid yet.',
    msg: 'The slab gives under you like wet sand, and you sink through the floor that isn\'t finished.',
  });
}

// New Times Square: a whole block of open plaza, walled with screens.
function timesSquare(kit, plan, out, solid, M) {
  const X0 = plan.i * B, Z0 = plan.j * B;
  const cx = X0 + (R + B) / 2, cz = Z0 + (R + B) / 2;
  // Screen towers round the edge, three panels high.
  const towers = [[X0 + R + 8, Z0 + R + 8], [X0 + B - 8, Z0 + R + 8], [X0 + R + 8, Z0 + B - 8], [X0 + B - 8, Z0 + B - 8], [cx, Z0 + R + 6], [cx, Z0 + B - 6], [X0 + R + 6, cz], [X0 + B - 6, cz]];
  towers.forEach(([tx, tz], k) => {
    const face = Math.atan2(cx - tx, cz - tz);
    kit.add('metal', new THREE.BoxGeometry(1.2, 30, 1.2).translate(0, 15, 0), tx, 0, tz, 0, face, 0);
    for (let p = 0; p < 3; p++) {
      const w = 12, h = 5.4;
      const g = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(g, M.screens);
      const y = 9 + p * 6.6;
      mesh.position.set(tx + Math.sin(face) * 0.7, y, tz + Math.cos(face) * 0.7);
      mesh.rotation.y = face;
      const slot = (k * 3 + p) % AD_COUNT;
      setAd(mesh, slot);
      out.billboards.push({ mesh, slot, x: mesh.position.x, y, z: mesh.position.z, nx: Math.sin(face), nz: Math.cos(face), seen: slot, screen: true });
      kit.add('metal', new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.3), tx + Math.sin(face) * 0.5, y, tz + Math.cos(face) * 0.5, 0, face, 0);
    }
    solid({ x: tx, z: tz, hw: 0.8, hd: 0.8, rot: 0, y0: -1, y1: 30 });
  });
  // A statue on a plinth in the middle: someone pointing the way.
  kit.box('baseDark', cx, 1.2, cz, 3, 2.4, 3);
  kit.add('rebar', new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8).translate(0, 1.1, 0), cx, 2.4, cz);
  kit.add('rebar', new THREE.SphereGeometry(0.32, 10, 8), cx, 4.95, cz);
  kit.add('rebar', new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6).translate(0, 0.7, 0), cx + 0.3, 4.2, cz, 0, 0, -1.1);
  solid({ x: cx, z: cz, hw: 1.6, hd: 1.6, rot: 0, y0: -1, y1: 6 });
}

// ---- The detail -----------------------------------------------------------------------------

export function buildDetail(plan, M, G, own, colliders, seed, opts = {}) {
  const kit = new Kit();
  const out = { solids: [], lamps: [], cars: [], trees: [], planters: [], exits: [], neon: [], stalls: [], busStop: null };
  const X0 = plan.i * B, Z0 = plan.j * B;
  const h = (k) => hash(plan.i, plan.j, 100 + k, seed);
  const solid = (b) => {
    colliders.add(b);
    out.solids.push(b);
  };
  const keepOut = []; // spots on the pavement already taken
  const free = (x, z, r) => keepOut.every((k) => Math.hypot(k[0] - x, k[1] - z) > r + k[2]);
  if (opts.spawn) keepOut.push([opts.spawn.x, opts.spawn.z, 3]);
  // The four pavement strips, as (start, end, fixed coordinate, axis).
  const strips = [
    { ax: 'x', a0: X0 + R, a1: X0 + B, c: Z0 + R, out: -1 }, // north, along x; road at -z
    { ax: 'z', a0: Z0 + R, a1: Z0 + B, c: X0 + R, out: -1 }, // west, along z; road at -x
    { ax: 'x', a0: X0 + R, a1: X0 + B, c: Z0 + B, out: 1 }, // south; road at +z
    { ax: 'z', a0: Z0 + R, a1: Z0 + B, c: X0 + B, out: 1 }, // east; road at +x
  ];
  const at = (s, a, inset) => (s.ax === 'x' ? [a, s.c - s.out * inset] : [s.c - s.out * inset, a]);

  // Bus stop.
  if (plan.busStop) {
    const { x, z } = plan.busStop;
    keepOut.push([x, z, 3.5]);
    kit.box('metal', x, 2.5, z + 1.1, 3.6, 0.08, 1.5);
    for (const dx of [-1.75, 1.75]) kit.box('metal', x + dx, 1.25, z + 1.8, 0.07, 2.5, 0.07);
    quadZ(kit, 'shopGlass', x - 1.8, x + 1.8, z + 1.82, 0.3, 2.4);
    kit.box('wood', x, 0.5, z + 1.55, 2.6, 0.08, 0.45);
    // An ad panel at the end of the shelter.
    const g = new THREE.PlaneGeometry(1.3, 2.0);
    const mesh = new THREE.Mesh(g, M.ads);
    mesh.position.set(x + 1.85, 1.35, z + 1.1);
    mesh.rotation.y = Math.PI / 2;
    const slot = Math.floor(h(1) * AD_COUNT);
    setAd(mesh, slot);
    out.billboards = [{ mesh, slot, x: mesh.position.x, y: 1.35, z: mesh.position.z, nx: 1, nz: 0, seen: slot }];
    kit.box('pole', x - 2.6, 1.5, z - 0.6, 0.08, 3, 0.08);
    kit.box('awn2', x - 2.6, 2.9, z - 0.6, 0.6, 0.6, 0.04);
    solid(rect(x - 1.85, z + 1.7, x + 1.85, z + 1.95, 3));
    out.busStop = { x, z: z - 0.4, roadZ: Z0 + R - 1.4 };
  }
  // Open sewer grate.
  if (plan.grate) {
    const { x, z } = plan.grate;
    flatAt(kit, 'hole', x - 0.45, z - 0.3, x + 0.45, z + 0.3, 0.012);
    kit.add('metal', new THREE.BoxGeometry(0.9, 0.04, 0.6), x + 0.8, 0.03, z - 0.5, 0, 0.4, 0);
    out.exits.push({ type: 'grate', x, z, r: 0.5, target: plan.grate.target, how: 'noclip', warnR: 7, warn: 'Someone has left a sewer grate open in the gutter. It\'s very dark down there, and very deep.', msg: 'Your foot finds the open grate. You drop into the dark, and keep dropping.' });
  }
  // Street lamps.
  for (const s of strips) {
    for (let a = s.a0 + 15; a < s.a1 - 8; a += 30) {
      const [x, z] = at(s, a, 0.55);
      if (!free(x, z, 1)) continue;
      keepOut.push([x, z, 1.2]);
      const pole = G.pole;
      kit.add('pole', pole, x, SIDE, z, 0, 0, 0, 1, 8, 1);
      const [ox, oz] = s.ax === 'x' ? [0, s.out * 2.2] : [s.out * 2.2, 0];
      kit.box('pole', x + ox / 2, SIDE + 7.9, z + oz / 2, Math.abs(ox) + 0.08, 0.08, Math.abs(oz) + 0.08);
      kit.box('lampHead', x + ox, SIDE + 7.75, z + oz, 0.4 + Math.abs(oz) * 0.15, 0.18, 0.4 + Math.abs(ox) * 0.15);
      out.lamps.push({ x: x + ox, y: SIDE + 7.5, z: z + oz });
      solid({ x, z, hw: 0.14, hd: 0.14, rot: 0, y0: -1, y1: 8 });
    }
  }
  // Traffic lights on the four corners.
  const corners = [
    { x: X0 + R + 0.7, z: Z0 + R + 0.7, arm: [0, -1], face: Math.PI / 2, g: 'ew', street: 32 + mod(plan.j, 32) },
    { x: X0 + B - 0.7, z: Z0 + R + 0.7, arm: [0, -1], face: -Math.PI / 2, g: 'ew', street: 32 + mod(plan.j, 32) },
    { x: X0 + R + 0.7, z: Z0 + B - 0.7, arm: [-1, 0], face: Math.PI, g: 'ns', street: mod(plan.i, 32) },
    { x: X0 + B - 0.7, z: Z0 + B - 0.7, arm: [1, 0], face: Math.PI, g: 'ns', street: mod(plan.i + 1, 32) },
  ];
  for (const c of corners) {
    keepOut.push([c.x, c.z, 1.5]);
    kit.add('metal', G.pole, c.x, SIDE, c.z, 0, 0, 0, 1.4, 6.6, 1.4);
    const L = 7.5;
    const ax = c.x + c.arm[0] * L / 2, az = c.z + c.arm[1] * L / 2;
    kit.box('metal', ax, SIDE + 6.3, az, Math.abs(c.arm[0]) * L + 0.12, 0.12, Math.abs(c.arm[1]) * L + 0.12);
    for (const [d, hy] of [[L * 0.55, 5.7], [L * 0.95, 5.7], [0, 3.4]]) {
      const hx = c.x + c.arm[0] * d, hz = c.z + c.arm[1] * d;
      const fx = Math.sin(c.face), fzz = Math.cos(c.face);
      kit.add('metal', new THREE.BoxGeometry(0.34, 1.0, 0.26), hx, SIDE + hy, hz, 0, c.face, 0);
      [['r', 0.3], ['y', 0], ['g', -0.3]].forEach(([col, dy]) => {
        kit.add(`sig_${c.g}_${col}`, G.lens, hx + fx * 0.14, SIDE + hy + dy, hz + fzz * 0.14, 0, c.face, 0);
      });
    }
    // The street name, on the arm.
    const sx = c.x + c.arm[0] * 2.4, sz = c.z + c.arm[1] * 2.4;
    const [u0, v0, u1, v1] = streetUV(c.street);
    const g = new THREE.PlaneGeometry(2.6, 0.33);
    const uv = g.attributes.uv;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    kit.add('street', g, sx, SIDE + 6.75, sz, 0, c.arm[0] ? 0 : Math.PI / 2, 0);
    g.dispose();
    solid({ x: c.x, z: c.z, hw: 0.18, hd: 0.18, rot: 0, y0: -1, y1: 7 });
  }
  // A hydrant, with the kerb painted red beside it.
  {
    const s = strips[Math.floor(h(2) * 4)];
    const a = s.a0 + 20 + h(3) * (s.a1 - s.a0 - 40);
    const [x, z] = at(s, a, 0.6);
    if (free(x, z, 1)) {
      keepOut.push([x, z, 1]);
      kit.add('yellow', G.hydrant, x, SIDE, z);
      kit.add('yellow', G.cap, x, SIDE + 0.7, z);
      kit.box('yellow', x, SIDE + 0.45, z, 0.5, 0.1, 0.1);
      const [c0, c1] = [a - 3, a + 3];
      const off = 0.012;
      if (s.ax === 'x') quad(kit, 'curbRed', s.out < 0 ? c1 : c0, s.c + s.out * off, s.out < 0 ? c0 : c1, s.c + s.out * off, 0, SIDE + 0.005, 4, 1);
      else quad(kit, 'curbRed', s.c + s.out * off, s.out < 0 ? c0 : c1, s.c + s.out * off, s.out < 0 ? c1 : c0, 0, SIDE + 0.005, 4, 1);
      solid({ x, z, hw: 0.2, hd: 0.2, rot: 0, y0: -1, y1: 1 });
    }
  }
  // Bins and newspaper boxes.
  for (let k = 0; k < 3; k++) {
    const s = strips[Math.floor(h(10 + k) * 4)];
    const a = s.a0 + 10 + h(13 + k) * (s.a1 - s.a0 - 20);
    const [x, z] = at(s, a, 0.75);
    if (!free(x, z, 0.8)) continue;
    keepOut.push([x, z, 0.8]);
    if (k < 2) kit.add('dumpster', G.can, x, SIDE, z);
    else {
      kit.box(h(16) < 0.5 ? 'awn2' : 'awn0', x, SIDE + 0.55, z, 0.5, 1.1, 0.45);
    }
    solid({ x, z, hw: 0.3, hd: 0.3, rot: 0, y0: -1, y1: 1.2 });
  }
  // Street trees in their grates.
  const treeK = plan.d > 0.75 ? 0.55 : 0.8;
  for (const s of strips) {
    for (let a = s.a0 + 9; a < s.a1 - 7; a += 9.5) {
      if (hash(Math.round(a * 3), Math.round(s.c), 7, seed) > treeK) continue;
      const [x, z] = at(s, a, 1.35);
      if (!free(x, z, 1.4)) continue;
      keepOut.push([x, z, 1]);
      const sc = 0.85 + hash(Math.round(a), Math.round(s.c), 8, seed) * 0.45;
      out.trees.push({ x, z, s: sc });
      flatAt(kit, 'decal', x - 0.6, z - 0.6, x + 0.6, z + 0.6, SIDE + 0.008);
      solid({ x, z, hw: 0.2, hd: 0.2, rot: 0, y0: -1, y1: 4 });
    }
  }
  // Manhole covers.
  for (let k = 0; k < 3; k++) {
    const onX = h(20 + k) < 0.5;
    const along = R + 8 + h(23 + k) * (B - R - 16), across = 3 + h(26 + k) * (R - 6);
    const x = X0 + (onX ? along : across), z = Z0 + (onX ? across : along);
    kit.add('decal', G.disc, x, 0.01, z);
  }
  // Parked cars along the kerbs.
  const lanes = [
    { ax: 'x', c: Z0 + R - 1.25, dir: 0 }, // north road, south kerb: facing +x
    { ax: 'x', c: Z0 + 1.25, dir: Math.PI }, // north road, north kerb: facing -x
    { ax: 'z', c: X0 + R - 1.25, dir: Math.PI }, // west road, east kerb: facing -z
    { ax: 'z', c: X0 + 1.25, dir: 0 }, // west road, west kerb: facing +z
  ];
  const fill = 0.32 + plan.d * 0.2;
  for (const ln of lanes) {
    for (let a = R + 9; a < B - 8; a += 6) {
      const x = ln.ax === 'x' ? X0 + a : ln.c, z = ln.ax === 'x' ? ln.c : Z0 + a;
      if (plan.busStop && ln === lanes[0] && Math.abs(x - plan.busStop.x) < 9) continue;
      if (plan.grate && ln === lanes[0] && Math.abs(x - plan.grate.x) < 4) continue;
      const rot = ln.ax === 'x' ? (ln.dir === 0 ? Math.PI / 2 : -Math.PI / 2) : ln.dir;
      out.cars.push({ x, z, rot, on: hash(Math.round(x), Math.round(z), 9, seed) < fill, color: CAR_COLORS[Math.floor(hash(Math.round(x), Math.round(z), 10, seed) * CAR_COLORS.length)] });
    }
  }
  // Lots: plazas and car parks.
  for (const L of plan.lots) {
    if (L.type === 'plaza') plaza(kit, L, out, solid, seed, G);
    if (L.type === 'parking') parking(kit, L, out, seed);
    if (L.type === 'building' && L.hedge && L.shop) hedges(kit, L, out, solid);
  }
  // The alley.
  alley(kit, plan, out, solid, seed, G);
  // Shop furniture.
  for (const s of opts.shops || []) furnish(kit, s, out, solid, seed, G);
  if (plan.special === 'meg') megOutside(kit, plan, out, solid);
  if (plan.special === 'times') timesStalls(kit, plan, out, solid);

  const group = kit.build(M, own);
  group.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = !m.material.transparent;
    m.receiveShadow = true;
  });
  // Trees: trunks and canopies, instanced.
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  if (out.trees.length) {
    const trunks = new THREE.InstancedMesh(G.trunk, M.bark, out.trees.length);
    const crowns = new THREE.InstancedMesh(G.clump, M.foliage, out.trees.length * 7);
    const col = new THREE.Color();
    let n = 0;
    out.trees.forEach((t, k) => {
      trunks.setMatrixAt(k, m4.compose(p.set(t.x, SIDE, t.z), q.identity(), sc.setScalar(t.s)));
      for (let c = 0; c < 7; c++) {
        const r = hash(k, c, 11, seed), a = c * 0.9 + r * 2;
        const rr = c === 0 ? 0 : (1.1 + r * 0.7) * t.s;
        crowns.setMatrixAt(n, m4.compose(p.set(t.x + Math.cos(a) * rr, SIDE + (4.1 + (c === 0 ? 1.4 : r * 1.2)) * t.s, t.z + Math.sin(a) * rr), q.setFromAxisAngle(up, a), sc.set(1.5 * t.s, 1.15 * t.s, 1.5 * t.s)));
        crowns.setColorAt(n, col.setRGB(0.8 + r * 0.25, 0.95 + r * 0.2, 0.7 + r * 0.15));
        n++;
      }
    });
    trunks.castShadow = crowns.castShadow = true;
    trunks.receiveShadow = crowns.receiveShadow = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    group.add(trunks, crowns);
  }
  // Parked cars, instanced (the level shuffles them when nobody's looking).
  const cars = new THREE.InstancedMesh(G.car, M.car, Math.max(1, out.cars.length));
  cars.castShadow = true;
  cars.receiveShadow = true;
  out.carMesh = cars;
  group.add(cars);
  if (out.billboards) for (const b of out.billboards) group.add(b.mesh);
  return { group, ...out };
}

function quadZ(kit, key, xa, xb, z, y0, y1) {
  quad(kit, key, xa, z, xb, z, y0, y1, 4, 4);
  quad(kit, key, xb, z + 0.01, xa, z + 0.01, y0, y1, 4, 4);
}

function flatAt(kit, key, x0, z0, x1, z1, y) {
  flat(kit, key, x0, z0, x1, z1, y, true, x1 - x0, z1 - z0);
}

function plaza(kit, L, out, solid, seed, G) {
  const { x0, x1, z0, z1 } = L;
  const h = (k) => hash(Math.round(x0), Math.round(z0), 200 + k, seed);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // Planters full of shrubs, low enough to trip over.
  const n = 2 + Math.floor(h(1) * 3);
  for (let k = 0; k < n; k++) {
    const w = 3.5 + h(2 + k) * 2, d = 1.4;
    const px = x0 + 2 + w / 2 + h(5 + k) * Math.max(0.1, x1 - x0 - 4 - w), pz = z0 + 3 + (k / Math.max(1, n - 1)) * Math.max(0.1, z1 - z0 - 6);
    kit.box('kerb', px, SIDE + 0.3, pz, w, 0.6, d);
    for (let s = 0; s < Math.round(w / 0.8); s++) kit.add('hedge', G.shrub, px - w / 2 + 0.45 + s * 0.8, SIDE + 0.85, pz + (h(8 + s) - 0.5) * 0.3, 0, s, 0, 1.0, 0.85, 1.0);
    const b = { x: px, z: pz, hw: w / 2, hd: d / 2, rot: 0, y0: -1, y1: 0.9 };
    solid(b);
    out.planters.push(b);
  }
  // Benches and a couple of trees.
  for (let k = 0; k < 2; k++) {
    const bx = x0 + 3 + h(12 + k) * (x1 - x0 - 6), bz = cz + (k ? 4 : -4);
    kit.box('wood', bx, SIDE + 0.45, bz, 1.8, 0.08, 0.5);
    kit.box('metal', bx - 0.8, SIDE + 0.22, bz, 0.08, 0.44, 0.45);
    kit.box('metal', bx + 0.8, SIDE + 0.22, bz, 0.08, 0.44, 0.45);
  }
  out.trees.push({ x: cx + (x1 - x0) * 0.25, z: cz, s: 1.1 }, { x: cx - (x1 - x0) * 0.25, z: cz + 2, s: 1 });
  // A sculpture nobody remembers commissioning.
  if (h(20) < 0.6) {
    kit.add('curbRed', new THREE.TorusGeometry(1.6, 0.25, 8, 20), cx, SIDE + 2.2, cz - 6, 0, h(21) * 3, 0.3);
    kit.box('baseDark', cx, SIDE + 0.3, cz - 6, 1.2, 0.6, 1.2);
    solid({ x: cx, z: cz - 6, hw: 0.7, hd: 0.7, rot: 0, y0: -1, y1: 4 });
  }
}

function parking(kit, L, out, seed) {
  const { x0, x1, z0, z1 } = L;
  const north = L.front === 'n';
  // Painted bays in a row along the back, facing the street.
  const bz = north ? z1 - 2.6 : z0 + 2.6;
  for (let x = x0 + 1; x < x1 - 2.6; x += 2.8) {
    flatAt(kit, 'paint', x - 0.05, bz - 2.6, x + 0.05, bz + 2.6, SIDE + 0.008);
    const cx = x + 1.4;
    if (cx < x1 - 1.2) out.cars.push({ x: cx, z: bz, rot: north ? Math.PI : 0, on: hash(Math.round(cx), Math.round(bz), 9, seed) < 0.55, color: CAR_COLORS[Math.floor(hash(Math.round(cx), 3, 10, seed) * CAR_COLORS.length)] });
  }
  // Bollards along the pavement.
  const fz = north ? z0 + 0.4 : z1 - 0.4;
  for (let x = x0 + 1; x < x1; x += 2) kit.box('yellow', x, SIDE + 0.45, fz, 0.18, 0.9, 0.18);
  // A pay booth.
  kit.box('paint', x0 + 1.5, SIDE + 1.2, north ? z0 + 2 : z1 - 2, 1.6, 2.4, 1.6);
}

function hedges(kit, L, out, solid) {
  // Low clipped hedges against the front of an office tower.
  const north = L.front === 'n';
  const fz = north ? L.z0 : L.z1;
  const z = fz + (north ? -0.55 : 0.55);
  for (const [a, b] of [[L.x0 + 0.3, L.shop.x0 - 0.4], [L.shop.x1 + 0.4, L.x1 - 0.3]]) {
    if (b - a < 1.5) continue;
    kit.box('kerb', (a + b) / 2, SIDE + 0.2, z, b - a, 0.4, 0.9);
    kit.box('hedge', (a + b) / 2, SIDE + 0.75, z, b - a - 0.1, 0.75, 0.8);
    const bx = { x: (a + b) / 2, z, hw: (b - a) / 2, hd: 0.45, rot: 0, y0: -1, y1: 1.1 };
    solid(bx);
    out.planters.push(bx);
  }
}

function alley(kit, plan, out, solid, seed, G) {
  if (plan.alley === 'none') return;
  const X0 = plan.i * B, Z0 = plan.j * B;
  const ax0 = X0 + IN0, ax1 = X0 + IN1, az0 = Z0 + ALLEY0, az1 = Z0 + ALLEY1, cz = (az0 + az1) / 2;
  const h = (k) => hash(plan.i, plan.j, 300 + k, seed);
  out.alley = { kind: plan.alley, x0: ax0, x1: ax1, z0: az0, z1: az1 };
  if (plan.alley === 'closed') {
    for (const x of [ax0 + 0.3, ax1 - 0.3]) {
      quad(kit, 'fence', x, az0, x, az1, SIDE, 2.6, 2, 2);
      solid(rect(x - 0.06, az0, x + 0.06, az1, 2.6));
    }
  }
  // Dumpsters and bin bags against the walls.
  for (let k = 0; k < 3; k++) {
    const x = ax0 + 6 + h(k) * (ax1 - ax0 - 12), z = h(k + 3) < 0.5 ? az0 + 0.9 : az1 - 0.9;
    kit.box('dumpster', x, SIDE + 0.65, z, 2, 1.3, 1.1);
    kit.box('metal', x, SIDE + 1.33, z, 2.05, 0.06, 1.15);
    solid(rect(x - 1, z - 0.55, x + 1, z + 0.55, 1.4));
    for (let b = 0; b < 3; b++) kit.add('trash', G.bag, x + 1.4 + b * 0.5, SIDE + 0.25, z + (h(k * 3 + b + 10) - 0.5) * 0.5, 0, 0, 0, 1, 0.75, 1);
  }
  // Fire escapes on the backs of the taller buildings.
  for (const L of plan.lots) {
    if (L.type !== 'building' || L.floors < 4) continue;
    const back = L.front === 'n' ? L.z1 : L.z0;
    if (Math.abs(back - (L.front === 'n' ? az0 : az1)) > 0.5) continue;
    const dir = L.front === 'n' ? 1 : -1;
    const x = (L.x0 + L.x1) / 2;
    for (let f = 1; f <= Math.min(L.floors, 8); f++) {
      const y = GF + (f - 1) * FH;
      kit.box('metal', x, y, back + dir * 0.7, 4, 0.06, 1.3);
      kit.box('metal', x, y + 0.5, back + dir * 1.33, 4, 0.04, 0.04);
      kit.add('metal', new THREE.BoxGeometry(0.7, 0.05, 4.2), x + (f % 2 ? 1 : -1) * 1.0, y - FH / 2, back + dir * 0.7, 0, 0, (f % 2 ? 1 : -1) * 0.75);
    }
  }
  if (plan.alley === 'neon') {
    // Neon in a script you can't read, lanterns strung across, steam.
    const mats = ['neonPink', 'neonCyan', 'neonYellow'];
    for (let k = 0; k < 7; k++) {
      const x = ax0 + 8 + k * ((ax1 - ax0 - 16) / 6), side = k % 2 ? az0 + 0.25 : az1 - 0.25;
      const m = mats[Math.floor(h(20 + k) * 3)];
      const y = 3 + h(30 + k) * 3;
      kit.box('metal', x, y, side, 0.15, 2.6, 0.9);
      for (let g = 0; g < 4; g++) {
        kit.box(m, x, y + 0.9 - g * 0.6, side + (side < cz ? 0.48 : -0.48), 0.06, 0.08 + h(40 + k * 4 + g) * 0.3, 0.5 + h(60 + g + k) * 0.3);
        kit.box(m, x, y + 0.75 - g * 0.6, side + (side < cz ? 0.48 : -0.48), 0.06, 0.25, 0.08);
      }
      out.neon.push({ x, y, z: cz, color: [0xff3ac8, 0x3ae8ff, 0xffd83a][mats.indexOf(m)] });
    }
    for (let k = 0; k < 10; k++) {
      const x = ax0 + 5 + k * ((ax1 - ax0 - 10) / 9);
      kit.add('lantern', G.lanternG, x, 5.2 + Math.sin(k) * 0.3, cz, 0, 0, 0, 1, 1.3, 1);
      kit.box('metal', x, 5.6, cz, 0.02, 0.02, ALLEY1 - ALLEY0);
    }
    for (let k = 0; k < 6; k++) kit.add('metal', new THREE.CylinderGeometry(0.15, 0.15, ax1 - ax0, 8).rotateZ(Math.PI / 2), (ax0 + ax1) / 2, 2.2 + k * 0.45, k % 2 ? az0 + 0.3 : az1 - 0.3);
    out.exits.push({
      type: 'alley', x0: ax0, x1: ax1, z0: az0, z1: az1, depth: 20, target: 'level138', how: 'walk',
      warn: 'An alley lit with neon, signs in a script you can\'t read, steam rising off the pipes. It goes back further than the block should allow.',
      msg: 'You walk on under the neon, and the alley keeps going, and the buildings either side aren\'t the ones you walked in between.',
    });
  } else if (plan.alley === 'grimy') {
    for (let k = 0; k < 20; k++) kit.add('trash', G.bag, ax0 + 3 + h(70 + k) * (ax1 - ax0 - 6), SIDE + 0.2, az0 + 0.6 + h(90 + k) * (ALLEY1 - ALLEY0 - 1.2), 0, k, 0, 1, 0.6, 1);
    for (let k = 0; k < 8; k++) flatAt(kit, 'decal', ax0 + 4 + k * 9, az0 + 1 + h(110 + k) * 3, ax0 + 6.5 + k * 9, az0 + 2.4 + h(110 + k) * 3, SIDE + 0.008);
    out.exits.push({
      type: 'alley', x0: ax0, x1: ax1, z0: az0, z1: az1, depth: 20, target: 'level215', how: 'walk',
      warn: 'This alley stinks. Water drips off everything, and it\'s darker in here than it should be at any time of day.',
      msg: 'The alley narrows and bends where it shouldn\'t, and the grime gets thicker, and the street behind you is gone.',
    });
  } else {
    // A lamp over a back door.
    out.neon.push({ x: (ax0 + ax1) / 2, y: 3.5, z: cz, color: 0xffcf8a, dim: true });
  }
}

// What's in a shop you can walk into.
function furnish(kit, s, out, solid, seed, G) {
  const { x0, x1, z0, z1, kind } = s;
  const w = x1 - x0, d = z1 - z0;
  const north = s.front === 'n';
  const inward = north ? 1 : -1;
  const fz = s.fz, back = s.back;
  const cx = (x0 + x1) / 2;
  const h = (k) => hash(Math.round(x0 * 3), Math.round(z0 * 3), 400 + k, seed);
  const zAt = (f) => fz + inward * f; // f metres in from the glass
  const box = (key, x, y, f, bw, bh, bd, col = true) => {
    const z = zAt(f);
    kit.box(key, x, SIDE + y, z, bw, bh, bd);
    if (col) solid({ x, z, hw: bw / 2, hd: bd / 2, rot: 0, y0: -1, y1: SIDE + y + bh / 2 });
  };
  // A counter at the back, by the wall, leaving the middle free (and the
  // back door, if there is one).
  const counterX = s.exit ? x0 + Math.min(2.2, w * 0.25) : cx;
  const counter = () => {
    box('wood', counterX, 0.5, d - 2.2, Math.min(3, w * 0.35), 1.0, 0.7);
    kit.box('chrome', counterX + 0.4, SIDE + 1.15, zAt(d - 2.2), 0.4, 0.3, 0.3);
  };
  switch (kind) {
    case 'store':
    case 'depot':
    case 'school':
    case 'freezers': {
      const rows = Math.max(1, Math.floor((w - 2) / 2.6));
      for (let k = 0; k < rows; k++) {
        const x = x0 + 1.6 + k * ((w - 3.2) / Math.max(1, rows - 1 || 1));
        if (s.exit && Math.abs(x - cx) < 1.2) continue;
        if (kind === 'freezers') {
          box('paint', x, 0.45, d * 0.5, 1.0, 0.9, d * 0.45);
          kit.box('screen', x, SIDE + 0.92, zAt(d * 0.5), 0.9, 0.02, d * 0.43);
        } else if (kind === 'school') {
          for (let r = 0; r < 3; r++) box('wood', x, 0.38, 3 + r * 2.2, 1.1, 0.06, 0.6);
        } else {
          box('shelf', x, 0.85, d * 0.5, 0.5, 1.7, d * 0.5, true);
          quad(kit, 'goods', x - 0.26, zAt(d * 0.25), x - 0.26, zAt(d * 0.75), SIDE + 0.1, SIDE + 1.65, 2, 1.6);
          quad(kit, 'goods', x + 0.26, zAt(d * 0.75), x + 0.26, zAt(d * 0.25), SIDE + 0.1, SIDE + 1.65, 2, 1.6);
        }
      }
      if (kind === 'depot') {
        for (let k = 0; k < 4; k++) box('plank', x0 + 1 + k * 0.9, 0.35, d - 1, 0.8, 0.7, 0.8);
        box('plank', x0 + 1.4, 1.05, d - 1, 0.8, 0.7, 0.8);
      }
      if (kind === 'school') kit.box('dumpster', cx, SIDE + 1.7, back - inward * 0.05, Math.min(4, w - 2), 1.2, 0.04);
      break;
    }
    case 'cafe':
    case 'pub': {
      counter();
      const n = Math.max(1, Math.floor((w - 2) / 2.6));
      for (let k = 0; k < n; k++) for (let r = 0; r < 2; r++) {
        const x = x0 + 1.5 + k * 2.6, f = 2.5 + r * 3;
        if (s.exit && Math.abs(x - cx) < 1.3) continue;
        box('wood', x, 0.74, f, 0.9, 0.05, 0.9);
        kit.box('metal', x, SIDE + 0.37, zAt(f), 0.08, 0.74, 0.08);
        for (const dx of [-0.65, 0.65]) box('fabric', x + dx, 0.23, f, 0.4, 0.46, 0.4, false);
      }
      if (kind === 'pub') kit.box('goods', x1 - 0.2, SIDE + 1.5, zAt(d * 0.5), 0.3, 1.2, d * 0.6);
      break;
    }
    case 'arcade': {
      for (let k = 0; k < Math.floor((w - 1) / 1.1); k++) {
        const x = x0 + 0.8 + k * 1.1;
        if (s.exit && Math.abs(x - cx) < 1.2) continue;
        box('metal', x, 0.85, 1.8, 0.8, 1.7, 0.8);
        kit.add(k % 2 ? 'screenPink' : 'screen', new THREE.PlaneGeometry(0.6, 0.45), x, SIDE + 1.35, zAt(1.8) + inward * 0.41, 0, north ? 0 : Math.PI, 0);
        if (x < cx - 1.4 || x > cx + 1.4) {
          box('metal', x, 0.85, d - 1.5, 0.8, 1.7, 0.8);
          kit.add(k % 2 ? 'screen' : 'screenPink', new THREE.PlaneGeometry(0.6, 0.45), x, SIDE + 1.35, zAt(d - 1.5) - inward * 0.41, 0, north ? Math.PI : 0, 0);
        }
      }
      break;
    }
    case 'racks':
    case 'antiques':
    case 'exhibit': {
      const n = Math.max(1, Math.floor((w - 2) / 2.2));
      for (let k = 0; k < n; k++) for (let r = 0; r < 2; r++) {
        const x = x0 + 1.4 + k * 2.2, f = 3 + r * 3.5;
        if (s.exit && Math.abs(x - cx) < 1.2) continue;
        if (kind === 'racks') {
          kit.box('chrome', x, SIDE + 1.5, zAt(f), 1.4, 0.04, 0.04);
          for (let c = 0; c < 6; c++) kit.box(['fabric', 'awn1', 'awn2', 'linen', 'awn3'][Math.floor(h(k * 12 + r * 6 + c) * 5)], x - 0.6 + c * 0.24, SIDE + 1.0, zAt(f), 0.06, 1.0, 0.5);
          solid({ x, z: zAt(f), hw: 0.7, hd: 0.3, rot: 0, y0: -1, y1: 1.6 });
        } else if (kind === 'exhibit') {
          box('linen', x, 0.5, f, 0.6, 1.0, 0.6);
          kit.add('chrome', new THREE.IcosahedronGeometry(0.22, 0), x, SIDE + 1.25, zAt(f));
        } else {
          box('wood', x, 0.4 + h(k + r) * 0.4, f, 0.8 + h(k + r + 9) * 0.6, 0.8 + h(k + r) * 0.8, 0.7);
          kit.add('chrome', new THREE.SphereGeometry(0.15, 8, 6), x, SIDE + 1.3 + h(k + r) * 0.8, zAt(f));
        }
      }
      if (kind === 'antiques') box('wood', x1 - 0.5, 1.1, 2, 0.5, 2.2, 0.4); // a grandfather clock
      break;
    }
    case 'beds': {
      for (let k = 0; k < Math.floor((w - 1) / 2.4); k++) {
        const x = x0 + 1.3 + k * 2.4;
        if (s.exit && Math.abs(x - cx) < 1.5) continue;
        box('linen', x, 0.3, 4, 1.6, 0.5, 2.1);
        kit.box('paint', x, SIDE + 0.62, zAt(3.2), 1.2, 0.15, 0.4);
      }
      break;
    }
    case 'flowers': {
      for (let k = 0; k < 14; k++) {
        const x = x0 + 0.8 + h(k) * (w - 1.6), f = 1 + h(k + 20) * (d - 3);
        if (s.exit && Math.abs(x - cx) < 1) continue;
        kit.add('metal', new THREE.CylinderGeometry(0.2, 0.16, 0.4, 8).translate(0, 0.2, 0), x, SIDE, zAt(f));
        kit.add(['awn0', 'awn3', 'neonPink', 'linen'][k % 4], new THREE.IcosahedronGeometry(0.25, 0), x, SIDE + 0.6, zAt(f));
      }
      break;
    }
    case 'cinema': {
      counter();
      for (const dx of [-w * 0.3, w * 0.3]) kit.box('screenPink', cx + dx, SIDE + 1.8, back - inward * 0.04, 1.0, 1.5, 0.03);
      flat(kit, 'fabric', x0 + 0.2, Math.min(zAt(0.5), zAt(d - 0.5)), x1 - 0.2, Math.max(zAt(0.5), zAt(d - 0.5)), SIDE + 0.02, true, 2, 2);
      break;
    }
    case 'hospital':
    case 'mall': {
      counter();
      for (let k = 0; k < 6; k++) box('awn2', x0 + 1 + k * 0.6, 0.23, 2, 0.5, 0.46, 0.5, false);
      break;
    }
    case 'meg': {
      box('wood', cx - 4, 0.5, 4, 3.2, 1.0, 0.8);
      kit.box('screen', cx - 4.6, SIDE + 1.25, zAt(4), 0.6, 0.45, 0.05);
      kit.box('screen', cx - 3.4, SIDE + 1.25, zAt(4), 0.6, 0.45, 0.05);
      for (let k = 0; k < 6; k++) box('megGreen', x0 + 1 + (k % 3) * 1.1, 0.4 + Math.floor(k / 3) * 0.8, d - 1.2, 1.0, 0.8, 0.9, k < 3);
      kit.box('paint', cx + 3.5, SIDE + 1.7, back - inward * 0.05, 3.6, 1.6, 0.04);
      break;
    }
    case 'laundry': {
      for (let k = 0; k < Math.floor((w - 1) / 1.0); k++) {
        const x = x0 + 0.7 + k * 1.0;
        box('paint', x, 0.45, d - 1, 0.85, 0.9, 0.75);
        kit.add('decal', new THREE.CircleGeometry(0.25, 14), x, SIDE + 0.5, zAt(d - 1) - inward * 0.38, 0, north ? Math.PI : 0, 0);
      }
      box('wood', cx, 0.4, d * 0.45, Math.min(3, w - 2), 0.06, 0.6);
      break;
    }
    case 'gym': {
      for (let k = 0; k < 4; k++) {
        const x = x0 + 1.2 + h(k) * (w - 2.4), f = 2 + k * 2;
        box('metal', x, 0.25, f, 0.4, 0.5, 1.4);
        kit.box('chrome', x, SIDE + 1.0, zAt(f), 1.6, 0.04, 0.04);
      }
      break;
    }
    case 'chairs': {
      for (let k = 0; k < Math.floor((w - 1) / 1.5); k++) {
        const x = x0 + 1 + k * 1.5;
        box('fabric', x, 0.4, 2.5, 0.7, 0.8, 0.7);
        kit.box('chrome', x, SIDE + 1.6, back - inward * 0.04, 0.6, 0.9, 0.02);
      }
      break;
    }
    case 'empty':
      break;
    case 'office':
    case 'counter':
    default: {
      counter();
      for (let k = 0; k < 3; k++) {
        const x = x0 + 1.2 + h(k) * (w - 2.4), f = 2 + h(k + 5) * (d - 5);
        if (s.exit && Math.abs(x - cx) < 1.2) continue;
        box('wood', x, 0.74, f, 1.4, 0.05, 0.7);
        box('fabric', x, 0.23, f + 0.7, 0.45, 0.46, 0.45, false);
      }
    }
  }
}

function megOutside(kit, plan, out, solid) {
  const L = plan.lots[0];
  const fz = L.z0;
  const mid = (L.shop.x0 + L.shop.x1) / 2;
  // Sandbags either side of the entrance, flags, floodlights.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) kit.box('sandbag', mid + side * (4 + k * 0.8), SIDE + 0.25, fz - 2.4, 0.75, 0.5, 0.5);
    for (let k = 0; k < 5; k++) kit.box('sandbag', mid + side * (4.4 + k * 0.8), SIDE + 0.72, fz - 2.4, 0.75, 0.45, 0.5);
    solid(rect(mid + side * 3.6 - (side < 0 ? 4.8 : 0), fz - 2.7, mid + side * 3.6 + (side > 0 ? 4.8 : 0), fz - 2.1, 1));
    const px = mid + side * 10;
    kit.add('pole', new THREE.CylinderGeometry(0.06, 0.06, 9, 6).translate(0, 4.5, 0), px, SIDE, fz - 1.2);
    kit.add('flagMeg', new THREE.PlaneGeometry(2.2, 1.4), px + 1.15, SIDE + 8.1, fz - 1.2, 0, 0, 0);
    kit.box('metal', mid + side * 14, SIDE + 3, fz - 1.5, 0.2, 6, 0.2);
    kit.box('lampHead', mid + side * 14, SIDE + 6, fz - 1.7, 0.8, 0.5, 0.4);
    out.lamps.push({ x: mid + side * 14, y: SIDE + 5.8, z: fz - 2.2, bright: true });
  }
}

function timesStalls(kit, plan, out, solid) {
  const X0 = plan.i * B, Z0 = plan.j * B;
  const cx = X0 + (R + B) / 2, cz = Z0 + (R + B) / 2;
  // B.N.T.G. trading posts in a ring round the statue.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const x = cx + Math.cos(a) * 18, z = cz + Math.sin(a) * 18;
    const face = Math.atan2(cx - x, cz - z);
    kit.add('wood', new THREE.BoxGeometry(2.6, 1.0, 1.0).translate(0, 0.5, 0), x, SIDE, z, 0, face, 0);
    for (const dx of [-1.25, 1.25]) kit.add('metal', new THREE.BoxGeometry(0.06, 2.6, 0.06).translate(0, 1.3, 0), x + Math.cos(face) * dx, SIDE, z - Math.sin(face) * dx, 0, face, 0);
    kit.add(`awn${k % 4}`, new THREE.PlaneGeometry(2.9, 1.6), x + Math.sin(face) * 0.3, SIDE + 2.5, z + Math.cos(face) * 0.3, -1.3, face, 0);
    for (let c = 0; c < 3; c++) kit.add('plank', new THREE.BoxGeometry(0.5, 0.4, 0.5).translate(0, 0.2, 0), x - Math.sin(face) * 1.0 + Math.cos(face) * (c - 1) * 0.7, SIDE, z - Math.cos(face) * 1.0 - Math.sin(face) * (c - 1) * 0.7, 0, face + c, 0);
    solid({ x, z, hw: 1.4, hd: 1.4, rot: 0, y0: -1, y1: 1.2 });
    out.stalls.push({ x: x + Math.sin(face) * 1.3, z: z + Math.cos(face) * 1.3, k });
  }
  // Strings of bulbs from the screen towers to the middle.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let s = 1; s < 12; s++) {
      const r = s * 3.2;
      kit.add('neonYellow', new THREE.SphereGeometry(0.09, 5, 4), cx + Math.cos(a) * r, SIDE + 7.5 - Math.sin((s / 12) * Math.PI) * 1.6, cz + Math.sin(a) * r);
    }
  }
  out.neon.push({ x: cx, y: 7, z: cz, color: 0xffd890 });
}
