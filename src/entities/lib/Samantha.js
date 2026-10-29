import * as THREE from 'three';
import { Entity } from './Entity.js';
import { catFur } from './textures.js';

// Samantha (Entity 26): a small black-and-white cat with green eyes and
// teeth far too sharp for a cat. She talks. She offers psychic readings in
// exchange for meat, follows you while she waits, and turns vicious if
// you provoke her (light in her eyes, running at her) or don't pay.
//
// Feeding: if player.meat > 0 when she asks, she takes one and gives a
// reading (and a little sanity back).
// Emits { type: 'speak', text } events for the level to show.
// States: sit -> approach -> ask -> (reading | angry -> attack) -> leave

const READINGS = [
  'You will find a door that wasn\'t there before. Do not knock.',
  'Someone you know is looking for you three levels down. Don\'t let them find you.',
  'The water you drink next will taste of almonds and regret. Drink it anyway.',
  'There is a hallway with a red light. Walk past it, not through it.',
  'You will hear your own voice calling. It isn\'t you.',
  'You will get out. Not the way you think.',
];

export class Samantha extends Entity {
  build() {
    this.radius = 0.15;
    const black = this.mat(0xffffff, { map: catFur('black') });
    const white = this.mat(0xffffff, { map: catFur('white') });
    this.body = new THREE.Group();
    this.root.add(this.body);
    const torso = this.mesh(this.geo(new THREE.SphereGeometry(0.11, 14, 10)), black, 0, 0.2, -0.02);
    torso.scale.set(0.85, 0.85, 1.75);
    this.body.add(torso);
    const chest = this.mesh(this.geo(new THREE.SphereGeometry(0.075, 10, 8)), white, 0, 0.18, 0.1);
    chest.scale.set(0.9, 1.1, 0.8);
    this.body.add(chest);
    // Head with ears, a white muzzle, green eyes with slit pupils.
    this.head = new THREE.Group();
    this.head.position.set(0, 0.3, 0.17);
    this.body.add(this.head);
    this.head.add(this.mesh(this.geo(new THREE.SphereGeometry(0.075, 14, 10)), black));
    const muzzle = this.mesh(this.geo(new THREE.SphereGeometry(0.04, 10, 8)), white, 0, -0.025, 0.055);
    muzzle.scale.set(1.2, 0.8, 0.9);
    this.head.add(muzzle);
    for (const s of [-1, 1]) {
      const ear = this.mesh(this.geo(new THREE.ConeGeometry(0.03, 0.06, 4)), black, s * 0.045, 0.07, -0.01);
      ear.rotation.z = -s * 0.25;
      this.head.add(ear);
    }
    this.eyeMat = this.mat(0x40e060, { emissive: true });
    const slit = this.mat(0x020202, { emissive: true });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = this.mesh(this.geo(new THREE.SphereGeometry(0.016, 10, 8)), this.eyeMat, s * 0.03, 0.015, 0.062);
      e.scale.z = 0.6;
      const p = this.mesh(this.geo(new THREE.BoxGeometry(0.004, 0.022, 0.004)), slit, 0, 0, 0.011);
      e.add(p);
      this.head.add(e);
      this.eyes.push({ e, p });
    }
    // Teeth: small, white, far too many and far too sharp.
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.04, 0.06);
    this.head.add(this.jaw);
    const tooth = this.mat(0xf4f0e8);
    for (let i = 0; i < 6; i++) {
      const t = this.mesh(this.geo(new THREE.ConeGeometry(0.004, 0.018, 4)), tooth, (i - 2.5) * 0.008, 0.012, 0.01);
      t.rotation.x = Math.PI;
      this.jaw.add(t);
    }
    // Legs with white paws; a long tail.
    this.legs = [];
    for (const [x, z] of [[-0.05, 0.1], [0.05, 0.1], [-0.05, -0.12], [0.05, -0.12]]) {
      const l = new THREE.Group();
      l.position.set(x, 0.17, z);
      const g = this.geo(new THREE.CylinderGeometry(0.018, 0.016, 0.15, 6));
      g.translate(0, -0.075, 0);
      l.add(this.mesh(g, black));
      l.add(this.mesh(this.geo(new THREE.SphereGeometry(0.022, 8, 6)), white, 0, -0.155, 0.008));
      this.body.add(l);
      this.legs.push(l);
    }
    this.tail = [];
    let parent = this.body;
    for (let k = 0; k < 7; k++) {
      const g = new THREE.Group();
      if (k === 0) g.position.set(0, 0.24, -0.2);
      else g.position.y = 0.05;
      const geo = this.geo(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 6));
      geo.translate(0, 0.025, 0);
      g.add(this.mesh(geo, k === 6 ? white : black));
      parent.add(g);
      parent = g;
      this.tail.push(g);
    }
    this.provoked = 0;
    this.gaitScale = 9;
    this.asked = 0;
  }

  say(out, text, player, angry = false) {
    out.push({ type: 'speak', text });
    this.sound('meow', player, 0.22, 16, angry);
  }

  think(dt, player, out) {
    const d = this.distTo(player);
    const toYaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    // Provocation: a light in her eyes, or charging at her.
    if ((player.flashlight && this.seenBy(player, 0.95, 6)) || (player.sprinting && d < 1.5)) this.provoked += dt;
    else this.provoked = Math.max(0, this.provoked - dt * 0.3);
    if (this.provoked > 1.2 && this.state !== 'angry' && this.state !== 'attack') {
      this.say(out, '"Rude."', player, true);
      this.setState('angry');
    }
    switch (this.state) {
      case 'idle':
      case 'sit':
        this.setState('sit');
        if (d < 9 && this.lineOfSight(player.pos.x, player.pos.z) && !this.cooldown) this.setState('approach');
        else if (this.rng.chance(dt * 0.1)) this.wander(dt, 0.5);
        break;
      case 'approach':
        if (d > 1.3) this.pathTo(player.pos.x, player.pos.z, 1.6, dt);
        else {
          this.setState('ask');
          this.say(out, '"Meat. Give me meat and I\'ll tell you something true."', player);
        }
        break;
      case 'ask':
        // Follows at your heel, waiting to be paid.
        this.turnTo(toYaw, dt, 4);
        if (d > 1.6) this.pathTo(player.pos.x, player.pos.z, 1.8, dt);
        if ((player.meat || 0) > 0) {
          player.meat--;
          player.sanity = Math.min(100, player.sanity + 20);
          this.say(out, `"${this.rng.pick(READINGS)}"`, player);
          this.cooldown = 60;
          this.setState('leave');
        } else if (this.stateTime > 12 && this.stateTime - dt <= 12) {
          this.say(out, '"I\'m still waiting."', player);
        } else if (this.stateTime > 22) {
          this.say(out, '"No meat? Then you\'ll do."', player, true);
          this.setState('angry');
        }
        break;
      case 'angry':
        this.sound('hiss', player, 0.2, 10);
        this.pathTo(player.pos.x, player.pos.z, 3.6, dt);
        if (d < 0.6) this.setState('attack');
        if (this.stateTime > 8) this.setState('leave');
        break;
      case 'attack':
        if (!this.hit) {
          this.hit = true;
          out.push({ type: 'attack', damage: 9, sanity: 6, cause: 'Samantha wanted meat. She found some.' });
        }
        if (this.stateTime > 0.6) {
          this.hit = false;
          this.provoked = 0;
          this.setState(this.rng.chance(0.5) ? 'angry' : 'leave');
        }
        break;
      case 'leave': {
        const ax = this.pos.x - player.pos.x, az = this.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
        this.moveToward(this.pos.x + (ax / l), this.pos.z + (az / l), 1.8, dt);
        if (this.stateTime > 4) {
          this.cooldown = Math.max(this.cooldown, 25);
          this.setState('sit');
        }
        break;
      }
    }
  }

  animate() {
    const s = this.preview || this.state;
    const amt = s === 'move' ? 1 : Math.min(1, this.moveSpeed / 1.5);
    const ph = this.gait * Math.PI * 2;
    const sitting = (s === 'sit' || s === 'idle' || s === 'ask') && amt < 0.1;
    // Sitting: hindquarters down, front legs straight.
    this.body.rotation.x = sitting ? -0.55 : 0;
    this.body.position.y = sitting ? -0.02 : Math.abs(Math.sin(ph)) * 0.01 * amt;
    this.legs.forEach((l, i) => {
      l.rotation.x = sitting ? (i < 2 ? 0.55 : -0.9) : Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 * amt;
    });
    const angry = s === 'angry' || s === 'attack' || s === 'detect';
    this.head.rotation.x = sitting ? 0.45 : 0;
    this.head.rotation.z = s === 'ask' ? Math.sin(this.time * 1.5) * 0.2 : 0;
    // Grooming now and then.
    if (s === 'sit' && (this.time % 9) < 2) this.head.rotation.x = 1.0 + Math.sin(this.time * 10) * 0.1;
    this.jaw.rotation.x = angry ? 0.5 + Math.sin(this.time * 12) * 0.1 : 0;
    this.body.scale.set(1, angry ? 1.12 : 1, 1); // fur on end
    this.tail.forEach((t, k) => {
      t.rotation.x = angry ? 0.1 : sitting ? 0.5 : -0.3;
      t.rotation.z = Math.sin(this.time * (angry ? 9 : 1.5) - k * 0.5) * (angry ? 0.12 : 0.22);
    });
    for (const e of this.eyes) e.p.scale.x = angry ? 0.6 : 1.4 + Math.sin(this.time) * 0.2;
    const blink = (this.time % 5) < 0.12;
    for (const e of this.eyes) e.e.scale.y = blink ? 0.1 : 1;
  }
}
