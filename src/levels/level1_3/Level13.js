import * as THREE from 'three';
import { GridWorld, GeoBuilder } from '../../world/GridWorld.js';
import { SURFACE, MAX_DYN_LIGHTS, MAX_DECAY, createWorldMaterial } from '../../world/materials.js';
import { whiteTileWallTexture, whiteFloorTexture, ceilingTexture, solidTexture } from '../../world/textures.js';
import { PropKit, disposeTextures } from '../../world/props.js';
import { generateLevel13, ROOM } from './generate.js';

// Level 1.3 — blinding white rooms and corridors off one long hallway.
//
// Each visit rolls which Level 1.3 you get:
//  - the sanctuary (Survival Difficulty 0): Detox Zones heal you (it burns),
//    M.E.G. doctors staff The Ward, supply rooms are stocked
//  - the Dead Zone: the Decay has got in. Black voids eat the floors and
//    walls and keep spreading; step into one and you're gone. The Detox
//    Zones heal you for a moment and then tear you apart. One end of the
//    hallway is already being swallowed.
// Either way, noclip into either end of the main hallway to return to Level 1.

const DECAY_CHANCE = 0.65;
const BOTTLE_SANITY = 35;
const MAX_BOTTLES = 6;

const DOCUMENTS = [
  'AUTOPSY NOTES, Dr. Reathe: "Each victim suffered a systemic, extreme, lethal overproduction or overreaction, as if their bodies had been given instructions a hundred times as extreme as they should have been."',
  'SCOUT\'S LOG: "I lowered about a yard of fishing line into the nearest pit. Less than a foot of it came back. This was absolutely Decay."',
  'SCOUT\'S LOG: "The cut began to scab away and heal. Then the skin around it began to bubble and tear." Don\'t trust the Detox Zones.',
  'DIRECTOR\'S NOTE: "It is clear that the level is no longer of any use to us. I wonder how many worlds will be lost to the Decay. Where will it end?"',
];

