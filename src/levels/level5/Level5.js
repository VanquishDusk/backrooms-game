import * as THREE from 'three';
import { GridWorld } from '../../world/GridWorld.js';
import { DIRS, EDGE_WALL } from '../../world/GridMap.js';
import { SURFACE, MAX_DYN_LIGHTS, createWorldMaterial } from '../../world/materials.js';
import {
  ochrePlasterTexture, paintedBeamTexture, hotelFriezeTexture, redMarbleTexture, goldRopeTexture, creamStoneTexture,
  damaskWallTexture, hotelCarpetTexture, medallionRugTexture, sageCarpetTexture, parquetTexture, mahoganyTexture,
  stripedFabricTexture, guestDoorTexture, mahjongTexture, boilerPaintTexture, catwalkTexture, whiteLagTexture,
  dirtyConcreteTexture, hotelPaintingsTexture, level5SignTexture, doorDigitsTexture, elevatorDialTexture,
  clockFaceTexture, elevatorDoorTexture, plasterTexture, unevenBrickTexture, pipeTexture, metalTexture, solidTexture, gaugeTexture,
  crateTexture, brushedSteelTexture, concreteCeilingTexture, woodTexture, utilityDoorTexture,
} from '../../world/textures.js';
import { disposeTextures } from '../../world/props.js';
import { ChunkedBuilders } from '../../world/tubes.js';
import { Dresser, blockFurnishedSteps } from '../../world/dresser.js';
import { Fixtures, applyDynamicLights, glowTexture } from '../../world/fixtures.js';
import { planServices, buildServices } from '../../world/services.js';
import { EntityManager } from '../../entities/lib/index.js';
import { generateLevel5, ZONE, CEIL, inHotel } from './generate.js';
import {
  faceFrame, edgeFrame, lobby, homely, housekeeping, ballroom, guestRoom, guestDoor, lanternSconce, painting,
  sideTable, serviceCart, sign, beamX,
} from './hotel.js';
import {
  BOILER_PROFILES, pickBoilerProfile, passageRuns, boilerHall, tankRoom, pumpRoom, gallery, furnaceRoom, waterTap, debris,
} from './boiler.js';
import { scatterItems } from '../../world/scatter.js';

// Level 5 — "Terror Hotel".
//
//  - The Main Hall: an endless 1920s hotel. Carpeted corridors of locked,
//    numbered rooms under brass lantern sconces; lobbies of crimson marble
//    columns, beamed ochre ceilings and iron chandeliers; the Homely Hotel's
//    dining room (food, and a cat who trades secrets for meat); M.E.G.
//    Housekeeping
//  - The Beverly Room, the Eternal Ballroom: the band is gone, the music isn't
//  - The Boiler Room: lagged pipes, catwalks over machinery pits, Almond
//    Water in the pipes. The deeper in, the hotter, until the stairs by the
//    furnace go down to Level 6
//  - Exits: the grand stair back up to Level 4; the elevators (floors 1-12
//    are other parts of the hotel, one goes down to Level 3, nobody comes
//    back from 13); the maintenance lift (don't); a dark wooden door among
//    the guest rooms (Level 9); the furnace stairs (Level 6)
//  - Deathmoths everywhere, and much worse

const T = 0.08;
const VIEW = 46;
const BOTTLE_SANITY = 30;
const WALL_TEX = { wall: [1 / 2, 1 / 3.4], stone: 1 / 2.2, brick: 1 / 1.6 };
const STYLE_RANK = { wall: 0, stone: 1, brick: 2 };
const NOTES = {
  meg: '"M.E.G. HOUSEKEEPING — LEVEL 5. Take what you need. The stairs in the big lobby go back up to 4. The lifts: 1 to 12 are other parts of this place; one of them goes down to 3. NEVER ride to 13. Do not use the maintenance lift. The boiler pipes carry Almond Water — the taps are marked. It gets hotter the deeper you go down there; past the furnace is Level 6."',
  originals: [
    '"To whoever has the room after us: we are The Originals, and we were here before the hotel had a name. Keep the music playing. It keeps them dancing instead of looking for you."',
    '"A letter, signed The Originals: the Beverly Room never closes. If you see the band, do not applaud."',
    '"Room service will knock. Do not answer. — The Originals"',
  ],
  homely: '"HOMELY HOTEL — All guests welcome. Take a plate. If the cat asks you for meat, give it to her, and listen. — The management"',
};

