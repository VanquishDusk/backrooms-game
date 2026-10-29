import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { Player } from './Player.js';
import { AudioEngine } from './AudioEngine.js';
import { createRng, randomSeedString } from './rng.js';
import { load, save } from './storage.js';
import { createSharedUniforms } from '../world/materials.js';
import { Hud } from '../ui/Hud.js';
import { Backpack } from './Backpack.js';
import { Camcorder } from './Camcorder.js';
import { Archive } from '../ui/Archive.js';
import { LEVELS, FIRST_LEVEL, UPCOMING } from '../levels/registry.js';

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
    this.stats = load('stats', { runs: 0, escapes: 0, deaths: 0, bestTime: null, remodels: 0, unlocked: [] });

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
      if (this.state === 'playing' && !this.input.touchMode && !this.backpack.open) this.pause();
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
    this.backpack = new Backpack(this);
    this.camcorder = new Camcorder(this);
    this.archive = new Archive(this);
    this.updateTouchUi();
    this.showRecords();
    this.showUnlocked();

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
    click('btn-restart', () => this.startRun(this.seed, this.runStartLevel));
    click('btn-newrun', () => this.startRun(randomSeedString()));
    click('btn-quit', () => this.quitToMenu());
    click('btn-dead-new', () => this.startRun(randomSeedString()));
    click('btn-dead-retry', () => this.startRun(this.seed, this.runStartLevel));
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
    input.bindButton($('btn-act'), { onPress: () => input.actions.push('fire') });
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
    if (st.remodels) parts.push(`SURVIVED 0.2 ×${st.remodels}`);
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
    this.levelSeed = seed;
    this.backpack.clearWorld();
    const game = this;
    const runId = this.runId;
    const ctx = {
      scene: this.scene,
      rng: createRng(`${id}:${seed}`),
      renderer: this.renderer.renderer,
      quality: () => this.renderer.quality,
      shared: this.shared,
      audio: this.audio,
      hud: this.hud,
      get touch() {
        return game.input.touchMode;
      },
      onDeath: (cause) => runId === this.runId && this.die(cause),
      onCaught: (stalker, cause) => runId === this.runId && this.caught(stalker, cause),
      onEscape: (target, style) => runId === this.runId && this.escape(target, style),
      placeItem: (item, x, z) => this.backpack.place(item, x, z),
      move: () => this.input.getMove(),
      moveIntent: () => {
        const m = this.input.getMove();
        return Math.hypot(m.x, m.y);
      },
      fade: (to, dur) => this.fade(to, dur),
      hurtFlash: (a) => this.hurtFlash(a),
      vibrate: (p) => navigator.vibrate && navigator.vibrate(p),
      isOver: () => runId !== this.runId || this.state !== 'playing',
    };
    this.level = this.levelDef.create(ctx);
    // Open-air levels see much further.
    this.camera.far = this.level.cameraFar || 90;
    this.camera.updateProjectionMatrix();
    const sp = this.level.spawn;
    this.player.reset(sp.x, sp.z, sp.yaw);
  }

  // A fresh run. `seed` names the whole run; each level visited derives its
  // own layout from it, so going back to Level 0 gives a new Level 0.
  startRun(seed, levelId = FIRST_LEVEL) {
    this.audio.unlock();
    this.input.lockPointer();
    this.runId++;
    this.seed = seed;
    this.runStartLevel = levelId;
    this.visit = 0;
    this.runTime = 0;
    this.stats.runs++;
    save('stats', this.stats);
    this.showScreen('loading');
    this.fade(0, 0);
    this.enterLevel(levelId, null);
  }

  // Load a level and start playing it, optionally carrying player stats over.
  enterLevel(levelId, carry) {
    this.state = 'loading';
    this.hud.show(false);
    $('glitch').classList.remove('on');
    $('flash').style.opacity = '0';
    const runId = this.runId;
    // Let the loading screen / fade paint before the (blocking) generation.
    setTimeout(() => {
      if (runId !== this.runId) return;
      const levelSeed = this.visit === 0 ? this.seed : `${this.seed}#${this.visit}`;
      this.loadLevel(levelId, levelSeed);
      this.player.restore(carry);
      this.stats.visits = this.stats.visits || {};
      this.stats.visits[levelId] = (this.stats.visits[levelId] || 0) + 1;
      if (levelId !== FIRST_LEVEL && !this.stats.unlocked.includes(levelId)) {
        this.stats.unlocked.push(levelId);
        this.showUnlocked();
      }
      save('stats', this.stats);
      this.state = 'playing';
      this.input.enabled = true;
      this.input.clear();
      this.input.sprintToggle = false;
      $('btn-run').classList.remove('on');
      $('btn-light').classList.toggle('on', this.player.flashlight);
      this.input.consumeActions();
      this.input.consumeLook();
      this.showScreen('none');
      this.hud.show(true);
      this.hud.clearMessage();
      this.updateTouchUi();
      this.audio.startAmbience();
      this.fade(1, 0);
      this.fade(0, 2.5);
      this.showLevelCard();

      if (levelId === FIRST_LEVEL) {
        if (carry) {
        } else {
          setTimeout(() => runId === this.runId && this.hud.message('Find a flickering wall. Throw yourself through it.', 5), 4200);
        }
      }
      const cover = this.level.hudInfo(this.player).coverLabel;
      $('cover-label').textContent = cover;
      this.hud.setHint(
        this.input.touchMode
          ? 'STICK: MOVE  ·  DRAG ANYWHERE: LOOK'
          : `WASD MOVE · SHIFT RUN · C ${cover} · F LIGHT · E DRINK · 1–4 USE · TAB BAG · V PHOTO · ESC PAUSE`,
        10,
      );
    }, 60);
  }

  showLevelCard() {
    const card = $('level-card');
    const def = this.levelDef;
    card.querySelector('.lc-name').textContent = def.name.toUpperCase();
    const own = this.level.card;
    card.querySelector('.lc-title').textContent = (own?.title || def.title).toUpperCase();
    card.querySelector('.lc-diff').textContent = own?.sub ?? (def.difficulty != null ? `SURVIVAL DIFFICULTY ${def.difficulty}` : '');
    card.classList.add('show');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => card.classList.remove('show'), 3200);
  }

  // The menu's archive of levels (tapes) refreshes with your unlocks and photos.
  showUnlocked() {
    this.archive.refresh();
  }

  hurtFlash(a) {
    const el = $('hurt');
    el.style.transition = 'none';
    el.style.opacity = String(a);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = '0';
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.backpack.close();
    this.state = 'paused';
    this.input.enabled = false;
    this.input.clear();
    this.input.unlockPointer();
    $('pause-info').textContent = `${this.levelDef.name.toUpperCase()} · SEED ${this.seed} · ${formatTime(this.runTime)}`;
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
    this.showUnlocked();
    this.loadLevel(FIRST_LEVEL, randomSeedString());
    this.showScreen('menu');
  }

  endRun() {
    this.backpack.close();
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
    $('dead-stats').textContent = `${this.levelDef.name.toUpperCase()} · SURVIVED ${formatTime(this.runTime)} · SEED ${this.seed}`;
    this.showScreen('dead');
  }

  caught(stalker, cause = 'Something found you between the corridors.') {
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
      setTimeout(() => runId === this.runId && this.die(cause), 400);
    }, 1200);
  }

  escape(target, style = 'noclip') {
    this.state = 'escaping';
    this.player.frozen = true;
    const door = style === 'door';
    const walk = style === 'walk';
    if (door) {
      this.audio.door();
      this.fade(1, 0.7);
    } else if (walk) {
      this.fade(1, 1.6);
    } else {
      this.audio.noclip();
      $('glitch').classList.add('on');
      navigator.vibrate && navigator.vibrate([30, 30, 30, 30, 80]);
      this.fade(1, 1.6);
    }
    const runId = this.runId;
    const time = this.runTime;
    const from = this.levelDef.id;
    setTimeout(() => {
      if (runId !== this.runId) return;
      $('glitch').classList.remove('on');
      if (LEVELS[target]) {
        if (from === 'level0_2') {
          this.stats.remodels = (this.stats.remodels || 0) + 1;
          save('stats', this.stats);
        }
        this.audio.stopAmbience();
        this.visit++;
        this.enterLevel(target, this.player.carry());
        return;
      }
      this.stats.escapes++;
      // Reaching a level that isn't built yet still counts: it unlocks in
      // the level select once it is.
      if (!this.stats.unlocked.includes(target)) this.stats.unlocked.push(target);
      const best = this.stats.bestTime == null || time < this.stats.bestTime;
      if (best) this.stats.bestTime = time;
      save('stats', this.stats);
      this.endRun();
      this.state = 'escaped';
      $('esc-title').textContent = walk ? 'YOU FOLLOWED THE PIPES' : door ? 'YOU WENT THROUGH THE DOOR' : 'YOU NOCLIPPED THROUGH';
      $('esc-next').textContent = `${UPCOMING[target] || target.toUpperCase()} · COMING SOON`;
      $('esc-stats').textContent = `ESCAPED IN ${formatTime(time)}${best ? ' · NEW BEST' : ''} · SEED ${this.seed}`;
      this.showScreen('escaped');
    }, door ? 900 : walk ? 1800 : 2000);
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
        if (a === 'pause') {
          if (this.backpack.open) this.backpack.toggle(false);
          else this.pause();
        }
        if (a === 'bag') this.backpack.toggle(!this.backpack.open);
        if (a === 'photo') this.camcorder.request();
        if (a.startsWith('use')) this.backpack.use(Number(a.slice(3)));
        if (a.startsWith('drop')) this.backpack.drop(Number(a.slice(4)));
        if (a === 'flashlight') {
          if (level.noLight) {
            player.flashlight = false;
            this.audio.click();
            this.hud.message('The flashlight clicks. Nothing comes out.', 1.8);
          } else if (player.battery > 3) {
            player.flashlight = !player.flashlight;
            this.audio.click();
            $('btn-light').classList.toggle('on', player.flashlight);
          } else {
            this.hud.message('The battery is dead.', 1.5);
          }
        }
        if (a === 'drink') level.drink(player);
        if (a === 'fire') level.fire?.(player);
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
      $('btn-ears').classList.toggle('alert', !!level.hudInfo(player).warn && !player.coveringEars);
      level.update(dt, player);
      this.camcorder.update(dt);
      if (this.state === 'playing') this.backpack.update(dt);
      else this.backpack.close();
      this.runTime += dt;
      this.adaptQuality(dt);
    } else if (this.state === 'dying' || this.state === 'escaping') {
      player.update(dt, input, level.world, this.settings);
      if (this.state === 'escaping') {
        // Keep drifting forward.
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
    const fov = this.settings.fov * (atm.fovMul || 1);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const post = this.renderer.post.uniforms;
    post.warp.value = atm.warp;
    post.aberr.value = atm.aberr;
    post.grain.value = atm.grain;
    post.invert.value = atm.invert || 0;
    post.mono.value = atm.mono || 0;
    post.flip.value = atm.flip || 0;
    post.glitch.value = atm.glitch || 0;
    post.soften.value = atm.soften || 0;
    this.renderer.forcePost = !!(atm.invert || atm.flip);
    document.body.classList.toggle('inverted', !!atm.invert && this.state !== 'menu');

    player.applyCamera(this.camera);
    if (atm.roll) this.camera.rotation.z += atm.roll;
    let shake = (atm.shake || 0) * 0.006 + this.shake * 0.02;
    this.shake = Math.max(0, this.shake - dt * 4);
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
      const info = level.hudInfo(player);
      this.hud.update(dt, player, this.runTime, info, this.settings.showFps);
      // Context buttons: what the ears button does here, and an action button when there is one.
      if (info.coverLabel !== this.coverLabel) {
        this.coverLabel = info.coverLabel;
        $('cover-label').textContent = info.coverLabel;
      }
      if ((info.act || '') !== this.actLabel) {
        this.actLabel = info.act || '';
        $('btn-act').classList.toggle('hidden', !info.act);
        $('act-label').textContent = this.actLabel;
      }
    }

    this.renderer.render(this.scene, this.camera, this.time);
    this.camcorder.afterRender(this.renderer.canvas);
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
