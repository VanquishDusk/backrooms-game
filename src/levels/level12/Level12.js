import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js?v=20261101b';
import { Kit, Colliders, paintTex } from '../level94/kit.js?v=20261101b';
import { hash } from '../level11/city.js?v=20261101b';

// Level 12 — "Matrix".
//
// A small, brightly lit white room: a table, a chair, a locked door, and a
// clock over the door. Openings in the other walls lead out into a white
// nothing that goes on forever, scattered with old, beaten-up furniture,
// some of it halfway through the floor. The further you go, the more things
// break down: your memory included. Out there stand copies of the door;
// walk through one and you're back in the room.
//
// The level censors itself: photos come out as static or a colourless test
// card.
//
// The way out (Cmdr. Harris's notes are on the table; the clock's big hand
// goes round once a minute, so an "hour" here is one turn of it):
//   1. Sit on the chair for fifteen minutes (a quarter turn).
//   2. Get up and try the door. It's locked. Do it anyway.
//   3. Go out into the white and walk through one of the copycat doors.
//   4. Back in the room, wait exactly one hour, and try the door again.
// If it opens, it goes to one of the early levels. If not, start again.

const CHUNK = 40;
const ROOM = 3; // half-size of the room
const H = 3;
const SIT = 15; // seconds = clock minutes
const HOUR = 60;
const SLACK = 4;
const DESTS = ['level1', 'level4', 'level10', 'level1', 'level4', 'level10', 'level19', 'level23', 'level25', 'level34', 'level287'];
const CHAIR = { x: 0, z: 0.85 };

const NOTES = 'Notes on the table, in a hurried hand: "HARRIS — WAY OUT. 1) SIT ON THIS CHAIR 15 MIN. 2) TRY THE DOOR (LOCKED, DO IT ANYWAY). 3) GO OUT, FIND A COPY OF THE DOOR, GO THROUGH. 4) WAIT EXACTLY ONE HOUR. TRY THE DOOR. NO MORE, NO LESS." Underneath: "clock runs fast in here."';

