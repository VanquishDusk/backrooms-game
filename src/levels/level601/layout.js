import { GridMap, EDGE_OPEN, EDGE_WALL, EDGE_BARS, DIRS } from '../../world/GridMap.js';

// Level 601's floor plan, on a grid of 1.25 m cells.
//
//   rows 0..19   the hallway (sealed until the end): a long corridor that
//                loops, with a passage off each side halfway along
//   rows 20..33  the back of the shop, under the yellow bulkhead
//   rows 34..91  the shop floor: rows of empty shelves, pillars, desks
//
// Shelves, desks, A-frames and pillars fill whole cells; the edges around
// them are EDGE_BARS (solid, but drawn by the level as furniture), so
// entities path around them like walls.

export const CELL = 1.25;
export const COLS = 64;
export const ROWS = 92;
export const HEIGHT = 3.4;
export const STORE_TOP = 20;
export const BULKHEAD = 34;

export const KIND = { VOID: 0, FLOOR: 1, BACK: 2, HALL: 3, BLOCK: 4 };

// The hallway.
export const HALL = {
  row: 8, // corridor rows 8..9
  x0: 2,
  x1: 61,
  junction: 31, // passages at cols 31..32
  loopAt: 50, // past this column the corridor runs into the dark, and loops
  loopBy: 40,
  north: { trigger: 41 }, // north passage turns east along rows 2..3
  south: { trigger: 23 }, // south passage turns west along rows 15..16
};

