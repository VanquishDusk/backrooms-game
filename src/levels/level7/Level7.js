import * as THREE from 'three';
import { disposeTextures } from '../../world/props.js';
import { generateLevel7, waveHeight, zoneAt, ZONES, ROOM_Y, WEST_EDGE } from './layout.js';
import {
  buildMaterials, buildPillarAndRoom, buildWater, buildCeiling, buildFloor, buildPillars, buildDoorPlatform,
  buildCave, buildFort, buildDebris, buildBoat, buildSnow, Particles, ROOM, PILLAR, DOOR_W,
} from './build.js';
import { Serpent } from './Serpent.js';

// Level 7 — "Thalassophobia".
//
//  - A flooded living room inside a concrete pillar, with a doorway where
//    gravity goes sideways: get too close and you fall out, fourteen metres
//    down into the sea
//  - An ocean that goes on forever under a concrete ceiling, in a dim light
//    that comes from nowhere. Freezing water. Below: the Daylight Zone, the
//    Twilight Zone (bones, rusted metal), the Midnight Zone (pitch black,
//    skeletons) and the Abyss
//  - Swim (look where you want to go), hold your breath, don't freeze. Or
//    find the boat
//  - The Thing on Level 7: a sea serpent that comes for anything out in
//    open water. Fight it from the boat with harpoons until it sinks
//  - Fort Surrender on its island shoots at anyone who comes close
//  - Exits: the stairs back up to Level 6; an underwater cave at the foot of
//    the mountain (Level 8); a wooden door on a stone platform among the
//    pipes (Level 9); black out in the Abyss (Level 83); or keep going west
//    (Level 880)

