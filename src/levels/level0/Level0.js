import * as THREE from 'three';
import { GridWorld } from '../../world/GridWorld.js';
import { EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js';
import { wallpaperTexture, carpetTexture, ceilingTexture } from '../../world/textures.js';
import { MAX_DYN_LIGHTS } from '../../world/materials.js';
import { Stalker } from '../../entities/Stalker.js';
import { PropKit, nearDoor, disposeTextures } from '../../world/props.js';
import { generateLevel0, ZONE } from './generate.js';

// Level 0 — "The Lobby" / "The Yellow Hell".
//
// Runtime systems:
//  - sanity drain from darkness, red rooms, buzzing spikes and the figure
//  - the buzzing spike: cover your ears and keep moving to escape it
//  - whispers, distant voices, scratching behind the walls, phantom steps
//  - the maze shifting where you are not looking
//  - the Pitfalls; dark zones; a red room
//  - exit: a flickering wall to throw yourself through (leads to Level 1)

const DRAIN_BASE = 0.11;
const BOTTLE_SANITY = 35;
const MAX_BOTTLES = 6;

export class Level0 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.rng = rng.fork('runtime');
    const layout = generateLevel0(rng.fork('layout'));
    this.layout = layout;

    this.textures = {
      wall: wallpaperTexture(renderer),
      floor: carpetTexture(renderer),
      ceiling: ceilingTexture(renderer),
    };
    shared.ceilH.value = layout.map.height;
    this.shared = shared;

    this.world = new GridWorld({
      map: layout.map,
      lights: layout.lights,
      pillars: layout.pillars,
      pits: layout.pits,
      textures: this.textures,
      shared,
      dampAt: (x, z) => this.dampAt(x, z),
    });
    this.world.setExit(layout.exitEdge);
    scene.add(this.world.group);
    this.scene = scene;

    const [sx, sz] = layout.map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx, z: sz, yaw: layout.spawnYaw };

    this.flickerLights = layout.lights.map((l, i) => (l.state === 'flicker' ? i : -1)).filter((i) => i >= 0);
    this.flickerPhase = new Map(this.flickerLights.map((i) => [i, this.rng.next() * 100]));
    this.activeDyn = [];

    this.buildBottles();
    this.props = new PropKit((x, z) => this.world.sampleLight(x, z));
    this.buildConstruction();
    this.stalker = new Stalker(scene, this.world, this.rng.fork('stalker'));

    // Director state.
    this.time = 0;
    this.nextEvent = 18;
    this.nextShift = 20;
    this.globalLight = 1;
    this.blackout = 0;
    this.flickerBurst = 0;
    this.humMute = 0;
    this.spike = null;
    this.spikeLevel = 0;
    this.scratchSeq = null;
    this.buzzTimer = 0;
    this.fogColor = new THREE.Color(0.5, 0.47, 0.3);
    this.fogDensity = 0.032;
    this.lum = 1;
    this.inRed = 0;
    this.exitFlicker = 0;
    this.spikeHintShown = false;
    this.darkHintShown = false;
    this.pitFallen = false;
    this.done = false;
  }

  // ---- Setup -------------------------------------------------------------

  buildBottles() {
    const geo = new THREE.CylinderGeometry(0.055, 0.06, 0.26, 10);
    geo.translate(0, 0.13, 0);
    const capGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
    capGeo.translate(0, 0.29, 0);
    const labelGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.09, 10, 1, true);
    labelGeo.translate(0, 0.12, 0);
    this.bottleGeos = [geo, capGeo, labelGeo];
    this.bottleMats = [];
    this.bottles = this.layout.bottles.map((b) => {
      const g = new THREE.Group();
      const [r, gg, bb] = this.world.sampleLight(b.x, b.z);
      const lit = Math.max(0.35, (r + gg + bb) / 3 * 1.4);
      const mats = [
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.82 * lit, 0.86 * lit, 0.8 * lit), transparent: true, opacity: 0.85 }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2 * lit, 0.35 * lit, 0.75 * lit) }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9 * lit, 0.75 * lit, 0.45 * lit) }),
      ];
      this.bottleMats.push(...mats);
      g.add(new THREE.Mesh(geo, mats[0]), new THREE.Mesh(capGeo, mats[1]), new THREE.Mesh(labelGeo, mats[2]));
      g.position.set(b.x, 0, b.z);
      g.rotation.y = this.rng.next() * Math.PI;
      // Some bottles lie on their side.
      if (this.rng.chance(0.3)) {
        g.rotation.z = Math.PI / 2;
        g.position.y = 0.06;
      }
      this.scene.add(g);
      return { mesh: g, x: b.x, z: b.z, taken: false };
    });
  }

  // The construction pocket is dry; everywhere else the carpet is soaked.
  dampAt(x, z) {
    const c = this.layout.construction;
    if (!c) return 1;
    const d = Math.hypot(x - c.x, z - c.z);
    return Math.min(1, Math.max(0, (d - (c.r - 3)) / 6));
  }

  buildConstruction() {
    const { construction, door02, map } = this.layout;
    this.door02 = null;
    if (!construction) return;
    const kit = this.props;
    const rng = this.rng.fork('construction');
    const cells = rng.shuffle([...construction.cells]);
    const makers = [
      (x, z) => kit.bucket(x, z),
      (x, z, r) => kit.sawhorse(x, z, r),
      (x, z, r) => kit.drywall(x, z, r),
      (x, z, r) => kit.ladder(x, z, r),
      (x, z, r) => kit.tarp(x, z, r),
    ];
    this.propGroup = new THREE.Group();
    const count = Math.min(cells.length, rng.int(7, 11));
    for (let i = 0; i < count; i++) {
      const [cx, cy] = cells[i];
      const [wx, wz] = map.cellCenter(cx, cy);
      const x = wx + rng.range(-0.6, 0.6), z = wz + rng.range(-0.6, 0.6);
      this.propGroup.add(rng.pick(makers)(x, z, rng.range(0, Math.PI * 2)));
      if (rng.chance(0.4)) this.propGroup.add(kit.bucket(x + rng.range(-0.5, 0.5), z + rng.range(-0.5, 0.5)));
    }
    if (door02) {
      this.door02 = kit.door(map, door02.edge, door02.side, { panel: 0xeeeae0, inset: 0xe2ded2, frame: 0xd8d4c4 });
      this.propGroup.add(this.door02.group);
    }
    this.scene.add(this.propGroup);
  }

  // ---- Per-frame ---------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    const hud = ctx.hud;

    this.updateDirector(dt, player);
    this.updateLights(dt, player);

    // Environment at the player's feet.
    const [lr, lg, lb] = this.world.sampleLight(player.pos.x, player.pos.z);
    const lum = (lr + lg + lb) / 3 * this.globalLight;
    this.lum += (lum - this.lum) * Math.min(1, dt * 3);
    const [cx, cy] = this.layout.map.cellAt(player.pos.x, player.pos.z);
    const zone = this.layout.zone[this.layout.map.idx(cx, cy)];
    const red = zone === ZONE.RED ? 1 : 0;
    this.inRed += (red - this.inRed) * Math.min(1, dt * 2);

    // Sanity.
    if (!player.dead && !player.falling) {
      let drain = DRAIN_BASE;
      if (this.lum < 0.14) {
        drain += player.flashlight ? 0.12 : 0.4;
        if (!this.darkHintShown) {
          this.darkHintShown = true;
          hud.message(ctx.touch ? 'Too dark. Tap LIGHT for your flashlight.' : 'Too dark. Press F for your flashlight.', 4);
        }
      }
      drain += this.inRed * 0.25;
      if (this.spikeLevel > 0.05) drain += this.spikeLevel * (player.coveringEars ? 0.3 : 3.6);
      const sd = this.stalker.distanceTo(player);
      if (this.stalker.state === 'watching' && this.stalker.isSeenBy(player)) drain += 1.1;
      if (this.stalker.state === 'hunting' && sd < 20) drain += 0.7;
      player.sanity = Math.max(0, player.sanity - drain * dt);
      if (player.sanity <= 0) {
        this.done = true;
        ctx.onDeath('Your mind dissolved into the hum.');
        return;
      }
    }

    // Almond Water.
    for (const b of this.bottles) {
      if (b.taken) continue;
      if (Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 0.9) {
        if (player.bottles >= MAX_BOTTLES) continue;
        b.taken = true;
        this.scene.remove(b.mesh);
        player.bottles++;
        ctx.audio.pickup();
        hud.message(player.bottles === 1 && !this.drankOnce
          ? (ctx.touch ? 'Almond Water. Tap the bottle button to drink.' : 'Almond Water. Press E to drink.')
          : 'Almond Water', 2.5);
      }
    }

    // The Pitfalls.
    if (!player.falling && this.world.pitAt(player.pos.x, player.pos.z, 0.12)) {
      player.falling = true;
      player.fallV = 0;
      ctx.audio.fall();
      ctx.vibrate([60, 40, 120]);
      ctx.fade(1, 0.9);
      setTimeout(() => this.afterFall(player), 1300);
    }

    // The flickering wall.
    const de = this.world.distanceToExit(player.pos.x, player.pos.z);
    this.exitDist = de;
    this.world.materials.glitch.uniforms.prox.value = Math.max(0, 1 - de / 8);
    this.exitFlicker -= dt;
    if (this.exitFlicker <= 0) {
      const p = 0.08 + Math.max(0, 1 - de / 10) * 0.25;
      this.world.exitMesh.visible = !(this.rng.next() < p);
      this.exitFlicker = 0.04 + this.rng.next() * 0.18;
    }
    if (de < 0.22 && !player.falling) {
      this.done = true;
      ctx.onEscape('level1', 'noclip');
      return;
    }

    // The quiet, dry, half-built rooms — and the door in them.
    if (zone === ZONE.CONSTRUCTION && !this.constructionHint) {
      this.constructionHint = true;
    }
    if (this.door02 && !player.falling) {
      const dd = Math.hypot(player.pos.x - this.door02.x, player.pos.z - this.door02.z);
      if (dd < 5 && !this.doorHint) {
        this.doorHint = true;
      }
      if (nearDoor(this.door02, player.pos.x, player.pos.z)) {
        this.done = true;
        ctx.onEscape('level0_2', 'door');
        return;
      }
    }

    // The figure.
    for (const ev of this.stalker.update(dt, player, player.sanity)) {
      if (ev === 'appear') ctx.audio.staticBurst(0.25, 0.08);
      if (ev === 'vanish') ctx.audio.staticBurst(0.35, 0.18);
      if (ev === 'hunt') {
        ctx.audio.whisper(0, 0.4);
      }
      if (ev === 'caught') {
        this.done = true;
        ctx.onCaught(this.stalker);
        return;
      }
    }
  }

  afterFall(player) {
    if (this.disposed || player.dead || this.ctx.isOver()) return;
    // You land somewhere else in the Lobby. You don't remember how.
    const { map, zone } = this.layout;
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    const dist = map.bfs(px, py);
    const cands = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] > 10 && zone[i] === ZONE.NORMAL) cands.push(i);
    }
    const i = this.rng.pick(cands) ?? map.idx(this.layout.spawn.x, this.layout.spawn.y);
    const [wx, wz] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
    player.pos.set(wx, 0, wz);
    player.falling = false;
    player.fallV = 0;
    player.pitch = 0;
    player.sanity = Math.max(1, player.sanity - 20);
    this.ctx.fade(0, 1.6);
    this.ctx.audio.thud(0, 0.5);
  }

  drink(player) {
    if (player.bottles <= 0) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.bottles--;
    this.drankOnce = true;
    player.sanity = Math.min(100, player.sanity + BOTTLE_SANITY);
    this.ctx.audio.drink();
  }

  // ---- Lights ------------------------------------------------------------

  updateLights(dt, player) {
    const { world, shared } = this;
    // Global flicker bursts & blackouts.
    let g = 1;
    if (this.flickerBurst > 0) {
      this.flickerBurst -= dt;
      g = this.rng.next() < 0.5 ? 0.15 + this.rng.next() * 0.3 : 1;
    }
    if (this.blackout > 0) {
      this.blackout -= dt;
      g = this.blackout < 0.5 ? (this.rng.next() < 0.5 ? 0.1 : 1) : 0.04;
    }
    this.globalLight += (g - this.globalLight) * Math.min(1, dt * 25);
    shared.globalLight.value = this.globalLight;
    world.panelMat.color.setScalar(0.25 + 0.75 * this.globalLight);

    // Dynamic flickering fixtures nearest the player.
    const near = [];
    for (const i of this.flickerLights) {
      const l = world.lights[i];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d < 18) near.push([i, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    const H = this.layout.map.height;
    let nearestFlicker = Infinity;
    for (let k = 0; k < MAX_DYN_LIGHTS; k++) {
      const pos = shared.dynPos.value[k];
      const col = shared.dynCol.value[k];
      if (k >= near.length) {
        pos.set(0, -100, 0, 0);
        continue;
      }
      const [i, d] = near[k];
      const l = world.lights[i];
      const ph = this.flickerPhase.get(i);
      const t = this.time * 9 + ph;
      const on = Math.sin(t * 1.3) + Math.sin(t * 0.37 + ph) * 1.2 > -0.2 && fract(Math.sin(Math.floor(t) * 91.7 + ph) * 43758.5) > 0.2;
      const level = on ? 1 : 0.05;
      pos.set(l.x, H - 0.2, l.z, l.power * 1.25 * level * this.globalLight);
      col.setRGB(l.color[0], l.color[1], l.color[2]);
      world.setPanelLevel(i, level);
      nearestFlicker = Math.min(nearestFlicker, d);
    }
    this.buzzTimer -= dt;
    if (nearestFlicker < 7 && this.buzzTimer <= 0) {
      this.ctx.audio.flickerBuzz(1.2, 0.1 * (1 - nearestFlicker / 7));
      this.buzzTimer = 1.1;
    }
  }

  // ---- Director: events, sounds, shifting maze ---------------------------

  updateDirector(dt, player) {
    const { ctx, rng } = this;
    const sanity = player.sanity;

    // Buzzing spike: loud until you move away from where it started.
    if (this.spike) {
      const s = this.spike;
      s.t += dt;
      const moved = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      const fadeIn = Math.min(1, s.t / 2.5);
      const away = Math.max(0, 1 - Math.max(0, moved - 6) / 14);
      const target = fadeIn * away * (s.t > s.max ? 0 : 1);
      this.spikeLevel += (target - this.spikeLevel) * Math.min(1, dt * 2);
      if (target === 0 && this.spikeLevel < 0.03) {
        this.spike = null;
        this.spikeLevel = 0;
      }
    }

    // Scratching that follows you down the hall.
    if (this.scratchSeq) {
      const q = this.scratchSeq;
      q.t -= dt;
      if (q.t <= 0) {
        ctx.audio.scratch(q.pan, 0.35 + rng.next() * 0.2);
        q.left--;
        q.t = 2 + rng.next() * 2;
        if (q.left <= 0) this.scratchSeq = null;
      }
    }

    if (this.humMute > 0) this.humMute -= dt;

    this.nextEvent -= dt * (1 + (100 - sanity) / 60);
    if (this.nextEvent <= 0) {
      this.nextEvent = rng.range(14, 32);
      const pool = [
        ['flicker', 3],
        ['whisper', sanity < 80 ? 2 : 0.5],
        ['voice', sanity < 65 ? 1.5 : 0.3],
        ['scratch', 1.5],
        ['steps', sanity < 70 ? 2 : 0.5],
        ['thud', 1],
        ['spike', this.time > 50 && !this.spike ? 1.6 : 0],
        ['blackout', this.time > 90 && sanity < 75 ? 0.8 : 0],
        ['hush', 0.5],
      ];
      const total = pool.reduce((a, [, w]) => a + w, 0);
      let r = rng.next() * total;
      let pick = pool[0][0];
      for (const [name, w] of pool) {
        r -= w;
        if (r <= 0) {
          pick = name;
          break;
        }
      }
      this.runEvent(pick, player);
    }

    this.nextShift -= dt;
    if (this.nextShift <= 0) {
      this.nextShift = rng.range(10, 22);
      this.shiftMaze(player);
    }
  }

  runEvent(name, player) {
    const { ctx, rng } = this;
    const side = () => (rng.chance(0.5) ? -1 : 1) * rng.range(0.4, 1);
    switch (name) {
      case 'flicker':
        this.flickerBurst = rng.range(0.6, 1.8);
        ctx.audio.flickerBuzz(this.flickerBurst, 0.16);
        break;
      case 'whisper':
        ctx.audio.whisper(side(), 0.22 + rng.next() * 0.15);
        break;
      case 'voice':
        ctx.audio.voice(side(), 0.12);
        break;
      case 'scratch':
        this.scratchSeq = { pan: side(), left: rng.int(3, 6), t: 0 };
        break;
      case 'steps':
        ctx.audio.phantomSteps(side() * 0.6);
        break;
      case 'thud':
        ctx.audio.thud(side(), 0.25);
        break;
      case 'spike':
        this.spike = { x: player.pos.x, z: player.pos.z, t: 0, max: rng.range(16, 24) };
        if (!this.spikeHintShown) {
          this.spikeHintShown = true;
          ctx.hud.message(ctx.touch ? 'The buzzing is getting louder. Hold EARS and keep moving.' : 'The buzzing is getting louder. Hold C to cover your ears and keep moving.', 5);
        }
        break;
      case 'blackout':
        this.blackout = rng.range(3, 6);
        ctx.audio.flickerBuzz(0.6, 0.2);
        ctx.audio.thud(0, 0.35);
        break;
      case 'hush':
        // The hum stops. That is worse.
        this.humMute = rng.range(4, 7);
        break;
    }
  }

  // Walls move where you can't see them.
  shiftMaze(player) {
    const { map } = this.layout;
    const { rng, world } = this;
    const pitRoom = this.layout.pitRoom;
    const exitE = world.exit.edge;
    const pillarCorners = new Set(this.layout.pillars.map((p) => `${Math.round(p.x / map.cellSize)},${Math.round(p.z / map.cellSize)}`));

    const pickEdge = (want) => {
      for (let tries = 0; tries < 60; tries++) {
        const ang = rng.next() * Math.PI * 2;
        const r = rng.range(10, 24);
        const [x, y] = map.cellAt(player.pos.x + Math.cos(ang) * r, player.pos.z + Math.sin(ang) * r);
        const dir = rng.int(0, 3);
        const e = map.edge(x, y, dir);
        if (map.isBoundaryEdge(e) || map.getEdge(e) !== want) continue;
        if (e.h === exitE.h && e.x === exitE.x && e.y === exitE.y) continue;
        const de2 = this.layout.door02?.edge;
        if (de2 && e.h === de2.h && e.x === de2.x && e.y === de2.y) continue;
        if (x >= pitRoom.x - 1 && x <= pitRoom.x + pitRoom.w && y >= pitRoom.y - 1 && y <= pitRoom.y + pitRoom.h) continue;
        // Corners of the edge must not hold a pillar.
        const c1 = `${e.x},${e.y}`;
        const c2 = e.h ? `${e.x + 1},${e.y}` : `${e.x},${e.y + 1}`;
        if (pillarCorners.has(c1) || pillarCorners.has(c2)) continue;
        // Neither side may be visible to the player.
        const cs = map.cellSize;
        const mx = e.h ? (e.x + 0.5) * cs : e.x * cs;
        const mz = e.h ? e.y * cs : (e.y + 0.5) * cs;
        const ox = e.h ? 0 : 1.2, oz = e.h ? 1.2 : 0;
        if (map.hasLineOfSight(player.pos.x, player.pos.z, mx + ox, mz + oz)) continue;
        if (map.hasLineOfSight(player.pos.x, player.pos.z, mx - ox, mz - oz)) continue;
        return e;
      }
      return null;
    };

    const changed = [];
    const open = pickEdge(EDGE_WALL);
    if (open) {
      map.setEdge(open, EDGE_OPEN);
      changed.push(open);
    }
    const close = pickEdge(EDGE_OPEN);
    if (close) {
      map.setEdge(close, EDGE_WALL);
      // Keep the exit reachable from where the player stands.
      const [px, py] = map.cellAt(player.pos.x, player.pos.z);
      const dist = map.bfs(px, py);
      const ex = exitE.h ? [exitE.x, Math.min(map.rows - 1, exitE.y), exitE.x, exitE.y - 1] : [Math.min(map.cols - 1, exitE.x), exitE.y, exitE.x - 1, exitE.y];
      const okA = map.inBounds(ex[0], ex[1]) && dist[map.idx(ex[0], ex[1])] >= 0;
      const okB = map.inBounds(ex[2], ex[3]) && dist[map.idx(ex[2], ex[3])] >= 0;
      if (okA || okB) changed.push(close);
      else map.setEdge(close, EDGE_OPEN);
    }
    if (!changed.length) return;
    for (const e of changed) world.rebuildAroundEdge(e);
    world.rebuildCollision();
    for (const e of changed) {
      const cs = map.cellSize;
      const mx = e.h ? (e.x + 0.5) * cs : e.x * cs;
      const mz = e.h ? e.y * cs : (e.y + 0.5) * cs;
      world.bakeLightmap({ x0: mx - 11, z0: mz - 11, x1: mx + 11, z1: mz + 11 });
    }
  }

  // ---- Values the game reads every frame ---------------------------------

  audioMix(player) {
    const lightHum = this.globalLight;
    // The buzz quiets toward the construction pocket.
    const quiet = 0.25 + 0.75 * this.dampAt(player.pos.x, player.pos.z);
    const hum = this.humMute > 0 ? 0.004 : (0.075 * quiet + this.spikeLevel * 0.55) * (0.15 + 0.85 * lightHum);
    let exitGain = 0, exitPan = 0;
    if (this.exitDist < 32) {
      const ex = this.world.exit;
      const walls = this.layout.map.wallsBetween(player.pos.x, player.pos.z, ex.cx, ex.cz, 3);
      exitGain = (0.4 / (1 + (this.exitDist / 6.5) ** 2)) * Math.pow(0.55, Math.max(0, walls - 1));
      const dx = ex.cx - player.pos.x, dz = ex.cz - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      exitPan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
    }
    let drone = 0;
    if (this.stalker.state === 'hunting') drone = 0.3 * Math.max(0.15, 1 - this.stalker.distanceTo(player) / 30);
    else if (this.stalker.state === 'watching') drone = 0.05;
    return { hum, exitGain, exitPan, drone, sanity: player.sanity, ears: player.coveringEars };
  }

  // Fog and post-processing parameters.
  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const k = this.globalLight;
    const target = new THREE.Color(
      0.015 + r * 0.66 * k,
      0.012 + g * 0.62 * k,
      0.008 + b * 0.44 * k,
    );
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const dens = 0.03 + (1 - Math.min(1, this.lum * 2)) * 0.02;
    this.fogDensity += (dens - this.fogDensity) * Math.min(1, dt * 2);
    const insanity = 1 - player.sanity / 100;
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.4 + this.spikeLevel * 0.6,
      aberr: 0.35 + insanity * 1.8 + this.spikeLevel * 2.5,
      grain: 0.05 + insanity * 0.08 + (this.lum < 0.15 ? 0.04 : 0),
      shake: this.spikeLevel * (player.coveringEars ? 0.15 : 1),
    };
  }

  hudInfo() {
    return {
      warn: this.spikeLevel > 0.1 ? 'COVER YOUR EARS' : null,
      warnCovered: 'KEEP MOVING',
      coverLabel: 'EARS',
      health: false,
    };
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.stalker.dispose(this.scene);
    for (const b of this.bottles) this.scene.remove(b.mesh);
    for (const g of this.bottleGeos) g.dispose();
    for (const m of this.bottleMats) m.dispose();
    disposeTextures(this.textures);
    if (this.propGroup) this.scene.remove(this.propGroup);
    this.props.dispose();
  }
}

function fract(x) {
  return x - Math.floor(x);
}

export const LEVEL0 = {
  id: 'level0',
  number: 0,
  name: 'Level 0',
  title: 'The Lobby',
  nickname: 'The Yellow Hell',
  difficulty: 1,
  next: 'level1',
  create: (ctx) => new Level0(ctx),
};
