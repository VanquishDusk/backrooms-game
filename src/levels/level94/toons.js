import * as THREE from 'three';
import { Entity } from '../../entities/lib/Entity.js';
import { buildHumanoid, resetPose, walk, idle, reach } from '../../entities/lib/rig.js';

// Level 94's own creatures.
//
//   Animation  a 1930s rubber-hose cartoon: black body, pie-cut eyes, a wide
//              white grin, white gloves. Out at night. It moves twelve
//              frames a second, like everything animated, and it hates
//              anything that isn't.
//   RoboMan    a wind-up tin robot toy guarding the castle. Leaves you alone
//              until it sees you touch something.
//   King       the Animated King on his throne (scenery; the level runs him).
//   Nightmare  a flat cartoon cut-out of something you're afraid of.

const STEP = 1 / 12;

// A face: two pie-cut eyes and a grin, drawn once.
function faceTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  // Eyes: tall white ovals, black pupils with a pie-slice cut out.
  for (const x of [92, 164]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, 96, 28, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x + 2, 112);
    ctx.ellipse(x + 2, 112, 15, 22, 0, -Math.PI * 0.32, Math.PI * 1.32);
    ctx.closePath();
    ctx.fill();
  }
  // A grin, too wide.
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(48, 160);
  ctx.quadraticCurveTo(128, kind === 'king' ? 236 : 250, 208, 160);
  ctx.quadraticCurveTo(128, 196, 48, 160);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  for (let x = 70; x < 200; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 168);
    ctx.lineTo(x + 2, 196);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let faceCache = null;

export class Animation extends Entity {
  build() {
    const black = this.mat(0x0e0e0e, { emissive: true });
    const white = this.mat(0xf4f4f0, { emissive: true });
    this.kind = this.opts.kind || this.rng.pick(['mouse', 'cat', 'pup']);
    this.rig = buildHumanoid({
      mat: black, handMat: white, footMat: black, legLen: 0.62, torsoLen: 0.46, armLen: 0.66,
      headR: 0.3, headLen: 0.56, limbR: 0.045, torsoR: 0.27, torsoDepth: 0.9, handLen: 0.2, neckLen: 0.02, shoulder: 0.27,
    });
    this.root.add(this.rig.root);
    // Big puffy round gloves, and shoes.
    const glove = this.geo(new THREE.SphereGeometry(0.13, 12, 10));
    for (const a of [this.rig.armL, this.rig.armR]) {
      for (const c of a.hand.children) c.visible = false;
      const gm = this.mesh(glove, white, 0, -0.1, 0);
      gm.scale.set(1, 1.15, 0.8);
      a.hand.add(gm);
    }
    // A round belly: rubber-hose characters are pear-shaped.
    const belly = this.mesh(this.geo(new THREE.SphereGeometry(0.34, 16, 12)), black, 0, 0.12, 0);
    belly.scale.set(1, 0.9, 0.95);
    this.rig.spine.add(belly);
    for (const l of [this.rig.legL, this.rig.legR]) l.foot.scale.set(1.8, 1.8, 1.7);
    // Ears.
    const ear = this.kind === 'cat' ? this.geo(new THREE.ConeGeometry(0.11, 0.26, 4)) : this.kind === 'pup' ? this.geo(new THREE.SphereGeometry(0.12, 10, 8)) : this.geo(new THREE.SphereGeometry(0.15, 12, 10));
    for (const s of [-1, 1]) {
      const e = this.mesh(ear, black, s * 0.2, this.rig.p.headLen - 0.04, 0);
      if (this.kind === 'mouse') e.scale.set(1, 1, 0.3);
      if (this.kind === 'pup') {
        e.scale.set(0.6, 1.6, 0.4);
        e.position.set(s * 0.3, this.rig.p.headLen * 0.55, 0);
      }
      this.rig.head.add(e);
    }
    // The face, on a curved card on the front of the head.
    faceCache ||= faceTexture('toon');
    this.faceMat = new THREE.MeshBasicMaterial({ map: faceCache, transparent: true, depthWrite: false });
    this.mats.push(this.faceMat);
    const face = this.mesh(this.geo(new THREE.SphereGeometry(0.34, 20, 14, -0.9, 1.8, 0.5, 1.6)), this.faceMat, 0, this.rig.p.headLen / 2, 0);
    face.rotation.y = Math.PI / 2;
    face.scale.y = this.rig.p.headLen / 0.6;
    this.rig.head.add(face);
    this.radius = 0.35;
    this.acc = 0;
    this.speed = 5.0;
    this.spotted = 0;
    this.heightAt = this.opts.heightAt;
    this.inTown = this.opts.inTown;
    this.state = 'wander';
    this.stride = 0;
  }

