import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { Player } from './Player.js';
import { AudioEngine } from './AudioEngine.js';
import { createRng, randomSeedString } from './rng.js';
import { load, save } from './storage.js';
import { createSharedUniforms } from '../world/materials.js';
import { Hud } from '../ui/Hud.js';
import { LEVELS, FIRST_LEVEL } from '../levels/registry.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_SETTINGS = {
  lookSens: 1,
  touchSens: 1,
  fov: 75,
  volume: 0.8,
  quality: 'auto',
  invertY: false,
  showFps: false,
};

const BATTERY_DRAIN = 1.1;
const BATTERY_RECHARGE = 0.45;

export class Game {
  constructor() {
    this.settings = load('settings', DEFAULT_SETTINGS);
    this.stats = load('stats', { runs: 0, escapes: 0, deaths: 0, bestTime: null });

    this.renderer = new Renderer($('game'));
    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x807648, 0.032);
    this.scene.fog = this.fog;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 90);
    this.shared = createSharedUniforms(this.fog);

    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume);
    this.hud = new Hud();
    this.player = new Player();
    this.input = new Input({
      canvas: this.renderer.canvas,
      touchLayer: $('touch-layer'),
      joyBase: $('joy-base'),
      joyKnob: $('joy-knob'),
      settings: this.settings,
    });
    this.input.onTouchMode = () => this.updateTouchUi();
    this.input.onUnlock = () => {
      if (this.state === 'playing' && !this.input.touchMode) this.pause();
    };

    this.state = 'menu';
    this.level = null;
    this.levelDef = null;
    this.seed = null;
    this.runTime = 0;
    this.runId = 0;
    this.shake = 0;
    this.last = performance.now();
    this.time = 0;
    this.lowFpsTime = 0;
    this.noTouchMoveTime = 0;

    this.applyQuality();
    this.bindUi();
    this.updateTouchUi();
    this.showRecords();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    // A random layout drifts behind the main menu.
    this.loadLevel(FIRST_LEVEL, randomSeedString());
    this.showScreen('menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- Screens & UI ------------------------------------------------------

  showScreen(name) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === `screen-${name}`);
    document.body.classList.toggle('in-menu', name === 'menu');
    this.screen = name;
  }

  bindUi() {
    const click = (id, fn) =>
      $(id).addEventListener('click', (e) => {
        e.preventDefault();
        this.audio.unlock();
        this.audio.click();
        fn();
      });

    click('btn-start', () => this.startRun(randomSeedString()));
    click('btn-seed', () => {
      const s = $('seed-input').value.trim().toUpperCase();
      this.startRun(s || randomSeedString());
    });
    $('seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('btn-seed').click();
    });
    click('btn-howto', () => {
      this.returnTo = 'menu';
      this.showScreen('howto');
    });
    click('btn-settings', () => {
      this.returnTo = 'menu';
      this.showScreen('settings');
    });
    click('btn-pause-settings', () => {
      this.returnTo = 'pause';
      this.showScreen('settings');
    });
    for (const b of document.querySelectorAll('[data-back]')) {
      b.addEventListener('click', () => {
        this.audio.click();
        this.showScreen(this.returnTo || 'menu');
      });
    }
    const fsBtn = $('btn-fullscreen');
    const canFs = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    if (!canFs) fsBtn.classList.add('hidden');
    click('btn-fullscreen', () => this.toggleFullscreen());

    click('btn-resume', () => this.resume());
    click('btn-restart', () => this.startRun(this.seed));
    click('btn-newrun', () => this.startRun(randomSeedString()));
    click('btn-quit', () => this.quitToMenu());
    click('btn-dead-new', () => this.startRun(randomSeedString()));
    click('btn-dead-retry', () => this.startRun(this.seed));
    click('btn-dead-menu', () => this.quitToMenu());
    click('btn-esc-new', () => this.startRun(randomSeedString()));
    click('btn-esc-menu', () => this.quitToMenu());

    // Touch buttons.
    const input = this.input;
    input.bindButton($('btn-run'), {
      onPress: () => {
        input.sprintToggle = !input.sprintToggle;
        $('btn-run').classList.toggle('on', input.sprintToggle);
      },
    });
    input.bindButton($('btn-light'), { onPress: () => input.actions.push('flashlight') });
    input.bindButton($('btn-drink'), { onPress: () => input.actions.push('drink') });
    input.bindButton($('btn-ears'), {
      onPress: () => (input.earsHeld = true),
      onRelease: () => (input.earsHeld = false),
    });
    const pauseBtn = $('btn-pause');
    pauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.state === 'playing') this.pause();
    });
    pauseBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.state === 'playing') this.pause();
    });

    // Settings.
    const s = this.settings;
    const slider = (id, key, fmt, apply) => {
      const el = $(`set-${id}`), out = $(`out-${id}`);
      el.value = s[key];
      out.textContent = fmt(s[key]);
      el.addEventListener('input', () => {
        s[key] = parseFloat(el.value);
        out.textContent = fmt(s[key]);
        if (apply) apply();
        save('settings', s);
      });
    };
    slider('look', 'lookSens', (v) => v.toFixed(2));
    slider('touch', 'touchSens', (v) => v.toFixed(2));
    slider('fov', 'fov', (v) => `${v}°`, () => {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    });
    slider('volume', 'volume', (v) => `${Math.round(v * 100)}%`, () => this.audio.setVolume(s.volume));
    const q = $('set-quality');
    q.value = s.quality;
    q.addEventListener('change', () => {
      s.quality = q.value;
      this.applyQuality();
      save('settings', s);
    });
    for (const [id, key] of [['set-invert', 'invertY'], ['set-fps', 'showFps']]) {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => {
        s[key] = el.checked;
        save('settings', s);
      });
    }
  }

  updateTouchUi() {
    const playing = this.state === 'playing';
    const touch = this.input.touchMode;
    $('touch-layer').classList.toggle('hidden', !(playing && touch));
    $('touch-buttons').classList.toggle('hidden', !(playing && touch));
    $('crosshair').classList.toggle('hidden', touch);
    if (this.settings.quality === 'auto') this.applyQuality();
  }

  applyQuality() {
    let q = this.settings.quality;
    if (q === 'auto') {
      const coarse = this.input?.touchMode || window.matchMedia('(pointer: coarse)').matches;
      q = this.autoQuality || (coarse ? 'medium' : 'high');
    }
    if (this.renderer.quality !== q) this.renderer.setQuality(q);
  }

  toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.then) {
      p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  }

  showRecords() {
    const st = this.stats;
    const parts = [];
    if (st.runs) parts.push(`WANDERED ${st.runs}`);
    if (st.escapes) parts.push(`ESCAPED ${st.escapes}`);
    if (st.bestTime != null) parts.push(`BEST ${formatTime(st.bestTime)}`);
    $('records').textContent = parts.join(' · ');
  }

  onResize() {
    this.renderer.resize();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---- Run lifecycle -----------------------------------------------------

  loadLevel(id, seed) {
    if (this.level) {
      this.level.disposed = true;
      this.level.dispose();
    }
    this.levelDef = LEVELS[id];
    this.seed = seed;
    const game = this;
    const runId = this.runId;
    const ctx = {
      scene: this.scene,
      rng: createRng(`${id}:${seed}`),
      renderer: this.renderer.renderer,
      shared: this.shared,
      audio: this.audio,
      hud: this.hud,
      get touch() {
        return game.input.touchMode;
      },
      onDeath: (cause) => runId === this.runId && this.die(cause),
      onCaught: (stalker) => runId === this.runId && this.caught(stalker),
      onEscape: (target) => runId === this.runId && this.escape(target),
      fade: (to, dur) => this.fade(to, dur),
      vibrate: (p) => navigator.vibrate && navigator.vibrate(p),
      isOver: () => runId !== this.runId || this.state !== 'playing',
    };
    this.level = this.levelDef.create(ctx);
    const sp = this.level.spawn;
    this.player.reset(sp.x, sp.z, sp.yaw);
    $('menu-level').textContent = `${this.levelDef.name.toUpperCase()} — ${this.levelDef.title.toUpperCase()}`;
  }

  startRun(seed, levelId = FIRST_LEVEL) {
    this.audio.unlock();
    this.input.lockPointer();
    this.runId++;
    this.state = 'loading';
    this.showScreen('loading');
    this.hud.show(false);
    this.fade(0, 0);
    $('glitch').classList.remove('on');
    $('flash').style.opacity = '0';
    // Let the loading screen paint before the (blocking) generation.
    setTimeout(() => {
      this.loadLevel(levelId, seed);
      this.runTime = 0;
      this.stats.runs++;
      save('stats', this.stats);
      this.state = 'playing';
      this.input.enabled = true;
      this.input.clear();
      this.input.sprintToggle = false;
      $('btn-run').classList.remove('on');
      this.input.consumeActions();
      this.input.consumeLook();
      this.showScreen('none');
      this.hud.show(true);
      this.updateTouchUi();
      this.audio.startAmbience();
      this.fade(1, 0);
      this.fade(0, 2.5);
      const runId = this.runId;
      this.hud.message('You noclipped out of reality.', 3.5);
      setTimeout(() => runId === this.runId && this.hud.message('Find a flickering wall. Throw yourself through it.', 5), 4200);
      this.hud.setHint(
        this.input.touchMode
          ? 'LEFT SIDE: MOVE  ·  RIGHT SIDE: LOOK'
          : 'WASD MOVE · SHIFT RUN · C EARS · F LIGHT · E DRINK · ESC PAUSE',
        10,
      );
    }, 60);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.clear();
    this.input.unlockPointer();
    $('pause-info').textContent = `SEED ${this.seed} · ${formatTime(this.runTime)}`;
    this.showScreen('pause');
    this.updateTouchUi();
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.unlock();
    this.input.lockPointer();
    this.state = 'playing';
    this.input.enabled = true;
    this.input.consumeActions();
    this.showScreen('none');
    this.updateTouchUi();
    this.last = performance.now();
  }

  quitToMenu() {
    this.runId++;
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlockPointer();
    this.audio.stopAmbience();
    if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
    this.hud.show(false);
    this.fade(0, 0.5);
    $('glitch').classList.remove('on');
    this.updateTouchUi();
    this.showRecords();
    this.loadLevel(FIRST_LEVEL, randomSeedString());
    this.showScreen('menu');
  }

  endRun() {
    this.input.enabled = false;
    this.input.clear();
    this.input.unlockPointer();
    this.audio.stopAmbience();
    this.hud.show(false);
    this.updateTouchUi();
  }

  die(cause) {
    if (this.state !== 'playing' && this.state !== 'dying') return;
    this.state = 'dead';
    this.player.dead = true;
    this.stats.deaths++;
    save('stats', this.stats);
    this.endRun();
    this.fade(0.6, 0.4);
    $('dead-cause').textContent = cause;
    $('dead-stats').textContent = `SURVIVED ${formatTime(this.runTime)} · SEED ${this.seed}`;
    this.showScreen('dead');
  }

  caught(stalker) {
    this.state = 'dying';
    this.player.frozen = true;
    this.dyingStalker = stalker;
    this.dyingTime = 0;
    this.input.enabled = false;
    this.hud.show(false);
    $('touch-layer').classList.add('hidden');
    $('touch-buttons').classList.add('hidden');
    this.audio.jumpscare();
    navigator.vibrate && navigator.vibrate([200, 50, 300]);
    const flash = $('flash');
    flash.style.transition = 'none';
    flash.style.opacity = '0.6';
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity 0.5s';
      flash.style.opacity = '0';
    });
    const runId = this.runId;
    setTimeout(() => {
      if (runId !== this.runId) return;
      this.fade(1, 0.05);
      setTimeout(() => runId === this.runId && this.die('Something found you between the corridors.'), 400);
    }, 1200);
  }

  escape(target) {
    this.state = 'escaping';
    this.player.frozen = true;
    this.audio.noclip();
    $('glitch').classList.add('on');
    navigator.vibrate && navigator.vibrate([30, 30, 30, 30, 80]);
    this.fade(1, 1.6);
    const runId = this.runId;
    const time = this.runTime;
    setTimeout(() => {
      if (runId !== this.runId) return;
      $('glitch').classList.remove('on');
      if (LEVELS[target]) {
        this.startRun(this.seed, target);
        return;
      }
      this.stats.escapes++;
      const best = this.stats.bestTime == null || time < this.stats.bestTime;
      if (best) this.stats.bestTime = time;
      save('stats', this.stats);
      this.endRun();
      this.state = 'escaped';
      $('esc-next').textContent = 'LEVEL 1 — HABITABLE ZONE · COMING SOON';
      $('esc-stats').textContent = `ESCAPED IN ${formatTime(time)}${best ? ' · NEW BEST' : ''} · SEED ${this.seed}`;
      this.showScreen('escaped');
    }, 2000);
  }

  fade(to, seconds) {
    const el = $('fade');
    el.style.transition = seconds > 0 ? `opacity ${seconds}s` : 'none';
    el.style.opacity = String(to);
  }

  // ---- Frame -------------------------------------------------------------

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.state === 'paused' || this.state === 'loading') return;
    this.time += dt;
    const { player, level, input } = this;

    if (this.state === 'playing') {
      for (const a of input.consumeActions()) {
        if (a === 'pause') this.pause();
        if (a === 'flashlight') {
          if (player.battery > 3) {
            player.flashlight = !player.flashlight;
            this.audio.click();
            $('btn-light').classList.toggle('on', player.flashlight);
          } else {
            this.hud.message('The battery is dead.', 1.5);
          }
        }
        if (a === 'drink') level.drink(player);
      }
      if (this.state !== 'playing') return;

      // Release the touch run toggle once the stick has been let go.
      if (input.touchMode && input.sprintToggle && input.joy.id === null) {
        this.noTouchMoveTime += dt;
        if (this.noTouchMoveTime > 0.4) {
          input.sprintToggle = false;
          $('btn-run').classList.remove('on');
        }
      } else {
        this.noTouchMoveTime = 0;
      }

      for (const ev of player.update(dt, input, level.world, this.settings)) {
        if (ev === 'step' || ev === 'step-run') this.audio.step(ev === 'step-run');
        if (ev === 'exhausted') this.hud.message('Out of breath.', 1.5);
      }
      if (player.flashlight) {
        player.battery = Math.max(0, player.battery - BATTERY_DRAIN * dt);
        if (player.battery <= 0) {
          player.flashlight = false;
          $('btn-light').classList.remove('on');
          this.hud.message('The flashlight dies.', 2);
        }
      } else {
        player.battery = Math.min(100, player.battery + BATTERY_RECHARGE * dt);
      }
      $('btn-ears').classList.toggle('alert', !!level.hudInfo(player).ears && !player.coveringEars);
      level.update(dt, player);
      this.runTime += dt;
      this.adaptQuality(dt);
    } else if (this.state === 'dying' || this.state === 'escaping') {
      player.update(dt, input, level.world, this.settings);
      if (this.state === 'escaping') {
        // Keep drifting into the wall.
        player.pos.x -= Math.sin(player.yaw) * dt * 0.8;
        player.pos.z -= Math.cos(player.yaw) * dt * 0.8;
      }
    } else if (this.state === 'menu') {
      player.yaw += dt * 0.06;
      player.pitch = Math.sin(this.time * 0.2) * 0.05;
    }

    // Atmosphere.
    const atm = level.atmosphere(dt, player);
    this.fog.color.copy(atm.fogColor);
    this.fog.density = atm.fogDensity;
    this.renderer.renderer.setClearColor(atm.fogColor);
    const post = this.renderer.post.uniforms;
    post.warp.value = atm.warp;
    post.aberr.value = atm.aberr;
    post.grain.value = atm.grain;

    player.applyCamera(this.camera);
    let shake = atm.shake * 0.006;
    if (this.state === 'dying') {
      shake = 0.03;
      this.dyingTime += dt;
      const st = this.dyingStalker;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      st.mesh.position.set(this.camera.position.x + fwd.x * 0.75, this.camera.position.y - 2.05, this.camera.position.z + fwd.z * 0.75);
      st.mesh.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
      st.setOpacity(1);
      post.aberr.value = 4;
      post.warp.value = 2;
    }
    if (shake > 0) {
      this.camera.rotation.x += (Math.random() - 0.5) * shake;
      this.camera.rotation.y += (Math.random() - 0.5) * shake;
    }

    const sh = this.shared;
    sh.time.value = this.time;
    sh.flPos.value.copy(this.camera.position);
    sh.flPos.value.y -= 0.15;
    this.camera.getWorldDirection(sh.flDir.value);
    sh.flOn.value += ((player.flashlight ? 1 : 0) - sh.flOn.value) * Math.min(1, dt * 20);

    if (this.state === 'playing' || this.state === 'dying') {
      this.audio.update(level.audioMix(player));
      this.hud.update(dt, player, this.runTime, level.hudInfo(player), this.settings.showFps);
    }

    this.renderer.render(this.scene, this.camera, this.time);
  }

  // On "auto", step graphics down if the device can't keep up.
  adaptQuality(dt) {
    if (this.settings.quality !== 'auto') return;
    const fps = 1 / Math.max(dt, 1e-3);
    this.lowFpsTime = fps < 28 ? this.lowFpsTime + dt : Math.max(0, this.lowFpsTime - dt * 0.5);
    if (this.lowFpsTime > 4 && this.renderer.quality !== 'low') {
      this.autoQuality = this.renderer.quality === 'high' ? 'medium' : 'low';
      this.lowFpsTime = 0;
      this.applyQuality();
    }
  }
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
