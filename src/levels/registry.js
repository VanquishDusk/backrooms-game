import { LEVEL0 } from './level0/Level0.js';
import { LEVEL0_2 } from './level0_2/Level02.js';
import { LEVEL1 } from './level1/Level1.js';
import { LEVEL1_3 } from './level1_3/Level13.js';
import { LEVEL1_5 } from './level1_5/Level15.js';
import { LEVEL2 } from './level2/Level2.js';
import { LEVEL3 } from './level3/Level3.js';
import { LEVEL4 } from './level4/Level4.js';
import { LEVEL5 } from './level5/Level5.js';
import { LEVEL6 } from './level6/Level6.js';
import { LEVEL63 } from './level63/Level63.js';

// Every playable level registers here. A level definition is:
//
//   {
//     id, number, name, title, nickname?, difficulty,
//     next: id of the level its exit leads to,
//     create(ctx) => instance
//   }
//
// and an instance provides:
//   spawn {x, z, yaw}
//   update(dt, player)          gameplay, events; calls ctx.onDeath / onEscape / onCaught
//   drink(player)               use an Almond Water
//   audioMix(player)            ambience levels for AudioEngine.update
//   atmosphere(dt, player)      fog + post-processing values (+ optional fovMul)
//   hudInfo(player)             { warn, warnCovered, coverLabel, health }
//   card?                       { title, sub } to override the arrival title card
//   dispose()
//
// Levels hand control onward with ctx.onEscape(targetId, 'noclip' | 'door' | 'walk').
// The player's sanity, health, battery and Almond Water carry over.
//
// Unbuilt targets show a "coming soon" screen (see UPCOMING): Level 4 and
// Level 5 already have exits to 'level9' and 'level71', Level 6 to
// 'level7', 'level129' and 'level6_1'.

export const LEVELS = {
  [LEVEL0.id]: LEVEL0,
  [LEVEL0_2.id]: LEVEL0_2,
  [LEVEL1.id]: LEVEL1,
  [LEVEL1_3.id]: LEVEL1_3,
  [LEVEL1_5.id]: LEVEL1_5,
  [LEVEL2.id]: LEVEL2,
  [LEVEL3.id]: LEVEL3,
  [LEVEL4.id]: LEVEL4,
  [LEVEL5.id]: LEVEL5,
  [LEVEL6.id]: LEVEL6,
  [LEVEL63.id]: LEVEL63,
};

// Names for levels that exits point at but that aren't built yet.
export const UPCOMING = {
  level6_1: 'LEVEL 6.1',
  level7: 'LEVEL 7',
  level9: 'LEVEL 9 — THE SUBURBS',
  level39: 'LEVEL 39',
  level797: 'LEVEL 797',
  level71: 'LEVEL 71',
  level129: 'LEVEL 129',
};

export const FIRST_LEVEL = LEVEL0.id;
