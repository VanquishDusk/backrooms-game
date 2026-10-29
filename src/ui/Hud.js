const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.msg = $('msg');
    this.recTime = $('rec-time');
    this.fps = $('fps');
    this.hint = $('controls-hint');
    this.ears = $('ears-warning');
    this.bars = {
      sanity: $('stat-sanity'),
      stamina: $('stat-stamina'),
      battery: $('stat-battery'),
      health: $('stat-health'),
      breath: $('stat-breath'),
      warmth: $('stat-warmth'),
      hull: $('stat-hull'),
    };
    this.boss = $('boss');
    this.bossFill = this.boss.querySelector('.fill');
    this.bossName = this.boss.querySelector('label');
    this.last = {};
    this.msgTimer = 0;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  message(text, seconds = 3) {
    this.msg.textContent = text;
    this.msg.classList.add('show');
    this.msgTimer = seconds;
  }

  clearMessage() {
    this.msgTimer = 0;
    this.msg.classList.remove('show');
  }

  setHint(text, seconds) {
    this.hint.textContent = text;
    this.hint.style.opacity = '0.7';
    this.hintTimer = seconds;
  }

  setBar(name, value, faded) {
    const v = Math.round(value);
    if (this.last[name] === v && this.last[name + 'faded'] === faded) return;
    this.last[name] = v;
    this.last[name + 'faded'] = faded;
    const el = this.bars[name];
    el.querySelector('.fill').style.transform = `scaleX(${Math.max(0, Math.min(100, v)) / 100})`;
    el.classList.toggle('faded', !!faded);
    if (name === 'sanity' || name === 'health') el.classList.toggle('low', v < 30);
  }

  update(dt, player, runTime, extra, showFps) {
    this.setBar('sanity', player.sanity, false);
    this.setBar('health', player.health, !extra.health && player.health >= 99.5);
    this.setBar('stamina', player.stamina, player.stamina >= 99.5);
    this.setBar('battery', player.battery, !player.flashlight && player.battery >= 99.5);

    // Level-specific bars (breath, warmth, a boat's hull) show only where they matter.
    for (const name of ['breath', 'warmth', 'hull']) {
      const v = extra.bars?.[name];
      const el = this.bars[name];
      if (v == null) {
        if (!el.classList.contains('hidden')) el.classList.add('hidden');
        continue;
      }
      el.classList.remove('hidden');
      this.setBar(name, v, false);
      el.classList.toggle('low', v < 25);
    }
    const boss = extra.boss;
    this.boss.classList.toggle('show', !!boss);
    if (boss) {
      if (this.last.bossName !== boss.name) {
        this.last.bossName = boss.name;
        this.bossName.textContent = boss.name;
      }
      this.bossFill.style.transform = `scaleX(${Math.max(0, Math.min(1, boss.hp))})`;
    }

    const secs = Math.floor(runTime);
    if (this.last.secs !== secs) {
      this.last.secs = secs;
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(Math.floor(secs / 60) % 60).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      this.recTime.textContent = `${h}:${m}:${s}`;
    }

    const warnOn = !!extra.warn;
    this.ears.classList.toggle('show', warnOn);
    this.ears.classList.toggle('covered', warnOn && player.coveringEars);
    if (warnOn) this.ears.textContent = player.coveringEars ? extra.warnCovered : extra.warn;

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.style.opacity = '0';
    }

    this.fps.classList.toggle('hidden', !showFps);
    if (showFps) {
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} FPS`;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
    }
  }
}
