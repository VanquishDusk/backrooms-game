import * as THREE from 'three';
import { ITEMS, BACKPACK_SLOTS } from './items.js';
import { MAX_DYN_LIGHTS } from '../world/materials.js';
import { glowTexture } from '../world/fixtures.js';

const $ = (id) => document.getElementById(id);

// The backpack: four slots, a strip on the HUD, a panel you can open (Tab,
// or tap the strip), quick-use keys and touch buttons. Also owns what's
// lying on the floor (items levels place, items you drop) and the weapons
// in your hands: the lead pipe swing and the burning flare.

const PIPE = { range: 2.6, arc: 0.4, stun: 4.5, hitAt: 0.14, time: 0.45 };
const FLARE = { range: 9, stun: 7, burn: 9, nearRange: 3.5, nearStun: 1.2 };

export class Backpack {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.floor = [];
    this.swing = null;
    this.flare = null;
    this.fullAt = -99;
    this.sig = '';
    this.group = new THREE.Group();
    game.scene.add(this.group);
    // Things in your hands hang off the camera.
    game.scene.add(game.camera);
    this.view = new THREE.Group();
    game.camera.add(this.view);
    this.buildViewModels();
    this.buildFloorModels();
    this.bindUi();
    game.player.onFull = () => this.full();
  }

  get player() {
    return this.game.player;
  }

  // ---- UI ------------------------------------------------------------------------

  bindUi() {
    const g = this.game;
    this.panel = $('backpack');
    this.strip = $('bag');
    const tap = (el, fn) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    tap(this.strip, () => g.state === 'playing' && this.toggle(!this.open));
    tap($('bp-close'), () => this.toggle(false));
    for (const el of this.panel.querySelectorAll('.bp-slot')) {
      const k = Number(el.dataset.slot);
      tap(el.querySelector('.bp-use'), () => this.use(k));
      tap(el.querySelector('.bp-drop'), () => this.drop(k));
    }
    for (let k = 0; k < BACKPACK_SLOTS; k++) g.input.bindButton($(`btn-slot${k}`), { onPress: () => g.input.actions.push(`use${k}`) });
  }

  toggle(on, keepUnlocked = false) {
    const g = this.game;
    if (on && g.state !== 'playing') return;
    if (on === this.open) return;
    this.open = on;
    this.panel.classList.toggle('hidden', !on);
    this.sig = '';
    this.render();
    if (g.input.touchMode) return;
    // The cursor comes back while the bag is open, so you can click.
    if (on) g.input.unlockPointer();
    else if (!keepUnlocked && g.state === 'playing') g.input.lockPointer();
  }

  close() {
    this.toggle(false, true);
  }

  // Redraw the HUD strip, the touch buttons and the panel when the contents change.
  render() {
    const items = this.player.items;
    const sig = JSON.stringify(items) + this.open + this.game.input.touchMode;
    if (sig === this.sig) return;
    this.sig = sig;
    for (let k = 0; k < BACKPACK_SLOTS; k++) {
      const it = items[k];
      const def = it && ITEMS[it.id];
      const chip = $(`bag-slot${k}`);
      chip.innerHTML = def ? `${def.icon}<span>${def.short}</span>` : '<span class="empty">EMPTY</span>';
      chip.classList.toggle('full', !!def);
      const btn = $(`btn-slot${k}`);
      btn.innerHTML = def ? `${def.icon}<span>${def.short}</span>` : `<span>${k + 1}</span>`;
      btn.classList.toggle('disabled', !def);
      const slot = this.panel.querySelector(`.bp-slot[data-slot="${k}"]`);
      slot.querySelector('.bp-icon').innerHTML = def ? def.icon : '';
      slot.querySelector('.bp-name').textContent = def ? `${k + 1}. ${def.name}` : `${k + 1}. EMPTY`;
      slot.querySelector('.bp-desc').textContent = def ? def.desc + (it.uses != null ? ` (${it.uses} ${it.uses === 1 ? 'HIT' : 'HITS'} LEFT)` : '') : 'Nothing here.';
      slot.classList.toggle('empty', !def);
    }
    $('bp-count').textContent = `${items.length}/${BACKPACK_SLOTS}`;
    $('drink-count').textContent = this.player.bottles;
    $('bp-help').textContent = this.game.input.touchMode
      ? 'TAP A SLOT BUTTON TO USE IT'
      : '1–4  USE  ·  SHIFT + 1–4  DROP  ·  TAB  CLOSE';
    $('bag-key').textContent = this.game.input.touchMode ? 'TAP' : 'TAB';
  }

  full() {
    const t = this.game.time;
    if (t - this.fullAt < 3) return;
    this.fullAt = t;
    this.game.hud.message(`Your backpack is full (${BACKPACK_SLOTS}/${BACKPACK_SLOTS}). Use or drop something first.`, 2.5);
  }

  // ---- Using things ---------------------------------------------------------------

  use(k) {
    const g = this.game, p = this.player, hud = g.hud, audio = g.audio;
    if (g.state !== 'playing') return;
    const it = p.items[k];
    if (!it) {
      hud.message(`Slot ${k + 1} is empty.`, 1.2);
      return;
    }
    const remove = () => p.items.splice(p.items.indexOf(it), 1);
    switch (it.id) {
      case 'water':
        // The level decides what Almond Water does here.
        p.items.splice(k, 1);
        p.items.unshift(it);
        g.level.drink(p);
        break;
      case 'battery':
        if (p.battery >= 99) {
          hud.message('The flashlight is already charged.', 1.5);
          return;
        }
        remove();
        p.battery = 100;
        audio.click();
        hud.message('Fresh batteries. The flashlight is full again.', 2);
        break;
      case 'medkit':
        if (p.health >= 99) {
          hud.message('You aren\'t hurt.', 1.5);
          return;
        }
        remove();
        p.health = Math.min(100, p.health + 45);
        audio.pickup();
        hud.message('You patch yourself up.', 2);
        break;
      case 'meat':
        remove();
        p.health = Math.min(100, p.health + 12);
        audio.drink();
        hud.message('You eat the meat. It tastes of nothing at all.', 2.5);
        break;
      case 'pipe':
        if (this.swing) return;
        this.swing = { t: 0, item: it, checked: false };
        audio.swing(0.35);
        break;
      case 'flare':
        if (g.level.noLight) {
          audio.click();
          hud.message('You strike the flare. It sputters and won\'t catch.', 2);
          return;
        }
        if (this.flare) {
          hud.message('A flare is already burning.', 1.5);
          return;
        }
        remove();
        this.light();
        break;
    }
    this.render();
  }

  drop(k) {
    const g = this.game, p = this.player;
    if (g.state !== 'playing') return;
    const it = p.items[k];
    if (!it) return;
    p.items.splice(k, 1);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const pos = { x: p.pos.x + fx * 0.7, z: p.pos.z + fz * 0.7 };
    g.level.world?.collide?.(pos, 0.2);
    this.place(it.id, pos.x, pos.z, it, false);
    g.audio.thud(0, 0.12);
    g.hud.message(`You leave the ${ITEMS[it.id].name.toLowerCase()} on the floor.`, 2);
    this.render();
  }

  // Stun whatever the level has in range. Returns how many were hit.
  stunAll(x, z, opts) {
    const L = this.game.level;
    let n = 0;
    if (L.entities?.stunNear) n += L.entities.stunNear(x, z, opts).length;
    if (L.stun) n += L.stun(x, z, opts) || 0;
    return n;
  }

  light() {
    const g = this.game, p = this.player;
    this.flare = { t: 0, next: 0.5 };
    g.audio.hiss(0, 0.35);
    g.audio.sizzle(0.3);
    const n = this.stunAll(p.pos.x, p.pos.z, { range: FLARE.range, seconds: FLARE.stun });
    g.hud.message(n ? 'The flare spits red light. Whatever was close reels away from it.' : 'The flare spits red light.', 2.5);
    const el = $('flash');
    el.style.transition = 'none';
    el.style.background = 'rgba(255, 70, 40, 0.5)';
    el.style.opacity = '1';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.9s';
      el.style.opacity = '0';
      setTimeout(() => (el.style.background = ''), 950);
    });
  }

  // ---- Per frame ------------------------------------------------------------------

  update(dt) {
    const g = this.game, p = this.player;
    this.render();
    // Things on the floor.
    for (const f of this.floor) {
      const d = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
      if (!f.armed) {
        if (d > 1.6) f.armed = true;
        continue;
      }
      if (d > 0.9) continue;
      if (!p.give(f.id, f.item)) continue;
      f.taken = true;
      this.group.remove(f.obj);
      g.audio.pickup();
      g.hud.message(`${ITEMS[f.id].name}. Into the backpack.`, 2);
    }
    if (this.floor.some((f) => f.taken)) this.floor = this.floor.filter((f) => !f.taken);
    for (const f of this.floor) f.obj.visible = Math.hypot(f.x - p.pos.x, f.z - p.pos.z) < 30;

    // The pipe.
    const s = this.swing;
    this.pipe.visible = !!s;
    if (s) {
      s.t += dt;
      const k = Math.min(1, s.t / PIPE.time);
      const e = k < 0.3 ? -0.2 * (k / 0.3) : (k - 0.3) / 0.7;
      this.pipe.rotation.set(-0.5 + e * 0.4, 0.2, -1.0 + Math.max(0, e) * 2.4 + Math.min(0, e));
      this.pipe.position.set(0.26 - Math.max(0, e) * 0.3, -0.3 + Math.sin(k * Math.PI) * 0.06, -0.5);
      if (!s.checked && s.t >= PIPE.hitAt) {
        s.checked = true;
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const n = this.stunAll(p.pos.x, p.pos.z, { range: PIPE.range, seconds: PIPE.stun, fx, fz, arc: PIPE.arc });
        if (n) {
          g.audio.impact(0.5);
          g.shake = Math.max(g.shake || 0, 0.6);
          s.item.uses--;
          if (s.item.uses <= 0) {
            const i = p.items.indexOf(s.item);
            if (i >= 0) p.items.splice(i, 1);
            g.hud.message('It connects, and the pipe bends double. You let it go.', 2.5);
          } else {
            g.hud.message('It connects. It reels.', 1.5);
          }
        }
      }
      if (s.t >= PIPE.time) this.swing = null;
    }

    // The flare.
    const fl = this.flare;
    this.flareModel.visible = !!fl;
    const dyn = g.shared.dynPos.value[MAX_DYN_LIGHTS - 1];
    if (fl) {
      fl.t += dt;
      fl.next -= dt;
      if (fl.next <= 0) {
        fl.next = 0.5;
        this.stunAll(p.pos.x, p.pos.z, { range: FLARE.nearRange, seconds: FLARE.nearStun });
        g.audio.sizzle(0.12);
      }
      const flick = 0.75 + 0.25 * Math.sin(fl.t * 31) * Math.sin(fl.t * 13.7);
      const fade = Math.min(1, (FLARE.burn - fl.t) / 1.5);
      this.flareGlow.scale.setScalar((0.16 + flick * 0.06) * fade);
      const cam = g.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      dyn.set(cam.position.x + fwd.x * 0.6, cam.position.y - 0.4, cam.position.z + fwd.z * 0.6, 1.7 * flick * fade);
      g.shared.dynCol.value[MAX_DYN_LIGHTS - 1].setRGB(1, 0.3, 0.16);
      if (fl.t >= FLARE.burn) {
        this.flare = null;
        dyn.set(0, -100, 0, 0);
        g.hud.message('The flare gutters out.', 1.5);
      }
    }

    // Hands and props take the light around you.
    if (this.pipe.visible || this.flareModel.visible) {
      const l = g.level.world?.sampleLight?.(p.pos.x, p.pos.z) || [0.3, 0.3, 0.3];
      const k = Math.min(1.0, 0.12 + (l[0] + l[1] + l[2]) / 3 * 1.1 + (p.flashlight ? 0.3 : 0) + (fl ? 0.35 : 0));
      for (const m of this.viewMats) m.color.copy(m.userData.base).multiplyScalar(k);
    }
  }

  // ---- Items on the floor ---------------------------------------------------------

  // Put an item down in the world (levels place them; you drop them).
  place(id, x, z, item = null, armed = true) {
    const obj = new THREE.Group();
    const model = this.floorModels[id].clone();
    model.rotation.y = Math.random() * Math.PI * 2;
    obj.add(model);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(0.5);
    glow.position.y = 0.12;
    obj.add(glow);
    obj.position.set(x, 0, z);
    this.group.add(obj);
    this.floor.push({ id, x, z, item, obj, armed });
  }

  // A new level: clear the floor, put the weapons away.
  clearWorld() {
    for (const f of this.floor) this.group.remove(f.obj);
    this.floor = [];
    this.swing = null;
    if (this.flare) {
      this.flare = null;
      this.game.shared.dynPos.value[MAX_DYN_LIGHTS - 1].set(0, -100, 0, 0);
    }
    this.close();
  }

  // ---- Models ---------------------------------------------------------------------

  buildViewModels() {
    const mat = (hex) => {
      const m = new THREE.MeshBasicMaterial({ color: hex, depthTest: false, fog: false });
      m.userData.base = new THREE.Color(hex);
      return m;
    };
    const metal = mat(0x5e605c), grip = mat(0x241e1c), red = mat(0x8a1812), cap = mat(0x222222);
    this.viewMats = [metal, grip, red, cap];
    // Lead pipe: held low on the right, swung across.
    this.pipe = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), metal);
    shaft.position.y = 0.26;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), grip);
    handle.position.y = -0.02;
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), metal);
    joint.position.y = 0.55;
    this.pipe.add(shaft, handle, joint);
    // Flare: in the left hand, burning at the tip.
    this.flareModel = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), red);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), cap);
    end.position.y = -0.12;
    this.flareGlowTex = glowTexture();
    this.flareGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flareGlowTex, color: 0xff5a30, depthTest: false, blending: THREE.AdditiveBlending, transparent: true, fog: false }));
    this.flareGlow.position.y = 0.13;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd0a0, depthTest: false, fog: false }));
    core.position.y = 0.12;
    this.flareModel.add(stick, end, this.flareGlow, core);
    this.flareModel.position.set(-0.24, -0.26, -0.5);
    this.flareModel.rotation.set(0.3, 0, 0.35);
    for (const g of [this.pipe, this.flareModel]) {
      g.visible = false;
      g.traverse((o) => (o.renderOrder = 999));
      this.view.add(g);
    }
  }

  buildFloorModels() {
    const mat = (hex) => new THREE.MeshBasicMaterial({ color: hex });
    const M = (geo, m, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, 0, rz);
      return o;
    };
    const group = (...parts) => {
      const g = new THREE.Group();
      g.add(...parts);
      return g;
    };
    const cyl = (r, h, s = 8) => new THREE.CylinderGeometry(r, r, h, s);
    const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    this.floorModels = {
      water: group(M(cyl(0.045, 0.2), mat(0xc8c0a0), 0, 0.1), M(cyl(0.02, 0.04), mat(0x3a5a8a), 0, 0.22)),
      battery: group(M(box(0.14, 0.06, 0.09), mat(0x2a2a2a), 0, 0.03), M(box(0.08, 0.062, 0.092), mat(0xc8a020), 0.03, 0.03)),
      medkit: group(M(box(0.28, 0.1, 0.2), mat(0xe8e4dc), 0, 0.05), M(box(0.12, 0.102, 0.035), mat(0xb01818), 0, 0.05), M(box(0.035, 0.102, 0.12), mat(0xb01818), 0, 0.05)),
      meat: group(M(new THREE.SphereGeometry(0.1, 8, 6), mat(0x8a3a28), 0, 0.05), M(box(0.24, 0.01, 0.24), mat(0xe8e4d8), 0, 0.005)),
      pipe: group(M(cyl(0.028, 0.72), mat(0x7a7c78), 0, 0.03, 0, Math.PI / 2), M(cyl(0.045, 0.08), mat(0x7a7c78), 0.33, 0.045, 0, Math.PI / 2)),
      flare: group(M(cyl(0.02, 0.26), mat(0xb02018), 0, 0.02, 0, Math.PI / 2), M(cyl(0.021, 0.04), mat(0x2a2a2a), 0.14, 0.02, 0, Math.PI / 2)),
    };
    this.floorGlowTex = glowTexture();
    this.glowMat = new THREE.SpriteMaterial({ map: this.floorGlowTex, color: 0x6a5a30, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  }
}
