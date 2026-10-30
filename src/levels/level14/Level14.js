import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js';
import { buildHumanoid, resetPose, walk } from '../../entities/lib/rig.js';
import {
  MESA, POOL, GUESTS, CHILDREN, SPAWN, DOOR, FALL_ANGLE, MOON_DIR, nearest,
  makeGround, Trees, buildGround, buildGrass, buildSky, buildCliff, buildFogBanks, buildMotes, buildGuests,
} from './forest.js';

// Level 14 — "Paradise".
//
// Isn't it pretty? A forest at night, under a sky full of stars and an
// enormous moon. Crimson leaves, red grass wet with dew, waterfalls
// crashing into black pools, violet fog drifting between the trunks.
//
// It wants you to stay. The forest whispers, and the whispering becomes a
// choir, and the choir becomes a cacophony, and your thoughts go quiet. Let
// it, and you'll lie down in the soil with the other guests.
//
//   - Your sanity drains everywhere, faster the further gone you are.
//     Covering your ears helps. The roar of a waterfall drowns the choir
//     out: by the water you can think again
//   - The guests' clearing pulls at you. Stand still in it and you lie down
//   - The children stand in rows, howling at the moon. Don't stare. Don't
//     shine a light at them. They'll come for you, but never near the water
//   - Low on sanity, your feet drift towards the guests
//   - Ways out (if you can think straight long enough): the cave behind the
//     big waterfall (Level 1), or the deep middle of the pool (Level 7)

