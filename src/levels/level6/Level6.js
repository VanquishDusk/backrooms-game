import * as THREE from 'three';
import { GridWorld } from '../../world/GridWorld.js';
import { GridMap, EDGE_OPEN, EDGE_WALL, DIRS } from '../../world/GridMap.js';
import { concreteWallTexture, concreteFloorTexture, concreteCeilingTexture, solidTexture } from '../../world/textures.js';
import { SURFACE, createWorldMaterial } from '../../world/materials.js';
import { disposeTextures } from '../../world/props.js';

// Level 6 — "Lights Out".
//
//  - Endless narrow hallways of smooth, cold concrete, in complete darkness.
//    Light sources don't work: no flashlight, no flares. Your eyes adjust
//    just enough to make out a wall at arm's length
//  - Silence, and then not: whispering, breathing, scuttling. The longer
//    you stay, the worse it gets
//  - No confirmed entities. Something, though
//  - The way you came in (Level 5's boiler room) shuts behind you once
//    you've gone far enough. Take a wrong turn and the halls may close
//    behind you too
//  - Exits: a stairwell deep inside to Level 7 (listen for waves); rarely,
//    a huge freezing metal door to Level 129; trip over a wire and you're
//    in Level 6.1

const CELL = 1.6;
const SIZE = 34;
const HEIGHT = 2.6;

