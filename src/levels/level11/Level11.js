import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js';
import { GridMap, EDGE_OPEN, EDGE_WALL } from '../../world/GridMap.js';
import { EntityManager } from '../../entities/lib/index.js';
import { Kit, Colliders } from '../level94/kit.js';
import { B, R, GF, FH, SIDE, TEX_W, TEX_H, AD_COUNT, hash, isRoad, isSidewalk, inAlley, blockPlan, blockSolids, buildMaterials, groundMaterial } from './city.js';
import { buildShell, buildDetail, propGeometries, setAd } from './build.js';
import { Cranes, Pizzas } from './critters.js';

// Level 11 — "The City That Never Sleeps".
//
// An endless city, block after block of it: downtown towers of glass and
// stone, midtown offices and apartments, brick shops further out. Late
// afternoon when you arrive, long shadows between the towers; then the sun
// goes down and every window lights up. Nobody drives. The traffic lights
// change anyway.
//
//   - Safe, mostly. The Level 11 Effect calms the Hounds and the Facelings,
//     unless you go out of your way to annoy them
//   - Some shops are open, lit and stocked, and nobody's minding them.
//     Malt Marters depots hand out supplies
//   - The city changes when you're not looking: billboards, parked cars
//   - Lucky Cranes fly over the streets; Living Pizzas hop on the pavement
//   - New Times Square two blocks up the avenue; M.E.G. Base Beta two
//     blocks east
//   - A hub: exits everywhere, most of them one-way. Shops with the wrong
//     names, neon alleys, grimy alleys, boarded-up doors, construction
//     sites, open sewer grates, recruitment posters, the shrubbery (mind
//     your feet: Level 63), the bus that's always waiting...

const SPAWN = [3, 3];
const TIMES = [3, 1];
const MEG = [5, 3];
const GX = 7, GZ = 7, GC = 4; // the entity grid: 7x7 blocks round the start

const EXIT_LINES = {
  level20: 'FUN ZONE. Every machine is switched on, playing its demo to nobody. At the back, a door is propped open and coloured light pours through it.',
  level232: 'CASPIAN\'S ANTIQUES. Clocks, all stopped at different times. A door at the back stands ajar onto somewhere that smells of dust and brass.',
  level458: 'PAPA PEDRO\'S. It smells wonderful in here. A door behind the counter is open, and the smell is coming from there.',
  level55: 'FRIVOLOUS FRANK\'S. Freezers hum. The door to the back is frosted over, and open just a crack.',
  level126: 'MR. HOLLOWAY\'S GRAND EXHIBIT. Things on plinths, under glass. A velvet rope has been unhooked from a door at the back.',
  level68: 'The cinema lobby. Popcorn, still warm. Through the door at the back, a film is already playing.',
  level808: 'The arcade. Somebody\'s left a game running, and the door at the back is buzzing like a machine.',
  level179: 'SECOND CHANCE THRIFT. Racks of other people\'s clothes. A door at the back says STAFF ONLY. It\'s open.',
  level304: 'The bakery. Bread, still warm, with nobody to sell it. The kitchen door at the back is open.',
  level370: 'THE OLD ANCHOR. Pints poured and left. A door at the back leads somewhere louder.',
  level900: 'MATTRESS KINGDOM. Beds as far as the back wall, and a door there, softly lit.',
  level214: 'FLOWERS. Buckets of them, all in bloom. The back door is open onto more flowers than the shop could hold.',
  level119: 'PURE WATER SUPPLY. Jugs and jugs of water. The back door opens onto the sound of running water.',
  level213: 'The trattoria. Tables laid for two. The kitchen door swings gently, though there\'s no draught.',
  level511: 'A hospital lobby. Clean, quiet, the lights on. The doors to the wards are open.',
  level33: 'A shopping mall entrance. Muzak. The doors into the mall proper stand open.',
  level115: 'M.E.G. Base Beta. Nobody at the desk, but the lights are on and the coffee is warm. A whiteboard lists the exits they know about. A door at the back is marked LEVEL 115.',
};