const CHORUS_LINES = [
  'Isn\'t it pretty?',
  'You\'ll be happy here. Everyone else is.',
  'Close your eyes for a moment. You can see it, right?',
  'Don\'t you feel so much lighter now?',
  'Aren\'t you relieved? You don\'t have to think any more.',
  'Look at the other guests. Don\'t you want to be like them?',
  'You\'re so close now you can almost touch it.',
  'It won\'t hurt, I promise.',
  'Let us in.',
  'We\'re just fixing a few things, so that we\'ll be perfect for you.',
  'We\'ll have a great feast when you come.',
  'Why would you ever want to leave?',
  'Just keep going. You\'re so close.',
  'The children only want to help you.',
];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Level14 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.cameraFar = 950;
    this.own = { geos: [], mats: [], textures: [] };
    this.ground = makeGround(rng.fork('ground'));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sky = buildSky(this.own);
    this.groundMesh = buildGround(this.ground, this.own);
    this.grass = buildGrass(this.ground, this.own, rng.fork('grass'));
    this.trees = new Trees(this.ground, this.own, rng.fork('trees'));
    this.cliff = buildCliff(this.own, this.ground, rng.fork('cliff'));
    this.guests = buildGuests(this.own, this.ground, rng.fork('guests'));
    this.fogBanks = buildFogBanks(this.own, rng.fork('fog'));
    this.motes = buildMotes(this.own);
    this.group.add(this.sky.mesh, this.groundMesh.mesh, this.grass.mesh, this.trees.group, this.cliff.group, this.guests.group, this.fogBanks.group, this.motes.points);
    // Moonlight, and the red glow of the leaves thrown back up.
    this.hemi = new THREE.HemisphereLight(0x4a4aa8, 0x8a1426, 1.35);
    this.moon = new THREE.DirectionalLight(0xa8b0ff, 0.9);
    this.moonTarget = new THREE.Object3D();
    this.moon.target = this.moonTarget;
    this.spot = new THREE.SpotLight(0xfff0e0, 0, 40, 0.45, 0.5, 1.2);
    this.group.add(this.hemi, this.moon, this.moonTarget, this.spot, this.spot.target);
    this.buildChildren(rng.fork('children'));
    this.buildDoor();

    this.spawn = { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI / 2 + 0.4 };
    this.world = {
      collide: (pos, r) => this.collide(pos, r),
      groundAt: (x, z) => this.ground.heightAt(x, z) + (this.float || 0),
      sampleLight: () => [0.5, 0.5, 0.6],
    };
    this.time = 0;
    this.done = false;
    this.told = {};
    this.nextLine = 12;
    this.nextHowl = 3;
    this.still = 0;
    this.lastLine = -1;
    this.drift = 0;
    this.float = 0;
    this.fog = new THREE.Color();
    this.landmarks = {};
    this.place({ pos: { x: SPAWN.x, z: SPAWN.z } }, true);
    this.script = [
      [1.5, 'Isn\'t it pretty? A forest under a sky full of stars. The leaves are the colour of wine.'],
      [8, 'Somewhere, far off, water is falling. And under it, very quietly, something is singing.'],
      [16, 'You\'ll be happy here. You\'re sure of it.'],
    ];
  }

  // ---- The children --------------------------------------------------------------------

  buildChildren(rng) {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8dcea, emissive: 0x2a2030 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050308 });
    this.own.mats.push(skin, dark);
    this.children = [];
    this.childGroup = new THREE.Group();
    this.group.add(this.childGroup);
    const rows = 3, cols = 5;
    // Rows facing the moon.
    const face = Math.atan2(MOON_DIR.x, MOON_DIR.z);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const rig = buildHumanoid({ mat: skin, legLen: 0.62, torsoLen: 0.42, armLen: 0.62, headR: 0.13, headLen: 0.28, limbR: 0.035, torsoR: 0.12, torsoDepth: 0.6, neckLen: 0.09, shoulder: 0.15, hipW: 0.07 });
      this.own.geos.push(...rig.geos);
      // Two dark hollows where eyes should be, and a long open mouth.
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), dark);
        eye.position.set(s * 0.045, rig.p.headLen * 0.58, 0.115);
        rig.head.add(eye);
        this.own.geos.push(eye.geometry);
      }
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), dark);
      mouth.scale.set(0.8, 2.4, 0.5);
      mouth.position.set(0, rig.p.headLen * 0.25, 0.12);
      rig.head.add(mouth);
      this.own.geos.push(mouth.geometry);
      const lx = (c - (cols - 1) / 2) * 2.4 + rng.range(-0.2, 0.2), lz = (r - (rows - 1) / 2) * 2.6;
      const rx = lx * Math.cos(face) + lz * Math.sin(face), rz = -lx * Math.sin(face) + lz * Math.cos(face);
      const ch = { rig, home: { x: rx, z: rz }, x: rx, z: rz, heading: face, state: 'howl', t: rng.range(0, 10), stun: 0, cd: 0, phase: rng.range(0, 6) };
      rig.root.position.set(rx, 0, rz);
      this.childGroup.add(rig.root);
      this.children.push(ch);
    }
    this.childFace = face;
    this.childState = 'howl';
    this.stare = 0;
  }

  // A white steel door in a white frame, light leaking round its edges,
  // humming faintly, as if machines were running behind it.
  buildDoor() {
    const g = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xe8ecf0, emissive: 0x202428 });
    const light = new THREE.MeshBasicMaterial({ color: 0xf4faff });
    this.own.mats.push(steel, light);
    const box = (w, h, d, x, y, z, m = steel) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.own.geos.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    box(0.2, 2.9, 0.4, -0.75, 1.45, 0);
    box(0.2, 2.9, 0.4, 0.75, 1.45, 0);
    box(1.7, 0.2, 0.4, 0, 2.9, 0);
    box(1.28, 2.78, 0.08, 0, 1.39, 0);
    // The light round the edges.
    box(1.3, 0.03, 0.1, 0, 2.79, 0.02, light);
    box(0.03, 2.76, 0.1, 0.645, 1.39, 0.02, light);
    box(1.3, 0.05, 0.1, 0, 0.02, 0.02, light);
    const glow = new THREE.PointLight(0xdfeaff, 2.5, 9, 1.4);
    glow.position.set(0, 1.2, 0.8);
    g.add(glow);
    g.rotation.y = 0.6;
    this.door15 = g;
    this.group.add(g);
  }

  // ---- Landmarks: show the copies nearest you -----------------------------------------------

  place(player, force = false) {
    const px = player.pos.x, pz = player.pos.z;
    const set = (key, L, obj) => {
      const n = nearest(L, px, pz);
      if (!force && this.landmarks[key] && this.landmarks[key].x === n.x && this.landmarks[key].z === n.z) return false;
      this.landmarks[key] = n;
      obj.position.set(n.x, 0, n.z);
      return true;
    };
    set('cliff', MESA, this.cliff.group);
    set('guests', GUESTS, this.guests.group);
    if (set('door', DOOR, this.door15)) this.door15.position.y = this.ground.heightAt(this.door15.position.x, this.door15.position.z) - 0.05;
    // The children move with their clearing only while they're at rest.
    if (this.childState === 'howl' && set('children', CHILDREN, this.childGroup)) {
      for (const c of this.children) {
        c.x = c.home.x;
        c.z = c.home.z;
      }
    }
  }

  // ---- Collision ---------------------------------------------------------------------------

  collide(pos, r) {
    this.trees.collide(pos, r);
    // The cliff, with a gap where the cave is.
    const m = nearest(MESA, pos.x, pos.z);
    const dx = pos.x - m.x, dz = pos.z - m.z, d = Math.hypot(dx, dz);
    const R = MESA.r * 0.97 + r;
    if (d < R && d > 1e-4) {
      const a = Math.atan2(dz, dx);
      const da = Math.atan2(Math.sin(a - FALL_ANGLE), Math.cos(a - FALL_ANGLE));
      const lateral = Math.abs(da) * d;
      if (lateral < 1.25 - r * 0.5 && d > MESA.r - 4) return; // into the cave
      pos.x = m.x + (dx / d) * R;
      pos.z = m.z + (dz / d) * R;
    }
  }

  // ---- Per frame -------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    const px = player.pos.x, pz = player.pos.z;
    this.place(player);
    this.trees.update(px, pz);
    this.groundMesh.recenter(px, pz);
    this.grass.recenter(px, pz);
    this.grass.wind.value = this.time;
    this.sky.mesh.position.set(px, 0, pz);
    this.sky.mat.uniforms.time.value = this.time;
    this.cliff.fallMat.uniforms.time.value = this.time;
    this.cliff.poolMat.uniforms.time.value = this.time;
    this.cliff.mist.mat.uniforms.time.value = this.time;
    const pool = nearest(POOL, px, pz);
    this.cliff.poolMat.uniforms.center.value.set(pool.x, 0, pool.z);
    this.motes.mat.uniforms.time.value = this.time;
    this.motes.mat.uniforms.center.value.set(px, player.pos.y, pz);
    this.fogBanks.update(dt, px, pz, this.ground, () => this.rng.next());
    this.moon.position.set(px + MOON_DIR.x * 200, MOON_DIR.y * 200, pz + MOON_DIR.z * 200);
    this.moonTarget.position.set(px, 0, pz);
    // Flashlight.
    const cp = Math.cos(player.pitch);
    const f = new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
    this.spot.position.set(px, player.pos.y + player.eye - 0.1, pz);
    this.spot.target.position.copy(this.spot.position).addScaledVector(f, 10);
    this.spot.intensity = player.flashlight ? 40 : 0;

    this.dPool = Math.hypot(px - pool.x, pz - pool.z);
    this.dFalls = Math.hypot(px - (pool.x - Math.cos(FALL_ANGLE) * 6), pz - (pool.z - Math.sin(FALL_ANGLE) * 6));
    this.updateMind(dt, player);
    if (this.done) return;
    this.updateGuests(dt, player);
    if (this.done) return;
    this.updateChildren(dt, player);
    if (this.done) return;
    this.updateExits(dt, player);
    if (this.done) return;
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      ctx.onDeath(player.health <= 0 ? 'The children found you. They only wanted to help.' : 'You stopped thinking. It was so much lighter. You lay down with the others.');
    }
  }

  // How much the water drowns out the choir here (0..1).
  get calm() {
    return smooth(46, 16, this.dFalls ?? 99);
  }

  updateMind(dt, player) {
    const { ctx } = this;
    const insane = 1 - player.sanity / 100;
    const calm = this.calm;
    // The cacophony wears your mind away; the water gives it back.
    const drain = (0.42 + insane * 0.5) * (player.coveringEars ? 0.45 : 1) * (1 - calm);
    player.sanity = Math.max(0, Math.min(100, player.sanity - drain * dt + calm * 1.6 * dt));
    if (calm > 0.6 && !this.told.calm) {
      this.told.calm = true;
      ctx.hud.message('The roar of the water drowns them out. For a moment you can hear yourself think.', 4);
    }
    // The forest speaks.
    this.nextLine -= dt;
    if (this.nextLine <= 0) {
      this.nextLine = (calm > 0.5 ? 25 : this.rng.range(9, 16)) * (1 - insane * 0.5);
      if (calm < 0.5) {
        let i;
        do i = this.rng.int(0, CHORUS_LINES.length - 1);
        while (i === this.lastLine);
        this.lastLine = i;
        ctx.hud.message(CHORUS_LINES[i], 4);
        ctx.audio.whisper(this.rng.range(-1, 1), 0.15 + insane * 0.2);
      }
    }
    if (calm < 0.5 && this.rng.chance(dt * (0.15 + insane * 0.6))) ctx.audio.whisper(this.rng.range(-1, 1), 0.06 + insane * 0.18);
    if (this.rng.chance(dt * 0.12)) ctx.audio.creak(this.rng.range(-1, 1), 0.06);
    if (this.rng.chance(dt * 0.1)) ctx.audio.rustle(this.rng.range(-1, 1), 0.08, 2.5);
    // Your mind leaking: you float, and your feet wander towards the guests.
    this.float += ((insane > 0.65 ? (insane - 0.65) * 1.2 : 0) - this.float) * Math.min(1, dt);
    if (insane > 0.5 && calm < 0.5) {
      const g = nearest(GUESTS, player.pos.x, player.pos.z);
      const dx = g.x - player.pos.x, dz = g.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
      const k = (insane - 0.5) * 1.4;
      player.pos.x += (dx / d) * k * dt;
      player.pos.z += (dz / d) * k * dt;
      this.drift += dt;
      player.yaw += Math.sin(this.time * 0.7) * 0.15 * k * dt;
      if (!this.told.drift && this.drift > 3) {
        this.told.drift = true;
        ctx.hud.message('Your feet are taking you somewhere. That\'s all right. You don\'t need to think about it.', 4);
      }
    }
  }

  updateGuests(dt, player) {
    const { ctx } = this;
    const g = nearest(GUESTS, player.pos.x, player.pos.z);
    const dx = g.x - player.pos.x, dz = g.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    this.inGuests = d < GUESTS.r + 4;
    if (!this.inGuests) {
      this.still = 0;
      player.speedMul = 1;
      return;
    }
    if (!this.told.guests) {
      this.told.guests = true;
      ctx.hud.message('The other guests, lying peacefully in the soil. Their bones glisten in the moonlight. Don\'t you want to be like them?', 6);
    }
    // It pulls, and the soil is soft and slow.
    const pull = (0.7 + (1 - player.sanity / 100) * 1.2) * smooth(GUESTS.r + 4, 4, d);
    player.pos.x += (dx / d) * pull * dt;
    player.pos.z += (dz / d) * pull * dt;
    player.speedMul = 0.65;
    player.sanity = Math.max(0, player.sanity - 1.2 * dt);
    this.still = d < 4 ? this.still + dt : 0;
    if (this.still > 2.5) {
      this.done = true;
      ctx.onDeath('You lay down with the other guests. It didn\'t hurt. It was never going to hurt.');
    }
  }

  updateChildren(dt, player) {
    const { ctx } = this;
    const base = this.childGroup.position;
    const cx = base.x, cz = base.z;
    const dc = Math.hypot(player.pos.x - cx, player.pos.z - cz);
    const pool = nearest(POOL, player.pos.x, player.pos.z);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const looking = dc < 45 && ((cx - player.pos.x) * fx + (cz - player.pos.z) * fz) / Math.max(dc, 0.01) > 0.85;
    const lit = player.flashlight && looking;
    this.stare = looking ? this.stare + dt * (lit ? 3 : 1) : Math.max(0, this.stare - dt);
    // Howling at the moon.
    this.nextHowl -= dt;
    if (this.childState === 'howl' && this.nextHowl <= 0 && dc < 120) {
      this.nextHowl = this.rng.range(5, 10);
      const pan = this.panTo(player, cx, cz);
      for (let k = 0; k < 3; k++) setTimeout(() => !this.disposed && ctx.audio.howl(pan, 0.25 * Math.max(0.15, 1 - dc / 120)), k * 260);
      if (!this.told.howl && dc < 70) {
        this.told.howl = true;
        ctx.hud.message('Children, standing in rows, howling beautifully at the moon. They\'re waiting to become whole. You want to help them, don\'t you?', 6);
      }
    }
    if (this.childState === 'howl' && (dc < 17 || this.stare > 2.2 || (player.sanity < 25 && dc < 50))) {
      this.childState = 'turn';
      this.turnT = 0;
      ctx.audio.jumpscare();
      ctx.hud.message('The howling stops. Every head turns towards you at once.', 3);
      // The nearest four come for you.
      const sorted = [...this.children].sort((a, b) => Math.hypot(a.x + cx - player.pos.x, a.z + cz - player.pos.z) - Math.hypot(b.x + cx - player.pos.x, b.z + cz - player.pos.z));
      for (const c of sorted.slice(0, 4)) c.hunt = true;
    }
    if (this.childState === 'turn') {
      this.turnT += dt;
      if (this.turnT > 1.1) {
        this.childState = 'hunt';
        this.huntT = 0;
      }
    }
    if (this.childState === 'hunt') {
      this.huntT += dt;
      const gaveUp = this.huntT > 30 || dc > 110;
      let home = 0;
      for (const c of this.children) {
        if (!c.hunt) continue;
        const wx = c.x + cx, wz = c.z + cz;
        if (gaveUp) {
          // Walk back to the rows.
          const hx = c.home.x - c.x, hz = c.home.z - c.z, hd = Math.hypot(hx, hz);
          if (hd < 0.4) {
            home++;
            continue;
          }
          c.x += (hx / hd) * Math.min(hd, 3 * dt);
          c.z += (hz / hd) * Math.min(hd, 3 * dt);
          c.heading = Math.atan2(hx, hz);
          c.moving = true;
          continue;
        }
        c.cd = Math.max(0, c.cd - dt);
        if (c.stun > 0) {
          c.stun -= dt;
          c.moving = false;
          continue;
        }
        let tx = player.pos.x - wx, tz = player.pos.z - wz;
        const d = Math.hypot(tx, tz) || 1;
        // They won't go near the water: it drowns out the song.
        const np = { x: wx + (tx / d) * 0.5, z: wz + (tz / d) * 0.5 };
        const nearWater = Math.hypot(np.x - pool.x, np.z - pool.z) < POOL.r + 14;
        // Jerky: bursts of speed, then a stop.
        const burst = Math.sin(this.time * 7 + c.phase) > -0.3 ? 1 : 0.1;
        const step = nearWater ? 0 : Math.min(d - 0.6, 6.5 * burst * dt);
        if (step > 0) {
          c.x += (tx / d) * step;
          c.z += (tz / d) * step;
        }
        c.heading = Math.atan2(tx, tz);
        c.moving = step > 0;
        if (nearWater && !this.told.water) {
          this.told.water = true;
          ctx.hud.message('They stop at the edge of the roar, and stand there, watching.', 3);
        }
        if (d < 1.1 && !c.cd) {
          c.cd = 1.6;
          player.damage(26);
          player.sanity = Math.max(0, player.sanity - 12);
          ctx.hurtFlash(0.9);
          ctx.vibrate([150, 40, 220]);
          ctx.audio.shriek?.(0, 0.4);
          ctx.hud.message('Small cold hands. "Let us in."', 2);
        }
      }
      if (gaveUp && home >= this.children.filter((c) => c.hunt).length) {
        for (const c of this.children) c.hunt = false;
        this.childState = 'howl';
        this.stare = 0;
        this.nextHowl = 4;
      }
    }
    // Animate.
    for (const c of this.children) {
      const rig = c.rig;
      resetPose(rig);
      c.t += dt;
      rig.root.position.set(c.x, this.ground.heightAt(c.x + cx, c.z + cz), c.z);
      if (this.childState === 'howl' || (!c.hunt && this.childState !== 'turn')) {
        // Heads thrown back to the moon, arms hanging, swaying.
        rig.root.rotation.y = this.childFace;
        rig.head.rotation.x = -0.9 + Math.sin(c.t * 1.3 + c.phase) * 0.08;
        rig.neck.rotation.x = -0.3;
        rig.spine.rotation.z = Math.sin(c.t * 0.9 + c.phase) * 0.06;
        if (!c.hunt && this.childState !== 'howl') {
          // The ones who stayed watch you.
          rig.root.rotation.y = Math.atan2(player.pos.x - (c.x + cx), player.pos.z - (c.z + cz));
          rig.head.rotation.x = 0;
          rig.neck.rotation.x = 0;
        }
      } else if (this.childState === 'turn') {
        rig.root.rotation.y = Math.atan2(player.pos.x - (c.x + cx), player.pos.z - (c.z + cz));
        rig.head.rotation.z = 0.4;
      } else {
        rig.root.rotation.y = c.heading;
        walk(rig, c.t * 14, c.moving ? 1 : 0, { stride: 1.4, armSwing: 0.1 });
        rig.armL.shoulder.rotation.x = -1.2;
        rig.armR.shoulder.rotation.x = -1.3;
        rig.head.rotation.z = Math.sin(c.t * 9) * 0.25;
        rig.spine.rotation.x = 0.25;
      }
    }
  }

  photoSubjects() {
    const b = this.childGroup.position;
    return this.children.slice(0, 3).map((c) => ({ type: 'children', x: c.x + b.x, y: 1, z: c.z + b.z, range: 60 }));
  }

  // Weapons work on the children.
  stun(x, z, { range, seconds }) {
    let n = 0;
    const base = this.childGroup.position;
    for (const c of this.children) {
      if (Math.hypot(c.x + base.x - x, c.z + base.z - z) < range + 0.3) {
        c.stun = seconds;
        n++;
      }
    }
    return n;
  }

  updateExits(dt, player) {
    const { ctx } = this;
    const dd = nearest(DOOR, player.pos.x, player.pos.z);
    const dl = Math.hypot(player.pos.x - dd.x, player.pos.z - dd.z);
    if (dl < 14 && !this.told.door15) {
      this.told.door15 = true;
      ctx.hud.message('A white steel door, standing on its own among the trees. Cold light leaks round its edges. Behind it, very faintly, machines.', 5);
    }
    if (dl < 0.9) {
      this.done = true;
      ctx.hud.message('The singing stops the moment the door closes behind you.', 4);
      ctx.onEscape('level15', 'door');
      return;
    }
    const m = nearest(MESA, player.pos.x, player.pos.z);
    const dm = Math.hypot(player.pos.x - m.x, player.pos.z - m.z);
    if (dm < MESA.r * 0.97 - 1.2) {
      this.done = true;
      ctx.hud.message('Behind the water, a cave. It\'s cold, and dark, and very quiet, and your thoughts come back one by one. The rock turns to concrete.', 5);
      ctx.onEscape('level1', 'walk');
      return;
    }
    if (this.dPool < POOL.r) {
      player.speedMul = Math.min(player.speedMul, 0.6);
      if (!this.told.pool) {
        this.told.pool = true;
        ctx.hud.message('The water is black and freezing. The middle looks very deep.', 3.5);
      }
    }
    if (this.dPool < 2.6) {
      this.done = true;
      ctx.hud.message('You go under. The singing stops. You sink, and sink, and come up somewhere cold and grey.', 5);
      ctx.onEscape('level7', 'noclip');
    }
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  drink(player) {
    const { ctx } = this;
    if (this.dPool < POOL.r + 1.5) {
      player.sanity = Math.min(100, player.sanity + 18);
      ctx.audio.drink();
      ctx.hud.message('You drink from the pool. It\'s so cold it hurts, and for a moment your head is clear.', 3);
      return;
    }
    if (!player.takeItem('water')) {
      ctx.hud.message('No Almond Water.', 1.5);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    const insane = 1 - player.sanity / 100;
    const calm = this.calm;
    const pool = nearest(POOL, player.pos.x, player.pos.z);
    const fx = pool.x - Math.cos(FALL_ANGLE) * 6, fz = pool.z - Math.sin(FALL_ANGLE) * 6;
    const df = Math.hypot(fx - player.pos.x, fz - player.pos.z);
    return {
      hum: 0, exitGain: 0, exitPan: 0, drone: this.childState === 'hunt' ? 0.25 : 0, machine: 0, jazz: 0,
      wind: 0.05,
      falls: 0.55 / (1 + (df / 22) ** 2), fallsPan: this.panTo(player, fx, fz) * 0.8,
      chorus: (0.05 + insane * 0.32 + (this.inGuests ? 0.15 : 0)) * (1 - calm * 0.85),
      sanity: player.sanity, ears: player.coveringEars,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    const calm = this.calm;
    // Violet haze between the trees, bluer and paler by the falling water.
    this.fog.setRGB(0.29, 0.15, 0.32).lerp(new THREE.Color(0.3, 0.32, 0.5), calm * 0.7);
    this.sky.mat.uniforms.horizon.value.copy(this.fog);
    return {
      fogColor: this.fog,
      fogDensity: 0.024 + calm * 0.008,
      warp: insane * insane * 1.6 + (this.inGuests ? 0.4 : 0),
      aberr: 0.25 + insane * 1.4,
      grain: 0.05,
      soften: 0.35,
      roll: Math.sin(this.time * 0.4) * insane * 0.05,
    };
  }

  hudInfo(player) {
    const warn = this.inGuests ? 'YOU FEEL SO HEAVY' : player.sanity < 25 ? 'YOU CAN\'T HEAR YOURSELF THINK' : null;
    return { warn, warnCovered: warn, coverLabel: 'EARS', health: true };
  }

  dispose() {
    this.disposed = true;
    this.scene.remove(this.group);
    this.trees.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL14 = {
  id: 'level14',
  number: 14,
  name: 'Level 14',
  title: 'Paradise',
  difficulty: 'PARADISE',
  next: 'level1',
  create: (ctx) => new Level14(ctx),
};

