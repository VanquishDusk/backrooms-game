import * as THREE from 'three';
import { mergeGeometries } from '../../world/props.js';
import {
  carpetTexture, wallpaperTexture, mahoganyTexture, stripedFabricTexture, concreteWallTexture,
  pipeTexture, stoneBlockTexture, guestDoorTexture,
} from '../../world/textures.js';
import { CEILING, ROOM_Y, WAVES } from './layout.js';

// Everything in Level 7 you can see: the flooded room, the pillar it's
// in, the sea, the ceiling, the sea floor and what lies on it, the Level 9
// door, the cave, Fort Surrender and the boat.

// Room interior, in world space (the floor is at ROOM_Y).
export const ROOM = { x0: -3, x1: 3, z0: -3.5, z1: 3.5, h: 2.7 };
export const PILLAR = { x0: -7, x1: 7, z0: -3.8, z1: 10 };
export const DOOR_W = 1.0;

// ---- Small geometry helpers -------------------------------------------------------

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

// A geometry moved into place (and dropped of any non-standard attributes).
function put(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ')), tmpS.set(sx, sy, sz));
  geo.applyMatrix4(tmpM);
  return geo;
}

// A box whose UVs repeat every `tile` metres, so huge concrete faces aren't stretched.
function tiledBox(x0, y0, z0, x1, y1, z1, tile) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, (uv.getX(i) * dims[f][0] + x0 + z0) / tile, (uv.getY(i) * dims[f][1] + y0) / tile);
  }
  return put(g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noisy(ctx, S, base, spots) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (const [rgb, n, a, r] of spots) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(${rgb},${(Math.random() * a).toFixed(3)})`;
      const s = Math.random() * r + 0.5;
      ctx.beginPath();
      ctx.arc(Math.random() * S, Math.random() * S, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- Textures and materials -------------------------------------------------------------

export function buildMaterials(renderer, own) {
  const tex = (t) => {
    own.textures.push(t);
    return t;
  };
  const T = {
    concrete: tex(concreteWallTexture(renderer, { base: '#8c8b84' })),
    ceiling: tex(canvas(256, (ctx, S) => {
      noisy(ctx, S, '#77766f', [['40,40,36', 300, 0.25, 18], ['230,230,220', 200, 0.08, 10], ['30,30,28', 3000, 0.25, 1.2]]);
      ctx.fillStyle = 'rgba(30,30,28,0.45)';
      ctx.fillRect(0, 0, S, 3);
      ctx.fillRect(0, 0, 3, S);
    })),
    silt: tex(canvas(256, (ctx, S) => noisy(ctx, S, '#cfcab8', [['80,76,60', 260, 0.18, 14], ['255,255,240', 200, 0.12, 6], ['60,56,44', 4000, 0.25, 1.1]]))),
    wallpaper: tex(wallpaperTexture(renderer, '#a6a487')),
    carpet: tex(carpetTexture(renderer, '#6e5a44')),
    wood: tex(mahoganyTexture(renderer, '#5c3418')),
    fabric: tex(stripedFabricTexture(renderer)),
    rust: tex(pipeTexture(renderer, 'rust')),
    stone: tex(stoneBlockTexture(renderer)),
    door: tex(guestDoorTexture(renderer, '#5a3418')),
    hull: tex(canvas(256, (ctx, S) => {
      noisy(ctx, S, '#c9cfc9', [['60,70,70', 120, 0.25, 10], ['110,80,50', 60, 0.5, 7]]);
      for (let y = 0; y < S; y += S / 8) {
        ctx.fillStyle = 'rgba(40,50,50,0.45)';
        ctx.fillRect(0, y, S, 2);
      }
      // Paint flaking off to bare wood.
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(${110 + Math.random() * 30},${70 + Math.random() * 20},40,0.85)`;
        ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 14, 1 + Math.random() * 4);
      }
    })),
    plank: tex(canvas(128, (ctx, S) => {
      noisy(ctx, S, '#7a5a3a', [['40,25,10', 400, 0.3, 2], ['200,160,110', 100, 0.15, 3]]);
      for (let y = 0; y < S; y += 3) {
        ctx.fillStyle = `rgba(40,25,10,${(Math.random() * 0.2).toFixed(2)})`;
        ctx.fillRect(0, y, S, 1);
      }
    })),
    tin: tex(canvas(128, (ctx, S) => {
      for (let x = 0; x < S; x++) {
        const v = 110 + Math.sin((x / S) * Math.PI * 16) * 30;
        ctx.fillStyle = `rgb(${v * 0.95},${v * 0.92},${v * 0.86})`;
        ctx.fillRect(x, 0, 1, S);
      }
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(120,60,20,${Math.random() * 0.6})`;
        ctx.beginPath();
        ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 9, 0, Math.PI * 2);
        ctx.fill();
      }
    })),
    sign: tex(canvas(256, (ctx, S) => {
      ctx.fillStyle = '#6a5a40';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(30,20,10,0.4)';
      for (let y = 0; y < S; y += S / 5) ctx.fillRect(0, y, S, 3);
      ctx.fillStyle = '#e8e0d0';
      ctx.font = 'bold 34px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FORT', S / 2, 62);
      ctx.fillText('SURRENDER', S / 2, 104);
      ctx.fillStyle = '#c03020';
      ctx.font = 'bold 40px monospace';
      ctx.fillText('TURN BACK', S / 2, 170);
      ctx.font = 'bold 22px monospace';
      ctx.fillText('NO WANDERERS', S / 2, 214);
    })),
  };
  T.concrete.repeat.set(1, 1);
  T.door.wrapS = T.door.wrapT = THREE.ClampToEdgeWrapping;
  T.sign.wrapS = T.sign.wrapT = THREE.ClampToEdgeWrapping;
  const mat = (opts) => {
    const m = new THREE.MeshLambertMaterial(opts);
    own.mats.push(m);
    return m;
  };
  return {
    T,
    concrete: mat({ map: T.concrete }),
    ceiling: mat({ map: T.ceiling, side: THREE.DoubleSide }),
    floor: mat({ map: T.silt, vertexColors: true }),
    wallpaper: mat({ map: T.wallpaper }),
    carpet: mat({ map: T.carpet }),
    wood: mat({ map: T.wood }),
    fabric: mat({ map: T.fabric, color: 0xa86050 }),
    roomCeil: mat({ color: 0xc9c3ad }),
    rust: mat({ map: T.rust }),
    rustDark: mat({ map: T.rust, color: 0x8a7a70 }),
    stone: mat({ map: T.stone, color: 0x9aa0a0 }),
    door: mat({ map: T.door }),
    bone: mat({ color: 0xcfc6ac }),
    rock: mat({ map: T.silt, color: 0x77746a }),
    hull: mat({ map: T.hull, side: THREE.DoubleSide }),
    plank: mat({ map: T.plank }),
    tin: mat({ map: T.tin, side: THREE.DoubleSide }),
    sign: mat({ map: T.sign }),
    iron: mat({ color: 0x3a3c3e }),
    rope: mat({ color: 0x9a8a60 }),
    leaf: mat({ color: 0x3e5a2a, side: THREE.DoubleSide }),
    pot: mat({ color: 0x8a4a2a }),
    paper: mat({ color: 0xd8d2c0 }),
    cloth: mat({ color: 0xd8d4c8, side: THREE.DoubleSide }),
    books: mat({ vertexColors: true }),
    black: (() => {
      const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
      own.mats.push(m);
      return m;
    })(),
  };
}

// ---- The entrance room and its pillar ---------------------------------------------------

export function buildPillarAndRoom(M, rng) {
  const g = new THREE.Group();
  const P = PILLAR, R = ROOM, Y = ROOM_Y, H = ROOM_Y + R.h;
  const TOP = CEILING + 1, BOT = -40;
  const dh = 2.1;
  // The pillar, with the room hollowed out of it.
  const parts = [
    tiledBox(P.x0, BOT, P.z0, P.x1, Y, P.z1, 6),
    tiledBox(P.x0, H, P.z0, P.x1, TOP, 3.5, 6),
    tiledBox(P.x0, 20.5, 3.5, P.x1, TOP, P.z1, 6),
    tiledBox(P.x0, Y, P.z0, R.x0, H, 3.5, 6),
    tiledBox(R.x1, Y, P.z0, P.x1, H, 3.5, 6),
    tiledBox(P.x0, Y, 3.5, -0.62, 20.5, P.z1, 6),
    tiledBox(0.62, Y, 3.5, P.x1, 20.5, P.z1, 6),
    tiledBox(-0.62, 18.9, 9.2, 0.62, 20.5, P.z1, 6),
    tiledBox(R.x0, Y, P.z0, -DOOR_W / 2, H, R.z0, 6),
    tiledBox(DOOR_W / 2, Y, P.z0, R.x1, H, R.z0, 6),
    tiledBox(-DOOR_W / 2, Y + dh, P.z0, DOOR_W / 2, H, R.z0, 6),
  ];
  g.add(new THREE.Mesh(mergeGeometries(parts), M.concrete));
  for (const p of parts) p.dispose();

  // Inside: wallpaper over the concrete, a carpet, a low ceiling.
  const inset = 0.02;
  const wall = (w, h, x, y, z, ry) => {
    const geo = new THREE.PlaneGeometry(w, h);
    geo.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 ? v * h / 2.2 : v * w / 2.2));
    return put(geo, x, y, z, 0, ry);
  };
  const walls = [
    wall(R.z1 - R.z0, R.h, R.x0 + inset, Y + R.h / 2, 0, Math.PI / 2),
    wall(R.z1 - R.z0, R.h, R.x1 - inset, Y + R.h / 2, 0, -Math.PI / 2),
  ];
  // Front wall (doorway) and back wall (stairwell), each in three pieces.
  for (const [z, ry, gap] of [[R.z0 + inset, 0, DOOR_W / 2], [R.z1 - inset, Math.PI, 0.62]]) {
    const side = (R.x1 - R.x0) / 2 - gap;
    walls.push(wall(side, R.h, R.x0 + side / 2, Y + R.h / 2, z, ry));
    walls.push(wall(side, R.h, R.x1 - side / 2, Y + R.h / 2, z, ry));
    walls.push(wall(gap * 2, R.h - dh, 0, Y + dh + (R.h - dh) / 2, z, ry));
  }
  g.add(new THREE.Mesh(mergeGeometries(walls), M.wallpaper));
  const carpet = put(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), 0, Y + 0.005, 0, -Math.PI / 2);
  carpet.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 3));
  g.add(new THREE.Mesh(carpet, M.carpet));
  g.add(new THREE.Mesh(put(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), 0, H - 0.005, 0, Math.PI / 2), M.roomCeil));

  // Skirting and a door frame.
  const trim = [];
  for (const [x0, z0, x1, z1] of [[R.x0, R.z0, R.x0 + 0.03, R.z1], [R.x1 - 0.03, R.z0, R.x1, R.z1]]) trim.push(tiledBox(x0, Y, z0, x1, Y + 0.12, z1, 1));
  for (const s of [-1, 1]) trim.push(tiledBox(s * DOOR_W / 2 - 0.05, Y, R.z0, s * DOOR_W / 2 + 0.05, Y + dh + 0.06, R.z0 + 0.05, 1));
  trim.push(tiledBox(-DOOR_W / 2 - 0.05, Y + dh, R.z0, DOOR_W / 2 + 0.05, Y + dh + 0.08, R.z0 + 0.05, 1));
  // The door itself, swung wide open into the room.
  // (The leaf's geometry starts at its hinge, x = 0.)
  const leaf = new THREE.BoxGeometry(DOOR_W - 0.04, dh - 0.02, 0.04).translate((DOOR_W - 0.04) / 2, Y + dh / 2, 0);
  const doorMesh = new THREE.Mesh(leaf, M.door);
  doorMesh.position.set(-DOOR_W / 2 + 0.02, 0, R.z0 + 0.06);
  doorMesh.rotation.y = -1.75;
  g.add(doorMesh);
  g.add(new THREE.Mesh(mergeGeometries(trim), M.wood));

  // The stairs back up to Level 6, climbing into darkness.
  const steps = [];
  for (let k = 0; k < 18; k++) steps.push(tiledBox(-0.62, Y, 3.5 + k * 0.3, 0.62, Y + 0.25 * (k + 1), 3.8 + k * 0.3, 1));
  g.add(new THREE.Mesh(mergeGeometries(steps), M.concrete));
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 3), M.black);
  dark.position.set(0, Y + 4.6, 9.15);
  dark.rotation.y = Math.PI;
  g.add(dark);

  // Furniture, like a living room someone left as the water came in.
  const wood = [], fabric = [], paper = [], leaf2 = [], pots = [];
  const solids = [];
  const box = (list, x0, y0, z0, x1, y1, z1, solid = false) => {
    list.push(tiledBox(x0, Y + y0, z0, x1, Y + y1, z1, 0.8));
    if (solid) solids.push({ x0, z0, x1, z1 });
  };
  // Bookcase on the left wall.
  box(wood, -3, 0, -1.6, -2.95, 2.05, 0.4, true);
  box(wood, -3, 0, -1.6, -2.6, 2.05, -1.55);
  box(wood, -3, 0, 0.35, -2.6, 2.05, 0.4);
  box(wood, -3, 2.0, -1.6, -2.6, 2.05, 0.4);
  solids.push({ x0: -3, z0: -1.6, x1: -2.6, z1: 0.4 });
  const bookColors = [];
  for (const y of [0.08, 0.55, 1.02, 1.49]) {
    box(wood, -2.95, y, -1.55, -2.6, y + 0.03, 0.35);
    let z = -1.55;
    while (z < 0.32) {
      const w = rng.range(0.03, 0.07), h = rng.range(0.24, 0.4);
      if (rng.chance(0.12)) {
        z += rng.range(0.05, 0.2);
        continue;
      }
      paper.push(put(new THREE.BoxGeometry(rng.range(0.18, 0.26), h, w), -2.78, Y + y + 0.03 + h / 2, z + w / 2, rng.chance(0.15) ? 0.3 : 0));
      bookColors.push(rng.pick([0x7a2a20, 0x2a3a5a, 0x3a5a3a, 0x6a5a30, 0x4a2a3a, 0x8a7a60]));
      z += w + 0.004;
    }
  }
  // Coffee table, a mug, a stack of magazines.
  box(wood, -0.7, 0.4, -0.6, 0.7, 0.45, 0.15, true);
  for (const [x, z] of [[-0.64, -0.54], [0.64, -0.54], [-0.64, 0.09], [0.64, 0.09]]) box(wood, x - 0.03, 0, z - 0.03, x + 0.03, 0.4, z + 0.03);
  box(paper, -0.4, 0.45, -0.4, -0.05, 0.5, -0.12);
  paper.push(put(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), 0.3, Y + 0.5, -0.2));
  // Armchair, facing the table.
  box(fabric, 0.9, 0.1, 1.0, 1.75, 0.45, 1.8, true);
  box(fabric, 0.9, 0.45, 1.6, 1.75, 1.05, 1.8);
  box(fabric, 0.85, 0.1, 1.0, 0.98, 0.7, 1.8);
  box(fabric, 1.67, 0.1, 1.0, 1.8, 0.7, 1.8);
  // Chests of drawers stacked against the right wall, as if dragged up out of the water.
  box(wood, 2.35, 0, -2.2, 3, 0.9, -0.8, true);
  box(wood, 2.4, 0.9, -2.0, 3, 1.55, -0.95);
  box(wood, 2.3, 1.55, -2.1, 3, 1.62, -0.85);
  for (const [y0, y1, z0, z1] of [[0.1, 0.4, -2.15, -0.85], [0.48, 0.82, -2.15, -0.85], [1.0, 1.25, -1.95, -1.0], [1.3, 1.5, -1.95, -1.0]]) {
    box(paper, 2.33, y0, z0 + 0.04, 2.36, y1, z1 - 0.04);
  }
  // Potted plants and a vase on top.
  const plant = (x, y, z, s) => {
    pots.push(put(new THREE.CylinderGeometry(0.13 * s, 0.1 * s, 0.22 * s, 10), x, Y + y + 0.11 * s, z));
    for (let k = 0; k < 7; k++) {
      const geo = new THREE.PlaneGeometry(0.12 * s, 0.42 * s);
      geo.translate(0, 0.21 * s, 0);
      leaf2.push(put(geo, x, Y + y + 0.2 * s, z, rng.range(-0.7, 0.7), (k / 7) * Math.PI * 2, rng.range(-0.3, 0.3)));
    }
  };
  plant(2.65, 1.62, -1.75, 1.2);
  plant(2.7, 1.62, -1.2, 0.8);
  plant(-2.3, 0, 2.9, 1.6);
  pots.push(put(new THREE.CylinderGeometry(0.06, 0.09, 0.32, 10), 2.7, Y + 1.78, -0.98));
  // A side table and a lamp-less shelf in the back corner.
  box(wood, 2.2, 0, 2.6, 2.95, 0.7, 3.45, true);
  box(paper, 2.4, 0.7, 2.8, 2.7, 0.76, 3.2);

  const books = new THREE.Mesh(mergeGeometries(paper.splice(0, bookColors.length)), M.paper);
  // Colour the spines per book through vertex colours.
  {
    const geo = books.geometry;
    const col = new Float32Array(geo.attributes.position.count * 3);
    const per = 24;
    const c = new THREE.Color();
    for (let b = 0; b < bookColors.length; b++) {
      c.setHex(bookColors[b]);
      for (let v = 0; v < per; v++) col.set([c.r, c.g, c.b], (b * per + v) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    books.material = M.books;
  }
  g.add(books);
  g.add(new THREE.Mesh(mergeGeometries(wood), M.wood));
  g.add(new THREE.Mesh(mergeGeometries(fabric), M.fabric));
  g.add(new THREE.Mesh(mergeGeometries(paper), M.paper));
  g.add(new THREE.Mesh(mergeGeometries(leaf2), M.leaf));
  g.add(new THREE.Mesh(mergeGeometries(pots), M.pot));

  // The fluorescent lamp.
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.25), M.iron);
  fixture.position.set(0, H - 0.04, 0.2);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xf0f4e8 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.18, 8), tubeMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, H - 0.085, 0.2);
  g.add(fixture, tube);
  const lamp = new THREE.PointLight(0xe8f0dc, 2.6, 9, 1.4);
  lamp.position.set(0, H - 0.5, 0.2);
  g.add(lamp);

  // A few centimetres of water over the carpet.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x5a6a60, transparent: true, opacity: 0.42, shininess: 90, specular: 0x9aa8a0, depthWrite: false }),
  );
  pool.position.set(0, Y + 0.06, 0);
  g.add(pool);

  return { group: g, solids, lamp, tube: tubeMat, pool, door: doorMesh };
}

// ---- The sea, the ceiling, the floor --------------------------------------------------------

const WATER_VERT = /* glsl */ `
uniform float time;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  ${WAVES.slice(0, 2).map(([a, kx, kz, w]) => `wp.y += ${a.toFixed(3)} * sin(${kx.toFixed(4)} * wp.x + ${kz.toFixed(4)} * wp.z + ${w.toFixed(3)} * time);`).join('\n  ')}
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */ `
uniform float time;
uniform vec3 deep;
uniform vec3 sky;
uniform vec3 under;
uniform float opacity;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  float dx = 0.0, dz = 0.0, c;
  ${WAVES.map(([a, kx, kz, w]) => `c = ${a.toFixed(3)} * cos(${kx.toFixed(4)} * vWorld.x + ${kz.toFixed(4)} * vWorld.z + ${w.toFixed(3)} * time); dx += c * ${kx.toFixed(4)}; dz += c * ${kz.toFixed(4)};`).join('\n  ')}
  // Fine chop.
  dx += 0.05 * sin(1.7 * vWorld.x + 0.6 * vWorld.z + 2.3 * time) + 0.03 * sin(3.1 * vWorld.z - 2.9 * time);
  dz += 0.05 * sin(1.3 * vWorld.z - 0.8 * vWorld.x + 1.9 * time) + 0.03 * sin(2.7 * vWorld.x + 3.3 * time);
  vec3 n = normalize(vec3(-dx, 1.0, -dz));
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 col;
  float alpha = 1.0;
  if (gl_FrontFacing) {
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    col = mix(deep, sky, 0.08 + 0.8 * fres);
    vec3 h = normalize(v + normalize(vec3(0.2, 1.0, 0.35)));
    col += pow(max(dot(n, h), 0.0), 120.0) * 0.22 * sky;
    alpha = mix(opacity, 1.0, fres);
  } else {
    // From below: a bright window straight up, a dark mirror at an angle.
    float up = max(dot(-n, v), 0.0);
    col = mix(under * 0.25, under * 1.7, smoothstep(0.62, 0.86, up));
    col += under * 0.6 * pow(max(sin(vWorld.x * 0.9 + time * 1.3) * sin(vWorld.z * 0.8 - time * 1.1), 0.0), 6.0) * smoothstep(0.6, 0.9, up);
  }
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

export function buildWater(own) {
  const geo = new THREE.PlaneGeometry(1400, 1400, 175, 175).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: new THREE.Color(0x14201f) },
        sky: { value: new THREE.Color(0x6c787c) },
        under: { value: new THREE.Color(0x4a8088) },
        opacity: { value: 0.86 },
      },
    ]),
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    fog: true,
    transparent: true,
    side: THREE.DoubleSide,
  });
  own.mats.push(mat);
  own.geos.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

export function buildCeiling(M, own) {
  const geo = new THREE.PlaneGeometry(3000, 3000).rotateX(Math.PI / 2);
  geo.attributes.uv.array.forEach((v, i, a) => (a[i] = v * 250));
  own.geos.push(geo);
  const m = new THREE.Mesh(geo, M.ceiling);
  m.position.y = CEILING;
  return m;
}

export function buildFloor(M, L, own) {
  const N = 175, S = 1400;
  const geo = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = L.floorY(x, z);
    pos.setY(i, y);
    uv.setXY(i, x / 7, z / 7);
    let c;
    if (y > 0.6) c = [0.42, 0.4, 0.36];
    else if (y > -20) c = [0.62, 0.6, 0.54];
    else if (y > -40) c = [0.46, 0.46, 0.42];
    else c = [0.32, 0.33, 0.32];
    col.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  own.geos.push(geo);
  return new THREE.Mesh(geo, M.floor);
}

// Concrete pillars and the giant pipes, all from the floor to the ceiling.
export function buildPillars(M, L, own) {
  const g = new THREE.Group();
  const parts = [];
  for (const p of L.pillars) {
    const box = tiledBox(-p.w / 2, -60, -p.d / 2, p.w / 2, CEILING + 1, p.d / 2, 6);
    put(box, p.x, 0, p.z, 0, p.rot);
    parts.push(box);
  }
  if (parts.length) {
    const geo = mergeGeometries(parts);
    own.geos.push(geo);
    g.add(new THREE.Mesh(geo, M.concrete));
  }
  const pipes = [];
  for (const p of L.pipes) {
    const geo = new THREE.CylinderGeometry(p.r, p.r, CEILING + 40, 18, 1, true);
    geo.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 ? v * 20 : v * 3));
    pipes.push(put(geo, p.x, CEILING - (CEILING + 40) / 2 + 1, p.z));
    // Flanges every so often.
    for (let y = -26; y < CEILING; y += 9) pipes.push(put(new THREE.CylinderGeometry(p.r + 0.18, p.r + 0.18, 0.4, 18), p.x, y, p.z));
  }
  if (pipes.length) {
    const geo = mergeGeometries(pipes);
    own.geos.push(geo);
    g.add(new THREE.Mesh(geo, M.rust));
  }
  return g;
}

// The Level 9 door: a wooden door standing on an underwater stone platform,
// among stone columns and the giant pipes.
export function buildDoorPlatform(M, L, own) {
  const g = new THREE.Group();
  const d = L.door;
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.rot;
  const top = d.y;
  const stone = [
    tiledBox(-8, top - 6, -8, 8, top, 8, 2),
    tiledBox(-9, top - 6, -9, 9, top - 4.5, 9, 2),
  ];
  for (const [x, z, h] of [[-6.5, -6.5, 9], [6.5, -6.5, 6.2], [-6.5, 6.5, 10], [6.5, 6.5, 3.4]]) {
    stone.push(put(new THREE.CylinderGeometry(0.8, 0.9, h, 12), x, top + h / 2, z));
    stone.push(put(new THREE.BoxGeometry(2, 0.5, 2), x, top + 0.25, z));
  }
  g.add(new THREE.Mesh(mergeGeometries(stone), M.stone));
  // Pipes lying across the platform.
  const pipes = [];
  for (const [x, z, ry, r] of [[-7.4, 0, 0, 0.7], [0, 7.4, Math.PI / 2, 0.9], [7.6, 1, 0.1, 0.5]]) {
    pipes.push(put(new THREE.CylinderGeometry(r, r, 22, 14), x, top + r, z, Math.PI / 2, ry));
  }
  g.add(new THREE.Mesh(mergeGeometries(pipes), M.rustDark));
  // The door, in its own frame, closed.
  const frame = [
    tiledBox(-0.62, top, -0.1, -0.5, top + 2.25, 0.1, 1),
    tiledBox(0.5, top, -0.1, 0.62, top + 2.25, 0.1, 1),
    tiledBox(-0.62, top + 2.13, -0.1, 0.62, top + 2.25, 0.1, 1),
  ];
  g.add(new THREE.Mesh(mergeGeometries(frame), M.wood));
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.12, 0.05), M.door);
  leaf.position.set(0, top + 1.07, 0);
  g.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb08a3a }));
  knob.position.set(0.38, top + 1.0, -0.06);
  g.add(knob);
  own.mats.push(knob.material);
  // Warm light under the door, from somewhere that isn't here.
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  own.mats.push(glowMat);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.03), glowMat);
  glow.position.set(0, top + 0.015, -0.08);
  glow.rotation.y = Math.PI;
  g.add(glow);
  const light = new THREE.PointLight(0xffb070, 3, 16, 1.5);
  light.position.set(0, top + 0.6, -1.2);
  g.add(light);
  // Front of the door (the side you open it from), in world space.
  const fx = d.x + Math.sin(d.rot) * -0.7, fz = d.z + Math.cos(d.rot) * -0.7;
  return { group: g, front: { x: fx, z: fz, y: top + 1.1 }, light };
}

// The underwater cave into Level 8, at the mountain's foot.
export function buildCave(M, L, own) {
  const c = L.cave;
  const g = new THREE.Group();
  g.position.set(c.x, c.y, c.z);
  g.rotation.y = -c.rot + Math.PI / 2;
  const arch = new THREE.Mesh(new THREE.TorusGeometry(6, 2.4, 8, 18, Math.PI), M.rock);
  arch.position.y = 0;
  g.add(arch);
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(6, 5, 40, 16, 1, true, 0, Math.PI), M.black);
  tunnel.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  tunnel.position.set(0, 0, -20);
  tunnel.material = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  own.mats.push(tunnel.material);
  g.add(tunnel);
  const back = new THREE.Mesh(new THREE.CircleGeometry(6.2, 18, 0, Math.PI), M.black);
  back.position.z = -0.6;
  g.add(back);
  // Boulders heaped around the mouth.
  const rocks = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 13) * Math.PI;
    rocks.push(put(new THREE.IcosahedronGeometry(1, 0), Math.cos(a) * 8.5, Math.sin(a) * 7 - 1, 1, k, k * 2, 0, 1.4 + (k % 3) * 0.8));
  }
  g.add(new THREE.Mesh(mergeGeometries(rocks), M.rock));
  return { group: g, mouth: { x: c.x, y: c.y + 2, z: c.z } };
}

// Fort Surrender: shacks, a palisade and a watchtower on a rocky island. They
// fly a white flag, and shoot at anyone who comes close.
export function buildFort(M, L, rng, own) {
  const g = new THREE.Group();
  const f = L.fort;
  const at = (x, z) => L.floorY(f.x + x, f.z + z);
  const logs = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    if (Math.abs(Math.sin(a * 0.5 - 0.3)) < 0.08) continue; // the gate
    const x = Math.cos(a) * 15, z = Math.sin(a) * 15, h = rng.range(3.2, 4);
    logs.push(put(new THREE.CylinderGeometry(0.22, 0.26, h, 6), f.x + x, at(x, z) + h / 2 - 0.3, f.z + z, rng.range(-0.05, 0.05), 0, rng.range(-0.05, 0.05)));
  }
  g.add(new THREE.Mesh(mergeGeometries(logs), M.plank));
  const tin = [], wood = [];
  const shacks = [];
  for (const [x, z, ry] of [[-5, 3, 0.4], [4, 5, -0.3], [2, -6, 1.2]]) {
    const y = at(x, z);
    const s = new THREE.Group();
    s.position.set(f.x + x, y, f.z + z);
    s.rotation.y = ry;
    for (const [w, d, px, pz] of [[4, 0.06, 0, -2.5], [4, 0.06, 0, 2.5], [0.06, 5, -2, 0], [0.06, 5, 2, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), M.tin);
      m.position.set(px, 1.3, pz);
      s.add(m);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.06, 5.6), M.tin);
    roof.position.set(0, 2.75, 0);
    roof.rotation.z = 0.12;
    s.add(roof);
    g.add(s);
    shacks.push(s);
  }
  // The watchtower, where the shooting comes from.
  const tx = -2, tz = -2, ty = at(tx, tz);
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) wood.push(put(new THREE.BoxGeometry(0.2, 8, 0.2), f.x + tx + x, ty + 4, f.z + tz + z));
  wood.push(put(new THREE.BoxGeometry(3.2, 0.15, 3.2), f.x + tx, ty + 7.2, f.z + tz));
  for (const s of [-1, 1]) {
    wood.push(put(new THREE.BoxGeometry(3.2, 1, 0.08), f.x + tx, ty + 7.8, f.z + tz + s * 1.55));
    wood.push(put(new THREE.BoxGeometry(0.08, 1, 3.2), f.x + tx + s * 1.55, ty + 7.8, f.z + tz));
  }
  g.add(new THREE.Mesh(mergeGeometries(wood), M.plank));
  const troof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), M.tin);
  troof.position.set(f.x + tx, ty + 9.9, f.z + tz);
  troof.rotation.y = Math.PI / 4;
  g.add(troof);
  // The flag: white.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), M.iron);
  pole.position.set(f.x + tx, ty + 12, f.z + tz);
  const flagGeo = new THREE.PlaneGeometry(1.8, 1.1, 8, 1);
  flagGeo.translate(0.9, 0, 0);
  const flag = new THREE.Mesh(flagGeo, M.cloth);
  flag.position.set(f.x + tx, ty + 14.3, f.z + tz);
  g.add(pole, flag);
  // A sign facing the way in.
  const toO = Math.atan2(-f.x, -f.z);
  const sx = Math.sin(toO) * 19, sz = Math.cos(toO) * 19;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), M.sign);
  sign.position.set(f.x + sx, at(sx, sz) + 2.4, f.z + sz);
  sign.rotation.y = toO;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 0.2), M.plank);
  post.position.set(f.x + sx, at(sx, sz) + 0.9, f.z + sz);
  g.add(sign, post);
  // Lanterns.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  own.mats.push(lampMat);
  for (const [x, z, y] of [[tx, tz, 7.6], [-5, 3, 2.3], [4, 5, 2.3]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lampMat);
    b.position.set(f.x + x, at(x, z) + y, f.z + z);
    g.add(b);
  }
  const light = new THREE.PointLight(0xffa040, 8, 40, 1.4);
  light.position.set(f.x + tx, ty + 7.8, f.z + tz);
  g.add(light);
  const flash = new THREE.PointLight(0xfff0c0, 0, 30, 1.5);
  flash.position.set(f.x + tx, ty + 8, f.z + tz);
  g.add(flash);
  return { group: g, flag, flagGeo, light, flash, gun: { x: f.x + tx, y: ty + 8, z: f.z + tz } };
}

// ---- What lies on the sea floor -------------------------------------------------------

export function skeletonGeo() {
  const parts = [];
  parts.push(put(new THREE.SphereGeometry(0.11, 8, 6), 0, 0.09, 0.82, 0, 0, 0, 1, 0.9, 1.1));
  parts.push(put(new THREE.BoxGeometry(0.08, 0.05, 0.1), 0, 0.05, 0.94));
  parts.push(put(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5), 0, 0.06, 0.42, Math.PI / 2));
  for (let k = 0; k < 6; k++) {
    for (const s of [-1, 1]) {
      const r = new THREE.TorusGeometry(0.14 - k * 0.008, 0.012, 4, 8, Math.PI * 0.8);
      parts.push(put(r, s * 0.02, 0.07, 0.62 - k * 0.055, 0, s * Math.PI / 2, 0.2));
    }
  }
  parts.push(put(new THREE.BoxGeometry(0.28, 0.08, 0.14), 0, 0.05, 0.1));
  for (const s of [-1, 1]) {
    parts.push(put(new THREE.CylinderGeometry(0.025, 0.02, 0.45, 5), s * 0.1, 0.04, -0.15, Math.PI / 2, 0, s * 0.1));
    parts.push(put(new THREE.CylinderGeometry(0.02, 0.018, 0.42, 5), s * 0.13, 0.04, -0.58, Math.PI / 2, 0, -s * 0.15));
    parts.push(put(new THREE.CylinderGeometry(0.018, 0.016, 0.3, 5), s * 0.24, 0.04, 0.55, Math.PI / 2, 0, s * 0.6));
    parts.push(put(new THREE.CylinderGeometry(0.016, 0.014, 0.27, 5), s * 0.33, 0.04, 0.3, Math.PI / 2, 0, s * 0.2));
  }
  return parts;
}

const DEBRIS = {
  rock: { mat: 'rock', geo: () => [new THREE.IcosahedronGeometry(1, 0)] },
  bone: { mat: 'bone', geo: () => [put(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), 0, 0.06, 0, Math.PI / 2), put(new THREE.SphereGeometry(0.09, 6, 5), 0, 0.06, 0.45), put(new THREE.SphereGeometry(0.09, 6, 5), 0, 0.06, -0.45)] },
  ribs: {
    mat: 'bone',
    geo: () => {
      const p = [put(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), 0, 0.1, 0, Math.PI / 2)];
      for (let k = 0; k < 8; k++) p.push(put(new THREE.TorusGeometry(0.9 - Math.abs(k - 3.5) * 0.08, 0.05, 4, 10, Math.PI), 0, 0.1, -1.3 + k * 0.37, 0, Math.PI / 2, 0));
      return p;
    },
  },
  spine: {
    mat: 'bone',
    geo: () => {
      const p = [];
      for (let k = 0; k < 14; k++) {
        const s = 1 - k * 0.04;
        p.push(put(new THREE.CylinderGeometry(0.45 * s, 0.45 * s, 0.6, 8), 0, 0.4, k * 0.9, Math.PI / 2));
        p.push(put(new THREE.BoxGeometry(0.15, 1.1 * s, 0.25), 0, 1.0, k * 0.9));
        p.push(put(new THREE.BoxGeometry(1.6 * s, 0.12, 0.2), 0, 0.4, k * 0.9));
      }
      return p;
    },
  },
  skull: { mat: 'bone', geo: () => [put(new THREE.SphereGeometry(0.12, 8, 6), 0, 0.1, 0, 0, 0, 0, 1, 0.9, 1.15), put(new THREE.BoxGeometry(0.09, 0.05, 0.1), 0, 0.04, 0.11)] },
  skeleton: { mat: 'bone', geo: skeletonGeo },
  beam: { mat: 'rust', geo: () => [put(new THREE.BoxGeometry(0.06, 0.4, 5), 0, 0.2, 0), put(new THREE.BoxGeometry(0.3, 0.05, 5), 0, 0.02, 0), put(new THREE.BoxGeometry(0.3, 0.05, 5), 0, 0.38, 0)] },
  barrel: { mat: 'rust', geo: () => [put(new THREE.CylinderGeometry(0.35, 0.35, 0.95, 12), 0, 0.33, 0, Math.PI / 2, 0, 0.3)] },
  chain: {
    mat: 'rustDark',
    geo: () => {
      const p = [];
      for (let k = 0; k < 10; k++) p.push(put(new THREE.TorusGeometry(0.12, 0.035, 5, 10), 0, 0.05, k * 0.2, k % 2 ? 0 : Math.PI / 2, 0, Math.PI / 2));
      return p;
    },
  },
  plate: { mat: 'rust', geo: () => [put(new THREE.BoxGeometry(3, 0.08, 2), 0, 0.3, 0, 0.25)] },
};

export function buildDebris(M, L, own) {
  const g = new THREE.Group();
  const byKind = {};
  for (const d of L.debris) (byKind[d.kind] ||= []).push(d);
  const m4 = new THREE.Matrix4();
  for (const [kind, list] of Object.entries(byKind)) {
    const def = DEBRIS[kind];
    const parts = def.geo();
    const geo = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    if (parts.length > 1) for (const p of parts) p.dispose();
    own.geos.push(geo);
    const mesh = new THREE.InstancedMesh(geo, M[def.mat], list.length);
    list.forEach((d, i) => {
      const s = kind === 'rock' ? d.s * 1.6 : d.s;
      m4.compose(tmpP.set(d.x, d.y - (kind === 'rock' ? 0.4 : 0.05), d.z), tmpQ.setFromEuler(tmpE.set(d.tilt * 0.3, d.rot, d.tilt, 'YXZ')), tmpS.set(s, kind === 'rock' ? s * 0.6 : s, s));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    g.add(mesh);
  }
  return g;
}

// ---- The boat ------------------------------------------------------------------------

// A small open boat, lofted from cross-sections: stern at -z, bow at +z.
function hullGeometry() {
  const S = 14, K = 10, L0 = -2.1, L1 = 2.3;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S, z = L0 + (L1 - L0) * t;
    const bow = Math.max(0, (t - 0.5) / 0.5);
    const w = 0.78 * Math.sqrt(Math.max(0, 1 - bow * bow)) * (t < 0.08 ? 0.92 + t : 1);
    const top = 0.42 + bow * bow * 0.22, bottom = -0.28 + bow * 0.18;
    for (let k = 0; k <= K; k++) {
      const u = (k / K) * 2 - 1;
      pos.push(w * u, top - (top - bottom) * (1 - Math.pow(Math.abs(u), 2.4)), z);
      uv.push(k / K, t * 3);
    }
  }
  for (let i = 0; i < S; i++) for (let k = 0; k < K; k++) {
    const a = i * (K + 1) + k, b = a + K + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // Transom.
  const base = pos.length / 3;
  pos.push(0, 0.1, L0);
  uv.push(0.5, 0);
  for (let k = 0; k < K; k++) idx.push(base, k + 1, k);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function harpoonGeometry() {
  const parts = [
    put(new THREE.CylinderGeometry(0.022, 0.026, 1.8, 6), 0, 0, 0, Math.PI / 2),
    put(new THREE.ConeGeometry(0.055, 0.32, 6), 0, 0, 1.05, Math.PI / 2),
    put(new THREE.BoxGeometry(0.2, 0.012, 0.09), 0, 0, 0.86, 0, 0, 0),
    put(new THREE.TorusGeometry(0.04, 0.012, 4, 8), 0, 0, -0.7),
  ];
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return geo;
}

export function buildBoat(M, own) {
  const g = new THREE.Group();
  const hull = hullGeometry();
  own.geos.push(hull);
  g.add(new THREE.Mesh(hull, M.hull));
  const wood = [
    tiledBox(-0.7, 0.12, -1.45, 0.7, 0.17, -1.15, 1),
    tiledBox(-0.74, 0.12, 0.25, 0.74, 0.17, 0.55, 1),
    tiledBox(-0.5, -0.2, -1.9, 0.5, -0.17, 1.6, 1),
  ];
  // The harpoon crate.
  wood.push(tiledBox(-0.32, -0.17, -0.85, 0.32, 0.2, -0.1, 1));
  g.add(new THREE.Mesh(mergeGeometries(wood), M.plank));
  const hg = harpoonGeometry();
  own.geos.push(hg);
  for (let k = 0; k < 5; k++) {
    const h = new THREE.Mesh(hg, M.iron);
    // Laid in the crate, points forward.
    h.position.set(-0.2 + k * 0.1, 0.12 + (k % 2) * 0.05, -0.2);
    h.rotation.set(-0.12 + (k % 3) * 0.04, (k - 2) * 0.03, 0);
    g.add(h);
  }
  // Outboard motor.
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.42), M.iron);
  motor.position.set(0, 0.62, -2.28);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), M.iron);
  shaft.position.set(0, 0.1, -2.32);
  g.add(motor, shaft);
  // A lantern on a pole at the bow: the only light out here.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), M.iron);
  pole.position.set(0, 0.85, 1.75);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  own.mats.push(lampMat);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lampMat);
  lamp.position.set(0, 1.38, 1.75);
  const light = new THREE.PointLight(0xffb060, 3.5, 22, 1.5);
  light.position.set(0, 1.45, 1.6);
  g.add(pole, lamp, light);
  return { group: g, light, harpoonGeo: hg };
}

// ---- Particles: splashes, bubbles, blood, marine snow -----------------------------------

const PART_VERT = /* glsl */ `
attribute float size;
attribute vec3 color;
attribute float alpha;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vColor = color;
  vAlpha = alpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(48.0, size * 300.0 / max(0.5, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const PART_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <fog_fragment>
}
`;

export class Particles {
  constructor(count, own) {
    this.n = count;
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.base = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(this.p, 3);
    this.col = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.size = new THREE.BufferAttribute(new Float32Array(count), 1);
    this.alpha = new THREE.BufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', this.col);
    geo.setAttribute('size', this.size);
    geo.setAttribute('alpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      fog: true,
      transparent: true,
      depthWrite: false,
    });
    own.geos.push(geo);
    own.mats.push(mat);
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.next = 0;
  }

  emit(x, y, z, vx, vy, vz, { life = 1, size = 0.2, color = [1, 1, 1], drag = 0.5, grav = 9, alpha = 0.8 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.max[i] = life;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.base[i] = alpha;
    this.col.array.set(color, i * 3);
    this.size.array[i] = size;
    this.col.needsUpdate = true;
  }

  splash(x, z, power = 1, rng = Math.random) {
    for (let k = 0; k < 18 * power; k++) {
      const a = rng() * Math.PI * 2, s = rng() * 2.5 * power;
      this.emit(x + Math.cos(a) * 0.3, 0.05, z + Math.sin(a) * 0.3, Math.cos(a) * s, 2 + rng() * 4 * power, Math.sin(a) * s, { life: 0.9 + rng() * 0.5, size: 0.12 + rng() * 0.2 * power, color: [0.85, 0.9, 0.9], drag: 0.3, grav: 9.8 });
    }
  }

  bubbles(x, y, z, n = 6, rng = Math.random) {
    for (let k = 0; k < n; k++) {
      this.emit(x + (rng() - 0.5) * 0.4, y + (rng() - 0.5) * 0.3, z + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.3, 0.8 + rng() * 0.8, (rng() - 0.5) * 0.3, { life: 2.5, size: 0.04 + rng() * 0.05, color: [0.8, 0.95, 1], drag: 1.5, grav: -1.5, alpha: 0.6 });
    }
  }

  blood(x, y, z, n = 20, rng = Math.random) {
    for (let k = 0; k < n; k++) {
      this.emit(x + (rng() - 0.5), y + (rng() - 0.5), z + (rng() - 0.5), (rng() - 0.5) * 1.5, (rng() - 0.3) * 1.2, (rng() - 0.5) * 1.5, { life: 4 + rng() * 2, size: 0.5 + rng() * 0.6, color: [0.35, 0.03, 0.02], drag: 1.2, grav: 0, alpha: 0.55 });
    }
  }

  update(dt) {
    const { p, v } = this;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha.array[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= k;
      v[i * 3 + 2] *= k;
      v[i * 3 + 1] = v[i * 3 + 1] * k - this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      // Spray that falls back into the sea is gone.
      if (this.grav[i] > 0 && p[i * 3 + 1] < -0.1 && v[i * 3 + 1] < 0) this.life[i] = 0;
      // Bubbles burst at the surface.
      if (this.grav[i] < 0 && p[i * 3 + 1] > 0) this.life[i] = 0;
      this.alpha.array[i] = this.base[i] * Math.min(1, this.life[i] / (this.max[i] * 0.4));
    }
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.size.needsUpdate = true;
  }
}

// Specks drifting in the water around you.
const SNOW_VERT = /* glsl */ `
uniform vec3 center;
uniform float time;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 p = position + vec3(sin(time * 0.3 + position.y) * 0.4, -time * 0.15, cos(time * 0.25 + position.x) * 0.4);
  p = mod(p - center + 15.0, 30.0) - 15.0 + center;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vA = smoothstep(15.0, 4.0, length(p - center));
  gl_PointSize = min(5.0, 40.0 / max(0.5, -mvPosition.z));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const SNOW_FRAG = /* glsl */ `
uniform vec3 tint;
varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.7;
  gl_FragColor = vec4(tint, a);
  #include <fog_fragment>
}
`;

export function buildSnow(own, rng) {
  const n = 900;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < arr.length; i++) arr[i] = rng.range(-15, 15);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { center: { value: new THREE.Vector3() }, time: { value: 0 }, tint: { value: new THREE.Color(0xc8d8d0) } }]),
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
  own.geos.push(geo);
  own.mats.push(mat);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