  // Twelve frames a second: everything about it moves in steps.
  update(dt, player) {
    this.acc += dt;
    if (this.acc < STEP) return [];
    const d = this.acc;
    this.acc = 0;
    const out = super.update(d, player);
    if (this.heightAt) this.pos.y = this.heightAt(this.pos.x, this.pos.z);
    this.syncRoot();
    return out;
  }

  sees(player) {
    const d = this.distTo(player);
    const range = player.flashlight ? 30 : 18;
    if (d > range) return false;
    if (player.hidden) return false;
    const a = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const diff = Math.atan2(Math.sin(a - this.heading), Math.cos(a - this.heading));
    if (Math.abs(diff) > 1.4 && d > 4) return false;
    if (this.inTown(this.pos.x, this.pos.z) && this.inTown(player.pos.x, player.pos.z)) return this.lineOfSight(player.pos.x, player.pos.z);
    return true;
  }

  go(x, z, speed, dt) {
    if (this.inTown(this.pos.x, this.pos.z) && this.inTown(x, z)) {
      if (this.pathTo(x, z, speed, dt)) return;
    }
    this.moveToward(x, z, speed, dt, 9);
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    switch (this.state) {
      case 'wander': {
        if (!this.target || Math.hypot(this.target[0] - this.pos.x, this.target[1] - this.pos.z) < 1 || this.stateTime > 8) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(6, 18);
          this.target = [this.pos.x + Math.cos(a) * r, this.pos.z + Math.sin(a) * r];
          this.stateTime = 0;
        }
        this.go(this.target[0], this.target[1], 1.6, dt);
        if (this.sees(player)) {
          this.setState('take');
          this.sound('slideWhistle', player, 0.45, 40, true);
          out.push({ type: 'detect' });
        }
        break;
      }
      case 'take':
        // The double take: freeze, stare.
        this.turnTo(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), dt, 20);
        if (this.stateTime > 0.5) this.setState('chase');
        break;
      case 'chase':
        if (player.hidden) {
          this.setState('wander');
          break;
        }
        this.go(player.pos.x, player.pos.z, this.speed, dt);
        if (d < 1.2 && !this.cooldown) {
          this.cooldown = 1.1;
          this.sound('boing', player, 0.4, 20);
          out.push({ type: 'attack', damage: 22, sanity: 6, cause: 'The Animations got you. You didn\'t look animated enough.' });
        }
        if (d > 45) this.setState('wander');
        break;
    }
  }

  animate(dt) {
    const rig = this.rig;
    resetPose(rig);
    const moving = this.moveSpeed > 0.3;
    this.stride += dt * (moving ? 12 : 2);
    walk(rig, this.stride, moving ? 1 : 0, { stride: 1.5, armSwing: 1.6 });
    // Bouncy, squashy, rubbery.
    const b = Math.abs(Math.sin(this.stride));
    rig.hips.position.y += b * (moving ? 0.18 : 0.04);
    rig.root.scale.set(1 + (1 - b) * 0.08, 1 - (1 - b) * 0.1 + (moving ? 0 : Math.sin(this.time * 6) * 0.03), 1);
    rig.head.rotation.z = Math.sin(this.stride * 0.5) * 0.2;
    if (this.state === 'take') {
      rig.head.scale.set(1.15, 1.35, 1.15);
      rig.armL.shoulder.rotation.z = -2.4;
      rig.armR.shoulder.rotation.z = 2.4;
    } else rig.head.scale.set(1, 1, 1);
    if (this.state === 'chase') reach(rig, 0.8);
  }
}

// ---- Robo-Men -------------------------------------------------------------------------

