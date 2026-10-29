import { LEVEL0 } from './level0/Level0.js';
import { LEVEL0_2 } from './level0_2/Level02.js';
import { LEVEL1 } from './level1/Level1.js';
import { LEVEL1_3 } from './level1_3/Level13.js';

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
// Unbuilt targets show a "coming soon" screen (see UPCOMING). Level 1's
// exit hallway already points at 'level2'.

export const LEVELS = {
  [LEVEL0.id]: LEVEL0,
  [LEVEL0_2.id]: LEVEL0_2,
  [LEVEL1.id]: LEVEL1,
  [LEVEL1_3.id]: LEVEL1_3,
};

// Names for levels that exits point at but that aren't built yet.
export const UPCOMING = {
  level2: 'LEVEL 2 — PIPE DREAMS',
};

export const FIRST_LEVEL = LEVEL0.id;
