import { addPhoto } from './photos.js';

// The camcorder: V (or the camera button) grabs the frame, runs it through
// an old-VHS filter (low resolution, smeared colour, tracking noise, head
// switching at the bottom, a timestamp burned in) and puts it on the tape.

const $ = (id) => document.getElementById(id);
const W = 640, H = 480;
const MONTHS = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUN.', 'JUL.', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'];

export class Camcorder {
  constructor(game) {
    this.game = game;
    this.pending = false;
    this.busy = false;
    this.cooldown = 0;
    this.onSaved = null;
    const btn = $('btn-cam');
    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.request();
    };
    btn.addEventListener('click', fire);
    btn.addEventListener('touchend', fire);
  }

  request() {
    const g = this.game;
    if (g.state !== 'playing' || this.busy || this.cooldown > 0) return;
    this.pending = true;
    this.cooldown = 0.8;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  // Called straight after the frame is drawn, while the canvas still holds it.
  afterRender(canvas) {
    if (!this.pending) return;
    this.pending = false;
    this.busy = true;
    const g = this.game;
    const level = g.levelDef;
    const meta = { level: level.id, name: level.name, title: level.title, seed: g.levelSeed, time: Date.now() };
    const url = canvas.toDataURL('image/jpeg', 0.92);
    g.extras.photoTaken();
    g.extras.documentShot(g.camera, canvas);
    g.audio.shutter?.();
    const el = $('flash');
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
    });
    const img = new Image();
    img.onload = () => {
      const out = vhs(img, meta.time);
      out.toBlob((blob) => {
        this.busy = false;
        if (!blob) return;
        addPhoto({ ...meta, blob }).then(() => this.onSaved?.());
        this.toast(out, level);
      }, 'image/jpeg', 0.72);
    };
    img.onerror = () => (this.busy = false);
    img.src = url;
  }

  toast(canvas, level) {
    const t = $('photo-toast');
    t.querySelector('img').src = canvas.toDataURL('image/jpeg', 0.6);
    t.querySelector('span').textContent = `SAVED TO TAPE · ${level.name.toUpperCase()}`;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
}

// ---- The filter -------------------------------------------------------------------