export class Level6 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.noLight = true;
    this.rng = rng.fork('runtime');
    const L = generate(rng.fork('layout'));
    this.layout = L;
    this.map = L.map;
    this.textures = {
      wall: concreteWallTexture(renderer, { base: '#8e8e8a' }),
      floor: concreteFloorTexture(renderer, '#6e6e6a'),
      ceiling: concreteCeilingTexture(renderer),
    };
    shared.ceilH.value = HEIGHT;
    this.world = new GridWorld({
      map: L.map,
      lights: [],
      textures: this.textures,
      shared,
      texScale: { wall: 1 / 2.2, floor: 1 / 2, ceiling: 1 / 2 },
      dampAt: () => 0,
      ceilingAt: (x, y) => (x === L.stairs.x && y === L.stairs.y ? 4.6 : HEIGHT),
    });
    scene.add(this.world.group);
    this.props = new THREE.Group();
    scene.add(this.props);
    this.geos = [];
    this.mats = [];
    this.buildDoors();

    const [sx, sz] = L.map.cellCenter(L.spawn.x, L.spawn.y);
    this.spawn = { x: sx + DIRS[L.spawn.dir][0] * 0.35, z: sz + DIRS[L.spawn.dir][1] * 0.35, yaw: Math.atan2(-DIRS[L.spawn.dir][0], -DIRS[L.spawn.dir][1]) };
    this.time = 0;
    this.done = false;
    this.entranceOpen = true;
    this.cell = [L.spawn.x, L.spawn.y];
    this.toStairs = L.map.bfs(L.stairs.x, L.stairs.y);
    this.fromSpawn = L.map.bfs(L.spawn.x, L.spawn.y);
    this.pendingSeal = null;
    this.sealCooldown = 25;
    this.fixed = new Set([L.stairs, L.cold, L.entrance].filter(Boolean).map((c) => L.map.idx(c.x, c.y)));
    this.lostWay = false;
    this.nextSound = 5;
    this.wiresTold = new Set();
    this.something = null;
    this.somethingCooldown = 40;
    this.fog = new THREE.Color(0, 0, 0);
    this.fogDensity = 0.13;
    this.sight = 0.7;
    this.told = {};
  }

  // ---- The doors: the way back to Level 5, and the cold one -------------------------

  buildDoors() {
    const { map, shared } = this;
    const renderer = this.ctx.renderer;
    // Props take the world's light, so they only show up within arm's reach.
    const mats = {};
    const mat = (name, color) => {
      if (!mats[name]) {
        const tex = solidTexture(renderer, color, 0.1);
        this.textures[`prop_${name}`] = tex;
        mats[name] = createWorldMaterial(shared, tex, SURFACE.PLAIN, 1);
        this.mats.push(mats[name]);
      }
      return mats[name];
    };
    const mesh = (geo, m) => {
      this.geos.push(geo);
      return new THREE.Mesh(geo, m);
    };
    const glowMat = (color, opacity = 1) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity >= 1 });
      this.mats.push(m);
      return m;
    };
    // A group standing on the wall of cell c in direction c.dir, facing into the cell.
    const onWall = (c) => {
      const [cx, cz] = map.cellCenter(c.x, c.y);
      const g = new THREE.Group();
      g.position.set(cx + DIRS[c.dir][0] * (CELL / 2 - 0.09), 0, cz + DIRS[c.dir][1] * (CELL / 2 - 0.09));
      g.rotation.y = Math.atan2(-DIRS[c.dir][0], -DIRS[c.dir][1]);
      this.props.add(g);
      return g;
    };
    const box = (g, m, x, y, z, w, h, d) => {
      const b = mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      g.add(b);
      return b;
    };

    // Level 5: the steel boiler-room door, a line of furnace glow under it.
    const e = this.layout.entrance;
    const door = onWall(e);
    const steel = mat('steel', '#3a3632');
    for (const s of [-1, 1]) box(door, steel, s * 0.52, 1.08, 0.03, 0.08, 2.16, 0.06);
    box(door, steel, 0, 2.2, 0.03, 1.12, 0.08, 0.06);
    box(door, mat('door', '#2a2622'), 0, 1.06, 0.02, 0.96, 2.1, 0.03);
    box(door, mat('handle', '#6a645c'), 0.36, 1.0, 0.05, 0.04, 0.2, 0.03);
    // The gap under the door, and the light it spills across the floor.
    const glow = new THREE.Group();
    const slit = mesh(new THREE.PlaneGeometry(0.94, 0.022), glowMat(0xff7a2a));
    slit.position.set(0, 0.011, 0.036);
    const spill = mesh(new THREE.PlaneGeometry(1.1, 0.5), glowMat(0xff5a10, 0.18));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, 0.004, 0.27);
    glow.add(slit, spill);
    door.add(glow);
    const [ex, ez] = map.cellCenter(e.x, e.y);
    this.entrance = { group: door, glow, x: ex + DIRS[e.dir][0] * 0.45, z: ez + DIRS[e.dir][1] * 0.45 };

    // Level 7: a stairwell up from the end of a hall. The ceiling opens up above it.
    const st = this.layout.stairs;
    const sg = onWall(st);
    const stone = mat('stair', '#8a8a86');
    const rail = mat('rail', '#4a4c50');
    for (let k = 0; k < 6; k++) box(sg, stone, 0, 0.09 * (k + 1), 0.065 + (5 - k) * 0.13, 1.5, 0.18 * (k + 1), 0.13);
    for (const s of [-1, 1]) {
      const r = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.35, 6), rail);
      r.position.set(s * 0.68, 1.45, 0.39);
      r.rotation.x = -0.62;
      sg.add(r);
    }

    // Level 129: a huge metal door, furred with frost. You feel it before you find it.
    const c = this.layout.cold;
    if (c) {
      const g = onWall(c);
      const iron = mat('iron', '#8a96a4');
      box(g, iron, 0, 1.25, 0.05, 1.42, 2.5, 0.1);
      for (const y of [0.4, 1.25, 2.1]) box(g, mat('band', '#3e464e'), 0, y, 0.11, 1.42, 0.1, 0.03);
      box(g, mat('wheel', '#2e3238'), 0.45, 1.25, 0.14, 0.08, 0.3, 0.06);
      // Frost creeping out across the floor, faintly pale even in the dark.
      const frost = mesh(new THREE.PlaneGeometry(1.5, 0.7), glowMat(0x4a6a90, 0.14));
      frost.rotation.x = -Math.PI / 2;
      frost.position.set(0, 0.004, 0.36);
      const rime = mesh(new THREE.PlaneGeometry(1.36, 0.03), glowMat(0x9ab8d8, 0.5));
      rime.position.set(0, 0.016, 0.11);
      g.add(frost, rime);
      const [cx, cz] = map.cellCenter(c.x, c.y);
      this.cold = { x: cx + DIRS[c.dir][0] * 0.4, z: cz + DIRS[c.dir][1] * 0.4 };
    }

    // Wires strung across the floor at ankle height.
    const wire = mat('wire', '#1a1a1a');
    for (const w of this.layout.wires) {
      const [wx, wz] = map.cellCenter(w.x, w.y);
      const m = mesh(new THREE.CylinderGeometry(0.008, 0.008, CELL, 5), wire);
      const along = map.canMove(w.x, w.y, 0) || map.canMove(w.x, w.y, 1);
      // Strung across the hall: perpendicular to the way it runs.
      if (along) m.rotation.set(Math.PI / 2, 0, 0);
      else m.rotation.set(0, 0, Math.PI / 2);
      m.position.set(wx, 0.12, wz);
      this.props.add(m);
    }
  }

  // ---- Per frame ---------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx, map } = this;
    if (player.flashlight) player.flashlight = false;
    if (!this.told.dark) {
      this.told.dark = true;
      ctx.hud.message('Total darkness. Your flashlight won\'t turn on.', 4);
    }
    this.updateSight(player);
    this.world.flush();

    const [cx, cy] = map.cellAt(player.pos.x, player.pos.z);
    if (cx !== this.cell[0] || cy !== this.cell[1]) this.enterCell(this.cell, [cx, cy], player);
    this.cell = [cx, cy];
    this.updateSeal(dt, player);

    // The ways out.
    const [sx, sz] = map.cellCenter(this.layout.stairs.x, this.layout.stairs.y);
    if (Math.hypot(sx - player.pos.x, sz - player.pos.z) < 0.6) {
      this.done = true;
      ctx.hud.message('Steps, going down. The sound of waves.', 3);
      ctx.onEscape('level7', 'walk');
      return;
    }
    if (this.cold) {
      const d = Math.hypot(this.cold.x - player.pos.x, this.cold.z - player.pos.z);
      if (d < 4 && !this.told.cold) {
        this.told.cold = true;
        ctx.hud.message('The air turns bitterly cold. Your breath catches.', 3);
      }
      if (d < 0.6) {
        this.done = true;
        ctx.hud.message('Your hand finds a huge metal door, so cold it burns. It gives.', 3);
        ctx.onEscape('level129', 'door');
        return;
      }
    }
    if (this.entranceOpen && Math.hypot(this.entrance.x - player.pos.x, this.entrance.z - player.pos.z) < 0.4 && this.time > 2) {
      this.done = true;
      ctx.onEscape('level5', 'door');
      return;
    }
    // Wires across the floor.
    for (const w of this.layout.wires) {
      const [wx, wz] = map.cellCenter(w.x, w.y);
      if (Math.hypot(wx - player.pos.x, wz - player.pos.z) > 0.5) continue;
      const key = `${w.x},${w.y}`;
      if (player.sprinting || (!this.wiresTold.has(key) && this.rng.chance(0.25))) {
        this.done = true;
        ctx.audio.thud(0, 0.5);
        ctx.hud.message('Your foot catches on a wire. You fall, and keep falling.', 3);
        ctx.onEscape('level6_1', 'noclip');
        return;
      }
      if (!this.wiresTold.has(key)) {
        this.wiresTold.add(key);
        ctx.hud.message('Something catches at your ankle. A wire. You step over it, carefully.', 3);
      }
    }

    this.updateSomething(dt, player);
    if (this.done) return;
    this.updateHallucinations(dt, player);

    // Isolation wears you down, faster if you stop moving.
    const still = player.speed < 0.3;
    player.sanity = Math.max(0, player.sanity - (0.32 + (still ? 0.25 : 0)) * dt);
    if (player.sanity <= 0 || player.health <= 0) {
      this.done = true;
      ctx.onDeath(player.health <= 0 ? 'Something in the dark found you. You never saw it.' : 'The dark kept you.');
    }
  }

  // Eyes adjusted to the dark: a wall at arm's length, a grey shape, nothing more.
  updateSight(player) {
    const sh = this.shared;
    sh.globalLight.value = 1;
    for (let k = 0; k < sh.dynPos.value.length; k++) sh.dynPos.value[k].set(0, -100, 0, 0);
    sh.dynPos.value[0].set(player.pos.x - Math.sin(player.yaw) * 0.3, 1.45, player.pos.z - Math.cos(player.yaw) * 0.3, this.sight);
    sh.dynCol.value[0].setRGB(0.7, 0.72, 0.78);
    const g = this.entranceOpen ? 0.5 + 0.5 * Math.sin(this.time * 1.7) * Math.sin(this.time * 0.6) : 0;
    this.entrance.glow.children[0].material.color.setRGB(0.6 + g * 0.4, 0.28 + g * 0.16, 0.08);
  }

  // Wrong turns: step into a branch that leads away from the stairs, and
  // the way you came may close behind you once you're out of sight of it.
  enterCell(prev, cur, player) {
    const { map } = this;
    const i0 = map.idx(prev[0], prev[1]), i1 = map.idx(cur[0], cur[1]);
    // Far enough in, the door back to Level 5 slams.
    if (this.entranceOpen && this.fromSpawn[i1] > 7) {
      this.entranceOpen = false;
      this.entrance.glow.visible = false;
      this.ctx.audio.thud(-0.3, 0.6);
      this.ctx.audio.crash?.(-0.3, 0.2);
      this.ctx.hud.message('Far behind you, a heavy door slams shut.', 3);
    }
    const d = [0, 1, 2, 3].find((k) => prev[0] + DIRS[k][0] === cur[0] && prev[1] + DIRS[k][1] === cur[1]);
    if (d == null) return;
    const exits = [0, 1, 2, 3].filter((k) => map.canMove(prev[0], prev[1], k)).length;
    if (exits < 3 || this.toStairs[i1] <= this.toStairs[i0] || this.sealCooldown > 0 || this.pendingSeal) return;
    if (!this.rng.chance(0.45)) return;
    this.pendingSeal = { edge: map.edge(prev[0], prev[1], d), at: prev.slice() };
  }

  updateSeal(dt, player) {
    this.sealCooldown -= dt;
    const s = this.pendingSeal;
    if (!s) return;
    const { map } = this;
    const [ax, az] = map.cellCenter(s.at[0], s.at[1]);
    const d = Math.hypot(ax - player.pos.x, az - player.pos.z);
    // Back at the junction: the moment passes.
    if (d < 1.2) {
      this.pendingSeal = null;
      return;
    }
    if (d < 4.5 || map.hasLineOfSight(player.pos.x, player.pos.z, ax, az)) return;
    this.pendingSeal = null;
    this.sealCooldown = 35;
    map.setEdge(s.edge, EDGE_WALL);
    this.world.rebuildAroundEdge(s.edge);
    this.world.rebuildCollision();
    // The halls are always connected somehow: open a way elsewhere, out of sight.
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    // Sometimes it doesn't: the way to Level 7 is simply gone. (A wire is
    // always left within reach.)
    const reach = map.bfs(px, py);
    const lose = !this.lostWay && this.rng.chance(0.2) && reach[map.idx(this.layout.stairs.x, this.layout.stairs.y)] < 0 && this.layout.wires.some((w) => reach[map.idx(w.x, w.y)] >= 0);
    for (let guard = 0; guard < 40 && !lose; guard++) {
      const dist = map.bfs(px, py);
      if (dist[map.idx(this.layout.stairs.x, this.layout.stairs.y)] >= 0) break;
      const cand = [];
      for (let y = 0; y < map.rows; y++) {
        for (let x = 0; x < map.cols; x++) {
          if (dist[map.idx(x, y)] < 5) continue;
          for (const k of [0, 2]) {
            const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
            if (!map.inBounds(nx, ny) || dist[map.idx(nx, ny)] >= 0 || map.getEdge(map.edge(x, y, k)) !== EDGE_WALL) continue;
            if (this.fixed.has(map.idx(x, y)) || this.fixed.has(map.idx(nx, ny))) continue;
            cand.push(map.edge(x, y, k));
          }
        }
      }
      if (!cand.length) {
        // Nothing far enough: reopen what closed.
        map.setEdge(s.edge, EDGE_OPEN);
        this.world.rebuildAroundEdge(s.edge);
        break;
      }
      this.world.removeWall(this.rng.pick(cand));
      this.world.flush();
    }
    this.world.rebuildCollision();
    this.toStairs = map.bfs(this.layout.stairs.x, this.layout.stairs.y);
    this.ctx.audio.thud(this.rng.range(-1, 1), 0.35);
    if (lose) {
      this.lostWay = true;
      this.ctx.hud.message('Concrete grinds shut behind you. The sound of the waves is gone.', 4);
    } else this.ctx.hud.message('Behind you, concrete grinds against concrete. Then silence.', 3);
  }

  // Possibly an entity. Nobody has seen it. At low sanity it comes up
  // behind you, breathing; keep moving and it loses you.
  updateSomething(dt, player) {
    const { ctx, map } = this;
    this.somethingCooldown -= dt;
    let s = this.something;
    if (!s) {
      if (this.somethingCooldown > 0 || player.sanity > 55 || !this.rng.chance(dt * 0.08)) return;
      const [px, py] = map.cellAt(player.pos.x, player.pos.z);
      const dist = map.bfs(px, py);
      const cand = [];
      for (let i = 0; i < dist.length; i++) if (dist[i] >= 8 && dist[i] <= 12) cand.push(i);
      if (!cand.length) return;
      const i = this.rng.pick(cand);
      const [x, z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
      s = this.something = { x, z, t: 0, next: 0 };
    }
    s.t += dt;
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    if (!s.flow || s.next <= 0) {
      s.flow = map.bfs(px, py);
      s.next = 0.5;
    }
    s.next -= dt;
    const [cx, cy] = map.cellAt(s.x, s.z);
    const here = s.flow[map.idx(cx, cy)];
    let tx = player.pos.x, tz = player.pos.z;
    if (here > 1) {
      for (let k = 0; k < 4; k++) {
        if (!map.canMove(cx, cy, k)) continue;
        if (s.flow[map.idx(cx + DIRS[k][0], cy + DIRS[k][1])] === here - 1) {
          [tx, tz] = map.cellCenter(cx + DIRS[k][0], cy + DIRS[k][1]);
          break;
        }
      }
    }
    const dx = tx - s.x, dz = tz - s.z, l = Math.hypot(dx, dz) || 1;
    const speed = player.sprinting ? 1.4 : 2.0;
    s.x += (dx / l) * Math.min(l, speed * dt);
    s.z += (dz / l) * Math.min(l, speed * dt);
    const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
    s.breath = (s.breath ?? 0) - dt;
    if (s.breath <= 0 && d < 12) {
      s.breath = 3;
      ctx.audio.breath(this.panTo(player, s.x, s.z), 0.25 * (1 - d / 12));
    }
    if (d < 0.8) {
      player.damage(28);
      player.sanity = Math.max(0, player.sanity - 15);
      ctx.hurtFlash(0.8);
      ctx.vibrate([150, 50, 200]);
      ctx.audio.jumpscare();
      ctx.hud.message('Something brushes past you in the dark. Then it is gone.', 3);
      this.something = null;
      this.somethingCooldown = this.rng.range(45, 90);
    } else if (s.t > 40 || (player.sprinting && d > 7 && this.rng.chance(dt * 0.4))) {
      this.something = null;
      this.somethingCooldown = this.rng.range(30, 60);
    }
  }

  updateHallucinations(dt, player) {
    this.nextSound -= dt;
    if (this.nextSound > 0) return;
    const insane = 1 - player.sanity / 100;
    this.nextSound = this.rng.range(8, 20) * (1 - insane * 0.7);
    const a = this.ctx.audio, pan = this.rng.range(-1, 1);
    const r = this.rng.next();
    if (r < 0.3) a.whisper(pan, 0.08 + insane * 0.2);
    else if (r < 0.55) a.breath(pan, 0.06 + insane * 0.12);
    else if (r < 0.8) a.scratch?.(pan, 0.08 + insane * 0.15);
    else a.phantomSteps(pan);
  }

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

  // ---- Values the game reads every frame --------------------------------------------

  audioMix(player) {
    // Waves from the stairwell, loudest along the way that actually leads there.
    const { map } = this;
    const [cx, cy] = map.cellAt(player.pos.x, player.pos.z);
    const steps = this.toStairs[map.idx(cx, cy)];
    let waves = 0, pan = 0;
    if (steps >= 0) {
      waves = 0.02 + 0.22 * Math.max(0, 1 - steps / 45);
      // Pan towards the next cell on the way.
      for (let k = 0; k < 4; k++) {
        if (!map.canMove(cx, cy, k)) continue;
        if (this.toStairs[map.idx(cx + DIRS[k][0], cy + DIRS[k][1])] === steps - 1) {
          const [nx, nz] = map.cellCenter(cx + DIRS[k][0], cy + DIRS[k][1]);
          pan = this.panTo(player, nx, nz) * 0.7;
          break;
        }
      }
    }
    let drone = 0;
    if (this.something) drone = 0.22 * Math.max(0, 1 - Math.hypot(this.something.x - player.pos.x, this.something.z - player.pos.z) / 14);
    return { hum: 0, exitGain: 0, exitPan: 0, drone, machine: 0, jazz: 0, wind: 0, waves, wavesPan: pan, sanity: player.sanity, ears: player.coveringEars };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    return {
      fogColor: this.fog,
      fogDensity: this.fogDensity,
      warp: insane * insane * 1.4,
      aberr: 0.3 + insane * 1.5,
      grain: 0.12 + insane * 0.08,
    };
  }

  hudInfo() {
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: true };
  }

  dispose() {
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    this.world.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    disposeTextures(this.textures);
  }
}