export class RoboMan extends Entity {
  build() {
    const tin = this.mat(0xb8bcc4);
    const red = this.mat(0xc03028);
    const dark = this.mat(0x2a2a30);
    const gold = this.mat(0xd8b048);
    const eye = this.mat(0xfff0a0, { emissive: true });
    const g = new THREE.Group();
    this.root.add(g);
    this.bodyG = g;
    const box = (m, x, y, z, w, h, d, parent = g) => {
      const o = this.mesh(this.geo(new THREE.BoxGeometry(w, h, d)), m, x, y, z);
      parent.add(o);
      return o;
    };
    box(tin, 0, 0.95, 0, 0.62, 0.72, 0.42);
    box(red, 0, 1.0, 0.215, 0.4, 0.36, 0.02);
    for (const x of [-0.1, 0.1]) {
      const dial = this.mesh(this.geo(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12)), gold, x, 1.05, 0.23);
      dial.rotation.x = Math.PI / 2;
      g.add(dial);
    }
    this.head = new THREE.Group();
    this.head.position.y = 1.32;
    g.add(this.head);
    box(tin, 0, 0.2, 0, 0.46, 0.4, 0.4, this.head);
    box(dark, 0, 0.12, 0.205, 0.3, 0.06, 0.02, this.head);
    for (const x of [-0.1, 0.1]) {
      const e = this.mesh(this.geo(new THREE.SphereGeometry(0.06, 10, 8)), eye, x, 0.26, 0.2);
      this.head.add(e);
    }
    const ant = this.mesh(this.geo(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6)), dark, 0, 0.54, 0);
    const bulb = this.mesh(this.geo(new THREE.SphereGeometry(0.05, 8, 6)), red, 0, 0.7, 0);
    this.head.add(ant, bulb);
    this.bulb = bulb;
    this.arms = [-1, 1].map((s) => {
      const a = new THREE.Group();
      a.position.set(s * 0.38, 1.22, 0);
      g.add(a);
      const arm = this.mesh(this.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8)), tin, 0, -0.25, 0);
      const claw = this.mesh(this.geo(new THREE.BoxGeometry(0.14, 0.12, 0.1)), red, 0, -0.55, 0);
      a.add(arm, claw);
      return a;
    });
    this.legs = [-1, 1].map((s) => {
      const l = new THREE.Group();
      l.position.set(s * 0.17, 0.6, 0);
      g.add(l);
      box(dark, 0, -0.27, 0, 0.16, 0.54, 0.18, l);
      box(red, 0, -0.56, 0.05, 0.2, 0.08, 0.3, l);
      return l;
    });
    // The wind-up key on its back.
    this.key = new THREE.Group();
    this.key.position.set(0, 1.0, -0.26);
    g.add(this.key);
    box(gold, 0, 0, -0.06, 0.03, 0.03, 0.12, this.key);
    box(gold, 0, 0, -0.14, 0.3, 0.12, 0.02, this.key);
    this.radius = 0.4;
    this.home = { x: this.pos.x, z: this.pos.z };
    this.nextServo = 1;
    this.lostFor = 0;
    this.state = 'patrol';
  }

  alert() {
    if (this.state === 'chase') return;
    this.setState('chase');
    this.lostFor = 0;
    this.alerted = true;
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    this.nextServo -= dt;
    if (this.nextServo <= 0 && this.moveSpeed > 0.2) {
      this.nextServo = 0.45;
      this.sound('clank', player, 0.2, 18);
    }
    if (this.state === 'patrol') {
      if (!this.target || Math.hypot(this.target[0] - this.pos.x, this.target[1] - this.pos.z) < 0.6 || this.stateTime > 9) {
        this.target = [this.home.x + this.rng.range(-7, 7), this.home.z + this.rng.range(-7, 7)];
        this.stateTime = 0;
      }
      this.pathTo(this.target[0], this.target[1], 1.1, dt);
      return;
    }
    // Chasing.
    this.pathTo(player.pos.x, player.pos.z, 3.6, dt);
    if (this.nextServo <= 0.2 && this.rng.chance(dt * 2)) this.sound('servo', player, 0.25, 20);
    const seen = this.lineOfSight(player.pos.x, player.pos.z) && d < 22;
    this.lostFor = seen ? 0 : this.lostFor + dt;
    if (d < 1.15 && !this.cooldown) {
      this.cooldown = 1.3;
      this.sound('clank', player, 0.5, 10);
      out.push({ type: 'attack', damage: 18, sanity: 4, cause: 'A Robo-Man caught you touching things.' });
    }
    if (this.lostFor > 9) {
      this.setState('patrol');
      this.alerted = false;
    }
  }

  animate(dt) {
    const t = this.time;
    const moving = this.moveSpeed > 0.2;
    const ph = this.gait * Math.PI * 2;
    this.legs[0].rotation.x = moving ? Math.sin(ph) * 0.4 : 0;
    this.legs[1].rotation.x = moving ? -Math.sin(ph) * 0.4 : 0;
    this.arms[0].rotation.x = moving ? -Math.sin(ph) * 0.5 : Math.sin(t * 1.5) * 0.05;
    this.arms[1].rotation.x = moving ? Math.sin(ph) * 0.5 : -Math.sin(t * 1.5) * 0.05;
    if (this.state === 'chase') {
      this.arms[0].rotation.x = this.arms[1].rotation.x = -1.4 + Math.sin(t * 14) * 0.15;
    }
    this.bodyG.rotation.z = moving ? Math.sin(ph) * 0.08 : 0;
    this.key.rotation.z += dt * (this.state === 'chase' ? 12 : 3);
    this.bulb.material.color.setRGB(this.state === 'chase' && Math.sin(t * 12) > 0 ? 1 : 0.5, 0.1, 0.08);
    this.head.rotation.y = this.state === 'patrol' ? Math.sin(t * 0.8) * 0.5 : 0;
  }
}

