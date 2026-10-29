import { GridMap, EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js';

// Level 1.3: one long white hallway with branching paths left and right,
// each leading to one of sixteen large rooms (medical supplies, The Ward,
// or an empty Detox Zone). Either it's still the sanctuary it was, or the
// Decay has got into it.

export const ROOM = { DETOX: 0, SUPPLIES: 1, WARD: 2 };

const ROOMS_PER_SIDE = 8;
const ROOM_W = 4;
const ROOM_H = 4;
const COLS = ROOMS_PER_SIDE * ROOM_W;
const ROWS = ROOM_H * 2 + 5; // rooms, two branch cells each side, the hallway
const HALL_Y = ROOM_H + 2;
const CELL = 3;
const HEIGHT = 3.2;
const WHITE = [1, 1, 1];

export function generateLevel13(rng, decayed) {
  const map = new GridMap(COLS, ROWS, CELL, HEIGHT);
  const n = COLS * ROWS;
  // Start solid, then open the hallway, branches and rooms.
  for (let y = 0; y <= ROWS; y++) for (let x = 0; x < COLS; x++) map.setH(x, y, EDGE_WALL);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x <= COLS; x++) map.setV(x, y, EDGE_WALL);
  const kind = new Int8Array(n).fill(-1); // 'h' hallway, 'b' branch, 'r' room
  const K = { HALL: 0, BRANCH: 1, ROOM: 2 };
  for (let x = 0; x < COLS; x++) {
    kind[map.idx(x, HALL_Y)] = K.HALL;
    if (x > 0) map.setV(x, HALL_Y, EDGE_OPEN);
  }

  const types = rng.shuffle([
    ...Array(7).fill(ROOM.DETOX), ...Array(5).fill(ROOM.SUPPLIES), ...Array(4).fill(ROOM.WARD),
  ]);
  const rooms = [];
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < ROOMS_PER_SIDE; k++) {
      const x0 = k * ROOM_W;
      const y0 = side === 0 ? 0 : HALL_Y + 3;
      const bx = x0 + 1 + rng.int(0, 1);
      // Room interior.
      for (let y = y0; y < y0 + ROOM_H; y++) {
        for (let x = x0; x < x0 + ROOM_W; x++) {
          kind[map.idx(x, y)] = K.ROOM;
          if (x > x0) map.setV(x, y, EDGE_OPEN);
          if (y > y0) map.setH(x, y, EDGE_OPEN);
        }
      }
      // Branch path from the hallway.
      const bys = side === 0 ? [HALL_Y - 1, HALL_Y - 2] : [HALL_Y + 1, HALL_Y + 2];
      for (const by of bys) kind[map.idx(bx, by)] = K.BRANCH;
      if (side === 0) {
        map.setH(bx, HALL_Y, EDGE_OPEN);
        map.setH(bx, HALL_Y - 1, EDGE_OPEN);
        map.setH(bx, HALL_Y - 2, EDGE_OPEN);
      } else {
        map.setH(bx, HALL_Y + 1, EDGE_OPEN);
        map.setH(bx, HALL_Y + 2, EDGE_OPEN);
        map.setH(bx, HALL_Y + 3, EDGE_OPEN);
      }
      const cx = (x0 + ROOM_W / 2) * CELL, cz = (y0 + ROOM_H / 2) * CELL;
      rooms.push({ index: rooms.length, side, x0, y0, bx, cx, cz, type: types[rooms.length] });
    }
  }

  // Lights: down the middle of the hallway, a grid in the rooms.
  const lights = [];
  for (let i = 0; i < n; i++) {
    const x = i % COLS, y = (i / COLS) | 0;
    if (kind[i] < 0) continue;
    if (kind[i] === K.ROOM && (x + y) % 2) continue;
    const [wx, wz] = map.cellCenter(x, y);
    const l = { x: wx, z: wz, color: WHITE, power: 1.2, state: 'on', rotate: kind[i] === K.HALL };
    if (decayed) {
      const r = rng.next();
      if (r < 0.25) l.state = 'off';
      else if (r < 0.37) l.state = 'flicker';
    }
    lights.push(l);
  }

  // Spawn mid-hallway, where the white wall from Level 1 lets out.
  const spawnX = rng.int(COLS / 2 - 3, COLS / 2 + 2);
  const spawn = { x: spawnX, y: HALL_Y };
  const yaw = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;

  return { map, kind, K, rooms, lights, spawn, spawnYaw: yaw, hallY: HALL_Y };
}
