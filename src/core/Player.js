import * as THREE from 'three';
import { BACKPACK_SLOTS, makeItem } from './items.js';

const WALK = 2.5;
const RUN = 4.6;
const EARS_SPEED = 0.6; // moving while covering your ears is slower
const EYE = 1.62;
const STAMINA_DRAIN = 11; // per second of sprinting, out of 100

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.radius = 0.28;
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.stamina = 100;
    this.staminaLock = 0;
    this.sanity = 100;
    this.health = 100;
    this.hurtAgo = 99;
    this.battery = 100;
    this.flashlight = false;
    this.items = [];
    this.coveringEars = false;
    this.sprinting = false;
    this.bob = 0;
    this.bobAmp = 0;
    this.stepDist = 0;
    this.falling = false;
    this.fallV = 0;
    this.dead = false;
    this.frozen = false;
    this.speedMul = 1;
    this.flipped = false;
    // Headroom above you, set by the level: under a low ceiling you crouch
    // or crawl automatically.
    this.ceiling = Infinity;
    this.eye = EYE;
    this.staminaRegenMul = 1;
  }

  // 1 = standing, ~0.6 = crouching, ~0.35 = crawling.
  get stance() {
    return this.eye / EYE;
  }

  // Stats that travel with you between levels.
  carry() {
    return { sanity: this.sanity, health: this.health, battery: this.battery, items: this.items.map((it) => ({ ...it })) };
  }

  restore(c) {
    if (c) Object.assign(this, c);
  }

  // ---- The backpack ---------------------------------------------------------------
  // BACKPACK_SLOTS items at most. give() returns false (and calls onFull)
  // when there's no room, so the item can stay where it was.

  canCarry() {
    return this.items.length < BACKPACK_SLOTS;
  }

  // `item` keeps a particular item's state (a pipe's hits left).
  give(id, item = null) {
    if (!this.canCarry()) {
      if (this.onFull) this.onFull(id);
      return false;
    }
    this.items.push(item ? { ...item } : makeItem(id));
    return true;
  }

  count(id) {
    return this.items.filter((it) => it.id === id).length;
  }

  // Remove one item of a kind; true if there was one.
  takeItem(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  get bottles() {
    return this.count('water');
  }

  get meat() {
    return this.count('meat');
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtAgo = 0;
  }

  get speed() {
    return this.vel.length();
  }

  // Returns a list of events ('step', 'step-run', 'exhausted').
  update(dt, input, world, settings) {
    const events = [];
    this.hurtAgo += dt;
    if (this.hurtAgo > 6 && this.health < 100) this.health = Math.min(100, this.health + 1.5 * dt);

    const look = input.consumeLook();
    // When the view is turned upside-down, flip controls so they still
    // feel right relative to the screen.
    if (this.flipped) {
      look.x = -look.x;
      look.y = -look.y;
    }
    if (!this.frozen) {
      const sens = settings.lookSens;
      this.yaw -= look.x * 0.0022 * sens;
      this.pitch -= look.y * 0.0022 * sens * (settings.invertY ? -1 : 1);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }

    if (this.falling) {
      this.fallV += 14 * dt;
      this.pos.y -= this.fallV * dt;
      this.pitch = Math.min(1.45, this.pitch + dt * 0.8);
      return events;
    }
    if (this.frozen) {
      this.vel.set(0, 0);
      return events;
    }

    const move = input.getMove();
    let mx = this.flipped ? -move.x : move.x, my = move.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const moving = mag > 0.05;

    this.coveringEars = input.coverEars;
    const eyeTarget = Math.max(0.5, Math.min(EYE, this.ceiling - 0.24));
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 9);
    const low = this.eye < 1.45;
    const wantRun = input.sprint && moving && my > -0.2 && !this.coveringEars && !low;
    if (this.staminaLock > 0) this.staminaLock -= dt;
    this.sprinting = wantRun && this.stamina > 0 && this.staminaLock <= 0;
    if (this.sprinting) {
      this.stamina -= STAMINA_DRAIN * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.staminaLock = 1.4;
        events.push('exhausted');
      }
    } else {
      this.stamina = Math.min(100, this.stamina + (moving ? 14 : 24) * this.staminaRegenMul * dt);
    }

    let speed = (this.sprinting ? RUN : WALK) * Math.min(1, Math.max(mag, 0));
    if (this.coveringEars) speed *= EARS_SPEED;
    if (low) speed *= this.eye < 1.0 ? 0.42 : 0.68;
    speed *= this.speedMul;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // Forward is -z at yaw 0.
    const wx = (-sin * my + cos * mx) * speed;
    const wz = (-cos * my - sin * mx) * speed;
    const accel = moving ? 10 : 12;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.y += (wz - this.vel.y) * k;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    world.collide(this.pos, this.radius);
    if (world.groundAt) {
      const ground = world.groundAt(this.pos.x, this.pos.z);
      this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 12);
    }

    const sp = this.speed;
    this.bobAmp += ((sp > 0.3 ? Math.min(1, sp / RUN + 0.35) : 0) - this.bobAmp) * Math.min(1, dt * 8);
    this.bob += dt * (4.2 + sp * 1.5);
    this.stepDist += sp * dt;
    const stride = this.sprinting ? 0.85 : 0.68;
    if (this.stepDist > stride) {
      this.stepDist -= stride;
      events.push(this.sprinting ? 'step-run' : 'step');
    }
    this.roll += ((-move.x * 0.012 * sp) - this.roll) * Math.min(1, dt * 6);
    return events;
  }

  applyCamera(camera) {
    const bobY = Math.sin(this.bob * 2) * 0.04 * this.bobAmp;
    const bobX = Math.cos(this.bob) * 0.03 * this.bobAmp;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    camera.position.set(this.pos.x + cos * bobX, this.pos.y + this.eye + bobY * this.stance, this.pos.z - sin * bobX);
    camera.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
}
