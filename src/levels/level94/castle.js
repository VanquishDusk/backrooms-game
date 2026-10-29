import * as THREE from 'three';
import { GridMap, EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js';
import { GridWorld } from '../../world/GridWorld.js';
import { SURFACE } from '../../world/materials.js';
import { paintTex, Kit } from './kit.js';
import { buildKing } from './toons.js';

// Inside the castle on the Transparent Mountain: a fun-house, very bright
// in places, bigger inside than out. Room after room: an entrance hall, a
// white room, a ball pit, a playground, an animation studio with a model of
// the town, a toy room, a grand hall that never ends unless you've been
// invited, and the throne room of the Animated King.

export const CC = 2; // cell size
const COLS = 64, ROWS = 56, H = 9;

export const ROOMS = {
  entrance: { x0: 1, y0: 36, x1: 10, y1: 47, ceil: 6, wall: 'damask', floor: 'checker' },
  bright: { x0: 11, y0: 36, x1: 20, y1: 47, ceil: 4.5, wall: 'white', floor: 'whiteFloor' },
  pit: { x0: 21, y0: 36, x1: 32, y1: 47, ceil: 5, wall: 'stripes', floor: 'foam' },
  play: { x0: 33, y0: 34, x1: 46, y1: 49, ceil: 7, wall: 'sky', floor: 'rubber' },
  studio: { x0: 33, y0: 18, x1: 46, y1: 33, ceil: 4.2, wall: 'panel', floor: 'parquet' },
  toys: { x0: 21, y0: 18, x1: 32, y1: 31, ceil: 5, wall: 'dots', floor: 'checker2' },
  hall: { x0: 1, y0: 21, x1: 20, y1: 27, ceil: 6, wall: 'hallRed', floor: 'redCarpet' },
  throne: { x0: 1, y0: 2, x1: 17, y1: 20, ceil: 9, wall: 'purple', floor: 'goldCarpet' },
};
// Doorways: [room a, room b, cells along the shared wall].
const DOORS = [
  ['entrance', 'bright', { v: 11, y: [41, 42] }],
  ['bright', 'pit', { v: 21, y: [41, 42] }],
  ['pit', 'play', { v: 33, y: [41, 42] }],
  ['play', 'studio', { h: 34, x: [39, 40] }],
  ['studio', 'toys', { v: 33, y: [24, 25] }],
  ['toys', 'hall', { v: 21, y: [23, 24] }],
];
// The great doorway from the hall into the throne room, opened by the invitation.
export const THRONE_DOOR = { h: 21, x: [3, 4, 5, 6] };

function textures(own) {
  const T = {};
  const solid = (c) => paintTex(own, 16, 16, (ctx, w, h) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
  });
  T.damask = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8a2430';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,200,120,0.35)';
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.ellipse(x + 8, y + 16, 5, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d8b048';
    ctx.fillRect(0, h - 10, w, 6);
  });
  T.white = solid('#fbfbf8');
  T.stripes = paintTex(own, 64, 64, (ctx, w, h) => {
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = (x / 16) % 2 ? '#f6f0e0' : '#e04a4a';
      ctx.fillRect(x, 0, 16, h);
    }
  });
  T.sky = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9ccaf0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * w, y = 30 + Math.random() * 120;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(x + k * 16, y + (k % 2) * 6, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#6ab04a';
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  });
  T.panel = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.strokeStyle = 'rgba(40,20,10,0.4)';
    for (let x = 0; x < w; x += 32) ctx.strokeRect(x + 3, h * 0.62, 26, h * 0.34);
  });
  T.dots = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f2d24a';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#e04a4a', '#4a7ae0', '#4ab06a'];
    for (let y = 8; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < w; x += 16) {
      ctx.fillStyle = cols[(x + y) % 3];
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  T.hallRed = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7a1c22';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8b048';
    ctx.fillRect(0, h * 0.7, w, 4);
    ctx.fillRect(0, h * 0.15, w, 3);
    ctx.strokeStyle = 'rgba(216,176,72,0.6)';
    ctx.strokeRect(20, h * 0.25, w - 40, h * 0.38);
  });
  T.purple = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3a1a4a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(216,176,72,0.45)';
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 6);
      ctx.lineTo(x + 24, y + 16);
      ctx.lineTo(x + 16, y + 26);
      ctx.lineTo(x + 8, y + 16);
      ctx.fill();
    }
  });
  T.checker = paintTex(own, 64, 64, (ctx, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f2f0e8';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  });
  T.checker2 = paintTex(own, 64, 64, (ctx, w, h) => {
    const c = ['#e04a4a', '#f2d24a', '#4a7ae0', '#4ab06a'];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = c[y * 2 + x];
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  });
  T.whiteFloor = solid('#f4f4f2');
  T.foam = solid('#3a6ad0');
  T.rubber = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#4a9a4a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  T.parquet = paintTex(own, 64, 64, (ctx, w, h) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#a8784a' : '#8a5a34';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  });
  T.redCarpet = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#a01e28';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8b048';
    ctx.fillRect(0, 0, w, 3);
  });
  T.goldCarpet = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#b0242c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e0b848';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
  T.ceiling = solid('#f6f2e8');
  return T;
}