// ---- Layout: a maze of one-cell hallways ---------------------------------------------

function generate(rng) {
  const N = SIZE;
  const map = new GridMap(N, N, CELL, HEIGHT);
  for (let y = 0; y <= N; y++) for (let x = 0; x < N; x++) map.setH(x, y, EDGE_WALL);
  for (let y = 0; y < N; y++) for (let x = 0; x <= N; x++) map.setV(x, y, EDGE_WALL);
  // Growing-tree maze: mostly long corridors, some branching.
  const seen = new Uint8Array(N * N);
  const start = [Math.floor(N / 2), N - 1];
  const stack = [start];
  seen[map.idx(...start)] = 1;
  while (stack.length) {
    const cur = rng.chance(0.85) ? stack[stack.length - 1] : rng.pick(stack);
    const opts = [0, 1, 2, 3].filter((d) => {
      const nx = cur[0] + DIRS[d][0], ny = cur[1] + DIRS[d][1];
      return map.inBounds(nx, ny) && !seen[map.idx(nx, ny)];
    });
    if (!opts.length) {
      stack.splice(stack.indexOf(cur), 1);
      continue;
    }
    // Prefer carrying straight on: long halls.
    const prev = cur.dir;
    const d = prev != null && opts.includes(prev) && rng.chance(0.6) ? prev : rng.pick(opts);
    map.setEdge(map.edge(cur[0], cur[1], d), EDGE_OPEN);
    const next = [cur[0] + DIRS[d][0], cur[1] + DIRS[d][1]];
    next.dir = d;
    seen[map.idx(...next)] = 1;
    stack.push(next);
  }
  // A few loops.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      for (const d of [0, 2]) {
        if (!map.inBounds(x + DIRS[d][0], y + DIRS[d][1]) || map.canMove(x, y, d) || !rng.chance(0.05)) continue;
        map.setEdge(map.edge(x, y, d), EDGE_OPEN);
      }
    }
  }
  const dist = map.bfs(start[0], start[1]);
  const deadEnds = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ([0, 1, 2, 3].filter((d) => map.canMove(x, y, d)).length === 1) deadEnds.push([x, y]);
  deadEnds.sort((a, b) => dist[map.idx(...b)] - dist[map.idx(...a)]);
  const open = (x, y) => [0, 1, 2, 3].find((d) => map.canMove(x, y, d));
  // The stairwell to Level 7: the farthest dead end. The cold door: another far one.
  const [stx, sty] = deadEnds[0];
  const stairs = { x: stx, y: sty, dir: open(stx, sty) ^ 1 };
  let cold = null;
  if (rng.chance(0.6)) {
    const far = deadEnds.slice(1, 12).filter(([x, y]) => Math.abs(x - stx) + Math.abs(y - sty) > 10);
    if (far.length) {
      const [cx, cy] = rng.pick(far);
      cold = { x: cx, y: cy, dir: open(cx, cy) ^ 1 };
    }
  }
  // Arrival: the start cell, with the door back to Level 5 in a wall.
  const entrance = { x: start[0], y: start[1], dir: 2 };
  const spawn = { x: start[0], y: start[1], dir: open(start[0], start[1]) ?? 3 };
  // Wires: a handful, never right at the start.
  const wires = [];
  const special = new Set([stairs, cold].filter(Boolean).map((c) => map.idx(c.x, c.y)));
  const cells = rng.shuffle([...Array(N * N).keys()].filter((i) => dist[i] > 6 && !special.has(i)));
  for (const i of cells.slice(0, 7)) wires.push({ x: i % N, y: (i / N) | 0 });
  return { map, stairs, cold, entrance, spawn, wires };
}

export const LEVEL6 = {
  id: 'level6',
  number: 6,
  name: 'Level 6',
  title: 'Lights Out',
  difficulty: 'PENDING',
  next: 'level7',
  create: (ctx) => new Level6(ctx),
};
