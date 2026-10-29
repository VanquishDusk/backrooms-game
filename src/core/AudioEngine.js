// Every sound is synthesized with WebAudio — no audio files to load.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ambienceOn = false;
  }

  // Must be called from a user gesture (browsers block audio otherwise).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      // Covering your ears muffles everything.
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 20000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(this.muffle).connect(comp).connect(ctx.destination);
      this.noise = this.makeNoise(3);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseSource(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }

  // Envelope helper: quick attack, exponential-ish decay.
  env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  out(pan = 0) {
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  // ---- Looping ambience -------------------------------------------------

  startAmbience() {
    if (!this.ctx || this.ambienceOn) return;
    this.ambienceOn = true;
    const ctx = this.ctx;
    const nodes = (this.amb = []);
    const keep = (n) => (nodes.push(n), n);

    // Fluorescent hum: mains fundamental + harmonics + high buzz.
    this.humGain = keep(ctx.createGain());
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    const lp = keep(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.connect(this.humGain);
    for (const [type, f, g] of [['sawtooth', 60, 0.32], ['sine', 120, 0.5], ['square', 180, 0.05], ['sine', 240, 0.12]]) {
      const o = keep(ctx.createOscillator());
      o.type = type;
      o.frequency.value = f;
      const gg = keep(ctx.createGain());
      gg.gain.value = g;
      o.connect(gg).connect(lp);
      o.start();
    }
    const buzz = keep(this.noiseSource(true));
    const bp = keep(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = 5200;
    bp.Q.value = 3;
    const buzzGain = keep(ctx.createGain());
    buzzGain.gain.value = 0.06;
    const am = keep(ctx.createOscillator());
    am.frequency.value = 120;
    const amGain = keep(ctx.createGain());
    amGain.gain.value = 0.05;
    am.connect(amGain).connect(buzzGain.gain);
    buzz.connect(bp).connect(buzzGain).connect(this.humGain);
    buzz.start();
    am.start();

    // Static from the flickering exit wall.
    const st = keep(this.noiseSource(true));
    const sthp = keep(ctx.createBiquadFilter());
    sthp.type = 'bandpass';
    sthp.frequency.value = 2600;
    sthp.Q.value = 0.6;
    this.staticGain = keep(ctx.createGain());
    this.staticGain.gain.value = 0;
    this.staticPan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
    const exitOut = this.staticPan || this.master;
    if (this.staticPan) this.staticPan.connect(this.master);
    st.connect(sthp).connect(this.staticGain).connect(exitOut);
    st.start();

    // Alternative exit beacon: Level 0's hum leaking through a door.
    this.beaconGain = keep(ctx.createGain());
    this.beaconGain.gain.value = 0;
    const blp = keep(ctx.createBiquadFilter());
    blp.type = 'lowpass';
    blp.frequency.value = 520;
    blp.connect(this.beaconGain).connect(exitOut);
    for (const [f, g] of [[60, 0.5], [120, 0.7], [240, 0.2]]) {
      const o = keep(ctx.createOscillator());
      o.type = f === 60 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const gg = keep(ctx.createGain());
      gg.gain.value = g;
      o.connect(gg).connect(blp);
      o.start();
    }

    // Alternative exit beacon: steam hiss and machinery deep in the pipes.
    this.steamGain = keep(ctx.createGain());
    this.steamGain.gain.value = 0;
    this.steamGain.connect(exitOut);
    const hiss = keep(this.noiseSource(true));
    const hhp = keep(ctx.createBiquadFilter());
    hhp.type = 'highpass';
    hhp.frequency.value = 2800;
    const hissGain = keep(ctx.createGain());
    hissGain.gain.value = 0.5;
    hiss.connect(hhp).connect(hissGain).connect(this.steamGain);
    hiss.start();
    const thrum = keep(ctx.createOscillator());
    thrum.type = 'square';
    thrum.frequency.value = 46;
    const tlp = keep(ctx.createBiquadFilter());
    tlp.type = 'lowpass';
    tlp.frequency.value = 140;
    const tg = keep(ctx.createGain());
    tg.gain.value = 0.8;
    thrum.connect(tlp).connect(tg).connect(this.steamGain);
    thrum.start();

    // Machinery: a motor's whir and the thrum of a pump, somewhere close.
    this.machineGain = keep(ctx.createGain());
    this.machineGain.gain.value = 0;
    this.machinePan = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
    if (this.machinePan) this.machineGain.connect(this.machinePan).connect(this.master);
    else this.machineGain.connect(this.master);
    const motor = keep(ctx.createOscillator());
    motor.type = 'sawtooth';
    motor.frequency.value = 29;
    const mlp = keep(ctx.createBiquadFilter());
    mlp.type = 'lowpass';
    mlp.frequency.value = 180;
    const mg = keep(ctx.createGain());
    mg.gain.value = 0.7;
    motor.connect(mlp).connect(mg).connect(this.machineGain);
    motor.start();
    const whir = keep(this.noiseSource(true));
    const wbp = keep(ctx.createBiquadFilter());
    wbp.type = 'bandpass';
    wbp.frequency.value = 900;
    wbp.Q.value = 6;
    const wg = keep(ctx.createGain());
    wg.gain.value = 0.35;
    const wlfo = keep(ctx.createOscillator());
    wlfo.frequency.value = 7.3;
    const wlg = keep(ctx.createGain());
    wlg.gain.value = 0.25;
    wlfo.connect(wlg).connect(wg.gain);
    whir.connect(wbp).connect(wg).connect(this.machineGain);
    whir.start();
    wlfo.start();

    // Low drone that swells when the figure is hunting.
    this.droneGain = keep(ctx.createGain());
    this.droneGain.gain.value = 0;
    const dlp = keep(ctx.createBiquadFilter());
    dlp.type = 'lowpass';
    dlp.frequency.value = 220;
    dlp.connect(this.droneGain).connect(this.master);
    for (const f of [41, 43.7, 82.5]) {
      const o = keep(ctx.createOscillator());
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dlp);
      o.start();
    }
    this.nextBeat = 0;
  }

  stopAmbience() {
    if (this.jazzOut) this.jazzOut.gain.setValueAtTime(0, this.ctx.currentTime);
    if (!this.ambienceOn) return;
    this.ambienceOn = false;
    for (const n of this.amb) {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch {
        // already stopped
      }
    }
    this.amb = [];
  }

  /**
   * Per-frame mix.
   * @param {object} s  { hum, exitGain, exitPan, exitType ('static' | 'hum' | 'steam'), drone, sanity, ears, machine?, machinePan?, jazz?, jazzMuffle? }
   */
  update(s) {
    if (!this.ctx || !this.ambienceOn) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(s.hum, t, 0.08);
    const crackle = 0.55 + Math.random() * 0.45;
    const type = s.exitType || 'static';
    this.staticGain.gain.setTargetAtTime(type === 'static' ? s.exitGain * crackle : 0, t, 0.02);
    this.beaconGain.gain.setTargetAtTime(type === 'hum' ? s.exitGain * 0.5 : 0, t, 0.1);
    this.steamGain.gain.setTargetAtTime(type === 'steam' ? s.exitGain * 0.45 : 0, t, 0.1);
    if (this.staticPan) this.staticPan.pan.setTargetAtTime(s.exitPan, t, 0.05);
    this.droneGain.gain.setTargetAtTime(s.drone, t, 0.3);
    this.machineGain.gain.setTargetAtTime(s.machine || 0, t, 0.2);
    this.updateJazz(s.jazz || 0, s.jazzMuffle ?? 6000);
    if (this.machinePan) this.machinePan.pan.setTargetAtTime(s.machinePan || 0, t, 0.1);
    this.muffle.frequency.setTargetAtTime(s.ears ? 380 : 20000, t, 0.06);

    // Heartbeat when the mind starts to slip.
    if (s.sanity < 40 && t > this.nextBeat) {
      const rate = 0.55 + (40 - s.sanity) / 40 * 0.6; // beats/sec
      this.heartbeat(t, 0.25 + (40 - s.sanity) / 40 * 0.35);
      this.nextBeat = t + 1 / rate;
    }
  }

  // ---- One-shots --------------------------------------------------------

  heartbeat(t, vol) {
    for (const [dt, v] of [[0, 1], [0.16, 0.7]]) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(62, t + dt);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      const g = this.ctx.createGain();
      this.env(g, t + dt, vol * v, 0.01, 0.18);
      o.connect(g).connect(this.master);
      o.start(t + dt);
      o.stop(t + dt + 0.3);
    }
  }

  // Squishy footstep on damp carpet.
  step(run, vol = 1, pan = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const dest = this.out(pan);
    const s = this.noiseSource();
    s.playbackRate.value = 0.7 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = (run ? 900 : 650) + Math.random() * 200;
    const g = this.ctx.createGain();
    this.env(g, t, (run ? 0.5 : 0.32) * vol, 0.006, 0.13);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 2, 0.3);
    // Wet squelch just after.
    const s2 = this.noiseSource();
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1400 + Math.random() * 500;
    f2.Q.value = 2.5;
    const g2 = this.ctx.createGain();
    this.env(g2, t + 0.05, 0.12 * vol, 0.01, 0.1);
    s2.connect(f2).connect(g2).connect(dest);
    s2.start(t + 0.05, Math.random() * 2, 0.2);
  }

  // Footsteps that are not yours.
  phantomSteps(pan) {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.step(false, 0.45, pan, i * 0.55 + Math.random() * 0.05);
  }

  // Scratching behind the walls.
  scratch(pan, vol = 0.5) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dest = this.out(pan);
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.18 + Math.random() * 0.12);
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(2500 + Math.random() * 1500, t);
      f.frequency.linearRampToValueAtTime(1200, t + 0.14);
      f.Q.value = 6;
      const g = this.ctx.createGain();
      this.env(g, t, vol * (0.6 + Math.random() * 0.4), 0.02, 0.12);
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * 2, 0.2);
    }
  }

  // Indistinct whispering: formant-filtered noise with syllable rhythm.
  whisper(pan, vol = 0.35) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dest = this.out(pan);
    const syll = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < syll; i++) {
      const t = t0 + i * (0.12 + Math.random() * 0.1);
      const s = this.noiseSource();
      const g = this.ctx.createGain();
      this.env(g, t, vol * (0.5 + Math.random() * 0.5), 0.03, 0.12 + Math.random() * 0.1);
      let node = s;
      for (const f of [700 + Math.random() * 500, 1800 + Math.random() * 900]) {
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 5;
        node.connect(bp);
        node = bp;
      }
      node.connect(g).connect(dest);
      s.start(t, Math.random() * 2, 0.35);
    }
  }

  // A distant voice calling out — a wobbling sung vowel, never quite a word.
  voice(pan, vol = 0.18) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pan);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 180 + Math.random() * 90;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.35);
    o.frequency.linearRampToValueAtTime(base * 0.9, t + 1.1);
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 750;
    f1.Q.value = 6;
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.25);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f1).connect(f2).connect(g).connect(dest);
    o.start(t);
    o.stop(t + 1.5);
  }

  thud(pan = 0, vol = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.01, 0.7);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 0.8);
  }

  // Gated electrical buzz for flickering lights.
  flickerBuzz(duration = 1, vol = 0.12) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    let t = t0;
    while (t < t0 + duration) {
      const on = Math.random() < 0.55;
      g.gain.setValueAtTime(on ? vol : 0, t);
      t += 0.03 + Math.random() * 0.12;
    }
    g.gain.setValueAtTime(0, t);
    o.connect(bp).connect(g).connect(this.master);
    o.start(t0);
    o.stop(t + 0.05);
  }

  // Water dripping somewhere in the dark.
  drip(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const f = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.002, 0.12);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 0.2);
  }

  // Distant metal on concrete.
  clank(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [310, 467, 733]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * (0.9 + Math.random() * 0.2);
      const g = this.ctx.createGain();
      this.env(g, t, vol / 3, 0.003, 1.2);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      o.connect(lp).connect(g).connect(this.out(pan));
      o.start(t);
      o.stop(t + 1.3);
    }
  }

  // Water hammer: a run of hollow knocks travelling down a pipe.
  pipeKnock(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    let t = t0;
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const f = 140 + Math.random() * 60;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.25);
      const g = this.ctx.createGain();
      this.env(g, t, vol * (1 - i * 0.15), 0.004, 0.35);
      const ring = this.ctx.createOscillator();
      ring.type = 'sine';
      ring.frequency.value = f * 4.7;
      const rg = this.ctx.createGain();
      this.env(rg, t, vol * 0.12, 0.002, 0.5);
      o.connect(g).connect(this.out(pan));
      ring.connect(rg).connect(this.out(pan));
      o.start(t);
      o.stop(t + 0.45);
      ring.start(t);
      ring.stop(t + 0.6);
      t += 0.12 + Math.random() * 0.25;
    }
  }

  // A steam leak letting go.
  steam(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    const dur = 0.8 + Math.random() * 1.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol * 0.8, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random(), dur + 0.6);
  }

  // A locked door's handle, rattled.
  rattle(pan = 0, vol = 0.3) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.07 + Math.random() * 0.02;
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400 + Math.random() * 900;
      f.Q.value = 4;
      const g = this.ctx.createGain();
      this.env(g, t, vol, 0.002, 0.06);
      s.connect(f).connect(g).connect(this.out(pan));
      s.start(t, Math.random(), 0.1);
    }
    this.clank(pan, vol * 0.3);
  }

  // Electrical arcing: sharp, irregular snaps.
  arc(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.random() * 0.35;
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = this.ctx.createGain();
      this.env(g, t, vol * (0.4 + Math.random() * 0.6), 0.001, 0.03 + Math.random() * 0.05);
      s.connect(f).connect(g).connect(this.out(pan));
      s.start(t, Math.random(), 0.12);
    }
  }

  // A fluorescent tube or bulb bursting: a pop and falling glass.
  shatter(pan = 0, vol = 0.35) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const pop = this.noiseSource();
    const pf = this.ctx.createBiquadFilter();
    pf.type = 'highpass';
    pf.frequency.value = 1200;
    const pg = this.ctx.createGain();
    this.env(pg, t0, vol, 0.001, 0.08);
    pop.connect(pf).connect(pg).connect(this.out(pan));
    pop.start(t0, Math.random(), 0.12);
    for (let i = 0; i < 9; i++) {
      const t = t0 + 0.12 + Math.random() * 0.5;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 3000 + Math.random() * 4000;
      const g = this.ctx.createGain();
      this.env(g, t, vol * 0.18, 0.001, 0.05 + Math.random() * 0.08);
      o.connect(g).connect(this.out(pan));
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  // A generator winding down: pitch and level falling away.
  powerDown(pan = 0, vol = 0.35) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(18, t + 3.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 3.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(lp).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 3.5);
    this.thud(pan, vol * 0.8);
  }

  // An old lift's bell.
  bell(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, k] of [[880, 1], [1320, 0.4], [2200, 0.2]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t, vol * k, 0.003, 1.6);
      o.connect(g).connect(this.out(pan));
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  // Lift motor and cables: a rising grind.
  liftMotor(vol = 0.35) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(40, t);
    o.frequency.linearRampToValueAtTime(70, t + 1.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.4);
    g.gain.setValueAtTime(vol, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 3.1);
    this.clank(0, vol * 0.6);
  }

  // An office phone ringing somewhere: two trilling bursts.
  phone(pan = 0, vol = 0.12) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (const start of [0, 0.55, 2.2, 2.75]) {
      const t = t0 + start;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 820;
      const o2 = this.ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 1020;
      const trill = this.ctx.createOscillator();
      trill.frequency.value = 20;
      const tg = this.ctx.createGain();
      tg.gain.value = 0.5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.45);
      trill.connect(tg).connect(g.gain);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500;
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g).connect(this.out(pan));
      for (const n of [o, o2, trill]) {
        n.start(t);
        n.stop(t + 0.5);
      }
    }
  }

  // A rat's squeak: a quick chirp or two.
  squeak(pan = 0, vol = 0.12) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
      const t = t0 + i * 0.09;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const f = 2600 + Math.random() * 1400;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.04);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.07);
      const g = this.ctx.createGain();
      this.env(g, t, vol, 0.004, 0.06);
      o.connect(g).connect(this.out(pan));
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  // A cat: a meow (or, angry, a yowl).
  meow(pan = 0, vol = 0.2, angry = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = angry ? 1.1 : 0.55;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(angry ? 380 : 520, t);
    o.frequency.linearRampToValueAtTime(angry ? 640 : 820, t + dur * 0.35);
    o.frequency.linearRampToValueAtTime(angry ? 300 : 460, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1600, t + dur * 0.4);
    f.frequency.linearRampToValueAtTime(900, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Rising whine of something charging up (a Watcher's pupil).
  charge(pan = 0, vol = 0.2, duration = 1.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1900, t + duration);
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.setValueAtTime(90, t);
    o2.frequency.exponentialRampToValueAtTime(950, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + duration);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.08);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.15;
    o.connect(g).connect(this.out(pan));
    o2.connect(g2).connect(g);
    o.start(t);
    o2.start(t);
    o.stop(t + duration + 0.1);
    o2.stop(t + duration + 0.1);
  }

  // ---- Smooth jazz (Level 5) --------------------------------------------
  // A small generative combo, as if from an old radio down the hall: walking
  // bass, Rhodes-ish comping, brushes and ride, and a lazy sax-like line over
  // a ii-V-I loop in F. Notes are scheduled a little ahead while it's audible.

  updateJazz(level, muffle) {
    const ctx = this.ctx;
    if (!this.jazzOut) {
      if (level < 0.001) return;
      this.jazzOut = ctx.createGain();
      this.jazzOut.gain.value = 0;
      this.jazzLp = ctx.createBiquadFilter();
      this.jazzLp.type = 'lowpass';
      this.jazzLp.frequency.value = muffle;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 140;
      this.jazzBus = ctx.createGain();
      this.jazzBus.connect(hp).connect(this.jazzLp).connect(this.jazzOut).connect(this.master);
      // Record crackle.
      const crackle = this.noiseSource(true);
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass';
      cf.frequency.value = 3000;
      const cg = ctx.createGain();
      cg.gain.value = 0.02;
      crackle.connect(cf).connect(cg).connect(this.jazzLp);
      crackle.start();
      this.jazzNext = ctx.currentTime + 0.1;
      this.jazzBeat = 0;
    }
    const t = ctx.currentTime;
    this.jazzOut.gain.setTargetAtTime(level, t, 0.3);
    this.jazzLp.frequency.setTargetAtTime(muffle, t, 0.3);
    if (level < 0.001) {
      this.jazzNext = t + 0.1;
      return;
    }
    const spb = 60 / 88; // seconds per beat
    while (this.jazzNext < t + 0.3) {
      this.jazzStep(this.jazzBeat, this.jazzNext, spb);
      this.jazzBeat++;
      this.jazzNext += spb;
    }
  }

  jazzStep(beat, t, spb) {
    // | Gm7 | C7 | Fmaj7 | Dm7 | Gm7 | C7 | Am7 D7 | Gm7 C7 |
    const C = {
      Gm7: [43, [0, 3, 7, 10], [58, 62, 65, 69]], C7: [36, [0, 4, 7, 10], [58, 62, 64, 69]],
      F7M: [41, [0, 4, 7, 11], [57, 60, 64, 67]], Dm7: [38, [0, 3, 7, 10], [57, 60, 64, 65]],
      Am7: [45, [0, 3, 7, 10], [60, 64, 67, 71]], D7: [38, [0, 4, 7, 10], [60, 62, 66, 72]],
    };
    const prog = [['Gm7'], ['C7'], ['F7M'], ['Dm7'], ['Gm7'], ['C7'], ['Am7', 'D7'], ['Gm7', 'C7']];
    const bar = Math.floor(beat / 4) % prog.length, b = beat % 4;
    const names = prog[bar];
    const name = names.length === 2 ? names[b < 2 ? 0 : 1] : names[0];
    const [root, tones, voicing] = C[name];
    const nextBar = prog[(bar + 1) % prog.length];
    const nextRoot = C[b < 2 && names.length === 2 ? names[1] : nextBar[0]][0];
    const swing = spb * 0.66;
    const r = Math.random;
    // Walking bass: root, chord tones, then a chromatic step into the next root.
    let note = root;
    if (b === 1 || b === 2) note = root + tones[1 + Math.floor(r() * 3)] - (r() < 0.3 ? 12 : 0);
    if (b === 3) note = nextRoot + (r() < 0.5 ? 1 : -1);
    if (note < 31) note += 12;
    this.jazzNote(t, note, spb * 0.9, 'bass', 0.32);
    // Ride: ding, ding-a ding.
    this.jazzRide(t, 0.06);
    if (b === 1 || b === 3) {
      this.jazzRide(t + swing, 0.035);
      this.jazzBrush(t, 0.05);
    }
    // Comping: voicings on 1 and on the "and" of 2, not every time.
    if ((b === 0 && r() < 0.7) || (b === 1 && r() < 0.45)) {
      const at = b === 1 ? t + swing : t;
      for (const v of voicing) this.jazzNote(at + r() * 0.015, v, spb * (b === 1 ? 0.8 : 1.6), 'keys', 0.07);
    }
    // A lazy melody: chord tones and passing notes, often silent.
    if (r() < 0.38) {
      const scale = [65, 67, 69, 70, 72, 74, 76, 77, 79];
      const pick = r() < 0.6 ? root + 24 + tones[Math.floor(r() * 4)] : scale[Math.floor(r() * scale.length)];
      const n = pick < 62 ? pick + 12 : pick > 82 ? pick - 12 : pick;
      this.jazzNote(t + (r() < 0.4 ? swing : 0), n, spb * (1 + Math.floor(r() * 3)) * 0.9, 'sax', 0.05);
    }
  }

  jazzNote(t, midi, dur, kind, vol) {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    if (kind === 'bass') {
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vol * 0.3, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
    } else if (kind === 'keys') {
      // Rhodes-ish: a sine with a soft bell partial and a little tremolo.
      o.type = 'sine';
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = f * 4.01;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(vol * 0.25, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o2.connect(g2).connect(g);
      o2.start(t);
      o2.stop(t + dur + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
    } else {
      // Sax-ish: a filtered sawtooth that swells in, with vibrato.
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.value = f * 0.008;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.12);
      g.gain.setValueAtTime(vol * 0.85, t + dur * 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g);
    }
    g.connect(this.jazzBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  jazzRide(t, vol) {
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 7000;
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(f).connect(g).connect(this.jazzBus);
    s.start(t, Math.random(), 0.5);
  }

  jazzBrush(t, vol) {
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2500;
    f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(f).connect(g).connect(this.jazzBus);
    s.start(t, Math.random(), 0.3);
  }

  // A small hand bell on a reception desk.
  deskBell(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, k] of [[2350, 1], [3720, 0.5], [5600, 0.25]]) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t, vol * k, 0.002, 1.4);
      o.connect(g).connect(this.out(pan));
      o.start(t);
      o.stop(t + 1.5);
    }
  }

  // A grandfather clock's tick (or tock).
  tick(pan = 0, vol = 0.05, tock = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = tock ? 900 : 1150;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.001, 0.03);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = tock ? 1200 : 1600;
    o.connect(bp).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 0.05);
  }

  // Small hammer tap.
  tink(pan = 0, vol = 0.15) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1900 + Math.random() * 300;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.001, 0.08);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    o.connect(bp).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 0.12);
  }

  growl(pan = 0, vol = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(62, t);
    o.frequency.linearRampToValueAtTime(48, t + 1.1);
    const trem = this.ctx.createOscillator();
    trem.frequency.value = 22;
    const tg = this.ctx.createGain();
    tg.gain.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const amp = this.ctx.createGain();
    amp.gain.value = 0.5;
    trem.connect(tg).connect(amp.gain);
    o.connect(lp).connect(amp).connect(g).connect(this.out(pan));
    o.start(t);
    trem.start(t);
    o.stop(t + 1.4);
    trem.stop(t + 1.4);
  }

  snarl() {
    if (!this.ctx) return;
    this.growl(0, 0.7);
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
    f.Q.value = 1.5;
    const g = this.ctx.createGain();
    this.env(g, t, 0.7, 0.005, 0.35);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random(), 0.4);
    this.thud(0, 0.5);
  }

  // Quick padding footfall (claws on concrete).
  pad(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400 + Math.random() * 1200;
    f.Q.value = 3;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.002, 0.05);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random() * 2, 0.08);
  }

  // Heart monitor beep (a long `duration` is a flatline).
  beep(pan = 0, vol = 0.08, duration = 0.11, freq = 980) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + duration);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.05);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + duration + 0.1);
  }

  // Wet tearing / sizzling, for a Detox Zone gone wrong.
  sizzle(vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200 + Math.random() * 1500;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 2, 0.7);
  }

  // A heavy swing through the air.
  swing(vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 2, 0.4);
  }

  // A pipe connecting with something solid and alive.
  impact(vol = 0.5) {
    if (!this.ctx) return;
    this.thud(0, vol);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.4);
    const g = this.ctx.createGain();
    this.env(g, t, vol * 0.25, 0.002, 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  }

  // ---- Entity library sounds (all take pan, vol) -------------------------

  // Breathy, high hiss through teeth (Smilers).
  hiss(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(5200, t);
    f.frequency.linearRampToValueAtTime(3800, t + 0.9);
    f.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random(), 1.2);
  }

  // Wing buzz: amplitude-modulated noise (Deathmoths).
  chitter(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 350 + Math.random() * 150;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 26 + Math.random() * 8;
    const lg = this.ctx.createGain();
    lg.gain.value = vol;
    lfo.connect(lg).connect(g.gain);
    const env = this.ctx.createGain();
    this.env(env, t, 1, 0.08, 0.7);
    s.connect(f).connect(g).connect(env).connect(this.out(pan));
    s.start(t, Math.random(), 0.9);
    lfo.start(t);
    lfo.stop(t + 0.9);
  }

  // Wet, bubbling throat noise (Clumps, Wretches).
  gurgle(pan = 0, vol = 0.3) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dest = this.out(pan);
    for (let i = 0; i < 6; i++) {
      const t = t0 + i * (0.06 + Math.random() * 0.08);
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const f = 120 + Math.random() * 160;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
      const g = this.ctx.createGain();
      this.env(g, t, vol * (0.4 + Math.random() * 0.6), 0.005, 0.07);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  // Joints popping and bones cracking (Clumps).
  boneCrack(pan = 0, vol = 0.35) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) {
      const t = t0 + i * (0.04 + Math.random() * 0.15);
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800 + Math.random() * 2000;
      const g = this.ctx.createGain();
      this.env(g, t, vol, 0.001, 0.03);
      s.connect(f).connect(g).connect(this.out(pan));
      s.start(t, Math.random() * 2, 0.05);
    }
  }

  // A low, wordless human moan (Wretches, Dullers).
  groan(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 85 + Math.random() * 40;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.8, t + 1.2);
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 500;
    f1.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f1).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 1.5);
  }

  // A tinny party horn (Partygoers).
  partyHorn(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(470, t + 0.5);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.setValueAtTime(vol, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(bp).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 0.65);
  }

  // Giggling: quick pitched trills. `wrong` detunes and slows it.
  giggle(pan = 0, vol = 0.2, wrong = false) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dest = this.out(pan);
    for (let i = 0; i < 5; i++) {
      const t = t0 + i * (wrong ? 0.2 : 0.11);
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const f = (wrong ? 330 : 620) * (1 + (i % 2) * 0.12) * (wrong ? 1 - i * 0.06 : 1);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.08);
      const g = this.ctx.createGain();
      this.env(g, t, vol, 0.005, 0.09);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  // A tearing scream (Skin-Stealer reveal, Smiler lunge).
  shriek(pan = 0, vol = 0.45) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pan);
    for (const [f0, f1] of [[700, 1400], [760, 1200], [1100, 1900]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.9);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 1;
      const g = this.ctx.createGain();
      this.env(g, t, vol / 3, 0.02, 0.9);
      o.connect(bp).connect(g).connect(dest);
      o.start(t);
      o.stop(t + 1);
    }
  }

  // A long, carrying howl (Hounds).
  howl(pan = 0, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(420, t + 0.6);
    o.frequency.linearRampToValueAtTime(330, t + 2.0);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 900;
    lp.Q.value = 5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(lp).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 2.3);
  }

  // Structural creak: a slow, pitched groan.
  creak(pan = 0, vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 70 + Math.random() * 60;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + 0.8);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600 + Math.random() * 500;
    bp.Q.value = 8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(bp).connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + 1);
  }

  // Sharp crack of plaster or timber.
  crack(pan = 0, vol = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1200;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.002, 0.12);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random() * 2, 0.2);
  }

  // A wall or a chunk of floor coming down.
  crash(pan = 0, vol = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 1.2);
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.01, 1.3);
    s.connect(f).connect(g).connect(this.out(pan));
    s.start(t, Math.random(), 1.5);
    this.thud(pan, vol * 0.9);
  }

  // Ceiling tiles clattering down.
  clatter(pan = 0, vol = 0.3) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.05 + Math.random() * 0.12);
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900 + Math.random() * 1600;
      f.Q.value = 2;
      const g = this.ctx.createGain();
      this.env(g, t, vol * (0.5 + Math.random() * 0.5), 0.003, 0.08);
      s.connect(f).connect(g).connect(this.out(pan));
      s.start(t, Math.random() * 2, 0.12);
    }
  }

  cough() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t = t0 + i * 0.32;
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 500 + Math.random() * 200;
      f.Q.value = 1.2;
      const g = this.ctx.createGain();
      this.env(g, t, 0.4, 0.01, 0.18);
      s.connect(f).connect(g).connect(this.master);
      s.start(t, Math.random() * 2, 0.25);
    }
  }

  hurt() {
    if (!this.ctx) return;
    this.thud(0, 0.5);
    this.crack(0, 0.25);
  }

  door() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.creak(0, 0.25);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1800, t + 0.05);
    const g = this.ctx.createGain();
    this.env(g, t + 0.05, 0.08, 0.002, 0.03);
    o.connect(g).connect(this.master);
    o.start(t + 0.05);
    o.stop(t + 0.12);
    this.thud(0, 0.3);
  }

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.1);
    const g = this.ctx.createGain();
    this.env(g, t, 0.18, 0.01, 0.2);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    this.slosh(t + 0.05, 0.2);
  }

  slosh(t, vol) {
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1100, t + 0.2);
    f.Q.value = 3;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.04, 0.25);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random(), 0.4);
  }

  drink() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const s = this.noiseSource();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 380;
      const g = this.ctx.createGain();
      this.env(g, t + i * 0.36, 0.45, 0.03, 0.2);
      s.connect(f).connect(g).connect(this.master);
      s.start(t + i * 0.36, Math.random(), 0.3);
    }
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const g = this.ctx.createGain();
    this.env(g, t, 0.25, 0.002, 0.03);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random(), 0.06);
  }

  staticBurst(duration = 0.4, vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random(), duration + 0.05);
  }

  jumpscare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    shaper.curve = curve;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    shaper.connect(g).connect(this.master);
    for (const [f0, f1] of [[420, 1300], [610, 1700], [300, 900]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 1.5);
      o.connect(shaper);
      o.start(t);
      o.stop(t + 1.6);
    }
    const s = this.noiseSource();
    s.connect(shaper);
    s.start(t, 0, 1.6);
  }

  noclip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + 1.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, 0, 2.3);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 2);
    const og = this.ctx.createGain();
    this.env(og, t, 0.25, 0.05, 2);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 2.2);
  }

  fall() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(150, t + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, 0, 1.9);
  }
}
