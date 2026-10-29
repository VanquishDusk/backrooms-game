import * as THREE from 'three';
import { GridWorld, GeoBuilder } from '../../world/GridWorld.js';
import { DIRS } from '../../world/GridMap.js';
import { SURFACE, MAX_DYN_LIGHTS, createWorldMaterial, createGlitchMaterial } from '../../world/materials.js';
import {
  plasterTexture, stainedCeilingTexture, floorboardTexture, pictureAtlasTexture, wallWritingTexture, solidTexture,
} from '../../world/textures.js';
import { disposeTextures } from '../../world/props.js';
import { generateLevel15, FEATURE } from './generate.js';

// Level 1.5 — "Inverted".
//
// The level is built as an ordinary house hallway and shown as a photo
// negative in monochrome: ceiling fixtures radiate darkness, the dark far
// ends of the hallways glow, black picture frames shine white. On top of
// that: walls that lean and sway, furniture hanging from the ceiling,
// fixtures set into the floor, doors hung upside-down, and moments where
// the whole view turns over.
//
// It is almost silent. Denizens whisper, and their whispers get QUIETER
// as you get closer. "She" moves only while you aren't looking at her.
//
// The only hum here is Level 0's, leaking through the one place reality is
// thin enough to noclip back out.

const WRITINGS = ['...she come... won\'t back... let go...', '...come back...', '...won\'t let go...'];
const LOGS = [
  'LOG 1: windows. the fake through don\'t go. upside the is down. dark is light here, light is dark.',
  'LOG 3: close them hear can\'t when. quiet means near. loud means far. remember remember.',
  'LOG 5: hum the follow. thin is reality where it. noclip back you can there. hurry before she.',
  'LOG 7: she is kind. stop running. come back. she won\'t let go.',
];

