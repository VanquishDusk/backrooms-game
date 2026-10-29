import * as THREE from 'three';
import { GridWorld } from '../../world/GridWorld.js';
import { DIRS, EDGE_BARS } from '../../world/GridMap.js';
import { SURFACE, MAX_DYN_LIGHTS, createWorldMaterial } from '../../world/materials.js';
import {
  unevenBrickTexture, glazedTileTexture, flakingCeilingTexture, greyTileFloorTexture, marbleFloorTexture,
  stoneBlockTexture, metalTexture, blackFluidTexture, purpleStainTexture, sacredPaintingsTexture,
  level3SignTexture, L3_SIGNS, liftPanelTexture, utilityFloorTexture, diamondPlateTexture, pipeTexture,
  solidTexture, crateTexture, utilityDoorTexture, gaugeTexture,
} from '../../world/textures.js';
import { disposeTextures, nearDoor } from '../../world/props.js';
import { ChunkedBuilders, TubeBuilder } from '../../world/tubes.js';
import { Fixtures, applyDynamicLights } from '../../world/fixtures.js';
import { planServices, buildServices } from '../../world/services.js';
import { createNoise2D } from '../../core/rng.js';
import { EntityManager } from '../../entities/lib/index.js';
import { generateLevel3, KIND, CEIL } from './generate.js';
import { Dresser, blockFurnishedSteps } from '../../world/dresser.js';
import { generatorRoom, boilerRoom, assemblyHall, sanctum, baseGamma, gallery } from './dress.js';
import { scatterItems } from '../../world/scatter.js';

// Level 3 — "Electrical Station".
//
//  - A dark maze of uneven brick and glazed-tile service corridors, some so
//    low you must crouch or crawl; buzzing tubes, exposed wiring, junction
//    boxes, and pipes carrying a black fluid (see it move in the sight glasses)
//  - Indestructible bars block many passages and seal whole galleries off:
//    damaged statues, paintings, odd things, and shadows that watch you
//  - Generator rooms (switchgear, busbars, a generator set), boiler rooms
//    (riveted brass, a furnace), an assembly hall whose lines keep producing
//    supplies, Sanctums (columns, pews, angel statues; entities won't enter),
//    and Base Gamma (an empty M.E.G. outpost)
//  - Hazards: sparking wires, lights that shatter, generators that fail and
//    take the lights with them, purple discoloration, and the heat
//  - Hounds and Skin-Stealers
//  - Back: the door you came through, to Level 2. On: the freight lift, to Level 4.

const T = 0.08;
const VIEW = 36;
const BOTTLE_SANITY = 35;
const JUNK = [
  'A fuse the size of your forearm. Blown.', 'A coil of copper wire, still warm.', 'A hard hat with M.E.G. stencilled on it.',
  'A logbook. Every entry says "pressure normal".', 'A jar of black fluid. It moves when you don\'t look at it.',
  'An insulated glove. Just the one.', 'A brass valve handle.', 'A box of light bulbs, every one broken.',
];
const NOTE = '"M.E.G. — BASE GAMMA. Statues keep them out of the Sanctums; rest there if you have to. Don\'t touch the black stuff in the pipes. Don\'t stand in the purple. The old freight lift goes down to Level 4: we painted arrows on the floor from here. Wires spark, lights pop, and when a generator dies, so does everything near it. Keep moving."';

const PROFILES = {
  wires: () => [
    { k: 'conduit', r: 0.022, o: 0.04, y: 2.3 },
    { k: 'conduit', r: 0.022, o: 0.04, y: 2.38 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.5 },
  ],
  black: (rng) => [
    { k: 'black', r: 0.075, o: 0.11, y: rng.range(1.9, 2.02) },
    { k: 'black', r: 0.05, o: 0.08, y: 2.26 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.52 },
  ],
  lowblack: () => [
    { k: 'black', r: 0.09, o: 0.13, y: 0.34 },
    { k: 'conduit', r: 0.022, o: 0.04, y: 2.35 },
    { k: 'cable', r: 0.028, o: 0.05, y: 2.5 },
  ],
  mixed: (rng) => [
    { k: 'rust', r: 0.06, o: 0.09, y: rng.range(1.05, 1.2) },
    { k: 'conduit', r: 0.02, o: 0.035, y: 2.3 },
    { k: 'cable', r: 0.03, o: 0.05, y: 2.48 },
  ],
  bare: () => [{ k: 'cable', r: 0.028, o: 0.045, y: 2.5 }],
  room: () => [],
  door: () => [],
};
const pickProfile = (rng) => {
  const r = rng.next();
  return r < 0.3 ? 'wires' : r < 0.55 ? 'black' : r < 0.68 ? 'lowblack' : r < 0.86 ? 'mixed' : 'bare';
};
const WALL_STYLE = { generator: 'wall', boiler: 'darkbrick', assembly: 'tanbrick', sanctum: 'stone', gallery: 'stone', base: 'tanbrick' };
const FLOOR_STYLE = { generator: 'floor', boiler: 'floor', assembly: 'floor', sanctum: 'marble', gallery: 'marble', base: 'tile' };

