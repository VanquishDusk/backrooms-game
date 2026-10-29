import * as THREE from 'three';
import { GridWorld, GeoBuilder } from '../../world/GridWorld.js';
import { DIRS, EDGE_EXIT } from '../../world/GridMap.js';
import { SURFACE, MAX_DYN_LIGHTS, createWorldMaterial } from '../../world/materials.js';
import {
  chalkyConcreteTexture, darkBrickTexture, utilityFloorTexture, diamondPlateTexture, utilityCeilingTexture,
  pipeTexture, utilityDoorTexture, signAtlasTexture, SIGN_TILES, crateTexture, solidTexture, gaugeTexture,
  carpetTexture, hazardTexture,
} from '../../world/textures.js';
import { disposeTextures, nearDoor, mergeGeometries } from '../../world/props.js';
import { ChunkedBuilders } from '../../world/tubes.js';
import { createNoise2D } from '../../core/rng.js';
import { EntityManager } from '../../entities/lib/index.js';
import { generateLevel2, KIND } from './generate.js';
import { planServices, LEDGE } from './plan.js';

// Level 2 — "Abandoned Utility Halls".
//
//  - Narrow concrete maintenance tunnels, crowded with lagged pipes, rusty
//    iron, conduit and cable; turns cut at 45 degrees; dark brick in places
//  - Bare fluorescent tubes (harsh white) and caged bulbs (orange), many of
//    them dead, some flickering; whole sections black out at once
//  - Machine rooms full of boilers, pumps and switchgear, whirring
//  - Locked steel doors everywhere. A rare few are unlocked and wrong:
//    a green chalk-marked door back to Level 1, a red hazard-taped door to
//    Level 3, and sometimes a wooden office door to Level 4
//  - Hounds, Smilers, Skin-Stealers, Deathmoths and Clumps

const T = 0.08; // half wall thickness
const VIEW = 34; // metres; fog hides everything beyond
const BOTTLE_SANITY = 35;
const MAX_BOTTLES = 6;
const JUNK = [
  'A wrench, rusted solid.', 'A hard hat with a crack through it.', 'A clipboard. Every box says "OK".',
  'A thermos of something still warm.', 'A coil of copper wire.', 'A pressure gauge reading zero.',
  'A box of fuses, all blown.', 'A work glove, full of grease.', 'A map of these tunnels. It is blank.',
];
const DOOR_TARGET = { exit1: 'level1', exit3: 'level3', exit4: 'level4' };
const PIPE_SEG = { lag: 9, duct: 11, rust: 7, galv: 6, red: 6, conduit: 4, cable: 4 };
const PIPE_V = { lag: 0.5, duct: 1.4, rust: 0.7, galv: 0.6, red: 0.6, conduit: 0.5, cable: 0.5 };
const PIPE_MAT = { lag: 'lag', duct: 'duct', rust: 'rust', galv: 'galv', red: 'red', conduit: 'conduit', cable: 'cable' };

// Machines against plant-room walls: length along the wall, depth out of it.
// (Nothing deeper than 0.85 m, so room cell centres stay walkable.)
const MACHINES = {
  cabinets: { L: 1.3, D: 0.55, w: 3 },
  pump: { L: 1.4, D: 0.85, w: 3 },
  tank: { L: 0.95, D: 0.85, w: 2 },
  panel: { L: 0.9, D: 0.26, w: 2 },
  generator: { L: 1.8, D: 0.85, w: 2 },
};