export function generateLevel601(rng) {
  const map = new GridMap(COLS, ROWS, CELL, HEIGHT);
  const kind = new Uint8Array(COLS * ROWS);
  const idx = (x, y) => y * COLS + x;
  const set = (x0, y0, x1, y1, k) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) kind[idx(x, y)] = k;
  };
  set(0, STORE_TOP, COLS - 1, ROWS - 1, KIND.FLOOR);
  set(0, STORE_TOP, COLS - 1, BULKHEAD - 1, KIND.BACK);
  // The hallway.
  set(HALL.x0, HALL.row, HALL.x1, HALL.row + 1, KIND.HALL);
  set(2, HALL.row + 2, 3, STORE_TOP - 1, KIND.HALL);
  set(HALL.junction, 2, HALL.junction + 1, HALL.row - 1, KIND.HALL);
  set(HALL.junction + 2, 2, 44, 3, KIND.HALL);
  set(HALL.junction, HALL.row + 2, HALL.junction + 1, 16, KIND.HALL);
  set(20, 15, HALL.junction - 1, 16, KIND.HALL);

  const furniture = [];
  const blocked = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (kind[idx(x, y)] === KIND.BLOCK) return true;
    return false;
  };
  const reserve = new Uint8Array(COLS * ROWS);
  const keepClear = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) reserve[idx(x, y)] = 1;
  };
  const place = (f) => {
    set(f.x0, f.y0, f.x1, f.y1, KIND.BLOCK);
    furniture.push(f);
    return f;
  };

  // Desks with terminals. `face` is the side customers stand on (a DIRS index).
  const desks = [
    { name: 'front', x0: 29, y0: 79, x1: 34, y1: 81, face: 2, term: 30 },
    { name: 'east', x0: 55, y0: 49, x1: 58, y1: 53, face: 1, term: 50 },
    { name: 'west', x0: 5, y0: 63, x1: 8, y1: 67, face: 0, term: 66 },
    { name: 'back', x0: 40, y0: 23, x1: 45, y1: 25, face: 2, term: 41 },
  ];
  for (const d of desks) {
    d.type = 'desk';
    place(d);
    keepClear(d.x0 - 2, d.y0 - 2, d.x1 + 2, d.y1 + 2);
    // Where you stand to use the terminal.
    const [dx, dy] = DIRS[d.face];
    if (dx) d.use = { x: dx > 0 ? d.x1 + 1 : d.x0 - 1, y: d.term };
    else d.use = { x: d.term, y: dy > 0 ? d.y1 + 1 : d.y0 - 1 };
  }
  // Walkways that stay open.
  keepClear(29, BULKHEAD - 1, 34, 78); // up the middle from the front desk
  keepClear(0, BULKHEAD, COLS - 1, BULKHEAD + 1); // along the bulkhead
  keepClear(0, 46, COLS - 1, 47);
  keepClear(0, 58, COLS - 1, 59);
  keepClear(0, 70, COLS - 1, 71);
  keepClear(0, 83, COLS - 1, ROWS - 1); // the front of the shop
  keepClear(1, STORE_TOP, 4, STORE_TOP + 3); // the way to the hallway door
  // Pillars on a grid.
  const pillars = [];
  for (const px of [10, 21, 42, 53]) {
    for (const py of [28, 40, 52, 64, 76]) {
      if (reserve[idx(px, py)] && !(py === 28)) continue;
      if (kind[idx(px, py)] === KIND.BLOCK) continue;
      place({ type: 'pillar', x0: px, y0: py, x1: px, y1: py });
      pillars.push({ x: px, y: py });
      keepClear(px - 1, py - 1, px + 1, py + 1);
    }
  }
  // Shelving along the side walls, one-sided.
  for (const [x, face] of [[0, 0], [COLS - 1, 1]]) {
    let y = BULKHEAD + 2;
    while (y < 82) {
      let y1 = y;
      while (y1 + 1 < 82 && y1 - y < 6 && !reserve[idx(x, y1 + 1)]) y1++;
      if (!reserve[idx(x, y)] && y1 - y >= 2) place({ type: 'shelf', x0: x, y0: y, x1: x, y1, along: 'z', sides: 1, face });
      y = y1 + 2;
    }
  }
  // Along the back wall, facing into the shop.
  for (let x = 6; x < COLS - 6; x += 8) {
    if (!blocked(x, STORE_TOP, x + 5, STORE_TOP)) place({ type: 'shelf', x0: x, y0: STORE_TOP, x1: x + 5, y1: STORE_TOP, along: 'x', sides: 1, face: 2 });
  }
  // The shop floor: blocks of double-sided shelf rows between the walkways.
  const sections = [];
  const bandsY = [[36, 45], [48, 57], [60, 69], [72, 82]];
  const bandsX = [[3, 15], [16, 28], [35, 47], [48, 60]];
  for (const [y0, y1] of bandsY) for (const [x0, x1] of bandsX) sections.push({ x0, y0, x1, y1 });
  for (const s of sections) {
    const alongX = rng.chance(0.6);
    if (alongX) {
      for (let y = s.y0 + 1; y <= s.y1 - 1; y += 3) {
        let x = s.x0 + 1;
        while (x <= s.x1 - 1) {
          const len = rng.int(4, 7);
          let x1 = Math.min(s.x1 - 1, x + len - 1);
          while (x1 >= x && reserve[idx(x1, y)]) x1--;
          let ok = x1 - x >= 2;
          for (let k = x; k <= x1 && ok; k++) if (reserve[idx(k, y)] || kind[idx(k, y)] !== KIND.FLOOR) ok = false;
          if (ok) place({ type: 'shelf', x0: x, y0: y, x1, y1: y, along: 'x', sides: 2 });
          x = x1 + 3;
        }
      }
    } else {
      for (let x = s.x0 + 1; x <= s.x1 - 1; x += 3) {
        let y = s.y0 + 1;
        while (y <= s.y1 - 1) {
          const len = rng.int(3, 6);
          let y1 = Math.min(s.y1 - 1, y + len - 1);
          let ok = y1 - y >= 2;
          for (let k = y; k <= y1 && ok; k++) if (reserve[idx(x, k)] || kind[idx(x, k)] !== KIND.FLOOR) ok = false;
          if (ok) place({ type: 'shelf', x0: x, y0: y, x1: x, y1, along: 'z', sides: 2 });
          y = y1 + 3;
        }
      }
    }
  }
  // Tall A-frame displays: the back area, the front and the odd gap.
  const aframes = [];
  const tryA = (x, y) => {
    if (kind[idx(x, y)] === KIND.BLOCK || reserve[idx(x, y)]) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (kind[idx(x + dx, y + dy)] === KIND.BLOCK) return false;
    place({ type: 'aframe', x0: x, y0: y, x1: x, y1: y, rot: rng.range(-0.3, 0.3) + (rng.chance(0.5) ? Math.PI / 2 : 0) });
    aframes.push({ x, y });
    return true;
  };
  for (let n = 0, tries = 0; n < 16 && tries < 400; tries++) if (tryA(rng.int(6, COLS - 7), rng.int(STORE_TOP + 3, BULKHEAD - 2))) n++;
  for (let n = 0, tries = 0; n < 10 && tries < 400; tries++) if (tryA(rng.int(4, COLS - 5), rng.int(BULKHEAD + 2, 82))) n++;

  // Edges: walls against the void, bars around furniture, open elsewhere.
  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? KIND.VOID : kind[idx(x, y)]);
  const edgeFor = (a, b) => {
    if ((a === KIND.VOID) !== (b === KIND.VOID)) return EDGE_WALL;
    if (a === KIND.VOID) return EDGE_OPEN;
    if ((a === KIND.BLOCK) !== (b === KIND.BLOCK)) return EDGE_BARS;
    return EDGE_OPEN;
  };
  for (let y = 0; y <= ROWS; y++) for (let x = 0; x < COLS; x++) map.setH(x, y, edgeFor(at(x, y - 1), at(x, y)));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x <= COLS; x++) map.setV(x, y, edgeFor(at(x - 1, y), at(x, y)));
  // The hallway door stays shut until the end.
  const hallDoor = [map.edge(2, STORE_TOP, 3), map.edge(3, STORE_TOP, 3)];
  for (const e of hallDoor) map.setEdge(e, EDGE_WALL);

  // Ceiling lights: a grid of troffers over the shop, a line down the hallway.
  const lights = [];
  const light = (x, z, extra = {}) => lights.push({ x, z, color: [1, 0.97, 0.9], power: 1.05, state: 'on', ...extra });
  for (let y = STORE_TOP + 1; y < ROWS; y += 3) for (let x = 1; x < COLS; x += 3) light((x + 0.5) * CELL, (y + 0.5) * CELL);
  for (let x = HALL.x0 + 1; x <= HALL.x1; x += 3) light((x + 0.5) * CELL, (HALL.row + 1) * CELL, { hall: true, state: x > HALL.loopAt ? 'off' : 'on', dark: x > HALL.loopAt });
  for (let y = HALL.row + 3; y < STORE_TOP; y += 3) light(3 * CELL, (y + 0.5) * CELL, { hall: true });
  for (let y = 3; y < HALL.row; y += 3) light((HALL.junction + 1) * CELL, (y + 0.5) * CELL, { hall: true });
  for (let x = HALL.junction + 3; x <= 44; x += 3) light((x + 0.5) * CELL, 3 * CELL, { hall: true });
  for (let y = HALL.row + 3; y <= 16; y += 3) light((HALL.junction + 1) * CELL, (y + 0.5) * CELL, { hall: true });
  for (let x = 21; x < HALL.junction; x += 3) light((x + 0.5) * CELL, 16 * CELL, { hall: true });

  return {
    map, kind, furniture, desks, pillars, aframes, lights, hallDoor,
    spawn: { x: 31.5 * CELL, z: (ROWS - 2) * CELL, yaw: 0 },
    front: { x: 31.5 * CELL, z: 84.5 * CELL, yaw: 0 },
    hallStart: { x: 2.5 * CELL + 0.6, z: 17 * CELL, yaw: 0 },
  };
}