export class Level3 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel3(rng.fork('layout'));
    this.layout = layout;
    const { map, kind, roomId, rooms, ceil } = layout;
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
    this.solid = solid;

    // ---- Plan and dress (all collision before the world is built) --------
    const D = new Dresser({ cb: this.cb, rng: drng.fork('rooms'), map, solid, lights: layout.lights, group: this.props, ownGeos: this.ownGeos, ceilOf: (r) => CEIL[r.type] });
    this.dresser = D;
    this.rooms = rooms.map((r) => {
      const fn = { generator: generatorRoom, boiler: boilerRoom, assembly: assemblyHall, sanctum, base: baseGamma, gallery }[r.type];
      return { ...r, data: fn(D, r) };
    });
    // Wall bundles and ceiling services in the corridors.
    const pseudoDoors = [...layout.doors];
    for (const l of layout.lifts) for (let d = 0; d < 4; d++) if (d !== l.dir) pseudoDoors.push({ edge: map.edge(l.x, l.y, d) });
    this.plan = planServices({ ...layout, doors: pseudoDoors }, drng.fork('plan'), {
      profiles: PROFILES, pick: pickProfile, H: CEIL.CORR,
      ceilingOk: (x, y) => kind[map.idx(x, y)] === KIND.CORR, ceilingKinds: ['black', 'black', 'rust', 'galv'],
    });
    solid.push(...this.plan.boxes);
    this.planCorridorClutter(drng.fork('clutter'));
    // Each lift car has its own bulb; lights must exist before the bake.
    for (const l of layout.lifts) {
      const [lx, lz] = map.cellCenter(l.x, l.y);
      D.light({ x: lx, z: lz, type: 'bulb', ceil: 2.53, power: 0.75, color: [1, 0.7, 0.4], cell: [l.x, l.y], section: layout.sectionOf(l.x, l.y) });
    }

    // ---- Textures and the world ----------------------------------------------
    this.textures = {
      wall: unevenBrickTexture(renderer, 'red'),
      floor: utilityFloorTexture(renderer),
      ceiling: flakingCeilingTexture(renderer),
      floors: {
        tile: { map: greyTileFloorTexture(renderer), scale: 1 / 2.4, surface: SURFACE.FLOOR },
        marble: { map: marbleFloorTexture(renderer), scale: 1 / 3.2 },
      },
      walls: {
        tile: { map: glazedTileTexture(renderer), scale: [1 / 1.2, 1 / CEIL.CORR] },
        darkbrick: { map: unevenBrickTexture(renderer, 'dark'), scale: [1 / 0.9, 1 / 1.65] },
        tanbrick: { map: unevenBrickTexture(renderer, 'tan'), scale: [1 / 0.9, 1 / 1.65] },
        stone: { map: stoneBlockTexture(renderer), scale: [1 / 3.2, 1 / 3.2] },
      },
      metals: Object.fromEntries(['brass', 'copper', 'green', 'black', 'ceramic', 'belt', 'enamel'].map((k) => [k, metalTexture(renderer, k)])),
      pipes: Object.fromEntries(['galv', 'rust', 'cable'].map((k) => [k, pipeTexture(renderer, k)])),
      fluid: blackFluidTexture(),
      purple: purpleStainTexture(),
      paintings: sacredPaintingsTexture(),
      signs: level3SignTexture(renderer),
      lift: liftPanelTexture(renderer),
      plate: diamondPlateTexture(renderer),
      crate: crateTexture(renderer),
      door: utilityDoorTexture(renderer, 'exit3'),
      gauge: gaugeTexture(),
      arrow: arrowTexture(),
      solids: {},
    };
    shared.ceilH.value = 3.2;
    const noise = createNoise2D(drng.fork('damp'));
    const roomOf = (x, y) => (map.inBounds(x, y) && roomId[map.idx(x, y)] >= 0 ? rooms[roomId[map.idx(x, y)]] : null);
    const sectionOf = (x, y) => layout.sections[layout.sectionOf(x, y)];
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      extraBoxes: solid.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 })),
      textures: this.textures,
      shared,
      texScale: { wall: [1 / 0.9, 1 / 1.65], floor: 1 / 3, ceiling: 1 / 3 },
      panelSize: [0.001, 0.001],
      ceilingAt: (x, y) => ceil[map.idx(x, y)],
      floorStyle: (x, y) => {
        const r = roomOf(x, y);
        return r ? FLOOR_STYLE[r.type] : sectionOf(x, y).floor;
      },
      wallStyle: (e) => {
        const a = e.h ? [e.x, e.y - 1] : [e.x - 1, e.y];
        const b = [e.x, e.y];
        const r = roomOf(...a) || roomOf(...b);
        if (r) return WALL_STYLE[r.type];
        const [x, y] = map.inBounds(...b) ? b : a;
        const st = sectionOf(x, y).wall;
        return st === 'brick' ? 'wall' : st;
      },
      dampAt: (x, z) => Math.max(0, Math.min(1, (noise(x * 0.08, z * 0.08) - 0.45) * 3)),
    });
    scene.add(this.world.group);

    // ---- Materials ---------------------------------------------------------------
    const lit = (tex, scale = 1) => {
      const m = createWorldMaterial(shared, tex, SURFACE.PLAIN, scale);
      this.ownMats.push(m);
      return m;
    };
    const solidTex = (hex, n = 0.06) => (this.textures.solids[hex] ||= solidTexture(renderer, hex, n));
    const M = this.textures.metals, P = this.textures.pipes;
    this.fluidMat = new THREE.MeshBasicMaterial({ map: this.textures.fluid, color: 0x9a90a8 });
    this.textures.fluid.repeat.set(1, 1);
    this.ownMats.push(this.fluidMat);
    this.mats = {
      green: lit(M.green), copper: lit(M.copper), ceramic: lit(M.ceramic), enamel: lit(M.enamel), blackpanel: lit(M.black),
      black: lit(M.black), brass: lit(M.brass), belt: lit(M.belt),
      cable: lit(P.cable), conduit: lit(P.galv), galv: lit(P.galv), rust: lit(P.rust),
      steel: lit(solidTex('#4a4c4a', 0.1)), iron: lit(solidTex('#2a2826', 0.1)), strut: lit(solidTex('#8e9290', 0.1)),
      concrete: lit(this.textures.floor, 1 / 1.5), brick: lit(this.textures.walls.darkbrick.map, [1 / 0.9, 1 / 1.65]),
      stone: lit(this.textures.walls.stone.map, 1 / 3.2), statue: lit(solidTex('#c4beb2', 0.08)),
      wood: lit(solidTex('#5a3c22', 0.12)), canvas: lit(solidTex('#8a8468', 0.08)), olive: lit(solidTex('#4a5236', 0.1)),
      yellow: lit(solidTex('#c8a018', 0.08)), paper: lit(solidTex('#d8d2c0', 0.04)), bottle: lit(solidTex('#c8bc98', 0.04)),
      red: lit(solidTex('#8a1a14', 0.08)), glass: lit(solidTex('#d8e0e0', 0.02)), housing: lit(solidTex('#b8b6ac', 0.05)),
      cage: lit(solidTex('#2a2a28', 0.05)), bars: lit(solidTex('#a8a8a0', 0.18)), rubble: lit(this.textures.floor, 1 / 0.6),
      paintings: lit(this.textures.paintings), signs: lit(this.textures.signs), liftwood: lit(this.textures.lift, 1 / 1.2),
      plate: lit(this.textures.plate, 1 / 0.9), crate: lit(this.textures.crate), arrow: lit(this.textures.arrow),
      pool: lit(solidTex('#060508', 0.02)), fluid: this.fluidMat, door: lit(this.textures.door), gauge: lit(this.textures.gauge),
    };
    this.purpleMat = new THREE.MeshBasicMaterial({ map: this.textures.purple, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.ownMats.push(this.purpleMat);

    // ---- Build -------------------------------------------------------------------
    buildServices(this.cb, this.plan, drng.fork('services'), CEIL.CORR);
    this.buildSightGlasses();
    this.buildBars();
    this.buildSigns();
    this.buildCorridorClutter();
    this.buildHazards();
    this.buildLifts();
    // Most lifts go down to Level 4; a second one (now and then the only one) to the hotel.
    const lr = rng.fork('lift-targets');
    this.lifts.forEach((l, k) => (l.target = k === 1 || (this.lifts.length === 1 && lr.chance(0.25)) ? 'level5' : 'level4'));
    this.buildBackDoor();
    this.buildArrows();
    this.fixtures = new Fixtures({ lights: layout.lights, cb: this.cb, group: this.props, rng: drng.fork('fixtures'), H });
    const before = this.props.children.length;
    this.ownGeos.push(...this.cb.finish(this.props, this.mats));
    this.chunkMeshes = this.props.children.slice(before).map((m) => ({ m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius }));
    this.buildRoomRuntime();
    this.buildCrates();
    this.buildParticles();
    this.buildShadow();


    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx - DIRS[layout.spawn.dir][0] * 0.3, z: sz - DIRS[layout.spawn.dir][1] * 0.3, yaw: layout.spawnYaw };
    const [bsx, bsy] = map.cellAt(this.spawn.x, this.spawn.z);
    blockFurnishedSteps(map, this.world, (i) => layout.roomId[i] >= 0, [bsx, bsy]);
    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('entities'), shared });
    this.spawnEntities();
    scatterItems(ctx, this.world, ctx.rng.fork('items'), ['pipe', 'flare'], [layout.spawn.x, layout.spawn.y], { min: 20, max: 120, ok: (i) => layout.kind[i] === KIND.CORR });

    this.secDark = new Uint8Array(layout.sections.length);
    this.time = 0;
    this.done = false;
    this.blackout = null;
    this.nextBlackout = this.rng.range(50, 80);
    this.nextShatter = this.rng.range(25, 50);
    this.nextAmbient = 2;
    this.nextShadow = this.rng.range(8, 16);
    this.buzzTimer = 0;
    this.cullTimer = 0;
    this.flash = null;
    this.lum = 1;
    this.fogColor = new THREE.Color(0.08, 0.06, 0.04);
    this.fogDensity = 0.05;
    this.purpleK = 0;
    this.heat = 0;
    this.lift = null;
  }

  // ---- Planning helpers ---------------------------------------------------------

  planCorridorClutter(rng) {
    this.clutter = [];
    for (const spot of this.plan.clutter) {
      if (spot.room) continue;
      const type = rng.pick(['jbox', 'jbox', 'panel', 'debris', 'debris', 'cans']);
      const D = type === 'panel' ? 0.25 : type === 'jbox' ? 0.2 : 0.4;
      const x = spot.x + spot.nx * (D / 2 + 0.01), z = spot.z + spot.nz * (D / 2 + 0.01);
      this.clutter.push({ type, x, z, rot: Math.atan2(spot.nx, spot.nz), seed: rng.next() });
    }
  }

  // ---- Build ----------------------------------------------------------------------

  // Sight glasses on the black pipes: a window onto the moving black fluid.
  buildSightGlasses() {
    for (const p of this.plan.pipes) {
      if (p.k !== 'black') continue;
      for (let i = 0; i < p.pts.length - 1; i++) {
        const a = p.pts[i], c = p.pts[i + 1];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        if (len < 2.2 || Math.abs(c[1] - a[1]) > 0.01 || !this.drng.chance(0.5)) continue;
        const t = this.drng.range(0.3, 0.7), h = 0.16 / len;
        const P = (k) => [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];
        this.cb.at('fluid', ...P(t).filter((_, j) => j !== 1)).cylinder(P(t - h), P(t + h), p.r * 1.12, 10, { vScale: 1.5 });
        for (const k of [t - h - 0.03 / len, t + h]) this.cb.at('brass', P(k)[0], P(k)[2]).cylinder(P(k), P(k + 0.03 / len), p.r * 1.45, 10, { caps: true });
      }
    }
  }

  // Indestructible bars: on every barred edge, with the odd locked gate and sign.
  buildBars() {
    const { map, ceil, roomId, rooms } = this.layout;
    const cs = map.cellSize;
    const gateOf = new Map(this.layout.bars.map((b) => [`${b.e.h}|${b.e.x}|${b.e.y}`, b]));
    const edges = [];
    for (let y = 0; y <= map.rows; y++) for (let x = 0; x < map.cols; x++) if (map.getH(x, y) === EDGE_BARS) edges.push({ h: true, x, y });
    for (let y = 0; y < map.rows; y++) for (let x = 0; x <= map.cols; x++) if (map.getV(x, y) === EDGE_BARS) edges.push({ h: false, x, y });
    for (const e of edges) {
      const a = e.h ? [e.x, e.y - 1] : [e.x - 1, e.y], b = [e.x, e.y];
      const hs = [a, b].filter(([x, y]) => map.inBounds(x, y)).map(([x, y]) => ceil[map.idx(x, y)]);
      const h = Math.min(3.0, ...hs) - 0.02;
      const o = e.h ? { x: (e.x + 0.5) * cs, z: e.y * cs, rot: 0 } : { x: e.x * cs, z: (e.y + 0.5) * cs, rot: -Math.PI / 2 };
      const D = this.dresser;
      const w = cs / 2;
      for (let x = -w + 0.1; x < w - 0.05; x += 0.13) D.cyl('bars', o, [x, 0, 0], [x, h, 0], 0.017, 5);
      for (const y of [0.12, h * 0.5, h - 0.06]) D.box('bars', o, 0, y, 0, cs, 0.05, 0.03);
      for (const s of [-1, 1]) D.box('bars', o, s * (w - 0.04), h / 2, 0, 0.08, h, 0.08);
      const g = gateOf.get(`${e.h}|${e.x}|${e.y}`);
      const sealed = [a, b].some(([x, y]) => map.inBounds(x, y) && roomId[map.idx(x, y)] >= 0 && rooms[roomId[map.idx(x, y)]].sealed);
      if (g?.gate || (sealed && this.drng.chance(0.5))) {
        // A gate in the bars: hinge posts, a lock box, OUT OF BOUNDS.
        D.box('bars', o, -0.05, h / 2, 0, 0.07, h, 0.07);
        D.box('steel', o, -0.18, 1.1, 0.06, 0.12, 0.18, 0.08);
        D.box('steel', o, -0.18, 1.1, -0.06, 0.12, 0.18, 0.08);
        for (const s of [-1, 1]) D.signs.push({ o, lx: -w / 2, ly: 1.75, lz: s * 0.035, face: s, tile: sealed && this.drng.chance(0.4) ? 4 : 0 });
      }
    }
  }

  buildSigns() {
    const D = this.dresser;
    // Wall signs from the services plan (between brackets).
    for (const s of this.plan.signs) {
      const o = { x: s.x, z: s.z, rot: Math.atan2(s.nx, s.nz) };
      D.signs.push({ o, lx: 0, ly: s.y, lz: 0, face: 1, tile: this.drng.pick([1, 1, 4, 0]) });
    }
    for (const s of D.signs) {
      const k = s.tile, u0 = k / L3_SIGNS, u1 = (k + 1) / L3_SIGNS;
      const sc = s.scale || 1;
      const w = 0.32 * sc, h = 0.16 * sc;
      let o = s.o, lx = s.lx, lz = s.lz, face = s.face;
      if (face === 'x') {
        // On the -x end wall of the frame, facing +x.
        o = D.sub(s.o, s.lx, s.lz, Math.PI / 2);
        lx = 0;
        lz = 0;
        face = 1;
      }
      const pts = face > 0
        ? [[lx - w, s.ly - h, lz], [lx + w, s.ly - h, lz], [lx + w, s.ly + h, lz], [lx - w, s.ly + h, lz]]
        : [[lx + w, s.ly - h, lz], [lx - w, s.ly - h, lz], [lx - w, s.ly + h, lz], [lx + w, s.ly + h, lz]];
      D.quad('signs', o, pts, [0, 0, face], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }
  }

  buildCorridorClutter() {
    const D = this.dresser;
    for (const c of this.clutter) {
      const r = mulberry(c.seed);
      const o = { x: c.x, z: c.z, rot: c.rot };
      switch (c.type) {
        case 'jbox':
          D.box(r() < 0.5 ? 'green' : 'iron', o, 0, 1.45, 0, 0.36, 0.46, 0.2);
          D.cyl('conduit', o, [0.08, 1.68, -0.05], [0.08, CEIL.CORR, -0.05], 0.022, 5);
          if (r() < 0.5) D.cyl('conduit', o, [-0.08, 1.22, -0.05], [-0.08, 0.3, -0.05], 0.022, 5);
          break;
        case 'panel':
          D.box('blackpanel', o, 0, 1.4, 0, 0.6, 0.9, 0.2);
          for (let k = 0; k < 4; k++) D.box('enamel', o, -0.21 + k * 0.14, 1.45, 0.11, 0.06, 0.12, 0.03);
          for (const x of [-0.2, 0, 0.2]) D.cyl('conduit', o, [x, 1.85, -0.05], [x, CEIL.CORR, -0.05], 0.02, 5);
          break;
        case 'debris':
          for (let k = 0; k < 7; k++) {
            const [x, , z] = D.at(o, (r() - 0.5) * 0.9, 0, (r() - 0.3) * 0.4);
            const s = 0.05 + r() * 0.14;
            this.cb.at('rubble', x, z).box(x, s * 0.3, z, s, s * 0.6, s * (0.6 + r() * 0.6), r() * 3, 1, ['bottom']);
          }
          break;
        case 'cans':
          for (let k = 0; k < 4; k++) {
            const [x, , z] = D.at(o, (r() - 0.5) * 0.8, 0, (r() - 0.3) * 0.3);
            if (r() < 0.5) this.cb.at('galv', x, z).cylinder([x, 0, z], [x, 0.12, z], 0.035, 6, { caps: true });
            else this.cb.at('galv', x, z).cylinder([x - 0.05, 0.035, z], [x + 0.06, 0.035, z + 0.03], 0.035, 6, { caps: true });
          }
          break;
      }
    }
  }

  // Dangling live wires, black leaks with their puddles, purple stains.
  buildHazards() {
    const { map } = this.layout;
    const D = this.dresser;
    const r = this.drng.fork('hazards');
    this.sparkers = [];
    for (const [x, y] of this.layout.sparks) {
      const [cx, cz] = map.cellCenter(x, y);
      const o = { x: cx, z: cz, rot: r.range(0, Math.PI * 2) };
      const end = [0.35, r.range(1.2, 1.6), 0.15];
      D.pipe('cable', o, [[0.3, CEIL.CORR, 0], [0.32, 2.2, 0.05], end], 0.02, 5);
      for (let k = 0; k < 3; k++) D.cyl('copper', o, end, [end[0] + (r.next() - 0.5) * 0.12, end[1] - 0.06 - r.next() * 0.06, end[2] + (r.next() - 0.5) * 0.12], 0.004, 3);
      this.sparkers.push({ pos: D.at(o, ...end), next: r.range(0.5, 4), live: true, rate: [1.5, 5] });
    }
    // Puddles of black fluid, fed by a slow drip.
    this.puddles = [];
    const poolGeo = new THREE.CircleGeometry(1, 14);
    const p = poolGeo.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const k = 0.75 + Math.sin(i * 2.7) * 0.15 + Math.cos(i * 4.3) * 0.1;
      p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
    poolGeo.rotateX(-Math.PI / 2);
    this.ownGeos.push(poolGeo);
    for (const [x, y] of this.layout.puddles) {
      const [cx, cz] = map.cellCenter(x, y);
      const px = cx + r.range(-0.5, 0.5), pz = cz + r.range(-0.5, 0.5);
      const m = new THREE.Mesh(poolGeo, this.mats.pool);
      m.position.set(px, 0.004, pz);
      m.scale.set(r.range(0.35, 0.8), 1, r.range(0.35, 0.8));
      m.rotation.y = r.range(0, 3);
      this.props.add(m);
      this.puddles.push({ x: px, z: pz, next: r.range(0.5, 2.5) });
    }
    // Purple discoloration on floors and walls.
    this.purpleZones = [];
    const stainGeo = new THREE.PlaneGeometry(1, 1);
    this.ownGeos.push(stainGeo);
    for (const [x, y] of this.layout.purple) {
      const [cx, cz] = map.cellCenter(x, y);
      const f = new THREE.Mesh(stainGeo, this.purpleMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(cx, 0.006, cz);
      f.scale.set(2.6, 2.6, 1);
      this.props.add(f);
      for (let d = 0; d < 4; d++) {
        if (map.canMove(x, y, d)) continue;
        const wm = new THREE.Mesh(stainGeo, this.purpleMat);
        wm.position.set(cx + DIRS[d][0] * (cs(map) / 2 - T - 0.01), 1.2, cz + DIRS[d][1] * (cs(map) / 2 - T - 0.01));
        wm.rotation.y = Math.atan2(-DIRS[d][0], -DIRS[d][1]);
        wm.scale.set(2.2, 2.4, 1);
        this.props.add(wm);
      }
      this.purpleZones.push({ x: cx, z: cz });
    }
  }

  // The freight lift: a wood-panelled car with a scissor gate.
  buildLifts() {
    const { map } = this.layout;
    const cs = map.cellSize;
    const D = this.dresser;
    this.lifts = [];
    for (const l of this.layout.lifts) {
      const [cx, cz] = map.cellCenter(l.x, l.y);
      // Frame: local +z points out of the car toward the corridor.
      const o = { x: cx, z: cz, rot: Math.atan2(DIRS[l.dir][0], DIRS[l.dir][1]) };
      const h = cs / 2 - T - 0.01;
      // Panelled walls: back and both sides.
      D.quad('liftwood', o, [[h, 0.05, -h], [-h, 0.05, -h], [-h, 2.45, -h], [h, 2.45, -h]], [0, 0, 1], [[0, 0], [2.2, 0], [2.2, 2.4], [0, 2.4]]);
      for (const s of [-1, 1]) {
        D.quad('liftwood', o, s > 0
          ? [[h, 0.05, h], [h, 0.05, -h], [h, 2.45, -h], [h, 2.45, h]]
          : [[-h, 0.05, -h], [-h, 0.05, h], [-h, 2.45, h], [-h, 2.45, -h]], [-s, 0, 0], [[0, 0], [2.2, 0], [2.2, 2.4], [0, 2.4]]);
      }
      D.quad('plate', o, [[-h, 0.006, -h], [h, 0.006, -h], [h, 0.006, h], [-h, 0.006, h]], [0, 1, 0], [[0, 0], [2.2, 0], [2.2, 2.2], [0, 2.2]]);
      D.box('iron', o, 0, 2.5, 0, cs - 0.2, 0.06, cs - 0.2);
      D.box('brass', o, 0, 1.0, -h + 0.05, cs - 0.4, 0.05, 0.05);
      // Gate posts, header, the LIFT sign and a floor dial above.
      const gz = cs / 2 - 0.06;
      for (const s of [-1, 1]) D.box('steel', o, s * (h - 0.04), 1.2, gz, 0.1, 2.4, 0.1);
      D.box('steel', o, 0, 2.42, gz, cs - 0.16, 0.12, 0.12);
      D.signs.push({ o, lx: -0.55, ly: 2.62, lz: gz + 0.065, face: 1, tile: 2 });
      // Call button.
      D.box('steel', o, h - 0.04, 1.2, gz + 0.06, 0.07, 0.12, 0.02);
      this.lifts.push({ ...l, o, cx, cz, gz, h });
    }
  }

  // The red door you came through: back to Level 2.
  buildBackDoor() {
    const { map } = this.layout;
    const cs = map.cellSize;
    const d = this.layout.doors[0];
    const [cx, cz] = map.cellCenter(d.x, d.y);
    const nx = -DIRS[d.dir][0], nz = -DIRS[d.dir][1];
    const fx = cx + DIRS[d.dir][0] * (cs / 2 - T), fz = cz + DIRS[d.dir][1] * (cs / 2 - T);
    const o = { x: fx, z: fz, rot: Math.atan2(nx, nz) };
    const D = this.dresser;
    D.box('steel', o, -0.53, 1.06, 0.03, 0.09, 2.14, 0.07);
    D.box('steel', o, 0.53, 1.06, 0.03, 0.09, 2.14, 0.07);
    D.box('steel', o, 0, 2.15, 0.03, 1.15, 0.09, 0.07);
    D.box('galv', o, 0.34, 1.02, 0.09, 0.05, 0.05, 0.05);
    D.box('galv', o, 0.26, 1.02, 0.115, 0.17, 0.03, 0.03);
    D.box('cage', o, 0, 2.48, 0.12, 0.12, 0.05, 0.12);
    this.backDoor = { x: fx, z: fz, nx, nz, o };
  }

  // M.E.G. painted arrows on the floor, from Base Gamma toward a lift.
  buildArrows() {
    const { map, rooms } = this.layout;
    const base = rooms.find((r) => r.type === 'base');
    const lift = this.layout.lifts[0];
    if (!base || !lift || !base.doors?.length) return;
    // Walk back from the base along a BFS rooted at the lift.
    const dist = map.bfs(lift.x, lift.y);
    let [x, y] = [base.doors[0].nx, base.doors[0].ny];
    const D = this.dresser;
    for (let step = 0; step < 400 && dist[map.idx(x, y)] > 1; step++) {
      let best = -1;
      for (let d = 0; d < 4; d++) {
        if (!map.canMove(x, y, d)) continue;
        const n = dist[map.idx(x + DIRS[d][0], y + DIRS[d][1])];
        if (n >= 0 && n < dist[map.idx(x, y)]) best = d;
      }
      if (best < 0) break;
      if (step % 4 === 0 && this.layout.kind[map.idx(x, y)] === KIND.CORR) {
        const [cx, cz] = map.cellCenter(x, y);
        const o = { x: cx, z: cz, rot: Math.atan2(DIRS[best][0], DIRS[best][1]) };
        D.quad('arrow', o, [[-0.3, 0.005, -0.45], [0.3, 0.005, -0.45], [0.3, 0.005, 0.45], [-0.3, 0.005, 0.45]], [0, 1, 0]);
      }
      x += DIRS[best][0];
      y += DIRS[best][1];
    }
  }

  // Runtime pieces of rooms: conveyors, presses, furnaces, TVs, notes.
  buildRoomRuntime() {
    this.presses = [];
    this.belts = [];
    this.bins = [];
    this.hums = [];
    this.heats = [];
    this.candles = [];
    this.statues = [];
    this.galleries = [];
    this.notes = [];
    this.radios = [];
    this.crateSpots = [];
    this.furnaceMats = [];
    const beltTex = this.textures.metals.belt;
    this.beltTex = beltTex.clone();
    this.beltTex.needsUpdate = true;
    this.textures.beltRun = this.beltTex;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.ownGeos.push(boxGeo);
    this.staticTex = staticTexture();
    this.textures.staticTex = this.staticTex.tex;
    for (const r of this.rooms) {
      const d = r.data;
      this.hums.push(...(d.hum || []).map((p) => ({ x: p[0], z: p[2], loud: r.type === 'generator' ? 1.2 : 0.8 })));
      this.heats.push(...(d.heat || []));
      this.candles.push(...(d.candles || []));
      this.statues.push(...(d.statues || []));
      this.crateSpots.push(...(d.crates || []));
      if (d.sparks) for (const p of d.sparks) this.sparkers.push({ pos: p, next: this.drng.range(2, 9), live: true, rate: [4, 12] });
      if (d.glow) {
        const m = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
        this.furnaceMats.push(m);
        this.ownMats.push(m);
        const mesh = new THREE.Mesh(d.glow.geo, m);
        mesh.position.set(...d.glow.pos);
        mesh.rotation.y = d.glow.rot;
        this.props.add(mesh);
        this.heats.push(d.glow.pos);
      }
      for (const line of d.lines || []) {
        const geo = new THREE.PlaneGeometry(line.len, 0.72);
        geo.rotateX(-Math.PI / 2);
        this.ownGeos.push(geo);
        const [px, , pz] = this.dresser.at(line.f, 0, 0, 0);
        const [lr, lg, lb] = this.world.sampleLight(px, pz);
        const k = Math.max(0.15, (lr + lg + lb) / 3 * 1.4);
        const mat = new THREE.MeshBasicMaterial({ map: this.beltTex, color: new THREE.Color(k, k, k) });
        this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
        this.beltTex.repeat.set(line.len / 0.5, 1);
        this.ownMats.push(mat);
        const top = new THREE.Mesh(geo, mat);
        top.position.set(px, line.top, pz);
        top.rotation.y = line.f.rot;
        this.props.add(top);
        // Things riding the belt.
        const items = [];
        const n = Math.floor(line.len / 1.6);
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(boxGeo, this.drng.chance(0.5) ? this.mats.crate : this.mats.green);
          const s = this.drng.range(0.25, 0.45);
          m.scale.set(s, s * this.drng.range(0.6, 1), s);
          this.props.add(m);
          items.push({ m, off: (i / n) * line.len, h: m.scale.y / 2 });
        }
        this.belts.push({ ...line, items });
      }
      for (const p of d.presses || []) {
        const m = new THREE.Mesh(boxGeo, this.mats.steel);
        m.scale.set(0.55, 0.32, 0.65);
        m.rotation.y = p.rot;
        m.position.set(p.pos[0], 2.0, p.pos[2]);
        this.props.add(m);
        this.presses.push({ m, x: p.pos[0], z: p.pos[2], phase: this.drng.next() * 6, last: 0 });
      }
      for (const b of d.bins || []) this.bins.push({ x: b.pos[0], z: b.pos[2], item: null, next: this.drng.range(5, 20) });
      if (d.tv) {
        const geo = new THREE.PlaneGeometry(0.5, 0.38);
        this.ownGeos.push(geo);
        const mat = new THREE.MeshBasicMaterial({ map: this.staticTex.tex, color: 0xb0b0b0 });
        this.ownMats.push(mat);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(d.tv.pos[0], d.tv.pos[1], d.tv.pos[2]);
        m.rotation.y = d.tv.rot;
        this.props.add(m);
      }
      if (d.shadows) this.galleries.push({ room: r, spots: d.shadows });
      if (d.note) {
        const geo = new THREE.PlaneGeometry(0.22, 0.3);
        geo.rotateX(-Math.PI / 2);
        this.ownGeos.push(geo);
        const m = new THREE.Mesh(geo, this.mats.paper);
        m.position.set(d.note.x, 0.77, d.note.z);
        m.rotation.y = 0.4;
        this.props.add(m);
        this.notes.push({ x: d.note.x, z: d.note.z, text: NOTE, read: false });
      }
      if (d.radio) this.radios.push({ x: d.radio[0], z: d.radio[2], next: 3 });
    }
    // Lift gates and dials.
    for (const l of this.lifts) {
      const tb = new TubeBuilder();
      const w = l.h * 2 - 0.08, hgt = 2.3;
      const n = 10;
      for (let i = 0; i <= n; i++) tb.cylinder([i / n, 0.05, 0], [i / n, hgt, 0], 0.012, 4);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 4; k++) {
          const y0 = 0.1 + (k * (hgt - 0.2)) / 4, y1 = y0 + (hgt - 0.2) / 4;
          tb.cylinder([i / n, y0, 0], [(i + 1) / n, y1, 0], 0.008, 3);
          tb.cylinder([(i + 1) / n, y0, 0], [i / n, y1, 0], 0.008, 3);
        }
      }
      const g = tb.build();
      this.ownGeos.push(g);
      const gate = new THREE.Mesh(g, this.mats.bars);
      const [gx, , gz] = this.dresser.at(l.o, -w / 2, 0, l.gz);
      gate.position.set(gx, 0, gz);
      gate.rotation.y = l.o.rot;
      gate.scale.x = w * 0.12;
      this.props.add(gate);
      l.gate = gate;
      l.gateW = w;
      // Floor dial over the door.
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 18, 0, Math.PI), this.mats.gauge);
      this.ownGeos.push(face.geometry);
      const [dx, , dz] = this.dresser.at(l.o, 0.45, 0, l.gz + 0.065);
      face.position.set(dx, 2.5, dz);
      face.rotation.y = l.o.rot;
      this.props.add(face);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.14, 0.01), new THREE.MeshBasicMaterial({ color: 0x3a0a06 }));
      this.ownGeos.push(needle.geometry);
      this.ownMats.push(needle.material);
      needle.geometry.translate(0, 0.07, 0);
      needle.position.set(dx, 2.5, dz + 0.0);
      needle.rotation.order = 'YXZ';
      needle.rotation.y = l.o.rot;
      this.props.add(needle);
      l.needle = needle;
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }));
      this.ownGeos.push(btn.geometry);
      this.ownMats.push(btn.material);
      btn.position.set(...this.dresser.at(l.o, l.h - 0.04, 1.2, l.gz + 0.075));
      this.props.add(btn);
      l.button = btn;
    }
    // The back door slab and its red lamp.
    const bd = this.backDoor;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.06), this.mats.door);
    this.ownGeos.push(slab.geometry);
    slab.position.set(...this.dresser.at(bd.o, 0, 1.025, 0.035));
    slab.rotation.y = bd.o.rot;
    this.props.add(slab);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    this.ownGeos.push(lamp.geometry);
    this.ownMats.push(lamp.material);
    lamp.position.set(...this.dresser.at(bd.o, 0, 2.42, 0.12));
    this.props.add(lamp);
    bd.lamp = lamp;
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

  // Sparks and black drips share one particle pool.
  buildParticles() {
    const N = 220;
    this.pN = N;
    this.pPos = new Float32Array(N * 3);
    this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    this.pKind = new Uint8Array(N);
    this.pNext = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pGeo = geo;
    this.ownGeos.push(geo);
    const mat = new THREE.PointsMaterial({ size: 0.06, map: this.fixtures.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ownMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.props.add(pts);
    // Drips are dark, so they get a normal-blended set of their own.
    this.dripGeo = new THREE.BufferGeometry();
    this.dripPos = new Float32Array(30 * 3).fill(-50);
    this.dripVel = new Float32Array(30);
    this.dripGeo.setAttribute('position', new THREE.BufferAttribute(this.dripPos, 3));
    this.ownGeos.push(this.dripGeo);
    const dmat = new THREE.PointsMaterial({ size: 0.035, color: 0x050408 });
    this.ownMats.push(dmat);
    const dp = new THREE.Points(this.dripGeo, dmat);
    dp.frustumCulled = false;
    this.props.add(dp);
    this.dripNext = 0;
  }

  emitSparks(p, n = 16) {
    for (let k = 0; k < n; k++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % this.pN;
      this.pPos.set(p, i * 3);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      this.pVel[i * 3] = Math.cos(a) * sp;
      this.pVel[i * 3 + 1] = Math.random() * 2.2 - 0.4;
      this.pVel[i * 3 + 2] = Math.sin(a) * sp;
      this.pLife[i] = 0.3 + Math.random() * 0.5;
    }
  }

  buildShadow() {
    // A tall, thin figure of nothing, for behind the bars.
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    this.ownMats.push(mat);
    const body = new THREE.CylinderGeometry(0.16, 0.22, 1.75, 10);
    body.translate(0, 0.95, 0);
    const head = new THREE.SphereGeometry(0.14, 10, 8);
    head.translate(0, 1.98, 0);
    this.ownGeos.push(body, head);
    g.add(new THREE.Mesh(body, mat), new THREE.Mesh(head, mat));
    g.visible = false;
    this.props.add(g);
    this.shadow = { g, mat, t: 0, active: false };
  }

  // ---- Entities ---------------------------------------------------------------------

  spawnEntities() {
    const m = this.entities;
    const fake = { pos: new THREE.Vector3(this.spawn.x, 0, this.spawn.z) };
    for (let k = 0; k < 3; k++) m.spawnFar('hound', fake, { min: 30, max: 80 });
    for (let k = 0; k < 2; k++) m.spawnFar('skinstealer', fake, { min: 28, max: 80 });
    for (const e of m.list) {
      // Never start inside a safe room.
      if (this.forbidden(e, e.pos.x, e.pos.z)) m.spawnFar(e.type, fake, { min: 30, max: 80 }) && m.remove(e);
    }
  }

  // Sanctums and Base Gamma keep entities out; crawlspaces are too low for a Skin-Stealer.
  safeAt(x, z) {
    const { map, roomId, rooms } = this.layout;
    const [cx, cy] = map.cellAt(x, z);
    const r = roomId[map.idx(cx, cy)];
    return r >= 0 && (rooms[r].type === 'sanctum' || rooms[r].type === 'base') ? rooms[r].type : null;
  }

  forbidden(e, x, z) {
    if (this.safeAt(x, z)) return true;
    if (e.type !== 'skinstealer') return false;
    const { map, ceil } = this.layout;
    const [cx, cy] = map.cellAt(x, z);
    return ceil[map.idx(cx, cy)] <= CEIL.CRAWL + 0.01;
  }

  // ---- Per-frame -------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx, layout, map } = this;
    const [cx, cy] = map.cellAt(player.pos.x, player.pos.z);
    this.here = { cell: [cx, cy], section: layout.sectionOf(cx, cy), safe: this.safeAt(player.pos.x, player.pos.z) };

    // Headroom: look a little ahead so you duck before the ceiling arrives.
    let head = Infinity;
    for (const [dx, dz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
      const [hx, hy] = map.cellAt(player.pos.x + dx, player.pos.z + dz);
      head = Math.min(head, layout.ceil[map.idx(hx, hy)]);
    }
    player.ceiling = head;
    player.staminaRegenMul = 0.65;

    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.2;
      this.cull(player);
    }

    this.updateBlackout(dt, player);
    this.updateShatter(dt, player);
    this.updateLights(dt, player);
    this.updateMachines(dt, player);
    this.updateHazards(dt, player);
    this.updateParticles(dt);
    this.updateShadow(dt, player);
    this.updateCrates(player);
    this.updateAmbient(dt, player);

    // Sanity: darkness and the purple wear on you; Sanctums and the base restore.
    const light = this.lightLevel(player.pos.x, player.pos.z);
    const dark = light < 0.07 && !player.flashlight;
    let drain = 0.045 + (dark ? 0.2 : 0) + this.purpleK * 0.7 + this.heat * 0.05;
    if (this.here.safe) drain = -0.3;
    player.sanity = Math.max(0, Math.min(100, player.sanity - drain * dt));

    for (const n of this.notes) {
      if (n.read || Math.hypot(n.x - player.pos.x, n.z - player.pos.z) > 1.4) continue;
      n.read = true;
      ctx.audio.click();
      ctx.hud.message(n.text, 12);
    }

    // Entities. They won't follow you into a Sanctum or the base.
    const hp = player.health, sn = player.sanity;
    const res = this.entities.update(dt, player, ctx);
    for (const e of this.entities.list) {
      if (this.forbidden(e, e.pos.x, e.pos.z)) {
        if (e.safePos) e.pos.copy(e.safePos);
      } else {
        (e.safePos ||= new THREE.Vector3()).copy(e.pos);
      }
      e.root.visible = e.distTo(player) < (this.view || VIEW);
    }
    if (this.here.safe) {
      player.health = Math.max(player.health, hp);
      player.sanity = Math.max(player.sanity, sn);
    } else if (res.dead) {
      this.done = true;
      ctx.onDeath(player.sanity <= 0 && player.health > 0 ? 'The station hummed on, and you stopped hearing it.' : res.cause);
      return;
    }
    if (player.health <= 0) {
      this.done = true;
      ctx.onDeath(this.lastHurt || 'The station killed you.');
      return;
    }
    if (player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('The station hummed on, and you stopped hearing it.');
      return;
    }

    // The way back, and the way on.
    if (nearDoor(this.backDoor, player.pos.x, player.pos.z)) {
      this.done = true;
      ctx.onEscape('level2', 'door');
      return;
    }
    this.updateLift(dt, player);
  }

  updateLift(dt, player) {
    const { ctx } = this;
    if (this.lift) {
      const L = this.lift;
      L.t += dt;
      player.frozen = true;
      L.l.gate.scale.x = L.l.gateW * Math.min(1, 0.12 + L.t / 1.4 * 0.88);
      if (L.t > 1.4 && !L.moving) {
        L.moving = true;
        ctx.audio.liftMotor(0.4);
      }
      if (L.moving) {
        L.l.needle.rotation.z = -Math.min(L.l.target === 'level5' ? 2.2 : 1.4, (L.t - 1.4) * 0.8);
        player.pos.y = -Math.min(0.05, (L.t - 1.4) * 0.01);
      }
      if (L.t > 2.2 && !L.gone) {
        L.gone = true;
        this.done = true;
        player.frozen = false;
        ctx.onEscape(L.l.target || 'level4', 'door');
      }
      return;
    }
    for (const l of this.lifts) {
      l.needle.rotation.z = Math.sin(this.time * 0.3 + l.x) * 0.08;
      l.button.material.color.setRGB(0.7 + 0.3 * Math.sin(this.time * 3), 0.4, 0.05);
      if (Math.hypot(player.pos.x - l.cx, player.pos.z - l.cz) < 0.75) {
        this.lift = { l, t: 0 };
        ctx.audio.bell(0, 0.3);
        ctx.audio.rattle(0, 0.3);
      }
    }
  }

  cull(player) {
    const px = player.pos.x, pz = player.pos.z;
    const q = this.ctx.quality?.();
    this.view = q === 'low' ? VIEW - 10 : q === 'medium' ? VIEW - 5 : VIEW;
    for (const k of this.chunkMeshes) k.m.visible = Math.hypot(k.c.x - px, k.c.z - pz) - k.r < this.view;
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

  nearestHum(player) {
    let best = null, bd = Infinity;
    for (const h of this.hums) {
      const d = Math.hypot(h.x - player.pos.x, h.z - player.pos.z);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return [best, bd];
  }

  // A generator fails: a whole section goes dark for a while.
  updateBlackout(dt, player) {
    const { ctx, layout } = this;
    const b = this.blackout;
    const sec = b && layout.sections[b.section];
    const rebake = (s) => this.world.bakeLightmap({ x0: s.x0 - 10, z0: s.z0 - 10, x1: s.x1 + 10, z1: s.z1 + 10 });
    if (!b) {
      this.nextBlackout -= dt;
      if (this.nextBlackout > 0) return;
      let s = this.here.section;
      if (!this.rng.chance(0.6)) {
        const sn = Math.round(Math.sqrt(layout.sections.length));
        const nx = (s % sn) + this.rng.int(-1, 1), ny = Math.floor(s / sn) + this.rng.int(-1, 1);
        if (nx >= 0 && ny >= 0 && nx < sn && ny < sn) s = ny * sn + nx;
      }
      const lights = layout.lights.map((l, i) => (l.section === s && l.state !== 'off' && l.type !== 'candle' && l.type !== 'none' ? i : -1)).filter((i) => i >= 0);
      if (!lights.length) {
        this.nextBlackout = 12;
        return;
      }
      this.blackout = { phase: 'warn', t: 0, section: s, lights, dark: this.rng.range(16, 30) };
      const [h, hd] = this.nearestHum(player);
      if (h) ctx.audio.powerDown(this.panTo(player, h.x, h.z), Math.max(0.08, 0.4 - hd / 80));
      return;
    }
    b.t += dt;
    if (b.phase === 'warn') {
      for (const i of b.lights) this.fixtures.set(i, Math.max(0, 1 - b.t / 2.6) * (Math.random() < 0.7 ? 1 : 0.3));
      if (b.t > 2.6) {
        b.phase = 'dark';
        b.t = 0;
        this.secDark[b.section] = 1;
        b.saved = b.lights.map((i) => layout.lights[i].state);
        for (const i of b.lights) {
          layout.lights[i].state = 'off';
          this.fixtures.set(i, 0);
        }
        rebake(sec);
      }
    } else if (b.phase === 'dark') {
      if (b.t > b.dark) {
        b.phase = 'restore';
        b.t = 0;
        b.lights.forEach((i, k) => (layout.lights[i].state = b.saved[k]));
        this.secDark[b.section] = 0;
        rebake(sec);
        ctx.audio.flickerBuzz(1.2, 0.08);
      }
    } else {
      for (const i of b.lights) {
        const l = layout.lights[i];
        if (l.state === 'on') this.fixtures.set(i, b.t > 1 || Math.random() < 0.6 ? 1 : 0.1);
      }
      if (b.t > 1.2) {
        this.blackout = null;
        this.nextBlackout = this.rng.range(55, 100);
      }
    }
  }

  // Now and then a light near you bursts.
  updateShatter(dt, player) {
    this.nextShatter -= dt;
    if (this.nextShatter > 0) return;
    this.nextShatter = this.rng.range(35, 75);
    const cands = [];
    for (const [i, d] of this.world.lightsNear(player.pos.x, player.pos.z, 14)) {
      const l = this.layout.lights[i];
      if (d < 4 || l.state !== 'on' || l.type === 'candle' || l.type === 'none' || l.room >= 0) continue;
      cands.push(i);
    }
    if (!cands.length) return;
    const i = this.rng.pick(cands);
    const l = this.layout.lights[i];
    l.state = 'off';
    this.fixtures.set(i, 0);
    if (l.type === 'tube') {
      const m = new THREE.Matrix4().makeScale(0, 0, 0);
      l.inst.mesh.setMatrixAt(l.inst.k, m);
      l.inst.mesh.instanceMatrix.needsUpdate = true;
    }
    this.emitSparks([l.x, l.glowY, l.z], 26);
    this.flash = { x: l.x, y: l.glowY, z: l.z, t: 0.18, color: [1, 0.9, 0.7] };
    this.ctx.audio.shatter(this.panTo(player, l.x, l.z), 0.45);
    this.world.bakeLightmap({ x0: l.x - 10, z0: l.z - 10, x1: l.x + 10, z1: l.z + 10 });
  }

  updateLights(dt, player) {
    const { shared, layout } = this;
    shared.globalLight.value = 1;
    const cands = this.fixtures.flicker(this.time, player.pos.x, player.pos.z, (i) => this.secDark[layout.lights[i].section]);
    // Candlelight in the Sanctums.
    for (const c of this.candles) {
      const d = Math.hypot(c[0] - player.pos.x, c[2] - player.pos.z);
      if (d > 12) continue;
      cands.push({ d: d + 2, x: c[0], y: c[1] + 0.05, z: c[2], power: 0.35 + Math.sin(this.time * 9 + c[0]) * 0.06 + Math.random() * 0.05, color: [1, 0.55, 0.25] });
    }
    // Furnace glow.
    for (const h of this.heats) {
      const d = Math.hypot(h[0] - player.pos.x, h[2] - player.pos.z);
      if (d < 12) cands.push({ d, x: h[0], y: 0.5, z: h[2], power: 0.6 + Math.sin(this.time * 5 + h[0]) * 0.12, color: [1, 0.45, 0.12] });
    }
    // The back door's red lamp.
    const bd = this.backDoor;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 2.2));
    bd.lamp.material.color.setRGB(0.35 + 0.65 * pulse, 0.05, 0.03);
    const dd = Math.hypot(bd.x - player.pos.x, bd.z - player.pos.z);
    if (dd < 12) cands.push({ d: dd, x: bd.x + bd.nx * 0.5, y: 2.2, z: bd.z + bd.nz * 0.5, power: 0.8 * pulse, color: [1, 0.1, 0.04] });
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
      else cands.push({ d: -1, x: this.flash.x, y: this.flash.y, z: this.flash.z, power: 2.5, color: this.flash.color });
    }
    for (const m of this.furnaceMats) m.color.setRGB(1, 0.42 + Math.sin(this.time * 7) * 0.08, 0.1);
    const nearest = applyDynamicLights(shared, cands, MAX_DYN_LIGHTS);
    this.buzzTimer -= dt;
    if (nearest < 6 && nearest >= 0 && this.buzzTimer <= 0) {
      this.ctx.audio.flickerBuzz(1.1, 0.07 * (1 - nearest / 6));
      this.buzzTimer = 1.1;
    }
  }

  updateMachines(dt, player) {
    // Belts and what's riding them.
    this.beltTex.offset.x -= dt * 0.6 / 0.5;
    for (const b of this.belts) {
      for (const it of b.items) {
        const x = ((it.off + this.time * 0.6) % b.len) - b.len / 2;
        const [wx, , wz] = this.dresser.at(b.f, x, 0, 0);
        it.m.position.set(wx, b.top + it.h, wz);
        it.m.rotation.y = b.f.rot;
        it.m.visible = Math.hypot(wx - player.pos.x, wz - player.pos.z) < 40;
      }
    }
    // Presses: slow lift, hard drop.
    for (const p of this.presses) {
      const t = (this.time + p.phase) % 3.2;
      const y = t < 2.6 ? 1.15 + Math.min(1, t / 2.0) * 0.85 : 2.0 - ((t - 2.6) / 0.6) ** 3 * 0.85;
      p.m.position.y = y;
      if (t < p.last) {
        const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
        if (d < 30) this.ctx.audio.clank(this.panTo(player, p.x, p.z), 0.3 * (1 - d / 30));
      }
      p.last = t;
    }
    // Output bins produce supplies, again and again.
    for (const b of this.bins) {
      const d = Math.hypot(b.x - player.pos.x, b.z - player.pos.z);
      if (!b.item) {
        b.next -= dt;
        if (b.next <= 0 && d > 5) {
          const kind = this.rng.pick(['water', 'water', 'battery', 'aid']);
          const geo = kind === 'water' ? new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8) : new THREE.BoxGeometry(0.2, kind === 'aid' ? 0.12 : 0.08, 0.14);
          this.ownGeos.push(geo);
          const m = new THREE.Mesh(geo, kind === 'water' ? this.mats.bottle : kind === 'aid' ? this.mats.enamel : this.mats.yellow);
          m.position.set(b.x, 0.12, b.z);
          this.props.add(m);
          b.item = { kind, m };
        }
      } else if (d < 1.1) {
        if (!this.pickup(b.item.kind, player)) continue;
        this.props.remove(b.item.m);
        b.item = null;
        b.next = this.rng.range(45, 80);
      }
    }
    this.staticTex.update();
    // Base Gamma's radio, still tuned to nothing.
    for (const r of this.radios) {
      r.next -= dt;
      if (r.next > 0) continue;
      r.next = this.rng.range(4, 9);
      const d = Math.hypot(r.x - player.pos.x, r.z - player.pos.z);
      if (d < 10) this.ctx.audio.staticBurst(0.5, 0.12 * (1 - d / 10));
    }
  }

  // Into the backpack; false if there's no room.
  pickup(kind, player) {
    const { ctx } = this;
    const id = kind === 'aid' ? 'medkit' : kind;
    if (!player.give(id)) return false;
    ctx.hud.message({
      water: 'Almond Water, fresh off the line.', battery: 'Batteries.', medkit: 'A first aid kit.', pipe: 'A lead pipe.', flare: 'A road flare.',
    }[id], 2.5);
    ctx.audio.pickup();
    return true;
  }

  updateHazards(dt, player) {
    const { ctx } = this;
    // Live wires and switchgear spark; get too close and they bite.
    for (const s of this.sparkers) {
      s.next -= dt;
      if (s.next > 0) continue;
      s.next = this.rng.range(...s.rate);
      const d = Math.hypot(s.pos[0] - player.pos.x, s.pos[2] - player.pos.z);
      if (d > 30) continue;
      this.emitSparks(s.pos, 14);
      if (!this.flash) this.flash = { x: s.pos[0], y: s.pos[1], z: s.pos[2], t: 0.12, color: [0.7, 0.8, 1] };
      ctx.audio.arc(this.panTo(player, s.pos[0], s.pos[2]), Math.max(0.03, 0.3 * (1 - d / 30)));
      if (d < 0.9 && player.pos.y > -0.5) {
        player.damage(12);
        this.lastHurt = 'You touched the wrong wire.';
        ctx.hurtFlash(0.6);
        ctx.vibrate([60, 20, 60]);
        ctx.audio.hurt();
      }
    }
    // Black drips into the puddles.
    for (const p of this.puddles) {
      p.next -= dt;
      if (p.next > 0) continue;
      p.next = this.rng.range(1.2, 3);
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d > 20) continue;
      const i = this.dripNext;
      this.dripNext = (this.dripNext + 1) % 30;
      this.dripPos.set([p.x, CEIL.CORR - 0.15, p.z], i * 3);
      this.dripVel[i] = 0;
      if (d < 10) ctx.audio.drip(this.panTo(player, p.x, p.z), 0.12 * (1 - d / 10));
      if (d < 3 && this.rng.chance(0.25)) ctx.audio.gurgle(this.panTo(player, p.x, p.z), 0.1);
    }
    for (let i = 0; i < 30; i++) {
      if (this.dripPos[i * 3 + 1] < -10) continue;
      this.dripVel[i] += 9.8 * dt;
      this.dripPos[i * 3 + 1] -= this.dripVel[i] * dt;
      if (this.dripPos[i * 3 + 1] < 0) this.dripPos[i * 3 + 1] = -50;
    }
    this.dripGeo.attributes.position.needsUpdate = true;
    // Purple discoloration gets into your head.
    let k = 0;
    for (const z of this.purpleZones) k = Math.max(k, 1 - Math.hypot(z.x - player.pos.x, z.z - player.pos.z) / 3.2);
    this.purpleK += (Math.max(0, k) - this.purpleK) * Math.min(1, dt * 2);
    if (this.purpleK > 0.3 && this.rng.chance(dt * 0.4)) ctx.audio.whisper(this.rng.range(-1, 1), 0.18);
    // Heat from the boilers.
    let heat = 0;
    for (const h of this.heats) heat = Math.max(heat, 1 - Math.hypot(h[0] - player.pos.x, h[2] - player.pos.z) / 7);
    this.heat += (Math.max(0, heat) - this.heat) * Math.min(1, dt * 1.5);
    // Sight glasses: the black fluid moves.
    this.textures.fluid.offset.y -= dt * 0.35;
  }

  updateParticles(dt) {
    for (let i = 0; i < this.pN; i++) {
      const o = i * 3;
      if (this.pLife[i] <= 0) {
        this.pCol[o] = this.pCol[o + 1] = this.pCol[o + 2] = 0;
        continue;
      }
      this.pLife[i] -= dt;
      this.pVel[o + 1] -= 9.8 * dt;
      this.pPos[o] += this.pVel[o] * dt;
      this.pPos[o + 1] = Math.max(0.01, this.pPos[o + 1] + this.pVel[o + 1] * dt);
      this.pPos[o + 2] += this.pVel[o + 2] * dt;
      const k = Math.max(0, this.pLife[i]) * 2;
      this.pCol[o] = k;
      this.pCol[o + 1] = k * 0.8;
      this.pCol[o + 2] = k * 0.45;
    }
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
  }

  // Behind the bars: something stands and watches, then isn't there.
  updateShadow(dt, player) {
    const s = this.shadow;
    if (s.active) {
      s.t -= dt;
      const d = Math.hypot(s.g.position.x - player.pos.x, s.g.position.z - player.pos.z);
      s.g.rotation.y = Math.atan2(player.pos.x - s.g.position.x, player.pos.z - s.g.position.z);
      const fade = s.t < 0.5 || d < 3 ? -1 : 1;
      s.mat.opacity = Math.max(0, Math.min(0.88, s.mat.opacity + fade * dt * 2));
      if ((s.t <= 0 || d < 3) && s.mat.opacity <= 0.01) {
        s.active = false;
        s.g.visible = false;
      }
      return;
    }
    this.nextShadow -= dt;
    if (this.nextShadow > 0) return;
    this.nextShadow = this.rng.range(14, 30);
    for (const g of this.galleries) {
      const spot = this.rng.pick(g.spots);
      const d = Math.hypot(spot[0] - player.pos.x, spot[2] - player.pos.z);
      if (d < 4 || d > 13 || !this.map.hasLineOfSight(player.pos.x, player.pos.z, spot[0], spot[2])) continue;
      s.g.position.set(spot[0], 0, spot[2]);
      s.g.visible = true;
      s.active = true;
      s.t = this.rng.range(3, 6);
      s.mat.opacity = 0;
      player.sanity = Math.max(0, player.sanity - 3);
      this.ctx.audio.whisper(this.panTo(player, spot[0], spot[2]), 0.22);
      return;
    }
  }

  updateCrates(player) {
    for (const c of this.crates) {
      if (c.opened || Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 1.3) continue;
      // A crate stays shut until there's room in the backpack.
      if (!player.canCarry()) {
        player.onFull?.();
        continue;
      }
      c.opened = true;
      c.lid.position.set(c.size * 0.3, c.size * 0.8 + 0.1, c.size * 0.45);
      c.lid.rotation.set(0.5, 0.3, 0.2);
      const inside = new THREE.Mesh(this.lidGeo, this.innerMat);
      inside.scale.set(c.size * 0.9, 1, c.size * 0.9);
      inside.position.y = c.size * 0.8 - 0.03;
      c.group.add(inside);
      this.loot(player);
    }
  }

  loot(player) {
    const { ctx, rng } = this;
    const table = [['water', 30], ['battery', 25], ['aid', 20], ['pipe', 10], ['flare', 8], ['junk', 16], ['shock', 7]];
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
    if (pick === 'junk') ctx.hud.message(`A crate: ${rng.pick(JUNK)}`, 3);
    else if (pick === 'shock') {
      player.damage(10);
      this.lastHurt = 'A live wire, packed in a crate.';
      ctx.hurtFlash(0.4);
      ctx.audio.arc(0, 0.4);
      ctx.hud.message('A crate: a bare wire inside it, live.', 3);
    } else this.pickup(pick, player);
  }

  updateAmbient(dt, player) {
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = this.rng.range(1.6, 4.5);
    if (this.here.safe === 'sanctum') return; // silence in there
    const pan = this.rng.range(-1, 1);
    const r = this.rng.next();
    const a = this.ctx.audio;
    if (r < 0.25) a.arc(pan, this.rng.range(0.03, 0.09));
    else if (r < 0.42) a.clank(pan, this.rng.range(0.04, 0.11));
    else if (r < 0.56) a.pipeKnock(pan, this.rng.range(0.05, 0.14));
    else if (r < 0.66) a.gurgle(pan, 0.08);
    else if (r < 0.74) a.creak(pan, 0.12);
    else if (r < 0.8) a.steam(pan, 0.05);
    else if (r < 0.88 && player.sanity < 60) a.whisper(pan, 0.14);
    else if (r < 0.94) a.phantomSteps(pan * 0.7);
    else a.voice(pan, 0.08);
    // The lifts bell now and then.
    for (const l of this.lifts) {
      const d = Math.hypot(l.cx - player.pos.x, l.cz - player.pos.z);
      if (d < 22 && this.rng.chance(0.25)) a.bell(this.panTo(player, l.cx, l.cz), 0.12 * (1 - d / 22));
    }
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + BOTTLE_SANITY);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame -------------------------------------------

  audioMix(player) {
    const px = player.pos.x, pz = player.pos.z;
    const sanct = this.here?.safe === 'sanctum';
    let hum = 0.03;
    for (const [i, d] of this.world.lightsNear(px, pz, 5)) {
      const l = this.layout.lights[i];
      if (l.type === 'tube' && (l.level || 0) > 0.5) hum = Math.max(hum, 0.065 * (1 - d / 5));
    }
    let machine = 0, machinePan = 0;
    for (const m of this.hums) {
      const d = Math.hypot(m.x - px, m.z - pz);
      if (d > 30) continue;
      const walls = this.map.wallsBetween(px, pz, m.x, m.z, 3);
      const g = (0.4 * m.loud / (1 + (d / 5) ** 2)) * Math.pow(0.55, walls);
      if (g > machine) {
        machine = g;
        machinePan = this.panTo(player, m.x, m.z);
      }
    }
    let exitGain = 0, exitPan = 0;
    for (const l of this.lifts) {
      const d = Math.hypot(l.cx - px, l.cz - pz);
      if (d > 24) continue;
      const walls = this.map.wallsBetween(px, pz, l.cx, l.cz, 3);
      const g = (0.28 / (1 + (d / 5) ** 2)) * Math.pow(0.55, walls);
      if (g > exitGain) {
        exitGain = g;
        exitPan = this.panTo(player, l.cx, l.cz);
      }
    }
    let drone = 0;
    for (const e of this.entities.list) {
      if (!['chase', 'hunt', 'attack', 'reveal'].includes(e.state)) continue;
      drone = Math.max(drone, 0.3 * Math.max(0, 1 - e.distTo(player) / 25));
    }
    const k = sanct ? 0.15 : 1;
    return { hum: hum * k, exitGain, exitPan, exitType: 'hum', drone, machine: machine * k, machinePan, sanity: player.sanity, ears: player.coveringEars };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const target = new THREE.Color(0.012 + r * 0.32, 0.009 + g * 0.27, 0.006 + b * 0.22);
    target.lerp(new THREE.Color(0.22, 0.06, 0.3), this.purpleK * 0.6);
    target.lerp(new THREE.Color(0.3, 0.12, 0.03), this.heat * 0.3);
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const lum = (r + g + b) / 3;
    this.lum += (lum - this.lum) * Math.min(1, dt * 3);
    const dens = 0.04 + (1 - Math.min(1, this.lum * 2.2)) * 0.035 + this.heat * 0.01;
    this.fogDensity += (dens - this.fogDensity) * Math.min(1, dt * 2);
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    let shake = 0;
    for (const e of this.entities.list) {
      if (e.type === 'hound' && (e.state === 'chase' || e.state === 'attack')) shake = Math.max(shake, 0.5 - e.distTo(player) / 20);
    }
    if (this.lift?.moving) shake = Math.max(shake, 0.35);
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      // The air is hot: everything shimmers a little, near the boilers a lot.
      warp: 0.12 + this.heat * 0.55 + insanity * insanity * 1.2 + hurt * 0.3 + this.purpleK * 0.8,
      aberr: 0.35 + insanity * 1.4 + hurt * 1.2 + this.purpleK * 1.5,
      grain: 0.06 + insanity * 0.06 + (this.lum < 0.12 ? 0.05 : 0),
      shake: Math.max(0, shake),
    };
  }

  hudInfo() {
    return { warn: null, warnCovered: null, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    this.world.dispose();
    this.entities.dispose();
    this.fixtures.dispose();
    for (const g of this.ownGeos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    disposeTextures(this.textures);
  }
}

function cs(map) {
  return map.cellSize;
}

function mulberry(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A painted M.E.G. arrow (points along +v).
function arrowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#56544e';
  ctx.fillRect(0, 0, 64, 96);
  ctx.fillStyle = '#d8b018';
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(58, 40);
  ctx.lineTo(42, 40);
  ctx.lineTo(42, 90);
  ctx.lineTo(22, 90);
  ctx.lineTo(22, 40);
  ctx.lineTo(6, 40);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(60,58,52,${(Math.random() * 0.6).toFixed(2)})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 96, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

// Animated static for the gallery television.
function staticTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const img = ctx.createImageData(64, 48);
  let frame = 0;
  return {
    tex,
    update() {
      if (frame++ % 3) return;
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      tex.needsUpdate = true;
    },
  };
}

export const LEVEL3 = {
  id: 'level3',
  number: 3,
  name: 'Level 3',
  title: 'Electrical Station',
  difficulty: 4,
  next: 'level4',
  create: (ctx) => new Level3(ctx),
};
