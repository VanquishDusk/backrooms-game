import { LEVEL0 } from './level0/Level0.js';
import { LEVEL0_2 } from './level0_2/Level02.js';

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
//   atmosphere(dt, player)      fog + post-processing values
//   hudInfo(player)             { warn, warnCovered, coverLabel, health }
//   dispose()
//
// Levels hand control onward with ctx.onEscape(targetId, 'noclip' | 'door').
// The player's sanity, health, battery and Almond Water carry over.
//
// To add Level 1: create src/levels/level1/Level1.js exporting LEVEL1 and
// add it to LEVELS below. Level 0's flickering wall already points at 'level1'.

export const LEVELS = {
  [LEVEL0.id]: LEVEL0,
  [LEVEL0_2.id]: LEVEL0_2,
};

export const FIRST_LEVEL = LEVEL0.id;