export function buildCastleInterior(shared, own, rng) {
  const map = new GridMap(COLS, ROWS, CC, H);
  const room = new Int8Array(COLS * ROWS).fill(-1);
  const names = Object.keys(ROOMS);
  names.forEach((n, i) => {
    const r = ROOMS[n];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) room[map.idx(x, y)] = i;
  });
  const at = (x, y) => (map.inBounds(x, y) ? room[map.idx(x, y)] : -1);
  for (let y = 0; y <= ROWS; y++) for (let x = 0; x < COLS; x++) map.setH(x, y, at(x, y - 1) === at(x, y) ? EDGE_OPEN : EDGE_WALL);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x <= COLS; x++) map.setV(x, y, at(x - 1, y) === at(x, y) ? EDGE_OPEN : EDGE_WALL);
  for (const [, , d] of DOORS) {
    if (d.v != null) for (const y of d.y) map.setV(d.v, y, EDGE_OPEN);
    else for (const x of d.x) map.setH(x, d.h, EDGE_OPEN);
  }
  // Lights: lots, and blinding in the white room.
  const lights = [];
  for (const n of names) {
    const r = ROOMS[n];
    const step = n === 'bright' ? 2 : 3;
    for (let y = r.y0 + 1; y <= r.y1; y += step) for (let x = r.x0 + 1; x <= r.x1; x += step) {
      lights.push({ x: (x + 0.5) * CC, z: (y + 0.5) * CC, color: n === 'throne' ? [1, 0.85, 0.65] : [1, 0.98, 0.94], power: n === 'bright' ? 2.6 : n === 'throne' ? 1.4 : 1.25, state: 'on', room: n });
    }
  }
  const T = textures(own);
  const roomOf = (x, y) => (map.inBounds(x, y) && room[map.idx(x, y)] >= 0 ? ROOMS[names[room[map.idx(x, y)]]] : null);
  const walls = {}, floors = {};
  for (const n of names) {
    const r = ROOMS[n];
    walls[r.wall] = { map: T[r.wall], scale: [1 / 2, 1 / 3] };
    floors[r.floor] = { map: T[r.floor], scale: 1 / 2, surface: SURFACE.FLOOR };
  }
  const world = new GridWorld({
    map,
    lights,
    textures: { wall: T.white, floor: T.whiteFloor, ceiling: T.ceiling, walls, floors },
    shared,
    texScale: { wall: [1 / 2, 1 / 3], floor: 1 / 2, ceiling: 1 / 2 },
    floorStyle: (x, y) => roomOf(x, y)?.floor || 'floor',
    wallStyle: (e) => {
      const a = e.h ? roomOf(e.x, e.y) || roomOf(e.x, e.y - 1) : roomOf(e.x, e.y) || roomOf(e.x - 1, e.y);
      return a ? a.wall : 'wall';
    },
    ceilingAt: (x, y) => roomOf(x, y)?.ceil ?? H,
    panelSize: [0.001, 0.001],
    dampAt: () => 0,
  });

  // Ceiling lamps at the right height for each room.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
  own.mats.push(lampMat);
  const lampGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.12, 16);
  own.geos.push(lampGeo);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lights.length);
  const m4 = new THREE.Matrix4();
  lights.forEach((l, i) => {
    m4.makeTranslation(l.x, ROOMS[l.room].ceil - 0.06, l.z);
    lamps.setMatrixAt(i, m4);
  });
  world.group.add(lamps);

  // ---- Furnishings ----------------------------------------------------------------
  const L = (o) => {
    const m = new THREE.MeshLambertMaterial(o);
    own.mats.push(m);
    return m;
  };
  const M = {
    gold: L({ color: 0xe0b848, emissive: 0x201406 }), red: L({ color: 0xd04040 }), blue: L({ color: 0x3a6ad0 }), yellow: L({ color: 0xf2d24a }),
    green: L({ color: 0x4ab06a }), wood: L({ color: 0x8a5a34 }), white: L({ color: 0xf6f4ee }), grey: L({ color: 0x8a8c90 }), dark: L({ color: 0x2a2a30 }),
    cel: new THREE.MeshBasicMaterial({ map: celTexture(own), transparent: true, side: THREE.DoubleSide }),
    lightbox: new THREE.MeshBasicMaterial({ color: 0xfaf6e8 }),
    portrait: L({ map: portraitTexture(own) }),
  };
  own.mats.push(M.cel, M.lightbox);
  const kit = new Kit();
  const cx = (r) => ((r.x0 + r.x1 + 1) / 2) * CC, cz = (r) => ((r.y0 + r.y1 + 1) / 2) * CC;
  const solids = [];
  const solid = (x, z, hw, hd) => solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
  const interact = [];

  // Entrance: portraits of the King, a coat of arms.
  {
    const r = ROOMS.entrance;
    for (const z of [cz(r) - 6, cz(r) + 6]) kit.add('portrait', new THREE.PlaneGeometry(2.2, 2.8), r.x0 * CC + 0.12, 3, z, 0, Math.PI / 2, 0);
    kit.box('gold', r.x0 * CC + 0.08, 3, cz(r) - 6, 0.06, 3.1, 2.5);
    kit.box('gold', r.x0 * CC + 0.08, 3, cz(r) + 6, 0.06, 3.1, 2.5);
  }
  // The ball pit.
  const pit = { x0: ROOMS.pit.x0 * CC + 3, z0: ROOMS.pit.y0 * CC + 3, x1: (ROOMS.pit.x1 + 1) * CC - 3, z1: (ROOMS.pit.y1 + 1) * CC - 3 };
  {
    for (const [x, z, w, d] of [[(pit.x0 + pit.x1) / 2, pit.z0, pit.x1 - pit.x0, 0.3], [(pit.x0 + pit.x1) / 2, pit.z1, pit.x1 - pit.x0, 0.3], [pit.x0, (pit.z0 + pit.z1) / 2, 0.3, pit.z1 - pit.z0], [pit.x1, (pit.z0 + pit.z1) / 2, 0.3, pit.z1 - pit.z0]]) {
      kit.box('red', x, 0.35, z, w, 0.7, d);
    }
    interact.push({ id: 'pit', x: (pit.x0 + pit.x1) / 2, z: (pit.z0 + pit.z1) / 2, region: pit, msg: 'You wade into the ball pit. Somewhere, gears start turning.' });
  }
  const ballGeo = new THREE.SphereGeometry(0.17, 8, 6);
  own.geos.push(ballGeo);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  own.mats.push(ballMat);
  const nBalls = 1400;
  const balls = new THREE.InstancedMesh(ballGeo, ballMat, nBalls);
  const ballPos = [];
  const palette = [0xe04a4a, 0xf2d24a, 0x3a6ad0, 0x4ab06a, 0xf08a3a, 0xc060c0].map((c) => new THREE.Color(c));
  for (let i = 0; i < nBalls; i++) {
    const p = [rng.range(pit.x0 + 0.3, pit.x1 - 0.3), rng.range(0.15, 0.62), rng.range(pit.z0 + 0.3, pit.z1 - 0.3)];
    ballPos.push(p);
    balls.setMatrixAt(i, m4.makeTranslation(...p));
    balls.setColorAt(i, rng.pick(palette));
  }
  world.group.add(balls);
  // The playground: slide, swings, climbing frame, seesaw, roundabout.
  {
    const r = ROOMS.play;
    const x0 = cx(r), z0 = cz(r);
    // Slide: ladder up, chute down.
    kit.box('yellow', x0 - 6, 1.25, z0 - 5, 1.2, 2.5, 1.2);
    kit.box('red', x0 - 6, 2.55, z0 - 5, 1.4, 0.1, 1.4);
    kit.add('blue', new THREE.BoxGeometry(0.9, 0.08, 4.6), x0 - 6, 1.3, z0 - 2.6, -0.55, 0, 0);
    solid(x0 - 6, z0 - 5, 0.7, 0.7);
    interact.push({ id: 'slide', x: x0 - 6, z: z0 - 1.2, r: 1.4, msg: 'You go down the slide. It\'s fun, for a second. Something clanks behind you.' });
    // Swings.
    kit.box('red', x0 + 3, 3.2, z0 - 5, 5, 0.15, 0.15);
    for (const s of [-1, 1]) {
      kit.add('red', new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), x0 + 3 + s * 2.5, 1.6, z0 - 5.8, 0.3, 0, 0);
      kit.add('red', new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), x0 + 3 + s * 2.5, 1.6, z0 - 4.2, -0.3, 0, 0);
    }
    for (const s of [-1, 1]) {
      kit.box('dark', x0 + 3 + s * 1, 0.6, z0 - 5, 0.6, 0.06, 0.3);
      for (const k of [-0.25, 0.25]) kit.box('grey', x0 + 3 + s * 1 + k, 1.9, z0 - 5, 0.02, 2.6, 0.02);
    }
    solid(x0 + 3, z0 - 5, 2.6, 0.9);
    interact.push({ id: 'swing', x: x0 + 3, z: z0 - 3.8, r: 1.5, msg: 'The swing creaks as you sit on it. Something whirrs and turns its head.' });
    // Climbing frame.
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 2; j++) kit.add('green', new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), x0 + 2 + i, 1.2, z0 + 3 + j);
    for (let k = 1; k <= 3; k++) {
      for (let j = 0; j <= 2; j++) kit.add('green', new THREE.CylinderGeometry(0.05, 0.05, 3, 6), x0 + 3.5, k * 0.8, z0 + 3 + j, 0, 0, Math.PI / 2);
    }
    solid(x0 + 3.5, z0 + 4, 1.6, 1.1);
    // Seesaw and roundabout.
    kit.add('blue', new THREE.BoxGeometry(4, 0.1, 0.4), x0 - 5, 0.55, z0 + 4, 0, 0, 0.2);
    kit.box('dark', x0 - 5, 0.25, z0 + 4, 0.3, 0.5, 0.3);
    kit.add('yellow', new THREE.CylinderGeometry(1.4, 1.4, 0.12, 20), x0 - 4, 0.35, z0 + 9 - 1);
    solid(x0 - 4, z0 + 8, 1.4, 1.4);
  }
  // The animation studio: desks with lightboxes, cels hung on lines, a
  // rostrum camera, and on the big table, a model of the town.
  let invitation;
  {
    const r = ROOMS.studio;
    const x0 = cx(r), z0 = cz(r);
    for (let k = 0; k < 4; k++) {
      const x = r.x0 * CC + 2.2, z = r.y0 * CC + 3 + k * 5.5;
      kit.box('wood', x, 0.75, z, 1.4, 0.06, 1.0);
      kit.box('wood', x, 0.37, z, 1.3, 0.74, 0.9);
      kit.add('lightbox', new THREE.PlaneGeometry(0.8, 0.6), x, 0.85, z, -1.1, Math.PI / 2, 0);
      solid(x, z, 0.75, 0.55);
    }
    for (let k = 0; k < 10; k++) kit.add('cel', new THREE.PlaneGeometry(0.6, 0.45), x0 - 3 + k * 0.7, 2.6, r.y1 * CC + 0.8, 0, 0, (k % 3 - 1) * 0.05);
    kit.box('dark', x0 - 3 + 3.15, 2.95, r.y1 * CC + 0.8, 7.2, 0.02, 0.02);
    // Rostrum camera.
    kit.box('grey', x0 + 5, 1.6, z0 - 5, 0.12, 3.2, 0.12);
    kit.box('dark', x0 + 5, 2.6, z0 - 4.6, 0.6, 0.5, 0.8);
    kit.add('dark', new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16), x0 + 5, 3.0, z0 - 4.6, Math.PI / 2, 0, 0);
    kit.box('wood', x0 + 5, 0.75, z0 - 4.2, 1.6, 0.06, 1.6);
    solid(x0 + 5, z0 - 4.4, 0.85, 0.85);
    interact.push({ id: 'camera', x: x0 + 5, z: z0 - 3.0, r: 1.3, msg: 'You look through the rostrum camera. Below it, a drawing of you. Something clanks.' });
    // The model town.
    kit.box('wood', x0, 0.8, z0 + 1, 5, 0.08, 4);
    kit.box('wood', x0, 0.4, z0 + 1, 4.8, 0.8, 3.8);
    kit.add('green', new THREE.BoxGeometry(4.8, 0.02, 3.8), x0, 0.85, z0 + 1);
    kit.add('grey', new THREE.CylinderGeometry(0.22, 0.25, 0.08, 16), x0, 0.9, z0 + 1);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, rr = 0.8 + (k % 2) * 0.6;
      const hx = x0 + Math.cos(a) * rr * 1.4, hz = z0 + 1 + Math.sin(a) * rr;
      kit.box(k % 3 ? 'white' : 'yellow', hx, 0.95, hz, 0.2, 0.18, 0.18);
      kit.add('red', new THREE.ConeGeometry(0.15, 0.12, 4), hx, 1.1, hz, 0, Math.PI / 4, 0);
    }
    for (let k = 0; k < 5; k++) kit.add('dark', new THREE.CapsuleGeometry(0.025, 0.06, 2, 6), x0 - 1.5 + k * 0.7, 0.92, z0 + 2.3);
    solid(x0, z0 + 1, 2.6, 2.1);
    invitation = { x: x0 + 0.9, z: z0 - 0.9, y: 0.9 };
    kit.add('white', new THREE.BoxGeometry(0.22, 0.01, 0.15), x0 + 0.9, 0.86, z0 - 0.9);
    interact.push({ id: 'invite', x: x0 + 0.9, z: z0 - 1.6, r: 1.2, msg: 'On the edge of the model town, a little card in gold ink: "His Majesty requests the pleasure of your company." You take it. Every Robo-Man that saw that is coming.' });
  }
  // The toy room: blocks, a rocking horse, a jack-in-the-box, two toy chests.
  {
    const r = ROOMS.toys;
    const x0 = cx(r), z0 = cz(r);
    const cols = ['red', 'blue', 'yellow', 'green'];
    for (let k = 0; k < 12; k++) {
      const s = rng.range(0.6, 1.3);
      const x = x0 + rng.range(-8, 8), z = z0 + rng.range(-8, 8);
      if (Math.hypot(x - x0, z - z0) < 2.5) continue;
      kit.box(cols[k % 4], x, s / 2, z, s, s, s, rng.range(0, 1));
      solid(x, z, s * 0.6, s * 0.6);
    }
    // Rocking horse.
    kit.add('wood', new THREE.TorusGeometry(1.0, 0.06, 6, 16, Math.PI * 0.7), x0 - 4, 0.95, z0 - 3, 0, 0, Math.PI * 1.15);
    kit.box('white', x0 - 4, 1.05, z0 - 3, 1.2, 0.4, 0.4);
    kit.box('white', x0 - 3.3, 1.45, z0 - 3, 0.3, 0.6, 0.3);
    kit.box('red', x0 - 4, 1.3, z0 - 3, 0.4, 0.1, 0.45);
    // Jack-in-the-box.
    kit.box('blue', x0 + 3, 0.4, z0 + 4, 0.8, 0.8, 0.8);
    kit.add('yellow', new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), x0 + 3.45, 0.5, z0 + 4, 0, 0, Math.PI / 2);
    solid(x0 + 3, z0 + 4, 0.45, 0.45);
    interact.push({ id: 'jack', x: x0 + 3, z: z0 + 5.1, r: 1.2, msg: 'You turn the handle. Pop goes the weasel, and out springs a grinning clown. Somewhere, gears start turning.', once: true });
    for (const [x, z, item] of [[x0 - 7, z0 + 6, 'medkit'], [x0 + 7, z0 - 6, rng.pick(['water', 'battery', 'flare'])]]) {
      kit.box('red', x, 0.35, z, 1.2, 0.7, 0.8);
      kit.box('yellow', x, 0.72, z, 1.24, 0.06, 0.84);
      solid(x, z, 0.65, 0.45);
      interact.push({ id: 'chest', x, z: z + 1.0, r: 1.1, item, once: true, msg: 'You open the toy chest.' });
    }
  }
  // The grand hall: banners down both sides.
  {
    const r = ROOMS.hall;
    for (let x = r.x0 * CC + 3; x < (r.x1 + 1) * CC; x += 5) {
      for (const z of [r.y0 * CC + 0.12, (r.y1 + 1) * CC - 0.12]) kit.add('red', new THREE.PlaneGeometry(1.2, 3), x, 3.4, z, 0, z < cz(r) ? 0 : Math.PI, 0);
    }
  }
  // The throne room: a long carpet to the throne, pillars.
  const throne = ROOMS.throne;
  for (const s of [-1, 1]) for (let z = throne.y0 * CC + 5; z < (throne.y1 + 1) * CC - 3; z += 6) {
    const x = cx(throne) + s * 9;
    kit.add('gold', new THREE.CylinderGeometry(0.6, 0.7, 9, 12), x, 4.5, z);
    solid(x, z, 0.7, 0.7);
  }
  const king = buildKing(own);
  king.group.position.set(cx(throne), 0, throne.y0 * CC + 3.2);
  solid(cx(throne), throne.y0 * CC + 3.2, 1.8, 1.4);
  world.group.add(king.group);

  const group = kit.build({ ...M }, own);
  world.group.add(group);
  world.extraBoxes.push(...solids);
  world.rebuildCollision();
  return {
    world, map, balls, ballPos, pit, interact, invitation, king,
    start: { x: cx(ROOMS.entrance), z: (ROOMS.entrance.y1 + 1) * CC - 2, yaw: 0 },
    throneSpot: { x: cx(throne), z: throne.y0 * CC + 10 },
    roomAt: (x, z) => {
      const r = roomOf(Math.floor(x / CC), Math.floor(z / CC));
      return r ? names.find((n) => ROOMS[n] === r) : null;
    },
    robots: ['bright', 'pit', 'play', 'studio', 'toys', 'studio'].map((n) => ({ x: cx(ROOMS[n]) + rng.range(-4, 4), z: cz(ROOMS[n]) + rng.range(-4, 4) })),
  };
}

function celTexture(own) {
  return paintTex(own, 128, 96, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(64, 40, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(64, 72, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(58, 38, 4, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(70, 38, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = '10px monospace';
    ctx.fillText(`#${Math.floor(Math.random() * 90 + 10)}`, 6, 90);
  }, false);
}

function portraitTexture(own) {
  return paintTex(own, 128, 160, (ctx, w, h) => {
    ctx.fillStyle = '#3a1a4a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(64, 70, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0b848';
    ctx.fillRect(40, 26, 48, 12);
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(42 + k * 13, 26);
      ctx.lineTo(48 + k * 13, 12);
      ctx.lineTo(54 + k * 13, 26);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(52, 62, 7, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(76, 62, 7, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40, 84);
    ctx.quadraticCurveTo(64, 110, 88, 84);
    ctx.fill();
    ctx.fillStyle = '#a02028';
    ctx.fillRect(20, 110, 88, 50);
  }, false);
}
