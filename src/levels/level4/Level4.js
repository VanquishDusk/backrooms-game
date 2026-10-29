import * as THREE from 'three';
import { GridWorld, GeoBuilder } from '../../world/GridWorld.js';
import { DIRS, EDGE_WALL } from '../../world/GridMap.js';
import { SURFACE, MAX_DYN_LIGHTS, createWorldMaterial } from '../../world/materials.js';
import {
  officeWallTexture, officeCarpetTexture, dropCeilingTexture, blackoutTexture, outsideViewTexture, vendingTexture,
  officeBoardsTexture, brushedSteelTexture, level4SignTexture, L4_SIGNS, officeDoorTexture, greyTileFloorTexture,
  utilityFloorTexture, solidTexture, crateTexture,
} from '../../world/textures.js';
import { disposeTextures, nearDoor } from '../../world/props.js';
import { ChunkedBuilders } from '../../world/tubes.js';
import { Dresser, blockFurnishedSteps } from '../../world/dresser.js';
import { createNoise2D } from '../../core/rng.js';
import { EntityManager } from '../../entities/lib/index.js';
import { generateLevel4, ZONE } from './generate.js';
import { office, openPlan, conference, breakRoom, storage, megOutpost, camp, emptyRoom, vending, cooler, fountain } from './dress.js';

// Level 4 — "Abandoned Office".
//
//  - An empty office floor without end: long carpeted corridors under drop
//    ceilings and humming troffers, rooms with almost nothing in them
//  - Windows on the outside walls, nearly all blacked out with sheeting.
//    The few that aren't are traps: don't stand and look out of them
//  - Almond Water everywhere: water coolers, vending machines, fountains
//  - Communities: a M.E.G. outpost and a wanderers' camp
//  - Very few entities: a Hound, sometimes a Duller, maybe a Smiler
//  - Exits in the service cores: stairwells and elevators to Level 5, an
//    elevator back to Level 3 now and then, a dark doorway to Level 6, and
//    rarely a basement stair to Level 71. Lose sight of an exit and it may
//    not be there when you come back

const T = 0.08;
const VIEW = 44;
const BOTTLE_SANITY = 35;
const MAX_BOTTLES = 8;
const DOOR_W = 1.0;
const NOTES = {
  meg: '"M.E.G. OUTPOST — LEVEL 4. Safe as it gets down here: fill up on Almond Water before you go deeper, the coolers and machines refill eventually. Stairs and lifts in the service cores go down to 5. DO NOT look out of any window that isn\'t blacked out. Keep an eye on the exits: if you look away, they move."',
  camp: '"We meet here when we can. Bring water, take water. If you\'re reading this and we\'re not here, wait a day. If we\'re still not here, don\'t wait."',
};
const JUNK = ['A stapler. Heavy.', 'A lanyard with a blank ID card.', 'A mug that says WORLD\'S OKAYEST BOSS.', 'A box of paperclips.', 'A ream of paper, every sheet blank.'];

