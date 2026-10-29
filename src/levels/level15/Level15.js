import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js';
import { Colliders } from '../level94/kit.js';
import { buildHumanoid, resetPose, idle } from '../../entities/lib/rig.js';
import { P, W, GLYPHS, textures, blockPlan, buildBlock } from './halls.js';

// Level 15 — "Futuristic Halls".
//
// White vaulted halls with steel ribs and huge ducts along the crown,
// polished floors, glowing wall panels and mint-green tiles, a band of
// strange symbols running along every wall. Behind reinforced doors:
// machines (some still making steel rods, some too big to see the top of,
// some torn apart), laboratories, dormitories, kitchens, control rooms,
// storage. People in lab coats lie where they fell. A few halls are dark.
//
// It's quiet and safe: nothing alive here but you, and Enric, who came in
// two years ago from Level 10 and never found the way out. The computers
// still connect to the I.L.N. Read enough of the files and you'll find
// the door with no symbol on it, and the stairs behind it, up into daylight.

const ENRIC_BLOCK = [1, 0];
const FILES = [
  { text: 'ᚦᚨ ᛗᚨᚲᚺᛁᚾ ⟁ᛊ ᚲᛟᚾᛏᛁᚾᚢᛖ ⟒ ᛟᚢᛏᛈᚢᛏ', gloss: '"...the [MACHINES] continue without us. [OUTPUT]: rods. [OUTPUT]: unknown..."' },
  { text: '⟐ᚨᚠᛏᛖᚱ ᛁᚾᚲᛁᛞ ᛞᛟᛟᚱᛊ ᛗᚨᚱᚲᛖᛞ ⟓ ᚨᛚᛚ ᛒᚢᛏ ᛟᚾᛖ', gloss: '"...after the [INCIDENT] every door was marked. Every door but one..."' },
  { text: 'ᚢᚾᛗᚨᚱᚲ ᛞᛟᛟᚱ ⟡ ᚢᛈ ᛚᛁᚷᚺᛏ ⟊ ᚺᛟᚢᚾᛞᛊ ᚾᛟᛏ', gloss: '"...the unmarked door leads [UP], to [LIGHT]. Do not let the [HOUNDS] near it..."' },
];
const ENRIC_LINES = [
  'ENRIC: "Oh! Oh, wow. A person. A real person. Sorry. I haven\'t talked to anyone in... two years? Two years."',
  'ENRIC: "I\'m Enric. I came in from Level 10, through a door that was gone two days later."',
  'ENRIC: "It\'s safe here. Nothing alive, anyway. Just the machines, and the people in lab coats. They were here before me. Something happened to them."',
  'ENRIC: "There\'s no Almond Water anywhere in this place. Here, take a bottle. I\'ve got a few left."',
  'ENRIC: "The computers still connect to the I.L.N. The files are in a language nobody can read, but I\'ve been working on it. Every computer has a piece. Read them."',
  'ENRIC: "Three of them talk about a door with no symbol over it. Two years, and I\'ve never found it. Maybe it\'s waiting for someone new."',
  'ENRIC: "If you find it... no. Don\'t come back for me. Just go. Get out."',
];

