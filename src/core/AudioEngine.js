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
    st.connect(sthp).connect(this.staticGain);
    if (this.staticPan) this.staticGain.connect(this.staticPan).connect(this.master);
    else this.staticGain.connect(this.master);
    st.start();

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
   * @param {object} s  { hum, exitGain, exitPan, drone, sanity, ears, crackle }
   */
  update(s) {
    if (!this.ctx || !this.ambienceOn) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(s.hum, t, 0.08);
    const crackle = 0.55 + Math.random() * 0.45;
    this.staticGain.gain.setTargetAtTime(s.exitGain * crackle, t, 0.02);
    if (this.staticPan) this.staticPan.pan.setTargetAtTime(s.exitPan, t, 0.05);
    this.droneGain.gain.setTargetAtTime(s.drone, t, 0.3);
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
