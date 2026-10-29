import { Smiler } from './Smiler.js';
import { Hound } from './Hound.js';
import { Faceling } from './Faceling.js';
import { SkinStealer } from './SkinStealer.js';
import { Deathmoth } from './Deathmoth.js';
import { Clump } from './Clump.js';
import { Duller } from './Duller.js';
import { Partygoer } from './Partygoer.js';
import { Wretch } from './Wretch.js';
import { Woodlin } from './Woodlin.js';
import { Watcher } from './Watcher.js';
import { Nguithrxurh } from './Nguithrxurh.js';
import { Growler } from './Growler.js';
import { Deathrat } from './Deathrat.js';
import { Wrangler } from './Wrangler.js';
import { Samantha } from './Samantha.js';

// The Backrooms entity library. A level opts in by creating an
// EntityManager and spawning what it wants (Level 2 is an example):
//
//   import { EntityManager } from '../../entities/lib/index.js';
//   this.entities = new EntityManager({ scene, world, audio: ctx.audio, rng, shared });
//   this.entities.spawnFar('hound', player, { min: 15, max: 30 });
//   this.entities.spawn('faceling', { x, z, variant: 'hostile' });
//   // Samantha emits { type: 'speak', text } events: show them in the HUD.
//   // each frame, in update(dt, player):
//   const res = this.entities.update(dt, player, ctx);
//   if (res.dead) ctx.onDeath(res.cause);
//   // in dispose():
//   this.entities.dispose();

export const ENTITY_TYPES = {
  smiler: { cls: Smiler, name: 'Smiler', blurb: 'Glowing eyes and a wide grin in the dark. Lunges if you linger, or if you shine a light on it.' },
  hound: { cls: Hound, name: 'Hound', blurb: 'Hairless human body on all fours. Hunts by sound, sprints when it sees you. Stare it down, standing still.' },
  faceling: { cls: Faceling, name: 'Faceling', blurb: 'Ordinary people with blank faces. Most only watch you. Variants: passive, hostile, child.' },
  skinstealer: { cls: SkinStealer, name: 'Skin-Stealer', blurb: 'Looks like a lost wanderer calling for help. Too close, or turn your back, and the skin comes off.' },
  deathmoth: { cls: Deathmoth, name: 'Deathmoth', blurb: 'Dog-sized moths that circle lights and your flashlight. Variants: drone (passive), soldier (dives at you).' },
  clump: { cls: Clump, name: 'Clump', blurb: 'A knot of fused limbs. Waits in tight spaces, lunges when you pass, then drags itself after you.' },
  duller: { cls: Duller, name: 'Duller', blurb: 'A washed-out grey figure that fades when still. Unpredictable. Its touch festers.' },
  partygoer: { cls: Partygoer, name: 'Partygoer', blurb: 'Yellow, smiling, delighted to see you. Waves, dances, invites you along. =)' },
  wretch: { cls: Wretch, name: 'Wretch', blurb: 'Skinless, hunched, lopsided. Twitches and shambles until provoked, then charges in a zig-zag.' },
  woodlin: { cls: Woodlin, name: 'Woodlin', blurb: 'A jointed figure of dark wood, like a forgotten mannequin. Still while watched; look away and it clatters closer.' },
  watcher: { cls: Watcher, name: 'Watcher', blurb: 'A giant floating eyeball trailing optic nerves. Its pupil swells, then a beam turns you to dust. Break its line of sight.' },
  nguithrxurh: { cls: Nguithrxurh, name: 'Nguithr\'xurh', blurb: 'Grey, insect-like, all limbs. Hangs on the ceiling by its round web and drops on whoever walks beneath.' },
  growler: { cls: Growler, name: 'Growler', blurb: 'A hulk of twisted cables. Immensely strong, not bright: charges noise in a straight line and hits walls.' },
  deathrat: { cls: Deathrat, name: 'Deathrat', blurb: 'Rats adapted to the Backrooms, coloured by where they live. Forage, flee light, bite when cornered. Variants: grey, pale, rust.' },
  wrangler: { cls: Wrangler, name: 'Wrangler', blurb: 'A huge burrowing snake with a face. Surfaces near you and sways; watch it and you walk to it. Variants: human, insect.' },
  samantha: { cls: Samantha, name: 'Samantha', blurb: 'A talking black-and-white cat with green eyes and sharp teeth. Readings for meat. Provoke her, or don\'t pay, and she bites.' },
};

export class EntityManager {
  /**
   * @param {object} ctx { scene, world (GridWorld), audio, rng, shared }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.infection = 0; // seconds of Duller infection left
    this.lastCause = null;
  }

  spawn(type, opts = {}) {
    const def = ENTITY_TYPES[type];
    if (!def) throw new Error(`Unknown entity type: ${type}`);
    const e = new def.cls({ ...this.ctx, rng: this.ctx.rng.fork(type + this.list.length) }, opts);
    e.type = type;
    this.list.push(e);
    return e;
  }

  // Spawn somewhere reachable `min`..`max` metres away and out of sight.
  spawnFar(type, player, { min = 12, max = 30, opts = {}, visible = false } = {}) {
    const { map } = this.ctx.world;
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    const dist = map.bfs(px, py);
    const cands = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < 0) continue;
      const [x, z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (d < min || d > max) continue;
      if (!visible && map.hasLineOfSight(player.pos.x, player.pos.z, x, z)) continue;
      cands.push([x, z]);
    }
    if (!cands.length) return null;
    const [x, z] = this.ctx.rng.pick(cands);
    return this.spawn(type, { ...opts, x, z });
  }

  remove(e) {
    e.dispose();
    this.list = this.list.filter((o) => o !== e);
  }

  /**
   * Run every entity's AI and apply their attacks to the player.
   * `fx` (optional) is the level ctx, used for hurtFlash/vibrate.
   * Returns { events, dead, cause }.
   */
  update(dt, player, fx = null) {
    const events = [];
    for (const e of this.list) {
      for (const ev of e.update(dt, player)) {
        ev.entity = e;
        events.push(ev);
        if (ev.type !== 'attack' || player.dead) continue;
        if (ev.damage) player.damage(ev.damage);
        if (ev.sanity) player.sanity = Math.max(0, player.sanity - ev.sanity);
        if (ev.infect) this.infection = Math.max(this.infection, ev.infect);
        this.lastCause = ev.cause;
        if (fx) {
          fx.hurtFlash?.(Math.min(0.85, (ev.damage || 5) / 35));
          fx.vibrate?.([80, 30, 120]);
          fx.audio?.hurt?.();
        }
      }
    }
    // Duller infection: a slow drain on health while it runs its course.
    if (this.infection > 0) {
      this.infection -= dt;
      player.health = Math.max(0, player.health - 0.9 * dt);
      player.hurtAgo = 0;
    }
    const dead = player.health <= 0 || player.sanity <= 0;
    return { events, dead, cause: this.lastCause || 'Something in the Backrooms found you.' };
  }

  dispose() {
    for (const e of this.list) e.dispose();
    this.list = [];
    this.infection = 0;
  }
}

export { Smiler, Hound, Faceling, SkinStealer, Deathmoth, Clump, Duller, Partygoer, Wretch, Woodlin, Watcher, Nguithrxurh, Growler, Deathrat, Wrangler, Samantha };