export class Level12 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.seed = Math.floor(rng.next() * 1e6);
    this.censor = true;
    this.cameraFar = 400;
    this.own = { geos: [], mats: [], textures: [] };
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders(8);
    this.buildMaterials();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe8e8e4, 3.2);
    this.group.add(this.hemi);
    this.lamp = new THREE.PointLight(0xffffff, 6, 14, 1.2);
    this.lamp.position.set(0, H - 0.3, 0);
    this.group.add(this.lamp);
    this.buildFloor();
    this.buildRoom();
    this.chunks = new Map();
    this.seated = false;
    this.spawn = { x: 0.6, z: 2.0, yaw: 0.25 };
    this.world = {
      collide: (pos, r) => this.colliders.collide(pos, r),
      groundAt: () => 0,
      sampleLight: () => [1, 1, 1],
      ceilingHeight: (x, z) => (this.seated ? 1.32 : Math.abs(x) < ROOM && Math.abs(z) < ROOM ? H : 40),
    };
    this.time = 0;
    this.done = false;
    this.told = {};
    this.stage = 0; // 0 sit, 1 try the door, 2 copycat door, 3 wait an hour
    this.sitT = 0;
    this.backAt = 0;
    this.nextTick = 0;
    this.clockStart = this.rng.range(0, 60);
    this.opening = null;
    this.updateChunks({ pos: { x: 0, z: 0 } });
    this.script = [
      [1.5, 'A small white room, so bright it hurts. A table, a chair, a door. A clock over the door, ticking.'],
      [8, 'Openings in the walls lead out into white. Just white. Your thoughts feel... slow.'],
    ];
  }

  // ---- Building ---------------------------------------------------------------------------

  buildMaterials() {
    const own = this.own;
    const T = {};
    T.floor = paintTex(own, 256, 256, (c, w, h) => {
      c.fillStyle = '#ecebe6';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        c.fillStyle = `rgba(120,120,110,${(Math.random() * 0.05).toFixed(3)})`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      c.fillStyle = 'rgba(0,0,0,0.06)';
      for (let k = 0; k <= w; k += 64) {
        c.fillRect(k, 0, 1, h);
        c.fillRect(0, k, w, 1);
      }
    });
    T.wall = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#f4f3ef';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 800; i++) {
        c.fillStyle = `rgba(140,135,120,${(Math.random() * 0.05).toFixed(3)})`;
        c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
    });
    T.wood = paintTex(own, 64, 64, (c, w, h) => {
      c.fillStyle = '#6e5840';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(${Math.random() < 0.5 ? '30,20,10' : '160,130,90'},0.25)`;
        c.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2);
      }
      // Scuffs and chips.
      for (let i = 0; i < 20; i++) {
        c.fillStyle = 'rgba(200,190,170,0.3)';
        c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 1);
      }
    });
    T.face = paintTex(own, 128, 128, (c, w, h) => {
      c.fillStyle = '#f8f6f0';
      c.beginPath();
      c.arc(64, 64, 62, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#222';
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = '#222';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        c.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 5, 4, 10);
      }
    }, false);
    const L = (o) => {
      const m = new THREE.MeshLambertMaterial(o);
      own.mats.push(m);
      return m;
    };
    this.M = {
      floor: L({ map: T.floor }),
      wall: L({ map: T.wall }),
      wood: L({ map: T.wood }),
      darkwood: L({ map: T.wood, color: 0x8a7a6a }),
      fabric: L({ color: 0x8a7a64 }),
      fabric2: L({ color: 0x6a5e58 }),
      metal: L({ color: 0x6a6a66 }),
      shade: L({ color: 0xe8d8b0, emissive: 0x6a5a30, emissiveIntensity: 0.4 }),
      door: L({ map: T.wood, color: 0xd8d0c4 }),
      frame: L({ color: 0xffffff }),
      knob: L({ color: 0xb8a060 }),
      hole: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      panel: L({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 }),
      face: L({ map: T.face }),
      hand: new THREE.MeshBasicMaterial({ color: 0x111111 }),
      paper: L({ color: 0xf2eee0 }),
    };
    own.mats.push(this.M.hole, this.M.hand);
    this.T = T;
  }

  buildFloor() {
    T_REPEAT(this.T.floor, 1);
    const g = new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 200, uv.getY(k) * 200);
    this.floor = new THREE.Mesh(g, this.M.floor);
    this.own.geos.push(g);
    this.group.add(this.floor);
  }

  buildRoom() {
    const kit = new Kit();
    const solid = (x, z, hw, hd, y1 = H) => this.colliders.add({ x, z, hw, hd, rot: 0, y0: -1, y1 });
    const t = 0.2, R = ROOM;
    // North wall, with the door in the middle.
    kit.box('wall', -1.75, H / 2, -R, 2.5 + t, H, t, 0, 0.5);
    kit.box('wall', 1.75, H / 2, -R, 2.5 + t, H, t, 0, 0.5);
    kit.box('wall', 0, 2.55, -R, 1.0, 0.9, t, 0, 0.5);
    solid(-1.75, -R, 1.35, t / 2);
    solid(1.75, -R, 1.35, t / 2);
    // The other three walls each have a nook through to the white.
    const nook = 0.75;
    for (const [axis, s] of [['z', 1], ['x', -1], ['x', 1]]) {
      const len = R - nook;
      for (const side of [-1, 1]) {
        const c = side * (nook + len / 2);
        if (axis === 'z') {
          kit.box('wall', c, H / 2, s * R, len + t, H, t, 0, 0.5);
          solid(c, s * R, len / 2 + t / 2, t / 2);
        } else {
          kit.box('wall', s * R, H / 2, c, t, H, len + t, 0, 0.5);
          solid(s * R, c, t / 2, len / 2 + t / 2);
        }
      }
      if (axis === 'z') kit.box('wall', 0, 2.7, s * R, nook * 2, 0.6, t, 0, 0.5);
      else kit.box('wall', s * R, 2.7, 0, t, 0.6, nook * 2, 0, 0.5);
    }
    // Ceiling and light.
    kit.box('wall', 0, H + 0.1, 0, R * 2 + t, 0.2, R * 2 + t, 0, 0.5);
    kit.box('panel', 0, H - 0.02, 0, 1.4, 0.04, 0.7);
    // The table, the chair, the hole under the table.
    table(kit, 0, 0, 0, 1.2, 0.8);
    solid(0, 0, 0.6, 0.4, 0.8);
    chair(kit, CHAIR.x, CHAIR.z, Math.PI, 0);
    kit.box('paper', 0.15, 0.775, 0.05, 0.28, 0.02, 0.36);
    kit.add('hole', new THREE.CircleGeometry(0.35, 20).rotateX(-Math.PI / 2), 0, 0.005, 0);
    // The door.
    doorAt(kit, 0, -R, 0);
    // The clock over it.
    kit.add('face', new THREE.CircleGeometry(0.32, 24), 0, 2.55, -R + 0.11);
    const room = kit.build(this.M, this.own);
    this.group.add(room);
    const hand = (len, w) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01).translate(0, len / 2, 0), this.M.hand);
      m.position.set(0, 2.55, -R + 0.125);
      this.own.geos.push(m.geometry);
      this.group.add(m);
      return m;
    };
    this.minute = hand(0.26, 0.025);
    this.hourHand = hand(0.17, 0.04);
    // The door leaf, separate so it can swing open.
    this.leaf = new THREE.Group();
    this.leaf.position.set(-0.47, 0, -R);
    const lg = new THREE.BoxGeometry(0.94, 2.08, 0.06).translate(0.47, 1.04, 0);
    const leaf = new THREE.Mesh(lg, this.M.door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), this.M.knob);
    knob.position.set(0.85, 1.0, 0.06);
    this.own.geos.push(lg, knob.geometry);
    this.leaf.add(leaf, knob);
    this.group.add(this.leaf);
    this.doorSolid = solid(0, -R, 0.5, 0.06);
  }

  // ---- The white, in chunks ----------------------------------------------------------------

  updateChunks(player) {
    const ci = Math.floor(player.pos.x / CHUNK), cj = Math.floor(player.pos.z / CHUNK);
    if (ci === this.ci && cj === this.cj) return;
    this.ci = ci;
    this.cj = cj;
    const keep = new Set();
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const key = `${i},${j}`;
      keep.add(key);
      if (!this.chunks.has(key)) this.chunks.set(key, this.makeChunk(i, j));
    }
    for (const [key, c] of this.chunks) {
      if (keep.has(key)) continue;
      this.group.remove(c.group);
      for (const g of c.geos) g.dispose();
      for (const s of c.solids) this.colliders.remove(s);
      this.chunks.delete(key);
    }
  }

  makeChunk(i, j) {
    const kit = new Kit();
    const h = (k) => hash(i, j, k, this.seed);
    const solids = [], doors = [], floaters = [], stairs = [];
    const solid = (x, z, hw, hd, y1 = 2) => {
      const s = this.colliders.add({ x, z, hw, hd, rot: 0, y0: -1, y1 });
      solids.push(s);
    };
    const x0 = i * CHUNK, z0 = j * CHUNK;
    const nearRoom = (x, z, m = 6) => Math.abs(x) < ROOM + m && Math.abs(z) < ROOM + m;
    // Copycat doors: a couple close by, so the first one isn't hard to find.
    const doorSpots = [];
    if (i === 0 && j === 0) doorSpots.push([14, 9, 0.6]);
    if (i === -1 && j === -1) doorSpots.push([-15, -8, 2.1]);
    if (h(1) < 0.4) doorSpots.push([x0 + 6 + h(2) * (CHUNK - 12), z0 + 6 + h(3) * (CHUNK - 12), h(4) * Math.PI * 2]);
    for (const [x, z, rot] of doorSpots) {
      if (nearRoom(x, z, 4)) continue;
      doorAt(kit, x, z, rot, true);
      const c = Math.cos(rot), s = Math.sin(rot);
      // The frame posts are solid; the doorway itself takes you back.
      for (const side of [-1, 1]) solid(x + c * side * 0.58, z - s * side * 0.58, 0.1, 0.1, 2.3);
      doors.push({ x, z, rot });
    }
    // Now and then, a white staircase going up into nothing.
    if (h(6) < 0.16) {
      const sx = x0 + 8 + h(7) * (CHUNK - 16), sz = z0 + 8 + h(8) * (CHUNK - 16);
      if (!nearRoom(sx, sz, 10)) {
        for (let k = 0; k < 12; k++) kit.box('frame', sx, 0.1 + k * 0.2, sz - k * 0.28, 1.4, 0.2, 0.3);
        for (const s of [-1, 1]) kit.box('frame', sx + s * 0.75, 1.4, sz - 1.5, 0.06, 2.8, 3.4);
        stairs.push({ x: sx, z: sz - 0.4 });
      }
    }
    // Furniture: old, beaten up, some of it sinking into the floor. It gets
    // worse further out.
    const n = 3 + Math.floor(h(5) * 6);
    for (let k = 0; k < n; k++) {
      const x = x0 + h(10 + k) * CHUNK, z = z0 + h(30 + k) * CHUNK;
      if (nearRoom(x, z) || doorSpots.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 3)) continue;
      const r = Math.hypot(x, z);
      const decay = Math.max(0, Math.min(1, (r - 18) / 220));
      const sink = h(50 + k) < 0.3 + decay * 0.5 ? -(0.2 + h(70 + k) * (0.4 + decay * 0.8)) : 0;
      const tilt = (h(90 + k) - 0.5) * decay * 1.4;
      const ry = h(110 + k) * Math.PI * 2;
      const stretch = 1 + decay * (h(130 + k) - 0.3) * 1.2;
      const type = Math.floor(h(150 + k) * 6);
      const sub = new Kit();
      if (type === 0) chair(sub, 0, 0, 0, 0);
      else if (type === 1) table(sub, 0, 0, 0, 1.1 + h(170 + k) * 0.6, 0.7);
      else if (type === 2) floorLamp(sub);
      else if (type === 3) drawers(sub);
      else if (type === 4) armchair(sub);
      else tv(sub);
      const grp = sub.build(this.M, { geos: [], mats: [], textures: [] });
      const geos = [];
      grp.traverse((m) => m.isMesh && geos.push(m.geometry));
      grp.position.set(x, sink, z);
      grp.rotation.set(tilt, ry, tilt * 0.5);
      grp.scale.set(1, stretch, 1);
      // Far out, some of it has come loose from the floor altogether.
      if (decay > 0.35 && h(190 + k) < decay * 0.5) floaters.push({ g: grp, y: 1 + h(210 + k) * 4 * decay, ph: h(230 + k) * 6 });
      kit.parts.__groups = kit.parts.__groups || [];
      kit.parts.__groups.push({ grp, geos });
      if (sink > -0.5) solid(x, z, 0.45, 0.45, 1.2);
    }
    const subs = kit.parts.__groups || [];
    delete kit.parts.__groups;
    const own = { geos: [], mats: [], textures: [] };
    const group = kit.build(this.M, own);
    for (const s of subs) {
      group.add(s.grp);
      own.geos.push(...s.geos);
    }
    this.group.add(group);
    return { group, geos: own.geos, solids, doors, floaters, stairs };
  }

  // ---- Per frame ------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    this.updateChunks(player);
    const p = player.pos;
    this.floor.position.set(Math.round(p.x / 4) * 4, 0, Math.round(p.z / 4) * 4);
    // The clock: the big hand goes round once a minute.
    const t = this.clockStart + this.time;
    this.minute.rotation.z = -(t / 60) * Math.PI * 2;
    this.hourHand.rotation.z = -(t / 720) * Math.PI * 2 - 1.3;
    const inRoom = Math.abs(p.x) < ROOM && Math.abs(p.z) < ROOM;
    if (inRoom && this.time > this.nextTick) {
      this.nextTick = Math.floor(this.time) + 1;
      ctx.audio.tick?.(0, 0.05);
    }
    // Things float, far out.
    for (const c of this.chunks.values()) for (const f of c.floaters) f.g.position.y = f.y + Math.sin(this.time * 0.6 + f.ph) * 0.3;
    // Sitting.
    if (this.seated) {
      p.x = CHAIR.x;
      p.z = CHAIR.z;
      this.sitT += dt;
      if (this.sitT >= SIT && !this.told.sat) {
        this.told.sat = true;
        ctx.hud.message('The clock\'s big hand has gone a quarter of the way round since you sat down.', 4);
      }
    }
    // The door, swinging open.
    if (this.opening) {
      this.opening.t += dt;
      this.leaf.rotation.y = Math.min(1.6, this.opening.t * 1.4);
      if (this.opening.t > 1.4) {
        this.done = true;
        ctx.onEscape(this.opening.target, 'door');
      }
      return;
    }
    // Walking through a copy of the door.
    for (const c of this.chunks.values()) for (const d of c.doors) {
      const dx = p.x - d.x, dz = p.z - d.z;
      const c0 = Math.cos(d.rot), s0 = Math.sin(d.rot);
      const along = dx * c0 - dz * s0, across = dx * s0 + dz * c0;
      if (Math.abs(along) < 0.45 && Math.abs(across) < 0.25) this.throughCopy(player);
      else if (Math.hypot(dx, dz) < 12 && !this.told.copy) {
        this.told.copy = true;
        ctx.hud.message('A door, standing on its own in the white. The same door as the one in the room. Exactly the same.', 4);
      }
    }
    // A white staircase up into the white: somewhere else.
    for (const c of this.chunks.values()) for (const s of c.stairs) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < 14 && !this.told.stairs) {
        this.told.stairs = true;
        ctx.hud.message('A white staircase, going up into nothing. No banister, no landing at the top.', 4);
      }
      if (d < 0.7) {
        this.done = true;
        ctx.hud.message('You climb. At the top there is a hallway: beige walls, fluorescent tubes, apartment doors.', 5);
        ctx.onEscape('level13', 'walk');
        return;
      }
    }
    // Memory fog: the further out, the worse.
    const r = Math.hypot(p.x, p.z);
    this.far = r;
    if (r > 70) player.sanity = Math.max(0, player.sanity - ((r - 70) / 300) * dt);
    else if (inRoom) player.sanity = Math.min(100, player.sanity + 0.6 * dt);
    if (r > 60 && !this.told.fog) {
      this.told.fog = true;
      ctx.hud.message('What were you doing? You were... going somewhere. The room. Where is the room?', 4);
    }
    if (r > 160 && !this.told.fog2) {
      this.told.fog2 = true;
      ctx.hud.message('Things are coming apart out here. So are you. Turn back.', 4);
    }
    if (player.sanity <= 0 || player.health <= 0) {
      this.done = true;
      ctx.onDeath('You forgot the way back. Then you forgot there was a way back.');
    }
  }

  throughCopy(player) {
    const { ctx } = this;
    ctx.fade?.(1, 0.08);
    setTimeout(() => ctx.fade?.(0, 0.8), 120);
    ctx.audio.door?.();
    player.pos.x = 0;
    player.pos.z = 1.9;
    player.yaw = 0;
    if (this.stage === 2) {
      this.stage = 3;
      this.backAt = this.time;
    }
    ctx.hud.message('You step through... and you\'re back in the white room, by the table. The clock ticks over the door.', 4);
  }

  // The act button: sit, stand, try the door.
  near(player) {
    const p = player.pos;
    if (this.seated) return 'stand';
    if (Math.hypot(p.x - CHAIR.x, p.z - CHAIR.z) < 0.9) return 'sit';
    if (Math.abs(p.x) < 0.8 && p.z < -ROOM + 1.3 && p.z > -ROOM) return 'door';
    return null;
  }

  fire(player) {
    if (this.opening || this.done) return;
    const { ctx } = this;
    const what = this.near(player);
    if (what === 'sit') {
      this.seated = true;
      this.sitT = 0;
      this.told.sat = false;
      ctx.hud.message(NOTES, 10);
    } else if (what === 'stand') {
      this.seated = false;
      if (this.sitT >= SIT && this.stage <= 1) this.stage = 1;
      player.pos.z = CHAIR.z + 0.6;
    } else if (what === 'door') {
      ctx.audio.rattle?.(0, 0.3);
      if (this.stage === 3) {
        const waited = this.time - this.backAt;
        if (Math.abs(waited - HOUR) <= SLACK) return this.open('The handle turns. After all that, it just... turns.');
        this.stage = 0;
        ctx.hud.message(waited < HOUR ? 'Locked. Too soon? You can\'t remember exactly when you came back in.' : 'Locked. Too late? It\'s hard to keep hold of the time in here.', 4);
        return;
      }
      if (this.stage === 1) {
        if (this.rng.chance(0.03)) return this.open('Locked... no. It opens. Lucky you.');
        this.stage = 2;
        ctx.hud.message('Locked. Like the notes said.', 3);
        return;
      }
      ctx.hud.message('Locked.', 2);
    }
  }

  open(msg) {
    const target = this.rng.pick(DESTS);
    this.ctx.hud.message(msg, 4);
    this.ctx.audio.door?.();
    this.colliders.remove(this.doorSolid);
    this.opening = { t: 0, target };
    this.ctx.award?.('out12');
  }

  drink(player) {
    if (!player.takeItem('water')) {
      this.ctx.hud.message('No Almond Water.', 1.8);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads ----------------------------------------------------------------------

  audioMix(player) {
    const r = this.far || 0;
    return {
      hum: Math.abs(player.pos.x) < ROOM && Math.abs(player.pos.z) < ROOM ? 0.06 : 0.015, exitGain: 0, exitPan: 0,
      drone: Math.min(0.2, Math.max(0, (r - 40) / 600)), machine: 0, wind: 0.01,
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const r = this.far || 0;
    const k = Math.min(1, r / 250);
    this.fogC = this.fogC || new THREE.Color();
    this.fogC.setRGB(0.95, 0.95, 0.94);
    const insane = 1 - player.sanity / 100;
    return {
      fogColor: this.fogC,
      fogDensity: 0.012 + k * 0.03,
      warp: k * 0.6 + insane * 0.5, aberr: 0.1 + k * 1.2, grain: 0.1 + k * 0.15, soften: 0.35, mono: 0.55,
    };
  }

  hudInfo(player) {
    const n = this.near(player);
    const act = n === 'sit' ? 'SIT' : n === 'stand' ? 'STAND' : n === 'door' ? 'TRY DOOR' : null;
    const warn = (this.far || 0) > 160 ? 'YOU ARE FORGETTING' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true, act };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.chunks.values()) for (const g of c.geos) g.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

function T_REPEAT(t) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
}

// ---- Furniture ----------------------------------------------------------------------------------

function table(kit, x, z, ry, w = 1.2, d = 0.8) {
  const c = Math.cos(ry), s = Math.sin(ry);
  kit.add('wood', new THREE.BoxGeometry(w, 0.05, d), x, 0.74, z, 0, ry, 0);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = lx * (w / 2 - 0.06), pz = lz * (d / 2 - 0.06);
    kit.add('wood', new THREE.BoxGeometry(0.05, 0.72, 0.05), x + px * c + pz * s, 0.36, z - px * s + pz * c);
  }
}

function chair(kit, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  kit.add('wood', new THREE.BoxGeometry(0.44, 0.04, 0.42), x, 0.45, z, 0, ry, 0);
  for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    const [px, pz] = at(lx, lz);
    kit.add('wood', new THREE.BoxGeometry(0.035, 0.45, 0.035), px, 0.225, pz);
  }
  const [bx, bz] = at(0, 0.19);
  kit.add('wood', new THREE.BoxGeometry(0.44, 0.5, 0.03), bx, 0.72, bz, 0, ry, 0);
}

function floorLamp(kit) {
  kit.add('metal', new THREE.CylinderGeometry(0.16, 0.18, 0.04, 10), 0, 0.02, 0);
  kit.add('metal', new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), 0, 0.77, 0);
  kit.add('shade', new THREE.CylinderGeometry(0.14, 0.24, 0.3, 12, 1, true), 0, 1.55, 0);
}

function drawers(kit) {
  kit.add('darkwood', new THREE.BoxGeometry(0.9, 1.0, 0.45), 0, 0.5, 0);
  for (let k = 0; k < 3; k++) {
    kit.add('wood', new THREE.BoxGeometry(0.82, 0.26, 0.02), 0, 0.2 + k * 0.3, 0.235);
    kit.add('knob', new THREE.BoxGeometry(0.1, 0.02, 0.03), 0, 0.22 + k * 0.3, 0.25);
  }
}

function armchair(kit) {
  kit.add('fabric', new THREE.BoxGeometry(0.85, 0.42, 0.8), 0, 0.21, 0);
  kit.add('fabric', new THREE.BoxGeometry(0.85, 0.55, 0.18), 0, 0.68, -0.31);
  kit.add('fabric2', new THREE.BoxGeometry(0.16, 0.25, 0.8), -0.36, 0.52, 0);
  kit.add('fabric2', new THREE.BoxGeometry(0.16, 0.25, 0.8), 0.36, 0.52, 0);
}

function tv(kit) {
  kit.add('darkwood', new THREE.BoxGeometry(0.7, 0.5, 0.45), 0, 0.25, 0);
  kit.add('metal', new THREE.BoxGeometry(0.6, 0.48, 0.5), 0, 0.74, 0);
  kit.add('hole', new THREE.PlaneGeometry(0.46, 0.36), 0, 0.75, 0.252);
}

// A door in a white frame. `freestanding` adds a frame from both sides.
function doorAt(kit, x, z, ry, freestanding = false) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const side of [-1, 1]) kit.add('frame', new THREE.BoxGeometry(0.1, 2.2, 0.26), x + c * side * 0.53, 1.1, z - s * side * 0.53, 0, ry, 0);
  kit.add('frame', new THREE.BoxGeometry(1.16, 0.1, 0.26), x, 2.15, z, 0, ry, 0);
  if (freestanding) {
    // Ajar onto nothing: the leaf hangs open, and the doorway shows more white.
    kit.add('door', new THREE.BoxGeometry(0.94, 2.08, 0.05).translate(0.47, 1.04, 0), x - c * 0.47, 0, z + s * 0.47, 0, ry + 1.1, 0);
    kit.add('knob', new THREE.SphereGeometry(0.04, 8, 6), x - c * 0.47 + Math.cos(ry + 1.1) * 0.85, 1.0, z + s * 0.47 - Math.sin(ry + 1.1) * 0.85);
    kit.add('frame', new THREE.BoxGeometry(1.2, 0.03, 0.5), x, 0.015, z, 0, ry, 0);
  }
}

export const LEVEL12 = {
  id: 'level12',
  number: 12,
  name: 'Level 12',
  title: 'Matrix',
  difficulty: 0,
  next: 'level1',
  create: (ctx) => new Level12(ctx),
};
