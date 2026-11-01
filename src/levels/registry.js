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
import { LEVEL7 } from './level7/Level7.js';
import { LEVEL63 } from './level63/Level63.js';
import { LEVEL601 } from './level601/Level601.js';
import { LEVEL94 } from './level94/Level94.js';
import { LEVEL14 } from './level14/Level14.js';
import { LEVEL15 } from './level15/Level15.js';
import { LEVEL8 } from './level8/Level8.js';
import { LEVEL9 } from './level9/Level9.js';
import { LEVEL10 } from './level10/Level10.js';
import { LEVEL11 } from './level11/Level11.js';
import { LEVEL12 } from './level12/Level12.js';
import { LEVEL13 } from './level13/Level13.js';

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
// 'level129' and 'level6_1', Level 7 to 'level8', 'level9', 'level83' and 'level880'.

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
  [LEVEL7.id]: LEVEL7,
  [LEVEL63.id]: LEVEL63,
  [LEVEL601.id]: LEVEL601,
  [LEVEL94.id]: LEVEL94,
  [LEVEL14.id]: LEVEL14,
  [LEVEL15.id]: LEVEL15,
  [LEVEL8.id]: LEVEL8,
  [LEVEL9.id]: LEVEL9,
  [LEVEL10.id]: LEVEL10,
  [LEVEL11.id]: LEVEL11,
  [LEVEL12.id]: LEVEL12,
  [LEVEL13.id]: LEVEL13,
};

// Names for levels that exits point at but that aren't built yet.
export const UPCOMING = {
  level6_1: 'LEVEL 6.1',
  level69: 'LEVEL 69',
  level9_1: 'LEVEL 9.1',
  level184: 'LEVEL 184',
  level283: 'LEVEL 283',
  level39: 'LEVEL 39',
  level797: 'LEVEL 797',
  level71: 'LEVEL 71',
  level129: 'LEVEL 129',
  level83: 'LEVEL 83',
  level880: 'LEVEL 880',
  level19: 'LEVEL 19',
  level23: 'LEVEL 23',
  level25: 'LEVEL 25',
  level287: 'LEVEL 287',
  level114: 'LEVEL 114',
  level327: 'LEVEL 327',
  level395: 'LEVEL 395',
  level410: 'LEVEL 410',
  level70: 'LEVEL 70',
  level208: 'LEVEL 208',
  level157: 'LEVEL 157',
  level235: 'LEVEL 235',
  level275: 'LEVEL 275',
  level289: 'LEVEL 289',
  level280: 'LEVEL 280',
  level20: 'LEVEL 20',
  level232: 'LEVEL 232',
  level458: 'LEVEL 458',
  level55: 'LEVEL 55',
  level126: 'LEVEL 126',
  level68: 'LEVEL 68',
  level808: 'LEVEL 808',
  level179: 'LEVEL 179',
  level304: 'LEVEL 304',
  level370: 'LEVEL 370',
  level900: 'LEVEL 900',
  level214: 'LEVEL 214',
  level119: 'LEVEL 119',
  level213: 'LEVEL 213',
  level511: 'LEVEL 511',
  level33: 'LEVEL 33',
  level115: 'LEVEL 115',
  level713: 'LEVEL 713',
  level990: 'LEVEL 990',
  level49: 'LEVEL 49',
  level325: 'LEVEL 325',
  level34: 'LEVEL 34',
  level218: 'LEVEL 218',
  level138: 'LEVEL 138',
  level215: 'LEVEL 215',
  level147: 'LEVEL 147',
};

// Exits that leave the Backrooms altogether.
export const ENDINGS = {
  outside: {
    title: 'YOU MADE IT',
    text: 'Grey sky, wet grass, the sound of a road somewhere. You\'re out. You\'re really out. (Aren\'t you?)',
  },
};

export const FIRST_LEVEL = LEVEL0.id;
