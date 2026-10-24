import * as THREE from 'three';
import { GridWorld } from '../../world/GridWorld.js';
import { EDGE_WALL } from '../../world/GridMap.js';
import { paintedWallTexture, carpetTexture, ceilingTexture, tileTexture, woodTexture } from '../../world/textures.js';
import { PropKit, nearDoor } from '../../world/props.js';
import { generateLevel02 } from './generate.js';

// Level 0.2 — Level 0, "remodelled" by the Backrooms Remodeling Co.
//
// It looks better than Level 0 until you've been in it a few seconds. Then
// it falls apart: a chain reaction spreads out from where you came in.
// Ceiling tiles drop, walls topple, the floor gives way to the unfinished
// house underneath, and the dust chokes you. It stops once it reaches the
// door back to Level 0, so you have to get there first.

const START_DELAY = 8; // seconds of calm before the first crack
const DROP = 0.35; // must match GridWorld's collapsed floor depth
const WARN = -1.0, CEIL = 0, WALLS = 0.5, FLOOR = 1.4; // phase offsets per cell
const BOTTLE_SANITY = 35;
const MAX_BOTTLES = 6;

export class Level02 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel02(rng.fork('layout'));
    this.layout = layout;
    const { map } = layout;
    this.map = map;

    this.textures = {
      wall: paintedWallTexture(renderer),
      floor: carpetTexture(renderer, '#6e2a24'),
      ceiling: ceilingTexture(renderer, '#e3e2d8'),
      tile: tileTexture(renderer),
      wood: woodTexture(renderer),
    };
    shared.ceilH.value = map.height;
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      textures: this.textures,
      shared,
      texScale: { wall: [1, 1 / map.height] },
      floorStyle: (x, y) => (layout.bathroom[map.idx(x, y)] ? 'tile' : 'floor'),
      dampAt: () => 0, // the carpet is dry here
    });
    scene.add(this.world.group);

    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx, z: sz, yaw: layout.spawnYaw };

    // Set dressing.
    this.kit = new PropKit((x, z) => this.world.sampleLight(x, z));
    this.props = new THREE.Group();
    const ed = layout.exitDoor;
    this.door = this.kit.door(map, ed.edge, ed.side, { panel: 0x8c6a46, inset: 0x7c5c3a, frame: 0xdcd8c8, glow: 0xf5e27a });
    this.props.add(this.door.group);
    this.outlets = layout.outlets;
    for (const o of this.outlets) this.props.add(this.kit.outlet(o));
    for (const f of layout.fixtures) this.props.add(this.kit[f.type](f.x, f.z, f.rot));
    this.bottles = layout.bottles.map((b) => {
      const m = this.makeBottle(b.x, b.z);
      this.props.add(m);
      return { ...b, mesh: m, taken: false };
    });
    scene.add(this.props);

    this.scheduleCollapse();
    this.setupDebris();

    this.time = 0;
    this.done = false;
    this.lum = 1;
    this.dustHere = 0;
    this.kick = 0;
    this.fogColor = new THREE.Color(0.7, 0.69, 0.64);
    this.fogDensity = 0.022;
    this.sfxCooldown = {};
    this.lastHurt = 'debris';
    this.nextCough = 0;
    this.said = new Set();
  }

  // ---- Collapse schedule -------------------------------------------------

  scheduleCollapse() {
    const { map, spawn, exitDoor, dist } = this.layout;
    const n = map.cols * map.rows;
    const euclid = (x, y) => Math.hypot(x - spawn.x, y - spawn.y);
    const door = exitDoor.side;
    const walk = Math.max(1, dist[map.idx(door.x, door.y)]);
    // Roughly twice the time a straight walk to the door would take.
    this.doorTime = START_DELAY + Math.max(70, walk * 1.25 * 2.1);
    this.secPerCell = (this.doorTime - START_DELAY) / Math.max(1, euclid(door.x, door.y));
    this.collapseAt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % map.cols, y = (i / map.cols) | 0;
      this.collapseAt[i] = START_DELAY + euclid(x, y) * this.secPerCell + this.rng.range(0, 1.5);
    }
    this.collapseAt[map.idx(door.x, door.y)] = this.doorTime;
    this.order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.collapseAt[a] - this.collapseAt[b]);
    this.ptr = { warn: 0, ceil: 0, walls: 0, floor: 0 };
  }

  setupDebris() {
    this.tileGeo = new THREE.BoxGeometry(0.58, 0.025, 0.58);
    this.tileMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.78, 0.77, 0.72) });
    this.tiles = [];
    this.slabs = [];
    this.debrisByCell = new Map();
    this.dust = new Float32Array(this.map.cols * this.map.rows);
    this.debrisGroup = new THREE.Group();
    this.scene.add(this.debrisGroup);

    // Dust motes that hang around the camera when the air is thick.
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 8;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motesMat = new THREE.PointsMaterial({ color: 0xd8ccb4, size: 0.04, transparent: true, opacity: 0, depthWrite: false });
    this.motes = new THREE.Points(g, this.motesMat);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  makeBottle(x, z) {
    const k = this.kit;
    const g = new THREE.Group();
    g.add(k.mesh(k.cyl(0.055, 0.06, 0.26, 10), k.mat(0xd0dad0, x, z, { opacity: 0.85 }), 0, 0.13, 0));
    g.add(k.mesh(k.cyl(0.03, 0.03, 0.04, 8), k.mat(0x3355bb, x, z), 0, 0.29, 0));
    g.add(k.mesh(k.cyl(0.062, 0.062, 0.09, 10), k.mat(0xe6c070, x, z), 0, 0.12, 0));
    g.position.set(x, 0, z);
    return g;
  }

  cellXY(i) {
    return [i % this.map.cols, (i / this.map.cols) | 0];
  }

  // A sound from a world position, if the player is near enough to hear it.
  sfx(name, x, z, player, range, vol, cooldown = 0.15) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return;
    if ((this.sfxCooldown[name] || 0) > this.time) return;
    this.sfxCooldown[name] = this.time + cooldown;
    const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / Math.max(d, 1);
    this.ctx.audio[name](pan, vol * (1 - d / range) ** 1.5);
  }

  addDust(x, y, amount) {
    const { map } = this;
    for (const [dx, dy, k] of [[0, 0, 1], [1, 0, 0.4], [-1, 0, 0.4], [0, 1, 0.4], [0, -1, 0.4]]) {
      if (!map.inBounds(x + dx, y + dy)) continue;
      const j = map.idx(x + dx, y + dy);
      this.dust[j] = Math.min(1.2, this.dust[j] + amount * k);
    }
  }

  isDoorEdge(e) {
    const d = this.layout.exitDoor.edge;
    return e.h === d.h && e.x === d.x && e.y === d.y;
  }

  // ---- Destruction steps -------------------------------------------------

  warnCell(i, player) {
    const [x, y] = this.cellXY(i);
    const [wx, wz] = this.map.cellCenter(x, y);
    if (this.rng.chance(0.5)) this.sfx('creak', wx, wz, player, 18, 0.35, 0.35);
  }

  breakCeiling(i, player) {
    const [x, y] = this.cellXY(i);
    const [wx, wz] = this.map.cellCenter(x, y);
    this.world.breakCell(x, y, 1);
    const H = this.map.height;
    for (let k = this.rng.int(2, 4); k > 0; k--) {
      const m = new THREE.Mesh(this.tileGeo, this.tileMat);
      m.position.set(wx + this.rng.range(-1.2, 1.2), H - 0.05, wz + this.rng.range(-1.2, 1.2));
      this.debrisGroup.add(m);
      this.tiles.push({ mesh: m, vy: -this.rng.range(0, 1), falling: true, hit: false, spin: [this.rng.range(-3, 3), this.rng.range(-3, 3)], delay: this.rng.range(0, 0.4) });
    }
    this.addDust(x, y, 0.8);
    this.sfx('clatter', wx, wz, player, 20, 0.45);
  }

  toppleWalls(i, player) {
    const [x, y] = this.cellXY(i);
    const { map } = this;
    const cs = map.cellSize, H = map.height;
    const sp = this.layout.spawn;
    for (let d = 0; d < 4; d++) {
      const e = map.edge(x, y, d);
      if (map.getEdge(e) !== EDGE_WALL || map.isBoundaryEdge(e) || this.isDoorEdge(e)) continue;
      // Walls fall away from where the collapse started.
      const mx = e.h ? (e.x + 0.5) * cs : e.x * cs;
      const mz = e.h ? e.y * cs : (e.y + 0.5) * cs;
      const away = e.h ? mz - (sp.y + 0.5) * cs : mx - (sp.x + 0.5) * cs;
      const s = away >= 0 ? 1 : -1;
      const pivot = new THREE.Group();
      pivot.position.set(mx, 0, mz);
      const geo = e.h ? new THREE.BoxGeometry(cs, H, 0.16) : new THREE.BoxGeometry(0.16, H, cs);
      const [r, g, b] = this.world.sampleLight(mx, mz);
      const lit = Math.max(0.35, (r + g + b) / 3 * 1.3);
      const mat = new THREE.MeshBasicMaterial({ map: this.textures.wall, color: new THREE.Color(lit, lit, lit * 0.97) });
      const slab = new THREE.Mesh(geo, mat);
      slab.position.y = H / 2;
      pivot.add(slab);
      this.debrisGroup.add(pivot);
      // Cell the slab lands in.
      const lx = e.h ? e.x : (s > 0 ? e.x : e.x - 1);
      const ly = e.h ? (s > 0 ? e.y : e.y - 1) : e.y;
      this.slabs.push({ pivot, geo, mat, e, s, t: 0, landed: false, mx, mz, cell: map.inBounds(lx, ly) ? map.idx(lx, ly) : -1 });
      this.world.removeWall(e);
      this.sfx('creak', mx, mz, player, 16, 0.5, 0.2);
    }
  }

  breakFloor(i, player) {
    const [x, y] = this.cellXY(i);
    const [wx, wz] = this.map.cellCenter(x, y);
    this.world.breakCell(x, y, 2);
    for (const obj of this.debrisByCell.get(i) || []) obj.position.y -= DROP;
    this.debrisByCell.delete(i);
    this.addDust(x, y, 0.6);
    this.sfx('crash', wx, wz, player, 22, 0.55, 0.5);
    const [px, py] = this.map.cellAt(player.pos.x, player.pos.z);
    if (px === x && py === y) {
      this.hurt(player, 6, 'debris');
      this.kick = 1;
    }
  }

  settle(obj, i) {
    if (i < 0) return;
    if (!this.debrisByCell.has(i)) this.debrisByCell.set(i, []);
    this.debrisByCell.get(i).push(obj);
  }

  hurt(player, amount, cause) {
    player.damage(amount);
    this.lastHurt = cause;
    this.kick = Math.max(this.kick, 0.6);
    this.ctx.audio.hurt();
    this.ctx.vibrate(60);
    this.ctx.hurtFlash(Math.min(0.8, amount / 30));
  }

  // ---- Per-frame ---------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const t = this.time;
    const { ctx, map } = this;
    const hud = ctx.hud;

    if (t > 0.6 && this.once('intro')) hud.message('Dry carpet. Fresh paint. Your phone picks up Wi-Fi.', 4.5);
    if (t > START_DELAY - 3 && this.once('creak')) {
      ctx.audio.creak(0, 0.5);
      hud.message('Something creaks overhead.', 2.5);
    }
    if (t > START_DELAY && this.once('start')) {
      ctx.audio.crash(0, 0.4);
      hud.message("It's coming apart. Find the door back to Level 0.", 5);
    }

    // Advance the chain reaction.
    const order = this.order, at = this.collapseAt, p = this.ptr;
    while (p.warn < order.length && at[order[p.warn]] + WARN <= t) this.warnCell(order[p.warn++], player);
    while (p.ceil < order.length && at[order[p.ceil]] + CEIL <= t) this.breakCeiling(order[p.ceil++], player);
    while (p.walls < order.length && at[order[p.walls]] + WALLS <= t) this.toppleWalls(order[p.walls++], player);
    while (p.floor < order.length && at[order[p.floor]] + FLOOR <= t) this.breakFloor(order[p.floor++], player);
    this.world.flush();

    this.updateDebris(dt, player);

    // Dust settles slowly.
    for (let i = 0; i < this.dust.length; i++) if (this.dust[i] > 0) this.dust[i] = Math.max(0, this.dust[i] - 0.06 * dt);
    const [cx, cy] = map.cellAt(player.pos.x, player.pos.z);
    const dustNow = Math.min(1, this.dust[map.idx(cx, cy)]);
    this.dustHere += (dustNow - this.dustHere) * Math.min(1, dt * 2);
    if (this.dustHere > 0.15) {
      player.damage(this.dustHere * (player.coveringEars ? 1.2 : 5) * dt);
      this.lastHurt = 'dust';
      if (!player.coveringEars && this.dustHere > 0.35 && t > this.nextCough) {
        ctx.audio.cough();
        this.nextCough = t + this.rng.range(1.8, 3.2);
      }
      if (this.once('dust')) hud.message(ctx.touch ? 'The dust is choking. Hold MOUTH to cover it.' : 'The dust is choking. Hold C to cover your mouth.', 4);
    }

    // Light and sanity.
    const [lr, lg, lb] = this.world.sampleLight(player.pos.x, player.pos.z);
    this.lum += ((lr + lg + lb) / 3 - this.lum) * Math.min(1, dt * 3);
    player.sanity = Math.max(0, player.sanity - (0.04 + this.dustHere * 0.2) * dt);

    // Working outlets charge the flashlight.
    let charging = false;
    for (const o of this.outlets) {
      if (Math.abs(o.x - player.pos.x) < 1.1 && Math.abs(o.z - player.pos.z) < 1.1) {
        charging = true;
        break;
      }
    }
    if (charging && player.battery < 100) {
      player.battery = Math.min(100, player.battery + 12 * dt);
      if (this.once('outlet')) hud.message('A working outlet. Your flashlight charges.', 3);
    }

    // Almond Water.
    for (const b of this.bottles) {
      if (b.taken || player.bottles >= MAX_BOTTLES) continue;
      if (Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 0.9) {
        b.taken = true;
        this.props.remove(b.mesh);
        player.bottles++;
        ctx.audio.pickup();
        hud.message('Almond Water', 2);
      }
    }

    if (player.health <= 0) {
      this.done = true;
      ctx.onDeath(this.lastHurt === 'dust' ? 'The dust filled your lungs.' : 'Crushed under the remodel.');
      return;
    }
    if (player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('Your mind came apart with the walls.');
      return;
    }

    // The door back.
    const dd = Math.hypot(player.pos.x - this.door.x, player.pos.z - this.door.z);
    if (dd < 6 && this.once('door')) hud.message('Light under a door. You can hear the hum.', 3);
    if (nearDoor(this.door, player.pos.x, player.pos.z)) {
      this.done = true;
      ctx.onEscape('level0', 'door');
      return;
    }
    if (t >= this.doorTime + 0.6) {
      this.done = true;
      ctx.onDeath('The collapse reached the door first. There is no way back.');
    }
  }

  once(key) {
    if (this.said.has(key)) return false;
    this.said.add(key);
    return true;
  }

  updateDebris(dt, player) {
    const { map } = this;
    for (const tile of this.tiles) {
      if (!tile.falling) continue;
      if (tile.delay > 0) {
        tile.delay -= dt;
        continue;
      }
      const m = tile.mesh;
      tile.vy -= 9.8 * dt;
      m.position.y += tile.vy * dt;
      m.rotation.x += tile.spin[0] * dt;
      m.rotation.z += tile.spin[1] * dt;
      if (!tile.hit && !player.dead) {
        const hd = Math.hypot(m.position.x - player.pos.x, m.position.z - player.pos.z);
        const rel = m.position.y - player.pos.y;
        if (hd < 0.55 && rel > 0.9 && rel < 1.95) {
          tile.hit = true;
          this.hurt(player, 14, 'debris');
        }
      }
      const ground = this.world.groundAt(m.position.x, m.position.z) + 0.015;
      if (m.position.y <= ground) {
        m.position.y = ground;
        m.rotation.set(this.rng.range(-0.08, 0.08), m.rotation.y, this.rng.range(-0.08, 0.08));
        tile.falling = false;
        if (ground > -0.1) {
          const [cx, cy] = map.cellAt(m.position.x, m.position.z);
          this.settle(m, map.idx(cx, cy));
        }
      }
    }
    // Don't let landed tiles pile up forever.
    if (this.tiles.length > 320) {
      const keep = [];
      let drop = this.tiles.length - 320;
      for (const tile of this.tiles) {
        if (drop > 0 && !tile.falling) {
          this.debrisGroup.remove(tile.mesh);
          drop--;
        } else {
          keep.push(tile);
        }
      }
      this.tiles = keep;
    }

    const H = map.height;
    for (const s of this.slabs) {
      if (s.landed) continue;
      s.t += dt;
      const k = Math.min(1, (s.t / 0.9) ** 2);
      const ang = k * (Math.PI / 2 - 0.05);
      if (s.e.h) s.pivot.rotation.x = s.s * ang;
      else s.pivot.rotation.z = -s.s * ang;
      if (k >= 1) {
        s.landed = true;
        this.addDust(...this.cellXY(Math.max(0, s.cell)), 0.6);
        this.sfx('crash', s.mx, s.mz, player, 22, 0.7, 0.25);
        // Anyone standing where it lands gets flattened.
        const dx = player.pos.x - s.mx, dz = player.pos.z - s.mz;
        const along = s.e.h ? Math.abs(dx) : Math.abs(dz);
        const out = (s.e.h ? dz : dx) * s.s;
        if (along < map.cellSize / 2 + 0.2 && out > -0.1 && out < H) this.hurt(player, 45, 'debris');
        if (this.world.groundAt(s.mx + (s.e.h ? 0 : s.s), s.mz + (s.e.h ? s.s : 0)) > -0.1) this.settle(s.pivot, s.cell);
      }
    }

    // Motes follow the camera.
    this.motesMat.opacity = Math.min(0.85, this.dustHere * 1.1);
    this.motes.visible = this.dustHere > 0.03;
    if (this.motes.visible) {
      this.motes.position.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
      this.motes.rotation.y += dt * 0.05;
      this.motes.position.y += Math.sin(this.time * 0.3) * 0.2;
    }
  }

  drink(player) {
    if (player.bottles <= 0) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.bottles--;
    player.sanity = Math.min(100, player.sanity + BOTTLE_SANITY);
    player.health = Math.min(100, player.health + 15);
    this.ctx.audio.drink();
    this.ctx.hud.message('You feel a little clearer.', 2);
  }

  // ---- Values the game reads every frame ---------------------------------

  // How close the collapse front is (0 far .. 1 on top of you).
  frontProximity(player) {
    if (this.time < START_DELAY) return 0;
    const sp = this.layout.spawn, cs = this.map.cellSize;
    const radius = (this.time - START_DELAY) / this.secPerCell;
    const mine = Math.hypot(player.pos.x / cs - (sp.x + 0.5), player.pos.z / cs - (sp.y + 0.5));
    const ahead = (mine - radius) * cs;
    return Math.max(0, Math.min(1, 1 - ahead / 20));
  }

  audioMix(player) {
    const d = Math.hypot(player.pos.x - this.door.x, player.pos.z - this.door.z);
    let exitGain = 0, exitPan = 0;
    if (d < 30) {
      const walls = this.map.wallsBetween(player.pos.x, player.pos.z, this.door.x + this.door.nx * 0.5, this.door.z + this.door.nz * 0.5, 3);
      exitGain = (0.5 / (1 + (d / 6) ** 2)) * Math.pow(0.55, walls);
      const dx = this.door.x - player.pos.x, dz = this.door.z - player.pos.z;
      exitPan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / Math.max(d, 1);
    }
    const front = this.frontProximity(player);
    return {
      hum: 0.015,
      exitGain,
      exitPan,
      exitType: 'hum',
      drone: this.time < START_DELAY ? 0 : 0.05 + front * 0.3,
      sanity: player.sanity,
      ears: false, // covering your mouth doesn't muffle anything
    };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const dust = this.dustHere;
    const clean = [0.02 + r * 0.82, 0.02 + g * 0.81, 0.02 + b * 0.78];
    const dirty = [0.05 + r * 0.6, 0.045 + g * 0.55, 0.035 + b * 0.45];
    const target = new THREE.Color(
      clean[0] + (dirty[0] - clean[0]) * dust,
      clean[1] + (dirty[1] - clean[1]) * dust,
      clean[2] + (dirty[2] - clean[2]) * dust,
    );
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const dens = 0.022 + dust * 0.13;
    this.fogDensity += (dens - this.fogDensity) * Math.min(1, dt * 2);
    this.kick = Math.max(0, this.kick - dt * 2);
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.2 + hurt * 0.4,
      aberr: 0.3 + insanity * 1.5 + dust * 1.2 + hurt * 1.5,
      grain: 0.045 + dust * 0.06 + insanity * 0.06,
      shake: this.frontProximity(player) * 0.45 + this.kick * 1.5,
    };
  }

  hudInfo() {
    const dusty = this.dustHere > 0.25;
    return {
      warn: dusty ? 'COVER YOUR MOUTH' : null,
      warnCovered: 'KEEP MOVING',
      coverLabel: 'MOUTH',
      health: true,
    };
  }

  dispose() {
    this.disposed = true;
    for (const g of [this.world.group, this.props, this.debrisGroup, this.motes]) this.scene.remove(g);
    this.world.dispose();
    this.kit.dispose();
    this.tileGeo.dispose();
    this.tileMat.dispose();
    for (const s of this.slabs) {
      s.geo.dispose();
      s.mat.dispose();
    }
    this.motes.geometry.dispose();
    this.motesMat.dispose();
    for (const t of Object.values(this.textures)) t.dispose();
  }
}

export const LEVEL0_2 = {
  id: 'level0_2',
  number: 0.2,
  name: 'Level 0.2',
  title: 'The Remodel',
  difficulty: 3,
  next: 'level0',
  create: (ctx) => new Level02(ctx),
};