export class Level13 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    this.decayed = rng.fork('variant').chance(DECAY_CHANCE);
    const layout = generateLevel13(rng.fork('layout'), this.decayed);
    this.layout = layout;
    const { map } = layout;
    this.map = map;
    const H = map.height, cs = map.cellSize;

    this.textures = {
      wall: whiteTileWallTexture(renderer),
      floor: whiteFloorTexture(renderer),
      ceiling: ceilingTexture(renderer, '#f1f1ec'),
      walls: { end: { map: solidTexture(renderer, '#8e908e', 0.03), scale: 1 } },
    };
    shared.ceilH.value = H;
    const width = map.width;
    this.world = new GridWorld({
      map,
      lights: layout.lights,
      pillars: this.pilasters(),
      textures: this.textures,
      shared,
      texScale: { wall: 1 / 1.2, floor: 1 / 1.6, ceiling: 1 / 1.2 },
      wallStyle: (e) => (!e.h && (e.x === 0 || e.x === map.cols) && e.y === layout.hallY ? 'end' : 'wall'),
      dampAt: () => 0,
    });
    scene.add(this.world.group);
    this.width = width;
    this.hallZ = (layout.hallY + 0.5) * cs;

    const [sx, sz] = map.cellCenter(layout.spawn.x, layout.spawn.y);
    this.spawn = { x: sx, z: sz, yaw: layout.spawnYaw };
    this.card = this.decayed
      ? { title: 'DEAD ZONE', sub: 'M.E.G.: ONLY SANCTIONED OPERATIVES MAY ENTER' }
      : { title: 'THE WARD', sub: 'SURVIVAL DIFFICULTY 0' };

    this.kit = new PropKit((x, z) => this.world.sampleLight(x, z));
    this.props = new THREE.Group();
    scene.add(this.props);
    this.mats = {
      tape: this.litMaterial(solidTexture(renderer, '#2fb34a', 0.02)),
      blood: this.litMaterial(solidTexture(renderer, '#4a2014', 0.1)),
    };
    this.zones = [];
    this.pickups = [];
    this.doctors = [];
    this.monitors = [];
    this.documents = [];
    this.buildRooms();
    if (this.decayed) {
      this.buildBlood();
      this.setupDecay();
    }

    this.flickers = layout.lights.map((l, i) => (l.state === 'flicker' ? i : -1)).filter((i) => i >= 0);
    this.phase = new Map(this.flickers.map((i) => [i, this.rng.next() * 100]));
    this.time = 0;
    this.done = false;
    this.said = new Set();
    this.inZone = null;
    this.zoneTime = 0;
    this.burnTimer = 0;
    this.nextAmbient = 2;
    this.nextBeat = 0;
    this.fallTime = -1;
    this.fogColor = new THREE.Color(0.9, 0.9, 0.88);
    this.fogDensity = this.decayed ? 0.03 : 0.014;
  }

  litMaterial(tex) {
    const m = createWorldMaterial(this.shared, tex, SURFACE.PLAIN, 1);
    (this.ownMats ||= []).push(m);
    return m;
  }

  once(k) {
    if (this.said.has(k)) return false;
    this.said.add(k);
    return true;
  }

  // Blocky white pilasters where the branch paths leave the hallway, like
  // the protruding tiled wall sections in the photos.
  pilasters() {
    const { map, rooms, hallY } = this.layout;
    const cs = map.cellSize;
    const out = [];
    for (const r of rooms) {
      const z = r.side === 0 ? hallY * cs : (hallY + 1) * cs;
      for (const x of [r.bx * cs, (r.bx + 1) * cs]) out.push({ x, z, size: 0.55 });
    }
    return out;
  }

  // ---- Build -------------------------------------------------------------

  buildRooms() {
    const { map } = this.layout;
    const cs = map.cellSize;
    const kit = this.kit;
    const tape = new GeoBuilder();
    const decayed = this.decayed;
    for (const r of this.layout.rooms) {
      const { cx, cz } = r;
      const roomHalf = (cs * 4) / 2;
      // Which way the room's door (branch) is: toward the hallway.
      const toHall = r.side === 0 ? 1 : -1;

      if (r.type === ROOM.DETOX || r.type === ROOM.WARD) {
        // The Detox Zone, marked out in green tape.
        const half = r.type === ROOM.DETOX ? 3.4 : 2.2;
        const zx = cx + (r.type === ROOM.WARD ? -2.5 : 0), zz = cz - toHall * (r.type === ROOM.WARD ? 1.2 : 0.6);
        const zone = { x0: zx - half, x1: zx + half, z0: zz - half, z1: zz + half };
        this.zones.push(zone);
        const w = 0.08;
        tape.flat(zone.x0, zone.z0, zone.x1, zone.z0 + w, 0.005, true);
        tape.flat(zone.x0, zone.z1 - w, zone.x1, zone.z1, 0.005, true);
        tape.flat(zone.x0, zone.z0, zone.x0 + w, zone.z1, 0.005, true);
        tape.flat(zone.x1 - w, zone.z0, zone.x1, zone.z1, 0.005, true);
      }

      if (r.type === ROOM.WARD) {
        // Beds along the far wall, a monitor beside each.
        for (let k = 0; k < 3; k++) {
          const bx = cx + 0.4 + k * 1.7, bz = cz - toHall * (roomHalf - 1.3);
          this.props.add(this.bed(bx, bz, decayed && this.rng.chance(0.7)));
          this.props.add(kit.mesh(kit.box(0.35, 0.3, 0.25), kit.mat(0x2a2e30, bx + 0.7, bz, { minLight: 0.4 }), bx + 0.7, 1.15, bz));
          this.monitors.push({ x: bx + 0.7, z: bz, flat: decayed && k === 1, phase: this.rng.next() });
        }
        if (!decayed) {
          for (let k = 0; k < 2; k++) {
            const d = this.doctor(cx + 1.2 + k * 1.8, cz + toHall * 0.8, toHall > 0 ? 0 : Math.PI);
            this.props.add(d.group);
            this.doctors.push(d);
          }
        } else {
          this.documents.push(this.paper(cx + 2.5, cz + toHall * 1.5));
        }
        const sign = this.wardSign(r, toHall);
        if (sign) this.props.add(sign);
      }

      if (r.type === ROOM.SUPPLIES) {
        // Cabinets on two walls and supplies to take.
        for (let k = 0; k < 4; k++) {
          const x = cx - roomHalf + 1.2 + k * 2.6, z = cz - toHall * (roomHalf - 0.45);
          this.props.add(this.cabinet(x, z, toHall));
        }
        const n = decayed ? this.rng.int(0, 2) : this.rng.int(2, 4);
        for (let k = 0; k < n; k++) {
          const type = this.rng.pick(['aid', 'aid', 'water', 'battery']);
          this.pickup(type, cx + this.rng.range(-3.5, 3.5), cz + this.rng.range(-2.5, 2.5));
        }
      }

      if (decayed && r.type === ROOM.DETOX && this.rng.chance(0.6)) {
        // Body bags nobody came back for.
        for (let k = this.rng.int(1, 3); k > 0; k--) {
          const bag = kit.mesh(kit.box(0.55, 0.28, 1.8), kit.mat(0x1d2420, cx, cz), cx + this.rng.range(-4.5, 4.5), 0.14, cz + this.rng.range(-4.5, 4.5));
          bag.rotation.y = this.rng.range(0, Math.PI);
          this.props.add(bag);
        }
      }
    }
    this.addBuilt(tape, this.mats.tape);

    // Documents: one near the way in, the rest deeper.
    if (decayed) {
      this.documents.unshift(this.paper(this.spawn.x + 1.2, this.hallZ + 0.8));
      const ds = this.layout.rooms.filter((r) => r.type === ROOM.DETOX);
      for (let k = 0; k < 2 && k < ds.length; k++) this.documents.push(this.paper(ds[k].cx + 1, ds[k].cz));
      this.documents.forEach((d, i) => (d.text = DOCUMENTS[i % DOCUMENTS.length]));
    } else {
      const sign = this.paper(this.spawn.x + 1.2, this.hallZ + 0.8);
      sign.text = 'THE WARD (M.E.G.): Wait for a doctor before you enter a Detox Zone. Unset bones heal crooked. Everyone is welcome.';
      this.documents.push(sign);
    }
  }

  addBuilt(builder, mat) {
    const g = builder.build();
    if (!g) return;
    (this.ownGeos ||= []).push(g);
    this.props.add(new THREE.Mesh(g, mat));
  }

  bed(x, z, covered) {
    const kit = this.kit;
    const g = new THREE.Group();
    g.add(kit.mesh(kit.box(0.95, 0.1, 2.0), kit.mat(0xb8bcbc, x, z, { minLight: 0.5 }), 0, 0.55, 0));
    g.add(kit.mesh(kit.box(0.9, 0.14, 1.9), kit.mat(0xf4f4f0, x, z, { minLight: 0.5 }), 0, 0.67, 0));
    for (const [lx, lz] of [[-0.42, -0.9], [0.42, -0.9], [-0.42, 0.9], [0.42, 0.9]]) {
      g.add(kit.mesh(kit.box(0.05, 0.55, 0.05), kit.mat(0x9a9e9e, x, z), lx, 0.27, lz));
    }
    if (covered) {
      // A sheet over something that stopped moving a while ago.
      g.add(kit.mesh(kit.box(0.6, 0.28, 1.6), kit.mat(0xe2ddd0, x, z, { minLight: 0.45 }), 0, 0.88, 0));
      g.add(kit.mesh(kit.box(0.3, 0.2, 0.3), kit.mat(0xe2ddd0, x, z, { minLight: 0.45 }), 0, 0.92, -0.75));
      g.add(kit.mesh(kit.box(0.5, 0.02, 0.6), kit.mat(0x5a2418, x, z), 0.05, 1.03, 0.1));
    }
    g.position.set(x, 0, z);
    return g;
  }

  cabinet(x, z, toHall) {
    const kit = this.kit;
    const g = new THREE.Group();
    g.add(kit.mesh(kit.box(1.4, 1.9, 0.5), kit.mat(0xeceeea, x, z, { minLight: 0.5 }), 0, 0.95, 0));
    for (const y of [0.5, 1.0, 1.5]) g.add(kit.mesh(kit.box(1.3, 0.03, 0.02), kit.mat(0xb0b4b4, x, z), 0, y, 0.26));
    const red = kit.mat(0xc82018, x, z, { minLight: 0.6 });
    g.add(kit.mesh(kit.box(0.3, 0.08, 0.02), red, 0, 1.7, 0.26));
    g.add(kit.mesh(kit.box(0.08, 0.3, 0.02), red, 0, 1.7, 0.26));
    g.position.set(x, 0, z);
    g.rotation.y = toHall > 0 ? 0 : Math.PI;
    return g;
  }

  doctor(x, z, rot) {
    const kit = this.kit;
    const g = new THREE.Group();
    const coat = kit.mat(0xf2f2ee, x, z, { minLight: 0.5 });
    const scrubs = kit.mat(0x3c8c8a, x, z, { minLight: 0.45 });
    const skin = kit.mat(0xc8a68a, x, z, { minLight: 0.45 });
    g.add(kit.mesh(kit.box(0.46, 0.78, 0.28), coat, 0, 1.2, 0));
    g.add(kit.mesh(kit.box(0.4, 0.2, 0.26), scrubs, 0, 1.45, 0.02));
    for (const s of [-0.1, 0.1]) g.add(kit.mesh(kit.box(0.14, 0.82, 0.16), scrubs, s, 0.41, 0));
    for (const s of [-0.29, 0.29]) g.add(kit.mesh(kit.box(0.1, 0.62, 0.11), coat, s, 1.22, 0));
    g.add(kit.mesh(kit.cyl(0.11, 0.12, 0.26, 10), skin, 0, 1.75, 0));
    g.add(kit.mesh(kit.box(0.08, 0.1, 0.02), kit.mat(0x2a6aa8, x, z, { minLight: 0.5 }), 0.12, 1.42, 0.15));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    return { group: g, x, z, said: false };
  }

  wardSign(r, toHall) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = this.decayed ? '#3a3a3a' : '#2fb34a';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('THE WARD', 128, 34);
    const tex = new THREE.CanvasTexture(c);
    (this.ownTex ||= []).push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xdddddd });
    (this.basicMats ||= []).push(mat);
    const geo = new THREE.PlaneGeometry(1.4, 0.35);
    (this.ownGeos ||= []).push(geo);
    const m = new THREE.Mesh(geo, mat);
    // Above the branch opening, on the hallway side.
    const cs = this.map.cellSize;
    const z = r.side === 0 ? this.layout.hallY * cs + 0.1 : (this.layout.hallY + 1) * cs - 0.1;
    m.position.set((r.bx + 0.5) * cs, this.map.height - 0.45, z);
    m.rotation.y = toHall > 0 ? 0 : Math.PI;
    return m;
  }

  paper(x, z) {
    const geo = new THREE.PlaneGeometry(0.22, 0.3);
    geo.rotateX(-Math.PI / 2);
    (this.ownGeos ||= []).push(geo);
    const m = new THREE.Mesh(geo, this.kit.mat(0xf6f4ea, x, z, { minLight: 0.6 }));
    m.position.set(x, 0.01, z);
    m.rotation.y = this.rng.range(0, Math.PI);
    this.props.add(m);
    return { x, z, read: false, text: '' };
  }

  pickup(type, x, z) {
    const kit = this.kit;
    const g = new THREE.Group();
    if (type === 'aid') {
      g.add(kit.mesh(kit.box(0.34, 0.16, 0.24), kit.mat(0xf4f4f0, x, z, { minLight: 0.6 }), 0, 0.08, 0));
      const red = kit.mat(0xd01c14, x, z, { minLight: 0.6 });
      g.add(kit.mesh(kit.box(0.14, 0.01, 0.04), red, 0, 0.165, 0));
      g.add(kit.mesh(kit.box(0.04, 0.01, 0.14), red, 0, 0.165, 0));
    } else if (type === 'water') {
      g.add(kit.mesh(kit.cyl(0.055, 0.06, 0.26, 10), kit.mat(0xd0dad0, x, z, { opacity: 0.85 }), 0, 0.13, 0));
      g.add(kit.mesh(kit.cyl(0.03, 0.03, 0.04, 8), kit.mat(0x3355bb, x, z), 0, 0.29, 0));
    } else {
      g.add(kit.mesh(kit.box(0.14, 0.24, 0.1), kit.mat(0x26282a, x, z, { minLight: 0.4 }), 0, 0.12, 0));
      g.add(kit.mesh(kit.box(0.14, 0.04, 0.1), kit.mat(0xc08a2a, x, z, { minLight: 0.5 }), 0, 0.26, 0));
    }
    g.position.set(x, 0, z);
    g.rotation.y = this.rng.range(0, Math.PI);
    this.props.add(g);
    this.pickups.push({ type, x, z, group: g, taken: false });
  }

  // Dried blood streaks across the white tile.
  buildBlood() {
    const b = new GeoBuilder();
    const streak = (x, z, len, w, ang) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const dx = c * len / 2, dz = s * len / 2, px = -s * w / 2, pz = c * w / 2;
      const y = 0.006;
      b.quad([x - dx - px, y, z - dz - pz], [x + dx - px, y, z + dz - pz], [x + dx + px, y, z + dz + pz], [x - dx + px, y, z - dz + pz], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
    };
    for (let k = 0; k < 26; k++) {
      const x = this.rng.range(2, this.width - 2), z = this.hallZ + this.rng.range(-1.1, 1.1);
      const len = this.rng.range(1.5, 6);
      // Drag marks, mostly along the hallway; some veer off toward a room.
      const ang = this.rng.chance(0.75) ? this.rng.range(-0.15, 0.15) : this.rng.range(0.9, 2.2);
      streak(x, z, len, this.rng.range(0.08, 0.3), ang);
      if (this.rng.chance(0.5)) streak(x + this.rng.range(-0.3, 0.3), z + 0.18, len * 0.7, 0.06, ang + 0.05);
    }
    for (const r of this.layout.rooms) {
      if (!this.rng.chance(0.5)) continue;
      streak(r.cx + this.rng.range(-3, 3), r.cz + this.rng.range(-3, 3), this.rng.range(1, 3.5), 0.2, this.rng.range(0, Math.PI));
    }
    this.addBuilt(b, this.mats.blood);
  }

  setupDecay() {
    const { rooms } = this.layout;
    this.spots = [];
    // One end of the hallway is already being swallowed.
    this.doomedLeft = this.spawn.x > this.width / 2;
    this.spots.push({ x: this.doomedLeft ? 0.5 : this.width - 0.5, z: this.hallZ, r: 1.2, max: 11, grow: 0.06 });
    // Pits along the hallway, kept to the sides so there's always a path.
    for (let k = 0; k < 5; k++) {
      for (let t = 0; t < 30; t++) {
        const x = this.rng.range(6, this.width - 6);
        if (Math.abs(x - this.spawn.x) < 5) continue;
        const z = this.hallZ + (this.rng.chance(0.5) ? -1 : 1) * this.rng.range(0.7, 1.1);
        if (this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 6)) continue;
        this.spots.push({ x, z, r: this.rng.range(0.3, 0.6), max: 0.85, grow: 0.004 });
        break;
      }
    }
    // Bigger ones in the rooms.
    for (const r of this.rng.shuffle([...rooms]).slice(0, 5)) {
      this.spots.push({ x: r.cx + this.rng.range(-3, 3), z: r.cz + this.rng.range(-3, 3), r: this.rng.range(0.6, 1.4), max: 3.5, grow: 0.01 });
    }
    this.nextSpot = this.rng.range(20, 35);
  }

  // ---- Per-frame ---------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    const hud = ctx.hud;
    const p = player.pos;

    if (this.decayed && this.time > 6 && this.once('intro2')) {
      hud.message(this.doomedLeft ? 'The left end is being swallowed. Head for the right end.' : 'The right end is being swallowed. Head for the left end.', 4);
    }

    this.updateLights(dt, player);

    // The Decay grows, and new spots open.
    if (this.decayed) {
      for (const s of this.spots) s.r = Math.min(s.max, s.r + s.grow * dt);
      this.nextSpot -= dt;
      if (this.nextSpot <= 0 && this.spots.length < MAX_DECAY) {
        this.nextSpot = this.rng.range(20, 35);
        const r = this.rng.pick(this.layout.rooms);
        const x = r.cx + this.rng.range(-4, 4), z = r.cz + this.rng.range(-4, 4);
        if (Math.hypot(x - p.x, z - p.z) > 8) this.spots.push({ x, z, r: 0.2, max: 2.5, grow: 0.02 });
      }
      const u = this.shared.decay.value;
      for (let i = 0; i < MAX_DECAY; i++) {
        const s = this.spots[i];
        if (s) u[i].set(s.x, s.z, s.r, 1);
        else u[i].set(0, 0, 0, 0);
      }
      // Step into the blackness and you're gone.
      if (!player.falling) {
        for (const s of this.spots) {
          if (Math.hypot(p.x - s.x, p.z - s.z) < s.r * 0.85) {
            player.falling = true;
            player.fallV = 0;
            this.fallTime = 0;
            ctx.audio.fall();
            ctx.fade(1, 1.1);
            break;
          }
        }
      }
      if (player.falling) {
        this.fallTime += dt;
        if (this.fallTime > 1.3) {
          this.done = true;
          ctx.onDeath('The Decay took you. Less than a foot of you came back.');
          return;
        }
        return;
      }
      player.sanity = Math.max(0, player.sanity - 0.2 * dt);
    } else {
      player.sanity = Math.min(100, player.sanity + 0.3 * dt);
    }

    // Detox Zones.
    const zone = this.zones.find((z) => p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1);
    if (zone !== this.inZone) {
      this.inZone = zone;
      this.zoneTime = 0;
    }
    if (zone) {
      this.zoneTime += dt;
      this.burnTimer -= dt;
      if (!this.decayed || this.zoneTime < 1.2) {
        player.health = Math.min(100, player.health + 11 * dt);
        player.sanity = Math.min(100, player.sanity + 2.5 * dt);
        if (this.burnTimer <= 0) {
          this.burnTimer = 0.9;
          ctx.hurtFlash(0.12);
          if (player.health < 99) ctx.audio.sizzle(0.06);
        }
        if (this.once('detox')) hud.message('Detox Zone: stand here to heal.', 3);
      } else {
        player.damage(17 * dt);
        if (this.burnTimer <= 0) {
          this.burnTimer = 0.5;
          ctx.hurtFlash(0.6);
          ctx.audio.sizzle(0.35);
          ctx.vibrate(80);
        }
        if (this.once('rotdetox')) hud.message('This Detox Zone is hurting you. Get out!', 3.5);
      }
    }

    // Supplies.
    for (const k of this.pickups) {
      if (k.taken || Math.hypot(k.x - p.x, k.z - p.z) > 0.8) continue;
      if (k.type === 'water' && player.bottles >= MAX_BOTTLES) continue;
      k.taken = true;
      this.props.remove(k.group);
      ctx.audio.pickup();
      if (k.type === 'aid') {
        player.health = Math.min(100, player.health + 40);
        hud.message('Medical supplies. You patch yourself up.', 2.5);
      } else if (k.type === 'water') {
        player.bottles++;
        hud.message('Almond Water', 2);
      } else {
        player.battery = 100;
        hud.message('Batteries. Flashlight recharged.', 2.5);
      }
    }
    for (const d of this.documents) {
      if (d.read || Math.hypot(d.x - p.x, d.z - p.z) > 1.3) continue;
      d.read = true;
      ctx.audio.click();
      hud.message(d.text, Math.min(10, 3 + d.text.length / 22));
    }

    this.updateAmbient(dt, player);

    if (player.health <= 0) {
      this.done = true;
      ctx.onDeath('The Detox Zone healed you a hundred times over.');
      return;
    }
    if (player.sanity <= 0) {
      this.done = true;
      ctx.onDeath('The white went black, and so did you.');
      return;
    }

    // Noclip into either end of the main hallway to return to Level 1.
    const inHall = Math.abs(p.z - this.hallZ) < this.map.cellSize / 2;
    if (inHall && (p.x < 0.46 || p.x > this.width - 0.46)) {
      this.done = true;
      ctx.onEscape('level1', 'noclip');
    }
  }

  updateLights(dt, player) {
    const { world, shared } = this;
    const near = [];
    for (const i of this.flickers) {
      const l = world.lights[i];
      const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
      if (d < 16) near.push([i, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < MAX_DYN_LIGHTS; k++) {
      const pos = shared.dynPos.value[k], col = shared.dynCol.value[k];
      if (k >= near.length) {
        pos.set(0, -100, 0, 0);
        continue;
      }
      const [i] = near[k];
      const l = world.lights[i];
      const t = this.time * 7 + this.phase.get(i);
      const on = Math.sin(t * 1.7) + Math.sin(t * 0.53) > -0.4;
      pos.set(l.x, this.map.height - 0.2, l.z, on ? l.power * 1.2 : 0.05);
      col.setRGB(1, 1, 1);
      world.setPanelLevel(i, on ? 1 : 0.05);
    }
  }

  updateAmbient(dt, player) {
    const { ctx, rng } = this;
    // Heart monitors in The Ward (one of them, in the Dead Zone, flatlined).
    this.nextBeat -= dt;
    if (this.nextBeat <= 0) {
      this.nextBeat = 0.9;
      for (const m of this.monitors) {
        const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
        if (d > 14) continue;
        const vol = 0.07 * (1 - d / 14);
        const pan = this.panTo(player, m.x, m.z);
        if (m.flat) {
          if (this.once('flatline')) {
            ctx.audio.beep(pan, vol * 1.4, 4, 880);
          }
        } else if (!this.decayed) {
          ctx.audio.beep(pan, vol);
        }
      }
    }
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0) return;
    this.nextAmbient = rng.range(3, 7);
    const pan = rng.range(-1, 1);
    if (this.decayed) {
      const r = rng.next();
      if (r < 0.4) ctx.audio.drip(pan, 0.12);
      else if (r < 0.6) ctx.audio.creak(pan, 0.25);
      else if (r < 0.75) ctx.audio.whisper(pan, 0.15);
      else ctx.audio.thud(pan, 0.15);
    } else if (rng.chance(0.4)) {
      ctx.audio.phantomSteps(pan * 0.6);
    }
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
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
    // Static from whichever hallway end is nearer (the ways out).
    const p = player.pos;
    let ex = p.x < this.width / 2 ? 0 : this.width;
    if (this.decayed && this.spots[0].r > 5) ex = this.doomedLeft ? this.width : 0;
    const d = Math.hypot(ex - p.x, this.hallZ - p.z);
    const exitGain = d < 26 ? 0.25 / (1 + (d / 6) ** 2) : 0;
    let rot = 0;
    if (this.decayed) {
      for (const s of this.spots) rot = Math.max(rot, 1 - Math.max(0, Math.hypot(p.x - s.x, p.z - s.z) - s.r) / 6);
    }
    return {
      hum: this.decayed ? 0.02 : 0.03,
      exitGain,
      exitPan: this.panTo(player, ex, this.hallZ),
      exitType: 'static',
      drone: this.decayed ? 0.04 + rot * 0.3 : 0,
      sanity: player.sanity,
      ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const [r, g, b] = this.world.sampleLight(player.pos.x, player.pos.z);
    const target = this.decayed
      ? new THREE.Color(0.02 + r * 0.45, 0.02 + g * 0.43, 0.015 + b * 0.34)
      : new THREE.Color(0.1 + r * 0.82, 0.1 + g * 0.82, 0.1 + b * 0.8);
    this.fogColor.lerp(target, Math.min(1, dt * 2));
    let nearRot = 0;
    if (this.decayed) {
      for (const s of this.spots) nearRot = Math.max(nearRot, 1 - Math.max(0, Math.hypot(player.pos.x - s.x, player.pos.z - s.z) - s.r) / 4);
    }
    const insanity = 1 - player.sanity / 100;
    const hurt = Math.max(0, Math.min(1, 1 - player.health / 100));
    const burning = this.inZone && this.decayed && this.zoneTime > 1.2 ? 1 : 0;
    return {
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
      warp: insanity * insanity * 1.2 + nearRot * 0.6 + burning * 1.5,
      aberr: 0.25 + insanity * 1.3 + hurt * 1.2 + nearRot * 0.8 + burning * 2,
      grain: this.decayed ? 0.06 + insanity * 0.06 : 0.03,
      shake: burning * 0.5,
    };
  }

  hudInfo(player) {
    let warn = null;
    if (this.inZone && this.decayed && this.zoneTime > 1.2) warn = 'GET OUT OF THE ZONE';
    else if (this.decayed && player) {
      for (const s of this.spots) {
        if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < s.r + 0.9) warn = 'WATCH THE DECAY';
      }
    }
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    for (const d of this.shared.decay.value) d.set(0, 0, 0, 0);
    for (const g of [this.world.group, this.props]) this.scene.remove(g);
    this.world.dispose();
    this.kit.dispose();
    for (const g of this.ownGeos || []) g.dispose();
    for (const m of this.ownMats || []) m.dispose();
    for (const m of this.basicMats || []) m.dispose();
    for (const t of this.ownTex || []) t.dispose();
    disposeTextures(this.textures);
  }
}

export const LEVEL1_3 = {
  id: 'level1_3',
  number: 1.3,
  name: 'Level 1.3',
  title: 'The Ward',
  difficulty: 0,
  next: 'level1',
  create: (ctx) => new Level13(ctx),
};