// ---- The Animated King ----------------------------------------------------------------------

export function buildKing(own) {
  const g = new THREE.Group();
  const mats = (m) => (own.mats.push(m), m);
  const geos = (x) => (own.geos.push(x), x);
  const black = mats(new THREE.MeshBasicMaterial({ color: 0x0e0e0e }));
  const white = mats(new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }));
  const robe = mats(new THREE.MeshLambertMaterial({ color: 0xa02028 }));
  const gold = mats(new THREE.MeshLambertMaterial({ color: 0xe0b848, emissive: 0x302008 }));
  const ermine = mats(new THREE.MeshLambertMaterial({ color: 0xf6f4ee }));
  // The throne.
  const throne = new THREE.Mesh(geos(new THREE.BoxGeometry(3.2, 1.2, 2.4)), gold);
  throne.position.y = 0.6;
  const back = new THREE.Mesh(geos(new THREE.BoxGeometry(3.2, 5.5, 0.4)), gold);
  back.position.set(0, 3.3, -1.1);
  const top = new THREE.Mesh(geos(new THREE.SphereGeometry(0.4, 12, 10)), gold);
  top.position.set(0, 6.2, -1.1);
  g.add(throne, back, top);
  // Him: big, round, black, sitting, in a red robe.
  const king = new THREE.Group();
  king.position.set(0, 1.2, -0.2);
  g.add(king);
  const body = new THREE.Mesh(geos(new THREE.SphereGeometry(1, 20, 16)), robe);
  body.scale.set(1.2, 1.35, 1.0);
  body.position.y = 1.2;
  const trim = new THREE.Mesh(geos(new THREE.TorusGeometry(1.15, 0.18, 8, 24)), ermine);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 1.9;
  const head = new THREE.Group();
  head.position.y = 3.1;
  const skull = new THREE.Mesh(geos(new THREE.SphereGeometry(0.85, 20, 16)), black);
  skull.scale.y = 1.1;
  const faceTex = faceTexture('king');
  own.textures.push(faceTex);
  const faceMat = mats(new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  const face = new THREE.Mesh(geos(new THREE.SphereGeometry(0.9, 24, 18, -0.9, 1.8, 0.5, 1.6)), faceMat);
  face.rotation.y = Math.PI / 2;
  face.scale.y = 1.1;
  const crown = new THREE.Group();
  crown.position.y = 0.95;
  const band = new THREE.Mesh(geos(new THREE.CylinderGeometry(0.55, 0.6, 0.4, 16, 1, true)), gold);
  crown.add(band);
  for (let k = 0; k < 5; k++) {
    const p = new THREE.Mesh(geos(new THREE.ConeGeometry(0.12, 0.4, 4)), gold);
    const a = (k / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.55, 0.38, Math.sin(a) * 0.55);
    crown.add(p);
  }
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(geos(new THREE.SphereGeometry(0.35, 12, 10)), black);
    ear.scale.z = 0.3;
    ear.position.set(s * 0.75, 0.75, 0);
    head.add(ear);
  }
  head.add(skull, face, crown);
  // Arms with big white gloves; one holds a sceptre.
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group();
    a.position.set(s * 1.1, 2.1, 0.2);
    const limb = new THREE.Mesh(geos(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8)), black);
    limb.position.y = -0.7;
    const glove = new THREE.Mesh(geos(new THREE.SphereGeometry(0.32, 12, 10)), white);
    glove.position.y = -1.45;
    a.add(limb, glove);
    a.rotation.z = s * 0.6;
    king.add(a);
    return a;
  });
  const sceptre = new THREE.Mesh(geos(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8)), gold);
  sceptre.position.set(0, -0.8, 0.2);
  const orb = new THREE.Mesh(geos(new THREE.SphereGeometry(0.22, 10, 8)), gold);
  orb.position.set(0, 0.35, 0.2);
  arms[1].add(sceptre, orb);
  // Legs and shoes poking out of the robe.
  for (const s of [-1, 1]) {
    const shoe = new THREE.Mesh(geos(new THREE.SphereGeometry(0.4, 12, 8)), black);
    shoe.scale.set(0.8, 0.5, 1.4);
    shoe.position.set(s * 0.6, -0.95, 1.0);
    king.add(shoe);
  }
  king.add(body, trim, head);
  return { group: g, king, head, arms };
}

