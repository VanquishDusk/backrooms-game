// A cheerful 1930s cartoon tune, through siren-pole horn speakers: oom-pah
// bass, plucked off-beat chords, a calliope melody and a woodblock. Level 94
// plays it all day; at dusk it winds down like a gramophone; in the King's
// nightmare it comes back slow and wrong.

// Sixteen bars of 2/4: [bass root, chord, melody eighths (null = rest; [note, eighths] = held)].
const BARS = [
  [48, [60, 64, 67], [76, 79, 76, 72]],
  [48, [60, 64, 67], [74, 76, [79, 2]]],
  [43, [59, 62, 65], [77, 74, 71, 67]],
  [43, [59, 62, 65], [69, 71, [74, 2]]],
  [48, [60, 64, 67], [76, 79, 84, 79]],
  [48, [60, 64, 67], [76, 72, 76, 79]],
  [41, [60, 65, 69], [81, 79, 77, 81]],
  [41, [60, 65, 69], [[84, 4]]],
  [48, [60, 64, 67], [79, 76, 79, 76]],
  [45, [61, 64, 67], [73, 76, 81, 79]],
  [50, [62, 66, 69], [78, 81, 86, 84]],
  [43, [59, 62, 65], [83, 81, 79, 77]],
  [48, [60, 64, 67], [76, 79, 84, 88]],
  [41, [60, 65, 69], [86, 84, 81, 77]],
  [43, [59, 62, 65], [76, 74, 71, 74]],
  [48, [60, 64, 67], [[72, 3], null]],
];
const BPM = 126;

export class CartoonBand {
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.input = ctx.createGain();
    // The horn speakers: a narrow band and a little grit.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 3800;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
    }
    shaper.curve = curve;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    // A slap of echo off the houses.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    this.input.connect(hp).connect(shaper).connect(this.lp).connect(this.out);
    this.lp.connect(delay).connect(fb).connect(this.out);
    if (this.pan) this.out.connect(this.pan).connect(dest);
    else this.out.connect(dest);
    this.bar = 0;
    this.next = 0;
    this.rate = 1;
    this.pitch = 0;
  }

  /**
   * @param {number} level  volume
   * @param {object} o      { mode: 'play' | 'wind' (run down and stop) | 'nightmare', pan }
   */
  update(level, o = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    const mode = o.mode || 'play';
    if (mode !== this.mode) {
      this.mode = mode;
      if (mode === 'play') {
        this.rate = 1;
        this.pitch = 0;
      }
      if (mode === 'nightmare') {
        this.rate = 0.62;
        this.pitch = -600;
      }
    }
    if (mode === 'wind') {
      // A gramophone running down: slower and lower until it stops.
      this.rate = Math.max(0, this.rate - 0.0035);
      this.pitch = -1500 * (1 - this.rate);
    }
    const audible = this.rate > 0.12 ? level : 0;
    this.out.gain.setTargetAtTime(audible, t, 0.25);
    this.lp.frequency.setTargetAtTime(mode === 'nightmare' ? 1400 : 3800, t, 0.3);
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan || 0)), t, 0.2);
    if (audible < 0.001) {
      this.next = 0;
      return;
    }
    if (this.next < t) this.next = t + 0.05;
    const eighth = 60 / (BPM * this.rate) / 2;
    while (this.next < t + 0.3) {
      this.playBar(this.next, eighth);
      this.next += eighth * 4;
      this.bar = (this.bar + 1) % BARS.length;
    }
  }

  playBar(t, e) {
    const [root, chord, mel] = BARS[this.bar];
    const sour = this.mode === 'nightmare' ? 70 : 0;
    const d = () => this.pitch + (sour ? (Math.random() - 0.5) * sour : 0);
    // Oom (beat 1) - pah (the and) - oom (beat 2, a fifth up) - pah.
    this.tuba(t, root - 12, e * 1.6, d());
    this.tuba(t + e * 2, root - 5, e * 1.6, d());
    for (const k of [1, 3]) chord.forEach((m, i) => this.pluck(t + e * k + i * 0.004, m, d()));
    this.block(t, 0.5);
    this.block(t + e * 2, 0.35);
    let at = 0;
    for (const n of mel) {
      if (n === null) {
        at += 1;
        continue;
      }
      const [m, len] = Array.isArray(n) ? n : [n, 1];
      // A little swing on the off-beats.
      const swing = at % 2 === 1 ? e * 0.12 : 0;
      this.calliope(t + at * e + swing, m, len * e * 0.92, d());
      at += len;
    }
  }

  osc(type, f, t, dur, vol, cents, attack = 0.005, decay = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = cents;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    if (decay) g.gain.setTargetAtTime(0, t + attack, decay);
    else g.gain.setTargetAtTime(0, t + dur, 0.04);
    o.connect(g).connect(this.input);
    o.start(t);
    o.stop(t + dur + 0.4);
    return o;
  }

  hz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  tuba(t, m, dur, cents) {
    this.osc('triangle', this.hz(m), t, dur, 0.32, cents, 0.01, 0.12);
    this.osc('square', this.hz(m), t, dur, 0.04, cents, 0.01, 0.08);
  }

  pluck(t, m, cents) {
    this.osc('sawtooth', this.hz(m), t, 0.12, 0.05, cents, 0.002, 0.05);
  }

  calliope(t, m, dur, cents) {
    const o1 = this.osc('square', this.hz(m), t, dur, 0.07, cents, 0.015);
    const o2 = this.osc('triangle', this.hz(m) * 2, t, dur, 0.05, cents + 4, 0.015);
    // Wobbly vibrato, like a steam organ.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 6.5;
    const lg = this.ctx.createGain();
    lg.gain.value = 18;
    lfo.connect(lg);
    lg.connect(o1.detune);
    lg.connect(o2.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.4);
  }

  block(t, vol) {
    if (!this.noise) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 * Math.max(0.3, this.rate);
    bp.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp).connect(g).connect(this.input);
    n.start(t, Math.random() * 2, 0.08);
  }

  reset() {
    this.bar = 0;
    this.next = 0;
    this.rate = 1;
    this.pitch = 0;
    this.mode = null;
    this.out.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}