export class Level5 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel5(rng.fork('layout'));
    this.layout = layout;
    const { map, zone, roomOf, rooms, ceil } = layout;
    this.map = map;
    const cs = map.cellSize;
    const drng = rng.fork('dress');
    this.drng = drng;

    this.props = new THREE.Group();
    scene.add(this.props);
    this.ownGeos = [];
    this.ownMats = [];
    this.textures = { solids: {}, rugs: [] };
    this.cb = new ChunkedBuilders(cs * 6);
    const solid = [];
    this.solid = solid;
    const D = new Dresser({ cb: this.cb, rng: drng.fork('rooms'), map, solid, lights: layout.lights, group: this.props, ownGeos: this.ownGeos, ceilOf: (r) => r.ceil ?? CEIL.ROOM });
    this.dresser = D;
    const doorsOf = (room) => {
      const out = [];
      for (const [x, y] of room.cells) {
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (!map.inBounds(nx, ny) || roomOf[map.idx(nx, ny)] === room.id) continue;
          if (map.getEdge(map.edge(x, y, d)) !== EDGE_WALL) out.push({ x, y, d });
        }
      }
      return out;
    };
    this.dctx = { map, rng: drng.fork('hotel'), layout, lights: layout.lights, doorsOf, rugIndex: 0 };

    // ---- Doorways (fills and headers go in first: they're solid) ----------------
    this.slabs = [];
    this.planDoorways();

    // ---- Rooms -------------------------------------------------------------------------
    this.bells = [];
    this.ticks = [];
    this.food = [];
    this.notes = [];
    this.crateSpots = [];
    this.frontDoors = [];
    this.rugs = [];
    this.taps = [];
    this.stage = null;
    this.fires = [];
    for (const r of rooms) {
      if (!r.cells.length) continue;
      let out = null;
      if (r.kind === 'grand' || r.kind === 'lounge') out = lobby(D, r, this.dctx);
      else if (r.kind === 'homely') out = homely(D, r, this.dctx);
      else if (r.kind === 'ballroom') out = ballroom(D, r, this.dctx);
      else if (r.kind === 'housekeeping') out = housekeeping(D, r, this.dctx);
      else if (r.kind === 'guest' && r.state === 'open') out = guestRoom(D, r, this.dctx);
      else if (r.kind === 'boiler') out = boilerHall(D, r, this.dctx);
      else if (r.kind === 'tanks') out = tankRoom(D, r, this.dctx);
      else if (r.kind === 'pumps') out = pumpRoom(D, r, this.dctx);
      else if (r.kind === 'gallery') out = gallery(D, r, this.dctx);
      else if (r.kind === 'furnace') out = furnaceRoom(D, r, this.dctx);
      if (!out) continue;
      if (out.rug) {
        this.rugs.push({ ...out.rug, index: this.dctx.rugIndex });
        this.dctx.rugIndex++;
      }
      this.bells.push(...(out.bells || []));
      this.ticks.push(...(out.ticks || []));
      if (out.frontDoor) this.frontDoors.push(out.frontDoor);
      if (out.stage) this.stage = out.stage;
      for (const f of out.food || []) this.food.push(f);
      for (const c of out.crates || []) this.crateSpots.push(c);
      if (out.note) this.notes.push({ ...out.note, text: NOTES.meg, read: false });
      if (out.stair) this.furnaceStair = out.stair;
      for (const f of out.fire || []) this.fires.push(f);
      if (r.kind === 'homely' && r.cells.length) {
        const [cx, cz] = map.cellCenter(...r.cells[Math.floor(r.cells.length / 2)]);
        this.notes.push({ x: cx, z: cz, text: NOTES.homely, read: false, r: 2.2 });
      }
    }
    this.buildStair(D);
    this.planCorridors(D, drng.fork('corridors'));
    this.planBoilerPassages(D, drng.fork('boiler'));
    this.planElevators(D);
    this.buildSkins(D);

    // ---- Textures and the world --------------------------------------------------------
    const tx = this.textures;
    Object.assign(tx, {
      wall: damaskWallTexture(renderer),
      floor: hotelCarpetTexture(renderer),
      ceiling: plasterTexture(renderer, '#cdbf9c'),
      floors: {
        sage: { map: sageCarpetTexture(renderer), scale: 1 / 2 },
        parquet: { map: parquetTexture(renderer), scale: 1 / 1.6 },
        concrete: { map: dirtyConcreteTexture(renderer), scale: 1 / 2.5 },
        carFloor: { map: mahoganyTexture(renderer, '#3a1a0c'), scale: 1 / 1.2 },
        none: { map: null },
      },
      walls: {
        stone: { map: creamStoneTexture(renderer), scale: WALL_TEX.stone },
        brick: { map: unevenBrickTexture(renderer, 'red'), scale: WALL_TEX.brick },
        step: { map: null, scale: WALL_TEX.stone },
      },
      ceilings: {
        ochre: { map: ochrePlasterTexture(renderer), scale: 1 / 2.5, surface: SURFACE.PLAIN },
        soot: { map: concreteCeilingTexture(renderer), scale: 1 / 2.5 },
      },
    });
    tx.walls.step.map = tx.walls.stone.map;
    tx.floors.none.map = tx.floor;
    shared.ceilH.value = CEIL.CORR;
    const galleryCell = (i) => zone[i] === ZONE.BROOM && rooms[roomOf[i]].kind === 'gallery';
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      extraBoxes: solid.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 })),
      textures: tx,
      shared,
      texScale: { wall: WALL_TEX.wall, floor: 1 / 2.2, ceiling: 1 / 2.4 },
      panelSize: [0.1, 0.1],
      ceilingAt: (x, y) => ceil[map.idx(x, y)],
      ceilingStyle: (x, y) => {
        const z = zone[map.idx(x, y)];
        return z === ZONE.LOBBY || z === ZONE.STAIR || z === ZONE.BALL ? 'ochre' : z === ZONE.BCORR || z === ZONE.BROOM ? 'soot' : 'ceiling';
      },
      floorStyle: (x, y) => {
        const i = map.idx(x, y);
        const z = zone[i];
        if (z === ZONE.LOBBY) return rooms[roomOf[i]].kind === 'homely' ? 'parquet' : 'sage';
        if (z === ZONE.STAIR) return 'sage';
        if (z === ZONE.BALL) return 'parquet';
        if (z === ZONE.ELEV) return 'carFloor';
        if (z === ZONE.BCORR || z === ZONE.VOID) return 'concrete';
        if (z === ZONE.BROOM) return galleryCell(i) ? 'none' : 'concrete';
        return 'floor';
      },
      wallStyle: (e) => this.edgeStyle(e),
      dampAt: () => 0,
    });
    this.world.materials.none.visible = false;
    scene.add(this.world.group);
    this.world.groundAt = (x, z) => this.groundAt(x, z);

    // ---- Materials -----------------------------------------------------------------------
    const lit = (tex, scale = 1) => {
      const m = createWorldMaterial(shared, tex, SURFACE.PLAIN, scale);
      this.ownMats.push(m);
      return m;
    };
    const solidTex = (hex, n = 0.06) => (tx.solids[hex] ||= solidTexture(renderer, hex, n));
    const basic = (opts) => {
      const m = new THREE.MeshBasicMaterial(opts);
      this.ownMats.push(m);
      return m;
    };
    const W = this.world.materials;
    tx.marble = redMarbleTexture(renderer);
    tx.rope = goldRopeTexture(renderer);
    tx.beam = paintedBeamTexture(renderer);
    tx.frieze = hotelFriezeTexture(renderer);
    tx.mahogany = mahoganyTexture(renderer);
    tx.darkwood = mahoganyTexture(renderer, '#2a120a');
    tx.fabric = stripedFabricTexture(renderer);
    tx.door = guestDoorTexture(renderer);
    tx.doorDark = guestDoorTexture(renderer, '#120806');
    tx.mahjong = mahjongTexture(renderer);
    tx.boilerBlue = boilerPaintTexture(renderer, '#5e7480');
    tx.boilerDark = boilerPaintTexture(renderer, '#3a4448');
    tx.tankGreen = boilerPaintTexture(renderer, '#3e6a4a');
    tx.tankYellow = boilerPaintTexture(renderer, '#b89a30');
    tx.catwalk = catwalkTexture(renderer);
    tx.lag = whiteLagTexture(renderer);
    tx.paintings = hotelPaintingsTexture(renderer);
    tx.signs = level5SignTexture(renderer);
    tx.digits = doorDigitsTexture(renderer);
    tx.dial = elevatorDialTexture(renderer);
    tx.clock = clockFaceTexture(renderer);
    tx.rust = pipeTexture(renderer, 'rust');
    tx.galv = pipeTexture(renderer, 'galv');
    tx.cable = pipeTexture(renderer, 'cable');
    tx.motor = pipeTexture(renderer, 'machine');
    tx.brass = metalTexture(renderer, 'brass');
    tx.iron = metalTexture(renderer, 'black');
    tx.gauge = gaugeTexture();
    tx.crate = crateTexture(renderer);
    tx.steel = brushedSteelTexture(renderer);
    tx.wood = woodTexture(renderer);
    tx.steelDoor = utilityDoorTexture(renderer, 'locked');
    tx.liftDoor = elevatorDoorTexture(renderer);
    tx.firebrick = unevenBrickTexture(renderer, 'dark');
    for (const r of this.rugs) tx.rugs.push(medallionRugTexture(renderer, r.w, r.h));
    this.mats = {
      wall: W.wall, stoneWall: W.stone, brickWall: W.brick, stone: W.stone, brick: W.brick,
      marble: lit(tx.marble, 1 / 1.4), gold: lit(solidTex('#b8903a', 0.12)), rope: lit(tx.rope, 1),
      beam: lit(tx.beam, 1), frieze: lit(tx.frieze, 1), iron: lit(tx.iron), brass: lit(tx.brass),
      wax: lit(solidTex('#e8dcc0', 0.04)), lanternGlass: basic({ color: 0xffc878 }), darkwood: lit(tx.darkwood, 1 / 0.8),
      mahogany: lit(tx.mahogany, 1 / 0.8), fabric: lit(tx.fabric, 1 / 0.6), enamel: lit(solidTex('#ecebe4', 0.03)),
      soil: lit(solidTex('#2a1e14', 0.2)), leaf: lit(solidTex('#3e5a28', 0.15)), petal: lit(solidTex('#f4f0ea', 0.03)),
      pot: lit(solidTex('#5a2a1a', 0.1)), trunk: lit(solidTex('#4a3a22', 0.15)), carpetRed: lit(tx.floor, 1 / 1.5),
      black: lit(solidTex('#121010', 0.04)), leather: lit(solidTex('#4a2a18', 0.12)), leatherTan: lit(solidTex('#8a6238', 0.1)),
      paintings: lit(tx.paintings, 1), shade: basic({ color: 0xe8c890 }), vase: lit(solidTex('#2a4a5a', 0.08)),
      clock: lit(tx.clock, 1), paper: lit(solidTex('#e6e0cc', 0.04)), chrome: lit(tx.steel),
      crystal: basic({ color: 0xfff4dc }), linen: lit(solidTex('#e8e2d2', 0.04)), bedspread: lit(solidTex('#7a1c1a', 0.12)),
      mirror: lit(solidTex('#4a5258', 0.08)), velvetSeat: lit(solidTex('#7a1820', 0.12)), velvet: lit(solidTex('#5a0e14', 0.14)),
      parquetDark: lit(tx.mahogany, 1 / 0.8), signs: lit(tx.signs, 1), woodBass: lit(solidTex('#7a3a14', 0.1)),
      drum: lit(solidTex('#d8d0c0', 0.05)), ivory: lit(solidTex('#ece4cc', 0.03)), plate: lit(solidTex('#f0ece4', 0.02)),
      punch: basic({ color: 0x8a2030 }), bottle: lit(solidTex('#1a3a22', 0.06)), felt: lit(solidTex('#1e5a32', 0.1)),
      mahjong: lit(tx.mahjong, 1), mahjongBack: lit(solidTex('#2a6a3a', 0.05)), meat: lit(solidTex('#8a3a28', 0.18)),
      steel: lit(solidTex('#5a5c5e', 0.06)), towel: lit(solidTex('#c8d0d8', 0.06)), olive: lit(solidTex('#4a5236', 0.1)),
      canvas: lit(solidTex('#8a8468', 0.08)), bottleBlue: lit(solidTex('#3a6aa0', 0.05)), enamelLamp: lit(solidTex('#2a4a3a', 0.05)),
      daylight: basic({ color: 0xfff2d6 }), digits: lit(tx.digits, 1), door: createWorldMaterial(shared, tx.door, SURFACE.PLAIN, [1, 1 / 2.2]),
      doorDark: createWorldMaterial(shared, tx.doorDark, SURFACE.PLAIN, [1, 1 / 2.2]), dial: lit(tx.dial, 1), bronze: lit(solidTex('#5a3e1c', 0.1)),
      panel: lit(solidTex('#1e2224', 0.05)), lag: lit(tx.lag, 1), galv: lit(tx.galv), rust: lit(tx.rust),
      yellow: lit(solidTex('#c8a024', 0.1)), red: lit(solidTex('#8a1a12', 0.08)), concrete: lit(tx.floors.concrete.map, 1 / 1.5),
      boilerBlue: lit(tx.boilerBlue, 1 / 1.6), boilerDark: lit(tx.boilerDark, 1 / 1.6), motor: lit(tx.motor),
      gauge: basic({ map: tx.gauge, color: 0xb8b4a8 }), tankGreen: lit(tx.tankGreen, 1 / 1.4), tankYellow: lit(tx.tankYellow, 1 / 1.4),
      brickDebris: lit(solidTex('#7a3a24', 0.15)), plank: lit(tx.wood, 1 / 1.5), rubble: lit(solidTex('#5a5248', 0.2)),
      oil: lit(solidTex('#141210', 0.1)), almond: basic({ color: 0xe8dcc0 }), pitFloor: lit(tx.floors.concrete.map, 1 / 2),
      catwalk: lit(tx.catwalk, 1 / 0.8), railing: lit(solidTex('#141414', 0.05)), firebrick: lit(tx.firebrick, 1 / 1.4),
      fire: basic({ color: 0xff7a20 }), coal: lit(solidTex('#141210', 0.2)), conduit: lit(tx.galv), cable: lit(tx.cable),
      strut: lit(tx.galv), ledge: lit(tx.floors.concrete.map, 1 / 1.5), duct: lit(tx.galv),
      housing: lit(solidTex('#2a2c2a', 0.05)), cage: lit(solidTex('#1a1a18', 0.05)), glass: lit(solidTex('#c8d0c8', 0.04)),
      crate: lit(tx.crate), steelDoor: createWorldMaterial(shared, tx.steelDoor, SURFACE.PLAIN, [1 / 1.0, 1 / 2.1]),
      officeLight: basic({ color: 0xe8f0ff }),
      skyGlow: basic({ color: 0xc4def8 }),
      liftDoor: lit(tx.liftDoor, 1),
    };
    this.ownMats.push(this.mats.door, this.mats.doorDark, this.mats.steelDoor);
    this.rugs.forEach((r, k) => {
      this.mats[`rug${r.index}`] = createWorldMaterial(shared, tx.rugs[k], SURFACE.FLOOR, 1);
      this.ownMats.push(this.mats[`rug${r.index}`]);
    });
    this.mats.fire.userData.base = new THREE.Color(0xff7a20);

    // ---- Lights: boiler room fixtures and the hotel's glowing bulbs -------------------
    this.boilerLights = layout.lights.filter((l) => l.type === 'bulb' || l.type === 'dome');
    this.fixtures = new Fixtures({ lights: this.boilerLights, cb: this.cb, group: this.props, rng: drng.fork('fixtures'), H: CEIL.BCORR });
    for (const s of layout.sconces) {
      const f = { x: s.x, z: s.z, rot: Math.atan2(s.n[0], s.n[1]) };
      const p = lanternSconce(D, f, 2.1);
      Object.assign(layout.lights[s.li], { bulbs: [p], glowY: p[1] });
    }
    const before = this.props.children.length;
    this.ownGeos.push(...this.cb.finish(this.props, this.mats));
    this.chunkMeshes = this.props.children.slice(before).map((m) => ({ m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius }));
    this.buildGlows();
    this.buildRuntimeParts();
    this.buildCrates();

    const sp = layout.spawn;
    this.spawn = { x: sp.wx, z: sp.wz, yaw: layout.spawnYaw };
    blockFurnishedSteps(map, this.world, (i) => [ZONE.ROOM, ZONE.LOBBY, ZONE.BALL, ZONE.BROOM].includes(zone[i]), [sp.x, sp.y]);

    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('entities'), shared });
    this.spawnEntities();
    // Lead pipes lying about the boiler room; flares and a pipe in the corridors.
    const ir = rng.fork('items');
    scatterItems(ctx, this.world, ir, ['pipe', 'pipe', 'flare'], [sp.x, sp.y], { min: 20, max: 400, ok: (i) => zone[i] === ZONE.BCORR });
    scatterItems(ctx, this.world, ir, ['flare', 'flare', 'pipe'], [sp.x, sp.y], { min: 12, max: 150, ok: (i) => zone[i] === ZONE.CORR });

    this.time = 0;
    this.done = false;
    this.cullTimer = 0;
    this.nextAmbient = 4;
    this.tickTimer = 0;
    this.lum = 1;
    this.fogColor = new THREE.Color(0.3, 0.2, 0.12);
    this.fogDensity = 0.02;
    this.heat = 0;
    this.ceilNow = CEIL.CORR;
  }

  // ---- Styles -------------------------------------------------------------------------

  styleOf(x, y) {
    const { map, zone } = this.layout;
    if (!map.inBounds(x, y)) return null;
    const z = zone[map.idx(x, y)];
    if (z === ZONE.VOID) return null;
    if (z === ZONE.LOBBY || z === ZONE.STAIR || z === ZONE.BALL) return 'stone';
    if (z === ZONE.BCORR || z === ZONE.BROOM) return 'brick';
    return 'wall';
  }

  edgeSides(e) {
    return e.h ? [[e.x, e.y - 1], [e.x, e.y]] : [[e.x - 1, e.y], [e.x, e.y]];
  }

  edgeStyle(e) {
    let best = null;
    for (const [x, y] of this.edgeSides(e)) {
      const s = this.styleOf(x, y);
      if (s && (best == null || STYLE_RANK[s] > STYLE_RANK[best])) best = s;
    }
    return best || 'wall';
  }

  // ---- Doorways -------------------------------------------------------------------------

  // A wall slab with world-anchored UVs (so the wall textures line up):
  // local x0..x1, y0..y1, z0..z1 in frame o; faces as listed.
  slab(mat, o, x0, x1, y0, y1, z0, z1, faces = ['pz', 'nz', 'bottom', 'nx', 'px']) {
    const D = this.dresser;
    const P = (x, y, z) => D.at(o, x, y, z);
    const u = (x, z) => {
      const p = P(x, 0, z);
      return Math.abs(Math.cos(o.rot)) > 0.5 ? p[0] : p[2];
    };
    const q = (pts, n) => D.quad(mat, o, pts, n, pts.map(([x, y, z]) => [u(x, z), y]));
    if (faces.includes('pz')) q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    if (faces.includes('nz')) q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    if (faces.includes('bottom') && y0 > 0.01) D.quad(mat, o, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    if (faces.includes('nx')) D.quad(mat, o, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
    if (faces.includes('px')) D.quad(mat, o, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[z1, y0], [z0, y0], [z0, y1], [z1, y1]]);
  }

  // Fill an open edge down to a doorway of width w and height h. o on the
  // edge line with +z towards side B; each half takes its own side's wall.
  doorway(o, w, h, styleA, styleB, topA, topB) {
    const D = this.dresser;
    const cs = this.map.cellSize;
    const mat = (s) => (s === 'stone' ? 'stoneWall' : s === 'brick' ? 'brickWall' : 'wall');
    for (const [z0, z1, s, top] of [[-T, 0, styleA, topA], [0, T, styleB, topB]]) {
      const m = mat(s);
      this.slab(m, o, -cs / 2, -w / 2, 0, top, z0, z1, [z1 > 0 ? 'pz' : 'nz', 'px']);
      this.slab(m, o, w / 2, cs / 2, 0, top, z0, z1, [z1 > 0 ? 'pz' : 'nz', 'nx']);
      this.slab(m, o, -w / 2, w / 2, h, top, z0, z1, [z1 > 0 ? 'pz' : 'nz', 'bottom']);
    }
    D.solidRect(o, -cs / 2, -T, -w / 2, T);
    D.solidRect(o, w / 2, -T, cs / 2, T);
  }

  planDoorways() {
    const { map, rooms, ceil, guest, boilerLinks } = this.layout;
    const D = this.dresser;
    const ceilAt = (x, y) => ceil[map.idx(x, y)];
    this.leaves = [];
    // Open guest rooms and housekeeping: a 1 m door, swung into the room.
    const openDoors = guest.filter((r) => r.state === 'open').map((r) => ({ x: r.door.x, y: r.door.y, d: r.door.d, room: r }));
    for (const r of rooms) if (r.kind === 'housekeeping') for (const dd of r.doors) openDoors.push({ ...dd, room: r });
    for (const dd of openDoors) {
      const o = edgeFrame(map, dd.x, dd.y, dd.d); // +z: corridor
      const nx = dd.x + DIRS[dd.d][0], ny = dd.y + DIRS[dd.d][1];
      this.doorway(o, 1.0, 2.2, 'wall', 'wall', ceilAt(dd.x, dd.y), ceilAt(nx, ny));
      const hinge = D.sub(o, -0.5, -T, Math.PI / 2 - this.drng.range(-0.25, 0.3));
      D.box('door', hinge, 0.5, 1.1, -0.025, 1.0, 2.2, 0.045);
      D.cyl('brass', hinge, [0.88, 1.0, -0.1], [0.88, 1.0, 0.05], 0.026, 5, { caps: true });
    }
    // Ballroom doors: tall double doors, both leaves thrown open.
    const ball = this.layout.ball;
    for (const dd of ball.doors) {
      const o = edgeFrame(map, dd.x, dd.y, dd.d); // +z: corridor
      const nx = dd.x + DIRS[dd.d][0], ny = dd.y + DIRS[dd.d][1];
      this.doorway(o, 2.0, 2.9, 'stone', 'wall', ceilAt(dd.x, dd.y), ceilAt(nx, ny));
      for (const s of [-1, 1]) {
        const hinge = D.sub(o, s * 1.0, -T, -s * (Math.PI / 2 - this.drng.range(0.05, 0.3)));
        D.box('darkwood', hinge, -s * 0.5, 1.45, -0.03, 1.0, 2.9, 0.06);
        for (const y of [0.8, 2.0]) D.box('gold', hinge, -s * 0.5, y, -0.065, 0.6, 0.6, 0.01);
      }
      for (const s of [-1, 1]) D.box('gold', o, s * 1.06, 1.45, T + 0.02, 0.1, 2.9, 0.04);
      D.box('gold', o, 0, 2.96, T + 0.02, 2.2, 0.1, 0.04);
      sign(D, o, 1, 0, 3.17, 0.42, 0.105, T + 0.03);
    }
    // Service doors into the boiler room (from the corridors and the ballroom).
    for (const l of boilerLinks) {
      const o = edgeFrame(map, l.x, l.y, l.d); // +z: boiler side
      const hs = this.styleOf(l.x, l.y);
      const nx = l.x + DIRS[l.d][0], ny = l.y + DIRS[l.d][1];
      this.doorway(o, 1.1, 2.2, hs, 'brick', ceilAt(l.x, l.y), ceilAt(nx, ny));
      const hinge = D.sub(o, -0.55, T, -(Math.PI / 2 - this.drng.range(0.1, 0.5)));
      D.box('steelDoor', hinge, 0.53, 1.06, 0.025, 1.04, 2.12, 0.05);
      for (const s of [-1, 1]) D.box('steel', o, s * 0.6, 1.1, -T - 0.02, 0.08, 2.2, 0.04);
      D.box('steel', o, 0, 2.24, -T - 0.02, 1.28, 0.08, 0.04);
      sign(D, { ...o, rot: o.rot + Math.PI }, 2, 0, 2.6, 0.5, 0.125, T + 0.015);
    }
    // Openings between the boiler passages and the halls.
    for (const h of this.layout.halls) {
      if (h.kind === 'gallery') {
        for (const dd of h.doors) {
          const o = edgeFrame(map, dd.x, dd.y, dd.d);
          this.doorway(o, 1.4, 2.4, 'brick', 'brick', ceilAt(dd.x, dd.y), ceilAt(dd.x + DIRS[dd.d][0], dd.y + DIRS[dd.d][1]));
        }
        continue;
      }
      for (const dd of h.doors) {
        const o = edgeFrame(map, dd.x, dd.y, dd.d); // +z: passage
        this.doorway(o, 1.8, 2.6, 'brick', 'brick', ceilAt(dd.x, dd.y), ceilAt(dd.x + DIRS[dd.d][0], dd.y + DIRS[dd.d][1]));
        for (const s of [-1, 1]) D.box('steel', o, s * 0.95, 1.3, 0, 0.1, 2.6, 2 * T + 0.04);
        D.box('steel', o, 0, 2.65, 0, 2.0, 0.1, 2 * T + 0.04);
      }
    }
  }

  // ---- The grand stair up to Level 4 ------------------------------------------------------

  buildStair(D) {
    const st = this.layout.stair;
    if (!st) return;
    const { map } = this;
    const cs = map.cellSize;
    // Frame: on the lobby edge of the bay, +z up the stair.
    const inner = st.dir === 3 ? st.y + 2 : st.y;
    const ex = (st.x + 1) * cs, ez = st.dir === 3 ? (inner + 1) * cs : inner * cs;
    const o = { x: ex, z: ez, rot: Math.atan2(DIRS[st.dir][0], DIRS[st.dir][1]) };
    const W = 2 * cs - 2 * T, depth = 3 * cs - T;
    const z0 = 0.35, run = 5.6, rise = 3.4, steps = 19, land = depth;
    this.stairRamp = { o, z0, run, rise, W, depth };
    const sr = rise / steps, sd = run / steps;
    for (let k = 0; k < steps; k++) {
      const z = z0 + (k + 0.5) * sd, top = (k + 1) * sr;
      this.slab('stone', o, -W / 2, W / 2, 0, top, z - sd / 2, z + sd / 2, ['nz', 'nx', 'px']);
      D.quad('stone', o, [[-W / 2, top, z - sd / 2], [W / 2, top, z - sd / 2], [W / 2, top, z + sd / 2], [-W / 2, top, z + sd / 2]], [0, 1, 0], [[-W / 2, z - sd / 2], [W / 2, z - sd / 2], [W / 2, z + sd / 2], [-W / 2, z + sd / 2]]);
      // Red runner over the tread and riser, a brass rod in the angle.
      D.quad('carpetRed', o, [[-1.1, top + 0.004, z - sd / 2], [1.1, top + 0.004, z - sd / 2], [1.1, top + 0.004, z + sd / 2], [-1.1, top + 0.004, z + sd / 2]], [0, 1, 0], [[0, 0], [2.2, 0], [2.2, sd], [0, sd]]);
      D.quad('carpetRed', o, [[-1.1, top - sr, z - sd / 2 - 0.004], [1.1, top - sr, z - sd / 2 - 0.004], [1.1, top, z - sd / 2 - 0.004], [-1.1, top, z - sd / 2 - 0.004]], [0, 0, -1], [[0, 0], [2.2, 0], [2.2, sr], [0, sr]]);
      D.cyl('brass', o, [-1.15, top - sr + 0.02, z - sd / 2 - 0.01], [1.15, top - sr + 0.02, z - sd / 2 - 0.01], 0.012, 5);
    }
    // Landing.
    this.slab('stone', o, -W / 2, W / 2, 0, rise, z0 + run, land, ['nz']);
    D.quad('stone', o, [[-W / 2, rise, z0 + run], [W / 2, rise, z0 + run], [W / 2, rise, land], [-W / 2, rise, land]], [0, 1, 0], [[-W / 2, z0 + run], [W / 2, z0 + run], [W / 2, land], [-W / 2, land]]);
    D.quad('carpetRed', o, [[-1.1, rise + 0.004, z0 + run], [1.1, rise + 0.004, z0 + run], [1.1, rise + 0.004, land], [-1.1, rise + 0.004, land]], [0, 1, 0], [[0, 0], [2.2, 0], [2.2, land - z0 - run], [0, land - z0 - run]]);
    // Handrails on brackets along both walls; newel posts at the foot.
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.1);
      D.cyl('brass', o, [x, 0.95, z0], [x, rise + 0.95, z0 + run], 0.03, 6);
      D.cyl('brass', o, [x, rise + 0.95, z0 + run], [x, rise + 0.95, land - 0.2], 0.03, 6);
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        D.cyl('brass', o, [s * W / 2, rise * t + 0.95, z0 + run * t], [x, rise * t + 0.95, z0 + run * t], 0.012, 4);
      }
      const nw = D.sub(o, s * 1.5, 0.05, 0);
      D.box('darkwood', nw, 0, 0.6, 0, 0.26, 1.2, 0.26);
      D.box('gold', nw, 0, 1.22, 0, 0.3, 0.05, 0.3);
      D.ball('gold', nw, [0, 1.36, 0], 0.11, 8, 5);
      // A lantern on each side wall, halfway up.
      const f = { x: D.at(o, s * W / 2, 0, z0 + run * 0.5)[0], z: D.at(o, s * W / 2, 0, z0 + run * 0.5)[2], rot: o.rot - s * Math.PI / 2 };
      const p = lanternSconce(D, f, rise * 0.5 + 2.1);
      D.light({ x: p[0], z: p[2], power: 0.55, color: [1, 0.68, 0.38], hide: true, bulbs: [p], glowY: p[1], kind: 'sconce' });
    }
    // Beams over the bay.
    for (let z = 1.4; z < depth - 0.5; z += 1.4) beamX(D, 'beam', o, -W / 2, W / 2, z, CEIL.STAIR, 0.16, 0.24, 1.2);
    // The doors at the top: dark, heavy, one leaf ajar onto cold office light.
    const top = { x: D.at(o, 0, 0, land)[0], z: D.at(o, 0, 0, land)[2], rot: o.rot + Math.PI }; // +z back down the stair
    for (const s of [-1, 1]) D.box('darkwood', top, s * 1.05, rise + 1.4, 0.06, 0.18, 2.8, 0.12);
    D.box('darkwood', top, 0, rise + 2.86, 0.06, 2.3, 0.2, 0.12);
    D.box('gold', top, 0, rise + 2.74, 0.13, 2.0, 0.03, 0.02);
    D.box('darkwood', top, -0.48, rise + 1.3, 0.04, 0.94, 2.6, 0.06);
    for (const y of [0.7, 1.9]) D.box('gold', top, -0.48, rise + y, 0.075, 0.5, 0.5, 0.01);
    const leaf = D.sub(top, 0.96, 0.02, -0.55);
    D.box('darkwood', leaf, -0.47, rise + 1.3, 0.03, 0.94, 2.6, 0.06);
    D.quad('officeLight', top, [[0, rise, 0.01], [0.96, rise, 0.01], [0.96, rise + 2.6, 0.01], [0, rise + 2.6, 0.01]], [0, 0, 1]);
    const [lx, , lz] = D.at(o, 0.5, 0, land - 0.6);
    D.light({ x: lx, z: lz, power: 0.6, color: [0.82, 0.9, 1.0], hide: true, kind: 'office' });
    this.stairTop = { x: D.at(o, 0, 0, land - 0.5)[0], z: D.at(o, 0, 0, land - 0.5)[2] };
  }

  // Ground height (the grand stair and the furnace stair are ramps).
  groundAt(x, z) {
    const s = this.stairRamp;
    if (s) {
      const dx = x - s.o.x, dz = z - s.o.z;
      const lx = dx * Math.cos(s.o.rot) - dz * Math.sin(s.o.rot), lz = dx * Math.sin(s.o.rot) + dz * Math.cos(s.o.rot);
      if (lz > 0 && lz < s.depth + 0.2 && Math.abs(lx) < s.W / 2 + 0.2) return Math.max(0, Math.min(1, (lz - s.z0) / s.run)) * s.rise;
    }
    const f = this.furnaceStair;
    if (f) {
      const dx = x - f.o.x, dz = z - f.o.z;
      const lx = dx * Math.cos(f.o.rot) - dz * Math.sin(f.o.rot), lz = dx * Math.sin(f.o.rot) + dz * Math.cos(f.o.rot);
      if (lz > 0 && lz < f.len + 0.1 && Math.abs(lx) < f.sw / 2 + 0.05) return -Math.min(1, lz / f.len) * f.rise;
    }
    return 0;
  }

  // ---- Corridors ---------------------------------------------------------------------------

  planCorridors(D, rng) {
    const { map, zone, guest } = this.layout;
    // Guest room doors along the corridors; one of them is dark, and goes elsewhere.
    const far = guest.filter((r) => r.state === 'locked' && this.layout.spawnDist[map.idx(r.door.x + DIRS[r.door.d][0], r.door.y + DIRS[r.door.d][1])] > 18);
    this.darkDoor = far.length ? rng.pick(far) : null;
    // Rarer still: a plain metal door among the wooden ones, cold light under it (Level 63).
    const metal = rng.shuffle(far.filter((r) => r !== this.darkDoor)).slice(0, rng.chance(0.3) ? 2 : 1);
    this.metalDoors = [];
    this.letters = [];
    for (const r of guest) {
      const o = edgeFrame(map, r.door.x, r.door.y, r.door.d);
      const dark = r === this.darkDoor;
      if (metal.includes(r)) {
        this.buildMetalDoor(D, o);
        const [x, , z] = D.at(o, 0, 0, 0.7);
        this.metalDoors.push({ x, z, rot: o.rot, ex: o.x, ez: o.z });
        continue;
      }
      guestDoor(D, o, dark ? null : r.number, r.state, dark ? 'doorDark' : 'door');
      if (dark) {
        const [x, , z] = D.at(o, 0, 0, 0.7);
        this.darkDoor = { room: r, o, x, z, open: 0 };
      }
      // Letters from The Originals slipped under a few doors.
      if (r.state === 'locked' && !dark && rng.chance(0.012) && this.letters.length < 3) {
        D.box('paper', o, rng.range(-0.2, 0.2), 0.004, T + 0.18, 0.2, 0.004, 0.14);
        const [x, , z] = D.at(o, 0, 0, 0.5);
        this.notes.push({ x, z, text: NOTES.originals[this.letters.length], read: false });
        this.letters.push(r);
      }
    }
    // Corridor walls: paintings, side tables, the odd room service cart.
    const used = new Set(this.layout.sconces.map((s) => `${s.cell[0]},${s.cell[1]},${s.d}`));
    const doorKeys = new Set(guest.map((r) => `${r.door.x + DIRS[r.door.d][0]},${r.door.y + DIRS[r.door.d][1]},${r.door.d ^ 1}`));
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (zone[map.idx(x, y)] !== ZONE.CORR) continue;
        for (let d = 0; d < 4; d++) {
          if (map.getEdge(map.edge(x, y, d)) !== EDGE_WALL) continue;
          const key = `${x},${y},${d}`;
          if (doorKeys.has(key)) continue;
          const f = faceFrame(map, x, y, d);
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          const across = map.inBounds(nx, ny) ? zone[map.idx(nx, ny)] : ZONE.VOID;
          if (across === ZONE.ELEV) continue;
          const t = rng.next();
          if (!used.has(key) && t < 0.3) painting(D, f, rng.int(0, 3), 0, 1.75, rng.range(0.7, 1.0), rng.range(0.5, 0.8));
          else if (t < 0.38 && D.free(f, -0.45, 0, 0.45, 0.5)) sideTable(D, f, 0, rng.chance(0.4));
          else if (t < 0.41 && D.free(f, -0.5, 0, 0.5, 0.7)) serviceCart(D, D.sub(f, 0, 0.42, rng.range(-0.2, 0.2)));
        }
      }
    }
  }

  // ---- Boiler passages: lagged pipe bundles, taps, debris -----------------------------------

  planBoilerPassages(D, rng) {
    const { map, zone } = this.layout;
    const isPassage = (x, y) => zone[map.idx(x, y)] === ZONE.BCORR;
    const kind = new Uint8Array(map.cols * map.rows).fill(1);
    for (let i = 0; i < kind.length; i++) if (zone[i] === ZONE.BCORR) kind[i] = 0;
    const { runs, inRun } = passageRuns(map, isPassage, rng);
    const plan = planServices({ map, kind, doors: [], chamfers: [], runs, inRun }, rng, {
      profiles: BOILER_PROFILES, pick: pickBoilerProfile, H: CEIL.BCORR,
      ceilingOk: isPassage, ceilingKinds: ['lag', 'lag', 'rust', 'yellow', 'lag'],
    });
    buildServices(this.cb, plan, rng, CEIL.BCORR);
    for (const b of plan.boxes) this.solid.push(b);
    // Taps of Almond Water on bare stretches of passage wall; debris elsewhere.
    const spots = [];
    for (const r of plan.faces) {
      if (!r.tunnel || r.profile === 'lagLow' || r.profile === 'rusty') continue;
      for (const [x, y] of r.cells) spots.push([x, y, r.d]);
    }
    rng.shuffle(spots);
    // And on the halls' walls, where the mains come down.
    const hallSpots = [];
    for (const h of this.layout.halls) {
      if (h.kind === 'gallery') continue;
      for (const [x, y] of h.cells) {
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
          if (map.getEdge(map.edge(x, y, d)) !== EDGE_WALL || (map.inBounds(nx, ny) && this.layout.roomOf[map.idx(nx, ny)] === h.id)) continue;
          hallSpots.push([x, y, d]);
        }
      }
    }
    rng.shuffle(hallSpots);
    for (const [x, y, d] of [...spots, ...hallSpots]) {
      if (this.taps.length >= 8) break;
      const f = faceFrame(map, x, y, d);
      if (!D.free(f, -0.25, 0, 0.25, 0.6) || this.taps.some((t) => Math.hypot(t.x - f.x, t.z - f.z) < 12)) continue;
      const t = waterTap(D, f);
      this.taps.push({ ...t, uses: 3, cool: 0 });
    }
    for (const c of plan.clutter.slice(0, 40)) {
      if (!rng.chance(0.5)) continue;
      const f = { x: c.x + c.nx * 0.6, z: c.z + c.nz * 0.6, rot: Math.atan2(c.nx, c.nz) };
      debris(D, f, rng, 4);
    }
  }

  // ---- Elevators ------------------------------------------------------------------------------

  planElevators(D) {
    const { map, ceil } = this.layout;
    this.cars = [];
    for (const car of this.layout.elevators) {
      const { x, y, d } = car.door;
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      const o = edgeFrame(map, x, y, d); // +z: out of the car
      const maint = car.where === 'maintenance';
      const outStyle = this.styleOf(nx, ny);
      const ow = 1.2, oh = 2.3;
      this.doorway(o, ow, oh, maint ? 'brick' : 'wall', outStyle, ceil[map.idx(x, y)], ceil[map.idx(nx, ny)]);
      // The car: 2 m square inside, panelled.
      const cw = 2.0, cd = 2.1, ch = 2.6;
      const inMat = maint ? 'steel' : 'mahogany';
      D.box(inMat, o, -cw / 2 - 0.02, ch / 2, -cd / 2 - T, 0.04, ch, cd);
      D.box(inMat, o, cw / 2 + 0.02, ch / 2, -cd / 2 - T, 0.04, ch, cd);
      D.box(inMat, o, 0, ch / 2, -cd - T - 0.02, cw, ch, 0.04);
      D.box(maint ? 'steel' : 'darkwood', o, 0, ch + 0.02, -cd / 2 - T, cw + 0.08, 0.04, cd + 0.04);
      D.solidRect(o, -map.cellSize / 2, -map.cellSize, -cw / 2, -T);
      D.solidRect(o, cw / 2, -map.cellSize, map.cellSize / 2, -T);
      D.solidRect(o, -map.cellSize / 2, -map.cellSize, map.cellSize / 2, -cd - T);
      if (maint) {
        // A steel cage, hazard stripes and a warning.
        for (let k = -4; k <= 4; k++) D.cyl('railing', o, [k * 0.24, 0, -cd - T + 0.05], [k * 0.24, ch, -cd - T + 0.05], 0.012, 4);
        for (const s of [-1, 1]) for (let k = 0; k < 5; k++) D.cyl('railing', o, [s * (cw / 2 - 0.05), 0, -T - 0.2 - k * 0.45], [s * (cw / 2 - 0.05), ch, -T - 0.2 - k * 0.45], 0.012, 4);
        sign(D, o, 4, 0, 2.6, 0.55, 0.14, T + 0.02);
      } else {
        for (const s of [-1, 1]) {
          for (const y of [0.6, 1.6]) D.box('darkwood', o, s * (cw / 2 - 0.005), y, -cd / 2 - T, 0.01, 0.8, cd - 0.3);
          D.cyl('brass', o, [s * (cw / 2 - 0.08), 0.95, -T - 0.2], [s * (cw / 2 - 0.08), 0.95, -cd - T + 0.1], 0.022, 6);
        }
        D.cyl('brass', o, [-cw / 2 + 0.1, 0.95, -cd - T + 0.08], [cw / 2 - 0.1, 0.95, -cd - T + 0.08], 0.022, 6);
        D.box('brass', o, cw / 2 - 0.05, 1.3, -T - 0.35, 0.02, 0.5, 0.22);
        for (let k = 0; k < 7; k++) D.ball('ivory', o, [cw / 2 - 0.065, 1.12 + k * 0.06, -T - 0.35], 0.014, 5, 3);
        // Bronze surround and the dial outside.
        for (const s of [-1, 1]) D.box('bronze', o, s * (ow / 2 + 0.08), oh / 2, T + 0.02, 0.16, oh, 0.04);
        D.box('bronze', o, 0, oh + 0.08, T + 0.02, ow + 0.32, 0.16, 0.04);
        D.box('bronze', o, 0, oh + 0.48, T + 0.015, 0.8, 0.44, 0.03);
        D.quad('dial', o, [[-0.36, oh + 0.28, T + 0.032], [0.36, oh + 0.28, T + 0.032], [0.36, oh + 0.64, T + 0.032], [-0.36, oh + 0.64, T + 0.032]], [0, 0, 1]);
        D.box('bronze', o, ow / 2 + 0.35, 1.2, T + 0.015, 0.12, 0.24, 0.02);
      }
      // A ceiling bulb in the car.
      const p = D.at(o, 0, ch - 0.06, -cd / 2 - T);
      Object.assign(this.layout.lights[car.light], { bulbs: [p], glowY: p[1], bulbSize: 0.6, x: p[0], z: p[2] });
      this.cars.push({ car, o, maint, ow, oh, cd, cw, state: 'closed', open: 0, t: 0, inside: 0, dest: car.dest, flaky: car.flaky });
    }
  }

  // ---- Wall skins: a wall between differently finished spaces shows each its own -------

  buildSkins(D) {
    const { map } = this.layout;
    const cs = map.cellSize;
    const ceilAt = (x, y) => this.layout.ceil[map.idx(x, y)];
    const mat = (s) => (s === 'stone' ? 'stoneWall' : s === 'brick' ? 'brickWall' : 'wall');
    const skin = (e, x, y, s) => {
      // Face of edge e seen from cell (x, y).
      const [cx, cz] = map.cellCenter(x, y);
      let d;
      if (e.h) d = e.y === y ? 3 : 2;
      else d = e.x === x ? 1 : 0;
      const f = { x: cx + DIRS[d][0] * (cs / 2 - T - 0.003), z: cz + DIRS[d][1] * (cs / 2 - T - 0.003), rot: Math.atan2(-DIRS[d][0], -DIRS[d][1]) };
      this.slab(mat(s), f, -cs / 2 - (d < 2 ? 0 : 0), cs / 2, 0, ceilAt(x, y), 0, 0.001, ['pz']);
    };
    for (let y = 0; y <= map.rows; y++) {
      for (let x = 0; x <= map.cols; x++) {
        for (const h of [true, false]) {
          if (h && x >= map.cols) continue;
          if (!h && y >= map.rows) continue;
          const e = { h, x, y };
          if (map.getEdge(e) !== EDGE_WALL) continue;
          const st = this.edgeStyle(e);
          for (const [sx, sy] of this.edgeSides(e)) {
            const s = this.styleOf(sx, sy);
            if (s && s !== st) skin(e, sx, sy, s);
          }
        }
      }
    }
  }

  // ---- Runtime meshes: glows, elevator doors and needles, crates ------------------------

  buildGlows() {
    const lights = this.layout.lights;
    const pts = [];
    lights.forEach((l, i) => {
      if (!l.bulbs) return;
      for (const b of l.bulbs) pts.push({ li: i, p: b, big: (l.bulbSize || 0.4) >= 0.5 });
    });
    this.glowOf = lights.map(() => []);
    const geo = new THREE.SphereGeometry(0.028, 6, 4);
    geo.scale(0.75, 1.5, 0.75);
    this.ownGeos.push(geo);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ownMats.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
    const m = new THREE.Matrix4();
    pts.forEach((q, k) => {
      m.makeTranslation(q.p[0], q.p[1], q.p[2]);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, new THREE.Color(0, 0, 0));
      this.glowOf[q.li].push(k);
    });
    mesh.count = pts.length;
    mesh.frustumCulled = false;
    this.props.add(mesh);
    this.glowMesh = mesh;
    // Halos: small for candles and sconces, big for lamps.
    this.glowTex = glowTexture();
    this.halos = {};
    for (const big of [false, true]) {
      const list = pts.map((q, k) => [q, k]).filter(([q]) => q.big === big);
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(list.length * 3);
      list.forEach(([q], j) => pos.set(q.p, j * 3));
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(list.length * 3), 3));
      const pm = new THREE.PointsMaterial({ size: big ? 0.9 : 0.42, map: this.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.ownGeos.push(g);
      this.ownMats.push(pm);
      const P = new THREE.Points(g, pm);
      P.frustumCulled = false;
      this.props.add(P);
      this.halos[big] = { g, slot: new Map(list.map(([, k], j) => [k, j])) };
    }
    this.flickers = [];
    lights.forEach((l, i) => {
      if (l.state === 'flicker') this.flickers.push(i);
      this.setGlow(i, l.state === 'on' ? 1 : l.state === 'flicker' ? 0.6 : 0);
    });
    this.phase = lights.map(() => this.rng.next() * 100);
  }

  setGlow(i, level) {
    const l = this.layout.lights[i];
    if (l.fixture != null) return this.fixtures.set(l.fixture, level);
    const ks = this.glowOf[i];
    if (!ks.length || l.glowLevel === level) return;
    l.glowLevel = level;
    const base = [1, 0.75, 0.42];
    const k = level > 0.02 ? 0.3 + 0.7 * level : 0;
    const c = level > 0.02 ? [base[0] * k * 1.1, base[1] * k * 1.05, base[2] * k] : [0.12, 0.1, 0.08];
    for (const j of ks) {
      this.glowMesh.setColorAt(j, _c.setRGB(c[0], c[1], c[2]));
      for (const big of [false, true]) {
        const h = this.halos[big];
        const s = h.slot.get(j);
        if (s == null) continue;
        const a = big ? 0.5 : 0.32;
        h.g.attributes.color.setXYZ(s, base[0] * level * a, base[1] * level * a, base[2] * level * a);
        h.g.attributes.color.needsUpdate = true;
      }
    }
    this.glowMesh.instanceColor.needsUpdate = true;
  }

  buildRuntimeParts() {
    // Boiler fixtures map back to their light index.
    this.boilerLights.forEach((l, k) => (l.fixture = k));
    // Elevator doors and dial needles.
    const leafGeo = new THREE.BoxGeometry(1, 1, 0.04);
    leafGeo.translate(0, 0.5, 0);
    const needleGeo = new THREE.BoxGeometry(0.012, 0.26, 0.01);
    needleGeo.translate(0, 0.13, 0);
    this.ownGeos.push(leafGeo, needleGeo);
    const bronze = this.mats.liftDoor, steel = this.mats.steel, black = this.mats.black;
    for (const c of this.cars) {
      const g = new THREE.Group();
      g.position.set(c.o.x, 0, c.o.z);
      g.rotation.y = c.o.rot;
      this.props.add(g);
      c.leaves = [-1, 1].map((s) => {
        const m = new THREE.Mesh(leafGeo, c.maint ? steel : bronze);
        m.scale.set(c.ow / 2, c.oh, 1);
        m.position.set(s * c.ow / 4, 0, T + 0.04);
        g.add(m);
        return { m, s };
      });
      if (!c.maint) {
        const n = new THREE.Mesh(needleGeo, black);
        n.position.set(0, c.oh + 0.29, T + 0.04);
        g.add(n);
        c.needle = n;
        c.needleA = this.floorAngle(c.dest.floor);
      }
      c.group = g;
    }
  }

  floorAngle(floor) {
    const f = Number(floor) || 1;
    return Math.PI / 2 - ((f - 1) / 12) * Math.PI;
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

  // ---- Entities --------------------------------------------------------------------------

  spawnEntities() {
    const m = this.entities;
    const { map, zone, rooms, roomOf } = this.layout;
    const rng = this.rng;
    const fake = { pos: new THREE.Vector3(this.spawn.x, 0, this.spawn.z) };
    const away = (x, z, d = 16) => Math.hypot(x - this.spawn.x, z - this.spawn.z) > d;
    const cellsWhere = (pred) => {
      const out = [];
      for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
        const i = map.idx(x, y);
        if (this.layout.spawnDist[i] < 0 || !pred(i)) continue;
        const [cx, cz] = map.cellCenter(x, y);
        if (away(cx, cz)) out.push([cx, cz]);
      }
      return out;
    };
    // Deathmoths round the chandeliers and sconces.
    const lit = this.layout.lights.filter((l) => (l.kind === 'chandelier' || l.kind === 'sconce') && l.state !== 'off' && away(l.x, l.z, 14));
    rng.shuffle(lit);
    for (const l of lit.slice(0, 10)) m.spawn('deathmoth', { x: l.x, z: l.z, variant: 'drone' });
    for (let k = 0; k < 2; k++) m.spawnFar('deathmoth', fake, { min: 30, max: 90, opts: { variant: 'soldier' } });
    m.spawnFar('hound', fake, { min: 40, max: 100 });
    for (let k = 0; k < 2; k++) m.spawnFar('woodlin', fake, { min: 25, max: 90 });
    m.spawnFar('skinstealer', fake, { min: 35, max: 100 });
    const ball = this.layout.ball;
    const [bx, bz] = map.cellCenter(ball.x + Math.floor(ball.w / 2), ball.y + Math.floor(ball.h / 2));
    if (away(bx, bz, 25)) m.spawn('watcher', { x: bx, z: bz });
    else m.spawnFar('watcher', fake, { min: 30, max: 90 });
    const corr = cellsWhere((i) => zone[i] === ZONE.CORR);
    if (corr.length) {
      const [x, z] = rng.pick(corr);
      m.spawn('nguithrxurh', { x, z, ceiling: CEIL.CORR });
    }
    const hot = cellsWhere((i) => zone[i] === ZONE.BROOM && rooms[roomOf[i]].kind !== 'gallery');
    if (hot.length) {
      const [gx, gz] = rng.pick(hot);
      m.spawn('growler', { x: gx, z: gz });
      const [wx, wz] = rng.pick(hot);
      m.spawn('wrangler', { x: wx, z: wz, variant: rng.chance(0.5) ? 'human' : 'insect' });
    }
    const pass = cellsWhere((i) => zone[i] === ZONE.BCORR);
    for (let k = 0; k < 4 && pass.length; k++) {
      const [x, z] = rng.pick(pass);
      m.spawn('deathrat', { x, z, variant: 'rust' });
    }
    for (let k = 0; k < 3 && corr.length; k++) {
      const [x, z] = rng.pick(corr);
      m.spawn('deathrat', { x, z, variant: 'grey' });
    }
    // Samantha keeps to the Homely Hotel.
    const hom = rooms.find((r) => r.kind === 'homely' && r.cells.length);
    if (hom) {
      const [x, y] = hom.cells[hom.cells.length - 1];
      const [cx, cz] = map.cellCenter(x, y);
      m.spawn('samantha', { x: cx, z: cz });
    }
  }

  // ---- Per-frame ---------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx, map, layout } = this;
    const [cx, cy] = map.cellAt(player.pos.x, player.pos.z);
    const i = map.idx(cx, cy);
    this.zoneHere = layout.zone[i];
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.25;
      this.cull(player);
    }
    // Headroom, and the wall shading's idea of the ceiling.
    const ground = this.groundAt(player.pos.x, player.pos.z);
    let head = Infinity;
    for (const [dx, dz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
      const [hx, hy] = map.cellAt(player.pos.x + dx, player.pos.z + dz);
      head = Math.min(head, layout.ceil[map.idx(hx, hy)]);
    }
    player.ceiling = head - ground;
    this.ceilNow += (layout.ceil[i] - this.ceilNow) * Math.min(1, dt * 3);
    this.shared.ceilH.value = this.ceilNow;

    this.updateLights(dt, player);
    this.updateElevators(dt, player);
    if (this.done) return;
    this.updateStairs(dt, player);
    if (this.done) return;
    this.updateHeat(dt, player);
    if (this.done) return;
    this.updateDarkDoor(dt, player);
    if (this.done) return;
    this.updateMetalDoors(dt, player);
    if (this.done) return;
    this.updatePickups(dt, player);
    this.updateAmbient(dt, player);

    const dark = this.lightLevel(player.pos.x, player.pos.z) < 0.07 && !player.flashlight;
    player.sanity = Math.max(0, player.sanity - (0.03 + (dark ? 0.15 : 0)) * dt);

    const res = this.entities.update(dt, player, ctx);
    for (const ev of res.events || []) if (ev.type === 'speak') ctx.hud.message(ev.text, 6);
    for (const e of this.entities.list) e.root.visible = e.distTo(player) < (this.view || VIEW);
    if (player.health <= 0 || player.sanity <= 0 || res.dead) {
      this.done = true;
      ctx.onDeath(this.lastHurt && player.health <= 0 ? this.lastHurt : res.cause || 'The hotel kept you.');
    }
  }

  updateLights(dt, player) {
    const { shared } = this;
    shared.globalLight.value = 1;
    const lights = this.layout.lights;
    const cands = [];
    for (const i of this.flickers) {
      const l = lights[i];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d > 30) continue;
      const ph = this.phase[i];
      const t = this.time * 7 + ph;
      const on = Math.sin(t * 1.3) + Math.sin(t * 0.41 + ph) * 1.1 > -0.3 && fract(Math.sin(Math.floor(t) * 77.1 + ph) * 43758.5) > 0.22;
      const level = on ? 1 : 0.05;
      this.setGlow(i, level);
      if (d < 16) cands.push({ d, x: l.x, y: (l.glowY ?? 2.2) - 0.05, z: l.z, power: l.power * 1.1 * level, color: l.color });
    }
    // The furnace breathes.
    const fl = 0.75 + 0.25 * Math.sin(this.time * 9.1) * Math.sin(this.time * 3.7 + 1);
    this.mats.fire.color.setRGB(1, 0.42 * fl + 0.1, 0.1 * fl);
    for (const f of this.fires) {
      const d = Math.hypot(f.x - player.pos.x, f.z - player.pos.z);
      if (d < 14) cands.push({ d, x: f.x, y: 1.2, z: f.z, power: 0.9 * fl, color: [1, 0.45, 0.15] });
    }
    // Elevator car lights follow the ride.
    for (const c of this.cars) {
      const l = lights[c.car.light];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (c.state === 'riding' && c.dark) this.setGlow(c.car.light, 0);
      else if (!c.maint || l.state !== 'flicker') this.setGlow(c.car.light, 1);
      if (d < 6 && c.state === 'riding') cands.push({ d, x: l.x, y: 2.5, z: l.z, power: c.dark ? 0 : 0.6, color: l.color });
    }
    applyDynamicLights(shared, cands, MAX_DYN_LIGHTS);
  }

  // Elevators: open as you come, close behind you, take you somewhere.
  updateElevators(dt, player) {
    const { ctx } = this;
    for (const c of this.cars) {
      const o = c.o;
      const dx = player.pos.x - o.x, dz = player.pos.z - o.z;
      const cos = Math.cos(o.rot), sin = Math.sin(o.rot);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const inCar = lz < -0.35 && lz > -c.cd - 0.2 && Math.abs(lx) < c.cw / 2;
      const front = lz > 0 && lz < 2.4 && Math.abs(lx) < 1.4;
      c.t += dt;
      // Dial needle: flaky cars twitch towards 13.
      if (c.needle) {
        let a = c.needleA;
        if (c.flaky && Math.sin(this.time * 1.3 + c.o.x) > 0.85) a = this.floorAngle(13);
        if (c.state === 'riding') a = this.floorAngle(1 + ((c.t * 2.2) % 12));
        c.needle.rotation.z += (a - c.needle.rotation.z) * Math.min(1, dt * 4);
      }
      switch (c.state) {
        case 'closed':
          if (front || inCar) {
            c.state = 'opening';
            ctx.audio.deskBell(this.panTo(player, o.x, o.z), 0.18);
          }
          break;
        case 'opening':
          c.open = Math.min(1, c.open + dt * 1.3);
          if (c.open >= 1) c.state = 'open';
          break;
        case 'open':
          c.inside = inCar ? c.inside + dt : 0;
          if (c.inside > 0.8) {
            c.state = 'closing';
            c.t = 0;
          } else if (!front && !inCar && Math.hypot(lx, lz) > 4) c.state = 'shutting';
          break;
        case 'shutting':
          c.open = Math.max(0, c.open - dt * 1.1);
          if (front || inCar) c.state = 'opening';
          else if (c.open <= 0) c.state = 'closed';
          break;
        case 'closing':
          c.open = Math.max(0, c.open - dt * 1.0);
          if (!inCar && c.open > 0.3) {
            c.state = 'open';
            break;
          }
          if (c.open <= 0) {
            c.state = 'riding';
            c.t = 0;
            ctx.audio.liftMotor(0.3);
            if (c.maint) ctx.audio.creak(0, 0.4);
            // Where are we going? Flaky cars sometimes end up at 13.
            c.ride = c.dest.type === 'floor' && c.flaky && this.rng.chance(0.3) ? { type: 'death', floor: '13' } : c.dest;
            ctx.hud.message(c.maint ? 'The cage lurches. Something above it groans.' : c.ride.type === 'level' ? 'The car sinks. Down, and down.' : `The car rises. FLOOR ${c.ride.floor}.`, 3);
          }
          break;
        case 'riding':
          this.ride(c, dt, player);
          if (this.done) return;
          break;
      }
      for (const l of c.leaves) l.m.position.x = l.s * (c.ow / 4 + c.open * (c.ow / 2 - 0.02));
      // Closed doors are solid: keep the player on their side.
      if (c.open < 0.6 && Math.abs(lx) < c.ow / 2 + 0.3) {
        const lim = 0.34;
        let nz = lz;
        if (lz > -0.1 && lz < lim) nz = lim;
        else if (lz <= -0.1 && lz > -lim) nz = -lim;
        if (nz !== lz) {
          player.pos.x = o.x + lx * cos + nz * sin;
          player.pos.z = o.z - lx * sin + nz * cos;
        }
      }
    }
  }

  ride(c, dt, player) {
    const { ctx } = this;
    const r = c.ride;
    if (c.maint) {
      if (c.t > 1.6 && !c.fell) {
        c.fell = true;
        ctx.audio.crash(0, 0.7);
        ctx.audio.fall();
        ctx.hurtFlash(0.8);
        ctx.vibrate([300, 80, 300]);
        if (this.rng.chance(0.5)) {
          this.done = true;
          ctx.onDeath('The maintenance lift\'s cable snapped. It was a long way down.');
          return;
        }
        player.health = Math.max(5, player.health - 45);
        ctx.hud.message('The cage falls, and falls, and stops. You can barely stand.', 4);
      }
      if (c.t > 3.2) {
        this.done = true;
        ctx.onEscape('level6', 'door');
      }
      return;
    }
    if (r.type === 'death') {
      // Thirteen.
      if (c.t > 2.5 && !c.dark) {
        c.dark = true;
        ctx.audio.whisper(0, 0.4);
      }
      if (c.t > 4.2) {
        this.done = true;
        ctx.audio.jumpscare();
        ctx.hurtFlash(1);
        ctx.onDeath('The elevator stopped at the 13th floor. The doors opened.');
      }
      return;
    }
    if (c.t < 3.4) return;
    if (r.type === 'level') {
      this.done = true;
      ctx.onEscape(r.target, 'door');
      return;
    }
    // Another floor: another car, somewhere else in the hotel.
    const others = this.cars.filter((o) => o !== c && !o.maint && o.state === 'closed');
    const dest = others.length ? this.rng.pick(others) : c;
    const a = c.o, b = dest.o;
    const dx = player.pos.x - a.x, dz = player.pos.z - a.z;
    const lx = dx * Math.cos(a.rot) - dz * Math.sin(a.rot), lz = dx * Math.sin(a.rot) + dz * Math.cos(a.rot);
    player.pos.x = b.x + lx * Math.cos(b.rot) + lz * Math.sin(b.rot);
    player.pos.z = b.z - lx * Math.sin(b.rot) + lz * Math.cos(b.rot);
    player.yaw += b.rot - a.rot;
    c.state = 'closed';
    c.open = 0;
    c.ride = null;
    dest.state = 'opening';
    dest.t = 0;
    ctx.audio.bell(0, 0.25);
    this.cull(player);
  }

  updateStairs(dt, player) {
    const { ctx } = this;
    if (this.stairTop && Math.hypot(player.pos.x - this.stairTop.x, player.pos.z - this.stairTop.z) < 0.9) {
      this.done = true;
      ctx.onEscape('level4', 'walk');
      return;
    }
    const f = this.furnaceStair;
    if (f && this.groundAt(player.pos.x, player.pos.z) < -f.rise * 0.7) {
      this.done = true;
      ctx.onEscape('level6', 'walk');
    }
  }

  // The deeper into the boiler room, the hotter.
  updateHeat(dt, player) {
    const { map, layout } = this;
    const [cx, cy] = map.cellAt(player.pos.x, player.pos.z);
    const h = layout.heat[map.idx(cx, cy)];
    this.heat += (h - this.heat) * Math.min(1, dt * 0.8);
    if (this.heat > 0.65) {
      const k = (this.heat - 0.65) / 0.35;
      player.health -= k * 2.2 * dt;
      player.staminaRegenMul = 1 - k * 0.6;
      this.lastHurt = 'The heat down there takes everything, slowly.';
    } else player.staminaRegenMul = 1;
  }

  // A steel door with a porthole full of sky.
  buildMetalDoor(D, o) {
    for (const s of [-1, 1]) D.box('steel', o, s * 0.56, 1.12, T + 0.02, 0.1, 2.24, 0.05);
    D.box('steel', o, 0, 2.27, T + 0.02, 1.22, 0.1, 0.05);
    D.box('steelDoor', o, 0, 1.1, T + 0.015, 1.0, 2.2, 0.03);
    for (const y of [0.2, 2.0]) for (let x = -0.42; x <= 0.43; x += 0.12) D.box('chrome', o, x, y, T + 0.035, 0.025, 0.025, 0.01);
    D.cyl('chrome', o, [0, 1.6, T + 0.03], [0, 1.6, T + 0.05], 0.14, 14, { caps: true });
    D.cyl('skyGlow', o, [0, 1.6, T + 0.05], [0, 1.6, T + 0.052], 0.105, 14, { caps: true });
    D.box('chrome', o, 0.38, 1.0, T + 0.05, 0.05, 0.22, 0.03);
    D.quad('skyGlow', o, [[-0.48, 0.004, T + 0.02], [0.48, 0.004, T + 0.02], [0.48, 0.004, T + 0.26], [-0.48, 0.004, T + 0.26]], [0, 1, 0]);
    // Cold daylight spilling into the corridor.
    const [lx, , lz] = D.at(o, 0, 0, 0.5);
    D.light({ x: lx, z: lz, power: 0.55, color: [0.72, 0.84, 1.0], hide: true, kind: 'skydoor' });
  }

  updateMetalDoors(dt, player) {
    for (const m of this.metalDoors) {
      const d = Math.hypot(player.pos.x - m.x, player.pos.z - m.z);
      if (d < 1.0) {
        this.done = true;
        this.ctx.onEscape('level63', 'door');
        return;
      }
      if (d < 3 && !m.told) {
        m.told = true;
        this.ctx.hud.message('A plain metal door, out of place among the wood. Cool air and daylight leak around it. You can hear wind.', 4);
      }
    }
  }

  updateDarkDoor(dt, player) {
    const dd = this.darkDoor;
    if (!dd || !dd.o) return;
    const d = Math.hypot(player.pos.x - dd.x, player.pos.z - dd.z);
    if (d < 1.0) {
      this.done = true;
      this.ctx.audio.creak(0, 0.4);
      this.ctx.onEscape('level9', 'door');
    } else if (d < 3 && !dd.told) {
      dd.told = true;
      this.ctx.hud.message('A door with no number. The wood is almost black. Cold air seeps under it.', 3.5);
    }
  }

  updatePickups(dt, player) {
    const { ctx } = this;
    for (const n of this.notes) {
      if (n.read || Math.hypot(n.x - player.pos.x, n.z - player.pos.z) > (n.r || 1.4)) continue;
      n.read = true;
      ctx.audio.click();
      ctx.hud.message(n.text, 12);
    }
    for (const t of this.taps) {
      if (t.cool > 0) t.cool -= dt;
      if (t.cool > 0 || Math.hypot(t.x - player.pos.x, t.z - player.pos.z) > 0.8) continue;
      t.cool = 2.5;
      if (t.uses <= 0) {
        if (!t.told) ctx.hud.message('The tap coughs and runs dry.', 1.8);
        t.told = true;
        continue;
      }
      if (!player.give('water')) continue;
      t.uses--;
      ctx.audio.slosh(ctx.audio.ctx?.currentTime ?? 0, 0.2);
      ctx.audio.pickup();
      ctx.hud.message('You fill a bottle from the pipe. Almond Water, warm.', 2.2);
    }
    for (const f of this.food) {
      if (f.cool > 0) f.cool -= dt;
      if (f.cool > 0 || f.left <= 0 || Math.hypot(f.x - player.pos.x, f.z - player.pos.z) > 1.0) continue;
      f.cool = 3;
      f.left--;
      player.health = Math.min(100, player.health + 20);
      ctx.audio.pickup();
      ctx.hud.message(player.give('meat') ? 'You eat, and wrap a cut of meat for later.' : 'You eat. No room in your backpack to take any with you.', 3);
    }
    for (const b of this.bells) {
      const d = Math.hypot(b[0] - player.pos.x, b[2] - player.pos.z);
      if (d < 1.0 && !b.rung) {
        b.rung = true;
        ctx.audio.deskBell(this.panTo(player, b[0], b[2]), 0.3);
        ctx.hud.message('Ding. Nobody comes.', 2);
      } else if (d > 2.5) b.rung = false;
    }
    for (const f of this.frontDoors) {
      const d = Math.hypot(f.x - player.pos.x, f.z - player.pos.z);
      if (d < 1.1 && !f.told) {
        f.told = true;
        ctx.hud.message('The front doors are locked. Outside it is the same golden afternoon it has always been.', 4);
      } else if (d > 3) f.told = false;
    }
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
      const r = this.rng.next();
      const id = r < 0.3 ? 'water' : r < 0.5 ? 'battery' : r < 0.7 ? 'medkit' : r < 0.85 ? 'flare' : 'pipe';
      player.give(id);
      ctx.hud.message(`M.E.G. supplies: ${{ water: 'a bottle of Almond Water', battery: 'batteries', medkit: 'a first aid kit', flare: 'a road flare', pipe: 'a lead pipe' }[id]}.`, 2.5);
      ctx.audio.pickup();
    }
  }

  updateAmbient(dt, player) {
    const a = this.ctx.audio;
    // Grandfather clocks tick when you're near one.
    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer = 1;
      this.tock = !this.tock;
      for (const t of this.ticks) {
        const d = Math.hypot(t[0] - player.pos.x, t[2] - player.pos.z);
        if (d < 9) a.tick(this.panTo(player, t[0], t[2]), 0.08 * (1 - d / 9), this.tock);
      }
    }
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = this.rng.range(3, 8);
    const pan = this.rng.range(-1, 1);
    const r = this.rng.next();
    const boiler = !inHotel(this.zoneHere);
    if (boiler) {
      if (r < 0.35) a.pipeKnock(pan, 0.2);
      else if (r < 0.55) a.steam(pan, 0.12);
      else if (r < 0.7) a.clank(pan, 0.15);
      else if (r < 0.8) a.creak(pan, 0.1);
      else if (player.sanity < 60) a.whisper(pan, 0.12);
      return;
    }
    if (r < 0.2) a.deskBell(pan, 0.05);
    else if (r < 0.35) a.thud(pan, 0.1);
    else if (r < 0.5) a.creak(pan, 0.08);
    else if (r < 0.62) a.phantomSteps(pan * 0.6);
    else if (r < 0.7) a.voice(pan, 0.06);
    else if (r < 0.76) a.giggle(pan, 0.05);
    else if (r < 0.82 && player.sanity < 60) a.whisper(pan, 0.12);
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

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + BOTTLE_SANITY);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    const boiler = !inHotel(this.zoneHere ?? ZONE.CORR);
    // The band nobody sees: loud by the bandstand, muffled through the walls.
    let jazz = 0.05, muffle = 900;
    if (this.stage) {
      const d = Math.hypot(this.stage.x - player.pos.x, this.stage.z - player.pos.z);
      const walls = this.map.wallsBetween(player.pos.x, player.pos.z, this.stage.x, this.stage.z, 4);
      jazz = Math.max(0.04, 0.34 / (1 + (d / 10) ** 2) * Math.pow(0.55, walls));
      muffle = walls === 0 ? 7000 : walls === 1 ? 2200 : 1100;
    }
    if (boiler) {
      jazz *= 0.4;
      muffle = Math.min(muffle, 500);
    }
    let drone = 0;
    for (const e of this.entities.list) {
      if (!['chase', 'hunt', 'attack', 'stalk', 'charge', 'dive'].includes(e.state)) continue;
      drone = Math.max(drone, 0.25 * Math.max(0, 1 - e.distTo(player) / 25));
    }
    let exitGain = 0, exitPan = 0;
    if (this.furnaceStair) {
      const d = Math.hypot(this.furnaceStair.x - player.pos.x, this.furnaceStair.z - player.pos.z);
      if (d < 20) {
        exitGain = 0.25 / (1 + (d / 5) ** 2);
        exitPan = this.panTo(player, this.furnaceStair.x, this.furnaceStair.z);
      }
    }
    return {
      hum: boiler ? 0.07 : 0.02, exitGain, exitPan, exitType: 'steam', drone,
      machine: boiler ? 0.05 + this.heat * 0.07 : 0, machinePan: 0,
      jazz, jazzMuffle: muffle, sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const boiler = !inHotel(this.zoneHere ?? ZONE.CORR);
    const hot = this.heat;
    const target = boiler
      ? new THREE.Color(0.03 + r * 0.25 + hot * 0.12, 0.025 + g * 0.2 + hot * 0.04, 0.02 + b * 0.16)
      : new THREE.Color(0.04 + r * 0.36, 0.03 + g * 0.27, 0.02 + b * 0.18);
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const lum = (r + g + b) / 3;
    this.lum += (lum - this.lum) * Math.min(1, dt * 3);
    const base = boiler ? 0.028 + hot * 0.02 : this.zoneHere === ZONE.BALL ? 0.017 : 0.02;
    this.fogDensity += (base + (1 - Math.min(1, this.lum * 2)) * 0.022 - this.fogDensity) * Math.min(1, dt * 2);
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.2 + hurt * 0.3 + Math.max(0, hot - 0.5) * 0.9,
      aberr: 0.25 + insanity * 1.4 + hurt * 1.2 + Math.max(0, hot - 0.6),
      grain: 0.06 + insanity * 0.06,
    };
  }

  hudInfo() {
    const w = this.heat > 0.65 ? 'IT IS TOO HOT' : null;
    return { warn: w, warnCovered: w, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    this.world.dispose();
    this.entities.dispose();
    this.fixtures.dispose();
    this.glowTex.dispose();
    for (const g of this.ownGeos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    for (const t of this.textures.rugs) t.dispose();
    delete this.textures.rugs;
    disposeTextures(this.textures);
  }
}

const _c = new THREE.Color();

function fract(x) {
  return x - Math.floor(x);
}


export const LEVEL5 = {
  id: 'level5',
  number: 5,
  name: 'Level 5',
  title: 'Terror Hotel',
  difficulty: 2,
  next: 'level6',
  create: (ctx) => new Level5(ctx),
};