export class Level4 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel4(rng.fork('layout'));
    this.layout = layout;
    const { map, zone, roomOf, rooms } = layout;
    this.map = map;
    const cs = map.cellSize, H = map.height;
    const drng = rng.fork('dress');
    this.drng = drng;

    this.props = new THREE.Group();
    scene.add(this.props);
    this.ownGeos = [];
    this.ownMats = [];
    this.cb = new ChunkedBuilders(cs * 8);
    const solid = [];
    const D = new Dresser({ cb: this.cb, rng: drng.fork('rooms'), map, solid, lights: layout.lights, group: this.props, ownGeos: this.ownGeos });
    this.dresser = D;

    // Core walls with exit slots are drawn by us (so an exit can come and go).
    this.slotKeys = new Set(layout.slots.map((s) => ekey(s.edge)));
    this.windowKeys = new Set(layout.windows.map((w) => ekey(w.edge)));

    // ---- Doorways: a 1 m opening in each door edge, the rest walled up ----
    this.doorways = layout.doors.map((d) => {
      const e = d.edge;
      const o = e.h ? { x: (e.x + 0.5) * cs, z: e.y * cs, rot: 0 } : { x: e.x * cs, z: (e.y + 0.5) * cs, rot: -Math.PI / 2 };
      const side = (cs - DOOR_W) / 2;
      D.solidRect(o, -cs / 2, -T, -DOOR_W / 2, T);
      D.solidRect(o, DOOR_W / 2, -T, cs / 2, T);
      return { ...d, o, side };
    });

    // ---- Furnish the rooms -------------------------------------------------
    this.sources = [];
    this.crateSpots = [];
    this.notes = [];
    this.banners = [];
    this.lanterns = [];
    const doorsOf = new Map();
    for (const d of layout.doors) {
      const a = [d.x, d.y], b = [d.x + DIRS[d.dir][0], d.y + DIRS[d.dir][1]];
      for (const [[cx, cy], dir] of [[a, d.dir], [b, d.dir ^ 1]]) {
        if (!map.inBounds(cx, cy)) continue;
        const r = roomOf[map.idx(cx, cy)];
        if (r < 0) continue;
        if (!doorsOf.has(r)) doorsOf.set(r, []);
        doorsOf.get(r).push({ x: cx, y: cy, d: dir });
      }
    }
    for (const r of rooms) {
      const xs = r.cells.map((c) => c[0]), ys = r.cells.map((c) => c[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      const rect = (x1 - x0 + 1) * (y1 - y0 + 1) === r.cells.length;
      const fr = D.frame({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, doors: doorsOf.get(r.id) || [] });
      if (!rect) continue;
      const fn = { office, open: openPlan, conference, break: breakRoom, storage, meg: megOutpost, camp, empty: emptyRoom }[r.kind];
      const out = fn(D, fr) || {};
      for (const v of out.vending || []) this.sources.push(v);
      for (const c of out.coolers || []) this.sources.push(c);
      this.crateSpots.push(...(out.crates || []));
      if (out.note) this.notes.push({ ...out.note, text: NOTES[r.kind], read: false });
      if (out.banner) this.banners.push(out.banner);
      if (out.lantern) this.lanterns.push(out.lantern);
    }
    this.planCorridors(D, drng.fork('corridors'));
    this.planOutsideWalls(D);

    // ---- Textures and the world -------------------------------------------------
    this.textures = {
      wall: officeWallTexture(renderer),
      floor: officeCarpetTexture(renderer, '#40474f'),
      ceiling: dropCeilingTexture(renderer),
      floors: {
        corr: { map: officeCarpetTexture(renderer, '#464b52'), scale: 1 / 2, surface: SURFACE.FLOOR },
        vinyl: { map: greyTileFloorTexture(renderer), scale: 1 / 1.2 },
        core: { map: utilityFloorTexture(renderer), scale: 1 / 2 },
      },
      walls: { hole: { map: null } },
      blackout: blackoutTexture(renderer),
      outside: outsideViewTexture(),
      vending: vendingTexture(),
      boards: officeBoardsTexture(renderer),
      steel: brushedSteelTexture(renderer),
      signs: level4SignTexture(renderer),
      door: officeDoorTexture(renderer, true),
      stairDoor: officeDoorTexture(renderer, true, '#5a6460'),
      basementDoor: officeDoorTexture(renderer, false, '#6a4030'),
      crate: crateTexture(renderer),
      solids: {},
    };
    this.textures.walls.hole.map = this.textures.wall;
    shared.ceilH.value = H;
    const noise = createNoise2D(drng.fork('stains'));
    const pits = [];
    for (const c of layout.cores) for (const [x, y] of c.cells) pits.push({ x0: x * cs + 0.06, z0: y * cs + 0.06, x1: (x + 1) * cs - 0.06, z1: (y + 1) * cs - 0.06 });
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      pits,
      extraBoxes: solid.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 })),
      textures: this.textures,
      shared,
      texScale: { wall: [1 / 2.5, 1 / H], floor: 1 / 2, ceiling: 1 / 1.2 },
      panelSize: [0.6, 0.6],
      pillars: layout.pillars,
      panelDrop: 0.01,
      floorStyle: (x, y) => {
        const i = map.idx(x, y);
        if (zone[i] === ZONE.CORE) return 'core';
        if (zone[i] === ZONE.CORR) return 'corr';
        return rooms[roomOf[i]].kind === 'break' ? 'vinyl' : 'floor';
      },
      wallStyle: (e) => (this.slotKeys.has(ekey(e)) ? 'hole' : 'wall'),
      dampAt: (x, z) => Math.max(0, Math.min(1, (noise(x * 0.1, z * 0.1) - 0.6) * 2.5)),
    });
    this.world.materials.hole.visible = false;
    scene.add(this.world.group);

    // ---- Materials ---------------------------------------------------------------------
    const lit = (tex, scale = 1) => {
      const m = createWorldMaterial(shared, tex, SURFACE.PLAIN, scale);
      this.ownMats.push(m);
      return m;
    };
    const solidTex = (hex, n = 0.06) => (this.textures.solids[hex] ||= solidTexture(renderer, hex, n));
    const basic = (opts) => {
      const m = new THREE.MeshBasicMaterial(opts);
      this.ownMats.push(m);
      return m;
    };
    this.mats = {
      laminate: lit(solidTex('#b8b4a6', 0.04)), cabinet: lit(solidTex('#8c8e8c', 0.05)), steel: lit(solidTex('#2c2e30', 0.06)),
      fabric: lit(solidTex('#3c4656', 0.12)), partition: lit(solidTex('#6c7280', 0.14)), chrome: lit(this.textures.steel),
      plastic: lit(solidTex('#c8c0a8', 0.04)), screen: lit(solidTex('#141618', 0.03)), enamel: lit(solidTex('#e6e6e0', 0.03)),
      jug: lit(solidTex('#6a9ac8', 0.05)), olive: lit(solidTex('#4a5236', 0.1)), canvas: lit(solidTex('#8a8468', 0.08)),
      paper: lit(solidTex('#e8e4d8', 0.03)), red: lit(solidTex('#a01a14', 0.08)), cardboard: lit(solidTex('#9a7a4c', 0.1)),
      vendcase: lit(solidTex('#1e3a5a', 0.06)), boards: lit(this.textures.boards), signs: lit(this.textures.signs),
      frame: lit(solidTex('#9a9c98', 0.05)), trim: lit(solidTex('#6a6c6a', 0.05)), plant: lit(solidTex('#5a5a2a', 0.2)),
      pot: lit(solidTex('#7a4a30', 0.08)), wall: this.world.materials.wall, blackout: lit(this.textures.blackout),
      crate: lit(this.textures.crate), concrete: lit(this.textures.floors.core.map, 1 / 1.5),
      vendfront: basic({ map: this.textures.vending, color: 0xd8dce0 }),
      outside: basic({ map: this.textures.outside }),
      daylight: basic({ map: daylightTexture() }),
      curtain: lit(solidTex('#c8906a', 0.1)),
      vent: lit(ventTexture()),
    };

    // ---- Build -----------------------------------------------------------------------------
    this.buildDoorways();
    this.buildWindows();
    this.buildCorridorItems();
    this.buildSigns();
    const before = this.props.children.length;
    this.ownGeos.push(...this.cb.finish(this.props, this.mats));
    this.chunkMeshes = this.props.children.slice(before).map((m) => ({ m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius }));
    this.buildExits();
    this.buildCrates();

    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx, z: sz, yaw: layout.spawnYaw };
    blockFurnishedSteps(map, this.world, (i) => zone[i] === ZONE.ROOM, [layout.spawn.x, layout.spawn.y]);

    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('entities'), shared });
    this.spawnEntities();

    this.flickers = layout.lights.map((l, i) => (l.state === 'flicker' ? i : -1)).filter((i) => i >= 0);
    this.phase = layout.lights.map(() => this.rng.next() * 100);
    this.time = 0;
    this.done = false;
    this.cullTimer = 0;
    this.nextAmbient = 3;
    this.buzzTimer = 0;
    this.stare = 0;
    this.lum = 1;
    this.fogColor = new THREE.Color(0.5, 0.5, 0.48);
    this.fogDensity = 0.022;
    this.leaving = null;
  }

  // ---- Planning -------------------------------------------------------------------

  // Corridor walls: fountains, coolers, vending machines, extinguishers, benches.
  planCorridors(D, rng) {
    const { map, zone } = this.layout;
    const cs = map.cellSize;
    const spots = [];
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (zone[map.idx(x, y)] !== ZONE.CORR) continue;
        for (let d = 0; d < 4; d++) {
          const e = map.edge(x, y, d);
          if (map.getEdge(e) !== EDGE_WALL || this.slotKeys.has(ekey(e)) || this.windowKeys.has(ekey(e))) continue;
          const [cx, cz] = map.cellCenter(x, y);
          const n = [-DIRS[d][0], -DIRS[d][1]];
          spots.push({ x, y, d, f: { x: cx + DIRS[d][0] * (cs / 2 - T), z: cz + DIRS[d][1] * (cs / 2 - T), rot: Math.atan2(n[0], n[1]) } });
        }
      }
    }
    rng.shuffle(spots);
    const used = new Set();
    const take = (n, fn) => {
      let k = 0;
      for (const s of spots) {
        if (k >= n) break;
        const key = `${s.x},${s.y}`;
        if (used.has(key)) continue;
        if (fn(s) === false) continue;
        used.add(key);
        k++;
      }
    };
    this.corridorItems = [];
    take(16, (s) => this.sources.push(fountain(D, D.sub(s.f, 0, 0))));
    take(7, (s) => {
      if (!D.free(s.f, -0.25, 0, 0.25, 0.4)) return false;
      this.sources.push(cooler(D, D.sub(s.f, 0, 0.2)));
      D.solidRect(s.f, -0.2, 0, 0.2, 0.4);
    });
    take(6, (s) => {
      if (!D.free(s.f, -0.46, 0, 0.46, 0.82)) return false;
      this.sources.push(vending(D, D.sub(s.f, 0, 0.41)));
      D.solidRect(s.f, -0.46, 0, 0.46, 0.82);
    });
    take(14, (s) => this.corridorItems.push({ type: 'extinguisher', f: s.f }));
    take(6, (s) => {
      if (!D.free(s.f, -0.7, 0, 0.7, 0.45)) return false;
      this.corridorItems.push({ type: 'bench', f: s.f });
      D.solidRect(s.f, -0.7, 0, 0.7, 0.42);
    });
    take(8, (s) => {
      if (!D.free(s.f, -0.25, 0, 0.25, 0.5)) return false;
      this.corridorItems.push({ type: 'plant', f: s.f });
      D.solidRect(s.f, -0.2, 0.05, 0.2, 0.45);
    });
    take(10, (s) => this.corridorItems.push({ type: 'board', f: s.f, tile: rng.int(0, 2) }));
  }

  // Outside walls: pilasters between the windows, a radiator under each.
  planOutsideWalls(D) {
    const { map, zone, windows } = this.layout;
    const cs = map.cellSize, N = map.cols;
    this.pilasters = [];
    const edgeCell = (x, y) => map.inBounds(x, y) && zone[map.idx(x, y)] !== ZONE.CORE;
    for (let k = 1; k < N; k++) {
      // Along each of the four outside walls, at every cell boundary.
      for (const [x, z, rot, a, b] of [
        [k * cs, T, 0, [k - 1, 0], [k, 0]], [k * cs, N * cs - T, Math.PI, [k - 1, N - 1], [k, N - 1]],
        [T, k * cs, Math.PI / 2, [0, k - 1], [0, k]], [N * cs - T, k * cs, -Math.PI / 2, [N - 1, k - 1], [N - 1, k]],
      ]) {
        if (!edgeCell(...a) || !edgeCell(...b) || k % 2) continue;
        const f = { x, z, rot };
        D.solidRect(f, -0.25, 0, 0.25, 0.24);
        this.pilasters.push(f);
      }
    }
    for (const w of windows) {
      const [cx, cz] = map.cellCenter(w.x, w.y);
      const n = [-DIRS[w.dir][0], -DIRS[w.dir][1]];
      const f = { x: cx + DIRS[w.dir][0] * (cs / 2 - T), z: cz + DIRS[w.dir][1] * (cs / 2 - T), rot: Math.atan2(n[0], n[1]) };
      w.f = f;
      if (D.free(f, -0.7, 0, 0.7, 0.14)) {
        D.solidRect(f, -0.7, 0, 0.7, 0.14);
        w.radiator = true;
      }
    }
  }

  // ---- Build ------------------------------------------------------------------------

  buildDoorways() {
    const H = this.map.height, cs = this.map.cellSize;
    const D = this.dresser;
    const g = new GeoBuilder();
    for (const d of this.doorways) {
      const o = d.o;
      // Wall fill either side of the opening, and a header over it.
      for (const [a, b] of [[-cs / 2 + T, -DOOR_W / 2], [DOOR_W / 2, cs / 2 - T]]) {
        const p0 = D.at(o, a, 0, -T), p1 = D.at(o, b, 0, T);
        g.box(Math.min(p0[0], p1[0]), Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), Math.max(p0[2], p1[2]), 0, H);
      }
      const h0 = D.at(o, -DOOR_W / 2, 0, -T), h1 = D.at(o, DOOR_W / 2, 0, T);
      g.box(Math.min(h0[0], h1[0]), Math.min(h0[2], h1[2]), Math.max(h0[0], h1[0]), Math.max(h0[2], h1[2]), 2.12, H);
      g.flat(Math.min(h0[0], h1[0]), Math.min(h0[2], h1[2]), Math.max(h0[0], h1[0]), Math.max(h0[2], h1[2]), 2.12, false);
      // Painted steel frame on both faces.
      for (const s of [-1, 1]) {
        D.box('trim', o, -DOOR_W / 2 - 0.03, 1.06, s * (T + 0.01), 0.06, 2.12, 0.02);
        D.box('trim', o, DOOR_W / 2 + 0.03, 1.06, s * (T + 0.01), 0.06, 2.12, 0.02);
        D.box('trim', o, 0, 2.15, s * (T + 0.01), DOOR_W + 0.12, 0.06, 0.02);
      }
      // Most doors stand open, swung back against the wall.
      if (this.drng.chance(0.7)) {
        // Swung open into the room, not out into the corridor.
        const [px, , pz] = D.at(o, 0, 0, 0.6);
        const [cx, cy] = this.map.cellAt(px, pz);
        const s = this.layout.zone[this.map.idx(cx, cy)] === ZONE.ROOM ? 1 : -1;
        const hinge = D.sub(o, -DOOR_W / 2, s * T, s * (-Math.PI / 2 - this.drng.range(0.05, 0.35)));
        D.box('door', hinge, 0.47, 1.04, 0.02 * s, 0.94, 2.06, 0.04);
        D.box('chrome', hinge, 0.84, 1.0, 0.05 * s, 0.03, 0.03, 0.06);
      }
    }
    const geo = g.build();
    if (geo) {
      this.ownGeos.push(geo);
      this.props.add(new THREE.Mesh(geo, this.world.materials.wall));
    }
    this.mats.door = createWorldMaterial(this.shared, this.textures.door, SURFACE.PLAIN, [1 / 0.94, 1 / 2.06]);
    this.ownMats.push(this.mats.door);
  }

  // Windows on the outside walls: blacked out, or not.
  buildWindows() {
    const { map } = this.layout;
    const cs = map.cellSize;
    const D = this.dresser;
    this.traps = [];
    for (const w of this.layout.windows) {
      const [cx, cz] = map.cellCenter(w.x, w.y);
      const n = [-DIRS[w.dir][0], -DIRS[w.dir][1]];
      const f = w.f;
      const W = 1.7, y0 = 0.85, y1 = 2.2;
      // Aluminium frame, sill, mullion.
      D.box('frame', f, 0, y0 - 0.03, 0.06, W + 0.12, 0.06, 0.14);
      D.box('frame', f, 0, y1 + 0.02, 0.02, W + 0.12, 0.05, 0.05);
      for (const s of [-1, 1]) D.box('frame', f, s * (W / 2 + 0.03), (y0 + y1) / 2, 0.02, 0.05, y1 - y0, 0.05);
      D.box('frame', f, 0, (y0 + y1) / 2, 0.02, 0.04, y1 - y0, 0.04);
      const pts = [[-W / 2, y0, 0.005], [W / 2, y0, 0.005], [W / 2, y1, 0.005], [-W / 2, y1, 0.005]];
      if (w.radiator) {
        // A panel radiator under the sill.
        D.box('enamel', f, 0, 0.42, 0.07, 1.36, 0.55, 0.08);
        for (let x = -0.62; x <= 0.63; x += 0.09) D.box('enamel', f, x, 0.42, 0.115, 0.03, 0.5, 0.012);
        D.cyl('enamel', f, [-0.72, 0.2, 0.07], [-0.72, 0, 0.07], 0.015, 5);
      }
      if (!w.black) {
        // Faded peach curtains pulled to the sides.
        for (const s of [-1, 1]) {
          D.box('curtain', f, s * (W / 2 + 0.2), (y0 + y1) / 2 + 0.05, 0.06, 0.32, y1 - y0 + 0.4, 0.05);
          for (let k = 0; k < 3; k++) D.cyl('curtain', f, [s * (W / 2 + 0.08 + k * 0.1), y0 - 0.15, 0.09], [s * (W / 2 + 0.08 + k * 0.1), y1 + 0.25, 0.09], 0.03, 5);
        }
        D.box('frame', f, 0, y1 + 0.3, 0.06, W + 0.9, 0.03, 0.03);
      }
      if (w.black) {
        D.quad('blackout', f, pts, [0, 0, 1]);
        continue;
      }
      if (!w.trap) {
        // Daylight, washed out to white: nothing to see.
        D.quad('daylight', f, pts, [0, 0, 1]);
        continue;
      }
      // A trap: a clear pane onto somewhere bright.
      const geo = new THREE.PlaneGeometry(W, y1 - y0);
      this.ownGeos.push(geo);
      const pane = new THREE.Mesh(geo, this.mats.outside);
      const [px, , pz] = D.at(f, 0, 0, 0.006);
      pane.position.set(px, (y0 + y1) / 2, pz);
      pane.rotation.y = f.rot;
      this.props.add(pane);
      // What's waiting just outside the glass.
      const fig = new THREE.Mesh(this.figureGeo(), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0 }));
      this.ownMats.push(fig.material);
      const [fx, , fz] = D.at(f, 0.2, 0, 0.009);
      fig.position.set(fx, y0, fz);
      fig.rotation.y = f.rot;
      this.props.add(fig);
      const [vx, , vz] = D.at(f, 0, 0, 0.6);
      this.traps.push({ pane, fig, x: f.x, z: f.z, vx, vz, n, stare: 0, sprung: false });
    }
  }

  figureGeo() {
    if (this._fig) return this._fig;
    // A head and shoulders pressed up against the glass.
    const s = new THREE.Shape();
    s.moveTo(-0.55, 0);
    s.quadraticCurveTo(-0.5, 0.55, -0.2, 0.65);
    s.quadraticCurveTo(-0.22, 0.95, 0, 1.0);
    s.quadraticCurveTo(0.22, 0.95, 0.2, 0.65);
    s.quadraticCurveTo(0.5, 0.55, 0.55, 0);
    s.lineTo(-0.55, 0);
    this._fig = new THREE.ShapeGeometry(s, 8);
    this.ownGeos.push(this._fig);
    return this._fig;
  }

  buildCorridorItems() {
    const D = this.dresser;
    const H = this.map.height;
    for (const f of this.pilasters) D.box('wall', f, 0, H / 2, 0.12, 0.5, H, 0.24, ['bottom', 'top']);
    // The ceiling: air diffusers and return grilles among the tiles.
    const { map, zone } = this.layout;
    const r = this.drng.fork('vents');
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (zone[map.idx(x, y)] === ZONE.CORE) continue;
        const t = r.next();
        if (t > 0.4) continue;
        const [cx, cz] = map.cellCenter(x, y);
        const along = r.chance(0.5);
        const [w, d] = t < 0.25 ? (along ? [1.2, 0.14] : [0.14, 1.2]) : [0.55, 0.55];
        const ox = r.chance(0.5) ? 0.6 : -0.6, oz = r.chance(0.5) ? 0.6 : -0.6;
        const x0 = cx + ox - w / 2, x1 = cx + ox + w / 2, z0 = cz + oz - d / 2, z1 = cz + oz + d / 2;
        const y0 = H - 0.004;
        const u = t < 0.25 ? 0.5 : 0;
        this.cb.at('vent', cx, cz).quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0],
          [u, 0], [u + 0.5, 0], [u + 0.5, along || t >= 0.25 ? 1 : 1], [u, 1]);
      }
    }
    for (const it of this.corridorItems) {
      const f = it.f;
      switch (it.type) {
        case 'extinguisher':
          D.box('frame', f, 0, 1.35, 0.1, 0.36, 0.7, 0.2);
          D.cyl('red', f, [0, 1.08, 0.1], [0, 1.52, 0.1], 0.075, 10, { caps: true });
          D.box('screen', f, 0, 1.35, 0.205, 0.3, 0.62, 0.01);
          break;
        case 'bench':
          D.box('laminate', f, 0, 0.44, 0.22, 1.4, 0.05, 0.4);
          for (const s of [-1, 1]) D.box('steel', f, s * 0.6, 0.21, 0.22, 0.05, 0.42, 0.36);
          break;
        case 'plant':
          D.cone('pot', f, [0, 0, 0.25], [0, 0.42, 0.25], 0.15, 0.2, 10, { caps: true });
          for (let k = 0; k < 7; k++) {
            const a = k * 0.9;
            D.cyl('plant', f, [0, 0.4, 0.25], [Math.cos(a) * 0.3, 0.8 + (k % 3) * 0.15, 0.25 + Math.sin(a) * 0.3], 0.012, 3);
          }
          break;
        case 'board': {
          const u0 = it.tile / 3, u1 = (it.tile + 1) / 3;
          D.quad('boards', f, [[-0.7, 1.15, 0.01], [0.7, 1.15, 0.01], [0.7, 1.85, 0.01], [-0.7, 1.85, 0.01]], [0, 0, 1], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
          break;
        }
      }
    }
  }

  buildSigns() {
    const D = this.dresser;
    const sign = (f, tile, x, y, z, w = 0.36, h = 0.14) => {
      const u0 = tile / L4_SIGNS, u1 = (tile + 1) / L4_SIGNS;
      D.quad('signs', f, [[x - w, y - h, z], [x + w, y - h, z], [x + w, y + h, z], [x - w, y + h, z]], [0, 0, 1], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    };
    for (const b of this.banners) sign(b, 4, 0, 1.9, 0.01, 0.9, 0.35);
    // Room numbers beside office doors (corridor side).
    const { map, zone } = this.layout;
    for (const d of this.doorways) {
      if (!this.drng.chance(0.5)) continue;
      const a = [d.x, d.y], b = [d.x + DIRS[d.dir][0], d.y + DIRS[d.dir][1]];
      const corrSide = map.inBounds(...b) && zone[map.idx(...b)] === ZONE.CORR ? 1 : zone[map.idx(...a)] === ZONE.CORR ? -1 : 0;
      if (!corrSide) continue;
      // Facing the corridor: local +z = towards b for side 1.
      const toB = [DIRS[d.dir][0], DIRS[d.dir][1]];
      const s = corrSide;
      const f = { x: d.o.x + toB[0] * s * (T + 0.01), z: d.o.z + toB[1] * s * (T + 0.01), rot: Math.atan2(toB[0] * s, toB[1] * s) };
      const c = Math.cos(f.rot), sn = Math.sin(f.rot);
      // Shift sideways past the frame.
      f.x += c * 0.75;
      f.z -= sn * 0.75;
      sign(f, 5 + this.drng.int(0, 2), 0, 1.55, 0, 0.12, 0.06);
    }
  }

  // ---- Exits -------------------------------------------------------------------------

  // Each exit is a movable group; each core door has a wall patch shown
  // whenever no exit stands there.
  buildExits() {
    const { map, slots } = this.layout;
    const cs = map.cellSize, H = map.height;
    this.slotFrames = slots.map((s) => {
      const n = DIRS[s.dir ^ 1];
      const e = s.edge;
      const x = e.h ? (e.x + 0.5) * cs : e.x * cs, z = e.h ? e.y * cs : (e.y + 0.5) * cs;
      // local +z points from the core out to the accessible side.
      const fx = n[0], fz = n[1];
      const dirToA = [s.ax - s.x, s.ay - s.y];
      const sx = dirToA[0] || fx, sz = dirToA[1] || fz;
      return { x, z, rot: Math.atan2(sx, sz), slot: s };
    });
    // Patches: plain wall on both faces.
    const patchGeo = new THREE.BoxGeometry(cs, H, 2 * T);
    patchGeo.translate(0, H / 2, 0);
    const uv = patchGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cs, uv.getY(i) * H);
    this.ownGeos.push(patchGeo);
    this.patches = this.slotFrames.map((f) => {
      const m = new THREE.Mesh(patchGeo, this.world.materials.wall);
      m.position.set(f.x, 0, f.z);
      m.rotation.y = f.rot;
      this.props.add(m);
      return m;
    });
    const want = [
      { type: 'stairs', target: 'level5', deep: true },
      { type: 'stairs', target: 'level5', deep: true },
      { type: 'elevator', target: 'level5' },
      { type: 'elevator', target: this.rng.chance(0.5) ? 'level3' : 'level5' },
      { type: 'dark', target: 'level6' },
    ];
    if (this.rng.chance(0.4)) want.push({ type: 'basement', target: 'level71', deep: true });
    this.exits = [];
    const usedCores = new Set();
    for (const w of want) {
      const cands = this.slotFrames.map((f, i) => i).filter((i) => {
        const s = slots[i];
        return !usedCores.has(s.core) && (!w.deep || s.deep) && this.layout.spawnDist[map.idx(s.ax, s.ay)] > 8;
      });
      if (!cands.length) continue;
      const i = this.rng.pick(cands);
      usedCores.add(slots[i].core);
      const ex = { ...w, slot: -1, seen: false, lostFor: 0, open: 0, group: this.buildExit(w) };
      this.props.add(ex.group);
      this.placeExit(ex, i);
      this.exits.push(ex);
    }
  }

  placeExit(ex, i) {
    if (ex.slot >= 0) this.patches[ex.slot].visible = true;
    ex.slot = i;
    const f = this.slotFrames[i];
    this.patches[i].visible = false;
    ex.group.position.set(f.x, 0, f.z);
    ex.group.rotation.y = f.rot;
    ex.group.updateMatrixWorld(true);
    const n = [Math.sin(f.rot), Math.cos(f.rot)];
    ex.x = f.x + n[0] * T;
    ex.z = f.z + n[1] * T;
    ex.nx = n[0];
    ex.nz = n[1];
    ex.seen = false;
    ex.lostFor = 0;
  }

  // Geometry for one exit, in its own frame: wall line at z = 0, the
  // corridor at +z, the core (and the pit) at -z.
  buildExit(w) {
    const H = this.map.height, cs = this.map.cellSize;
    const cb = new ChunkedBuilders(1000);
    const D = new Dresser({ cb, rng: this.drng, map: this.map, solid: [], lights: [], group: null, ownGeos: this.ownGeos });
    const o = { x: 0, z: 0, rot: 0 };
    const group = new THREE.Group();
    const parts = {};
    // The wall around the opening (the slot's wall is otherwise invisible).
    const ow = w.type === 'elevator' ? 1.3 : DOOR_W;
    for (const [a, b] of [[-cs / 2, -ow / 2], [ow / 2, cs / 2]]) D.box('wall', o, (a + b) / 2, H / 2, 0, b - a, H, 2 * T);
    D.box('wall', o, 0, (2.2 + H) / 2, 0, ow, H - 2.2, 2 * T);
    const sign = (tile, y, wd = 0.36, h = 0.14) => {
      const u0 = tile / L4_SIGNS, u1 = (tile + 1) / L4_SIGNS;
      D.quad('signs', o, [[-wd, y - h, T + 0.012], [wd, y - h, T + 0.012], [wd, y + h, T + 0.012], [-wd, y + h, T + 0.012]], [0, 0, 1], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    };
    if (w.type === 'elevator') {
      // Steel jambs and head; a call panel; the car behind.
      for (const s of [-1, 1]) D.box('chrome', o, s * (ow / 2 + 0.05), 1.1, T + 0.02, 0.1, 2.2, 0.06);
      D.box('chrome', o, 0, 2.25, T + 0.02, ow + 0.2, 0.1, 0.06);
      D.box('chrome', o, ow / 2 + 0.3, 1.15, T + 0.01, 0.12, 0.26, 0.02);
      sign(2, 2.5);
      // Car: steel walls, dark floor, lit ceiling, handrail.
      const d = cs - 0.3;
      D.box('trim', o, 0, 0.02, -d / 2 - T, 1.7, 0.04, d);
      D.box('chrome', o, 0, 0.012, 0, ow + 0.1, 0.024, 2 * T + 0.12);
      for (const s of [-1, 1]) D.box('chrome', o, s * 0.85, 1.15, -d / 2 - T, 0.03, 2.3, d);
      D.box('chrome', o, 0, 1.15, -d - T, 1.7, 2.3, 0.03);
      D.box('chrome', o, 0, 2.3, -d / 2 - T, 1.7, 0.03, d);
      D.box('chrome', o, 0, 0.95, -d - T + 0.06, 1.4, 0.04, 0.04);
      // Doors (sliding) and lights are runtime meshes.
      const leafGeo = new THREE.BoxGeometry(ow / 2, 2.2, 0.04);
      leafGeo.translate(0, 1.1, 0);
      this.ownGeos.push(leafGeo);
      parts.leaves = [-1, 1].map((s) => {
        const m = new THREE.Mesh(leafGeo, this.mats.chrome);
        m.position.set(s * ow / 4, 0, T - 0.03);
        group.add(m);
        return { m, s };
      });
      const lightGeo = new THREE.PlaneGeometry(1.2, d - 0.4);
      lightGeo.rotateX(Math.PI / 2);
      this.ownGeos.push(lightGeo);
      const lm = new THREE.Mesh(lightGeo, this.basicMat(0xf0f0e8));
      lm.position.set(0, 2.28, -d / 2 - T);
      group.add(lm);
      // Floor display over the door: where this car goes.
      parts.display = this.displayMesh(w.target === 'level3' ? '3' : '5');
      parts.display.position.set(0, 2.42, T + 0.05);
      group.add(parts.display);
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), this.basicMat(0xffb040));
      this.ownGeos.push(btn.geometry);
      btn.position.set(ow / 2 + 0.3, 1.15, T + 0.03);
      group.add(btn);
      parts.button = btn;
    } else {
      // A door in a steel frame; stairs or nothing behind it.
      for (const s of [-1, 1]) D.box('trim', o, s * (ow / 2 + 0.03), 1.06, T + 0.01, 0.06, 2.12, 0.04);
      D.box('trim', o, 0, 2.15, T + 0.01, ow + 0.12, 0.06, 0.04);
      if (w.type === 'stairs') sign(0, 2.42);
      else if (w.type === 'basement') sign(3, 2.42);
      else sign(1, 2.42, 0.22, 0.1);
      const tex = w.type === 'stairs' ? this.textures.stairDoor : w.type === 'basement' ? this.textures.basementDoor : this.textures.door;
      const mat = createWorldMaterial(this.shared, tex, SURFACE.PLAIN, 1);
      this.ownMats.push(mat);
      const leafGeo = new THREE.BoxGeometry(0.94, 2.06, 0.045);
      leafGeo.translate(0.47, 1.03, 0);
      this.ownGeos.push(leafGeo);
      const hinge = new THREE.Group();
      hinge.position.set(-ow / 2 + 0.03, 0, T);
      const leaf = new THREE.Mesh(leafGeo, mat);
      hinge.add(leaf);
      group.add(hinge);
      parts.hinge = hinge;
      if (w.type === 'dark') {
        // Darkness behind: a box that swallows the light.
        const box = new THREE.BoxGeometry(1.4, 2.4, 2.2);
        box.translate(0, 1.2, -1.15);
        this.ownGeos.push(box);
        group.add(new THREE.Mesh(box, this.basicMat(0x000000, THREE.BackSide)));
        // The EXIT sign is dead, apart from a stutter.
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), this.basicMat(0x103018));
        this.ownGeos.push(glow.geometry);
        glow.position.set(0, 2.42, T + 0.02);
        group.add(glow);
        parts.exitGlow = glow;
      } else {
        // Stairs down into the core: a landing, then steps into the dark.
        const mat2 = w.type === 'basement' ? 'concrete' : 'chrome';
        D.box('concrete', o, 0, -0.1, -0.45 - T, 1.6, 0.2, 0.9);
        const steps = 12, rise = 0.19, run = 0.27;
        for (let k = 0; k < steps; k++) {
          const z = -0.9 - T - run * (k + 0.5), y = -rise * (k + 1);
          D.box('concrete', o, 0, y - 0.1, z, 1.5, 0.2, run + 0.01);
          D.box(mat2, o, 0, y + 0.002, z + run / 2 - 0.02, 1.5, 0.01, 0.04);
        }
        for (const s of [-1, 1]) D.pipe('chrome', o, [[s * 0.7, 0.9, -0.9 - T], [s * 0.7, 0.9 - rise * steps, -0.9 - T - run * steps]], 0.02, 6);
        D.box('trim', o, 0, -1.4, -2.0 - T - run * steps, 1.6, 4, 0.1);
        // A light over the stair (a caged bulb that flickers in the basement).
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.basicMat(w.type === 'basement' ? 0xff7040 : 0xf0f0e0));
        this.ownGeos.push(bulb.geometry);
        bulb.position.set(0, H - 0.2, -1.4);
        group.add(bulb);
        parts.bulb = bulb;
      }
    }
    for (const g of cb.finish(group, { ...this.mats, wall: this.world.materials.wall })) this.ownGeos.push(g);
    group.userData.parts = parts;
    return group;
  }

  basicMat(color, side = THREE.FrontSide) {
    const m = new THREE.MeshBasicMaterial({ color, side });
    this.ownMats.push(m);
    return m;
  }

  displayMesh(text) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#100804';
    ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = '#ffa020';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`▼${text}`, 32, 26);
    const tex = new THREE.CanvasTexture(c);
    this.textures[`display${text}${Math.random()}`] = tex;
    const geo = new THREE.PlaneGeometry(0.3, 0.15);
    this.ownGeos.push(geo);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    this.ownMats.push(m.material);
    return m;
  }

  buildCrates() {
    this.crateGeo = new THREE.BoxGeometry(1, 1, 1);
    this.lidGeo = new THREE.BoxGeometry(1.04, 0.08, 1.04);
    this.innerMat = new THREE.MeshBasicMaterial({ color: 0x120c06 });
    this.ownGeos.push(this.crateGeo, this.lidGeo);
    this.ownMats.push(this.innerMat);
    this.crates = this.crateSpots.map((c) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.crateGeo, this.mats.crate);
      body.scale.set(c.size, c.size * 0.8, c.size);
      body.position.y = c.size * 0.4;
      const lid = new THREE.Mesh(this.lidGeo, this.mats.crate);
      lid.scale.set(c.size, 1, c.size);
      lid.position.y = c.size * 0.8 + 0.04;
      g.add(body, lid);
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.rot;
      this.props.add(g);
      return { ...c, group: g, lid, opened: false };
    });
  }

  // ---- Entities: very few ------------------------------------------------------------

  spawnEntities() {
    const m = this.entities;
    const fake = { pos: new THREE.Vector3(this.spawn.x, 0, this.spawn.z) };
    m.spawnFar('hound', fake, { min: 40, max: 90 });
    if (this.rng.chance(0.6)) m.spawnFar('duller', fake, { min: 30, max: 90 });
    // A Smiler, maybe, in one of the dark rooms.
    const darkRooms = this.layout.rooms.filter((r) => this.layout.darkRooms.has(r.id));
    if (darkRooms.length && this.rng.chance(0.5)) {
      const r = this.rng.pick(darkRooms);
      const [x, y] = r.cells[Math.floor(r.cells.length / 2)];
      const [cx, cz] = this.map.cellCenter(x, y);
      if (Math.hypot(cx - this.spawn.x, cz - this.spawn.z) > 25) m.spawn('smiler', { x: cx, z: cz });
    }
  }

  // ---- Per-frame -------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.25;
      this.cull(player);
    }
    this.updateLights(dt, player);
    this.updateSources(dt, player);
    this.updateTraps(dt, player);
    this.updateCrates(player);
    this.updateAmbient(dt, player);

    // A safe level: the mind barely frays here.
    const dark = this.lightLevel(player.pos.x, player.pos.z) < 0.07 && !player.flashlight;
    player.sanity = Math.max(0, player.sanity - (0.012 + (dark ? 0.12 : 0)) * dt);

    for (const n of this.notes) {
      if (n.read || Math.hypot(n.x - player.pos.x, n.z - player.pos.z) > 1.4) continue;
      n.read = true;
      ctx.audio.click();
      ctx.hud.message(n.text, 11);
    }

    const res = this.entities.update(dt, player, ctx);
    for (const e of this.entities.list) e.root.visible = e.distTo(player) < (this.view || VIEW);
    if (player.health <= 0 || player.sanity <= 0 || res.dead) {
      this.done = true;
      ctx.onDeath(this.lastHurt && player.health <= 0 ? this.lastHurt : res.cause || 'Even here, something found you.');
      return;
    }
    this.updateExits(dt, player);
  }

  updateExits(dt, player) {
    const { ctx, map } = this;
    for (const ex of this.exits) {
      const p = ex.group.userData.parts;
      const fx = ex.x + ex.nx * 0.6, fz = ex.z + ex.nz * 0.6;
      const d = Math.hypot(fx - player.pos.x, fz - player.pos.z);
      const los = d < 40 && map.hasLineOfSight(player.pos.x, player.pos.z, fx, fz);
      const dx = fx - player.pos.x, dz = fz - player.pos.z;
      const facing = (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / Math.max(0.01, d) > 0.4;
      if (los && facing && d < 25) {
        ex.seen = true;
        ex.lostFor = 0;
      } else if (ex.seen && !los) {
        // Out of sight. It might not be here when you look again.
        ex.lostFor += dt;
        if (ex.lostFor > 1.5) {
          ex.seen = false;
          if (this.rng.chance(0.5)) this.relocate(ex, player);
        }
      }
      // Doors open as you come close.
      const want = d < 2.6 ? 1 : 0;
      ex.open += (want - ex.open) * Math.min(1, dt * (ex.type === 'elevator' ? 2.5 : 4));
      if (p.leaves) for (const l of p.leaves) l.m.position.x = l.s * (0.325 + ex.open * 0.6);
      if (p.hinge) p.hinge.rotation.y = -ex.open * 1.35;
      if (p.button) p.button.material.color.setRGB(1, 0.55 + 0.2 * Math.sin(this.time * 4), 0.15);
      if (p.exitGlow) p.exitGlow.material.color.setRGB(0.02, Math.random() < 0.03 ? 0.6 : 0.1, 0.04);
      if (p.bulb && ex.type === 'basement') p.bulb.visible = Math.sin(this.time * 13) + Math.sin(this.time * 3.1) > -0.6;
      if (ex.open > 0.15 && !ex.dinged && ex.type === 'elevator') {
        ex.dinged = true;
        ctx.audio.bell(this.panTo(player, ex.x, ex.z), 0.25);
      }
      if (want === 0) ex.dinged = false;
      if (ex.open > 0.7 && nearDoor(ex, player.pos.x, player.pos.z)) {
        this.done = true;
        if (ex.type === 'elevator') ctx.audio.liftMotor(0.3);
        ctx.onEscape(ex.target, ex.type === 'elevator' ? 'door' : 'walk');
        return;
      }
    }
  }

  // Move an exit to another core door the player can't see.
  relocate(ex, player) {
    const { map, slots } = this.layout;
    const taken = new Set(this.exits.map((e) => slots[e.slot].core));
    const cands = [];
    slots.forEach((s, i) => {
      if (taken.has(s.core) || (ex.deep && !s.deep)) return;
      const f = this.slotFrames[i];
      const n = [Math.sin(f.rot), Math.cos(f.rot)];
      const px = f.x + n[0] * 0.6, pz = f.z + n[1] * 0.6;
      if (Math.hypot(px - player.pos.x, pz - player.pos.z) < 15 || map.hasLineOfSight(player.pos.x, player.pos.z, px, pz)) return;
      cands.push(i);
    });
    // Its old door has to be out of sight too, or you'd see it vanish.
    if (!cands.length) return;
    this.placeExit(ex, this.rng.pick(cands));
    ex.open = 0;
  }

  cull(player) {
    const q = this.ctx.quality?.();
    this.view = q === 'low' ? VIEW - 14 : q === 'medium' ? VIEW - 7 : VIEW;
    for (const k of this.chunkMeshes) k.m.visible = Math.hypot(k.c.x - player.pos.x, k.c.z - player.pos.z) - k.r < this.view;
  }

  lightLevel(x, z) {
    const [r, g, b] = this.world.sampleLight(x, z);
    return ((r + g + b) / 3) * this.shared.globalLight.value;
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  updateLights(dt, player) {
    const { world, shared } = this;
    shared.globalLight.value = 1;
    world.panelMat.color.setScalar(1);
    const near = [];
    for (const i of this.flickers) {
      const l = world.lights[i];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d < 16) near.push([i, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    const H = this.map.height;
    let nearest = Infinity;
    for (let k = 0; k < MAX_DYN_LIGHTS; k++) {
      const pos = shared.dynPos.value[k], col = shared.dynCol.value[k];
      if (k >= near.length) {
        pos.set(0, -100, 0, 0);
        continue;
      }
      const [i, d] = near[k];
      const l = world.lights[i];
      const t = this.time * 8 + this.phase[i];
      const on = Math.sin(t * 1.3) + Math.sin(t * 0.41 + this.phase[i]) * 1.1 > -0.3 && fract(Math.sin(Math.floor(t) * 77.1 + this.phase[i]) * 43758.5) > 0.25;
      const level = on ? 1 : 0.05;
      pos.set(l.x, H - 0.4, l.z, l.power * 1.1 * level);
      col.setRGB(l.color[0], l.color[1], l.color[2]);
      world.setPanelLevel(i, level);
      nearest = Math.min(nearest, d);
    }
    this.buzzTimer -= dt;
    if (nearest < 6 && this.buzzTimer <= 0) {
      this.ctx.audio.flickerBuzz(1.1, 0.06 * (1 - nearest / 6));
      this.buzzTimer = 1.1;
    }
  }

  // Almond Water: coolers, vending machines and fountains.
  updateSources(dt, player) {
    const { ctx } = this;
    for (const s of this.sources) {
      if (s.cool > 0) s.cool -= dt;
      if (Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 0.75 || s.cool > 0) continue;
      s.cool = s.type === 'fountain' ? 12 : 2;
      if (s.type === 'fountain') {
        if (player.sanity > 95) continue;
        player.sanity = Math.min(100, player.sanity + 15);
        ctx.audio.drink();
        ctx.hud.message('The fountain runs with Almond Water.', 2.2);
        continue;
      }
      if (s.uses <= 0) {
        if (!s.toldEmpty) ctx.hud.message(s.type === 'cooler' ? 'The cooler is empty.' : 'Sold out.', 1.6);
        s.toldEmpty = true;
        continue;
      }
      if (player.bottles >= MAX_BOTTLES) continue;
      s.uses--;
      player.bottles++;
      if (s.type === 'vending') ctx.audio.clank(0, 0.2);
      else ctx.audio.slosh(ctx.audio.ctx?.currentTime ?? 0, 0.2);
      ctx.audio.pickup();
      ctx.hud.message(s.type === 'vending' ? 'The machine drops a bottle of Almond Water.' : 'You fill a bottle from the cooler.', 2.2);
    }
  }

  // Windows that aren't blacked out: look out of one for too long and
  // something on the other side looks back.
  updateTraps(dt, player) {
    const { ctx } = this;
    let warn = false;
    for (const t of this.traps) {
      if (t.sprung) {
        t.fade = Math.max(0, (t.fade ?? 1) - dt * 0.4);
        t.fig.material.opacity = 0.95 * t.fade;
        continue;
      }
      const dx = t.x - player.pos.x, dz = t.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      const facing = d > 0.01 && (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / d > 0.75;
      const looking = d < 4.5 && facing && this.map.hasLineOfSight(player.pos.x, player.pos.z, t.vx, t.vz);
      t.stare = looking ? t.stare + dt : Math.max(0, t.stare - dt * 0.8);
      t.fig.material.opacity = Math.max(0, Math.min(0.75, (t.stare - 1.2) * 0.6));
      if (t.stare > 0.7) warn = true;
      if (t.stare > 2.6) {
        t.sprung = true;
        t.fig.material.opacity = 0.95;
        player.damage(22);
        player.sanity = Math.max(0, player.sanity - 25);
        this.lastHurt = 'You looked out of the window. Something looked in.';
        ctx.audio.jumpscare();
        ctx.hurtFlash(0.9);
        ctx.vibrate([200, 60, 200]);
        // The pane goes dark afterwards, as if it had always been blacked out.
        t.pane.material = this.mats.blackout;
      }
    }
    this.lookAway = warn;
  }

  updateCrates(player) {
    for (const c of this.crates) {
      if (c.opened || Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 1.3) continue;
      c.opened = true;
      c.lid.position.set(c.size * 0.3, c.size * 0.8 + 0.1, c.size * 0.45);
      c.lid.rotation.set(0.5, 0.3, 0.2);
      const inside = new THREE.Mesh(this.lidGeo, this.innerMat);
      inside.scale.set(c.size * 0.9, 1, c.size * 0.9);
      inside.position.y = c.size * 0.8 - 0.03;
      c.group.add(inside);
      const r = this.rng.next();
      const { ctx } = this;
      if (r < 0.4) {
        player.bottles = Math.min(MAX_BOTTLES, player.bottles + 2);
        ctx.hud.message('A crate: two bottles of Almond Water.', 2.5);
      } else if (r < 0.65) {
        player.battery = 100;
        ctx.hud.message('A crate: batteries. Flashlight recharged.', 2.5);
      } else if (r < 0.85) {
        player.health = Math.min(100, player.health + 45);
        ctx.hud.message('A crate: a first aid kit.', 2.5);
      } else {
        ctx.hud.message(`A crate: ${this.rng.pick(JUNK)}`, 3);
        continue;
      }
      ctx.audio.pickup();
    }
  }

  updateAmbient(dt, player) {
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = this.rng.range(3, 8);
    const pan = this.rng.range(-1, 1);
    const r = this.rng.next();
    const a = this.ctx.audio;
    if (r < 0.2) a.phone(pan, this.rng.range(0.03, 0.08));
    else if (r < 0.35) a.thud(pan, 0.12);
    else if (r < 0.5) a.creak(pan, 0.08);
    else if (r < 0.6) a.bell(pan, 0.05);
    else if (r < 0.7) a.phantomSteps(pan * 0.6);
    else if (r < 0.75 && player.sanity < 60) a.whisper(pan, 0.12);
  }

  drink(player) {
    if (player.bottles <= 0) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.bottles--;
    player.sanity = Math.min(100, player.sanity + BOTTLE_SANITY);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    let exitGain = 0, exitPan = 0, exitType = 'hum';
    for (const ex of this.exits) {
      if (ex.type !== 'elevator' && ex.type !== 'dark') continue;
      const d = Math.hypot(ex.x - player.pos.x, ex.z - player.pos.z);
      if (d > 20) continue;
      const g = (0.2 / (1 + (d / 4) ** 2)) * Math.pow(0.5, this.map.wallsBetween(player.pos.x, player.pos.z, ex.x + ex.nx * 0.5, ex.z + ex.nz * 0.5, 3));
      if (g > exitGain) {
        exitGain = g;
        exitPan = this.panTo(player, ex.x, ex.z);
        exitType = ex.type === 'dark' ? 'static' : 'hum';
      }
    }
    let drone = 0;
    for (const e of this.entities.list) {
      if (!['chase', 'hunt', 'attack', 'stalk'].includes(e.state)) continue;
      drone = Math.max(drone, 0.25 * Math.max(0, 1 - e.distTo(player) / 25));
    }
    // The air handling never stops.
    return { hum: 0.05, exitGain, exitPan, exitType, drone, machine: 0.035, machinePan: 0, sanity: player.sanity, ears: player.coveringEars };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const target = new THREE.Color(0.03 + r * 0.36, 0.03 + g * 0.37, 0.035 + b * 0.4);
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const lum = (r + g + b) / 3;
    this.lum += (lum - this.lum) * Math.min(1, dt * 3);
    this.fogDensity += (0.024 + (1 - Math.min(1, this.lum * 2)) * 0.025 - this.fogDensity) * Math.min(1, dt * 2);
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.2 + hurt * 0.3,
      aberr: 0.25 + insanity * 1.4 + hurt * 1.2,
      grain: 0.06 + insanity * 0.06,
    };
  }

  hudInfo() {
    const w = this.lookAway ? 'LOOK AWAY FROM THE WINDOW' : null;
    return { warn: w, warnCovered: w, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    this.world.dispose();
    this.entities.dispose();
    for (const g of this.ownGeos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    disposeTextures(this.textures);
  }
}

// Overexposed daylight: white, a little cooler at the top.
function daylightTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#e4ecf4');
  g.addColorStop(1, '#fbfbf6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Ceiling vents: left half a square return grille, right half a linear slot diffuser.
function ventTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8c8c2';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#2a2c2e';
  ctx.fillRect(4, 4, 56, 56);
  ctx.fillStyle = '#9a9c98';
  for (let i = 8; i < 60; i += 6) ctx.fillRect(4, i, 56, 2);
  ctx.fillStyle = '#1e2022';
  ctx.fillRect(66, 4, 58, 56);
  ctx.fillStyle = '#8a8c88';
  for (let i = 70; i < 124; i += 7) ctx.fillRect(i, 4, 2, 56);
  return new THREE.CanvasTexture(c);
}

function ekey(e) {
  return `${e.h ? 'h' : 'v'}${e.x},${e.y}`;
}

function fract(x) {
  return x - Math.floor(x);
}

export const LEVEL4 = {
  id: 'level4',
  number: 4,
  name: 'Level 4',
  title: 'Abandoned Office',
  difficulty: 1,
  next: 'level5',
  create: (ctx) => new Level4(ctx),
};