export class Level15 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.cameraFar = 300;
    this.noLight = false;
    this.own = { geos: [], mats: [], textures: [] };
    const { T, M } = textures(this.own);
    this.T = T;
    this.M = M;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(12);
    this.blocks = new Map();
    this.overrides = { [ENRIC_BLOCK.join(',')]: { type: 'enric', door: 0, dark: false, panels: true } };
    this.hemi = new THREE.HemisphereLight(0xf4f6f8, 0x8a8c88, 1.0);
    this.group.add(this.hemi);
    this.pool = Array.from({ length: 8 }, () => {
      const l = new THREE.PointLight(0xf4f8ff, 0, 18, 1.4);
      this.group.add(l);
      return l;
    });
    this.spot = new THREE.SpotLight(0xfff0e0, 0, 30, 0.45, 0.5, 1.2);
    this.group.add(this.spot, this.spot.target);

    this.spawn = { x: P + W / 2, z: 12, yaw: Math.PI };
    this.world = {
      collide: (pos, r) => this.colliders.collide(pos, r),
      groundAt: () => 0,
      sampleLight: () => [0.8, 0.8, 0.8],
    };
    this.time = 0;
    this.done = false;
    this.told = {};
    this.read = new Set();
    this.files = 0;
    this.enricLine = 0;
    this.nextEnric = 0;
    this.darkness = 0;
    this.fog = new THREE.Color();
    this.buildEnric();
    this.updateBlocks({ pos: { x: this.spawn.x, z: this.spawn.z } });
    this.script = [
      [1.5, 'A white hall, curving overhead like a tunnel. Clean, bright and completely silent.'],
      [7, 'Somewhere nearby, someone is typing.'],
    ];
  }

  plan(i, j) {
    return blockPlan(i, j, this.seed, this.overrides);
  }

  // ---- Streaming blocks ----------------------------------------------------------------

  updateBlocks(player) {
    const ci = Math.floor(player.pos.x / P), cj = Math.floor(player.pos.z / P);
    if (ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const keep = new Set();
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const key = `${i},${j}`;
      keep.add(key);
      if (this.blocks.has(key)) continue;
      this.blocks.set(key, this.makeBlock(i, j));
    }
    for (const [key, b] of this.blocks) {
      if (keep.has(key)) continue;
      this.group.remove(b.group);
      for (const g of b.geos) g.dispose();
      for (const s of b.solids) this.colliders.remove(s);
      this.blocks.delete(key);
    }
  }

  makeBlock(i, j) {
    const plan = { ...this.plan(i, j) };
    const neighbours = { east: this.plan(i + 1, j), south: this.plan(i, j + 1) };
    let s = Math.floor(this.seed + i * 7919 + j * 104729) % 2147483646 + 1;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const built = buildBlock(i, j, plan, neighbours, this.M, rnd);
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const group = built.kit.build(this.M, own);
    for (const sol of built.solids) this.colliders.add(sol);
    const b = { i, j, plan, group, geos: own.geos, solids: built.solids, lights: built.lights, computers: built.computers, anims: built.anims, rods: [] };
    for (const e of built.extra) {
      if (e.kind !== 'rods') continue;
      own.geos.push(e.geo);
      for (const m of e.rods) {
        m.material = this.M.rod;
        group.add(m);
      }
      b.rods.push(e);
    }
    this.group.add(group);
    return b;
  }

  // ---- Enric ------------------------------------------------------------------------------

  buildEnric() {
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a5a3a });
    const trousers = new THREE.MeshLambertMaterial({ color: 0x2a2e3a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc8a088 });
    const hair = new THREE.MeshLambertMaterial({ color: 0x3a2a1e });
    this.own.mats.push(shirt, trousers, skin, hair);
    const rig = buildHumanoid({ mat: shirt, legMat: trousers, headMat: skin, handMat: skin, footMat: trousers, legLen: 0.88, torsoLen: 0.56 });
    this.own.geos.push(...rig.geos);
    // A beard and a mess of hair: he's been here a while.
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hair);
    beard.scale.set(1, 1.1, 0.8);
    beard.position.set(0, 0.06, 0.07);
    const mop = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), hair);
    mop.position.set(0, 0.2, -0.02);
    mop.scale.set(1.05, 0.8, 1.1);
    rig.head.add(beard, mop);
    this.own.geos.push(beard.geometry, mop.geometry);
    const [bi, bj] = ENRIC_BLOCK;
    const x0 = bi * P + W + 0.3, x1 = bi * P + P - 0.3, z0 = bj * P + W + 0.3;
    this.enric = { rig, x: (x0 + x1) / 2, z: z0 + 7.3 };
    rig.root.position.set(this.enric.x, 0, this.enric.z);
    rig.root.rotation.y = Math.PI;
    this.group.add(rig.root);
    // His chair.
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), this.M.dark);
    chair.position.set(this.enric.x, 0.48, this.enric.z + 0.05);
    this.own.geos.push(chair.geometry);
    this.group.add(chair);
  }

  updateEnric(dt, player) {
    const { ctx } = this;
    const E = this.enric;
    const rig = E.rig;
    resetPose(rig);
    idle(rig, this.time, 1);
    const d = Math.hypot(player.pos.x - E.x, player.pos.z - E.z);
    // Sitting at the console; he turns round when you come in.
    rig.hips.position.y = 0.5;
    rig.legL.hip.rotation.x = rig.legR.hip.rotation.x = -1.5;
    rig.legL.knee.rotation.x = rig.legR.knee.rotation.x = 1.5;
    const want = d < 9 ? Math.atan2(player.pos.x - E.x, player.pos.z - E.z) : Math.PI;
    let diff = want - rig.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    rig.root.rotation.y += diff * Math.min(1, dt * 3);
    if (d > 9) {
      // Typing.
      rig.armL.shoulder.rotation.x = rig.armR.shoulder.rotation.x = -1.1;
      rig.armL.elbow.rotation.x = -0.3 + Math.sin(this.time * 14) * 0.08;
      rig.armR.elbow.rotation.x = -0.3 + Math.cos(this.time * 13) * 0.08;
      if (d < 22 && this.rng.chance(dt * 6)) ctx.audio.keyclick?.(0.03);
      return;
    }
    rig.armR.shoulder.rotation.z = this.enricLine < 2 ? 2.4 + Math.sin(this.time * 8) * 0.3 : 0.2;
    this.nextEnric -= dt;
    if (this.nextEnric <= 0 && this.enricLine < ENRIC_LINES.length) {
      ctx.hud.message(ENRIC_LINES[this.enricLine], 6.5);
      ctx.audio.voice?.(this.panTo(player, E.x, E.z), 0.18);
      if (this.enricLine === 3) {
        if (player.give('water')) ctx.audio.pickup();
        else ctx.hud.message('ENRIC: "Your bag\'s full? Huh. Another time."', 3);
      }
      this.enricLine++;
      this.nextEnric = 6.5;
      this.metEnric = true;
    }
  }

  // ---- Per frame ----------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    this.updateBlocks(player);
    this.updateLights(dt, player);
    this.updateEnric(dt, player);
    this.updateComputers(dt, player);
    this.updateAnims(dt, player);
    this.updateExit(dt, player);
    if (this.done) return;
    // Quiet and safe, but lonely; the dark halls are worse.
    player.sanity = Math.max(0, player.sanity - (0.03 + this.darkness * 0.25) * dt);
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('You sat down against a white wall and stopped looking for the way out.');
    }
  }

  // Where is the player: lit hall, dark hall, or a room?
  areaAt(x, z) {
    const i = Math.floor(x / P), j = Math.floor(z / P);
    const lx = x - i * P, lz = z - j * P;
    const b = this.blocks.get(`${i},${j}`);
    if (!b) return { dark: 0 };
    if (lx < W || lz < W) return { dark: b.plan.dark ? 1 : 0, hall: true };
    return { dark: b.plan.type === 'broken' ? 0.6 : 0, room: b.plan.type };
  }

  updateLights(dt, player) {
    const area = this.areaAt(player.pos.x, player.pos.z);
    this.area = area;
    this.darkness += (area.dark - this.darkness) * Math.min(1, dt * 2);
    this.hemi.intensity = (this.area.room ? 1.5 : 1.05) * (1 - this.darkness * 0.92);
    const cands = [];
    for (const b of this.blocks.values()) for (const l of b.lights) {
      if (!l.on) continue;
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d < 40) cands.push([l, d]);
    }
    cands.sort((a, b) => a[1] - b[1]);
    this.pool.forEach((pl, k) => {
      const c = cands[k];
      if (!c) {
        pl.intensity = 0;
        return;
      }
      const l = c[0];
      pl.position.set(l.x, l.y, l.z);
      let k2 = 1;
      if (l.flicker) k2 = Math.sin(this.time * 23 + l.x) > 0.3 ? 1 : 0.1;
      pl.intensity = (l.room ? 9 : 7) * k2;
    });
    const cp = Math.cos(player.pitch);
    const f = new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
    this.spot.position.set(player.pos.x, player.eye - 0.1, player.pos.z);
    this.spot.target.position.copy(this.spot.position).addScaledVector(f, 10);
    this.spot.intensity = player.flashlight ? 30 : 0;
  }

  updateComputers(dt, player) {
    const { ctx } = this;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const b of this.blocks.values()) for (const c of b.computers) {
      const d = Math.hypot(c.ux - player.pos.x, c.uz - player.pos.z);
      if (d > 1.1) continue;
      const dx = c.x - player.pos.x, dz = c.z - player.pos.z;
      if ((dx * fx + dz * fz) / Math.max(Math.hypot(dx, dz), 0.01) < 0.5) continue;
      const key = `${b.i},${b.j},${Math.round(c.x)},${Math.round(c.z)}`;
      if (this.read.has(key)) continue;
      this.read.add(key);
      ctx.audio.keyclick?.(0.08);
      if (this.files < FILES.length) {
        const f = FILES[this.files++];
        ctx.hud.message(`I.L.N. FILE ${this.files} / ${FILES.length}: ${f.text}  —  ${f.gloss}`, 8);
        if (this.files === FILES.length) setTimeout(() => !this.disposed && !this.done && this.placeExit(player), 8200);
      } else {
        let t = '';
        for (let k = 0; k < 28; k++) t += k % 6 === 5 ? ' ' : GLYPHS[Math.floor(this.rng.next() * GLYPHS.length)];
        ctx.hud.message(`I.L.N.: ${t}  (Nothing you can make sense of.)`, 4);
      }
    }
    if (!this.told.computer) {
      for (const b of this.blocks.values()) for (const c of b.computers) {
        if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 4) {
          this.told.computer = true;
          ctx.hud.message('A computer, still on. The screen is full of a script you\'ve never seen. Stand at it to read.', 4);
        }
      }
    }
  }

  // The fragments fit together: a door with no symbol, somewhere near.
  placeExit(player) {
    const ci = Math.floor(player.pos.x / P), cj = Math.floor(player.pos.z / P);
    const opts = [];
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      const m = Math.max(Math.abs(dx), Math.abs(dz));
      if (m < 3 || Math.abs(dx) + Math.abs(dz) > 6) continue;
      opts.push([ci + dx, cj + dz]);
    }
    const [i, j] = this.rng.pick(opts);
    this.overrides[`${i},${j}`] = { type: 'exit', door: this.rng.int(0, 3), dark: false, panels: true };
    this.exitBlock = [i, j];
    const ex = i * P + P / 2 + W / 2, ez = j * P + P / 2 + W / 2;
    const dx = ex - player.pos.x, dz = ez - player.pos.z;
    const ahead = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw);
    const right = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
    const dir = `${Math.abs(ahead) > 20 ? (ahead > 0 ? 'ahead' : 'behind you') : ''}${Math.abs(ahead) > 20 && Math.abs(right) > 20 ? ' and ' : ''}${Math.abs(right) > 20 ? (right > 0 ? 'to your right' : 'to your left') : ''}`;
    this.ctx.hud.message(`The three pieces fit together: a map. A door with no symbol over it, ${dir}, maybe ${Math.round(Math.hypot(dx, dz) / 10) * 10} metres away. You feel a draught from that way.`, 8);
  }

  updateExit(dt, player) {
    if (!this.exitBlock) return;
    const b = this.blocks.get(this.exitBlock.join(','));
    if (!b || !b.plan.stairs) return;
    const s = b.plan.stairs;
    if (!this.told.exitRoom && Math.hypot(s.x - player.pos.x, s.z + 6 - player.pos.z) < 14 && this.areaAt(player.pos.x, player.pos.z).room === 'exit') {
      this.told.exitRoom = true;
      this.ctx.hud.message('Stairs, going up. At the top: daylight. Real daylight.', 4);
    }
    if (Math.abs(player.pos.x - s.x) < 1.6 && player.pos.z > s.z - 0.5 && player.pos.z < s.z + 7.2 && this.areaAt(player.pos.x, player.pos.z).room === 'exit') {
      this.done = true;
      this.ctx.hud.message('You climb towards the light. The air changes. It smells of rain.', 4);
      this.ctx.onEscape('outside', 'walk');
    }
  }

  updateAnims(dt, player) {
    let machine = 0, mpan = 0;
    for (const b of this.blocks.values()) {
      for (const e of b.rods) {
        e.rods.forEach((m, k) => {
          const t = (this.time * 0.07 + k / e.rods.length) % 1;
          m.position.set(e.x, e.y, e.z0 + t * (e.z1 - e.z0));
        });
      }
      for (const a of b.anims) {
        const d = Math.hypot(a.x - player.pos.x, a.z - player.pos.z);
        const v = a.kind === 'big' ? 0.4 * Math.max(0, 1 - d / 45) : a.kind === 'machine' ? 0.3 * Math.max(0, 1 - d / 28) : 0;
        if (v > machine) {
          machine = v;
          mpan = this.panTo(player, a.x, a.z) * 0.7;
        }
        if (a.kind === 'sparks' && d < 20 && this.rng.chance(dt * 0.6)) this.ctx.audio.arc?.(this.panTo(player, a.x, a.z), 0.15);
      }
    }
    this.machine = machine;
    this.machinePan = mpan;
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. There isn\'t any on this level.', 1.8);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    let waves = 0, wavesPan = 0;
    if (this.exitBlock) {
      const ex = this.exitBlock[0] * P + P / 2, ez = this.exitBlock[1] * P + P / 2;
      const d = Math.hypot(ex - player.pos.x, ez - player.pos.z);
      waves = 0.18 / (1 + (d / 60) ** 2);
      wavesPan = this.panTo(player, ex, ez) * 0.8;
    }
    return {
      hum: 0.05 * (1 - this.darkness), exitGain: 0, exitPan: 0, drone: this.darkness * 0.12,
      machine: this.machine || 0, machinePan: this.machinePan || 0, jazz: 0, wind: 0,
      waves, wavesPan, sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    this.fog.setRGB(0.8, 0.82, 0.82).lerp(new THREE.Color(0.02, 0.025, 0.03), this.darkness);
    return {
      fogColor: this.fog,
      fogDensity: 0.016 + this.darkness * 0.05,
      warp: insane * insane,
      aberr: 0.12 + insane * 0.6,
      grain: 0.05,
      soften: 0.2,
    };
  }

  hudInfo() {
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.group);
    for (const b of this.blocks.values()) for (const g of b.geos) g.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL15 = {
  id: 'level15',
  number: 15,
  name: 'Level 15',
  title: 'Futuristic Halls',
  difficulty: 0,
  next: 'outside',
  create: (ctx) => new Level15(ctx),
};

