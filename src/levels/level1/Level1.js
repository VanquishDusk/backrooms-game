import * as THREE from 'three';
import { GridWorld, GeoBuilder } from '../../world/GridWorld.js';
import { EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js';
import { SURFACE, MAX_DYN_LIGHTS, createWorldMaterial, createGlitchMaterial } from '../../world/materials.js';
import {
  concreteFloorTexture, concreteWallTexture, concreteCeilingTexture, grassTexture, flagstoneTexture,
  woodPanelTexture, woodTexture, crateTexture, hazardTexture, solidTexture, gaugeTexture, leavesTexture,
  whiteTileWallTexture, invertedGlimpseTexture,
} from '../../world/textures.js';
import { PropKit, disposeTextures, mergeGeometries, nearDoor } from '../../world/props.js';
import { Hound } from '../../entities/Hound.js';
import { generateLevel1, ZONE, SECTOR } from './generate.js';

// Level 1 — "The Habitable Zone".
//
//  - Halls (open, pillared, where things happen), corridors (safer, with
//    rooms and red emergency lighting) and storage (shelves and crates)
//  - Sectors: Aquila (garage, arrival + explorers' cache), Gild (warehouse),
//    Gothic (vaulted columns, a medical station), Ouroboros (construction
//    that never ends; workers who ignore you), Garden (overgrown, harmful
//    to linger in) and Fabled (old wood panelling, neon)
//  - Blackouts: the lights die and something hunts the halls; corridors are safe
//  - Impossible geometry: halls that stretch, corridor walls that move
//  - Crates: random supplies, junk or worse; some vanish when unwatched
//  - Exit: an extended hallway where pipes and dials gradually appear

const BOTTLE_SANITY = 35;
const MAX_BOTTLES = 6;
const JUNK = [
  'A rubber duck. Damp.', 'A VHS tape labelled "DON\'T".', 'An empty can of beans.', 'A single shoe.',
  'A stack of blank paper, all slightly warm.', 'A broken compass. It spins.', 'A photo of this exact crate.',
  'A key to nothing.', 'A deflated balloon.', 'A tin of buttons.',
];
const NOTES = [
  "To whoever comes through next: crates are real, mostly. When the lights die, get into the corridors. It won't follow you in there. To get out, follow the pipes. P.S. Base Alpha says the clean white wall near here leads to Level 1.3, the hospital. They don't talk about what's in there now. — the cache team",
  "Don't trust distances in the big halls. Pick a pillar and count.",
  "The workers in the grey section don't answer. Don't ask them what they're building.",
  "The garden smells sweet. Do NOT sit down in it. We lost two that way.",
  "Third time through this corridor. The door was on the left last time.",
];

export class Level1 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel1(rng.fork('layout'));
    this.layout = layout;
    const { map, zone, sector } = layout;
    this.map = map;
    const H = map.height;

    this.textures = {
      wall: concreteWallTexture(renderer),
      floor: concreteFloorTexture(renderer),
      ceiling: concreteCeilingTexture(renderer),
      floors: {
        grass: { map: grassTexture(renderer), scale: 1 / 2 },
        stone: { map: flagstoneTexture(renderer), scale: 1 / 4 },
        boards: { map: woodTexture(renderer), scale: [1 / 1.2, 1 / 3] },
        gildfloor: { map: concreteFloorTexture(renderer, '#8f8a78'), scale: 1 / 4, surface: SURFACE.FLOOR },
      },
      walls: {
        stone: { map: concreteWallTexture(renderer, { base: '#a69c88' }), scale: [1 / 3, 1 / H] },
        panel: { map: woodPanelTexture(renderer), scale: [1 / 3.5, 1 / H] },
        moss: { map: concreteWallTexture(renderer, { moss: true }), scale: [1 / 3, 1 / H] },
        gild: { map: concreteWallTexture(renderer, { band: '#2b7a74', stripe: '#e3b21e' }), scale: [1 / 3, 1 / H] },
        exitwall: { map: concreteWallTexture(renderer, { base: '#9b968a' }), scale: [1 / 3, 1 / H] },
      },
    };
    shared.ceilH.value = H;

    const exitEdges = new Set();
    {
      const { cells, horiz } = layout.exit;
      for (const [x, y] of cells) for (const d of horiz ? [2, 3] : [0, 1]) exitEdges.add(key(map.edge(x, y, d)));
      const [lx, ly] = cells[cells.length - 1];
      exitEdges.add(key(map.edge(lx, ly, layout.exit.forward)));
    }
    this.exitEdges = exitEdges;
    const sectorOfEdge = (e) => {
      const a = e.h ? [e.x, e.y - 1] : [e.x - 1, e.y];
      const b = [e.x, e.y];
      const sa = map.inBounds(a[0], a[1]) ? sector[map.idx(a[0], a[1])] : null;
      const sb = map.inBounds(b[0], b[1]) ? sector[map.idx(b[0], b[1])] : null;
      return sa === SECTOR.AQUILA || sa == null ? sb ?? sa : sa;
    };
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      pillars: layout.pillars,
      extraBoxes: layout.extraBoxes,
      textures: this.textures,
      shared,
      texScale: { wall: [1 / 3, 1 / H], floor: 1 / 4, ceiling: 1 / 3 },
      panelSize: [0.22, 2.2],
      panelDrop: 0.5,
      floorStyle: (x, y) => {
        const i = map.idx(x, y);
        if (zone[i] === ZONE.EXIT || zone[i] === ZONE.CORRIDOR) return 'floor';
        return ['floor', 'gildfloor', 'stone', 'floor', 'grass', 'boards'][sector[i]];
      },
      wallStyle: (e) => {
        if (exitEdges.has(key(e))) return 'exitwall';
        return ['wall', 'gild', 'stone', 'wall', 'moss', 'panel'][sectorOfEdge(e)] || 'wall';
      },
      dampAt: (x, z) => {
        const [cx, cy] = map.cellAt(x, z);
        const i = map.idx(cx, cy);
        if (zone[i] === ZONE.CORRIDOR || zone[i] === ZONE.ROOM) return 0.35;
        return [1, 0.25, 0.2, 0.6, 0, 0][sector[i]];
      },
    });
    scene.add(this.world.group);

    // The white wall: walk through it to reach Level 1.3.
    if (layout.whiteWall) {
      this.textures.white = whiteTileWallTexture(renderer);
      this.whiteMat = createGlitchMaterial(shared, this.textures.white, 1 / 1.2);
      this.world.setExit(layout.whiteWall.edge, this.whiteMat);
    }

    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx, z: sz, yaw: layout.spawnYaw };

    this.kit = new PropKit((x, z) => this.world.sampleLight(x, z));
    this.props = new THREE.Group();
    scene.add(this.props);
    this.propMats = {
      red: this.litMaterial(solidTexture(renderer, '#9c2a20')),
      grey: this.litMaterial(solidTexture(renderer, '#8a8c88')),
      rackBlue: this.litMaterial(solidTexture(renderer, '#2d4f8a')),
      rackOrange: this.litMaterial(solidTexture(renderer, '#c4621e')),
      white: this.litMaterial(solidTexture(renderer, '#e6e4dc', 0.02)),
      crate: this.litMaterial(crateTexture(renderer)),
      hazard: this.litMaterial(hazardTexture(renderer)),
      board: this.litMaterial(solidTexture(renderer, '#7a6a52')),
      beam: this.litMaterial(this.textures.ceiling, 1 / 3),
    };
    this.buildPipes();
    this.buildBeams();
    this.buildShelves();
    this.buildParkingLines();
    this.buildRooms();
    this.buildSectors();
    this.buildExitHall();
    this.buildCrates();
    this.buildNotes();

    // The fake window to Level 1.5.
    if (layout.fakeWindow) {
      this.textures.glimpse = invertedGlimpseTexture();
      const w = layout.fakeWindow;
      this.fakeWindow = this.kit.window(map, w.edge, w.side, this.textures.glimpse);
      this.props.add(this.fakeWindow.group);
    }

    this.hound = new Hound(scene, this.world, this.rng.fork('hound'), (i) => {
      const z = zone[i];
      return z === ZONE.HALL || z === ZONE.STORAGE;
    });

    this.flickers = layout.lights.map((l, i) => (l.state === 'flicker' && !l.layer ? i : -1)).filter((i) => i >= 0);
    this.phase = new Map(this.flickers.map((i) => [i, this.rng.next() * 100]));

    this.time = 0;
    this.done = false;
    this.globalLight = 1;
    this.emergency = 0.15;
    this.blackout = null;
    this.nextBlackout = this.rng.range(55, 95);
    this.stretch = null;
    this.nextStretch = this.rng.range(45, 80);
    this.nextShift = this.rng.range(15, 25);
    this.nextDrop = this.rng.range(50, 80);
    this.nextAmbient = 3;
    this.crateCheck = 0;
    this.gardenExposure = 0;
    this.lum = 1;
    this.fogColor = new THREE.Color(0.4, 0.42, 0.42);
    this.fogDensity = 0.024;
    this.said = new Set();
    this.lastHurt = 'hound';
    this.buzzTimer = 0;
  }

  litMaterial(tex, scale = 1) {
    const m = createWorldMaterial(this.shared, tex, SURFACE.PLAIN, scale);
    (this.ownMats ||= []).push(m);
    return m;
  }

  once(k) {
    if (this.said.has(k)) return false;
    this.said.add(k);
    return true;
  }

  zoneAt(x, z) {
    const [cx, cy] = this.map.cellAt(x, z);
    const i = this.map.idx(cx, cy);
    return [this.layout.zone[i], this.layout.sector[i], cx, cy];
  }

  // ---- Build -------------------------------------------------------------

  // Cylinders along x or z, merged into one mesh per material.
  buildPipes() {
    const H = this.map.height;
    const red = [], grey = [];
    for (const p of this.layout.pipes) {
      const len = p.a1 - p.a0;
      const g = new THREE.CylinderGeometry(p.r, p.r, len, 8, 1, true);
      const y = H - 0.25 - p.r - (p.red ? 0.15 : 0);
      if (p.axis === 'x') {
        g.rotateZ(Math.PI / 2);
        g.translate((p.a0 + p.a1) / 2, y, p.c + (p.red ? 0.35 : -0.35));
      } else {
        g.rotateX(Math.PI / 2);
        g.translate(p.c + (p.red ? 0.35 : -0.35), y, (p.a0 + p.a1) / 2);
      }
      (p.red ? red : grey).push(g);
    }
    this.addMerged(red, this.propMats.red);
    this.addMerged(grey, this.propMats.grey);
  }

  addMerged(list, mat) {
    if (!list.length) return null;
    const g = mergeGeometries(list);
    for (const piece of list) piece.dispose();
    (this.ownGeos ||= []).push(g);
    const m = new THREE.Mesh(g, mat);
    this.props.add(m);
    return m;
  }

  addBuilt(builder, mat) {
    const g = builder.build();
    if (!g) return;
    (this.ownGeos ||= []).push(g);
    this.props.add(new THREE.Mesh(g, mat));
  }

  // Concrete beams across the halls.
  buildBeams() {
    const { map, zone } = this.layout;
    const H = map.height, cs = map.cellSize;
    const b = new GeoBuilder();
    const hall = (x, y) => map.inBounds(x, y) && (zone[map.idx(x, y)] === ZONE.HALL || zone[map.idx(x, y)] === ZONE.STORAGE);
    for (let y = 2; y < map.rows; y += 2) {
      let x = 0;
      while (x < map.cols) {
        if (!(hall(x, y) && hall(x, y - 1))) { x++; continue; }
        const s = x;
        while (x < map.cols && hall(x, y) && hall(x, y - 1)) x++;
        const z = y * cs;
        b.box(s * cs, z - 0.22, x * cs, z + 0.22, H - 0.45, H, [true, true]);
        b.flat(s * cs, z - 0.22, x * cs, z + 0.22, H - 0.45, false);
      }
    }
    this.addBuilt(b, this.propMats.beam);
  }

  buildShelves() {
    const uprights = new GeoBuilder(), beams = new GeoBuilder(), boxes = new GeoBuilder();
    for (const s of this.layout.shelves) {
      const z0 = s.z - s.depth / 2, z1 = s.z + s.depth / 2;
      for (let x = s.x0; x <= s.x1 + 0.01; x += (s.x1 - s.x0) / 3) {
        for (const z of [z0, z1 - 0.08]) uprights.box(x - 0.04, z, x + 0.04, z + 0.08, 0, s.height);
      }
      for (const y of [0.15, 1.0, 1.85, 2.6]) {
        beams.box(s.x0, z0, s.x1, z1, y, y + 0.06);
        beams.flat(s.x0, z0, s.x1, z1, y + 0.06, true);
        beams.flat(s.x0, z0, s.x1, z1, y, false);
        if (y > 2.5) continue;
        // Stock on the shelf.
        let x = s.x0 + 0.1;
        while (x < s.x1 - 0.6) {
          const w = 0.4 + this.rng.next() * 0.5, h = 0.3 + this.rng.next() * 0.45;
          if (this.rng.chance(0.75)) {
            const d = 0.5 + this.rng.next() * 0.35;
            boxes.box(x, s.z - d / 2, x + w, s.z + d / 2, y + 0.06, y + 0.06 + h);
            boxes.flat(x, s.z - d / 2, x + w, s.z + d / 2, y + 0.06 + h, true);
          }
          x += w + 0.08;
        }
      }
    }
    this.addBuilt(uprights, this.propMats.rackBlue);
    this.addBuilt(beams, this.propMats.rackOrange);
    this.addBuilt(boxes, this.propMats.crate);
  }

  // Painted bays in the Aquila garage.
  buildParkingLines() {
    const { map, zone, sector } = this.layout;
    const cs = map.cellSize;
    const lines = new GeoBuilder();
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const i = map.idx(x, y);
        if (sector[i] !== SECTOR.AQUILA || zone[i] !== ZONE.HALL || y % 3 === 1) continue;
        const z0 = y * cs + (y % 3 === 0 ? 0.3 : cs - 0.3 - 2.4);
        for (const fx of [0.08, 0.58]) {
          const lx = x * cs + cs * fx;
          lines.flat(lx, z0, lx + 0.12, z0 + 2.4, 0.006, true);
        }
      }
    }
    this.addBuilt(lines, this.propMats.white);

    // Painted letters on the garage pillars.
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext('2d');
    const letters = 'ABCDEFGH';
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = '#e8e6dc';
      ctx.fillRect(k * 64, 0, 64, 64);
      ctx.fillStyle = '#1c1c1a';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letters[k], k * 64 + 32, 35);
    }
    const tex = new THREE.CanvasTexture(c);
    this.textures.letters = tex;
    const geo = new GeoBuilder();
    for (const p of this.layout.pillars) {
      if (p.sector !== SECTOR.AQUILA || p.round) continue;
      const k = Math.floor(p.z / (cs * 2)) % 8;
      const u0 = k / 8, u1 = (k + 1) / 8, h = p.size / 2 + 0.004;
      const y0 = 1.6, y1 = 1.95;
      // A painted square on two faces.
      geo.quad([p.x - 0.18, y0, p.z + h], [p.x + 0.18, y0, p.z + h], [p.x + 0.18, y1, p.z + h], [p.x - 0.18, y1, p.z + h], [0, 0, 1], [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      geo.quad([p.x + 0.18, y0, p.z - h], [p.x - 0.18, y0, p.z - h], [p.x - 0.18, y1, p.z - h], [p.x + 0.18, y1, p.z - h], [0, 0, -1], [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
    }
    this.addBuilt(geo, this.litMaterial(tex));
  }

  // Offices, an infirmary or two, and empty rooms in the corridor blocks.
  buildRooms() {
    const { map } = this.layout;
    const kit = this.kit;
    this.heals = [];
    for (const r of this.layout.rooms) {
      const x = (r.x + 1) * map.cellSize, z = (r.y + 1) * map.cellSize;
      if (r.kind === 'office') {
        const g = new THREE.Group();
        const desk = kit.mat(0x6b5236, x, z);
        g.add(kit.mesh(kit.box(1.4, 0.06, 0.7), desk, 0, 0.75, 0));
        for (const [lx, lz] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) g.add(kit.mesh(kit.box(0.05, 0.75, 0.05), desk, lx, 0.375, lz));
        g.add(kit.mesh(kit.box(0.45, 0.06, 0.45), kit.mat(0x333333, x, z), 0.1, 0.45, 0.65));
        g.add(kit.mesh(kit.box(0.5, 1.3, 0.6), kit.mat(0x8a8f8c, x, z), -1.8, 0.65, -1.2));
        g.add(kit.mesh(kit.box(0.4, 0.3, 0.05), kit.mat(0x1a1a1a, x, z), 0, 0.93, -0.2));
        g.position.set(x, 0, z);
        g.rotation.y = this.rng.int(0, 3) * Math.PI / 2;
        this.props.add(g);
      } else if (r.kind === 'infirmary') {
        const g = new THREE.Group();
        for (const off of [-1.1, 1.1]) {
          g.add(kit.mesh(kit.box(0.9, 0.08, 1.9), kit.mat(0xd8d8d0, x, z, { minLight: 0.4 }), off, 0.6, 0));
          g.add(kit.mesh(kit.box(0.85, 0.12, 1.8), kit.mat(0x9fb8c4, x, z, { minLight: 0.4 }), off, 0.7, 0));
          g.add(kit.mesh(kit.box(0.9, 0.55, 0.06), kit.mat(0x9a9a92, x, z), off, 0.3, 0.92));
        }
        g.add(this.medCabinet(x, z, 0, -1.4));
        g.position.set(x, 0, z);
        this.props.add(g);
        this.heals.push({ x, z: z - 1.4, amount: 30, used: false, label: 'An infirmary cabinet. Bandages. Painkillers.' });
      }
    }
  }

  medCabinet(x, z, ox, oz) {
    const kit = this.kit;
    const g = new THREE.Group();
    g.add(kit.mesh(kit.box(0.8, 1.6, 0.4), kit.mat(0xf0f0ea, x, z, { minLight: 0.5 }), 0, 0.8, 0));
    const red = kit.mat(0xc82018, x, z, { minLight: 0.6 });
    g.add(kit.mesh(kit.box(0.36, 0.1, 0.02), red, 0, 1.2, 0.21));
    g.add(kit.mesh(kit.box(0.1, 0.36, 0.02), red, 0, 1.2, 0.21));
    g.position.set(ox, 0, oz);
    return g;
  }

  buildSectors() {
    const { map, zone, sector, pillars } = this.layout;
    const cs = map.cellSize, H = map.height;
    const kit = this.kit;
    const rng = this.rng.fork('sectors');

    // Garden: vines down every pillar and hanging from the ceiling.
    this.leafTex = leavesTexture();
    const vineGeo = new THREE.PlaneGeometry(0.9, H);
    (this.ownGeos ||= []).push(vineGeo);
    const vineMats = new Map();
    const vineMat = (x, z) => {
      const [r, g, b] = this.world.sampleLight(x, z);
      const k = Math.round(Math.max(0.35, (r + g + b) / 3 * 1.3) * 10) / 10;
      if (!vineMats.has(k)) {
        vineMats.set(k, new THREE.MeshBasicMaterial({ map: this.leafTex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(k, k, k * 0.9) }));
      }
      return vineMats.get(k);
    };
    this.vineMats = vineMats;
    for (const p of pillars) {
      if (p.sector !== SECTOR.GARDEN) continue;
      const h = p.size / 2 + 0.02;
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!rng.chance(0.8)) continue;
        const m = new THREE.Mesh(vineGeo, vineMat(p.x + nx, p.z + nz));
        m.position.set(p.x + nx * h, H / 2, p.z + nz * h);
        m.rotation.y = Math.atan2(nx, nz);
        this.props.add(m);
      }
    }
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const i = map.idx(x, y);
        if (sector[i] !== SECTOR.GARDEN || zone[i] !== ZONE.HALL || !rng.chance(0.55)) continue;
        const [cx, cz] = map.cellCenter(x, y);
        const m = new THREE.Mesh(vineGeo, vineMat(cx, cz));
        const len = rng.range(0.4, 0.9);
        m.scale.set(1, len, 1);
        m.position.set(cx + rng.range(-1.2, 1.2), H - (H * len) / 2, cz + rng.range(-1.2, 1.2));
        m.rotation.y = rng.range(0, Math.PI);
        this.props.add(m);
      }
    }

    // Ouroboros: scaffolding and barriers, forever unfinished.
    const scaffold = new GeoBuilder(), barrier = new GeoBuilder();
    this.workers = [];
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const i = map.idx(x, y);
        if (sector[i] !== SECTOR.OUROBOROS || zone[i] !== ZONE.HALL) continue;
        const [cx, cz] = map.cellCenter(x, y);
        const r = rng.next();
        if (r < 0.12) {
          // Scaffold tower.
          const s = 0.9;
          for (const [ox, oz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) scaffold.box(cx + ox - 0.03, cz + oz - 0.03, cx + ox + 0.03, cz + oz + 0.03, 0, H - 0.3);
          for (const yy of [1.1, 2.2]) {
            scaffold.box(cx - s, cz - s - 0.03, cx + s, cz - s + 0.03, yy, yy + 0.05);
            scaffold.box(cx - s, cz + s - 0.03, cx + s, cz + s + 0.03, yy, yy + 0.05);
            scaffold.flat(cx - s, cz - s, cx + s, cz + s, yy + 0.05, true);
            scaffold.flat(cx - s, cz - s, cx + s, cz + s, yy, false);
          }
        } else if (r < 0.24) {
          const rot = rng.chance(0.5);
          const w = 1.6, d = 0.35;
          if (rot) barrier.box(cx - d / 2, cz - w / 2, cx + d / 2, cz + w / 2, 0, 0.8, [true, true, true, true]);
          else barrier.box(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0, 0.8, [true, true, true, true]);
          barrier.flat(cx - (rot ? d : w) / 2, cz - (rot ? w : d) / 2, cx + (rot ? d : w) / 2, cz + (rot ? w : d) / 2, 0.8, true);
        } else if (r < 0.34) {
          this.props.add(kit.bucket(cx + rng.range(-1, 1), cz + rng.range(-1, 1)));
        }
      }
    }
    this.addBuilt(scaffold, this.propMats.grey);
    this.addBuilt(barrier, this.propMats.hazard);
    for (const w of this.layout.workers) this.workers.push(this.makeWorker(w));

    // Gothic: a medical station.
    this.medStation = null;
    if (this.layout.gothicCell) {
      const [gx, gy] = this.layout.gothicCell;
      const [cx, cz] = map.cellCenter(gx, gy);
      this.props.add(this.medCabinet(cx, cz, cx, cz));
      this.heals.push({ x: cx, z: cz, amount: 60, used: false, label: 'A medical station, freshly stocked. Someone still tends it.' });
    }

    // Aquila: the explorers' cache where you arrive.
    const [sx, sz] = map.cellCenter(this.layout.spawn.x, this.layout.spawn.y);
    const g = new THREE.Group();
    const tableMat = kit.mat(0x7a6a50, sx, sz);
    g.add(kit.mesh(kit.box(1.2, 0.05, 0.7), tableMat, 0, 0.74, 0));
    for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) g.add(kit.mesh(kit.box(0.05, 0.74, 0.05), tableMat, lx, 0.37, lz));
    g.add(kit.mesh(kit.cyl(0.08, 0.1, 0.25, 10), kit.mat(0xd0a030, sx, sz, { minLight: 0.6 }), -0.35, 0.89, 0));
    g.position.set(sx + 1.5, 0, sz - 1.3);
    this.props.add(g);

    // Emergency lamps on corridor ceilings.
    const lamps = new GeoBuilder();
    for (const l of this.layout.lights) {
      if (!l.emergency) continue;
      lamps.box(l.x - 0.12, l.z - 0.06, l.x + 0.12, l.z + 0.06, H - 0.12, H);
      lamps.flat(l.x - 0.12, l.z - 0.06, l.x + 0.12, l.z + 0.06, H - 0.12, false);
    }
    const lg = lamps.build();
    if (lg) {
      this.lampMat = new THREE.MeshBasicMaterial({ color: 0x601010 });
      (this.ownGeos ||= []).push(lg);
      this.props.add(new THREE.Mesh(lg, this.lampMat));
    }
  }

  makeWorker(w) {
    const kit = this.kit;
    const g = new THREE.Group();
    const skin = kit.mat(0xb8b2a6, w.x, w.z);
    const vest = kit.mat(0xe06a14, w.x, w.z, { minLight: 0.5 });
    const pants = kit.mat(0x3a3e44, w.x, w.z);
    g.add(kit.mesh(kit.box(0.42, 0.62, 0.26), vest, 0, 1.28, 0));
    const head = kit.mesh(kit.cyl(0.11, 0.12, 0.26, 10), skin, 0, 1.75, 0);
    g.add(head);
    g.add(kit.mesh(kit.cyl(0.15, 0.15, 0.08, 12), kit.mat(0xe8c020, w.x, w.z, { minLight: 0.5 }), 0, 1.92, 0));
    for (const s of [-0.1, 0.1]) g.add(kit.mesh(kit.box(0.14, 0.95, 0.16), pants, s, 0.48, 0));
    g.add(kit.mesh(kit.box(0.1, 0.6, 0.1), skin, -0.28, 1.2, 0));
    const arm = new THREE.Group();
    arm.position.set(0.28, 1.5, 0);
    arm.add(kit.mesh(kit.box(0.1, 0.6, 0.1), skin, 0, -0.3, 0));
    arm.add(kit.mesh(kit.box(0.05, 0.05, 0.35), kit.mat(0x553322, w.x, w.z), 0, -0.6, 0.15));
    g.add(arm);
    // Working on a block of something on the floor.
    g.add(kit.mesh(kit.box(0.6, 0.4, 0.5), kit.mat(0x9a968a, w.x, w.z), 0, 0.2, 0.55));
    g.position.set(w.x, 0, w.z);
    g.rotation.y = w.rot;
    this.props.add(g);
    return { group: g, arm, x: w.x, z: w.z, phase: this.rng.next() * 10, lastHit: 0 };
  }

  // The hallway out: pipes and dials gradually appear along it.
  buildExitHall() {
    const { map, exit } = this.layout;
    const cs = map.cellSize, H = map.height;
    const L = exit.cells.length;
    const pipes = [], redPipes = [];
    const along = (i) => {
      const [x, y] = exit.cells[i];
      return map.cellCenter(x, y);
    };
    const [ax, az] = along(0), [bx, bz] = along(L - 1);
    const dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
    const side = [dz, dx]; // perpendicular (x, z)
    // Pipe j starts further in for higher j, so density grows with depth.
    const count = 9;
    for (let j = 0; j < count; j++) {
      const startI = Math.floor((j / count) * (L - 2));
      const [sx, sz] = along(startI);
      const len = (L - startI) * cs;
      const r = 0.05 + (j % 3) * 0.04;
      const wallSide = j % 2 ? 1 : -1;
      const off = cs / 2 - 0.25 - (j % 4) * 0.08;
      const y = j % 3 === 2 ? H - 0.3 - j * 0.03 : 0.6 + j * 0.28;
      const g = new THREE.CylinderGeometry(r, r, len, 8, 1, true);
      if (dx) g.rotateZ(Math.PI / 2);
      else g.rotateX(Math.PI / 2);
      const midA = len / 2 - cs / 2;
      g.translate(sx + dx * midA + side[0] * off * wallSide, y, sz + dz * midA + side[1] * off * wallSide);
      (j % 3 === 0 ? redPipes : pipes).push(g);
    }
    this.addMerged(pipes, this.propMats.grey);
    this.addMerged(redPipes, this.propMats.red);

    // Dials: more of them, and twitchier, the deeper you go.
    this.gaugeTex = gaugeTexture();
    const faceGeo = new THREE.CircleGeometry(0.16, 20);
    const needleGeo = new THREE.BoxGeometry(0.012, 0.13, 0.006);
    needleGeo.translate(0, 0.055, 0);
    (this.ownGeos ||= []).push(faceGeo, needleGeo);
    this.dials = [];
    for (let i = 1; i < L; i++) {
      const k = i / (L - 1);
      const n = Math.floor(k * k * 4 + (this.rng.chance(k) ? 1 : 0));
      const [cx, cz] = along(i);
      for (let d = 0; d < n; d++) {
        const wallSide = this.rng.chance(0.5) ? 1 : -1;
        const off = cs / 2 - 0.09;
        const a = this.rng.range(-cs / 2 + 0.3, cs / 2 - 0.3);
        const px = cx + side[0] * off * wallSide + dx * a, pz = cz + side[1] * off * wallSide + dz * a;
        const [lr, lg, lb] = this.world.sampleLight(px, pz);
        const lit = Math.max(0.3, (lr + lg + lb) / 3 * 1.4);
        const faceMat = new THREE.MeshBasicMaterial({ map: this.gaugeTex, color: new THREE.Color(lit, lit, lit * 0.95) });
        const needleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6 * lit, 0.05, 0.03) });
        (this.dialMats ||= []).push(faceMat, needleMat);
        const face = new THREE.Mesh(faceGeo, faceMat);
        const needle = new THREE.Mesh(needleGeo, needleMat);
        needle.position.z = 0.005;
        const holder = new THREE.Group();
        holder.add(face, needle);
        holder.position.set(px, this.rng.range(1.2, 2.3), pz);
        holder.rotation.y = Math.atan2(-side[0] * wallSide, -side[1] * wallSide);
        this.props.add(holder);
        this.dials.push({ needle, base: this.rng.range(-1, 1), k, phase: this.rng.next() * 10 });
      }
    }
    this.exitInfo = { ax, az, dx, dz, L, cs };
  }

  buildCrates() {
    this.crateGeo = new THREE.BoxGeometry(1, 1, 1);
    this.lidGeo = new THREE.BoxGeometry(1.04, 0.08, 1.04);
    this.innerMat = new THREE.MeshBasicMaterial({ color: 0x120c06 });
    this.crates = this.layout.crates.map((c) => this.spawnCrate(c));
  }

  spawnCrate(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.crateGeo, this.propMats.crate);
    body.scale.set(c.size, c.size * 0.8, c.size);
    body.position.y = c.size * 0.4;
    const lid = new THREE.Mesh(this.lidGeo, this.propMats.crate);
    lid.scale.set(c.size, 1, c.size);
    lid.position.y = c.size * 0.8 + 0.04;
    g.add(body, lid);
    g.position.set(c.x, 0, c.z);
    g.rotation.y = c.rot;
    this.props.add(g);
    return { ...c, group: g, lid, opened: false, gone: false };
  }

  buildNotes() {
    const geo = new THREE.PlaneGeometry(0.22, 0.3);
    geo.rotateX(-Math.PI / 2);
    (this.ownGeos ||= []).push(geo);
    this.notes = this.layout.notes.map((n, k) => {
      const m = new THREE.Mesh(geo, this.kit.mat(0xeeeadc, n.x, n.z, { minLight: 0.5 }));
      m.position.set(n.x, n.first ? 0.775 : 0.01, n.z);
      m.rotation.y = this.rng.range(0, Math.PI);
      this.props.add(m);
      return { ...n, text: NOTES[k % NOTES.length], read: false };
    });
  }

  // ---- Per-frame ---------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    const hud = ctx.hud;
    const [zone, sector] = this.zoneAt(player.pos.x, player.pos.z);
    this.here = { zone, sector };
    const safe = zone === ZONE.CORRIDOR || zone === ZONE.ROOM || zone === ZONE.EXIT;


    this.updateBlackout(dt, player, safe);
    this.updateLights(dt, player);
    this.updateStretch(dt, player, zone);

    // Garden: sweet air, and it gets into you.
    if (sector === SECTOR.GARDEN) {
      this.gardenExposure = Math.min(1.5, this.gardenExposure + dt / 14);
    } else {
      this.gardenExposure = Math.max(0, this.gardenExposure - dt / 10);
    }
    if (this.gardenExposure > 0.6) {
      const k = this.gardenExposure - 0.6;
      player.damage(k * 3.5 * dt);
      player.hurtAgo = 0;
      player.sanity = Math.max(0, player.sanity - k * 2 * dt);
      this.lastHurt = 'garden';
    }

    // Sanity.
    let drain = 0.035;
    if (this.blackout && this.blackout.phase === 'dark' && !safe) drain += 0.3;
    player.sanity = Math.max(0, player.sanity - drain * dt);

    this.updateCrates(dt, player);
    this.updateProps(dt, player);
    this.updateAmbient(dt, player);

    // Heals: infirmary cabinets and the Gothic medical station.
    for (const h of this.heals) {
      if (h.used || Math.hypot(h.x - player.pos.x, h.z - player.pos.z) > 1.4) continue;
      h.used = true;
      player.health = Math.min(100, player.health + h.amount);
      ctx.audio.pickup();
      hud.message(h.label, 3.5);
    }
    for (const n of this.notes) {
      if (n.read || Math.hypot(n.x - player.pos.x, n.z - player.pos.z) > 1.3) continue;
      n.read = true;
      ctx.audio.click();
      hud.message(`"${n.text}"`, Math.min(9, 3 + n.text.length / 25));
    }

    // The hound.
    for (const ev of this.hound.update(dt, player)) {
      const pan = this.panTo(player, this.hound.pos.x, this.hound.pos.z);
      const d = this.hound.pos.distanceTo(player.pos);
      if (ev === 'growl') ctx.audio.growl(pan, Math.max(0.1, 0.55 - d / 50));
      if (ev === 'step' && d < 28) ctx.audio.pad(pan, 0.25 * (1 - d / 28));
      if (ev === 'bite') {
        player.damage(34);
        this.lastHurt = 'hound';
        ctx.audio.snarl();
        ctx.hurtFlash(0.8);
        ctx.vibrate([120, 40, 160]);
        hud.message('It bit you. Get into a corridor!', 2.5);
      }
    }

    if (player.health <= 0) {
      this.done = true;
      ctx.onDeath(this.lastHurt === 'garden' ? 'You lay down in the soft grass. You did not get up.' : 'Something in the dark dragged you down.');
      return;
    }
    if (player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('The halls went on forever, and so did you.');
      return;
    }

    // The fake window to Level 1.5. Something whispers on the other side.
    if (this.fakeWindow) {
      const fw = this.fakeWindow;
      if (Math.hypot(player.pos.x - fw.x, player.pos.z - fw.z) < 5 && this.once('window')) ctx.audio.whisper(this.panTo(player, fw.x, fw.z), 0.2);
      if (nearDoor(fw, player.pos.x, player.pos.z)) {
        this.done = true;
        ctx.onEscape('level1_5', 'noclip');
        return;
      }
    }

    // The white wall to Level 1.3.
    if (this.world.exit) {
      const dw = this.world.distanceToExit(player.pos.x, player.pos.z);
      this.whiteMat.uniforms.prox.value = Math.max(0, 1 - dw / 6) * 0.4;
      if (dw < 0.22) {
        this.done = true;
        ctx.onEscape('level1_3', 'noclip');
        return;
      }
    }

    // The hallway out.
    const e = this.exitInfo;
    const t = (player.pos.x - e.ax) * e.dx + (player.pos.z - e.az) * e.dz; // metres along it
    this.exitProgress = zone === ZONE.EXIT ? Math.max(0, t / (e.cs * (e.L - 1))) : 0;
    if (zone === ZONE.EXIT) {
      if (this.exitProgress > 0.97) {
        this.done = true;
        ctx.onEscape('level2', 'walk');
      }
    }

    // Walls in the corridor blocks move when you aren't looking.
    this.nextShift -= dt;
    if (this.nextShift <= 0) {
      this.nextShift = this.rng.range(14, 24);
      this.shiftCorridors(player);
    }
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  updateBlackout(dt, player, safe) {
    const { ctx } = this;
    const b = this.blackout;
    if (!b) {
      this.nextBlackout -= dt;
      if (this.nextBlackout <= 0) {
        this.blackout = { phase: 'warn', t: 0, dark: this.rng.range(20, 32), spawned: false };
        ctx.audio.flickerBuzz(2.5, 0.2);
      }
      this.globalLight += (1 - this.globalLight) * Math.min(1, dt * 6);
      this.emergency += (0.15 - this.emergency) * Math.min(1, dt * 3);
      return;
    }
    b.t += dt;
    if (b.phase === 'warn') {
      this.globalLight = this.rng.next() < 0.5 ? 0.15 + this.rng.next() * 0.5 : 1;
      if (b.t > 2.5) {
        b.phase = 'dark';
        b.t = 0;
        ctx.audio.thud(0, 0.5);
        ctx.hud.message('Blackout. Get into a corridor.', 3);
      }
    } else if (b.phase === 'dark') {
      this.globalLight += (0.025 - this.globalLight) * Math.min(1, dt * 8);
      this.emergency += (1 - this.emergency) * Math.min(1, dt * 3);
      if (!b.spawned && b.t > 2.5) b.spawned = this.hound.spawn(player) || b.t > 6;
      if (b.t > b.dark) {
        b.phase = 'restore';
        b.t = 0;
        this.hound.leave();
        ctx.audio.flickerBuzz(1.5, 0.18);
      }
    } else {
      this.globalLight = this.rng.next() < 0.5 ? 0.2 : 1;
      if (b.t > 1.5) {
        this.blackout = null;
        this.nextBlackout = this.rng.range(70, 130);
      }
    }
  }

  updateLights(dt, player) {
    const { world, shared } = this;
    shared.globalLight.value = this.globalLight;
    shared.emergency.value = this.emergency;
    world.panelMat.color.setScalar(0.12 + 0.88 * this.globalLight);
    if (this.lampMat) this.lampMat.color.setRGB(0.25 + 0.75 * this.emergency, 0.04, 0.03);
    const near = [];
    for (const i of this.flickers) {
      const l = world.lights[i];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d < 18) near.push([i, d]);
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
      const ph = this.phase.get(i);
      const t = this.time * 8 + ph;
      const on = Math.sin(t * 1.3) + Math.sin(t * 0.41 + ph) * 1.1 > -0.3 && fract(Math.sin(Math.floor(t) * 77.1 + ph) * 43758.5) > 0.25;
      const level = on ? 1 : 0.05;
      pos.set(l.x, H - 0.6, l.z, l.power * 1.2 * level * this.globalLight);
      col.setRGB(l.color[0], l.color[1], l.color[2]);
      world.setPanelLevel(i, level);
      nearest = Math.min(nearest, d);
    }
    this.buzzTimer -= dt;
    if (nearest < 7 && this.buzzTimer <= 0 && this.globalLight > 0.5) {
      this.ctx.audio.flickerBuzz(1.1, 0.08 * (1 - nearest / 7));
      this.buzzTimer = 1.1;
    }
  }

  // "Hallways appear to stretch into the distance."
  updateStretch(dt, player, zone) {
    if (!this.stretch) {
      player.speedMul = 1;
      this.nextStretch -= dt;
      if (this.nextStretch <= 0 && zone === ZONE.HALL && player.speed > 1 && !this.blackout) {
        this.stretch = { t: 0, dur: 7 };
      }
      return;
    }
    const s = this.stretch;
    s.t += dt;
    const k = Math.sin(Math.PI * Math.min(1, s.t / s.dur));
    this.stretchK = k;
    player.speedMul = 1 - 0.55 * k;
    if (s.t >= s.dur) {
      this.stretch = null;
      this.stretchK = 0;
      this.nextStretch = this.rng.range(80, 140);
    }
  }

  seen(player, x, z, maxD = 40) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > maxD) return false;
    const cos = (dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw)) / Math.max(d, 0.01);
    return cos > 0.45 && this.map.hasLineOfSight(player.pos.x, player.pos.z, x, z);
  }

  updateCrates(dt, player) {
    const { ctx } = this;
    for (const c of this.crates) {
      if (c.gone) continue;
      const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
      c.group.visible = d < 32;
      if (!c.opened && d < 1.3) {
        c.opened = true;
        c.lid.position.set(c.size * 0.3, c.size * 0.8 + 0.1, c.size * 0.45);
        c.lid.rotation.set(0.5, 0.3, 0.2);
        const inside = new THREE.Mesh(this.lidGeo, this.innerMat);
        inside.scale.set(c.size * 0.9, 1, c.size * 0.9);
        inside.position.y = c.size * 0.8 - 0.03;
        c.group.add(inside);
        this.loot(c, player);
      }
    }
    // Unwatched crates sometimes just aren't there any more.
    this.crateCheck -= dt;
    if (this.crateCheck <= 0) {
      this.crateCheck = 2.5;
      for (const c of this.crates) {
        if (c.gone || c.opened || !c.ephemeral) continue;
        const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
        if (d > 9 && !this.seen(player, c.x, c.z) && this.rng.chance(0.12)) {
          c.gone = true;
          this.props.remove(c.group);
        }
      }
    }
    // ...and sometimes new ones turn up.
    this.nextDrop -= dt;
    if (this.nextDrop <= 0) {
      this.nextDrop = this.rng.range(50, 85);
      const { map, zone } = this.layout;
      for (let tries = 0; tries < 60; tries++) {
        const x = this.rng.int(0, map.cols - 1), y = this.rng.int(0, map.rows - 1);
        if (zone[map.idx(x, y)] !== ZONE.HALL) continue;
        const [cx, cz] = map.cellCenter(x, y);
        const d = Math.hypot(cx - player.pos.x, cz - player.pos.z);
        if (d < 12 || d > 30 || this.seen(player, cx, cz)) continue;
        this.crates.push(this.spawnCrate({ x: cx + this.rng.range(-0.6, 0.6), z: cz + this.rng.range(-0.6, 0.6), rot: this.rng.range(0, Math.PI), size: 0.8, table: 'normal', ephemeral: false }));
        ctx.audio.thud(this.panTo(player, cx, cz), 0.25);
        break;
      }
    }
  }

  loot(c, player) {
    const { ctx, rng } = this;
    const hud = ctx.hud;
    const table = c.table === 'garden'
      ? [['water', 35], ['aid', 35], ['battery', 20], ['bad', 10]]
      : [['water', 28], ['battery', 18], ['aid', 14], ['junk', 26], ['bad', 14]];
    let r = rng.next() * table.reduce((a, [, w]) => a + w, 0);
    let pick = table[0][0];
    for (const [name, w] of table) {
      r -= w;
      if (r <= 0) {
        pick = name;
        break;
      }
    }
    ctx.audio.clank(0, 0.15);
    switch (pick) {
      case 'water':
        if (player.bottles < MAX_BOTTLES) {
          player.bottles++;
          ctx.audio.pickup();
          hud.message('A crate: Almond Water.', 2.5);
        } else {
          player.sanity = Math.min(100, player.sanity + 15);
          hud.message('A crate: Almond Water. You drink it there and then.', 2.5);
        }
        break;
      case 'battery':
        player.battery = 100;
        ctx.audio.pickup();
        hud.message('A crate: batteries. Flashlight recharged.', 2.5);
        break;
      case 'aid':
        player.health = Math.min(100, player.health + 45);
        ctx.audio.pickup();
        hud.message('A crate: a first aid kit.', 2.5);
        break;
      case 'junk':
        hud.message(`A crate: ${rng.pick(JUNK)}`, 3);
        break;
      default: {
        const bad = rng.int(0, 2);
        if (bad === 0) {
          player.damage(10);
          player.sanity = Math.max(0, player.sanity - 12);
          ctx.hurtFlash(0.4);
          ctx.audio.staticBurst(0.6, 0.2);
          hud.message('A crate: a puff of grey spores. You cough for a long time.', 3);
        } else if (bad === 1) {
          player.sanity = Math.max(0, player.sanity - 14);
          ctx.audio.scratch(0, 0.5);
          hud.message('A crate: empty. Something inside it moved anyway.', 3);
        } else {
          player.sanity = Math.max(0, player.sanity - 8);
          ctx.audio.crash(0, 0.4);
          hud.message('A crate: it was full of wet carpet. Level 0 carpet.', 3);
        }
      }
    }
  }

  updateProps(dt, player) {
    // Workers keep working. They never look at you.
    for (const w of this.workers) {
      w.phase += dt * 3.2;
      const s = Math.sin(w.phase);
      w.arm.rotation.x = -1.2 + s * 0.9;
      if (s < -0.95 && this.time - w.lastHit > 0.5) {
        w.lastHit = this.time;
        const d = Math.hypot(w.x - player.pos.x, w.z - player.pos.z);
        if (d < 16) this.ctx.audio.tink(this.panTo(player, w.x, w.z), 0.2 * (1 - d / 16));
      }
      const d = Math.hypot(w.x - player.pos.x, w.z - player.pos.z);
    }
    for (const dial of this.dials) {
      const jitter = Math.sin(this.time * (3 + dial.k * 14) + dial.phase) * (0.1 + dial.k * 0.6) + (Math.random() - 0.5) * dial.k * 0.3;
      dial.needle.rotation.z = dial.base + jitter;
    }
  }

  updateAmbient(dt, player) {
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = this.rng.range(2, 6);
    const pan = this.rng.range(-1, 1);
    const r = this.rng.next();
    if (r < 0.55) this.ctx.audio.drip(pan, this.rng.range(0.05, 0.16));
    else if (r < 0.75) this.ctx.audio.clank(pan, this.rng.range(0.04, 0.12));
    else if (r < 0.82 && player.sanity < 70) this.ctx.audio.whisper(pan, 0.15);
    else if (r < 0.88) this.ctx.audio.phantomSteps(pan * 0.7);
  }

  shiftCorridors(player) {
    const { map, zone, exit } = this.layout;
    const { rng, world } = this;
    const corridorEdge = (e) => {
      const a = e.h ? [e.x, e.y - 1] : [e.x - 1, e.y];
      const b = [e.x, e.y];
      if (!map.inBounds(...a) || !map.inBounds(...b)) return false;
      const za = zone[map.idx(...a)], zb = zone[map.idx(...b)];
      return za === ZONE.CORRIDOR && zb === ZONE.CORRIDOR;
    };
    const unseen = (e) => {
      const cs = map.cellSize;
      const mx = e.h ? (e.x + 0.5) * cs : e.x * cs, mz = e.h ? e.y * cs : (e.y + 0.5) * cs;
      const d = Math.hypot(mx - player.pos.x, mz - player.pos.z);
      if (d < 7 || d > 30) return false;
      const ox = e.h ? 0 : 1.2, oz = e.h ? 1.2 : 0;
      return !map.hasLineOfSight(player.pos.x, player.pos.z, mx + ox, mz + oz) && !map.hasLineOfSight(player.pos.x, player.pos.z, mx - ox, mz - oz);
    };
    const pick = (want) => {
      for (let t = 0; t < 80; t++) {
        const x = rng.int(1, map.cols - 2), y = rng.int(1, map.rows - 2), d = rng.int(0, 3);
        const e = map.edge(x, y, d);
        const fw = this.layout.fakeWindow?.edge;
        if (fw && fw.h === e.h && fw.x === e.x && fw.y === e.y) continue;
        if (map.getEdge(e) === want && corridorEdge(e) && unseen(e)) return e;
      }
      return null;
    };
    const changed = [];
    const open = pick(EDGE_WALL);
    if (open) {
      map.setEdge(open, EDGE_OPEN);
      changed.push(open);
    }
    const close = pick(EDGE_OPEN);
    if (close) {
      map.setEdge(close, EDGE_WALL);
      const [px, py] = map.cellAt(player.pos.x, player.pos.z);
      const dist = map.bfs(px, py);
      const [ex, ey] = exit.cells[0];
      if (dist[map.idx(ex, ey)] >= 0) changed.push(close);
      else map.setEdge(close, EDGE_OPEN);
    }
    if (!changed.length) return;
    for (const e of changed) world.rebuildAroundEdge(e);
    world.rebuildCollision();
    for (const e of changed) {
      const cs = map.cellSize;
      const mx = e.h ? (e.x + 0.5) * cs : e.x * cs, mz = e.h ? e.y * cs : (e.y + 0.5) * cs;
      world.bakeLightmap({ x0: mx - 10, z0: mz - 10, x1: mx + 10, z1: mz + 10 });
    }
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

  // ---- Values the game reads every frame ---------------------------------

  audioMix(player) {
    const e = this.exitInfo;
    const d = Math.hypot(player.pos.x - e.ax, player.pos.z - e.az);
    let exitGain = 0, exitPan = 0;
    if (this.here?.zone === ZONE.EXIT) {
      exitGain = 0.15 + this.exitProgress * 0.45;
      exitPan = 0;
    } else if (d < 34) {
      const walls = this.map.wallsBetween(player.pos.x, player.pos.z, e.ax, e.az, 3);
      exitGain = (0.3 / (1 + (d / 8) ** 2)) * Math.pow(0.6, walls);
      exitPan = this.panTo(player, e.ax, e.az);
    }
    let drone = 0;
    if (this.hound.active) drone = 0.08 + 0.3 * Math.max(0, 1 - this.hound.pos.distanceTo(player.pos) / 30);
    return {
      hum: 0.035 * this.globalLight,
      exitGain,
      exitPan,
      exitType: 'steam',
      drone,
      sanity: player.sanity,
      ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const k = this.globalLight;
    const garden = Math.min(1, this.gardenExposure);
    const target = new THREE.Color(
      0.012 + r * 0.55 * k + this.emergency * 0.02,
      0.012 + g * 0.57 * k,
      0.012 + b * 0.58 * k,
    );
    if (this.here?.sector === SECTOR.GARDEN) target.lerp(new THREE.Color(0.3 * k, 0.4 * k, 0.15 * k), 0.4);
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const lum = (r + g + b) / 3 * k;
    this.lum += (lum - this.lum) * Math.min(1, dt * 3);
    const dens = 0.022 + (1 - Math.min(1, this.lum * 2)) * 0.02 + garden * 0.02;
    this.fogDensity += (dens - this.fogDensity) * Math.min(1, dt * 2);
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.2 + garden * 0.8 + hurt * 0.3,
      aberr: 0.3 + insanity * 1.4 + hurt * 1.2 + garden,
      grain: 0.05 + insanity * 0.06 + (this.lum < 0.15 ? 0.04 : 0),
      shake: this.hound.state === 'hunt' ? Math.max(0, 0.5 - this.hound.pos.distanceTo(player.pos) / 20) : 0,
      fovMul: 1 + 0.45 * (this.stretchK || 0),
    };
  }

  hudInfo() {
    const z = this.here?.zone;
    const exposed = this.blackout && this.blackout.phase === 'dark' && z !== ZONE.CORRIDOR && z !== ZONE.ROOM && z !== ZONE.EXIT;
    const warn = exposed ? 'GET TO A CORRIDOR' : this.gardenExposure > 0.45 ? 'GET OUT OF THE GARDEN' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    this.shared.emergency.value = 0;
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    this.world.dispose();
    this.hound.dispose();
    this.kit.dispose();
    for (const g of this.ownGeos || []) g.dispose();
    for (const m of this.ownMats || []) m.dispose();
    for (const m of this.dialMats || []) m.dispose();
    for (const m of this.vineMats.values()) m.dispose();
    this.crateGeo.dispose();
    this.lidGeo.dispose();
    this.innerMat.dispose();
    if (this.whiteMat) this.whiteMat.dispose();
    if (this.lampMat) this.lampMat.dispose();
    this.leafTex.dispose();
    this.gaugeTex.dispose();
    disposeTextures(this.textures);
  }
}

function key(e) {
  return `${e.h ? 'h' : 'v'}${e.x},${e.y}`;
}

function fract(x) {
  return x - Math.floor(x);
}

export const LEVEL1 = {
  id: 'level1',
  number: 1,
  name: 'Level 1',
  title: 'The Habitable Zone',
  difficulty: 1,
  next: 'level2',
  create: (ctx) => new Level1(ctx),
};