export class Level15 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel15(rng.fork('layout'));
    this.layout = layout;
    const { map } = layout;
    this.map = map;
    const H = map.height;

    // Fixtures set into the floor are real light sources too.
    for (const f of layout.floorLights) layout.lights.push({ x: f.x, z: f.z, color: [1, 1, 1], power: 0.7, state: 'on', floor: true });

    this.textures = {
      wall: plasterTexture(renderer),
      floor: floorboardTexture(renderer),
      ceiling: stainedCeilingTexture(renderer),
    };
    shared.ceilH.value = H;
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      textures: this.textures,
      shared,
      texScale: { wall: 1 / 1.6, floor: 1 / 1.4, ceiling: 1 / 2.5 },
      dampAt: () => 0,
      panelSize: [0.3, 1.1],
      panelDrop: 0.03,
    });
    // Floor fixtures have no ceiling panel.
    layout.lights.forEach((l, i) => {
      if (!l.floor) return;
      const m = new THREE.Matrix4().makeScale(0, 0, 0);
      this.world.panels.setMatrixAt(i, m);
    });
    this.world.panels.instanceMatrix.needsUpdate = true;
    this.exitMat = createGlitchMaterial(shared, this.textures.wall, 1 / 1.6);
    this.world.setExit(layout.exitEdge, this.exitMat);
    scene.add(this.world.group);

    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx, z: sz, yaw: layout.spawnYaw };
    this.card = { title: 'INVERTED', sub: 'SURVIVAL DIFFICULTY: UNKNOWN' };

    this.props = new THREE.Group();
    scene.add(this.props);
    this.buildWalls(renderer);
    this.buildUpsideDown();
    this.buildLogs();
    this.whisperers = [];
    for (let k = 0; k < 4; k++) this.whisperers.push(this.makeWhisperer());
    this.she = new She(scene, this.rng.fork('she'));

    this.flickers = layout.lights.map((l, i) => (l.state === 'flicker' ? i : -1)).filter((i) => i >= 0);
    this.phase = new Map(this.flickers.map((i) => [i, this.rng.next() * 100]));
    this.time = 0;
    this.done = false;
    this.flip = 0;
    this.flipEvent = null;
    this.nextFlip = this.rng.range(30, 55);
    this.glitchKick = 0;
    this.sheAt = this.rng.range(40, 65);
    this.fogColor = new THREE.Color(0, 0, 0);
    this.nextVoice = 0;
    this.stare = 0;
    shared.bend.value = 0.035;
  }

  mat(tex, scale = 1) {
    const m = createWorldMaterial(this.shared, tex, SURFACE.PLAIN, scale);
    (this.ownMats ||= []).push(m);
    return m;
  }

  // ---- Build -------------------------------------------------------------

  // A wall face of cell (x, y) in direction d: a point on it, its outward
  // normal and a "right" tangent (as seen when facing the wall).
  face(x, y, d) {
    const [cx, cz] = this.map.cellCenter(x, y);
    const off = this.map.cellSize / 2 - 0.08;
    const nx = -DIRS[d][0], nz = -DIRS[d][1];
    return { px: cx - nx * off, pz: cz - nz * off, nx, nz, rx: nz, rz: -nx };
  }

  // Axis-aligned box on a wall face: u along the wall, y up, depth out.
  slab(b, f, u0, u1, y0, y1, d0, d1) {
    const ax = f.px + f.rx * u0 + f.nx * d0, bx = f.px + f.rx * u1 + f.nx * d1;
    const az = f.pz + f.rz * u0 + f.nz * d0, bz = f.pz + f.rz * u1 + f.nz * d1;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    b.box(x0, z0, x1, z1, y0, y1);
    b.flat(x0, z0, x1, z1, y1, true);
    b.flat(x0, z0, x1, z1, y0, false);
  }

  // Flat quad on a wall face with explicit UVs (u0..u1, v0..v1).
  plane(b, f, u0, u1, y0, y1, depth, uv) {
    const P = (u, y) => [f.px + f.rx * u + f.nx * depth, y, f.pz + f.rz * u + f.nz * depth];
    const [a, c, e, g] = uv;
    b.quad(P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), [f.nx, 0, f.nz], [a, c], [e, c], [e, g], [a, g]);
  }

  buildWalls(renderer) {
    const t = this.textures;
    t.door = solidTexture(renderer, '#d6d6d2', 0.04);
    t.inset = solidTexture(renderer, '#a8a8a4', 0.04);
    t.trim = solidTexture(renderer, '#141414', 0.02);
    t.pictures = pictureAtlasTexture(renderer);
    const geo = { door: new GeoBuilder(), inset: new GeoBuilder(), trim: new GeoBuilder(), pictures: new GeoBuilder() };
    const writings = [];
    const rng = this.rng.fork('walls');
    for (const ft of this.layout.features) {
      const f = this.face(ft.x, ft.y, ft.d);
      if (ft.f === FEATURE.DOOR) {
        const w = 0.43, h = 2.05;
        this.slab(geo.trim, f, -w - 0.07, -w, 0, h + 0.07, 0, 0.05);
        this.slab(geo.trim, f, w, w + 0.07, 0, h + 0.07, 0, 0.05);
        this.slab(geo.trim, f, -w - 0.07, w + 0.07, h, h + 0.07, 0, 0.05);
        this.slab(geo.door, f, -w, w, 0, h, 0, 0.035);
        // Raised panels; on an upside-down door the big ones are at the bottom.
        const rows = ft.upside ? [[0.15, 0.75], [0.95, 1.9]] : [[0.15, 1.1], [1.3, 1.9]];
        const [lo, hi] = ft.upside ? [rows[1], rows[0]] : [rows[0], rows[1]];
        for (const [y0, y1] of [lo, hi]) {
          for (const [u0, u1] of [[-0.33, -0.05], [0.05, 0.33]]) this.plane(geo.inset, f, u0, u1, y0, y1, 0.037, [0, 0, 1, 1]);
        }
        const ky = ft.upside ? 1.95 : 0.95;
        this.slab(geo.trim, f, 0.3, 0.36, ky - 0.03, ky + 0.03, 0.035, 0.09);
      } else if (ft.f === FEATURE.FRAMES) {
        const count = rng.int(1, 3);
        const span = 1.5 / count;
        for (let k = 0; k < count; k++) {
          const cu = -0.75 + span * (k + 0.5) + rng.range(-0.08, 0.08);
          const fw = rng.range(0.25, Math.min(0.32, span / 2 - 0.05)), fh = rng.range(0.22, 0.38);
          const cy = rng.range(1.3, 1.7);
          const bw = 0.045;
          this.slab(geo.trim, f, cu - fw, cu + fw, cy + fh - bw, cy + fh, 0, 0.03);
          this.slab(geo.trim, f, cu - fw, cu + fw, cy - fh, cy - fh + bw, 0, 0.03);
          this.slab(geo.trim, f, cu - fw, cu - fw + bw, cy - fh, cy + fh, 0, 0.03);
          this.slab(geo.trim, f, cu + fw - bw, cu + fw, cy - fh, cy + fh, 0, 0.03);
          const p = rng.int(0, 3);
          const v = ft.upside ? [p / 4, 1, (p + 1) / 4, 0] : [p / 4, 0, (p + 1) / 4, 1];
          this.plane(geo.pictures, f, cu - fw + bw, cu + fw - bw, cy - fh + bw, cy + fh - bw, 0.012, v);
        }
      } else if (ft.f === FEATURE.ORNAMENT) {
        // A hanging ornament on a cord, like the one in the photo.
        const u = rng.range(-0.5, 0.5);
        this.slab(geo.trim, f, u - 0.006, u + 0.006, 1.25, 2.0, 0.01, 0.022);
        this.slab(geo.trim, f, u - 0.05, u + 0.05, 1.45, 1.7, 0.01, 0.05);
        this.slab(geo.trim, f, u - 0.025, u + 0.025, 1.05, 1.25, 0.01, 0.035);
        this.slab(geo.trim, f, u - 0.012, u + 0.012, 2.0, 2.25, 0.01, 0.03);
      } else if (ft.f === FEATURE.WRITING) {
        writings.push(f);
      }
    }
    for (const [name, b] of Object.entries(geo)) this.addBuilt(b, this.mat(t[name], 1));
    writings.forEach((f, k) => {
      const tex = wallWritingTexture(renderer, WRITINGS[k % WRITINGS.length]);
      (this.extraTex ||= []).push(tex);
      const b = new GeoBuilder();
      this.plane(b, f, -0.92, 0.92, 1.1, 1.55, 0.006, [0, 0, 1, 1]);
      this.addBuilt(b, this.mat(tex, 1));
    });
  }

  buildUpsideDown() {
    const H = this.map.height;
    const wood = new GeoBuilder();
    for (const h of this.layout.hanging) {
      const box = (lx, lz, w, d, y0, y1) => {
        // Rotation to the nearest quarter turn keeps everything axis-aligned.
        const q = Math.round(h.rot / (Math.PI / 2)) % 2 === 0;
        const [ox, oz] = q ? [lx, lz] : [lz, lx];
        const [ww, dd] = q ? [w, d] : [d, w];
        wood.box(h.x + ox - ww / 2, h.z + oz - dd / 2, h.x + ox + ww / 2, h.z + oz + dd / 2, y0, y1);
        wood.flat(h.x + ox - ww / 2, h.z + oz - dd / 2, h.x + ox + ww / 2, h.z + oz + dd / 2, y0, false);
        wood.flat(h.x + ox - ww / 2, h.z + oz - dd / 2, h.x + ox + ww / 2, h.z + oz + dd / 2, y1, true);
      };
      if (h.kind === 'chair') {
        // Seat 0.45 below the ceiling, legs up into it, backrest hanging down.
        box(0, 0, 0.44, 0.44, H - 0.5, H - 0.45);
        for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) box(lx, lz, 0.04, 0.04, H - 0.45, H);
        box(0, 0.2, 0.44, 0.04, H - 1.0, H - 0.5);
      } else {
        box(0, 0, 0.9, 0.55, H - 0.78, H - 0.74);
        for (const [lx, lz] of [[-0.4, -0.23], [0.4, -0.23], [-0.4, 0.23], [0.4, 0.23]]) box(lx, lz, 0.05, 0.05, H - 0.74, H);
      }
    }
    this.textures.wood = solidTexture(null, '#3b3128', 0.06);
    this.addBuilt(wood, this.mat(this.textures.wood, 1));

    // Light fixtures set into the floor, facing up.
    const g = new THREE.PlaneGeometry(0.3, 1.1);
    g.rotateX(-Math.PI / 2);
    (this.ownGeos ||= []).push(g);
    this.floorPanelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const f of this.layout.floorLights) {
      const m = new THREE.Mesh(g, this.floorPanelMat);
      m.position.set(f.x, 0.012, f.z);
      if (f.rotate) m.rotation.y = Math.PI / 2;
      this.props.add(m);
    }
  }

  buildLogs() {
    const g = new THREE.PlaneGeometry(0.22, 0.3);
    g.rotateX(-Math.PI / 2);
    (this.ownGeos ||= []).push(g);
    this.paperMat = new THREE.MeshBasicMaterial({ color: 0xbdbdb8 });
    this.logs = this.layout.logs.map((l) => {
      const m = new THREE.Mesh(g, this.paperMat);
      m.position.set(l.x, 0.01, l.z);
      m.rotation.y = this.rng.range(0, Math.PI);
      this.props.add(m);
      return { ...l, text: LOGS[l.index], read: false };
    });
  }

  addBuilt(b, mat) {
    const g = b.build();
    if (!g) return;
    (this.ownGeos ||= []).push(g);
    this.props.add(new THREE.Mesh(g, mat));
  }

  // Denizens: hunched, half-there shapes (black here, so they glow white
  // in the negative). They drift through the hallways whispering.
  makeWhisperer() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
    const g = new THREE.Group();
    const geos = [
      new THREE.CylinderGeometry(0.12, 0.2, 1.25, 10),
      new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.CylinderGeometry(0.018, 0.025, 1.0, 5),
    ];
    const [torso, head, arm] = geos;
    const add = (geo, x, y, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
    };
    // Tall and thin, drifting just above the floor, head bowed forward.
    add(torso, 0, 1.2, 0, 0.12);
    add(head, 0, 1.92, 0.12);
    add(arm, -0.2, 1.15, 0.05, 0.05, 0.06);
    add(arm, 0.2, 1.15, 0.05, 0.05, -0.06);
    this.scene.add(g);
    const w = { group: g, mat, x: 0, z: 0, target: null, nextWhisper: this.rng.range(0, 2), geos };
    this.placeFar(w, 6);
    return w;
  }

  placeFar(w, minCells) {
    const { map } = this;
    const [px, py] = this.player ? map.cellAt(this.player.pos.x, this.player.pos.z) : [this.layout.spawn.x, this.layout.spawn.y];
    const dist = map.bfs(px, py);
    const cands = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= minCells) cands.push(i);
    const i = this.rng.pick(cands);
    [w.x, w.z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
    w.target = null;
  }

  // ---- Per-frame ---------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.player = player;
    this.time += dt;
    const { ctx, map } = this;
    const p = player.pos;

    this.updateFlip(dt, player);
    this.updateLights(player);

    // Denizens.
    let nearest = Infinity;
    for (const w of this.whisperers) {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      nearest = Math.min(nearest, d);
      this.wander(w, dt);
      w.group.position.x = w.x;
      w.group.position.z = w.z;
      w.group.rotation.y = Math.atan2(p.x - w.x, p.z - w.z);
      w.mat.opacity = 0.3 + 0.3 * Math.abs(Math.sin(this.time * 3.1 + w.x));
      w.group.position.y = 0.12 + Math.sin(this.time * 1.3 + w.z) * 0.05;
      // Whispers carry far, and fade as you close in.
      w.nextWhisper -= dt;
      if (w.nextWhisper <= 0) {
        w.nextWhisper = this.rng.range(0.8, 1.8);
        const vol = 0.3 * Math.min(1, Math.max(0, (d - 3) / 9)) * (d > 20 ? Math.max(0, (28 - d) / 8) : 1);
        if (vol > 0.01) ctx.audio.whisper(this.panTo(player, w.x, w.z), vol);
      }
      if (d < 0.8 && !player.falling) {
        // It passes through you, and you are somewhere else.
        player.sanity = Math.max(0, player.sanity - 22);
        this.glitchKick = 1.2;
        ctx.audio.staticBurst(0.6, 0.3);
        ctx.vibrate([40, 30, 80]);
        const dist = map.bfs(...map.cellAt(p.x, p.z));
        const cands = [];
        for (let i = 0; i < dist.length; i++) if (dist[i] > 6) cands.push(i);
        const i = this.rng.pick(cands);
        const [nx, nz] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
        p.set(nx, 0, nz);
        this.placeFar(w, 8);
      }
    }

    // She.
    if (this.time > this.sheAt && !this.she.active) this.she.spawn(this, player);
    if (this.she.active) {
      const seen = this.she.seenBy(this, player);
      const ev = this.she.update(dt, this, player, seen);
      if (seen) this.stare += dt;
      else this.stare = Math.max(0, this.stare - dt);
      if (this.stare > 6) {
        // Look long enough and she is simply somewhere else.
        this.stare = 0;
        this.glitchKick = 0.6;
        this.she.spawn(this, player);
      }
      const d = this.she.distanceTo(player);
      this.nextVoice -= dt;
      if (!seen && d < 14 && this.nextVoice <= 0) {
        this.nextVoice = this.rng.range(4, 8);
        ctx.audio.voice(this.panTo(player, this.she.pos.x, this.she.pos.z), 0.08);
      }
      if (ev === 'caught') {
        this.done = true;
        ctx.onCaught(this.she, "She won't let go.");
        return;
      }
    }

    // Sanity.
    let drain = 0.09;
    if (nearest < 3) drain += 0.6;
    if (this.she.active && this.she.seenBy(this, player)) drain += 0.7;
    player.sanity = Math.max(0, player.sanity - drain * dt);
    if (player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('You stopped looking for the way back. She was glad.');
      return;
    }

    for (const l of this.logs) {
      if (l.read || Math.hypot(l.x - p.x, l.z - p.z) > 1.1) continue;
      l.read = true;
      ctx.audio.click();
      ctx.hud.message(l.text, Math.min(9, 3 + l.text.length / 22));
    }

    // The thin place: walk into it to noclip out.
    const de = this.world.distanceToExit(p.x, p.z);
    this.exitDist = de;
    this.exitMat.uniforms.prox.value = Math.max(0, 1 - de / 6);
    if (de < 0.22) {
      this.done = true;
      ctx.onEscape(this.rng.chance(0.7) ? 'level1' : 'level0', 'noclip');
    }
  }

  wander(w, dt) {
    const { map } = this;
    if (!w.target || Math.hypot(w.target[0] - w.x, w.target[1] - w.z) < 0.1) {
      const [cx, cy] = map.cellAt(w.x, w.z);
      const opts = [];
      for (let d = 0; d < 4; d++) if (map.canMove(cx, cy, d)) opts.push(map.cellCenter(cx + DIRS[d][0], cy + DIRS[d][1]));
      w.target = opts.length ? this.rng.pick(opts) : [w.x, w.z];
    }
    const dx = w.target[0] - w.x, dz = w.target[1] - w.z, l = Math.hypot(dx, dz);
    if (l > 0.001) {
      const s = Math.min(l, 0.55 * dt);
      w.x += (dx / l) * s;
      w.z += (dz / l) * s;
    }
  }

  // Every so often the world turns over.
  updateFlip(dt, player) {
    if (!this.flipEvent) {
      this.nextFlip -= dt;
      if (this.nextFlip <= 0) {
        this.flipEvent = { t: 0, dur: this.rng.range(5, 8) };
        this.glitchKick = 0.5;
        this.ctx.audio.staticBurst(0.4, 0.15);
      }
    } else {
      const e = this.flipEvent;
      e.t += dt;
      if (e.t >= e.dur) {
        this.flipEvent = null;
        this.nextFlip = this.rng.range(40, 75);
        this.glitchKick = 0.5;
        this.ctx.audio.staticBurst(0.4, 0.15);
      }
    }
    this.flip = this.flipEvent ? 1 : 0;
    player.flipped = !!this.flipEvent;
    this.glitchKick = Math.max(0, this.glitchKick - dt * 1.5);
  }

  updateLights(player) {
    const { world, shared } = this;
    // A harsh light right on you, like a camera flash (it reads as the
    // black pit at your feet in the negative).
    shared.dynPos.value[0].set(player.pos.x, 1.5, player.pos.z, 4.6);
    shared.dynCol.value[0].setRGB(1, 1, 1);
    const near = [];
    for (const i of this.flickers) {
      const l = world.lights[i];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d < 14) near.push([i, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (let k = 1; k < MAX_DYN_LIGHTS; k++) {
      const pos = shared.dynPos.value[k];
      const n = near[k - 1];
      if (!n) {
        pos.set(0, -100, 0, 0);
        continue;
      }
      const l = world.lights[n[0]];
      const t = this.time * 6 + this.phase.get(n[0]);
      const on = Math.sin(t * 1.9) + Math.sin(t * 0.47) > -0.3;
      pos.set(l.x, this.map.height - 0.3, l.z, on ? 1 : 0.02);
      shared.dynCol.value[k].setRGB(1, 1, 1);
      world.setPanelLevel(n[0], on ? 1 : 0.05);
    }
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
    return player.flipped ? -pan : pan;
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 35);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------

  audioMix(player) {
    // Total silence, apart from Level 0's hum leaking through the thin place.
    const ex = this.world.exit;
    const d = this.exitDist ?? 99;
    let exitGain = 0;
    if (d < 30) {
      const walls = this.map.wallsBetween(player.pos.x, player.pos.z, ex.cx, ex.cz, 4);
      exitGain = (0.55 / (1 + (d / 5) ** 2)) * Math.pow(0.6, walls);
    }
    const she = this.she.active ? Math.max(0, 1 - this.she.distanceTo(player) / 14) : 0;
    return {
      hum: 0,
      exitGain,
      exitPan: this.panTo(player, ex.cx, ex.cz),
      exitType: 'hum',
      drone: she * 0.12,
      sanity: player.sanity,
      ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const prox = Math.max(0, 1 - (this.exitDist ?? 99) / 10);
    const insanity = 1 - player.sanity / 100;
    // Near the thin place the negative keeps failing.
    const breaking = prox > 0 && this.rng.next() < prox * prox * 0.12;
    return {
      fogColor: this.fogColor,
      fogDensity: 0.085,
      invert: breaking ? 0 : 1,
      mono: breaking ? 0.3 : 1,
      flip: this.flip,
      glitch: Math.min(1, prox * prox * 0.9 + this.glitchKick + insanity * 0.15),
      warp: 0.25 + insanity * 0.9 + this.glitchKick,
      aberr: 0.3 + prox * 2 + this.glitchKick * 2,
      grain: 0.09 + insanity * 0.05,
      shake: this.glitchKick * 0.4,
      roll: Math.sin(this.time * 0.13) * 0.035 + 0.025,
      soften: 0.55,
    };
  }

  hudInfo() {
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: false };
  }

  dispose() {
    this.disposed = true;
    this.shared.bend.value = 0;
    if (this.player) this.player.flipped = false;
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    for (const w of this.whisperers) {
      this.scene.remove(w.group);
      for (const g of w.geos) g.dispose();
      w.mat.dispose();
    }
    this.she.dispose();
    this.world.dispose();
    this.exitMat.dispose();
    for (const g of this.ownGeos || []) g.dispose();
    for (const m of this.ownMats || []) m.dispose();
    this.floorPanelMat.dispose();
    this.paperMat.dispose();
    for (const t of this.extraTex || []) t.dispose();
    disposeTextures(this.textures);
  }
}

// "She": tall, faceless, in a long dress. White here, so she is a void in
// the negative. She only moves while you aren't looking at her.
class She {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.flow = null;
    this.flowTimer = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const g = new THREE.Group();
    this.geos = [
      new THREE.CylinderGeometry(0.15, 0.4, 1.4, 16),
      new THREE.CylinderGeometry(0.12, 0.15, 0.55, 12),
      new THREE.SphereGeometry(0.12, 14, 12),
      new THREE.BoxGeometry(0.27, 0.95, 0.07),
      new THREE.CylinderGeometry(0.022, 0.028, 1.05, 6),
    ];
    const [dress, torso, head, hair, arm] = this.geos;
    const add = (geo, x, y, z, rz = 0) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      g.add(m);
    };
    add(dress, 0, 0.7, 0);
    add(torso, 0, 1.65, 0);
    add(head, 0, 2.02, 0.02);
    add(hair, 0, 1.66, -0.09);
    add(arm, -0.19, 1.3, 0.02, 0.03);
    add(arm, 0.19, 1.3, 0.02, -0.03);
    g.visible = false;
    this.mesh = g;
    scene.add(g);
  }

  setOpacity(a) {
    this.mat.opacity = a;
    this.mesh.visible = a > 0.01;
  }

  spawn(level, player) {
    const { map } = level;
    const [px, py] = map.cellAt(player.pos.x, player.pos.z);
    const dist = map.bfs(px, py);
    const cands = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < 9 || dist[i] > 16) continue;
      const [x, z] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
      if (!map.hasLineOfSight(player.pos.x, player.pos.z, x, z)) cands.push([x, z]);
    }
    if (!cands.length) return;
    const [x, z] = this.rng.pick(cands);
    this.pos.set(x, 0, z);
    this.active = true;
    this.setOpacity(1);
  }

  distanceTo(player) {
    return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
  }

  seenBy(level, player) {
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 26) return false;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const cos = (dx * fx + dz * fz) / Math.max(d, 0.01);
    return cos > 0.5 && level.map.hasLineOfSight(player.pos.x, player.pos.z, this.pos.x, this.pos.z);
  }

  update(dt, level, player, seen) {
    const { map } = level;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.mesh.position.copy(this.pos);
    if (seen) return null;
    // Unwatched, she comes.
    this.flowTimer -= dt;
    if (this.flowTimer <= 0 || !this.flow) {
      this.flow = map.bfs(...map.cellAt(player.pos.x, player.pos.z), this.flow);
      this.flowTimer = 0.3;
    }
    let tx = player.pos.x, tz = player.pos.z;
    const [cx, cy] = map.cellAt(this.pos.x, this.pos.z);
    const here = this.flow[map.idx(cx, cy)];
    if (here > 1) {
      for (let d = 0; d < 4; d++) {
        if (!map.canMove(cx, cy, d)) continue;
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (this.flow[map.idx(nx, ny)] === here - 1) {
          [tx, tz] = map.cellCenter(nx, ny);
          break;
        }
      }
    }
    const mx = tx - this.pos.x, mz = tz - this.pos.z, ml = Math.hypot(mx, mz);
    if (ml > 0.01) {
      const s = Math.min(ml, 2.9 * dt);
      this.pos.x += (mx / ml) * s;
      this.pos.z += (mz / ml) * s;
    }
    this.mesh.position.copy(this.pos);
    return Math.hypot(dx, dz) < 0.9 && !player.dead ? 'caught' : null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}

export const LEVEL1_5 = {
  id: 'level1_5',
  number: 1.5,
  name: 'Level 1.5',
  title: 'Inverted',
  difficulty: null,
  next: 'level1',
  create: (ctx) => new Level15(ctx),
};