function vhs(img, time, rand = Math.random) {
  // 4:3 crop of the frame, squeezed down to tape resolution, then back up soft.
  const sw = img.width, sh = img.height;
  const cw = Math.min(sw, sh * 4 / 3), ch = cw * 3 / 4;
  const small = document.createElement('canvas');
  small.width = 200;
  small.height = 150;
  const sc = small.getContext('2d');
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 200, 150);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.filter = 'blur(0.9px) contrast(1.08)';
  ctx.drawImage(small, 0, 0, W, H);
  ctx.filter = 'none';
  // The camcorder's burned-in display.
  osd(ctx, time);

  const im = ctx.getImageData(0, 0, W, H);
  const d = im.data;
  const Y = new Float32Array(W * H), I = new Float32Array(W * H), Q = new Float32Array(W * H);
  for (let p = 0, k = 0; k < W * H; k++, p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    Y[k] = 0.299 * r + 0.587 * g + 0.114 * b;
    I[k] = 0.596 * r - 0.274 * g - 0.322 * b;
    Q[k] = 0.211 * r - 0.523 * g + 0.312 * b;
  }
  // Tracking: bands of rows slip sideways; the last rows are head-switch garbage.
  const shift = new Float32Array(H);
  const bands = 2 + Math.floor(rand() * 3);
  for (let b = 0; b < bands; b++) {
    const y0 = Math.floor(rand() * H), h = 2 + Math.floor(rand() * 14), amt = (rand() - 0.5) * 14;
    for (let y = y0; y < Math.min(H, y0 + h); y++) shift[y] += amt * (0.6 + rand() * 0.4);
  }
  const wob = rand() * 10;
  for (let y = 0; y < H; y++) shift[y] += Math.sin(y * 0.021 + wob) * 1.2;
  for (let y = H - 10; y < H; y++) shift[y] += 18 + (y - (H - 10)) * 3 + rand() * 6;

  const out = new Uint8ClampedArray(d.length);
  const CH = 9; // chroma smear (pixels)
  for (let y = 0; y < H; y++) {
    const row = y * W;
    const s = shift[y];
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, Math.round(x - s)));
      // Chroma smeared along the line and delayed to the right.
      let ci = 0, cq = 0;
      for (let k = -CH; k <= 2; k += 3) {
        const xx = Math.min(W - 1, Math.max(0, sx + k - 6));
        ci += I[row + xx];
        cq += Q[row + xx];
      }
      ci /= 4;
      cq /= 4;
      // Luma: a little ringing, lifted blacks, soft highlights.
      const yl = Y[row + sx], yr = Y[row + Math.min(W - 1, sx + 2)];
      let yy = yl + (yl - yr) * 0.35;
      yy = 18 + yy * 0.86;
      yy += (rand() - 0.5) * 22;
      const sat = 0.68;
      let r = yy + 0.956 * ci * sat + 0.621 * cq * sat;
      let g = yy - 0.272 * ci * sat - 0.647 * cq * sat;
      let b = yy - 1.106 * ci * sat + 1.703 * cq * sat;
      // Tape tint: a touch of green in the shadows, warm highlights.
      const t = yy / 255;
      r += (t - 0.5) * 10;
      g += (1 - t) * 6;
      b -= t * 8;
      // Scanlines and vignette.
      const scan = y % 2 ? 0.9 : 1;
      const vx = x / W - 0.5, vy = y / H - 0.5;
      const vig = 1 - (vx * vx + vy * vy) * 0.75;
      const o = (row + x) * 4;
      out[o] = r * scan * vig;
      out[o + 1] = g * scan * vig;
      out[o + 2] = b * scan * vig;
      out[o + 3] = 255;
    }
  }
  // A rolling band of tracking noise somewhere in the frame.
  const by = Math.floor(H * (0.15 + rand() * 0.7)), bh = 3 + Math.floor(rand() * 5);
  for (let y = by; y < Math.min(H - 10, by + bh); y++) {
    for (let x = 0; x < W; x++) {
      if (rand() < 0.55) continue;
      const o = (y * W + x) * 4, v = 120 + rand() * 135;
      out[o] = (out[o] + v) / 2;
      out[o + 1] = (out[o + 1] + v) / 2;
      out[o + 2] = (out[o + 2] + v) / 2;
    }
  }
  // Dropouts: short white streaks where the tape is worn.
  const drops = 6 + Math.floor(rand() * 10);
  for (let k = 0; k < drops; k++) {
    const y = Math.floor(rand() * H), x0 = Math.floor(rand() * W), len = 4 + Math.floor(rand() * 40);
    for (let x = x0; x < Math.min(W, x0 + len); x++) {
      const o = (y * W + x) * 4, v = 200 + rand() * 55;
      out[o] = out[o + 1] = out[o + 2] = v;
    }
  }
  // Head-switching noise along the bottom.
  for (let y = H - 8; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rand() < 0.35) {
        const o = (y * W + x) * 4, v = rand() * 255;
        out[o] = out[o + 1] = out[o + 2] = v;
      }
    }
  }
  d.set(out);
  ctx.putImageData(im, 0, 0);
  return c;
}

function osd(ctx, time) {
  const t = new Date(time);
  const h = t.getHours(), m = String(t.getMinutes()).padStart(2, '0'), s = String(t.getSeconds()).padStart(2, '0');
  const date = `${MONTHS[t.getMonth()]} ${String(t.getDate()).padStart(2, ' ')} 1996`;
  const clock = `${h >= 12 ? 'PM' : 'AM'} ${((h + 11) % 12) + 1}:${m}:${s}`;
  ctx.font = '34px VT323, "Courier New", monospace';
  ctx.textBaseline = 'alphabetic';
  const text = (str, x, y, align = 'left') => {
    ctx.textAlign = align;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(str, x + 2, y + 2);
    ctx.fillStyle = '#f2f2ea';
    ctx.fillText(str, x, y);
  };
  text('PLAY ▶', 34, 52);
  text('SP', W - 34, 52, 'right');
  text(clock, 34, H - 44);
  text(date, W - 34, H - 44, 'right');
}