export class Level2 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    const layout = generateLevel2(rng.fork('layout'));
    const plan = planServices(layout, rng.fork('plan'));
    this.layout = layout;
    this.plan = plan;
    const { map } = layout;
    this.map = map;
    const H = map.height;
    const drng = rng.fork('dress');
    this.drng = drng;

    // Everything solid has to be known before the world builds collision.
    this.machines = this.planMachines(drng);
    this.crateSpots = this.planCrates(drng);
    this.clutter = this.planClutter(drng);
    const solid = [
      ...plan.boxes,
      ...this.machines.map((m) => m.box),
      ...this.crateSpots.map((c) => c.box),
      ...this.clutter.filter((c) => c.box).map((c) => c.box),
    ].map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1 }));

    const labels = layout.sections.slice(0, 4).map((s) => s.label);
    this.textures = {
      wall: chalkyConcreteTexture(renderer),
      floor: utilityFloorTexture(renderer),
      ceiling: utilityCeilingTexture(renderer),
      floors: { plate: { map: diamondPlateTexture(renderer), scale: 1 / 0.9 } },
      walls: { brick: { map: darkBrickTexture(renderer), scale: [1 / 1.2, 2 / H] } },
      pipes: Object.fromEntries(['insulation', 'rust', 'galv', 'duct', 'redpaint', 'cable', 'machine'].map((k) => [k, pipeTexture(renderer, k)])),
      doors: Object.fromEntries(['locked', 'locked2', 'exit1', 'exit3', 'exit4'].map((k) => [k, utilityDoorTexture(renderer, k)])),
      signs: signAtlasTexture(renderer, labels),
      crate: crateTexture(renderer),
      cabinet: cabinetTexture(renderer),
      gauge: gaugeTexture(),
      carpet: carpetTexture(renderer, '#9c8f6c'),
      hazard: hazardTexture(renderer),
      solids: {},
    };
    shared.ceilH.value = H;

    const noise = createNoise2D(drng.fork('damp'));
    const sectionOfCell = (x, y) => layout.sections[layout.sectionOf(x, y)];
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      extraBoxes: solid,
      textures: this.textures,
      shared,
      texScale: { wall: [1 / 3, 1 / H], floor: 1 / 3, ceiling: 1 / 2.5 },
      panelSize: [0.001, 0.001],
      floorStyle: (x, y) => (layout.kind[map.idx(x, y)] === KIND.ROOM ? 'plate' : 'floor'),
      wallStyle: (e) => {
        let [x, y] = [e.x, e.y];
        if (!map.inBounds(x, y)) [x, y] = e.h ? [e.x, e.y - 1] : [e.x - 1, e.y];
        return map.inBounds(x, y) && sectionOfCell(x, y).brick ? 'brick' : 'wall';
      },
      dampAt: (x, z) => {
        const n = noise(x * 0.09, z * 0.09);
        return Math.max(0, Math.min(1, (n - 0.42) * 3));
      },
    });
    scene.add(this.world.group);
    for (const e of this.blockedEdges) map.setEdge(e, EDGE_EXIT);

    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    // Start with your back to the dead end, as if the hallway carried on.
    this.spawn = {
      x: sx - DIRS[layout.spawn.dir][0] * 0.35,
      z: sz - DIRS[layout.spawn.dir][1] * 0.35,
      yaw: layout.spawnYaw,
    };

    this.props = new THREE.Group();
    scene.add(this.props);
    this.ownGeos = [];
    this.ownMats = [];
    const lit = (tex, scale = 1) => {
      const m = createWorldMaterial(shared, tex, SURFACE.PLAIN, scale);
      this.ownMats.push(m);
      return m;
    };
    const solidTex = (hex, noiseAmt = 0.06) => (this.textures.solids[hex] ||= solidTexture(renderer, hex, noiseAmt));
    const P = this.textures.pipes;
    this.mats = {
      lag: lit(P.insulation),
      rust: lit(P.rust),
      galv: lit(P.galv),
      conduit: lit(P.galv),
      duct: lit(P.duct),
      red: lit(P.redpaint),
      cable: lit(P.cable),
      machine: lit(P.machine),
      ledge: lit(this.textures.wall, [1 / 3, 1 / H]),
      strut: lit(solidTex('#8e9290', 0.1)),
      steel: lit(solidTex('#3c3e3c', 0.08)),
      cage: lit(solidTex('#2a2a28', 0.05)),
      housing: lit(solidTex('#b8b6ac', 0.05)),
      concrete: lit(this.textures.floor, 1 / 1.5),
      drumBlue: lit(solidTex('#2c4f7c', 0.12)),
      drumRust: lit(P.rust),
      drumYellow: lit(solidTex('#b88a1c', 0.14)),
      cardboard: lit(solidTex('#9a7a4c', 0.1)),
      wood: lit(solidTex('#7a5a36', 0.12)),
      toolRed: lit(solidTex('#9a2018', 0.08)),
      bottleGreen: lit(solidTex('#2f5a3a', 0.08)),
      bottleGrey: lit(solidTex('#6a6e70', 0.08)),
      rubble: lit(this.textures.floor, 1 / 0.6),
      paper: lit(solidTex('#d8d2c0', 0.04)),
      glass: lit(solidTex('#d8e0e0', 0.02)),
      cabinet: lit(this.textures.cabinet),
      crate: lit(this.textures.crate),
      gauge: lit(this.textures.gauge),
      signs: lit(this.textures.signs),
      carpet: lit(this.textures.carpet, 1 / 1.2),
      hazard: lit(this.textures.hazard, 1 / 0.6),
      brass: lit(solidTex('#a8843c', 0.06)),
      doorWood: lit(solidTex('#5a3c22', 0.1)),
    };
    this.doorMats = Object.fromEntries(Object.entries(this.textures.doors).map(([k, t]) => [k, lit(t)]));

    this.cb = new ChunkedBuilders(map.cellSize * 8);
    this.dials = [];
    this.buildChamfers();
    this.buildServices();
    this.buildFixtures();
    this.buildMachines();
    this.buildClutter();
    this.buildDebris();
    this.buildSigns();
    this.buildDoors();
    const before = this.props.children.length;
    this.ownGeos.push(...this.cb.finish(this.props, this.mats));
    // Chunk meshes past the fog get hidden (see cullChunks).
    this.chunkMeshes = this.props.children.slice(before).map((m) => ({ m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius }));
    this.cullTimer = 0;
    this.buildDials();
    this.buildCrates();
    this.buildSteam();

    // Entities.
    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('entities'), shared });
    this.spawnEntities();

    this.flickers = layout.lights.map((l, i) => (l.state === 'flicker' ? i : -1)).filter((i) => i >= 0);
    this.phase = layout.lights.map(() => this.rng.next() * 100);
    this.secDark = new Uint8Array(layout.sections.length);
    this.time = 0;
    this.done = false;
    this.blackout = null;
    this.nextBlackout = this.rng.range(35, 60);
    this.nextAmbient = 2;
    this.buzzTimer = 0;
    this.lockedCooldown = 0;
    this.lum = 1;
    this.fogColor = new THREE.Color(0.1, 0.1, 0.09);
    this.fogDensity = 0.05;
    this.darkTime = 0;
  }

  // ---- Planning (collision first) ----------------------------------------

  planMachines(rng) {
    const { map, rooms } = this.layout;
    const cs = map.cellSize;
    const out = [];
    const at = (r, s, off) => (r.a === 0 ? [s, r.line + r.n[1] * off] : [r.line + r.n[0] * off, s]);
    for (const r of this.plan.faces) {
      if (r.tunnel || r.door) continue;
      const lo = r.s0 + (r.ends[0].type === 'dive' ? 0.3 : 1.0);
      const hi = r.s1 - (r.ends[1].type === 'dive' ? 0.3 : 1.0);
      let pos = lo;
      while (pos < hi - 0.5) {
        if (rng.chance(0.22)) {
          pos += 0.6;
          continue;
        }
        const fits = Object.entries(MACHINES).filter(([, m]) => m.L <= hi - pos);
        if (!fits.length) break;
        let w = rng.next() * fits.reduce((a, [, m]) => a + m.w, 0);
        let type = fits[0][0];
        for (const [k, m] of fits) {
          w -= m.w;
          if (w <= 0) {
            type = k;
            break;
          }
        }
        const def = MACHINES[type];
        const s = pos + def.L / 2;
        const [cx, cz] = at(r, s, T + def.D / 2);
        const a = at(r, s - def.L / 2, T), b = at(r, s + def.L / 2, T + def.D);
        out.push({
          type, x: cx, z: cz, L: def.L, D: def.D, rot: Math.atan2(r.n[0], r.n[1]),
          box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
          seed: rng.next(),
        });
        pos += def.L + rng.range(0.15, 0.4);
      }
    }
    // A boiler in the big rooms, straddling the line between two rows of
    // cells so the cell centres around it stay clear. The one edge it sits
    // across is blocked for pathing (an invisible, non-colliding "exit" edge).
    this.blockedEdges = [];
    for (const room of rooms) {
      if (room.w < 3 || room.h < 3) continue;
      const along = rng.chance(0.5);
      const near = rng.chance(0.5) ? 1 : 2; // which internal boundary
      const L = 2.9, D = 1.3;
      const cx = along ? (room.x + 1.5) * cs : (room.x + near) * cs;
      const cz = along ? (room.y + near) * cs : (room.y + 1.5) * cs;
      const hx = (along ? L : D) / 2, hz = (along ? D : L) / 2;
      out.push({ type: 'boiler', x: cx, z: cz, L, D, rot: along ? 0 : Math.PI / 2, box: [cx - hx, cz - hz, cx + hx, cz + hz], seed: rng.next(), free: true });
      this.blockedEdges.push(along ? { h: true, x: room.x + 1, y: room.y + near } : { h: false, x: room.x + near, y: room.y + 1 });
    }
    return out;
  }

  // Supply crates at the back of dead ends, clear of the pipes there.
  planCrates() {
    const { map } = this.layout;
    return this.layout.crates.map((c) => {
      const [cx, cz] = map.cellCenter(c.cell[0], c.cell[1]);
      const depth = this.plan.depthOf.get(`${c.cell[0]},${c.cell[1]},${c.back}`) || 0;
      const reach = map.cellSize / 2 - T - depth - c.size * 0.62 - 0.03;
      const x = cx + DIRS[c.back][0] * reach, z = cz + DIRS[c.back][1] * reach;
      const h = c.size * 0.62;
      return { ...c, x, z, box: [x - h, z - h, x + h, z + h] };
    });
  }

  planClutter(rng) {
    const out = [];
    const overlaps = (b) => this.machines.some((m) => b[0] < m.box[2] && b[2] > m.box[0] && b[1] < m.box[3] && b[3] > m.box[1])
      || this.crateSpots.some((m) => b[0] < m.box[2] && b[2] > m.box[0] && b[1] < m.box[3] && b[3] > m.box[1]);
    const place = (spot, type, D, L, solid) => {
      const x = spot.x + spot.nx * (D / 2 + 0.02), z = spot.z + spot.nz * (D / 2 + 0.02);
      const hx = (spot.a === 0 ? L : D) / 2, hz = (spot.a === 0 ? D : L) / 2;
      const box = [x - hx, z - hz, x + hx, z + hz];
      if (overlaps(box)) return;
      out.push({ type, x, z, rot: Math.atan2(spot.nx, spot.nz), box: solid ? box : null, seed: rng.next() });
    };
    const kinds = [
      ['drum', 0.6, 0.6, true, 3], ['drums2', 0.6, 1.25, true, 2], ['boxes', 0.5, 0.9, true, 3], ['spool', 0.5, 0.85, true, 1],
      ['bottles', 0.3, 0.6, true, 2], ['toolbox', 0.25, 0.5, false, 2], ['debris', 0.5, 1.0, false, 3], ['tubes', 0.3, 1.2, false, 2],
      ['bucket', 0.35, 0.35, false, 1],
    ];
    const pick = () => {
      let w = rng.next() * kinds.reduce((a, k) => a + k[4], 0);
      for (const k of kinds) if ((w -= k[4]) <= 0) return k;
      return kinds[0];
    };
    for (const spot of this.plan.clutter) {
      const [type, D, L, solid] = pick();
      place(spot, type, D, L, solid);
    }
    // Some dead ends hold junk instead of a door or a crate.
    const { map } = this.layout;
    for (const c of this.layout.freeDeadEnds) {
      if (!rng.chance(0.45)) continue;
      const back = c.dir ^ 1;
      const [cx, cz] = map.cellCenter(c.x, c.y);
      const depth = this.plan.depthOf.get(`${c.x},${c.y},${back}`) || 0;
      const face = map.cellSize / 2 - T - depth;
      const spot = { x: cx + DIRS[back][0] * face, z: cz + DIRS[back][1] * face, nx: -DIRS[back][0], nz: -DIRS[back][1], a: back >= 2 ? 0 : 1 };
      const [type, D, L, solid] = rng.chance(0.5) ? ['debris', 0.5, 1.0, false] : rng.chance(0.5) ? ['drums2', 0.6, 1.25, true] : ['boxes', 0.5, 0.9, true];
      place(spot, type, D, L, solid);
    }
    return out;
  }

  // ---- Build ---------------------------------------------------------------

  // The 45-degree cuts: one diagonal wall face per turn.
  buildChamfers() {
    const { map, sections, sectionOf } = this.layout;
    const H = map.height;
    const geos = {};
    for (const q of this.plan.chamferQuads) {
      const style = sections[sectionOf(q.cell[0], q.cell[1])].brick ? 'brick' : 'wall';
      const g = (geos[style] ||= new GeoBuilder());
      const len = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      const u0 = q.a[0] + q.a[1];
      g.quad([q.a[0], 0, q.a[1]], [q.b[0], 0, q.b[1]], [q.b[0], H, q.b[1]], [q.a[0], H, q.a[1]], [q.n[0], 0, q.n[1]],
        [u0, 0], [u0 + len, 0], [u0 + len, H], [u0, H]);
    }
    for (const [style, g] of Object.entries(geos)) {
      const geo = g.build();
      if (!geo) continue;
      this.ownGeos.push(geo);
      this.props.add(new THREE.Mesh(geo, this.world.materials[style]));
    }
  }

  buildServices() {
    const { cb, plan } = this;
    const H = this.map.height;
    for (const p of plan.pipes) {
      const name = PIPE_MAT[p.k];
      const seg = PIPE_SEG[p.k] || 6;
      const vScale = PIPE_V[p.k] || 0.6;
      let v = 0;
      const pts = p.pts;
      // Bends: each segment runs on past the corner by r*tan(angle/2), so
      // the two overlap into a solid joint without extra elbow geometry.
      const ext = pts.map((q, j) => {
        if (j === 0 || j === pts.length - 1) return 0;
        const a = pts[j - 1], c = pts[j + 1];
        const d1 = unit([q[0] - a[0], q[1] - a[1], q[2] - a[2]]), d2 = unit([c[0] - q[0], c[1] - q[1], c[2] - q[2]]);
        const cos = Math.max(-0.99, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]));
        return Math.min(1, Math.sqrt((1 - cos) / (1 + cos))) * p.r;
      });
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const d = [(c[0] - a[0]) / len, (c[1] - a[1]) / len, (c[2] - a[2]) / len];
        const a2 = [a[0] - d[0] * ext[i], a[1] - d[1] * ext[i], a[2] - d[2] * ext[i]];
        const c2 = [c[0] + d[0] * ext[i + 1], c[1] + d[1] * ext[i + 1], c[2] + d[2] * ext[i + 1]];
        const b = cb.at(name, (a[0] + c[0]) / 2, (a[2] + c[2]) / 2);
        b.cylinder(a2, c2, p.r, seg, { vScale, v0: v - ext[i] * vScale });
        v += len * vScale;
        // Flanged joints every few metres on bare metal pipe.
        if (p.flanges && p.r >= 0.035 && len > 1.2) {
          const n = Math.floor(len / 3.2);
          for (let k = 1; k <= n; k++) {
            const t = k / (n + 1), t2 = t + 0.05 / len;
            const f0 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
            const f1 = [a[0] + (c[0] - a[0]) * t2, a[1] + (c[1] - a[1]) * t2, a[2] + (c[2] - a[2]) * t2];
            b.cylinder(f0, f1, p.r * 1.4, seg);
          }
        }
        // Lagging has metal bands at its seams.
        if (p.k === 'lag' && len > 1.5 && Math.abs(c[1] - a[1]) < 0.01) {
          const n = Math.floor(len / 1.7);
          for (let k = 1; k <= n; k++) {
            const t = k / (n + 1), t2 = t + 0.03 / len;
            const f0 = [a[0] + (c[0] - a[0]) * t, a[1], a[2] + (c[2] - a[2]) * t];
            const f1 = [a[0] + (c[0] - a[0]) * t2, a[1], a[2] + (c[2] - a[2]) * t2];
            cb.at('galv', f0[0], f0[2]).cylinder(f0, f1, p.r * 1.03, seg);
          }
        }
        // A valve now and then.
        if ((p.k === 'rust' || p.k === 'red') && p.r >= 0.05 && len > 2 && !p.ceiling && this.drng.chance(0.18)) {
          const t = this.drng.range(0.3, 0.7);
          const m = [a[0] + (c[0] - a[0]) * t, a[1], a[2] + (c[2] - a[2]) * t];
          this.valve(m, [c[0] - a[0], 0, c[2] - a[2]], p.r);
        }
      }
    }
    // Strut channel brackets and their arms.
    for (const s of plan.struts) {
      cb.at('strut', s.x, s.z).box(s.x, (s.y0 + s.y1) / 2, s.z, s.a === 0 ? 0.042 : 0.045, s.y1 - s.y0, s.a === 0 ? 0.045 : 0.042, 0, 1, NO_CAPS);
    }
    for (const [x, y, z, sx, sy, sz] of plan.arms) cb.at('strut', x, z).box(x, y, z, sx, sy, sz, 0, 1, NO_TOP);
    // Ledges.
    for (const [x0, z0, x1, z1] of plan.ledges) {
      cb.at('ledge', (x0 + x1) / 2, (z0 + z1) / 2).aabb(x0, 0, z0, x1, LEDGE.h, z1, 1, ['bottom']);
    }
    // Cable trays with their load.
    for (const t of plan.trays) {
      const b = cb.at('strut', (t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2);
      const x0 = Math.min(t.a[0], t.b[0]), x1 = Math.max(t.a[0], t.b[0]);
      const z0 = Math.min(t.a[1], t.b[1]), z1 = Math.max(t.a[1], t.b[1]);
      const w = t.w / 2;
      if (t.axis === 0) {
        b.aabb(x0, t.y - 0.01, z0 - w, x1, t.y, z0 + w);
        b.aabb(x0, t.y, z0 - w, x1, t.y + 0.08, z0 - w + 0.012);
        b.aabb(x0, t.y, z0 + w - 0.012, x1, t.y + 0.08, z0 + w);
      } else {
        b.aabb(x0 - w, t.y - 0.01, z0, x0 + w, t.y, z1);
        b.aabb(x0 - w, t.y, z0, x0 - w + 0.012, t.y + 0.08, z1);
        b.aabb(x0 + w - 0.012, t.y, z0, x0 + w, t.y + 0.08, z1);
      }
      const cables = cb.at('cable', (x0 + x1) / 2, (z0 + z1) / 2);
      for (let k = 0; k < 5; k++) {
        const o = -w + 0.04 + k * ((t.w - 0.08) / 4);
        const r = 0.018 + (k % 2) * 0.008;
        const y = t.y + r + (k % 3 === 1 ? 0.02 : 0);
        if (t.axis === 0) cables.cylinder([x0, y, z0 + o], [x1, y, z0 + o], r, 5);
        else cables.cylinder([x0 + o, y, z0], [x0 + o, y, z1], r, 5);
      }
    }
    // Hangers: threaded rods and a trapeze bar.
    for (const h of plan.hangers) {
      const b = cb.at('strut', h.x, h.z);
      const p0 = [h.x + h.lat[0] * h.o0, h.z + h.lat[1] * h.o0];
      const p1 = [h.x + h.lat[0] * h.o1, h.z + h.lat[1] * h.o1];
      for (const p of [p0, p1]) b.cylinder([p[0], H, p[1]], [p[0], h.y - 0.02, p[1]], 0.008, 4);
      const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
      const len = h.o1 - h.o0 + 0.04;
      b.box(cx, h.y - 0.02, cz, h.axis === 0 ? 0.04 : len, 0.04, h.axis === 0 ? len : 0.04);
    }
  }

  // Handwheel valve on a pipe: body, stem and a red wheel.
  valve(m, along, r) {
    const b = this.cb.at('red', m[0], m[2]);
    const l = Math.hypot(along[0], along[2]) || 1;
    const d = [along[0] / l, 0, along[2] / l];
    this.cb.at('rust', m[0], m[2]).cylinder([m[0] - d[0] * r * 1.6, m[1], m[2] - d[2] * r * 1.6], [m[0] + d[0] * r * 1.6, m[1], m[2] + d[2] * r * 1.6], r * 1.5, 8, { caps: true });
    const top = [m[0], m[1] + r * 1.5 + 0.12, m[2]];
    this.cb.at('galv', m[0], m[2]).cylinder([m[0], m[1] + r, m[2]], top, 0.012, 5);
    const R = 0.11;
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      b.cylinder([top[0] + Math.cos(a0) * R, top[1], top[2] + Math.sin(a0) * R], [top[0] + Math.cos(a1) * R, top[1], top[2] + Math.sin(a1) * R], 0.012, 4);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      b.cylinder(top, [top[0] + Math.cos(a) * R, top[1], top[2] + Math.sin(a) * R], 0.008, 4);
    }
  }

  // Fixtures: bare tubes and caged bulbs. The glowing parts are instanced
  // so they can flicker and die one by one.
  buildFixtures() {
    const { cb } = this;
    const H = this.map.height;
    const lights = this.layout.lights;
    const tubes = [], bulbs = [];
    lights.forEach((l, i) => {
      if (l.type === 'tube') {
        const along = l.axis === 1;
        const sx = along ? 0.07 : 1.3, sz = along ? 1.3 : 0.07;
        const b = cb.at('housing', l.x, l.z);
        b.box(l.x, H - 0.025, l.z, sx, 0.05, sz);
        for (const s of [-0.62, 0.62]) b.box(l.x + (along ? 0 : s), H - 0.075, l.z + (along ? s : 0), 0.04, 0.05, 0.04);
        // Some dead tubes are gone entirely; the glass is on the floor.
        l.missing = l.state === 'off' && this.drng.chance(0.35);
        if (l.missing) this.brokenGlass(l.x, l.z);
        tubes.push(i);
      } else {
        const b = cb.at('cage', l.x, l.z);
        b.box(l.x, H - 0.03, l.z, 0.12, 0.06, 0.12);
        b.cylinder([l.x, H - 0.06, l.z], [l.x, H - 0.17, l.z], 0.014, 5);
        b.cylinder([l.x, H - 0.17, l.z], [l.x, H - 0.19, l.z], 0.085, 6);
        b.cylinder([l.x, H - 0.31, l.z], [l.x, H - 0.33, l.z], 0.06, 6);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          b.cylinder([l.x + Math.cos(a) * 0.084, H - 0.18, l.z + Math.sin(a) * 0.084], [l.x + Math.cos(a) * 0.06, H - 0.33, l.z + Math.sin(a) * 0.06], 0.005, 3);
        }
        bulbs.push(i);
      }
    });
    const tubeGeo = new THREE.CylinderGeometry(0.019, 0.019, 1.18, 6, 1, true);
    tubeGeo.rotateZ(Math.PI / 2);
    const bulbGeo = new THREE.SphereGeometry(0.055, 7, 5);
    this.ownGeos.push(tubeGeo, bulbGeo);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ownMats.push(this.glowMat);
    const make = (geo, list) => {
      const mesh = new THREE.InstancedMesh(geo, this.glowMat, Math.max(1, list.length));
      const m = new THREE.Matrix4();
      list.forEach((li, k) => {
        const l = lights[li];
        if (l.type === 'tube') {
          m.makeRotationY(l.axis === 1 ? Math.PI / 2 : 0);
          m.setPosition(l.x, H - 0.085, l.z);
          if (l.missing) m.makeScale(0, 0, 0);
        } else {
          m.makeTranslation(l.x, H - 0.25, l.z);
        }
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, new THREE.Color(0, 0, 0));
        l.inst = { mesh, k };
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.props.add(mesh);
      return mesh;
    };
    this.tubeMesh = make(tubeGeo, tubes);
    this.bulbMesh = make(bulbGeo, bulbs);

    // Soft halos around lit fixtures.
    this.glowTex = glowTexture();
    const halo = (list, size) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
      list.forEach((li, k) => {
        const l = lights[li];
        pos.set([l.x, H - (l.type === 'tube' ? 0.1 : 0.25), l.z], k * 3);
        l.halo = { geo, k };
      });
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size, map: this.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.ownGeos.push(geo);
      this.ownMats.push(mat);
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.props.add(pts);
    };
    halo(tubes, 1.5);
    halo(bulbs, 0.9);
    lights.forEach((l, i) => this.setFixture(i, l.state === 'on' ? 1 : l.state === 'flicker' ? 0.6 : 0));
  }

  setFixture(i, level) {
    const l = this.layout.lights[i];
    if (l.level === level) return;
    l.level = level;
    const tube = l.type === 'tube';
    const base = tube ? [1, 1, 1] : [1, 0.72, 0.36];
    const dead = tube ? 0.2 : 0.1;
    const k = level > 0.02 ? 0.25 + 0.75 * level : 0;
    const c = level > 0.02 ? [base[0] * k, base[1] * k, base[2] * k] : [dead, dead * 0.98, dead * 0.94];
    l.inst.mesh.setColorAt(l.inst.k, _c.setRGB(c[0], c[1], c[2]));
    l.inst.mesh.instanceColor.needsUpdate = true;
    const h = tube ? 0.32 : 0.55;
    const col = l.halo.geo.attributes.color;
    col.setXYZ(l.halo.k, base[0] * level * h, base[1] * level * h, base[2] * level * h);
    col.needsUpdate = true;
  }

  brokenGlass(x, z) {
    const b = this.cb.at('glass', x, z);
    const r = this.drng;
    for (let k = 0; k < 3; k++) {
      const a = r.range(0, Math.PI), len = r.range(0.15, 0.5);
      const cx = x + r.range(-0.4, 0.4), cz = z + r.range(-0.4, 0.4);
      b.cylinder([cx - Math.cos(a) * len / 2, 0.018, cz - Math.sin(a) * len / 2], [cx + Math.cos(a) * len / 2, 0.018, cz + Math.sin(a) * len / 2], 0.017, 5);
    }
  }

  // Local (along wall, up, out of wall) -> world, for a placed object.
  static place(o, lx, ly, lz) {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    return [o.x + lx * c + lz * s, ly, o.z - lx * s + lz * c];
  }

  buildMachines() {
    const { cb } = this;
    const H = this.map.height;
    const W = Level2.place;
    this.machineSpots = [];
    const boxes = { cabinet: [], machine: [] };
    // A box in a machine's local frame, as a uv-per-face BoxGeometry
    // (cabinet faces show the whole cabinet texture).
    const panelBox = (m, mat, lx, ly, lz, sx, sy, sz) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.rotateY(m.rot);
      const [x, y, z] = W(m, lx, ly, lz);
      g.translate(x, y, z);
      boxes[mat].push(g);
    };
    for (const m of this.machines) {
      const at = (lx, ly, lz) => W(m, lx, ly, lz);
      const box = (mat, lx, ly, lz, sx, sy, sz) => {
        const [x, y, z] = at(lx, ly, lz);
        cb.at(mat, x, z).box(x, y, z, sx, sy, sz, m.rot);
      };
      const cyl = (mat, a, b, rad, seg = 10, caps = true) => cb.at(mat, m.x, m.z).cylinder(at(...a), at(...b), rad, seg, { caps, vScale: 0.6 });
      const back = -m.D / 2;
      switch (m.type) {
        case 'boiler': {
          for (const sx of [-0.9, 0.9]) box('concrete', sx, 0.22, 0, 0.32, 0.44, 0.95);
          cyl('lag', [-1.3, 0.98, 0], [1.3, 0.98, 0], 0.55, 16);
          for (const sx of [-1.33, 1.33]) cyl('machine', [sx, 0.98, 0], [sx + Math.sign(sx) * 0.05, 0.98, 0], 0.5, 16);
          for (const sx of [-0.85, 0, 0.85]) cyl('galv', [sx, 0.98, 0], [sx + 0.04, 0.98, 0], 0.565, 16, false);
          cyl('machine', [1.38, 0.98, 0], [1.46, 0.98, 0], 0.26, 12);
          for (const [sx, rad] of [[-0.6, 0.08], [0.7, 0.06]]) {
            cyl('rust', [sx, 1.4, 0], [sx, H + 0.05, 0], rad, 8, false);
            cyl('rust', [sx, 1.95, 0], [sx, 2.0, 0], rad * 1.4, 8);
          }
          this.valve(at(0.7, 1.75, 0), [Math.cos(m.rot), 0, -Math.sin(m.rot)], 0.06);
          this.dialSpot(at(0.3, 1.12, 0.565), m.rot, 0.12);
          this.dialSpot(at(-0.25, 1.2, 0.55), m.rot, 0.09);
          this.machineSpots.push({ x: m.x, z: m.z, loud: 1 });
          break;
        }
        case 'cabinets': {
          for (const sx of [-0.33, 0.33]) panelBox(m, 'cabinet', sx, 0.95, 0, 0.62, 1.9, 0.5);
          for (const sx of [-0.33, 0.33]) cyl('conduit', [sx, 1.9, back + 0.15], [sx, H + 0.05, back + 0.15], 0.025, 5, false);
          this.machineSpots.push({ x: m.x, z: m.z, loud: 0.35 });
          break;
        }
        case 'pump': {
          box('concrete', 0, 0.12, 0, 1.25, 0.24, 0.72);
          cyl('machine', [-0.58, 0.5, 0], [0.02, 0.5, 0], 0.2, 12);
          for (let k = 0; k < 6; k++) cyl('machine', [-0.5 + k * 0.09, 0.5, 0], [-0.48 + k * 0.09, 0.5, 0], 0.215, 12, false);
          box('drumYellow', 0.13, 0.5, 0, 0.2, 0.22, 0.24);
          cyl('machine', [0.38, 0.5, -0.12], [0.38, 0.5, 0.14], 0.26, 12);
          cyl('rust', [0.38, 0.76, 0], [0.38, H + 0.05, 0], 0.08, 8, false);
          cyl('rust', [0.38, 0.5, back + 0.05], [0.38, 0.5, -0.12], 0.08, 8, false);
          this.valve(at(0.38, 1.3, 0), [0, 1, 0], 0.08);
          this.dialSpot(at(0.38, 1.0, 0.09), m.rot, 0.07);
          this.machineSpots.push({ x: m.x, z: m.z, loud: 0.8 });
          break;
        }
        case 'tank': {
          cyl('rust', [0, 0.12, 0], [0, 1.8, 0], 0.37, 14);
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2;
            cyl('steel', [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.3, 0.14, Math.sin(a) * 0.3], 0.03, 5);
          }
          cyl('galv', [0, 1.8, 0], [0, H + 0.05, 0], 0.05, 7, false);
          this.dialSpot(at(0, 1.25, 0.375), m.rot, 0.08);
          break;
        }
        case 'panel': {
          panelBox(m, 'cabinet', 0, 1.35, back + 0.11, 0.7, 0.95, 0.2);
          for (const sx of [-0.22, 0, 0.22]) cyl('conduit', [sx, 1.82, back + 0.08], [sx, H + 0.05, back + 0.08], 0.02, 5, false);
          break;
        }
        case 'generator': {
          box('concrete', 0, 0.06, 0, 1.75, 0.12, 0.8);
          panelBox(m, 'machine', 0, 0.62, 0, 1.6, 1.0, 0.72);
          box('steel', 0.82, 0.62, 0, 0.06, 0.9, 0.6);
          cyl('rust', [-0.5, 1.12, 0], [-0.5, H + 0.05, 0], 0.06, 8, false);
          this.machineSpots.push({ x: m.x, z: m.z, loud: 0.9 });
          break;
        }
      }
    }
    for (const [name, list] of Object.entries(boxes)) {
      if (!list.length) continue;
      const g = mergeGeometries(list);
      for (const piece of list) piece.dispose();
      this.ownGeos.push(g);
      this.props.add(new THREE.Mesh(g, name === 'cabinet' ? this.mats.cabinet : this.mats.machine));
    }
  }

  dialSpot(pos, rot, size) {
    (this.dialSpots ||= []).push({ pos, rot, size });
  }

  buildDials() {
    const faceGeo = new THREE.CircleGeometry(1, 20);
    const needleGeo = new THREE.BoxGeometry(0.08, 0.8, 0.04);
    needleGeo.translate(0, 0.32, 0);
    this.ownGeos.push(faceGeo, needleGeo);
    this.needleMat = new THREE.MeshBasicMaterial({ color: 0x4a0806 });
    this.ownMats.push(this.needleMat);
    for (const d of this.dialSpots || []) {
      const holder = new THREE.Group();
      const face = new THREE.Mesh(faceGeo, this.mats.gauge);
      const needle = new THREE.Mesh(needleGeo, this.needleMat);
      needle.position.z = 0.01;
      holder.add(face, needle);
      holder.scale.setScalar(d.size);
      holder.position.set(d.pos[0], d.pos[1], d.pos[2]);
      holder.rotation.y = d.rot;
      this.props.add(holder);
      this.dials.push({ needle, base: this.drng.range(-1.2, 1.2), phase: this.drng.next() * 10, k: this.drng.next() });
    }
  }

  buildClutter() {
    const W = Level2.place;
    for (const c of this.clutter) {
      const r = createSeeded(c.seed);
      const at = (lx, ly, lz) => W(c, lx, ly, lz);
      const b = (mat) => this.cb.at(mat, c.x, c.z);
      const drum = (lx, lz) => {
        const mat = r() < 0.45 ? 'drumBlue' : r() < 0.6 ? 'drumRust' : 'drumYellow';
        const p = at(lx, 0, lz);
        b(mat).cylinder([p[0], 0, p[2]], [p[0], 0.88, p[2]], 0.29, 12, { caps: true });
        for (const y of [0.29, 0.59]) b('steel').cylinder([p[0], y, p[2]], [p[0], y + 0.025, p[2]], 0.296, 12);
      };
      switch (c.type) {
        case 'drum': drum(0, 0); break;
        case 'drums2': drum(-0.31, 0); drum(0.32, 0.02); break;
        case 'boxes': {
          let y = 0;
          for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
            const w = 0.45 + r() * 0.35, h = 0.3 + r() * 0.2, d = 0.4 + r() * 0.08;
            const [x, , z] = at((r() - 0.5) * 0.2, 0, 0);
            b('cardboard').box(x, y + h / 2, z, w, h, d, c.rot + (r() - 0.5) * 0.4);
            y += h;
          }
          break;
        }
        case 'spool': {
          const a = at(-0.32, 0.4, 0), e = at(0.32, 0.4, 0);
          b('wood').cylinder(a, at(-0.27, 0.4, 0), 0.4, 14, { caps: true });
          b('wood').cylinder(at(0.27, 0.4, 0), e, 0.4, 14, { caps: true });
          b('cable').cylinder(at(-0.27, 0.4, 0), at(0.27, 0.4, 0), 0.3, 12);
          break;
        }
        case 'bottles':
          for (let k = 0; k < 3; k++) {
            const p = at(-0.2 + k * 0.2, 0, (r() - 0.5) * 0.06);
            const mat = r() < 0.5 ? 'bottleGreen' : 'bottleGrey';
            b(mat).cylinder([p[0], 0, p[2]], [p[0], 1.25, p[2]], 0.1, 9, { caps: true });
            b('galv').cylinder([p[0], 1.25, p[2]], [p[0], 1.36, p[2]], 0.035, 6, { caps: true });
          }
          break;
        case 'toolbox': {
          const [x, , z] = at(0, 0, 0);
          b('toolRed').box(x, 0.11, z, 0.48, 0.22, 0.22, c.rot);
          b('steel').box(x, 0.25, z, 0.3, 0.03, 0.03, c.rot);
          const [wx, , wz] = at(0.4, 0, 0.05);
          b('steel').box(wx, 0.015, wz, 0.3, 0.03, 0.05, c.rot + 0.7);
          break;
        }
        case 'debris':
          for (let k = 0; k < 9; k++) {
            const [x, , z] = at((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.4);
            const s = 0.06 + r() * 0.16;
            b('rubble').box(x, s * 0.35, z, s, s * 0.7, s * (0.6 + r() * 0.6), r() * 3);
          }
          for (let k = 0; k < 2; k++) {
            const [x, , z] = at((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.3);
            b('wood').box(x, 0.03, z, 0.7 + r() * 0.4, 0.04, 0.09, r() * 3);
          }
          break;
        case 'tubes':
          for (let k = 0; k < 3; k++) {
            const a = at(-0.5 + r() * 0.3, 0.02, -0.1 + k * 0.08), e = at(0.1 + r() * 0.4, 0.02, -0.08 + k * 0.08 + (r() - 0.5) * 0.1);
            b('glass').cylinder(a, e, 0.018, 5);
          }
          break;
        case 'bucket': {
          const p = at(0, 0, 0);
          b('drumYellow').cylinder([p[0], 0, p[2]], [p[0], 0.34, p[2]], 0.15, 10, { caps: true });
          break;
        }
      }
    }
  }

  // Rubble, paper and glass on the tunnel floors.
  buildDebris() {
    const { map, kind } = this.layout;
    const r = this.drng.fork('debris');
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        if (kind[map.idx(x, y)] !== KIND.TUNNEL || !r.chance(0.3)) continue;
        const [cx, cz] = map.cellCenter(x, y);
        const n = r.int(2, 6);
        for (let k = 0; k < n; k++) {
          const px = cx + r.range(-0.75, 0.75), pz = cz + r.range(-0.75, 0.75);
          const t = r.next();
          if (t < 0.55) {
            const s = r.range(0.03, 0.09);
            this.cb.at('rubble', px, pz).box(px, s * 0.3, pz, s, s * 0.6, s * r.range(0.6, 1.4), r.range(0, 3), 1, ['bottom']);
          } else if (t < 0.85) {
            const b = this.cb.at('paper', px, pz);
            const a = r.range(0, Math.PI), c = Math.cos(a), s = Math.sin(a);
            const w = 0.1, h = 0.14;
            const P = (u, v) => [px + u * c - v * s, 0.004, pz + u * s + v * c];
            b.quad(P(-w, -h), P(w, -h), P(w, h), P(-w, h), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
          } else {
            this.cb.at('wood', px, pz).box(px, 0.02, pz, r.range(0.4, 0.9), 0.035, 0.07, r.range(0, Math.PI));
          }
        }
      }
    }
  }

  buildSigns() {
    for (const s of this.plan.signs) {
      const k = this.drng.int(0, SIGN_TILES - 1);
      const u0 = k / SIGN_TILES, u1 = (k + 1) / SIGN_TILES;
      const w = 0.17;
      const tx = -s.nz, tz = s.nx; // along the wall
      const b = this.cb.at('signs', s.x, s.z);
      const p = (u, v) => [s.x + tx * u, s.y + v, s.z + tz * u];
      // Face the tunnel: u runs to the viewer's right.
      b.quad(p(w, -w), p(-w, -w), p(-w, w), p(w, w), [s.nx, 0, s.nz], [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
    }
  }

  // ---- Doors ------------------------------------------------------------------

  buildDoors() {
    const { map } = this.layout;
    const cs = map.cellSize;
    this.doors = [];
    this.slabGeo = new THREE.BoxGeometry(0.95, 2.05, 0.06);
    this.ownGeos.push(this.slabGeo);
    for (const d of this.layout.doors) {
      const [cx, cz] = map.cellCenter(d.x, d.y);
      const nx = -DIRS[d.dir][0], nz = -DIRS[d.dir][1];
      const fx = cx + DIRS[d.dir][0] * (cs / 2 - T), fz = cz + DIRS[d.dir][1] * (cs / 2 - T);
      const o = { x: fx, z: fz, rot: Math.atan2(nx, nz) };
      const at = (lx, ly, lz) => Level2.place(o, lx, ly, lz);
      const box = (mat, lx, ly, lz, sx, sy, sz) => {
        const [x, y, z] = at(lx, ly, lz);
        this.cb.at(mat, x, z).box(x, y, z, sx, sy, sz, o.rot);
      };
      const wood = d.type === 'exit4';
      const frame = wood ? 'doorWood' : 'steel';
      box(frame, -0.53, 1.06, 0.03, 0.09, 2.14, 0.07);
      box(frame, 0.53, 1.06, 0.03, 0.09, 2.14, 0.07);
      box(frame, 0, 2.15, 0.03, 1.15, 0.09, 0.07);
      const slab = new THREE.Mesh(this.slabGeo, this.doorMats[d.type]);
      const [sx, , sz] = at(0, 0, 0.035);
      slab.position.set(sx, 1.025, sz);
      slab.rotation.y = o.rot;
      this.props.add(slab);
      // Lever handle (a knob on the office door).
      if (wood) {
        const p = at(0.36, 1.0, 0.08);
        this.cb.at('brass', p[0], p[2]).sphere(p, 0.035, 8, 5);
      } else {
        box('galv', 0.34, 1.02, 0.09, 0.05, 0.05, 0.05);
        box('galv', 0.26, 1.02, 0.115, 0.17, 0.03, 0.03);
      }
      const door = { ...d, x: fx, z: fz, nx, nz, target: DOOR_TARGET[d.type] || null };
      if (d.type === 'locked' || d.type === 'locked2') {
        if (this.drng.chance(0.4)) {
          // Hasp and padlock.
          box('steel', 0.42, 1.25, 0.075, 0.14, 0.04, 0.025);
          box('brass', 0.47, 1.17, 0.09, 0.07, 0.08, 0.035);
        }
      } else if (d.type === 'exit3') {
        // A red caged lamp over the door and hazard stripes on the floor.
        const lp = at(0, 2.42, 0.12);
        const b = this.cb.at('cage', lp[0], lp[2]);
        b.box(lp[0], lp[1] + 0.06, lp[2], 0.12, 0.05, 0.12, o.rot);
        this.redLampMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
        this.ownMats.push(this.redLampMat);
        const bulbGeo = new THREE.SphereGeometry(0.06, 10, 8);
        this.ownGeos.push(bulbGeo);
        const bulb = new THREE.Mesh(bulbGeo, this.redLampMat);
        bulb.position.set(lp[0], lp[1], lp[2]);
        this.props.add(bulb);
        door.lamp = bulb;
        const [hx, , hz] = at(0, 0, 0.45);
        const hb = this.cb.at('hazard', hx, hz);
        const [ax, , az] = at(-0.6, 0, 0.12), [bx, , bz] = at(0.6, 0, 0.12), [cx2, , cz2] = at(0.6, 0, 0.62), [dx, , dz] = at(-0.6, 0, 0.62);
        hb.quad([ax, 0.005, az], [bx, 0.005, bz], [cx2, 0.005, cz2], [dx, 0.005, dz], [0, 1, 0], [0, 0], [1.2, 0], [1.2, 0.5], [0, 0.5]);
        door.glow = [1, 0.1, 0.04];
        door.glowPos = at(0, 2.2, 0.5);
      } else if (d.type === 'exit4') {
        // Warm light under the door; a scrap of office carpet in front.
        const glowGeo = new THREE.BoxGeometry(0.9, 0.012, 0.25);
        this.ownGeos.push(glowGeo);
        this.warmMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85 });
        this.ownMats.push(this.warmMat);
        const g = new THREE.Mesh(glowGeo, this.warmMat);
        const [gx, , gz] = at(0, 0, 0.17);
        g.position.set(gx, 0.006, gz);
        g.rotation.y = o.rot;
        this.props.add(g);
        const P = (lx, lz) => { const p = at(lx, 0.004, lz); return [p[0], 0.004, p[2]]; };
        const cbuf = this.cb.at('carpet', fx, fz);
        cbuf.quad(P(-0.75, 0.1), P(0.75, 0.1), P(0.75, 1.1), P(-0.75, 1.1), [0, 1, 0], [0, 0], [1.5, 0], [1.5, 1], [0, 1]);
        door.glow = [1, 0.66, 0.32];
        door.glowPos = at(0, 0.15, 0.4);
      } else if (d.type === 'exit1') {
        door.glow = null;
      }
      this.doors.push(door);
    }
  }

  // ---- Crates -----------------------------------------------------------------

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

  // ---- Steam leaks ------------------------------------------------------------

  buildSteam() {
    const cands = this.plan.pipes.filter((p) => !p.ceiling && (p.k === 'lag' || p.k === 'rust') && p.pts.length >= 2);
    const r = this.drng.fork('steam');
    const leaks = [];
    for (let t = 0; t < 40 && leaks.length < 7; t++) {
      const p = r.pick(cands);
      const i = r.int(0, p.pts.length - 2);
      const a = p.pts[i], b = p.pts[i + 1];
      if (Math.abs(a[1] - b[1]) > 0.01 || a[1] > 2) continue;
      const k = r.range(0.2, 0.8);
      const x = a[0] + (b[0] - a[0]) * k, z = a[2] + (b[2] - a[2]) * k;
      const [cx, cy] = this.map.cellAt(x, z);
      const [mx, mz] = this.map.cellCenter(cx, cy);
      const dx = mx - x, dz = mz - z, l = Math.hypot(dx, dz) || 1;
      leaks.push({ x: x + (dx / l) * p.r, y: a[1], z: z + (dz / l) * p.r, dx: dx / l, dz: dz / l, on: r.chance(0.5), t: r.range(0, 4), light: this.world.sampleLight(x, z) });
    }
    this.leaks = leaks;
    const PER = 18;
    this.steamGeo = new THREE.BufferGeometry();
    this.steamPos = new Float32Array(leaks.length * PER * 3);
    this.steamCol = new Float32Array(leaks.length * PER * 3);
    this.steamAge = new Float32Array(leaks.length * PER).fill(99);
    this.steamGeo.setAttribute('position', new THREE.BufferAttribute(this.steamPos, 3));
    this.steamGeo.setAttribute('color', new THREE.BufferAttribute(this.steamCol, 3));
    this.steamMat = new THREE.PointsMaterial({ size: 0.45, map: this.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ownGeos.push(this.steamGeo);
    this.ownMats.push(this.steamMat);
    const pts = new THREE.Points(this.steamGeo, this.steamMat);
    pts.frustumCulled = false;
    this.props.add(pts);
    this.steamPer = PER;
  }

  updateSteam(dt, player) {
    const PER = this.steamPer;
    const g = this.shared.globalLight.value;
    this.leaks.forEach((lk, li) => {
      lk.t -= dt;
      if (lk.t <= 0) {
        lk.on = !lk.on;
        lk.t = lk.on ? this.rng.range(2.5, 6) : this.rng.range(4, 11);
        const d = Math.hypot(lk.x - player.pos.x, lk.z - player.pos.z);
        if (lk.on && d < 16) this.ctx.audio.steam(this.panTo(player, lk.x, lk.z), 0.22 * (1 - d / 16));
      }
      const lit = Math.min(1, 0.12 + (lk.light[0] + lk.light[1] + lk.light[2]) / 3 * 1.2) * g;
      for (let k = 0; k < PER; k++) {
        const i = li * PER + k;
        let age = this.steamAge[i] + dt;
        if (age > 1.1 && lk.on && Math.random() < dt * 14) age = 0;
        this.steamAge[i] = age;
        const o = i * 3;
        if (age > 1.1) {
          this.steamCol[o] = this.steamCol[o + 1] = this.steamCol[o + 2] = 0;
          continue;
        }
        const s = age * 1.3;
        const j = Math.sin(i * 12.9898) * 0.15;
        this.steamPos[o] = lk.x + lk.dx * s + j * s;
        this.steamPos[o + 1] = lk.y + age * age * 0.5 + Math.cos(i * 7.1) * 0.05 * s;
        this.steamPos[o + 2] = lk.z + lk.dz * s - j * s;
        const a = (1 - age / 1.1) * Math.min(1, age * 8) * 0.22 * lit;
        this.steamCol[o] = a;
        this.steamCol[o + 1] = a;
        this.steamCol[o + 2] = a * 0.98;
      }
    });
    this.steamGeo.attributes.position.needsUpdate = true;
    this.steamGeo.attributes.color.needsUpdate = true;
  }

  // ---- Entities -----------------------------------------------------------------

  spawnEntities() {
    const m = this.entities;
    const fake = { pos: new THREE.Vector3(this.spawn.x, 0, this.spawn.z) };
    for (let k = 0; k < 2; k++) m.spawnFar('hound', fake, { min: 30, max: 75 });
    for (let k = 0; k < 3; k++) m.spawnFar('smiler', fake, { min: 22, max: 75 });
    m.spawnFar('skinstealer', fake, { min: 26, max: 70 });
    for (let k = 0; k < 3; k++) m.spawnFar('deathmoth', fake, { min: 18, max: 60, opts: { variant: 'drone' } });
    m.spawnFar('deathmoth', fake, { min: 28, max: 70, opts: { variant: 'soldier' } });
    // Clumps wait in dead ends.
    const { map, spawnDist } = this.layout;
    const spots = this.layout.freeDeadEnds.filter((c) => spawnDist[map.idx(c.x, c.y)] > 14);
    for (let k = 0; k < 2 && spots.length; k++) {
      const c = spots.splice(this.rng.int(0, spots.length - 1), 1)[0];
      const [x, z] = map.cellCenter(c.x, c.y);
      m.spawn('clump', { x, z });
    }
  }

  // ---- Per-frame ------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    const [cx, cy] = this.map.cellAt(player.pos.x, player.pos.z);
    this.here = { cell: [cx, cy], section: this.layout.sectionOf(cx, cy) };

    this.updateBlackout(dt, player);
    this.updateLights(dt, player);
    this.updateSteam(dt, player);
    for (const d of this.dials) {
      d.needle.rotation.z = d.base + Math.sin(this.time * (1.5 + d.k * 4) + d.phase) * (0.08 + d.k * 0.25) + (Math.random() - 0.5) * 0.04;
    }

    // Darkness wears on you.
    const light = this.lightLevel(player.pos.x, player.pos.z);
    const dark = light < 0.07 && !player.flashlight;
    this.darkTime = dark ? this.darkTime + dt : 0;
    player.sanity = Math.max(0, player.sanity - (0.04 + (dark ? 0.22 : 0)) * dt);

    this.updateCrates(player);
    this.updateAmbient(dt, player);

    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.2;
      this.cull(player);
    }

    // Entities.
    const res = this.entities.update(dt, player, ctx);
    for (const e of this.entities.list) e.root.visible = e.distTo(player) < (this.view || VIEW);
    if (player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('The pipes knocked and knocked, and you stopped hearing anything else.');
      return;
    }
    if (res.dead) {
      this.done = true;
      ctx.onDeath(res.cause);
      return;
    }

    // Doors.
    this.lockedCooldown -= dt;
    for (const d of this.doors) {
      if (!nearDoor(d, player.pos.x, player.pos.z)) continue;
      if (d.target) {
        this.done = true;
        ctx.onEscape(d.target, 'door');
        return;
      }
      if (this.lockedCooldown <= 0) {
        this.lockedCooldown = 1.6;
        ctx.audio.rattle(0, 0.35);
        ctx.hud.message('Locked.', 1.2);
      }
    }
  }

  // The fog swallows everything past ~30 m; don't draw what it hides.
  cull(player) {
    const px = player.pos.x, pz = player.pos.z;
    const q = this.ctx.quality?.();
    this.view = q === 'low' ? VIEW - 10 : q === 'medium' ? VIEW - 5 : VIEW;
    for (const k of this.chunkMeshes) {
      k.m.visible = Math.hypot(k.c.x - px, k.c.z - pz) - k.r < this.view;
    }
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

  // Sections lose power all at once, and get it back later.
  updateBlackout(dt, player) {
    const { ctx, layout } = this;
    const b = this.blackout;
    if (!b) {
      this.nextBlackout -= dt;
      if (this.nextBlackout > 0) return;
      // Usually where you are; otherwise next door.
      let s = this.here.section;
      if (!this.rng.chance(0.6)) {
        const sn = Math.round(Math.sqrt(layout.sections.length));
        const nx = (s % sn) + this.rng.int(-1, 1), ny = Math.floor(s / sn) + this.rng.int(-1, 1);
        if (nx >= 0 && ny >= 0 && nx < sn && ny < sn) s = ny * sn + nx;
      }
      const lights = layout.lights.map((l, i) => (l.section === s && l.state !== 'off' ? i : -1)).filter((i) => i >= 0);
      if (!lights.length) {
        this.nextBlackout = 10;
        return;
      }
      this.blackout = { phase: 'warn', t: 0, section: s, lights, dark: this.rng.range(18, 34) };
      const sec = layout.sections[s];
      const d = Math.hypot((sec.x0 + sec.x1) / 2 - player.pos.x, (sec.z0 + sec.z1) / 2 - player.pos.z);
      if (d < 25) ctx.audio.flickerBuzz(1.8, 0.16 * (1 - d / 25) + 0.02);
      return;
    }
    b.t += dt;
    const sec = layout.sections[b.section];
    if (b.phase === 'warn') {
      for (const i of b.lights) this.setFixture(i, Math.random() < 0.5 ? 0.15 : 1);
      if (b.t > 1.8) {
        b.phase = 'dark';
        b.t = 0;
        this.secDark[b.section] = 1;
        b.saved = b.lights.map((i) => layout.lights[i].state);
        for (const i of b.lights) {
          layout.lights[i].state = 'off';
          this.setFixture(i, 0);
        }
        this.world.bakeLightmap({ x0: sec.x0 - 10, z0: sec.z0 - 10, x1: sec.x1 + 10, z1: sec.z1 + 10 });
        const d = Math.hypot((sec.x0 + sec.x1) / 2 - player.pos.x, (sec.z0 + sec.z1) / 2 - player.pos.z);
        if (d < 30) ctx.audio.thud(this.panTo(player, (sec.x0 + sec.x1) / 2, (sec.z0 + sec.z1) / 2), 0.5 * (1 - d / 30) + 0.1);
      }
    } else if (b.phase === 'dark') {
      if (b.t > b.dark) {
        b.phase = 'restore';
        b.t = 0;
        b.lights.forEach((i, k) => (layout.lights[i].state = b.saved[k]));
        this.secDark[b.section] = 0;
        this.world.bakeLightmap({ x0: sec.x0 - 10, z0: sec.z0 - 10, x1: sec.x1 + 10, z1: sec.z1 + 10 });
        ctx.audio.flickerBuzz(1.2, 0.08);
      }
    } else {
      for (const i of b.lights) {
        const l = layout.lights[i];
        if (l.state === 'on') this.setFixture(i, b.t > 1 || Math.random() < 0.6 ? 1 : 0.1);
        else if (l.state === 'off') this.setFixture(i, 0);
      }
      if (b.t > 1.2) {
        this.blackout = null;
        this.nextBlackout = this.rng.range(40, 80);
      }
    }
  }

  updateLights(dt, player) {
    const { shared, layout } = this;
    shared.globalLight.value = 1;
    const H = this.map.height;
    const cands = [];
    for (const i of this.flickers) {
      const l = layout.lights[i];
      if (this.secDark[l.section]) {
        this.setFixture(i, 0);
        continue;
      }
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      const ph = this.phase[i];
      const t = this.time * 8 + ph;
      const on = Math.sin(t * 1.3) + Math.sin(t * 0.41 + ph) * 1.1 > -0.3 && fract(Math.sin(Math.floor(t) * 77.1 + ph) * 43758.5) > 0.25;
      const level = on ? 1 : 0.04;
      if (d < 30) this.setFixture(i, level);
      if (d < 16) cands.push({ d, x: l.x, y: H - (l.type === 'tube' ? 0.15 : 0.3), z: l.z, power: l.power * 1.15 * level, color: l.color });
    }
    // The odd doors glow.
    for (const door of this.doors) {
      if (!door.glow) continue;
      const d = Math.hypot(door.x - player.pos.x, door.z - player.pos.z);
      if (d > 14) continue;
      const pulse = door.type === 'exit3' ? 0.55 + 0.45 * Math.abs(Math.sin(this.time * 2.2)) : 0.85 + Math.sin(this.time * 0.7) * 0.1;
      cands.push({ d, x: door.glowPos[0], y: door.glowPos[1], z: door.glowPos[2], power: (door.type === 'exit3' ? 0.9 : 0.7) * pulse, color: door.glow });
      if (door.lamp) this.redLampMat.color.setRGB(0.35 + 0.65 * pulse, 0.05 * pulse, 0.03);
    }
    cands.sort((a, b) => a.d - b.d);
    let nearest = Infinity;
    for (let k = 0; k < MAX_DYN_LIGHTS; k++) {
      const pos = shared.dynPos.value[k], col = shared.dynCol.value[k];
      const c = cands[k];
      if (!c) {
        pos.set(0, -100, 0, 0);
        continue;
      }
      pos.set(c.x, c.y, c.z, c.power);
      col.setRGB(c.color[0], c.color[1], c.color[2]);
      nearest = Math.min(nearest, c.d);
    }
    this.buzzTimer -= dt;
    if (nearest < 6 && this.buzzTimer <= 0) {
      this.ctx.audio.flickerBuzz(1.1, 0.07 * (1 - nearest / 6));
      this.buzzTimer = 1.1;
    }
  }

  updateCrates(player) {
    for (const c of this.crates) {
      if (c.opened) continue;
      if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 1.25) continue;
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
    const hud = ctx.hud;
    const table = [['water', 30], ['battery', 26], ['aid', 18], ['junk', 18], ['bad', 8]];
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
      default:
        player.damage(8);
        ctx.hurtFlash(0.35);
        ctx.audio.steam(0, 0.35);
        hud.message('A crate: a burst of scalding steam from a pipe behind it.', 3);
    }
  }

  updateAmbient(dt, player) {
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = this.rng.range(1.8, 5);
    const pan = this.rng.range(-1, 1);
    const r = this.rng.next();
    const a = this.ctx.audio;
    if (r < 0.3) a.pipeKnock(pan, this.rng.range(0.06, 0.2));
    else if (r < 0.5) a.clank(pan, this.rng.range(0.04, 0.12));
    else if (r < 0.72) a.drip(pan, this.rng.range(0.05, 0.14));
    else if (r < 0.8) a.creak(pan, 0.12);
    else if (r < 0.86) a.steam(pan, 0.06);
    else if (r < 0.92 && player.sanity < 60) a.whisper(pan, 0.14);
    else a.phantomSteps(pan * 0.7);
    // Something drips near the green door.
    for (const d of this.doors) {
      if (d.type !== 'exit1') continue;
      const dd = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
      if (dd < 14) a.drip(this.panTo(player, d.x, d.z), 0.2 * (1 - dd / 14));
    }
    for (const d of this.doors) {
      if (d.type !== 'exit3') continue;
      const dd = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
      if (dd < 16 && this.rng.chance(0.6)) a.arc(this.panTo(player, d.x, d.z), 0.18 * (1 - dd / 16));
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

  // ---- Values the game reads every frame -------------------------------------

  audioMix(player) {
    const px = player.pos.x, pz = player.pos.z;
    // Fluorescent buzz from working tubes close by.
    let hum = 0.008;
    for (const [i, d] of this.world.lightsNear(px, pz, 5)) {
      const l = this.layout.lights[i];
      if (l.type === 'tube' && (l.level || 0) > 0.5) hum = Math.max(hum, 0.06 * (1 - d / 5));
    }
    // Machinery.
    let machine = 0, machinePan = 0;
    for (const m of this.machineSpots) {
      const d = Math.hypot(m.x - px, m.z - pz);
      if (d > 26) continue;
      const walls = this.map.wallsBetween(px, pz, m.x, m.z, 3);
      const g = (0.4 * m.loud / (1 + (d / 4.5) ** 2)) * Math.pow(0.55, walls);
      if (g > machine) {
        machine = g;
        machinePan = this.panTo(player, m.x, m.z);
      }
    }
    // The odd doors: each has its own sound.
    let exitGain = 0, exitPan = 0, exitType = 'static';
    for (const d of this.doors) {
      if (!d.target) continue;
      const dist = Math.hypot(d.x - px, d.z - pz);
      if (dist > 24) continue;
      const walls = this.map.wallsBetween(px, pz, d.x + d.nx * 0.4, d.z + d.nz * 0.4, 3);
      const g = (0.32 / (1 + (dist / 5) ** 2)) * Math.pow(0.55, walls);
      if (g > exitGain) {
        exitGain = g;
        exitPan = this.panTo(player, d.x, d.z);
        exitType = d.type === 'exit3' ? 'static' : d.type === 'exit4' ? 'hum' : 'steam';
      }
    }
    let drone = 0;
    for (const e of this.entities.list) {
      if (!['chase', 'hunt', 'attack', 'stalk', 'lunge', 'dive'].includes(e.state)) continue;
      drone = Math.max(drone, 0.3 * Math.max(0, 1 - e.distTo(player) / 25));
    }
    return { hum, exitGain, exitPan, exitType, drone, machine, machinePan, sanity: player.sanity, ears: player.coveringEars };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const target = new THREE.Color(0.006 + r * 0.32, 0.006 + g * 0.31, 0.006 + b * 0.3);
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    const lum = (r + g + b) / 3;
    this.lum += (lum - this.lum) * Math.min(1, dt * 3);
    const dens = 0.042 + (1 - Math.min(1, this.lum * 2.2)) * 0.035;
    this.fogDensity += (dens - this.fogDensity) * Math.min(1, dt * 2);
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    let shake = 0;
    for (const e of this.entities.list) {
      if (e.type === 'hound' && (e.state === 'chase' || e.state === 'attack')) shake = Math.max(shake, 0.5 - e.distTo(player) / 20);
    }
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.2 + hurt * 0.3,
      aberr: 0.35 + insanity * 1.4 + hurt * 1.2,
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
    for (const g of this.ownGeos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    this.glowTex.dispose();
    disposeTextures(this.textures);
  }
}

const _c = new THREE.Color();
const NO_CAPS = ['top', 'bottom'];
const NO_TOP = ['top'];

function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function fract(x) {
  return x - Math.floor(x);
}

// Tiny seeded generator for per-object variation.
function createSeeded(seed) {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Grey electrical cabinet front: two doors, vents, a warning label.
function cabinetTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7c807a';
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = 'rgba(20,20,18,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 116, 244);
  ctx.beginPath();
  ctx.moveTo(64, 6);
  ctx.lineTo(64, 250);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20,20,18,0.6)';
  for (let y = 20; y < 60; y += 7) {
    ctx.fillRect(14, y, 40, 3);
    ctx.fillRect(74, y, 40, 3);
  }
  ctx.fillStyle = '#d8c020';
  ctx.fillRect(18, 90, 30, 26);
  ctx.fillStyle = '#141414';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('⚡', 24, 110);
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(56, 120, 5, 22);
  ctx.fillRect(68, 120, 5, 22);
  // Rust and grime.
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 40},${50 + Math.random() * 20},20,${(Math.random() * 0.3).toFixed(3)})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 256, 2 + Math.random() * 10, 1 + Math.random() * 8);
  }
  const g = ctx.createLinearGradient(0, 200, 0, 256);
  g.addColorStop(0, 'rgba(30,25,15,0)');
  g.addColorStop(1, 'rgba(30,25,15,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 200, 128, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  return tex;
}

export const LEVEL2 = {
  id: 'level2',
  number: 2,
  name: 'Level 2',
  title: 'Abandoned Utility Halls',
  difficulty: 2,
  next: 'level3',
  create: (ctx) => new Level2(ctx),
};