const SERPENT_HP = 10;
const BREATH_TIME = 55;
const COLD_TIME = 75;
const UNDER = [new THREE.Color(0x2f6e78), new THREE.Color(0x0b1e2a), new THREE.Color(0x010304), new THREE.Color(0x000000)];
const AIR_FOG = new THREE.Color(0x4f5a5e);

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Level7 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, renderer } = ctx;
    this.scene = scene;
    this.rng = rng.fork('runtime');
    this.own = { geos: [], mats: [], textures: [] };
    const L = (this.layout = generateLevel7(rng.fork('layout')));
    this.cameraFar = 1100;
    this.group = new THREE.Group();
    scene.add(this.group);

    const M = (this.M = buildMaterials(renderer, this.own));
    this.room = buildPillarAndRoom(M, rng.fork('room'));
    this.water = buildWater(this.own);
    this.platform = buildDoorPlatform(M, L, this.own);
    this.cave = buildCave(M, L, this.own);
    this.fort = buildFort(M, L, rng.fork('fort'), this.own);
    const boat = buildBoat(M, this.own);
    this.boatMesh = boat.group;
    this.boatLight = boat.light;
    this.harpoonGeo = boat.harpoonGeo;
    this.group.add(
      this.room.group, this.water, buildCeiling(M, this.own), buildFloor(M, L, this.own), buildPillars(M, L, this.own),
      this.platform.group, this.cave.group, this.fort.group, buildDebris(M, L, this.own), this.boatMesh,
    );
    this.particles = new Particles(500, this.own);
    this.snow = buildSnow(this.own, rng.fork('snow'));
    this.group.add(this.particles.points, this.snow);
    this.serpent = new Serpent(this.own, this.harpoonGeo, M.iron);
    this.group.add(this.serpent.group);

    // A dim light from nowhere in particular, and your flashlight.
    this.hemi = new THREE.HemisphereLight(0xa8b4b8, 0x3a4446, 2.1);
    this.sun = new THREE.DirectionalLight(0xc8d0d0, 0.8);
    this.sun.position.set(30, 100, 20);
    this.spot = new THREE.SpotLight(0xfff2dc, 0, 45, 0.42, 0.5, 1.1);
    this.group.add(this.hemi, this.sun, this.spot, this.spot.target);
    // The harpoon in your hand, in the boat.
    this.hand = new THREE.Mesh(this.harpoonGeo, M.iron);
    this.hand.scale.setScalar(0.6);
    this.hand.visible = false;
    this.group.add(this.hand);

    this.spawn = { x: 0, z: 2.4, yaw: 0 };
    this.y = ROOM_Y;
    this.vy = 0;
    this.mode = 'room';
    this.world = {
      collide: (pos, r) => this.collide(pos, r),
      groundAt: () => this.y,
      sampleLight: () => [0.6, 0.6, 0.6],
    };
    this.time = 0;
    this.done = false;
    this.breath = 100;
    this.warmth = 100;
    this.boat = { ...L.boat, speed: 0, hull: 100, y: 0, pitch: 0, roll: 0, sunk: false };
    this.projectiles = [];
    this.throwCd = 0;
    this.lastX = this.spawn.x;
    this.lastZ = this.spawn.z;
    this.zone = -1;
    this.told = {};
    this.earsWas = false;
    this.fogColor = new THREE.Color();
    this.tilt = 0;
    this.slosh = 0;
    this.nextDrip = 2;
    this.nextShout = 0;
    this.nextShot = 0;
    this.flash = 0;
    this.shake = 0;
    this.thing = { state: 'lurk', hp: SERPENT_HP, t: 0, a: 0, hits: 0, roared: 0, seen: false };
    this.serpent.place(0, -26, -75, 1, 0, 0);
  }

  // ---- Collision ---------------------------------------------------------------------

  collide(pos, r) {
    if (this.mode === 'room') return this.collideRoom(pos, r);
    if (this.mode !== 'swim') return;
    const camY = this.y + 1.62;
    // The sea floor (and the shore) are walls when they rise above you.
    if (this.floorAt(pos.x, pos.z) > camY - 0.3) {
      pos.x = this.lastX;
      pos.z = this.lastZ;
    }
    this.pushOut(pos, r, camY);
  }

  collideRoom(pos, r) {
    const R = ROOM;
    const inDoor = Math.abs(pos.x) < DOOR_W / 2 - 0.05;
    const onStairs = Math.abs(pos.x) < 0.62 - r && pos.z > R.z1 - r - 0.05;
    pos.x = Math.max(R.x0 + r, Math.min(R.x1 - r, pos.x));
    if (pos.z > R.z1 - r && !onStairs) pos.z = R.z1 - r;
    if (pos.z > R.z1) pos.x = Math.max(-0.62 + r, Math.min(0.62 - r, pos.x));
    if (pos.z < R.z0 + r && !inDoor) pos.z = R.z0 + r;
    for (const s of this.room.solids) {
      const cx = Math.max(s.x0, Math.min(s.x1, pos.x)), cz = Math.max(s.z0, Math.min(s.z1, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-5) {
        pos.x = cx + r;
        continue;
      }
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    }
  }

  // Pillars, pipes, the entrance pillar, the Level 9 platform.
  pushOut(pos, r, y) {
    const box = (cx, cz, hw, hd, rot) => {
      const dx = pos.x - cx, dz = pos.z - cz;
      const c = Math.cos(rot), s = Math.sin(rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const px = hw + r - Math.abs(lx), pz = hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) return false;
      let nx = lx, nz = lz;
      if (px < pz) nx = Math.sign(lx || 1) * (hw + r);
      else nz = Math.sign(lz || 1) * (hd + r);
      pos.x = cx + nx * c + nz * s;
      pos.z = cz - nx * s + nz * c;
      return true;
    };
    const P = PILLAR;
    let hit = box((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, (P.x1 - P.x0) / 2, (P.z1 - P.z0) / 2, 0);
    for (const p of this.layout.pillars) hit = box(p.x, p.z, p.w / 2, p.d / 2, p.rot) || hit;
    for (const p of this.layout.pipes) {
      const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz);
      if (d < p.r + r && d > 1e-4) {
        pos.x = p.x + (dx / d) * (p.r + r);
        pos.z = p.z + (dz / d) * (p.r + r);
        hit = true;
      }
    }
    const D = this.layout.door;
    if (y < D.y + 0.3 && y > D.y - 6.5) hit = box(D.x, D.z, 8, 8, D.rot) || hit;
    return hit;
  }

  // ---- Per frame ---------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    this.dt = dt;
    const { ctx } = this;
    this.water.material.uniforms.time.value = this.time;
    this.snow.material.uniforms.time.value = this.time;
    this.throwCd -= dt;
    this.shake = Math.max(0, this.shake - dt * 2);

    if (this.mode === 'room') this.updateRoom(dt, player);
    else if (this.mode === 'falling') this.updateFalling(dt, player);
    else if (this.mode === 'swim') this.updateSwim(dt, player);
    else if (this.mode === 'boat') this.updateBoat(dt, player);
    if (this.done) return;
    player.pos.y = this.y;
    this.lastX = player.pos.x;
    this.lastZ = player.pos.z;
    this.camY = this.y + player.eye;
    this.underwater = this.camY < waveHeight(player.pos.x, player.pos.z, this.time) - 0.05;

    this.updateBoatMesh(dt);
    this.updateThing(dt, player);
    if (this.done) return;
    this.updateProjectiles(dt, player);
    this.updateFort(dt, player);
    this.updateHand(player);
    this.particles.update(dt);
    this.updateLights(dt, player);
    this.updateBody(dt, player);
    if (this.done) return;
    this.updateExits(dt, player);
    this.earsWas = player.coveringEars;
  }

  // The sea floor, or the top of the Level 9 platform.
  floorAt(x, z) {
    const D = this.layout.door;
    const dx = x - D.x, dz = z - D.z;
    const c = Math.cos(D.rot), s = Math.sin(D.rot);
    const onTop = Math.abs(dx * c - dz * s) < 8 && Math.abs(dx * s + dz * c) < 8;
    return onTop ? Math.max(D.y, this.layout.floorY(x, z)) : this.layout.floorY(x, z);
  }

  // Keep the Thing out of the sea floor.
  safeY(x, z, y) {
    return Math.max(y, this.layout.floorY(x, z) + 5);
  }

  sound(name, ...args) {
    const a = this.ctx.audio;
    if (a.ctx && a[name]) a[name](...args);
  }

  updateRoom(dt, player) {
    const { ctx } = this;
    player.ceiling = ROOM.h;
    player.speedMul = 1;
    player.frozen = false;
    const p = player.pos;
    // The stairs back up to Level 6.
    this.y = ROOM_Y + (p.z > ROOM.z1 ? Math.min(4.5, (p.z - ROOM.z1) * 0.83) : 0);
    player.ceiling = p.z > ROOM.z1 ? 3 : ROOM.h;
    if (p.z > 6.2) {
      this.done = true;
      ctx.hud.message('You climb back up into the dark.', 2.5);
      ctx.onEscape('level6', 'walk');
      return;
    }
    // Water underfoot.
    this.slosh += player.speed * dt;
    if (this.slosh > 0.75) {
      this.slosh = 0;
      this.sound('slosh', ctx.audio.ctx?.currentTime, 0.05);
    }
    // Near the doorway, "down" starts to mean "out".
    const pull = Math.abs(p.x) < 1.1 ? smooth(-1.9, -3.4, p.z) : 0;
    this.tilt += (pull - this.tilt) * Math.min(1, dt * 3);
    if (pull > 0.05) {
      if (!this.told.pull) {
        this.told.pull = true;
        ctx.hud.message('Your stomach lurches. The doorway is pulling you towards it.', 3);
        ctx.audio.creak(0, 0.2);
      }
      p.z -= pull * 2.0 * dt;
      p.x -= Math.sign(p.x) * pull * 0.6 * dt;
    }
    if (p.z < ROOM.z0 + 0.1 && Math.abs(p.x) < DOOR_W / 2) {
      this.mode = 'falling';
      this.vy = 0;
      this.fallVz = -2.3;
      player.frozen = true;
      ctx.hud.message('Gravity turns sideways. You fall out of the doorway.', 3);
      ctx.audio.gust(0, 0.3, 2);
    }
    // The lamp hums and flickers.
    this.nextDrip -= dt;
    if (this.nextDrip <= 0) {
      this.nextDrip = this.rng.range(1.5, 4);
      ctx.audio.drip(this.rng.range(-0.8, 0.8), 0.12);
    }
  }

  updateFalling(dt, player) {
    const { ctx } = this;
    player.frozen = true;
    player.ceiling = Infinity;
    this.vy -= 9.8 * dt;
    this.y += this.vy * dt;
    player.pos.z += this.fallVz * dt;
    player.pitch += (-0.9 - player.pitch) * Math.min(1, dt * 2);
    const surface = waveHeight(player.pos.x, player.pos.z, this.time);
    if (this.y + player.eye < surface) {
      this.mode = 'swim';
      player.frozen = false;
      this.vy = -2.5;
      this.particles.splash(player.pos.x, player.pos.z, 2.2, () => this.rng.next());
      this.particles.bubbles(player.pos.x, this.y + player.eye, player.pos.z, 30, () => this.rng.next());
      ctx.audio.splash(0, 0.7, true);
      ctx.vibrate([60, 30, 120]);
      ctx.hud.message('The water is freezing. Look where you want to swim; hold C (or UP) to rise.', 5);
    }
  }

  updateSwim(dt, player) {
    const { ctx } = this;
    player.ceiling = Infinity;
    player.frozen = false;
    const mv = ctx.move ? ctx.move() : { x: 0, y: 0 };
    const sprint = player.sprinting;
    const base = sprint ? 3.1 : 1.85;
    const fwd = Math.abs(mv.y) > 0.1 ? Math.sign(mv.y) * Math.min(1, Math.abs(mv.y)) : 0;
    player.speedMul = (sprint ? 3.1 / 4.6 : 1.85 / 2.5) * (fwd ? Math.max(0.2, Math.cos(player.pitch)) : 1);
    let target = fwd * base * Math.sin(player.pitch);
    if (player.coveringEars) target = 2.4;
    else if (!fwd && this.underwater) target = 0.3;
    this.vy += (target - this.vy) * Math.min(1, dt * 3);
    this.y += this.vy * dt;
    const surface = waveHeight(player.pos.x, player.pos.z, this.time);
    const eye = player.eye;
    if (this.y + eye > surface + 0.18) {
      this.y = surface + 0.18 - eye;
      this.vy = Math.min(this.vy, 0);
    }
    const floor = this.floorAt(player.pos.x, player.pos.z);
    if (this.y + eye < floor + 0.6) {
      this.y = floor + 0.6 - eye;
      this.vy = Math.max(0, this.vy);
    }
    // Climb into the boat.
    const b = this.boat;
    if (!b.sunk && this.y + eye > surface - 1.2 && Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 2.3) {
      this.mode = 'boat';
      b.speed = 0;
      this.sound('slosh', ctx.audio.ctx?.currentTime, 0.2);
      ctx.audio.creak(0, 0.25);
      if (!this.told.boat) {
        this.told.boat = true;
        ctx.hud.message(ctx.touch
          ? 'You haul yourself into the boat. Stick: steer. THROW: harpoon. JUMP: back in the water.'
          : 'You haul yourself into the boat. WASD steers (Shift: full throttle). Click throws a harpoon. C / Space jumps out.', 7);
      } else ctx.hud.message('You climb back into the boat.', 2);
    }
  }

  updateBoat(dt, player) {
    const { ctx } = this;
    const b = this.boat;
    player.ceiling = 1.35;
    player.speedMul = 0;
    player.frozen = false;
    const mv = ctx.move ? ctx.move() : { x: 0, y: 0 };
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    if (player.sprinting) player.stamina = Math.min(100, player.stamina + 11 * dt);
    let throttle = 0;
    if (mag > 0.1) {
      const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      const wx = -s * mv.y + c * mv.x, wz = -c * mv.y - s * mv.x;
      const want = Math.atan2(wx, wz);
      let d = want - b.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const back = Math.abs(d) > 2.4;
      if (back) {
        // Pull back on the stick: reverse.
        throttle = -0.35 * mag;
      } else {
        b.heading += Math.sign(d) * Math.min(Math.abs(d), 1.15 * dt);
        throttle = mag * Math.max(0.2, Math.cos(d));
      }
    }
    const top = player.sprinting ? 11.5 : 7.5;
    const want = throttle * top;
    b.speed += Math.sign(want - b.speed) * Math.min(Math.abs(want - b.speed), (throttle ? 3 : 1.2) * dt);
    const nx = b.x + Math.sin(b.heading) * b.speed * dt, nz = b.z + Math.cos(b.heading) * b.speed * dt;
    if (this.boatBlocked(nx, nz)) {
      if (Math.abs(b.speed) > 3) {
        ctx.audio.thud(0, 0.4);
        this.shake = 0.5;
        b.hull = Math.max(0, b.hull - Math.abs(b.speed) * 0.8);
      }
      b.speed = -b.speed * 0.3;
    } else {
      b.x = nx;
      b.z = nz;
    }
    // Sit in the stern.
    player.pos.x = b.x - Math.sin(b.heading) * 1.5;
    player.pos.z = b.z - Math.cos(b.heading) * 1.5;
    this.y = b.y + 0.1;
    player.vel.set(0, 0);
    // Over the side.
    const ears = player.coveringEars;
    if (ears && !this.earsWas) {
      this.mode = 'swim';
      player.pos.x = b.x + Math.cos(b.heading) * 1.8;
      player.pos.z = b.z - Math.sin(b.heading) * 1.8;
      this.y = -1.5;
      this.vy = -1;
      this.particles.splash(player.pos.x, player.pos.z, 1.2, () => this.rng.next());
      ctx.audio.splash(0, 0.5, false);
      ctx.hud.message('You go over the side. The cold knocks the breath out of you.', 2.5);
      this.breath = Math.min(this.breath, 85);
    }
    if (b.hull <= 0) this.sinkBoat(player);
  }

  boatBlocked(x, z) {
    if (this.layout.floorY(x, z) > -0.9) return true;
    const pos = { x, z };
    return this.pushOut(pos, 1.2, 0);
  }

  sinkBoat(player) {
    const { ctx } = this;
    const b = this.boat;
    b.sunk = true;
    b.sinkT = 0;
    this.mode = 'swim';
    this.y = -1.5;
    this.vy = 0;
    player.pos.x = b.x + 2;
    ctx.hud.message('The boat breaks apart under you. You\'re in the water.', 4);
    ctx.audio.crash(0, 0.6);
    this.particles.splash(b.x, b.z, 3, () => this.rng.next());
  }

  updateBoatMesh(dt) {
    const b = this.boat;
    const t = this.time;
    if (b.sunk) {
      b.sinkT += dt;
      b.y -= dt * 1.2;
      this.boatMesh.rotation.z += dt * 0.3;
      this.boatMesh.position.y = b.y;
      if (b.sinkT > 8) this.boatMesh.visible = false;
      return;
    }
    const h = waveHeight(b.x, b.z, t);
    b.y += (h - b.y) * Math.min(1, dt * 6);
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const ahead = waveHeight(b.x + fx * 1.8, b.z + fz * 1.8, t) - waveHeight(b.x - fx * 1.8, b.z - fz * 1.8, t);
    const side = waveHeight(b.x + fz * 0.8, b.z - fx * 0.8, t) - waveHeight(b.x - fz * 0.8, b.z + fx * 0.8, t);
    b.pitch += (-Math.atan2(ahead, 3.6) - (this.mode === 'boat' ? b.speed * 0.006 : 0) - b.pitch) * Math.min(1, dt * 4);
    b.roll += (Math.atan2(side, 1.6) * 0.8 - b.roll) * Math.min(1, dt * 4);
    this.boatMesh.position.set(b.x, b.y, b.z);
    this.boatMesh.rotation.set(b.pitch, b.heading, b.roll, 'YXZ');
    // A wake when it moves.
    if (Math.abs(b.speed) > 2 && this.rng.chance(dt * Math.abs(b.speed) * 2)) {
      const r = () => this.rng.next();
      this.particles.emit(b.x - fx * 2.3 + (r() - 0.5), 0.1, b.z - fz * 2.3 + (r() - 0.5), (r() - 0.5) * 1.5, 1 + r() * 1.5, (r() - 0.5) * 1.5, { life: 0.8, size: 0.15, color: [0.85, 0.9, 0.9], grav: 6 });
    }
  }

  // ---- The Thing on Level 7 ------------------------------------------------------------

  updateThing(dt, player) {
    const th = this.thing, S = this.serpent, { ctx } = this;
    const b = this.boat;
    th.t += dt;
    if (th.state === 'dead') return;
    const r0 = Math.hypot(player.pos.x, player.pos.z);
    const inBoat = this.mode === 'boat';
    const swimming = this.mode === 'swim';
    const fight = th.hp > 0 && ((inBoat && r0 > 60) || (swimming && r0 > 45 && !b.sunk) || (swimming && b.sunk && r0 > 30));
    const head = S.headPoint();
    const tx = inBoat ? b.x : player.pos.x, tz = inBoat ? b.z : player.pos.z;
    const pan = this.panTo(player, head.x, head.z);
    const dist = Math.hypot(head.x - tx, head.z - tz);
    const go = (state) => {
      th.state = state;
      th.t = 0;
      th.hits = 0;
    };
    S.jaw += ((th.state === 'charge' || th.state === 'hold' || th.state === 'hunt' && dist < 12 ? 1 : 0.08) - S.jaw) * Math.min(1, dt * 4);
    switch (th.state) {
      case 'lurk': {
        // Slow circles out past the shelf, deep down.
        th.a += dt * 0.035;
        const lx = Math.cos(th.a) * 125, lz = Math.sin(th.a) * 125;
        S.swim(lx, this.safeY(lx, lz, -28), lz, 4.5, 0.6, dt);
        if (fight) {
          go(inBoat ? 'circle' : 'hunt');
          th.a = Math.atan2(head.z - tz, head.x - tx);
          ctx.audio.roar(pan, 0.35, 2.6, true);
          ctx.hud.message(this.told.thing ? 'The water goes very still.' : 'The water goes very still. Something enormous moves under the boat.', 3.5);
          this.told.thing = true;
        }
        break;
      }
      case 'circle': {
        // Round and round, just under the surface. Its spines cut the water.
        th.a += dt * (9 / 34);
        S.swim(tx + Math.cos(th.a) * 34, -2.6, tz + Math.sin(th.a) * 34, 9, 0.9, dt);
        if (!fight) go('dive');
        else if (!inBoat) go('hunt');
        else if (th.t > this.rng.range(6, 9)) {
          go(this.rng.chance(0.6) ? 'charge' : 'rear');
          ctx.audio.roar(pan, 0.5, 2, false);
        }
        break;
      }
      case 'charge': {
        // Straight at you with its head out of the water.
        const lead = Math.min(1.2, dist / 14);
        const px = tx + Math.sin(b.heading) * b.speed * lead, pz = tz + Math.cos(b.heading) * b.speed * lead;
        S.swim(px, dist > 30 ? 0.6 : 1.8, pz, 12.5, 1.0, dt);
        if (dist < 4.5 && head.y > -2) {
          this.ram(player, 22, 12);
          go('dive');
        } else if (th.t > 9) go('dive');
        break;
      }
      case 'rear': {
        // Close in, then rise up out of the sea.
        if (dist > 17) S.swim(tx, -1, tz, 10, 1.0, dt);
        else go('rise');
        break;
      }
      case 'rise': {
        const dx = tx - head.x, dz = tz - head.z, l = Math.hypot(dx, dz) || 1;
        S.swim(head.x + (dx / l) * 2, 13, head.z + (dz / l) * 2, 5.5, 1.6, dt);
        if (head.y > 9 || th.t > 4) {
          go('hold');
          ctx.audio.roar(pan, 0.8, 2.6, false);
          this.shake = 0.6;
          ctx.hud.message('It rears up over you. Move!', 2.2);
        }
        break;
      }
      case 'hold': {
        // Towering, swaying, roaring: then it comes down where you were.
        S.swim(head.x + Math.sin(this.time * 2) * 2, 12, head.z + Math.cos(this.time * 1.7) * 2, 1.2, 1.2, dt);
        if (th.t > 2.4) {
          go('strike');
          th.sx = tx;
          th.sz = tz;
        }
        break;
      }
      case 'strike': {
        S.swim(th.sx, -6, th.sz, 22, 2.6, dt);
        if (head.y < 0.5) {
          this.particles.splash(head.x, head.z, 3, () => this.rng.next());
          ctx.audio.splash(pan, 0.9, true);
          this.shake = 1;
          if (Math.hypot(th.sx - tx, th.sz - tz) < 6.5) this.ram(player, 32, 22);
          else ctx.hud.message('It crashes into the sea beside you.', 2);
          go('dive');
        }
        break;
      }
      case 'dive': {
        // Away and down, then back for another pass.
        const ax = head.x - tx, az = head.z - tz, l = Math.hypot(ax, az) || 1;
        const dx = tx + (ax / l) * 60, dz = tz + (az / l) * 60;
        S.swim(dx, this.safeY(dx, dz, -22), dz, 10, 0.8, dt);
        if (th.t > 5) {
          if (!fight) go('lurk');
          else go(inBoat ? 'circle' : 'hunt');
          th.a = Math.atan2(head.z - tz, head.x - tx);
        }
        break;
      }
      case 'hunt': {
        // You're in the water. It comes for you.
        if (!fight) {
          go('dive');
          break;
        }
        if (inBoat) {
          go('circle');
          break;
        }
        const cy = this.camY ?? 0;
        S.swim(player.pos.x, this.safeY(player.pos.x, player.pos.z, Math.min(-1.5, cy)), player.pos.z, dist < 25 ? 9 : 7, 1.3, dt);
        const d3 = Math.hypot(head.x - player.pos.x, head.y - cy, head.z - player.pos.z);
        th.breathe = (th.breathe ?? 0) - dt;
        if (th.breathe <= 0 && d3 < 40) {
          th.breathe = 2.5;
          ctx.audio.growl(pan, 0.3 * (1 - d3 / 40));
        }
        if (d3 < 3.5) {
          player.damage(40);
          player.sanity = Math.max(0, player.sanity - 20);
          ctx.hurtFlash(1);
          ctx.vibrate([200, 60, 300]);
          ctx.audio.jumpscare();
          this.particles.blood(player.pos.x, cy, player.pos.z, 30, () => this.rng.next());
          ctx.hud.message('Jaws close on you and drag you down, then let go.', 3);
          this.vy = -3;
          go('dive');
        }
        break;
      }
      case 'dying': {
        // Thrashing at the surface, then down into the dark.
        if (th.t < 5) {
          S.swim(head.x + Math.sin(th.t * 3) * 6, Math.sin(th.t * 2.5) * 5 + 2, head.z + Math.cos(th.t * 3) * 6, 7, 3, dt);
          if (this.rng.chance(dt * 3)) this.particles.blood(head.x, head.y, head.z, 10, () => this.rng.next());
          if (this.rng.chance(dt * 0.8)) ctx.audio.roar(pan, 0.6, 1.6, false);
        } else {
          S.swim(head.x + S.dir.x * 5, -260, head.z + S.dir.z * 5, 3, 0.4, dt);
          if (th.t > 30) {
            th.state = 'dead';
            S.group.visible = false;
          }
        }
        break;
      }
    }
    S.updateBody(dt);
    // A big wake where it breaks the surface.
    if (head.y > -2.5 && head.y < 3 && S.speed > 4 && this.rng.chance(dt * 12)) {
      const r = () => this.rng.next();
      this.particles.emit(head.x + (r() - 0.5) * 3, 0.1, head.z + (r() - 0.5) * 3, (r() - 0.5) * 3, 2 + r() * 3, (r() - 0.5) * 3, { life: 1, size: 0.3, color: [0.85, 0.9, 0.9], grav: 8 });
    }
    // The glowing spots flare when it's angry.
    S.skin.emissiveIntensity = 0.25 + (th.state === 'charge' || th.state === 'hold' || th.state === 'hunt' ? 0.5 + Math.sin(this.time * 9) * 0.2 : 0);
    if (!th.seen && th.state !== 'lurk' && S.clearance(player.pos.x, this.camY ?? 0, player.pos.z) < 30) {
      th.seen = true;
      player.sanity = Math.max(0, player.sanity - 12);
    }
  }

  ram(player, hull, hurt) {
    const { ctx } = this;
    const b = this.boat;
    if (this.mode === 'boat') {
      b.hull = Math.max(0, b.hull - hull);
      b.speed = -3;
      b.heading += this.rng.range(-0.6, 0.6);
    }
    player.damage(hurt);
    ctx.hurtFlash(0.8);
    ctx.vibrate([150, 40, 220]);
    ctx.audio.crash(0, 0.7);
    this.shake = 1;
    this.particles.splash(b.x, b.z, 2.5, () => this.rng.next());
    ctx.hud.message(this.mode === 'boat' ? `It slams into the boat. (HULL ${Math.round(b.hull)}%)` : 'It slams into you.', 2.5);
  }

  hitThing(hit) {
    const th = this.thing, { ctx } = this;
    if (th.hp <= 0) return;
    this.serpent.stick(hit);
    this.particles.blood(hit.point.x, hit.point.y, hit.point.z, hit.head ? 22 : 10, () => this.rng.next());
    ctx.audio.impact(0.5);
    const dmg = hit.head ? 1 : 0.5;
    th.hp -= dmg;
    th.hits += dmg;
    const pan = 0;
    if (th.hp <= 0) {
      th.state = 'dying';
      th.t = 0;
      ctx.audio.roar(pan, 1, 3.5, false);
      ctx.hud.message('The harpoon goes deep. It screams, thrashes, and starts to sink.', 4);
      this.ctx.vibrate([100, 50, 100, 50, 300]);
      return;
    }
    ctx.audio.roar(pan, 0.55, 1.2, false);
    ctx.hud.message(hit.head ? 'A hit! It shrieks.' : 'The harpoon sticks in its side. It barely notices.', 1.8);
    // Hurt enough, it breaks off the attack.
    if (th.hits >= 2 && ['charge', 'rear', 'rise', 'hold'].includes(th.state)) {
      th.state = 'dive';
      th.t = 0;
    }
  }

  // ---- Harpoons --------------------------------------------------------------------------

  fire(player) {
    if (this.mode !== 'boat' || this.throwCd > 0 || this.done) return;
    this.throwCd = 1.0;
    const f = this.forward(player);
    const r = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const p = new THREE.Vector3(player.pos.x, this.y + player.eye, player.pos.z).addScaledVector(r, 0.25).addScaledVector(f, 0.6);
    const v = f.clone().multiplyScalar(30);
    v.y += 2;
    const mesh = new THREE.Mesh(this.harpoonGeo, this.M.iron);
    mesh.position.copy(p);
    this.group.add(mesh);
    this.projectiles.push({ p, v, mesh, life: 4, wet: false });
    this.ctx.audio.swing(0.4);
  }

  forward(player) {
    const cp = Math.cos(player.pitch);
    return new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
  }

  updateProjectiles(dt, player) {
    const z = new THREE.Vector3(0, 0, 1);
    for (const h of this.projectiles) {
      h.life -= dt;
      const prev = h.p.clone();
      h.v.y -= (h.wet ? 2 : 9.8) * dt;
      if (h.wet) h.v.multiplyScalar(Math.exp(-3 * dt));
      h.p.addScaledVector(h.v, dt);
      if (!h.wet && h.p.y < waveHeight(h.p.x, h.p.z, this.time)) {
        h.wet = true;
        this.particles.splash(h.p.x, h.p.z, 0.5, () => this.rng.next());
        this.ctx.audio.splash(this.panTo(player, h.p.x, h.p.z), 0.25, false);
      }
      const hit = this.thing.hp > 0 && this.thing.state !== 'lurk' ? this.serpent.hitTest(prev, h.p) : null;
      if (hit) {
        this.hitThing(hit);
        h.life = 0;
      }
      h.mesh.position.copy(h.p);
      if (h.v.lengthSq() > 0.01) h.mesh.quaternion.setFromUnitVectors(z, h.v.clone().normalize());
    }
    for (const h of this.projectiles.filter((q) => q.life <= 0)) this.group.remove(h.mesh);
    this.projectiles = this.projectiles.filter((q) => q.life > 0);
  }

  // The next harpoon, in your hand.
  updateHand(player) {
    const show = this.mode === 'boat';
    this.hand.visible = show && this.throwCd < 0.4;
    if (!this.hand.visible) return;
    const f = this.forward(player);
    const r = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const u = new THREE.Vector3().crossVectors(r, f);
    const raise = Math.max(0, this.throwCd) / 0.4;
    const cam = new THREE.Vector3(player.pos.x, this.y + player.eye, player.pos.z);
    this.hand.position.copy(cam).addScaledVector(f, 0.42).addScaledVector(r, 0.34).addScaledVector(u, -0.3 - raise * 0.4);
    this.hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.clone().addScaledVector(u, 0.2).addScaledVector(r, -0.12).normalize());
  }

  // ---- Fort Surrender -------------------------------------------------------------------

  updateFort(dt, player) {
    const F = this.fort, { ctx } = this;
    // The white flag flaps.
    const p = F.flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(this.time * 4 + p.getX(i) * 2.5) * 0.12 * p.getX(i));
    p.needsUpdate = true;
    F.flash.intensity = Math.max(0, F.flash.intensity - dt * 120);
    const d = Math.hypot(player.pos.x - this.layout.fort.x, player.pos.z - this.layout.fort.z);
    if (this.mode !== 'boat' && this.mode !== 'swim') return;
    const pan = this.panTo(player, F.gun.x, F.gun.z);
    this.nextShout -= dt;
    if (d < 80 && this.nextShout <= 0) {
      this.nextShout = this.rng.range(7, 12);
      ctx.audio.voice(pan, 0.3);
      ctx.hud.message(this.rng.pick(['A shout from the island: "TURN BACK!"', '"NO CLOSER! WE WILL SHOOT!"', '"THIS IS FORT SURRENDER. GO AWAY."', '"LAST WARNING!"']), 2.5);
    }
    this.nextShot -= dt;
    if (d < 52 && this.nextShot <= 0) {
      this.nextShot = this.rng.range(1.4, 2.8);
      F.flash.intensity = 40;
      ctx.audio.gunshot(pan, 0.6 * Math.max(0.3, 1 - d / 60));
      const hitChance = (this.mode === 'boat' && Math.abs(this.boat.speed) > 6 ? 0.18 : 0.35) * (1 - d / 70);
      if (this.rng.chance(hitChance)) {
        player.damage(16);
        ctx.hurtFlash(0.7);
        ctx.vibrate([80]);
        if (this.mode === 'boat') this.boat.hull = Math.max(0, this.boat.hull - 5);
        ctx.hud.message('You\'re hit!', 1.5);
      } else {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(1.5, 5);
        this.particles.splash(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r, 0.35, () => this.rng.next());
      }
      if (!this.told.shots) {
        this.told.shots = true;
        ctx.hud.message('Gunfire from the watchtower! Fort Surrender doesn\'t take visitors.', 3);
      }
    }
  }

  // ---- Light, breath, cold, sanity ------------------------------------------------------------

  updateLights(dt, player) {
    const depth = Math.max(0, -this.camY);
    const under = this.underwater;
    const dark = under ? 1 - smooth(4, 40, depth) : 1;
    this.hemi.intensity = 2.1 * (under ? 0.08 + dark * 0.8 : 1);
    this.sun.intensity = 0.8 * (under ? dark * 0.6 : 1);
    // The room's lamp hums and stutters.
    const flick = this.rng.chance(dt * 2) ? this.rng.range(0.2, 0.8) : 1;
    this.room.lamp.intensity = 2.6 * flick;
    this.room.tube.color.setScalar(0.4 + 0.55 * flick);
    // Your flashlight works here.
    const f = this.forward(player);
    this.spot.position.set(player.pos.x, this.camY - 0.1, player.pos.z);
    this.spot.target.position.copy(this.spot.position).addScaledVector(f, 10);
    this.spot.intensity = player.flashlight ? (under ? 60 : 30) : 0;
    this.boatLight.intensity = this.boat.sunk ? 0 : 3.5 * (0.9 + Math.sin(this.time * 7) * 0.05);
    this.snow.visible = under;
    this.snow.material.uniforms.center.value.set(player.pos.x, this.camY, player.pos.z);
    this.water.material.uniforms.under.value.copy(UNDER[0]).multiplyScalar(2.2 * (0.1 + dark));
  }

  updateBody(dt, player) {
    const { ctx } = this;
    const under = this.underwater;
    const inWater = this.mode === 'swim';
    // Breath.
    if (inWater && under) {
      this.breath -= (100 / BREATH_TIME) * (player.sprinting ? 1.5 : 1) * dt;
      if (this.rng.chance(dt * 0.8)) this.particles.bubbles(player.pos.x, this.camY + 0.1, player.pos.z, 3, () => this.rng.next());
      if (this.breath <= 0) {
        this.breath = 0;
        player.damage(12 * dt);
        if (!this.told.drown) {
          this.told.drown = true;
          ctx.hud.message('Your lungs are burning. Get to the surface!', 2.5);
        }
      }
    } else {
      if (this.wasUnder && this.breath < 50 && this.mode === 'swim') ctx.audio.gasp();
      if (this.breath < 99) this.breath = Math.min(100, this.breath + 35 * dt);
      this.told.drown = false;
    }
    this.wasUnder = inWater && under;
    // Cold.
    if (inWater) this.warmth -= (100 / COLD_TIME) * (this.camY < -38 ? 1.5 : 1) * dt;
    else this.warmth = Math.min(100, this.warmth + (this.mode === 'boat' ? 2 : 5) * dt);
    if (this.warmth <= 0) {
      this.warmth = 0;
      player.damage(3 * dt);
      if (!this.told.cold) {
        this.told.cold = true;
        ctx.hud.message('You can\'t feel your hands. The cold is killing you.', 3);
      }
    } else if (this.warmth > 20) this.told.cold = false;
    // The sea wears on the mind.
    const drain = inWater ? 0.25 + smooth(10, 60, -this.camY) * 0.6 : this.mode === 'boat' ? 0.08 : 0;
    player.sanity = Math.max(0, player.sanity - drain * dt);
    // Depth zones.
    if (under) {
      const z = zoneAt(this.camY);
      if (z > this.zone) {
        ctx.hud.message(ZONES[z].name, 2.5);
        this.zone = z;
      } else if (z < this.zone && this.camY > ZONES[this.zone].top + 3) this.zone = z;
    } else this.zone = -1;
    if (player.health <= 0 || player.sanity <= 0) {
      this.done = true;
      const cause = this.breath <= 0 ? 'You drowned in the freezing dark.'
        : this.warmth <= 0 ? 'The cold took you.'
          : player.sanity <= 0 ? 'The sea was too big. Your mind sank before you did.'
            : this.thing.state === 'dive' || this.thing.state === 'hunt' ? 'The Thing on Level 7 took you under.' : 'You died on the open water.';
      ctx.onDeath(cause);
    }
  }

  updateExits(dt, player) {
    const { ctx } = this;
    const p = player.pos;
    if (this.mode === 'swim') {
      const D = this.platform.front;
      if (Math.hypot(D.x - p.x, D.y - this.camY, D.z - p.z) < 1.5) {
        this.done = true;
        ctx.hud.message('You turn the handle. The door opens onto air.', 3);
        ctx.onEscape('level9', 'door');
        return;
      }
      const C = this.cave.mouth;
      if (Math.hypot(C.x - p.x, C.y - this.camY, C.z - p.z) < 6) {
        this.done = true;
        ctx.hud.message('You swim into the cave. It goes on, and up, and then there is air.', 3.5);
        ctx.onEscape('level8', 'walk');
        return;
      }
      if (this.camY < -82) {
        this.done = true;
        ctx.hud.message('The pressure crushes in. Everything goes black.', 3.5);
        ctx.onEscape('level83', 'noclip');
        return;
      }
    }
    if (this.mode === 'swim' || this.mode === 'boat') {
      if (p.x < WEST_EDGE + 140 && !this.told.west) {
        this.told.west = true;
        ctx.hud.message('The water goes on and on to the west. Nobody knows how far.', 4);
      }
      if (p.x < WEST_EDGE) {
        this.done = true;
        ctx.hud.message('You keep going west until the sea runs out.', 3.5);
        ctx.onEscape('level880', 'walk');
      }
    }
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
    player.sanity = Math.min(100, player.sanity + 30);
    this.warmth = Math.min(100, this.warmth + 15);
    this.ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    const under = this.underwater;
    const depth = Math.max(0, -(this.camY ?? 0));
    const S = this.serpent;
    const near = this.thing.state === 'dead' ? 0 : Math.max(0, 1 - S.clearance(player.pos.x, this.camY ?? 0, player.pos.z) / 60);
    const inRoom = this.mode === 'room';
    const motor = this.mode === 'boat' ? 0.06 + Math.abs(this.boat.speed) / 11.5 * 0.3 : 0;
    return {
      hum: inRoom ? 0.12 : 0, exitGain: 0, exitPan: 0,
      drone: (under ? 0.1 + smooth(5, 60, depth) * 0.3 : 0) + near * 0.3,
      machine: motor, jazz: 0,
      wind: inRoom ? 0.02 : under ? 0 : 0.05,
      waves: inRoom ? 0.06 : under ? 0.05 : 0.2, wavesPan: 0,
      underwater: under,
      sanity: player.sanity, ears: false,
    };
  }

  atmosphere(dt, player) {
    const under = this.underwater;
    const y = this.camY ?? ROOM_Y;
    let density;
    if (under) {
      const d = -y;
      if (d < 15) this.fogColor.copy(UNDER[0]).lerp(UNDER[1], smooth(5, 15, d));
      else if (d < 38) this.fogColor.copy(UNDER[1]).lerp(UNDER[2], smooth(20, 38, d));
      else this.fogColor.copy(UNDER[2]).lerp(UNDER[3], smooth(60, 80, d));
      density = 0.02 + smooth(8, 40, d) * 0.035 + smooth(50, 80, d) * 0.04;
      // Murky but lit up close when the flashlight is on.
      if (player.flashlight && d > 30) density *= 0.85;
    } else {
      this.fogColor.copy(AIR_FOG);
      density = 0.0042;
    }
    const insane = 1 - player.sanity / 100;
    const roll = this.mode === 'room' ? this.tilt * 0.35 : this.mode === 'falling' ? 0.4 : this.mode === 'boat' ? this.boat.roll * 0.7 : 0;
    return {
      fogColor: this.fogColor,
      fogDensity: density,
      warp: (under ? 0.35 : 0) + insane * insane * 1.2,
      aberr: (under ? 0.6 : 0.2) + insane,
      grain: 0.07 + (under ? 0.04 : 0),
      soften: under ? 0.35 : 0.08,
      roll,
      shake: this.shake * 3,
      fovMul: under ? 0.9 : 1,
    };
  }

  hudInfo(player) {
    const under = this.underwater;
    let warn = null;
    if (this.mode === 'swim' && under && this.breath < 25) warn = 'OUT OF AIR — SWIM UP';
    else if (this.warmth < 20 && this.mode === 'swim') warn = 'YOU ARE FREEZING';
    else if (under && this.camY < -70) warn = 'TOO DEEP';
    const th = this.thing;
    const showBoss = th.state !== 'lurk' && th.state !== 'dead' && th.hp > 0;
    return {
      warn, warnCovered: warn,
      coverLabel: this.mode === 'boat' ? 'JUMP' : this.mode === 'swim' ? 'UP' : 'EARS',
      health: true,
      bars: {
        breath: this.mode === 'swim' || this.breath < 99 ? this.breath : null,
        warmth: this.mode !== 'room' || this.warmth < 99 ? this.warmth : null,
        hull: this.mode === 'boat' ? this.boat.hull : null,
      },
      boss: showBoss ? { name: 'THE THING ON LEVEL 7', hp: th.hp / SERPENT_HP } : null,
      act: this.mode === 'boat' ? 'THROW' : null,
    };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL7 = {
  id: 'level7',
  number: 7,
  name: 'Level 7',
  title: 'Thalassophobia',
  difficulty: 4,
  next: 'level8',
  create: (ctx) => new Level7(ctx),
};
