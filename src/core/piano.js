// A slow piano piece, synthesized: soft hammered tones through a room
// reverb. Level 601 plays it the whole time. Three beats to a bar, a bass
// note on the first beat, a chord on the second, a sparse melody over the
// top; sixteen bars, round and round.

const BARS = [
  // [bass, chord, melody: [beat, note, beats]]
  [45, [57, 60, 64], [[0, 76, 3]]],
  [41, [57, 60, 64], [[0, 72, 2], [2, 71, 1]]],
  [43, [55, 60, 64], [[0, 67, 3]]],
  [43, [59, 62, 67], [[0, 74, 2], [2, 71, 1]]],
  [45, [57, 60, 64], [[0, 72, 1.5], [1.5, 71, 0.5], [2, 69, 1]]],
  [41, [57, 60, 65], [[0, 69, 3]]],
  [50, [53, 57, 60], [[0, 65, 2], [2, 64, 1]]],
  [40, [56, 59, 64], [[0, 68, 3]]],
  [41, [57, 60, 65], [[0, 72, 2], [2, 77, 1]]],
  [40, [55, 60, 64], [[0, 76, 3]]],
  [38, [53, 57, 62], [[0, 74, 1], [1, 72, 1], [2, 74, 1]]],
  [45, [57, 60, 64], [[0, 69, 3]]],
  [41, [57, 60, 65], [[0, 72, 2], [2, 71, 1]]],
  [43, [59, 62, 67], [[0, 71, 1.5], [1.5, 72, 0.5], [2, 74, 1]]],
  [40, [57, 59, 64], [[0, 69, 3]]],
  [40, [56, 59, 64], [[0, 68, 3]]],
];
const FINAL = { bass: 33, chord: [45, 52, 57, 61, 64], melody: 69 };
const BPM = 58;

export class Piano {
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.input = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    // A room: a convolver fed with decaying noise.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    this.input.connect(dry).connect(this.tone);
    this.input.connect(this.verb).connect(wet).connect(this.tone);
    this.tone.connect(this.out);
    if (this.pan) this.out.connect(this.pan).connect(dest);
    else this.out.connect(dest);
    this.bar = 0;
    this.pass = 0;
    this.next = 0;
    this.ending = false;
    this.finished = false;
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * (i < 200 ? i / 200 : 1);
    }
    return buf;
  }

  /**
   * Per frame.
   * @param {number} level  volume (0 = silent)
   * @param {object} o      { muffle 0..1, pan -1..1, tempo (1 = normal), wobble (cents), end: play the last chord and stop }
   */
  update(level, o = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    this.out.gain.setTargetAtTime(this.finished ? level * 0.8 : level, t, 0.4);
    this.tone.frequency.setTargetAtTime(20000 * Math.pow(0.04, o.muffle || 0), t, 0.3);
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan || 0)), t, 0.3);
    this.tempo = o.tempo || 1;
    this.wobble = o.wobble || 0;
    if (o.end) this.ending = true;
    if (level < 0.001 || this.finished) return;
    if (this.next < t) this.next = t + 0.1;
    const beat = 60 / (BPM * this.tempo);
    while (this.next < t + 0.4) {
      if (this.ending) {
        this.playFinal(this.next, beat);
        this.finished = true;
        return;
      }
      this.playBar(this.next, beat);
      this.next += beat * 3;
      this.bar = (this.bar + 1) % BARS.length;
      if (this.bar === 0) this.pass++;
    }
  }

  playBar(t, beat) {
    const [bass, chord, melody] = BARS[this.bar];
    const v = () => 0.85 + Math.random() * 0.15;
    this.note(t, bass, 0.7 * v(), beat * 3);
    chord.forEach((m, i) => this.note(t + beat + i * 0.018, m, 0.38 * v(), beat * 2));
    // Every other time round, the opening bars are left without a tune.
    if (this.pass % 2 === 1 && this.bar < 4) return;
    for (const [b, m, len] of melody) this.note(t + b * beat + Math.random() * 0.02, m, 0.62 * v(), len * beat);
  }

  playFinal(t, beat) {
    this.note(t, FINAL.bass, 0.75, beat * 6);
    FINAL.chord.forEach((m, i) => this.note(t + 0.05 + i * 0.07, m, 0.4, beat * 6));
    this.note(t + beat * 1.5, FINAL.melody + 12, 0.5, beat * 5);
  }

  note(t, midi, vel, len) {
    const ctx = this.ctx;
    const cents = this.wobble ? (Math.random() - 0.5) * 2 * this.wobble : 0;
    const f = 440 * Math.pow(2, (midi - 69 + cents / 100) / 12);
    const g = ctx.createGain();
    const peak = vel * 0.16;
    const tau = Math.max(0.5, Math.min(2.6, 1.5 * Math.pow(261 / f, 0.4)));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(peak * 0.4, t + 0.006, 0.15);
    g.gain.setTargetAtTime(0, t + 0.3, tau);
    g.gain.setTargetAtTime(0, t + Math.max(0.3, len), 0.35);
    // Bright at the strike, mellowing as it rings.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
    lp.frequency.setTargetAtTime(Math.min(4000, f * 2.6), t, 0.35);
    lp.connect(g).connect(this.input);
    const end = t + Math.max(0.3, len) + 1.6;
    for (const [r, a] of [[1, 1], [2.001, 0.42], [3.003, 0.16], [4.012, 0.08], [5.02, 0.04]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(end);
    }
    // The felt hitting the string.
    if (this.noise) {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = Math.min(6000, f * 4);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(peak * 0.25, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      n.connect(hp).connect(ng).connect(this.input);
      n.start(t, Math.random() * 2, 0.05);
    }
  }

  reset() {
    this.bar = 0;
    this.pass = 0;
    this.next = 0;
    this.ending = false;
    this.finished = false;
    this.out.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}
