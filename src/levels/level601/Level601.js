import * as THREE from 'three';
import { GridWorld } from '../../world/GridWorld.js';
import { EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';
import { SURFACE } from '../../world/materials.js';
import { disposeTextures } from '../../world/props.js';
import { EntityManager } from '../../entities/lib/index.js';
import { generateLevel601, CELL, HEIGHT, KIND, HALL, STORE_TOP, COLS, ROWS } from './layout.js';
import { libraryTextures, buildLibrary, setLetters, drawScreen } from './build.js';
import { buildField, FIELD } from './field.js';
import { Host, Ghost } from './Host.js';

// Level 601 — "The End".
//
// An endless bookshop that looks like the way out of the Backrooms. It's
// bright and almost silent: a slow piano somewhere, the buzz of the old
// computers on the desks. You can't leave, and you can't die here either:
// whatever happens, you wake up at the front desk and it starts again.
//
// The level is the thing you're fighting, and it never says so:
//   1  find the computer that's awake; type; the Partygoers come while you do
//   -> the screen fills with white: a field, a vending machine, the sky
//   2  back in the shop, which has changed: walls where there were none,
//      lights out
//   3  people you can't quite see; something tall at the end of the aisles
//   4  THE END IS HERE. The host walks after you, and a door at the back
//      opens onto a hallway that loops until you follow the piano
//   -> a house in a sunny field, door open: Level 94

const H = HEIGHT;
const TEXTS = {
  1: ['> HELLO.', '> YOU MADE IT OUT.', '> THIS IS THE END.', '> WOULD YOU LIKE TO GO HOME? Y'],
  2: ['> YOU CAME BACK.', '> THAT WAS HOME, WASN\'T IT?', '> THE END IS NEAR.', '> TRY AGAIN? Y'],
  3: ['> YOU KEEP LEAVING.', '> EVERYONE STAYS, IN THE END.', '> THE JUNKIES STAYED.', '> ONE MORE TIME? Y'],
};
const HINTS = {
  1: ['THE END BOOKS', 'CATALOGUE OFFLINE', '', 'PLEASE SEE THE', 'EAST DESK.'],
  2: ['THE END BOOKS', '', 'PLEASE SEE THE', 'WEST DESK.'],
  3: ['THE END BOOKS', '', 'PLEASE SEE THE DESK', 'UNDER THE SIGN.'],
  4: ['THE END IS HERE.', '', 'THE DOOR IS OPEN.', 'BACK LEFT CORNER.'],
};
const WAKE = [
  'You wake up at the front desk. The piano is still playing.',
  'You wake up at the front desk. Nobody else is here. Nobody was ever here.',
  'You wake up at the front desk. It\'s as if you never left it.',
  'You wake up at the front desk. The end is near.',
];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Level601 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    this.noLight = true;
    this.cameraFar = 1000;
    this.own = { geos: [], mats: [], textures: [] };
    const L = (this.layout = generateLevel601(rng.fork('layout')));
    this.map = L.map;
    const T = (this.T = libraryTextures(renderer, this.own));
    this.textures = {
      wall: T.wall,
      floor: T.carpet,
      ceiling: T.ceiling,
      floors: { back: { map: T.backCarpet, scale: 1 / 2.5, surface: SURFACE.FLOOR } },
      walls: { hall: T.hallWall, sage: { map: T.sage, scale: 1 } },
    };
    shared.ceilH.value = H;
    const isHall = (x, y) => L.map.inBounds(x, y) && L.kind[L.map.idx(x, y)] === KIND.HALL;
    this.grid = new GridWorld({
      map: L.map,
      lights: L.lights,
      textures: this.textures,
      shared,
      texScale: { wall: [1 / 2.5, 1 / H], floor: 1 / 2, ceiling: 1 / 1.25 },
      floorStyle: (x, y) => (L.kind[L.map.idx(x, y)] === KIND.BACK ? 'back' : 'floor'),
      wallStyle: (e) => (e.h ? isHall(e.x, e.y) || isHall(e.x, e.y - 1) : isHall(e.x, e.y) || isHall(e.x - 1, e.y)) ? 'hall' : 'wall',
      pillars: L.pillars.map((p) => ({ x: (p.x + 0.5) * CELL, z: (p.y + 0.5) * CELL, size: 0.72, style: 'sage' })),
      panelSize: [0.62, 1.22],
      dampAt: () => 0,
    });
    scene.add(this.grid.group);
    this.lib = buildLibrary(L, shared, T, this.own);
    scene.add(this.lib.group);
    setLetters(this.lib, 'THE END', this.own);
    this.field = buildField(rng.fork('field'), this.own);
    this.field.group.visible = false;
    scene.add(this.field.group);
    this.entities = new EntityManager({ scene, world: this.grid, audio: ctx.audio, rng: this.rng.fork('entities'), shared });

    this.fieldWorld = {
      collide: (pos, r) => this.collideField(pos, r),
      groundAt: (x, z) => this.field.heightAt(x, z),
      sampleLight: () => [1, 1, 1],
      map: L.map,
    };
    this.spawn = { ...L.spawn };
    this.checkpoint = { ...L.front };
    this.area = 'store';
    this.act = 1;
    this.visit = 0;
    this.time = 0;
    this.done = false;
    this.told = {};
    this.typing = { progress: 0, started: false };
    this.appeared = [];
    this.nextWall = 25;
    this.nextGlimpse = 30;
    this.host = null;
    this.ghosts = [];
    this.seg = 0;
    this.correct = this.rng.chance(0.5) ? 'north' : 'south';
    this.final = false;
    this.screenTimer = 0;
    this.msgTimer = 0;
    this.fog = new THREE.Color();
    this.trans = null;
    this.vend = null;
    // Something to fill the screen with white.
    this.white = document.createElement('div');
    Object.assign(this.white.style, { position: 'fixed', inset: '0', background: '#fff', opacity: '0', pointerEvents: 'none', zIndex: '8', transition: 'none' });
    document.body.appendChild(this.white);
    for (const d of L.desks) {
      const s = d.screen;
      d.spot = { x: s.x + Math.sin(s.rot) * 1.05, z: s.z + Math.cos(s.rot) * 1.05 };
    }
    this.drawScreens();
    this.script = [
      [1.5, 'A bookshop. Bright, warm, and completely quiet. It looks like the way out.'],
      [7, 'The door you came in by has gone dark. Behind the glass there\'s only white.'],
      [14, 'Somewhere, someone is playing a piano.'],
      [22, 'The computer on the front desk is on.'],
    ];
    this.lib.frontNeon.material.color.setRGB(1, 1, 1);
  }

  get world() {
    return this.area === 'field' || this.area === 'end' ? this.fieldWorld : this.grid;
  }

  // ---- Per frame -------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    if (player.flashlight) player.flashlight = false;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    if (this.trans) {
      this.updateTransition(dt, player);
      if (this.done) return;
    }
    if (this.area === 'store' || this.area === 'hall') this.updateLibrary(dt, player);
    else this.updateField(dt, player);
    if (this.done || this.trans) return;
    // You can't die here. You just start again.
    if (player.health <= 0 || player.sanity <= 0) this.wake(player, player.health <= 0 ? 'hurt' : 'mind');
  }

  updateLibrary(dt, player) {
    const { ctx, map } = this;
    const L = this.layout;
    this.area = player.pos.z < STORE_TOP * CELL ? 'hall' : 'store';
    this.grid.flush();
    // The front neon dies a few seconds after you arrive.
    if (this.time > 6 && !this.told.neon) {
      this.told.neon = true;
      this.lib.frontNeon.material.color.setRGB(0.05, 0.02, 0.02);
      ctx.audio.flickerBuzz?.(0.6, 0.1);
    }
    // Entities.
    const res = this.entities.update(dt, player, ctx);
    for (const ev of res.events) {
      if (ev.type === 'caught') {
        ctx.audio.jumpscare();
        this.wake(player, 'host');
        return;
      }
      if (ev.type === 'vanish' && ev.entity === this.host) this.removeHost();
    }
    for (const e of this.entities.list) if (e.type !== 'ghost') e.root.visible = e.distTo(player) < 45;
    this.updateTerminals(dt, player);
    if (this.trans) return;
    // The glass front doors.
    if (player.pos.z > (ROWS - 1.2) * CELL && Math.abs(player.pos.x - 30.7 * CELL) < 4.5 && !this.told.glass) {
      this.told.glass = true;
      ctx.hud.message('The doors are locked. The light outside isn\'t outside.', 3);
    }
    if (this.act >= 2 && this.area === 'store') this.updateWalls(dt, player);
    if (this.act === 3) this.updateGlimpses(dt, player);
    if (this.act === 4) this.updateHunt(dt, player);
    if (this.area === 'hall') this.updateHall(dt, player);
    // The level wears on you.
    const hostNear = this.host && this.host.mode === 'hunt' ? Math.max(0, 1 - this.host.distTo(player) / 15) : 0;
    player.sanity = Math.max(0, player.sanity - (this.act >= 3 ? 0.2 : 0.1) * dt - hostNear * 0.5 * dt);
    void map;
    void L;
  }

  // ---- Terminals -------------------------------------------------------------------

  targetDesk() {
    return this.act <= 3 ? this.layout.desks[this.act] : null;
  }

  drawScreens() {
    const blink = Math.floor(this.time * 2) % 2 === 0;
    for (const d of this.layout.desks) {
      let lines, on = true, cursor = false;
      if (this.act === 4) {
        lines = ['THE END IS HERE.', 'THE END IS HERE.', 'THE END IS HERE.', 'THE END IS HERE.', ''];
        cursor = blink;
      } else if (d.name === 'front') {
        lines = HINTS[this.act];
      } else if (d === this.targetDesk()) {
        const full = TEXTS[this.act];
        const total = full.join('').length;
        let n = Math.floor(this.typing.progress * total);
        lines = [];
        for (const l of full) {
          if (n <= 0) break;
          lines.push(l.slice(0, n));
          n -= l.length;
        }
        if (!lines.length) lines = ['> _'.slice(0, 2)];
        cursor = blink;
      } else {
        on = false;
        lines = [];
      }
      drawScreen(d.ctx2d, lines, cursor, on);
      d.tex.needsUpdate = true;
    }
  }

  updateTerminals(dt, player) {
    const { ctx } = this;
    this.screenTimer -= dt;
    if (this.screenTimer <= 0) {
      this.screenTimer = 0.15;
      this.drawScreens();
    }
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    // Read the front desk's screen.
    const front = this.layout.desks[0];
    const df = Math.hypot(front.spot.x - player.pos.x, front.spot.z - player.pos.z);
    if (df < 1.6 && this.told.readFront !== this.act) {
      this.told.readFront = this.act;
      ctx.hud.message(`The screen says: ${HINTS[this.act].filter(Boolean).join(' ')}`, 5);
    }
    const d = this.targetDesk();
    if (!d) return;
    const dx = d.screen.x - player.pos.x, dz = d.screen.z - player.pos.z;
    const dist = Math.hypot(d.spot.x - player.pos.x, d.spot.z - player.pos.z);
    const facing = (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz));
    if (dist > 1.3 || facing < 0.4) {
      if (this.typing.started && this.typing.progress < 1 && dist > 3 && !this.told[`left${this.act}`]) {
        this.told[`left${this.act}`] = true;
        ctx.hud.message('The cursor blinks, waiting for you to come back.', 2.5);
      }
      return;
    }
    const t = this.typing;
    if (!t.started) {
      t.started = true;
      ctx.hud.message('You start typing. Somewhere behind the shelves, someone giggles.', 3.5);
      for (let k = 0; k < this.act; k++) this.entities.spawnFar('partygoer', player, { min: 14, max: 28 });
    }
    t.progress = Math.min(1, t.progress + dt / 7);
    if (this.rng.chance(dt * 10)) ctx.audio.keyclick?.(0.07);
    this.msgTimer -= dt;
    if (this.msgTimer <= 0) {
      this.msgTimer = 0.4;
      const full = TEXTS[this.act];
      const total = full.join('').length;
      let n = Math.floor(t.progress * total), line = '';
      for (const l of full) {
        if (n <= 0) break;
        line = l.slice(0, n);
        n -= l.length;
      }
      ctx.hud.message(line, 0.8);
    }
    if (t.progress >= 1) this.startTransition('white', () => this.enterField(player, this.act));
  }

  // ---- The shop changing ---------------------------------------------------------------

  // Walls appear where there weren't any, out of sight behind you.
  updateWalls(dt, player) {
    const max = this.act === 2 ? 8 : this.act === 3 ? 16 : 22;
    this.nextWall -= dt * (player.speed > 0.5 ? 1 : 0.3);
    if (this.nextWall > 0 || this.appeared.length >= max) return;
    this.nextWall = this.rng.range(14, 26);
    const { map } = this;
    const L = this.layout;
    const free = (x, y) => map.inBounds(x, y) && (L.kind[map.idx(x, y)] === KIND.FLOOR || L.kind[map.idx(x, y)] === KIND.BACK);
    for (let tries = 0; tries < 60; tries++) {
      const x = this.rng.int(1, COLS - 2), y = this.rng.int(STORE_TOP + 1, ROWS - 9);
      const k = this.rng.pick([0, 2]);
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (!free(x, y) || !free(nx, ny)) continue;
      const e = map.edge(x, y, k);
      if (map.getEdge(e) !== EDGE_OPEN) continue;
      const [cx, cz] = map.cellCenter(x, y);
      const d = Math.hypot(cx - player.pos.x, cz - player.pos.z);
      if (d < 7 || d > 22 || !this.unseen(player, cx, cz)) continue;
      if (L.desks.some((dk) => Math.hypot(dk.spot.x - cx, dk.spot.z - cz) < 4)) continue;
      map.setEdge(e, EDGE_WALL);
      if (!this.stillConnected(player)) {
        map.setEdge(e, EDGE_OPEN);
        continue;
      }
      this.grid.rebuildAroundEdge(e);
      this.grid.rebuildCollision();
      this.appeared.push(e);
      this.ctx.audio.thud(this.panTo(player, cx, cz), 0.35);
      if (!this.told.wall) {
        this.told.wall = true;
        this.ctx.hud.message('Somewhere behind you, something heavy settles into place.', 3);
      }
      return;
    }
  }

  // Out of view: behind a wall, or outside where you're looking (shelves
  // don't block the line of sight, but you can't see behind you).
  unseen(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    return (dx * fx + dz * fz) / d < 0.25 || !this.map.hasLineOfSight(player.pos.x, player.pos.z, x, z);
  }

  stillConnected(player) {
    const { map } = this;
    const L = this.layout;
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    const dist = map.bfs(px, py);
    const need = [L.front, ...L.desks.map((d) => d.spot), { x: 3 * CELL, z: (STORE_TOP + 0.5) * CELL }];
    return need.every((p) => {
      const [x, y] = map.cellAt(p.x, p.z);
      return dist[map.idx(x, y)] >= 0;
    });
  }

  // Something tall, at the far end of the aisle.
  updateGlimpses(dt, player) {
    if (this.host) return;
    this.nextGlimpse -= dt;
    if (this.nextGlimpse > 0) return;
    this.nextGlimpse = this.rng.range(30, 55);
    const { map } = this;
    for (let tries = 0; tries < 80; tries++) {
      const x = this.rng.int(1, COLS - 2), y = this.rng.int(STORE_TOP + 1, ROWS - 3);
      if (this.layout.kind[map.idx(x, y)] === KIND.BLOCK) continue;
      const [cx, cz] = map.cellCenter(x, y);
      const d = Math.hypot(cx - player.pos.x, cz - player.pos.z);
      if (d < 18 || d > 34 || !map.hasLineOfSight(player.pos.x, player.pos.z, cx, cz)) continue;
      this.spawnHost(cx, cz, 'watch');
      return;
    }
  }

  spawnHost(x, z, mode) {
    this.removeHost();
    const e = new Host({ scene: this.scene, world: this.grid, audio: this.ctx.audio, rng: this.rng.fork('host' + this.time), shared: this.shared }, { x, z, mode, speed: 2.0 });
    e.type = 'host';
    this.entities.list.push(e);
    this.host = e;
    return e;
  }

  removeHost() {
    if (!this.host) return;
    this.entities.remove(this.host);
    this.host = null;
  }

  // Put the host somewhere out of sight, `min`..`max` metres away by path.
  placeHostFar(player, min = 20, max = 34) {
    const { map } = this;
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    const dist = map.bfs(px, py);
    const cands = [];
    for (let i = 0; i < dist.length; i++) {
      const steps = dist[i] * CELL;
      if (dist[i] < 0 || steps < min || steps > max) continue;
      const [x, z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
      if (!this.unseen(player, x, z)) continue;
      cands.push([x, z]);
    }
    if (!cands.length) return;
    const [x, z] = this.rng.pick(cands);
    if (!this.host) this.spawnHost(x, z, 'hunt');
    else this.host.pos.set(x, 0, z);
  }

  updateHunt(dt, player) {
    if (!this.host) this.placeHostFar(player);
    const h = this.host;
    if (!h) return;
    // Lose it, and it finds its own way back to you.
    const d = h.distTo(player);
    if (d > 40 && this.unseen(player, h.pos.x, h.pos.z)) this.placeHostFar(player, 22, 32);
  }

  // ---- The hallway -----------------------------------------------------------------------

  updateHall(dt, player) {
    const { ctx } = this;
    const px = player.pos.x / CELL, py = player.pos.z / CELL;
    if (!this.told.hall) {
      this.told.hall = true;
      this.checkpoint = { ...this.layout.hallStart };
      ctx.hud.message('A hallway. It goes on further than the building should.', 4);
    }
    const inCorridor = py >= HALL.row && py < HALL.row + 2;
    if (inCorridor && px > HALL.loopAt + 0.5 && !this.final) {
      this.shiftPlayer(player, -HALL.loopBy * CELL, 0, false);
      if (!this.told.loop) {
        this.told.loop = true;
        ctx.hud.message('The same shelves. The same lights. The same hallway.', 3);
      }
      return;
    }
    let side = null;
    if (py < 4 && px > HALL.north.trigger) side = 'north';
    else if (py > 14.5 && px < HALL.south.trigger && px > 19) side = 'south';
    if (side) {
      // Out of the passage, back at the start of the hallway.
      const to = { x: 10 * CELL, z: (HALL.row + 1) * CELL };
      this.teleport(player, to.x, to.z, -Math.PI / 2);
      if (side === this.correct) {
        this.seg++;
        ctx.hud.message(this.seg >= 3 ? 'The piano is right here. At the end of the hallway, a red light.' : 'The hallway again. But the piano is louder.', 3.5);
      } else {
        this.seg = Math.max(0, this.seg - 1);
        ctx.hud.message('The hallway again. You\'ve been here before.', 3);
      }
      this.correct = this.rng.chance(0.5) ? 'north' : 'south';
      if (this.seg >= 3 && !this.final) this.openEnd();
      return;
    }
    // Through the EXIT at the very end.
    if (this.final && inCorridor && px > HALL.x1 + 0.4) this.startTransition('white', () => this.enterEnd(player));
  }

  openEnd() {
    this.final = true;
    const g = this.grid;
    g.lights.forEach((l, i) => {
      if (!l.dark) return;
      l.state = 'on';
      g.setPanelLevel(i, 1);
    });
    g.bakeLightmap({ x0: (HALL.loopAt - 8) * CELL, x1: COLS * CELL, z0: 0, z1: (HALL.row + 4) * CELL });
    this.lib.endDoor.visible = true;
  }

  // Move the player (and the host, if it's close) by a fixed offset: the
  // hallway is the same hallway, again.
  shiftPlayer(player, dx, dz, blink = true) {
    player.pos.x += dx;
    player.pos.z += dz;
    if (this.host && this.host.distTo({ pos: { x: player.pos.x - dx, z: player.pos.z - dz } }) < 30) {
      this.host.pos.x += dx;
      this.host.pos.z += dz;
    }
    if (blink) this.blink();
  }

  teleport(player, x, z, yaw) {
    const hd = this.host ? this.host.distTo(player) : 99;
    player.pos.set(x, 0, z);
    player.yaw = yaw;
    player.vel.set(0, 0);
    this.blink();
    // It follows you through.
    if (this.host && hd < 30) this.host.pos.set(Math.max(2.5 * CELL, x - Math.max(10, hd)), 0, z);
  }

  blink() {
    this.ctx.fade(1, 0);
    setTimeout(() => !this.disposed && this.ctx.fade(0, 0.6), 120);
  }

  // ---- Waking up again ----------------------------------------------------------------

  wake(player, why) {
    const { ctx } = this;
    if (this.trans) return;
    this.startTransition('black', () => {
      for (const e of this.entities.list.filter((x) => x.type === 'partygoer')) this.entities.remove(e);
      const c = this.checkpoint;
      player.pos.set(c.x, 0, c.z);
      player.yaw = c.yaw;
      player.vel.set(0, 0);
      player.health = Math.max(player.health, 60);
      player.sanity = Math.max(player.sanity, 55);
      if (this.host && this.host.mode === 'hunt') this.placeHostFar(player, 26, 40);
      const inHall = c.z < STORE_TOP * CELL;
      if (inHall) this.seg = Math.max(0, this.seg - 1);
      ctx.hud.message(inHall ? 'You wake up at the start of the hallway. The piano is still playing.' : why === 'host' ? 'A gloved hand on your shoulder. ' + this.rng.pick(WAKE) : this.rng.pick(WAKE), 5);
    }, 1.0);
  }

  // ---- Transitions ---------------------------------------------------------------------

  startTransition(kind, fn, hold = 0.6) {
    if (this.trans) return;
    this.trans = { kind, fn, t: 0, phase: 'in', hold };
    if (kind === 'white') {
      this.white.style.transition = 'opacity 1.6s';
      this.white.style.opacity = '1';
      this.ctx.audio.gust?.(0, 0.2, 2.2);
    } else {
      this.ctx.fade(1, 0.8);
    }
  }

  updateTransition(dt, player) {
    const tr = this.trans;
    tr.t += dt;
    player.vel.set(0, 0);
    player.speedMul = 0;
    const inTime = tr.kind === 'white' ? 1.7 : 0.9;
    if (tr.phase === 'in' && tr.t > inTime) {
      tr.phase = 'hold';
      tr.fn();
      if (this.done) return;
    }
    if (tr.phase === 'hold' && tr.t > inTime + tr.hold) {
      tr.phase = 'out';
      if (tr.kind === 'white') {
        this.white.style.transition = 'opacity 2.6s';
        this.white.style.opacity = '0';
      } else this.ctx.fade(0, 1.2);
    }
    if (tr.phase === 'out' && tr.t > inTime + tr.hold + 1.2) {
      this.trans = null;
      player.speedMul = 1;
    }
  }

  // ---- The fake reality ---------------------------------------------------------------------

  showLibrary(on) {
    this.grid.group.visible = on;
    this.lib.group.visible = on;
    for (const e of this.entities.list) e.root.visible = on;
    this.field.group.visible = !on;
    this.field.hemi.intensity = on ? 0 : 2.4;
    this.field.sun.intensity = on ? 0 : 1.4;
  }

  enterField(player, visit) {
    const F = this.field;
    this.area = 'field';
    this.visit = visit;
    this.showLibrary(false);
    for (const e of this.entities.list.filter((x) => x.type === 'partygoer')) this.entities.remove(e);
    if (this.host && this.host.mode === 'watch') this.removeHost();
    player.pos.set(FIELD.x, F.heightAt(FIELD.x, FIELD.z), FIELD.z);
    player.yaw = 0;
    player.pitch = 0;
    this.fieldStart = { x: FIELD.x, z: FIELD.z };
    // Where the vending machine is this time.
    const dist = visit === 1 ? 38 : visit === 2 ? 110 : 75;
    const a = this.rng.range(-0.35, 0.35);
    this.placeVending(FIELD.x + Math.sin(a) * dist, FIELD.z - Math.cos(a) * dist);
    this.vend.used = 0;
    this.vend.dispensed = false;
    this.vend.moves = visit === 2 ? 3 : 0;
    F.note.position.set(FIELD.x - 2.5, F.heightAt(FIELD.x - 2.5, FIELD.z - 5) + 0.04, FIELD.z - 5);
    F.note.visible = visit === 1;
    this.told.note = false;
    this.setupBlend(visit);
    F.house.group.visible = false;
    F.vending.visible = true;
    F.sky.material.uniforms.top.value.set(0xcfe2f2);
    this.ctx.hud.message(visit === 1 ? 'Grass. Wind. A white sky. You\'re outside.' : visit === 2 ? 'The field again. The machine is further away this time.' : 'The field. The library has followed you here.', 4.5);
  }

  placeVending(x, z) {
    const F = this.field;
    const y = F.heightAt(x, z);
    F.vending.position.set(x, y, z);
    // Facing back the way you came.
    F.vending.rotation.y = Math.atan2(this.fieldStart.x - x, this.fieldStart.z - z);
    this.vend = { ...(this.vend || {}), x, z, rot: F.vending.rotation.y };
  }

  setupBlend(visit) {
    const F = this.field;
    const rng = this.rng;
    for (const s of F.shelves) s.visible = false;
    for (const c of F.carpets) c.visible = false;
    for (const f of F.figures) f.visible = false;
    F.ceiling.visible = false;
    F.letters.visible = false;
    this.blendGrow = 0;
    if (visit >= 2) {
      const n = visit === 2 ? 16 : 34;
      for (let i = 0; i < n; i++) {
        const s = F.shelves[i];
        const a = rng.range(-1.2, 1.2), r = rng.range(8, visit === 2 ? 90 : 60);
        const x = FIELD.x + Math.sin(a) * r + rng.range(-3, 3), z = FIELD.z - Math.cos(a) * r;
        s.position.set(x, F.heightAt(x, z) - 0.05, z);
        s.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
        s.visible = true;
        s.scale.y = 1;
      }
      for (let i = 0; i < (visit === 2 ? 7 : 14); i++) {
        const c = F.carpets[i];
        const x = FIELD.x + rng.range(-25, 25), z = FIELD.z - rng.range(3, 70);
        c.position.set(x, F.heightAt(x, z) + 0.05, z);
        c.scale.setScalar(rng.range(1.5, 4));
        c.visible = true;
      }
      const cz = FIELD.z - rng.range(20, 40);
      F.ceiling.position.set(FIELD.x + rng.range(-6, 6), F.heightAt(FIELD.x, cz) + H, cz);
      F.ceiling.visible = true;
    }
    if (visit === 3) {
      const lz = FIELD.z - 16;
      F.letters.position.set(FIELD.x, F.heightAt(FIELD.x, lz) - 0.05, lz);
      F.letters.visible = true;
      F.figures.forEach((f, i) => {
        const a = -1 + (i / 4) * 2 + rng.range(-0.2, 0.2), r = rng.range(40, 70);
        const x = FIELD.x + Math.sin(a) * r, z = FIELD.z - Math.cos(a) * r;
        f.position.set(x, F.heightAt(x, z), z);
        f.visible = true;
      });
    }
  }

  collideField(pos, r) {
    const F = this.field;
    const box = (cx, cz, hw, hd, rot) => {
      const dx = pos.x - cx, dz = pos.z - cz;
      const c = Math.cos(rot), s = Math.sin(rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const px = hw + r - Math.abs(lx), pz = hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) return;
      let nx = lx, nz = lz;
      if (px < pz) nx = Math.sign(lx || 1) * (hw + r);
      else nz = Math.sign(lz || 1) * (hd + r);
      pos.x = cx + nx * c + nz * s;
      pos.z = cz - nx * s + nz * c;
    };
    if (F.vending.visible) box(F.vending.position.x, F.vending.position.z, 0.5, 0.4, F.vending.rotation.y);
    for (const s of F.shelves) if (s.visible) box(s.position.x, s.position.z, 1.88, 0.5, s.rotation.y);
    if (F.letters.visible) box(F.letters.position.x, F.letters.position.z, 4.5, 0.2, 0);
    if (F.house.group.visible) {
      const h = F.house.group.position;
      // Walls of the house, leaving the doorway.
      box(h.x, h.z - 3.5, 4.6, 0.15, 0);
      box(h.x - 4.5, h.z, 0.15, 3.6, 0);
      box(h.x + 4.5, h.z, 0.15, 3.6, 0);
      box(h.x - 2.55, h.z + 3.5, 1.95, 0.15, 0);
      box(h.x + 2.55, h.z + 3.5, 1.95, 0.15, 0);
    }
    // The hills are further than they look: you can't reach them.
    const dx = pos.x - FIELD.x, dz = pos.z - FIELD.z, d = Math.hypot(dx, dz);
    if (d > 180) {
      pos.x = FIELD.x + (dx / d) * 180;
      pos.z = FIELD.z + (dz / d) * 180;
    }
  }

  updateField(dt, player) {
    const { ctx } = this;
    const F = this.field;
    F.wind.value = this.time;
    F.sky.position.set(player.pos.x, 0, player.pos.z);
    player.sanity = Math.min(100, player.sanity + (this.area === 'end' ? 3 : 1.2) * dt);
    if (this.area === 'end') return this.updateEnd(dt, player);
    // The scrap of paper.
    if (F.note.visible && !this.told.note && Math.hypot(F.note.position.x - player.pos.x, F.note.position.z - player.pos.z) < 1.4) {
      this.told.note = true;
      ctx.hud.message('A scrap of paper in the grass. In pencil: "the end is near. it always is. don\'t let it keep you. — J"', 7);
    }
    const v = this.vend;
    const dx = v.x - player.pos.x, dz = v.z - player.pos.z, d = Math.hypot(dx, dz);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const looking = (dx * fx + dz * fz) / Math.max(0.01, d) > 0.35;
    // Look away and it may not be where you left it.
    if (v.moves > 0 && !looking && d > 25 && this.rng.chance(dt * 0.25)) {
      v.moves--;
      const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(60, 100);
      this.fieldStart = { x: player.pos.x, z: player.pos.z };
      this.placeVending(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r);
      if (!this.told.moved) {
        this.told.moved = true;
        ctx.hud.message('When you look back, the machine is somewhere else.', 3);
      }
    }
    // Yellow figures in the grass, closer every time you look away.
    if (this.visit === 3) {
      for (const f of F.figures) {
        if (!f.visible) continue;
        const ex = f.position.x - player.pos.x, ez = f.position.z - player.pos.z, ed = Math.hypot(ex, ez);
        f.rotation.y = Math.atan2(-ex, -ez);
        const seen = (ex * fx + ez * fz) / Math.max(0.01, ed) > 0.5;
        if (!seen && ed > 1) {
          const step = Math.min(ed - 0.5, 3.2 * dt);
          f.position.x -= (ex / ed) * step;
          f.position.z -= (ez / ed) * step;
          f.position.y = F.heightAt(f.position.x, f.position.z);
        }
        if (ed < 1.5) {
          ctx.hud.message('A yellow hand takes yours. =)', 3);
          ctx.audio.giggle?.(0, 0.4, true);
          this.startTransition('white', () => this.enterField(player, 3));
          return;
        }
      }
    }
    // The machine.
    const front = { x: v.x + Math.sin(v.rot) * 1.0, z: v.z + Math.cos(v.rot) * 1.0 };
    const df = Math.hypot(front.x - player.pos.x, front.z - player.pos.z);
    if (d < 12 && !this.told[`hum${this.visit}`]) {
      this.told[`hum${this.visit}`] = true;
      ctx.hud.message('The machine hums. Its lights are on.', 2.5);
    }
    if (df < 1.4) v.used += dt;
    else v.used = Math.max(0, v.used - dt);
    if (v.used > 1.2 && !v.dispensed) {
      v.dispensed = true;
      v.leaveAt = this.time + 3.5;
      ctx.audio.clank?.(0, 0.35);
      if (player.give('water')) ctx.hud.message('You press a button. A bottle of Almond Water drops out. The ground under you turns to carpet.', 4);
      else ctx.hud.message('You press a button. Something drops out, but your bag is full. The ground under you turns to carpet.', 4);
      this.blendGrow = 0.01;
    }
    // The library comes back for you.
    if (this.blendGrow > 0) {
      this.blendGrow = Math.min(1, this.blendGrow + dt / 3);
      const c = F.carpets[0];
      c.visible = true;
      c.position.set(player.pos.x, F.heightAt(player.pos.x, player.pos.z) + 0.06, player.pos.z);
      c.scale.setScalar(1 + this.blendGrow * 9);
      for (let i = 0; i < 6; i++) {
        const s = F.shelves[F.shelves.length - 1 - i];
        if (!s.visible) {
          const a = (i / 6) * Math.PI * 2;
          s.position.set(player.pos.x + Math.cos(a) * 4, F.heightAt(player.pos.x, player.pos.z), player.pos.z + Math.sin(a) * 4);
          s.rotation.y = -a + Math.PI / 2;
          s.visible = true;
        }
        s.scale.y = Math.max(0.01, this.blendGrow);
      }
    }
    if (v.dispensed && this.time > v.leaveAt) this.startTransition('white', () => this.leaveField(player));
  }

  leaveField(player) {
    const L = this.layout;
    const d = L.desks[this.visit];
    this.area = 'store';
    this.showLibrary(true);
    for (const s of this.field.shelves) s.scale.y = 1;
    player.pos.set(d.spot.x, 0, d.spot.z);
    player.yaw = Math.atan2(-(d.screen.x - d.spot.x), -(d.screen.z - d.spot.z));
    this.act = this.visit + 1;
    this.typing = { progress: 0, started: false };
    this.applyAct(player);
  }

  // What the shop is like now.
  applyAct(player) {
    const { ctx } = this;
    const g = this.grid;
    // Some of the lights don't come back on.
    const off = this.act === 2 ? 0.1 : this.act === 3 ? 0.22 : 0.22;
    g.lights.forEach((l, i) => {
      if (l.hall || l.state === 'off') return;
      if (this.rng.chance(off * (this.act === 4 ? 0.3 : 1))) {
        l.state = 'off';
        g.setPanelLevel(i, 0);
      }
    });
    g.bakeLightmap();
    if (this.act === 2) {
      ctx.hud.message('You\'re back at the computer. The screen is blank. The shop feels smaller, somehow.', 5);
    }
    if (this.act === 3) {
      setLetters(this.lib, 'THE END IS NEAR', this.own);
      ctx.hud.message('Back again. There are other people in the shop now. You can\'t quite see them.', 5);
      this.spawnGhosts(player);
      this.nextGlimpse = 15;
    }
    if (this.act === 4) {
      setLetters(this.lib, 'THE END IS HERE', this.own);
      for (const e of this.layout.hallDoor) g.removeWall(e);
      g.flush();
      this.lib.hallNeon.material.color.setRGB(1, 1, 1);
      this.removeHost();
      this.placeHostFar(player, 24, 36);
      for (let k = 0; k < 2; k++) this.entities.spawnFar('partygoer', player, { min: 18, max: 32 });
      ctx.hud.message('Every screen in the shop says the same thing. Far off, footsteps, unhurried. At the back of the shop, a door is open.', 6);
    }
    this.drawScreens();
  }

  spawnGhosts(player) {
    const { map } = this;
    for (let n = 0, tries = 0; n < 9 && tries < 300; tries++) {
      const x = this.rng.int(2, COLS - 3), y = this.rng.int(STORE_TOP + 2, ROWS - 4);
      const k = this.layout.kind[map.idx(x, y)];
      if (k !== KIND.FLOOR && k !== KIND.BACK) continue;
      const [cx, cz] = map.cellCenter(x, y);
      if (Math.hypot(cx - player.pos.x, cz - player.pos.z) < 12) continue;
      const e = new Ghost({ scene: this.scene, world: this.grid, audio: this.ctx.audio, rng: this.rng.fork('ghost' + n), shared: this.shared }, { x: cx, z: cz });
      e.type = 'ghost';
      this.entities.list.push(e);
      this.ghosts.push(e);
      n++;
    }
  }

  // ---- The end ---------------------------------------------------------------------------

  enterEnd(player) {
    const F = this.field;
    this.area = 'end';
    this.showLibrary(false);
    this.removeHost();
    for (const e of [...this.entities.list]) this.entities.remove(e);
    for (const s of F.shelves) s.visible = false;
    for (const c of F.carpets) c.visible = false;
    for (const f of F.figures) f.visible = false;
    F.ceiling.visible = false;
    F.letters.visible = false;
    F.vending.visible = false;
    F.note.visible = false;
    F.house.group.visible = true;
    F.house.light.intensity = 3;
    F.sky.material.uniforms.top.value.set(0x9cc8f0);
    F.sun.color.set(0xffe8c8);
    player.pos.set(FIELD.x, F.heightAt(FIELD.x, FIELD.z), FIELD.z);
    player.yaw = 0;
    player.pitch = 0.05;
    player.health = 100;
    this.ctx.hud.message('Sunlight. Real sunlight. Up the hill there\'s a house, and its door is open.', 6);
  }

  updateEnd(dt, player) {
    const F = this.field;
    const D = F.house.door;
    const d = Math.hypot(D.x - player.pos.x, D.z - player.pos.z);
    if (d < 25 && !this.told.porch) {
      this.told.porch = true;
      this.ctx.hud.message('The porch light is on. Someone left it on for you.', 4);
    }
    if (d < 1.3 && !this.told.home) {
      this.told.home = true;
      this.done = true;
      this.ctx.hud.message('Welcome home.', 4);
      this.ctx.onEscape('level94', 'door');
    }
  }

  // ---- Values the game reads every frame ---------------------------------------------

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  audioMix(player) {
    const lib = this.area === 'store' || this.area === 'hall';
    let buzz = 0;
    if (lib) {
      for (const d of this.layout.desks) {
        const awake = this.act === 4 || d === this.targetDesk() || d.name === 'front';
        if (!awake) continue;
        buzz = Math.max(buzz, 0.28 * Math.max(0, 1 - Math.hypot(d.screen.x - player.pos.x, d.screen.z - player.pos.z) / 9));
      }
    }
    // In the hallway, the piano comes from the way out.
    let pan = 0, vol = 0.5;
    if (this.area === 'hall') {
      const tz = this.correct === 'north' ? 2.5 * CELL : 15.5 * CELL;
      const tx = (HALL.junction + 1) * CELL;
      const d = Math.hypot(tx - player.pos.x, tz - player.pos.z);
      pan = this.final ? this.panTo(player, (HALL.x1 + 1) * CELL, (HALL.row + 1) * CELL) * 0.6 : this.panTo(player, tx, tz) * Math.min(1, 25 / Math.max(d, 1)) * 0.8;
      vol = 0.45 + 0.25 * Math.max(0, 1 - d / 25) + this.seg * 0.05;
    }
    const field = this.area === 'field', end = this.area === 'end';
    const near = end ? Math.hypot(this.field.house.door.x - player.pos.x, this.field.house.door.z - player.pos.z) : 99;
    return {
      hum: lib ? 0.02 + buzz : 0, exitGain: 0, exitPan: 0, drone: 0, machine: 0, jazz: 0,
      wind: field ? 0.12 : end ? 0.07 : 0,
      piano: field ? 0.32 : end ? 0.6 : vol,
      pianoOpts: {
        muffle: field ? 0.55 : 0,
        pan,
        tempo: this.act >= 4 && !end ? 0.94 : 1,
        wobble: end ? 0 : this.act >= 4 ? 9 : this.act === 3 ? 4 : 0,
        end: end && near < 22,
      },
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    if (this.area === 'field' || this.area === 'end') {
      this.fog.set(this.area === 'end' ? 0xe6eef4 : 0xf6f8f2);
      return { fogColor: this.fog, fogDensity: this.area === 'end' ? 0.0022 : 0.0045, warp: insane * 0.6, aberr: 0.12, grain: 0.04, soften: this.area === 'end' ? 0.15 : 0.45 };
    }
    const hall = this.area === 'hall';
    // Warm, clean light; the far end of the shop fades into it.
    this.fog.set(hall ? 0xc8bea4 : 0xd8cbae);
    return {
      fogColor: this.fog,
      fogDensity: hall ? 0.022 : 0.0062,
      warp: insane * insane * 1.2,
      aberr: 0.12 + insane * 0.8,
      grain: 0.04,
      soften: 0.12,
    };
  }

  hudInfo() {
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    this.white.remove();
    this.entities.dispose();
    for (const g of [this.grid.group, this.lib.group, this.field.group]) this.scene.remove(g);
    this.grid.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
    disposeTextures(this.textures);
  }
}

export const LEVEL601 = {
  id: 'level601',
  number: 601,
  name: 'Level 601',
  title: 'The End',
  difficulty: 'UNKNOWN',
  next: 'level94',
  create: (ctx) => new Level601(ctx),
};