// ---- Nightmares: flat cartoon cut-outs ------------------------------------------------------------

function drawNightmare(kind, frame) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#0c0c0c';
  ctx.strokeStyle = '#0c0c0c';
  ctx.lineCap = 'round';
  const leg = (x, y, dx) => {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx, y + 30, x + dx * 0.4, y + 56);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + dx * 0.4 + 6, y + 60, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const eyes = (x, y, r) => {
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + s * r * 1.1, y, r * 0.8, r * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c0c0c';
      ctx.beginPath();
      ctx.moveTo(x + s * r * 1.1, y + r * 0.3);
      ctx.ellipse(x + s * r * 1.1, y + r * 0.3, r * 0.42, r * 0.6, 0, -1, 4.2);
      ctx.fill();
    }
    ctx.fillStyle = '#0c0c0c';
  };
  const grin = (x, y, w) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + w * 0.9, x + w, y);
    ctx.quadraticCurveTo(x, y + w * 0.35, x - w, y);
    ctx.fill();
    ctx.fillStyle = '#0c0c0c';
  };
  const f = frame ? 1 : -1;
  if (kind === 'hound') {
    ctx.beginPath();
    ctx.ellipse(128, 130, 82, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(200, 100, 34, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, d] of [[80, 14 * f], [110, -14 * f], [160, 14 * f], [185, -14 * f]]) leg(x, 160, d);
    eyes(204, 92, 10);
    grin(204, 112, 26);
  } else if (kind === 'smiler') {
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();
    eyes(128, 90, 22 + f * 2);
    grin(128, 140, 80);
  } else if (kind === 'party') {
    ctx.fillStyle = '#f4f4f0';
    ctx.beginPath();
    ctx.ellipse(128, 140, 46, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(128, 62, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f4f4f0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(128 + s * 40, 110);
      ctx.quadraticCurveTo(128 + s * 90, 70 + f * s * 20, 128 + s * 96, 30);
      ctx.stroke();
    }
    ctx.fillStyle = '#0c0c0c';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('=)', 128, 78);
    ctx.strokeStyle = '#0c0c0c';
    leg(110, 195, 10 * f);
    leg(146, 195, -10 * f);
  } else {
    // A moth.
    ctx.beginPath();
    ctx.ellipse(128, 140, 24, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(128 + s * 60, 110 + (frame ? -16 : 16), 62, 36, s * (frame ? -0.5 : 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    eyes(128, 92, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function nightmareTextures(own) {
  const out = {};
  for (const k of ['hound', 'smiler', 'party', 'moth']) {
    out[k] = [drawNightmare(k, 0), drawNightmare(k, 1)];
    own.textures.push(...out[k]);
  }
  return out;
}