export class Level11 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.cameraFar = 1100;
    this.own = { geos: [], mats: [], textures: [] };
    this.quality = ctx.quality?.() || 'high';
    const { T, M } = buildMaterials(this.own);
    M.ground = groundMaterial(T, this.own);
    this.T = T;
    this.M = M;
    this.G = propGeometries();
    for (const g of Object.values(this.G)) this.own.geos.push(g);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(16);
    this.plans = new Map();
    this.blocks = new Map();

    // Shadows from the sun.
    this.renderer = ctx.renderer;
    this.prevShadow = this.renderer ? { enabled: this.renderer.shadowMap.enabled, type: this.renderer.shadowMap.type } : null;
    this.shadows = !!this.renderer && this.quality !== 'low';
    if (this.renderer) {
      this.renderer.shadowMap.enabled = this.shadows;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
    this.sun.target = new THREE.Object3D();
    if (this.shadows) {
      this.sun.castShadow = true;
      const s = this.quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(s, s);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -85;
      c.right = c.top = 85;
      c.near = 1;
      c.far = 700;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.06;
    }
    this.hemi = new THREE.HemisphereLight(0xb8c8dc, 0x6a5a48, 1.0);
    this.group.add(this.sun, this.sun.target, this.hemi);
    this.pool = Array.from({ length: this.quality === 'low' ? 4 : 8 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 30, 1.2);
      this.group.add(l);
      return l;
    });

    this.buildSky();
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), M.ground);
    this.ground.receiveShadow = true;
    this.own.geos.push(this.ground.geometry);
    this.group.add(this.ground);
    this.skyline = null;
    this.guideSign();

    // Start on the pavement, looking up the avenue towards Times Square.
    const x0 = SPAWN[0] * B, z0 = SPAWN[1] * B;
    this.spawn = { x: x0 + 3, z: z0 + 11.5, yaw: -Math.PI / 2 + 0.04 };
    this.buildGrid();
    this.world = {
      map: this.grid,
      collide: (pos, r) => this.colliders.collide(pos, r, pos.y ?? 0),
      groundAt: (x, z) => (isRoad(x, z) ? 0 : SIDE),
      sampleLight: (x, z) => {
        const l = this.lightAt(x, z);
        return [l, l, l];
      },
      ceilingHeight: () => 40,
      lights: [],
      lightsNear: (x, z, r) => this.world.lights.map((l, k) => [k, Math.hypot(l.x - x, l.z - z)]).filter((p) => p[1] <= r),
    };
    this.time = 0;
    this.done = false;
    this.told = {};
    this.itemsPlaced = new Set();
    this.pizzaShops = new Set();
    this.inside = null;
    this.dwell = 0;
    this.tripT = 0;
    this.sky = { day: 1, night: 0, e: 20 };
    this.updateSun(0, { pos: { x: this.spawn.x, z: this.spawn.z } });
    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('ents'), shared });
    this.cranes = new Cranes(this.group, this.rng.fork('cranes'));
    this.cranes.spawnFlock(this.spawn.x + 20, this.spawn.z - 60, 9);
    this.cranes.spawnFlock(this.spawn.x - 40, this.spawn.z - 160, 7);
    this.pizzas = new Pizzas(this.group, this.rng.fork('pizza'), this.world);
    this.updateBlocks({ pos: { x: this.spawn.x, z: this.spawn.z }, yaw: 0 }, true);
    this.bus = null;
    this.nextBus = 40;
    this.nextHorn = 6;
    this.nextSiren = 40;
    this.nextPigeon = 10;
    this.nextEnt = 30;
    this.lastPhase = -1;
    this.startEntities = true;
    this.script = [
      [1.5, 'A city. Afternoon sun between the towers, long shadows across the road. No traffic. Nobody.'],
      [9, 'The traffic lights change for nobody. Somewhere a long way off, a car horn.'],
      [18, 'Any door here could lead anywhere: a shop with the wrong name, an alley, a bus. A lot of them only go one way.'],
    ];
  }

  // ---- Sky -------------------------------------------------------------------------------

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 0.3, 1) },
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sunCol: { value: new THREE.Color() },
        night: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir, zenith, horizon, sunCol;
        uniform float night;
        varying vec3 vDir;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        void main() {
          vec3 d = normalize(vDir);
          float up = max(d.y, 0.0);
          vec3 col = mix(horizon, zenith, pow(up, 0.5));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.4 + pow(s, 3.0) * 0.15) * (1.0 - night);
          if (d.y < 0.0) col = horizon * 0.85;
          // A few stars, faint through the city glow.
          vec2 g = floor(vec2(atan(d.z, d.x) * 140.0, d.y * 160.0));
          float st = step(0.9975, h21(g)) * night * smoothstep(0.15, 0.5, d.y);
          col += vec3(st * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.own.mats.push(mat);
    this.skyMat = mat;
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat);
    this.skyMesh.renderOrder = -1;
    this.skyMesh.frustumCulled = false;
    this.own.geos.push(this.skyMesh.geometry);
    this.group.add(this.skyMesh);
  }

  // A green sign on the corner by the start: where the landmarks are.
  guideSign() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#106a3a';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 240);
    g.fillRect(8, 126, 496, 4);
    g.fillStyle = '#fff';
    g.font = 'bold 40px Arial';
    g.fillText('← NEW TIMES SQUARE', 26, 72);
    g.fillText('↑ M.E.G. BASE BETA', 26, 192);
    g.font = '24px Arial';
    g.fillText('2 BLOCKS', 330, 112);
    g.fillText('2 BLOCKS', 330, 232);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.own.textures.push(t);
    const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
    this.own.mats.push(m);
    const x = SPAWN[0] * B + R + 0.8, z = SPAWN[1] * B + R + 3.2;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), m);
    sign.position.set(x, 3.6, z);
    sign.rotation.y = -Math.PI / 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), this.M.pole);
    pole.position.set(x, 2.1, z);
    this.own.geos.push(sign.geometry, pole.geometry);
    this.group.add(sign, pole);
    this.colliders.add({ x, z, hw: 0.1, hd: 0.1, rot: 0, y0: -1, y1: 5 });
  }

  // ---- Plans and the entity grid ----------------------------------------------------------

  plan(i, j) {
    const key = `${i},${j}`;
    let p = this.plans.get(key);
    if (!p) {
      const special = i === TIMES[0] && j === TIMES[1] ? 'times' : i === MEG[0] && j === MEG[1] ? 'meg' : null;
      p = blockPlan(i, j, this.seed, SPAWN, special);
      this.plans.set(key, p);
    }
    return p;
  }

  buildGrid() {
    const NX = (GX * B) / GC, NZ = (GZ * B) / GC;
    const map = new GridMap(NX, NZ, GC, 4);
    const blocked = new Uint8Array(NX * NZ);
    for (let i = 0; i < GX; i++) for (let j = 0; j < GZ; j++) {
      for (const s of blockSolids(this.plan(i, j))) {
        for (let y = Math.floor(s.z0 / GC); y <= Math.floor((s.z1 - 0.01) / GC); y++) for (let x = Math.floor(s.x0 / GC); x <= Math.floor((s.x1 - 0.01) / GC); x++) {
          if (x >= 0 && y >= 0 && x < NX && y < NZ) blocked[y * NX + x] = 1;
        }
      }
    }
    const at = (x, y) => (x < 0 || y < 0 || x >= NX || y >= NZ ? 1 : blocked[y * NX + x]);
    for (let y = 0; y <= NZ; y++) for (let x = 0; x < NX; x++) map.setH(x, y, at(x, y - 1) || at(x, y) ? EDGE_WALL : EDGE_OPEN);
    for (let y = 0; y < NZ; y++) for (let x = 0; x <= NX; x++) map.setV(x, y, at(x - 1, y) || at(x, y) ? EDGE_WALL : EDGE_OPEN);
    this.grid = map;
  }

  // ---- Streaming -------------------------------------------------------------------------------

  updateBlocks(player, first = false) {
    const ci = Math.floor(player.pos.x / B), cj = Math.floor(player.pos.z / B);
    if (ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const want = new Map();
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) want.set(`${i},${j}`, Math.max(Math.abs(i - ci), Math.abs(j - cj)));
    for (const [key, b] of this.blocks) {
      const ring = want.get(key);
      if (ring === undefined) {
        this.dropDetail(b);
        this.dropShell(b);
        this.blocks.delete(key);
      } else if (ring > 1) this.dropDetail(b);
    }
    // The blocks next to you are built now; the ring beyond, one a frame.
    this.queue = [];
    this.dqueue = [];
    for (const [key, ring] of want) {
      let b = this.blocks.get(key);
      if (!b) {
        const [i, j] = key.split(',').map(Number);
        b = { i, j, key, plan: this.plan(i, j) };
        this.blocks.set(key, b);
      }
      if (ring === 0 || first) {
        if (!b.shell) this.makeShell(b);
        if (ring <= 1 && !b.detail) this.makeDetail(b);
      } else if (ring === 1) {
        if (!b.detail) this.dqueue.push(b);
      } else if (!b.shell) this.queue.push(b);
    }
    this.skyDirty = true;
    if (first) this.buildPending();
    this.world.lights.length = 0;
    for (const b of this.blocks.values()) for (const l of b.detail?.lamps || []) this.world.lights.push({ x: l.x, z: l.z, state: 'on' });
  }

  // Finish off streaming a little at a time.
  buildPending(all = true) {
    do {
      const d = this.dqueue?.shift();
      if (d) {
        if (this.blocks.get(d.key) === d && !d.detail) {
          if (!d.shell) this.makeShell(d);
          this.makeDetail(d);
          this.world.lights.length = 0;
          for (const b of this.blocks.values()) for (const l of b.detail?.lamps || []) this.world.lights.push({ x: l.x, z: l.z, state: 'on' });
        }
        continue;
      }
      const b = this.queue?.shift();
      if (b) {
        if (this.blocks.get(b.key) === b && !b.shell) this.makeShell(b);
      } else if (this.skyDirty) {
        this.skyDirty = false;
        this.buildSkyline(this.ci, this.cj);
      } else return;
    } while (all);
  }

  makeShell(b) {
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const s = buildShell(b.plan, this.M, own, this.colliders, this.seed);
    for (const bb of s.billboards) own.geos.push(bb.mesh.geometry);
    this.group.add(s.group);
    b.shell = s;
    b.shellGeos = own.geos;
  }

  dropShell(b) {
    if (!b.shell) return;
    this.group.remove(b.shell.group);
    for (const g of b.shellGeos) g.dispose();
    for (const s of b.shell.solids) this.colliders.remove(s);
    b.shell = null;
  }

  makeDetail(b) {
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const spawn = b.i === SPAWN[0] && b.j === SPAWN[1] ? this.spawn : null;
    const d = buildDetail(b.plan, this.M, this.G, own, this.colliders, this.seed, { shops: b.shell.shops, spawn });
    for (const bb of d.billboards || []) own.geos.push(bb.mesh.geometry);
    this.group.add(d.group);
    b.detail = d;
    b.detailGeos = own.geos;
    b.carSolids = [];
    this.layCars(b);
    // Supplies in the open shops, once.
    for (const s of b.shell.shops) {
      const key = `${b.key}:${Math.round(s.x0)}`;
      if (this.itemsPlaced.has(key)) continue;
      this.itemsPlaced.add(key);
      const cz = (s.z0 + s.z1) / 2;
      if (s.item) this.ctx.placeItem?.(s.item, s.mid - 1.2, cz);
      if (s.item2) this.ctx.placeItem?.(s.item2, s.mid + 1.2, cz);
      if (s.kind === 'meg') {
        this.ctx.placeItem?.('water', s.mid - 2, cz + 1);
        this.ctx.placeItem?.('medkit', s.mid + 2, cz + 1);
      }
      // Living Pizzas outside Papa Pedro's.
      if (s.exit === 'level458' && !this.pizzaShops.has(key)) {
        this.pizzaShops.add(key);
        const out = s.front === 'n' ? -1 : 1;
        for (let k = 0; k < 3; k++) this.pizzas.spawn(s.mid + (k - 1) * 1.5, s.fz + out * 2.5);
      }
    }
    for (const st of d.stalls) {
      const key = `${b.key}:stall${st.k}`;
      if (this.itemsPlaced.has(key)) continue;
      this.itemsPlaced.add(key);
      if (st.k % 2 === 0) this.ctx.placeItem?.(['water', 'battery', 'milk', 'flare'][(st.k / 2) % 4], st.x, st.z);
    }
  }

  dropDetail(b) {
    if (!b.detail) return;
    this.group.remove(b.detail.group);
    b.detail.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    for (const g of b.detailGeos) g.dispose();
    for (const s of b.detail.solids) this.colliders.remove(s);
    for (const s of b.carSolids) this.colliders.remove(s);
    b.detail = null;
  }

  // Put the parked cars where their slots say, and give them colliders.
  layCars(b) {
    const d = b.detail;
    for (const s of b.carSolids) this.colliders.remove(s);
    b.carSolids = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    let n = 0;
    for (const c of d.cars) {
      if (!c.on) continue;
      const gy = isRoad(c.x, c.z) ? 0 : SIDE;
      d.carMesh.setMatrixAt(n, m4.compose(p.set(c.x, gy, c.z), q.setFromAxisAngle(up, c.rot), sc));
      d.carMesh.setColorAt(n, col.set(c.color));
      n++;
      const s = { x: c.x, z: c.z, hw: 0.95, hd: 2.3, rot: -c.rot, y0: -1, y1: 1.6 };
      this.colliders.add(s);
      b.carSolids.push(s);
    }
    d.carMesh.count = n;
    d.carMesh.instanceMatrix.needsUpdate = true;
    if (d.carMesh.instanceColor) d.carMesh.instanceColor.needsUpdate = true;
    d.carMesh.computeBoundingSphere();
  }

  // Far blocks, just as boxes with windows, so the skyline goes on.
  buildSkyline(ci, cj) {
    if (this.skyline) {
      this.group.remove(this.skyline.group);
      for (const g of this.skyline.geos) g.dispose();
    }
    const kit = new Kit();
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const far = this.quality === 'low' ? 3 : this.quality === 'medium' ? 4 : 5;
    for (let i = ci - far; i <= ci + far; i++) for (let j = cj - far; j <= cj + far; j++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) <= 2) continue;
      for (const L of this.plan(i, j).lots) {
        if (L.type !== 'building' || L.H < 20) continue;
        const ins = L.podium ? L.podium.inset : 0;
        const x0 = L.x0 + ins, x1 = L.x1 - ins, z0 = L.z0 + ins, z1 = L.z1 - ins;
        const H = L.H;
        const corners = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
        for (let s = 0; s < 4; s++) {
          const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
          farQuad(kit, L.style, ax, az, bx, bz, 0, H, L.u0 + s * 0.37);
        }
        farFlat(kit, x0, z0, x1, z1, H);
      }
    }
    const group = kit.build(this.M, own);
    this.group.add(group);
    this.skyline = { group, geos: own.geos };
  }

  // ---- Light and time of day -------------------------------------------------------------

  updateSun(dt, player) {
    const hour = (16.4 + this.time / 240) % 24;
    this.hour = hour;
    let e;
    if (hour >= 6.2 && hour <= 18.8) e = 62 * Math.sin((Math.PI * (hour - 6.2)) / 12.6);
    else e = -24 * Math.sin((Math.PI * (((hour - 18.8) + 24) % 24)) / 11.4);
    const sm = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const day = sm(-7, 8, e), night = 1 - sm(-5, 5, e), gold = 1 - sm(3, 26, e);
    this.sky = { day, night, e, gold };
    const er = (e * Math.PI) / 180, az = (Math.PI * (hour - 12)) / 12;
    const ce = Math.cos(er);
    const dir = new THREE.Vector3(-Math.sin(az) * ce, Math.sin(er), (0.35 + 0.65 * Math.cos(az)) * ce * 0.6).normalize();
    this.sunDir = dir;
    // Light colours: white noon, gold afternoon, red at the horizon, blue night.
    const sunCol = new THREE.Color(0xfff2e0).lerp(new THREE.Color(0xffb46a), gold).lerp(new THREE.Color(0xff6a3a), sm(6, 0, e) * 0.7);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 5.2 * sm(-1, 6, e);
    const zen = new THREE.Color(0x6e92bc).lerp(new THREE.Color(0x7c94b0), gold).lerp(new THREE.Color(0x2c3a5c), sm(4, -4, e)).lerp(new THREE.Color(0x0a1022), night);
    const hor = new THREE.Color(0xd8d6c4).lerp(new THREE.Color(0xf0d0a0), gold).lerp(new THREE.Color(0xd8865a), sm(5, -2, e)).lerp(new THREE.Color(0x3a3038), night);
    this.skyMat.uniforms.zenith.value.copy(zen);
    this.skyMat.uniforms.horizon.value.copy(hor);
    this.skyMat.uniforms.sunCol.value.copy(sunCol);
    this.skyMat.uniforms.sunDir.value.copy(dir);
    this.skyMat.uniforms.night.value = night;
    this.horizon = hor;
    this.hemi.color.copy(new THREE.Color(0xb8c6d8).lerp(new THREE.Color(0xc8b8a8), gold * 0.6).lerp(new THREE.Color(0x283048), night));
    this.hemi.groundColor.copy(new THREE.Color(0x9a8a74).lerp(new THREE.Color(0x141210), night));
    this.hemi.intensity = 0.55 + 2.4 * day;
    const px = player.pos.x, pz = player.pos.z;
    const tx = Math.round(px), tz = Math.round(pz);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + dir.x * 300, Math.max(20, dir.y * 300), tz + dir.z * 300);
    if (this.shadows) this.sun.castShadow = e > -1;
    this.skyMesh.position.set(px, 0, pz);
    this.ground.position.set(Math.round(px / B) * B, 0, Math.round(pz / B) * B);
    // Windows, signs, lamps: on as the light goes.
    const M = this.M;
    for (const s of ['stone', 'glass', 'granite', 'concrete', 'brick', 'tan', 'white', 'overgrown']) {
      M[s].emissiveIntensity = 0.03 + night * 1.05;
      M[s].reflectivity = M[s].userData.refl * (0.3 + 0.7 * day);
    }
    M.sign.emissiveIntensity = 0.12 + night * 0.85;
    M.ads.emissiveIntensity = 0.08 + night * 0.85;
    M.screens.emissiveIntensity = 0.55 + night * 0.4;
    M.banners.emissiveIntensity = 0.03 + night * 0.4;
    M.lobby.emissiveIntensity = 0.1 + night * 0.9;
    M.lampHead.emissiveIntensity = night * 1.6;
    M.shopDark.reflectivity = 0.2 + 0.4 * day;
  }

  lightAt(x, z) {
    let l = 0.08 + this.sky.day * 0.85;
    if (this.sky.night > 0.3) {
      for (const b of this.blocks.values()) for (const lp of b.detail?.lamps || []) {
        const d = Math.hypot(lp.x - x, lp.z - z);
        if (d < 14) l += (1 - d / 14) * 0.5 * this.sky.night;
      }
    }
    return Math.min(1, l);
  }

  updateLights(dt, player) {
    const night = this.sky.night;
    const cands = [];
    const px = player.pos.x, pz = player.pos.z;
    for (const b of this.blocks.values()) {
      if (!b.shell) continue;
      for (const s of b.shell.shops) {
        const d = Math.hypot(s.light.x - px, s.light.z - pz);
        if (d < 40) cands.push({ x: s.light.x, y: s.light.y, z: s.light.z, color: [1, 0.92, 0.8], power: 4 + night * 3, dist: 14, d: d * 0.7 });
      }
      if (!b.detail) continue;
      if (night > 0.25) for (const lp of b.detail.lamps) cands.push({ x: lp.x, y: lp.y, z: lp.z, color: [1, 0.82, 0.6], power: (lp.bright ? 40 : 30) * night, dist: 34, d: Math.hypot(lp.x - px, lp.z - pz) });
      for (const n of b.detail.neon) {
        const c = new THREE.Color(n.color);
        cands.push({ x: n.x, y: n.y, z: n.z, color: [c.r, c.g, c.b], power: n.dim ? 4 + night * 4 : 10 + night * 8, dist: 18, d: Math.hypot(n.x - px, n.z - pz) * 1.1 });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    this.pool.forEach((pl, k) => {
      const c = cands[k];
      if (!c || c.d > 70) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(c.x, c.y, c.z);
      pl.color.setRGB(...c.color);
      pl.intensity = c.power;
      pl.distance = c.dist;
    });
  }

  // Traffic lights: east-west green, amber, then north-south, round and round.
  updateSignals(dt, player) {
    const t = this.time % 40;
    const phase = t < 17 ? 0 : t < 20 ? 1 : t < 37 ? 2 : 3;
    const on = 2.4, off = 0.04;
    const set = (g, r, y, gr) => {
      this.M[`sig_${g}_r`].emissiveIntensity = r ? on : off;
      this.M[`sig_${g}_y`].emissiveIntensity = y ? on : off;
      this.M[`sig_${g}_g`].emissiveIntensity = gr ? on : off;
    };
    set('ew', phase >= 2, phase === 1, phase === 0);
    set('ns', phase < 2, phase === 3, phase === 2);
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      // The crossing beeps when the walk signal changes, if you're near a corner.
      const lx = ((player.pos.x % B) + B) % B, lz = ((player.pos.z % B) + B) % B;
      if ((phase === 0 || phase === 2) && (lx < R + 8 || lx > B - 6) && (lz < R + 8 || lz > B - 6)) {
        for (let k = 0; k < 4; k++) setTimeout(() => this.ctx.audio.beep?.(0, 0.05, 0.06, 2600), k * 180);
      }
    }
  }

  // ---- The city changes when you're not looking -------------------------------------------

  updateChanges(dt, player) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const px = player.pos.x, pz = player.pos.z;
    for (const b of this.blocks.values()) {
      const boards = [...(b.shell?.billboards || []), ...(b.detail?.billboards || [])];
      for (const bb of boards) {
        const dx = bb.x - px, dz = bb.z - pz, d = Math.hypot(dx, dz) || 1;
        const facing = -(dx * bb.nx + dz * bb.nz) / d > 0.1; // its face towards us
        const seen = d < 160 && facing && (dx * fx + dz * fz) / d > 0.55;
        if (bb.screen) {
          // Big screens just cycle.
          bb.t = (bb.t || this.rng.range(0, 8)) - dt;
          if (bb.t <= 0) {
            bb.t = this.rng.range(6, 10);
            bb.slot = (bb.slot + 1) % AD_COUNT;
            setAd(bb.mesh, bb.slot);
          }
          continue;
        }
        if (seen) {
          if (bb.slot !== bb.seen && d < 80 && !this.told.ad) {
            this.told.ad = true;
            this.ctx.hud.message('That billboard was showing something else a minute ago. You\'re sure of it.', 4);
          }
          bb.seen = bb.slot;
        } else if (this.rng.chance(dt * 0.03)) {
          bb.slot = (bb.slot + 1 + Math.floor(this.rng.next() * (AD_COUNT - 1))) % AD_COUNT;
          setAd(bb.mesh, bb.slot);
        }
      }
      // Parked cars move about behind your back.
      if (!b.detail) continue;
      const cx = (b.i + 0.5) * B, cz = (b.j + 0.5) * B;
      const dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz) || 1;
      const visible = (dx * fx + dz * fz) / d > -0.1 || d < 45;
      if (!visible && this.rng.chance(dt * 0.015)) {
        const cars = b.detail.cars;
        for (let k = 0; k < 4; k++) {
          const c = cars[Math.floor(this.rng.next() * cars.length)];
          if (c) c.on = !c.on;
        }
        this.layCars(b);
        if (d < 110) b.moved = true;
      } else if (visible && b.moved && d < 70) {
        b.moved = false;
        if (!this.told.cars) {
          this.told.cars = true;
          this.ctx.hud.message('Weren\'t there different cars parked along here? A red one, just there?', 4);
        }
      }
    }
  }

  // ---- The bus ----------------------------------------------------------------------------------

  updateBus(dt, player) {
    const px = player.pos.x, pz = player.pos.z;
    if (!this.bus) {
      this.nextBus -= dt;
      if (this.nextBus > 0) return;
      this.nextBus = this.rng.range(60, 110);
      const stops = [];
      for (const b of this.blocks.values()) if (b.detail?.busStop) stops.push(b.detail.busStop);
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      const ok = stops.filter((s) => {
        const dx = s.x - px, dz = s.z - pz, d = Math.hypot(dx, dz);
        return d > 25 && d < 140 && (dx * fx + dz * fz) / d < 0.3;
      });
      if (!ok.length) return;
      const s = this.rng.pick(ok);
      this.bus = this.makeBus(s.x - 2, s.roadZ);
      this.bus.t = 0;
      this.bus.stop = s;
      return;
    }
    const bus = this.bus;
    bus.t += dt;
    const dx = bus.x - px, dz = bus.z - pz, d = Math.hypot(dx, dz);
    if (d < 45 && !this.told.bus) {
      this.told.bus = true;
      this.ctx.hud.message('A bus is waiting at the stop, engine idling, doors open. There\'s no driver. The sign over the windscreen just says 147.', 5);
    }
    if (bus.t < 75 && this.rng.chance(dt * 0.3) && d < 40) this.ctx.audio.thud?.(0, 0.02);
    // Step through its doors and it takes you.
    const doorX = bus.x + 3.6, doorZ = bus.z + 1.5;
    if (Math.hypot(doorX - px, doorZ - pz) < 1.1) {
      this.done = true;
      this.ctx.audio.door?.(0, 0.3);
      this.ctx.hud.message('You climb aboard. The doors hiss shut behind you, and the bus pulls away into streets you don\'t recognise.', 5);
      this.ctx.onEscape('level147', 'door');
      return;
    }
    // It leaves when you aren't looking.
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    if (bus.t > 75 && (dx * fx + dz * fz) / (d || 1) < 0 && d > 20) this.removeBus();
  }

  makeBus(x, z) {
    const kit = new Kit();
    kit.box('paint', x, 1.75, z, 11, 2.7, 2.5);
    kit.box('awn2', x, 1.25, z, 11.02, 0.5, 2.52);
    kit.box('shopDark', x, 2.35, z, 10.6, 0.9, 2.54);
    kit.box('metal', x, 3.2, z, 8, 0.25, 2);
    kit.box('neonYellow', x + 5.51, 2.85, z, 0.05, 0.3, 1.6);
    kit.box('hole', x + 3.6, 1.55, z + 1.26, 1.1, 2.3, 0.02);
    for (const [dx, dz] of [[-3.5, -1.15], [-3.5, 1.15], [3.6, -1.15], [3.6, 1.15]]) kit.add('decal', new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateX(Math.PI / 2), x + dx, 0.5, z + dz);
    const own = { geos: [], mats: this.own.mats, textures: this.own.textures };
    const group = kit.build(this.M, own);
    group.traverse((m) => {
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    this.group.add(group);
    const solid = { x, z, hw: 5.5, hd: 1.25, rot: 0, y0: -1, y1: 3.2 };
    this.colliders.add(solid);
    return { x, z, group, geos: own.geos, solid };
  }

  removeBus() {
    if (!this.bus) return;
    this.group.remove(this.bus.group);
    for (const g of this.bus.geos) g.dispose();
    this.colliders.remove(this.bus.solid);
    this.bus = null;
  }

  // ---- Entities: the Level 11 Effect ----------------------------------------------------------

  // Hostile things here mostly can't be bothered. Annoy them enough, or
  // hit them, and they remember what they are.
  calm(e) {
    const think = e.think.bind(e);
    const stun = e.stun.bind(e);
    e.provoked = false;
    e.annoy = 0;
    e.think = (dt, player, out) => {
      const d = e.distTo(player);
      if (e.provoked) {
        think(dt, player, out);
        // Lose interest eventually.
        if (d > 30) e.annoy -= dt;
        if (e.annoy < -12) {
          e.provoked = false;
          e.annoy = 0;
        }
        return;
      }
      e.setState(e.type === 'hound' ? 'prowl' : 'wander');
      e.wander(dt, e.type === 'hound' ? 0.9 : 0.8);
      if (d < 2.5 && player.sprinting) e.annoy += dt * 1.5;
      else if (d < 1.3) e.annoy += dt;
      else e.annoy = Math.max(0, e.annoy - dt * 0.4);
      if (e.annoy > 2.5) this.provoke(e);
    };
    e.stun = (s) => {
      stun(s);
      this.provoke(e);
    };
  }

  provoke(e) {
    if (e.provoked) return;
    e.provoked = true;
    e.annoy = 0;
    e.setState(e.type === 'hound' ? 'chase' : 'chase');
    if (e.type === 'faceling') e.hostile = true;
    this.ctx.hud.message('You pushed it too far. The Level 11 Effect only goes so far.', 3.5);
    this.ctx.audio.growl?.(0, 0.35);
  }

  spawnStart(player) {
    const m = this.entities;
    for (let k = 0; k < 9; k++) {
      const e = m.spawnFar('faceling', player, { min: 14, max: 90, visible: k < 3, opts: { variant: this.rng.chance(0.85) ? 'passive' : 'hostile' } });
      if (e && e.hostile) this.calm(e);
    }
    for (let k = 0; k < 2; k++) {
      const e = m.spawnFar('hound', player, { min: 40, max: 110 });
      if (e) this.calm(e);
    }
    // A couple of Living Pizzas out on the pavement near the start.
    for (let k = 0; k < 2; k++) this.pizzas.spawn(this.spawn.x + this.rng.range(-1, 1), this.spawn.z - 14 - k * 9);
  }

  trickle(dt, player) {
    this.nextEnt -= dt;
    if (this.nextEnt > 0) return;
    this.nextEnt = this.rng.range(30, 60);
    const p = player.pos;
    if (p.x < 0 || p.z < 0 || p.x > GX * B || p.z > GZ * B) return;
    const near = this.entities.list.filter((e) => e.alive && e.distTo(player) < 100).length;
    if (near >= 10) return;
    const type = this.rng.chance(0.82) ? 'faceling' : 'hound';
    const e = this.entities.spawnFar(type, player, { min: 45, max: 100, opts: { variant: 'passive' } });
    if (e && e.type === 'hound') this.calm(e);
    // Drop the ones that wandered a long way off.
    for (const o of [...this.entities.list]) if (o.distTo(player) > 180) this.entities.remove(o);
  }

  // ---- Per frame -------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    if (this.startEntities) {
      this.startEntities = false;
      this.spawnStart(player);
    }
    this.updateBlocks(player);
    this.buildPending(false);
    this.updateSun(dt, player);
    this.updateLights(dt, player);
    this.updateSignals(dt, player);
    this.updateChanges(dt, player);
    this.updateBus(dt, player);
    if (this.done) return;
    this.updateAmbient(dt, player);
    this.updateCritters(dt, player);
    this.trickle(dt, player);
    for (const e of this.entities.list) e.pos.y = this.world.groundAt(e.pos.x, e.pos.z);
    const res = this.entities.update(dt, player, ctx);
    for (const e of this.entities.list) {
      e.root.visible = e.distTo(player) < 100;
      if (e.type === 'hound' && !e.provoked && !this.told.hound && e.distTo(player) < 22 && e.canSee?.(player, 22, 2)) {
        this.told.hound = true;
        ctx.hud.message('A Hound, nosing along the gutter. It looks right at you... and goes back to what it was doing. Something about this city calms things down.', 5);
      }
      if (e.type === 'faceling' && !this.told.faceling && e.distTo(player) < 16) {
        this.told.faceling = true;
        ctx.hud.message('People. Or things shaped like people, with no faces, walking the sidewalks like they\'re on their way somewhere.', 5);
      }
    }
    this.updateExits(dt, player);
    if (this.done) return;
    // Mostly a safe place. Indoors is better; the night outside wears a little.
    const indoors = !!this.inside;
    const drain = indoors ? -0.25 : this.sky.night * 0.04 - this.sky.day * 0.02;
    player.sanity = Math.max(0, Math.min(100, player.sanity - drain * dt));
    if (player.health <= 0 || player.sanity <= 0 || res.dead) {
      this.done = true;
      ctx.onDeath(player.sanity <= 0 ? 'The city went on without you.' : res.cause);
    }
  }

  updateCritters(dt, player) {
    const ev = this.cranes.update(dt, player, this.time, () => {
      player.sanity = Math.min(100, player.sanity + 15);
      player.health = Math.min(100, player.health + 10);
      this.ctx.hud.message('You touch the paper crane. It\'s warm. Something in your chest unknots. Lucky.', 4);
      this.ctx.audio.bell?.(0, 0.12);
      this.ctx.award?.('luck11');
    });
    if (ev === 'visit' && !this.told.crane) {
      this.told.crane = true;
      this.ctx.hud.message('A folded paper crane drifts down out of the flock and hangs in the air in front of you, wings beating. As if it wants something.', 5);
    }
    // Keep a flock or two overhead as you go.
    if (this.cranes.flocks.length < 3 && this.rng.chance(dt * 0.01)) {
      const a = this.rng.range(0, Math.PI * 2);
      this.cranes.spawnFlock(player.pos.x + Math.cos(a) * 120, player.pos.z + Math.sin(a) * 120, this.rng.int(5, 9));
    }
    for (const p of [...this.pizzas.list]) if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > 170) {
      this.group.remove(p.root);
      this.pizzas.list.splice(this.pizzas.list.indexOf(p), 1);
    }
    const pev = this.pizzas.update(dt, player, this.world.groundAt, this.ctx.audio);
    for (const e of pev) {
      if (e.type === 'squeak') {
        this.ctx.audio.squeak?.(0, 0.12);
        if (!this.told.pizza) {
          this.told.pizza = true;
          this.ctx.hud.message('A slice of pizza. With eyes. It squeaks at you and hops away, quicker than you\'d think.', 4);
        }
      } else if (e.type === 'touch') {
        this.ctx.hud.message('You get a hand on it. It squeaks and wriggles free. You\'re not hungry anymore anyway.', 3);
      }
    }
  }

  updateAmbient(dt, player) {
    const a = this.ctx.audio;
    this.nextHorn -= dt;
    if (this.nextHorn <= 0) {
      this.nextHorn = this.rng.range(15, 45);
      a.horn?.(this.rng.range(-1, 1), this.rng.range(0.012, 0.03));
    }
    this.nextSiren -= dt;
    if (this.nextSiren <= 0) {
      this.nextSiren = this.rng.range(70, 160);
      a.siren?.(this.rng.range(-1, 1), 0.02);
    }
    this.nextPigeon -= dt;
    if (this.nextPigeon <= 0) {
      this.nextPigeon = this.rng.range(8, 25);
      if (this.sky.day > 0.5 && !this.inside) a.pigeon?.(this.rng.range(-1, 1), 0.04);
    }
    if (this.inside && this.rng.chance(dt * 0.05)) a.flickerBuzz?.(0.2, 0.02);
  }

  // Where is the player, and is it a way out?
  updateExits(dt, player) {
    const { ctx } = this;
    const px = player.pos.x, pz = player.pos.z;
    const go = (target, how, msg) => {
      this.done = true;
      ctx.hud.message(msg, 5);
      if (how === 'noclip') ctx.audio.noclip?.();
      ctx.onEscape(target, how);
    };
    this.inside = null;
    let inZone = null;
    for (const b of this.blocks.values()) {
      if (!b.shell || !b.detail) continue;
      // Shops.
      for (const s of b.shell.shops) {
        if (px < s.x0 || px > s.x1 || pz < s.z0 || pz > s.z1) continue;
        this.inside = s;
        const key = `${b.key}:${Math.round(s.x0)}`;
        if (this.lastShop !== key) {
          this.lastShop = key;
          if (s.exit) ctx.hud.message(EXIT_LINES[s.exit] || `${s.name}. There's a door at the back, standing ajar.`, 6);
          else if (s.kind === 'depot') ctx.hud.message('MALT MARTERS. Crates of supplies, and a hand-lettered sign: TAKE WHAT YOU NEED. NOBODY GOES HUNGRY.', 5);
          else if (s.kind === 'school') ctx.hud.message('CAMP AMBER. A classroom. On the board: LESSON 1: DON\'T PANIC. LESSON 2: ALMOND WATER. LESSON 3: NOT EVERY DOOR IS A DOOR.', 6);
          else if (!this.told.shop) {
            this.told.shop = true;
            ctx.hud.message('The door\'s unlocked. The lights are on, the shelves are full, and nobody is here. The tap in the back runs clean (E to drink).', 5);
          }
          if (s.kind === 'meg') {
            ctx.award?.('meg11');
            ctx.hud.message('Whiteboard: "SHRUBS = 63 (WATCH YOUR STEP). NEON ALLEYS = 138. GRIMY ALLEYS = 215. BUS = 147. CONSTRUCTION = 325. PIZZA PLACE W/ THE LONG NAME = 458. FUN ZONE = 20. DO NOT TOUCH THE POSTERS."', 9);
          }
        }
        if (s.door && Math.hypot(s.door.x - px, s.door.z - pz) < 0.75) {
          return go(s.exit, 'door', `You step through the door at the back of ${s.name === 'M.E.G. BASE BETA' ? 'the base' : 'the shop'}, and it isn't the back of anywhere.`);
        }
      }
      // Fixed exits.
      for (const x of [...b.shell.exits, ...b.detail.exits]) {
        if (x.type === 'zone' || x.type === 'alley') {
          const [w0, v0, w1, v1] = x.warnRect || [x.x0, x.z0, x.x1, x.z1];
          const near = px > w0 && px < w1 && pz > v0 && pz < v1;
          if (near && !x.told) {
            x.told = true;
            ctx.hud.message(x.warn, 5);
          }
          const inR = px > x.x0 && px < x.x1 && pz > x.z0 && pz < x.z1;
          if (!inR) continue;
          if (x.type === 'alley') {
            if (Math.min(px - x.x0, x.x1 - px) > x.depth) return go(x.target, x.how, x.msg);
            inZone = x;
          } else {
            inZone = x;
            if (this.dwellZone !== x) {
              this.dwellZone = x;
              this.dwell = 0;
            }
            this.dwell += dt;
            if (this.dwell > x.dwell) return go(x.target, x.how, x.msg);
          }
          continue;
        }
        const d = Math.hypot(x.x - px, x.z - pz);
        if (x.warnR && d < x.warnR && !x.told) {
          x.told = true;
          ctx.hud.message(x.warn, 4.5);
        }
        if (d < x.r) return go(x.target, x.how, x.msg);
      }
      // Tripping into the shrubbery.
      for (const p of b.detail.planters) {
        const dx = Math.abs(px - p.x) - p.hw, dz = Math.abs(pz - p.z) - p.hd;
        if (Math.max(dx, dz) < 0.45 && player.sprinting && player.speed > 2) {
          this.tripT += dt;
          if (this.tripT > 0.2) {
            ctx.vibrate?.([60, 40, 120]);
            return go('level63', 'noclip', 'Your foot catches the edge of the planter and you go headfirst into the shrubs. And through them. And down, and down, into open sky.');
          }
        }
      }
    }
    if (!inZone) this.dwellZone = null;
    if (!this.inside) this.lastShop = null;
    if (!player.sprinting) this.tripT = 0;
    // Hints about the shrubs, once, the first time you're near a planter.
    if (!this.told.shrub) {
      for (const b of this.blocks.values()) for (const p of b.detail?.planters || []) {
        if (Math.hypot(p.x - px, p.z - pz) < 5) {
          this.told.shrub = true;
          ctx.hud.message('Neatly clipped shrubs in a low planter. Easy to trip over, if you were running.', 3.5);
        }
      }
    }
    // A bakery you can smell from the street.
    if (!this.told.bread) {
      for (const b of this.blocks.values()) for (const s of b.shell?.shops || []) {
        if (s.exit === 'level304' && Math.hypot(s.mid - px, s.fz - pz) < 20) {
          this.told.bread = true;
          ctx.hud.message('You smell fresh bread from somewhere close by.', 3);
        }
      }
    }
  }

  photoSubjects() {
    return [...this.cranes.subjects(), ...this.pizzas.subjects().map((s) => ({ ...s, noLos: true }))];
  }

  drink(player) {
    if (this.inside) {
      player.sanity = Math.min(100, player.sanity + 12);
      player.health = Math.min(100, player.health + 3);
      this.ctx.audio.drink();
      this.ctx.hud.message('Cold, clean water from the tap in the back.', 2);
      return;
    }
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water. (The open shops have running water, and Malt Marters hands out supplies.)', 2.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  stun(x, z, opts) {
    return 0;
  }

  // ---- Values the game reads every frame -----------------------------------------------------

  audioMix(player) {
    let drone = 0.0;
    for (const e of this.entities.list) {
      if (!e.provoked) continue;
      drone = Math.max(drone, 0.25 * Math.max(0, 1 - e.distTo(player) / 30));
    }
    const inside = this.inside ? 0.35 : 1;
    return {
      hum: this.inside ? 0.04 : 0, exitGain: 0, exitPan: 0, drone, machine: 0, jazz: this.inside?.kind === 'pub' ? 0.3 : 0,
      wind: (0.03 + this.sky.night * 0.02) * inside,
      city: (0.1 + this.sky.night * 0.03) * inside,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    const alley = inAlley(player.pos.x, player.pos.z);
    this.fogC = this.fogC || new THREE.Color();
    this.fogC.copy(this.horizon || new THREE.Color(0xd8d6c4));
    return {
      fogColor: this.fogC,
      fogDensity: 0.0026 + this.sky.night * 0.0009 + (alley ? 0.004 : 0),
      warp: insane * insane * 0.6, aberr: 0.1 + insane * 0.6, grain: 0.05, soften: 0.18,
    };
  }

  hudInfo(player) {
    const angry = this.entities.list.some((e) => e.provoked && e.distTo(player) < 25);
    const warn = angry ? 'YOU MADE IT ANGRY' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.scene.remove(this.group);
    this.entities.dispose();
    this.cranes.dispose();
    this.pizzas.dispose();
    this.removeBus();
    for (const b of this.blocks.values()) {
      this.dropDetail(b);
      this.dropShell(b);
    }
    if (this.skyline) for (const g of this.skyline.geos) g.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
    this.sun.shadow?.map?.dispose();
    if (this.renderer && this.prevShadow) {
      this.renderer.shadowMap.enabled = this.prevShadow.enabled;
      this.renderer.shadowMap.type = this.prevShadow.type;
    }
  }
}

// Skyline boxes: facade walls and a flat roof.
function farQuad(kit, key, ax, az, bx, bz, y0, y1, u0) {
  const len = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  const u1 = u0 + len / TEX_W, va = (y0 - GF) / TEX_H, vb = (y1 - GF) / TEX_H;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, va, u1, va, u1, vb, u0, vb], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  (kit.parts[key] ||= []).push(g);
}

function farFlat(kit, x0, z0, x1, z1, y) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  (kit.parts.roof ||= []).push(g);
}

export const LEVEL11 = {
  id: 'level11',
  number: 11,
  name: 'Level 11',
  title: 'The City That Never Sleeps',
  difficulty: 2,
  next: 'level12',
  create: (ctx) => new Level11(ctx),
};
