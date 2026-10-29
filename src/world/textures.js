import * as THREE from 'three';

// All surface textures are painted procedurally at load time so the game
// ships with no image assets and every texture tiles seamlessly.

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(canvas, renderer) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function speckle(ctx, size, count, rgb, alphaMax, maxR = 1.2, rand = Math.random) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(${rgb},${(rand() * alphaMax).toFixed(3)})`;
    const r = 0.4 + rand() * maxR;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

// Mono-yellow wallpaper with the faint vertical chevron motif.
export function wallpaperTexture(renderer, variant = 'yellow') {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const base = variant === 'yellow' ? '#cfc788' : variant;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Soft vertical banding like printed paper strips.
  for (let x = 0; x < S; x += 4) {
    const a = 0.03 + 0.03 * Math.sin((x / S) * Math.PI * 16);
    ctx.fillStyle = `rgba(120,110,40,${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 2, S);
  }

  // Chevron columns; offsets chosen so the pattern wraps at the edges.
  const cols = 10, rows = 14;
  const cw = S / cols, rh = S / rows;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (let ci = 0; ci < cols; ci++) {
    for (let ri = 0; ri < rows; ri++) {
      const cx = ci * cw + cw / 2;
      const cy = ri * rh + (ci % 2 ? rh / 2 : 0);
      ctx.strokeStyle = 'rgba(150,140,70,0.22)';
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.22, cy + rh * 0.18);
      ctx.lineTo(cx, cy - rh * 0.12);
      ctx.lineTo(cx + cw * 0.22, cy + rh * 0.18);
      ctx.stroke();
      ctx.fillStyle = 'rgba(150,140,70,0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy + rh * 0.36, 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (cy + rh > S) {
        // Wrap the motif that spills over the bottom edge.
        ctx.beginPath();
        ctx.moveTo(cx - cw * 0.22, cy - S + rh * 0.18);
        ctx.lineTo(cx, cy - S - rh * 0.12);
        ctx.lineTo(cx + cw * 0.22, cy - S + rh * 0.18);
        ctx.stroke();
      }
    }
  }
  speckle(ctx, S, 9000, '90,80,30', 0.12);
  speckle(ctx, S, 3000, '255,250,210', 0.12);
  return finish(c, renderer);
}

// Damp, slightly worn tan carpet (or any other colour).
export function carpetTexture(renderer, color = '#a99363') {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 34;
    const fiber = Math.random() < 0.06 ? -22 : 0;
    d[i] += n + fiber;
    d[i + 1] += n * 0.9 + fiber;
    d[i + 2] += n * 0.6 + fiber;
  }
  ctx.putImageData(img, 0, 0);
  // Faint looped-pile rows.
  for (let y = 0; y < S; y += 3) {
    ctx.fillStyle = `rgba(70,55,25,${(0.025 + Math.random() * 0.03).toFixed(3)})`;
    ctx.fillRect(0, y, S, 1);
  }
  return finish(c, renderer);
}

// Suspended ceiling: 2x2 acoustic tiles with grid lines.
export function ceilingTexture(renderer, color = '#d8d1a2') {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, 14000, '120,112,70', 0.35, 1.6);
  speckle(ctx, S, 4000, '255,255,235', 0.25, 1.2);
  const half = S / 2;
  ctx.fillStyle = '#a69f78';
  for (const p of [0, half]) {
    ctx.fillRect(p - 3, 0, 6, S);
    ctx.fillRect(0, p - 3, S, 6);
  }
  // Wrap the grid line that sits on the edge.
  ctx.fillRect(S - 3, 0, 3, S);
  ctx.fillRect(0, S - 3, S, 3);
  ctx.fillStyle = 'rgba(255,255,240,0.35)';
  for (const p of [0, half]) {
    ctx.fillRect(p + 3, 0, 1, S);
    ctx.fillRect(0, p + 3, S, 1);
  }
  return finish(c, renderer);
}

// Fresh off-white paint with a dark red chair rail. Spans the full wall
// height once (v = 0 floor, v = 1 ceiling), so use it with texScale [u, 1/height].
export function paintedWallTexture(renderer, railFrom = 0.29, railTo = 0.315) {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6e4d2';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, Math.max(W, H), 5000, '150,145,120', 0.08, 1.4);
  // Faint roller marks.
  for (let x = 0; x < W; x += 2) {
    ctx.fillStyle = `rgba(120,115,95,${(Math.random() * 0.025).toFixed(3)})`;
    ctx.fillRect(x, 0, 2, H);
  }
  const y0 = H * (1 - railTo), y1 = H * (1 - railFrom);
  ctx.fillStyle = '#5e2a22';
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, y0, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, y1 - 2, W, 2);
  // Baseboard.
  ctx.fillStyle = '#d6d3c0';
  ctx.fillRect(0, H - 14, W, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, H - 14, W, 2);
  return finish(c, renderer);
}

// Small white bathroom tiles.
export function tileTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#9a978a';
  ctx.fillRect(0, 0, S, S);
  const n = 4, g = 3, w = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 228 + Math.floor(Math.random() * 18);
      ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
      ctx.fillRect(x * w + g / 2, y * w + g / 2, w - g, w - g);
    }
  }
  speckle(ctx, S, 1500, '120,120,110', 0.12);
  return finish(c, renderer);
}

// Raw plywood / OSB for the unfinished house under the remodel.
export function woodTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#8f6c42';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? `rgba(60,40,20,${(0.1 + Math.random() * 0.25).toFixed(2)})` : `rgba(200,160,110,${(0.1 + Math.random() * 0.25).toFixed(2)})`;
    ctx.save();
    ctx.translate(Math.random() * S, Math.random() * S);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillRect(-10, -3, 14 + Math.random() * 18, 3 + Math.random() * 4);
    ctx.restore();
  }
  for (let y = 0; y < S; y += 3) {
    ctx.fillStyle = `rgba(70,45,20,${(Math.random() * 0.08).toFixed(3)})`;
    ctx.fillRect(0, y, S, 1);
  }
  return finish(c, renderer);
}

// ---- Level 1 -------------------------------------------------------------

// Blotchy low-frequency noise drawn by upscaling a tiny random canvas.
function blotches(ctx, W, H, cells, rgb, alpha) {
  const small = document.createElement('canvas');
  small.width = cells;
  small.height = Math.max(1, Math.round(cells * H / W));
  const sctx = small.getContext('2d');
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      sctx.fillStyle = `rgba(${rgb},${(Math.random() * alpha).toFixed(3)})`;
      sctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.imageSmoothingEnabled = true;
  // Draw 3x3 copies so the blur wraps at the edges.
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) ctx.drawImage(small, ox * W, oy * H, W, H);
}

function cracks(ctx, S, n, color) {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.lineWidth = 0.6 + Math.random() * 1.2;
    let x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      a += (Math.random() - 0.5) * 1.1;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Poured concrete floor with stains, cracks and a joint on the tile edge.
export function concreteFloorTexture(renderer, base = '#86857f') {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 8, '40,38,34', 0.22);
  blotches(ctx, S, S, 24, '255,255,250', 0.08);
  speckle(ctx, S, 16000, '50,50,45', 0.25, 1.4);
  speckle(ctx, S, 6000, '230,230,220', 0.18, 1.2);
  cracks(ctx, S, 4, 'rgba(30,30,28,0.45)');
  ctx.fillStyle = 'rgba(40,40,36,0.5)';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, 0, 3, S);
  return finish(c, renderer);
}

// Stained concrete wall spanning the full height once (use [u, 1/height]).
export function concreteWallTexture(renderer, opts = {}) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = opts.base || '#b5b3aa';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 10, '60,58,50', 0.18);
  speckle(ctx, W, 9000, '70,70,64', 0.18, 1.3);
  // Water streaks running down from the top.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, len = H * (0.2 + Math.random() * 0.7), w = 2 + Math.random() * 6;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(60,55,40,0.28)');
    g.addColorStop(1, 'rgba(60,55,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, len);
  }
  // Grime band at the base.
  const g = ctx.createLinearGradient(0, H * 0.82, 0, H);
  g.addColorStop(0, 'rgba(40,38,30,0)');
  g.addColorStop(1, 'rgba(40,38,30,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.82, W, H * 0.18);
  if (opts.band) {
    // Painted lower band (warehouse walls).
    ctx.fillStyle = opts.band;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, H * 0.62, W, H * 0.38);
    ctx.globalAlpha = 1;
    ctx.fillStyle = opts.stripe || '#e0b020';
    ctx.fillRect(0, H * 0.6, W, H * 0.025);
    blotches(ctx, W, H, 12, '30,30,30', 0.15);
  }
  if (opts.moss) {
    blotches(ctx, W, H, 9, '60,110,30', 0.55);
    blotches(ctx, W, H, 30, '40,90,20', 0.35);
  }
  // Formwork tie holes.
  ctx.fillStyle = 'rgba(40,40,36,0.5)';
  for (const fx of [0.25, 0.75]) for (const fy of [0.2, 0.5]) {
    ctx.beginPath();
    ctx.arc(W * fx, H * fy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, renderer);
}

// Bare concrete slab ceiling with formwork board lines.
export function concreteCeilingTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#6f6e69';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 8, '30,30,28', 0.25);
  speckle(ctx, S, 4000, '40,40,36', 0.2);
  ctx.fillStyle = 'rgba(30,30,28,0.35)';
  for (let y = 0; y < S; y += S / 4) ctx.fillRect(0, y, S, 2);
  return finish(c, renderer);
}

export function grassTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#3d6b22';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 8, '20,40,10', 0.4);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const g = 90 + Math.random() * 110;
    ctx.strokeStyle = `rgba(${(g * 0.5) | 0},${g | 0},${(g * 0.25) | 0},0.7)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5);
    ctx.stroke();
  }
  return finish(c, renderer);
}

// Big pale flagstones for the Gothic sector.
export function flagstoneTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#5c5850';
  ctx.fillRect(0, 0, S, S);
  const n = 4, w = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 150 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
      const off = y % 2 ? w / 2 : 0;
      for (const dx of [0, -S]) ctx.fillRect(x * w + off + dx + 3, y * w + 3, w - 6, w - 6);
    }
  }
  blotches(ctx, S, S, 10, '50,45,35', 0.25);
  speckle(ctx, S, 8000, '60,55,45', 0.2);
  return finish(c, renderer);
}

// Dark beadboard below, frosted window panes above (spans full height).
export function woodPanelTexture(renderer) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(0, 0, W, H);
  // Upper windows.
  const top = H * 0.08, bottom = H * 0.55, cols = 4;
  for (let i = 0; i < cols; i++) {
    const x0 = (W / cols) * i + 8, x1 = (W / cols) * (i + 1) - 8;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#d8d4b8');
    g.addColorStop(1, '#bdb89a');
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, x1 - x0, bottom - top);
    ctx.fillStyle = '#3a2618';
    ctx.fillRect(x0, top + (bottom - top) * 0.45, x1 - x0, 6);
  }
  // Beadboard below.
  for (let x = 0; x < W; x += 12) {
    ctx.fillStyle = `rgba(20,10,5,${(0.3 + Math.random() * 0.3).toFixed(2)})`;
    ctx.fillRect(x, bottom + 14, 2, H - bottom - 14);
  }
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, bottom, W, 14);
  blotches(ctx, W, H, 12, '10,5,0', 0.25);
  return finish(c, renderer);
}

// Wooden supply crate side.
export function crateTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#9a7442';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += S / 5) {
    ctx.fillStyle = `rgba(${(120 + Math.random() * 40) | 0},${(85 + Math.random() * 30) | 0},45,0.6)`;
    ctx.fillRect(0, y + 2, S, S / 5 - 4);
    ctx.fillStyle = 'rgba(40,25,10,0.6)';
    ctx.fillRect(0, y, S, 2);
  }
  speckle(ctx, S, 3000, '50,30,10', 0.25);
  ctx.strokeStyle = '#5c3f1e';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, S - 18, S - 18);
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(S - 14, S - 14);
  ctx.stroke();
  return finish(c, renderer);
}

export function hazardTexture(renderer) {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#e0b81c';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#1a1a18';
  for (let i = -S; i < S * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 16 - S, S);
    ctx.lineTo(i - S, S);
    ctx.fill();
  }
  return finish(c, renderer);
}

// Small solid-colour texture so props can use the lit world shader.
export function solidTexture(renderer, color, noise = 0.06) {
  const S = 32;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, 200, '0,0,0', noise, 1.5);
  return finish(c, renderer);
}

// Pressure gauge face (the needle is a separate mesh).
export function gaugeTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#2a2a28';
  ctx.beginPath();
  ctx.arc(64, 64, 63, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ecead8';
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    ctx.lineWidth = i % 5 ? 2 : 4;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    ctx.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
    ctx.stroke();
  }
  ctx.strokeStyle = '#b02018';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 48, Math.PI * 1.95, Math.PI * 2.25);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Leaves with transparency for hanging vines.
export function leavesTexture() {
  const W = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(50,80,20,0.9)';
  ctx.lineWidth = 3;
  for (const sx of [32, 64, 96]) {
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    for (let y = 0; y < H; y += 20) ctx.lineTo(sx + Math.sin(y * 0.05 + sx) * 10, y);
    ctx.stroke();
    for (let y = 0; y < H; y += 7) {
      if (Math.random() < 0.25 * (1 - y / H) + 0.1) continue;
      const x = sx + Math.sin(y * 0.05 + sx) * 10 + (Math.random() - 0.5) * 30;
      const g = 80 + Math.random() * 100;
      ctx.fillStyle = `rgb(${(g * 0.45) | 0},${g | 0},${(g * 0.2) | 0})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + Math.random() * 4, 3 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ---- Level 1.3 -----------------------------------------------------------

// Big glossy white tiles with bevelled edges, laid in a running bond.
export function whiteTileWallTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#c8c9c6';
  ctx.fillRect(0, 0, S, S);
  const rows = 4, cols = 2, th = S / rows, tw = S / cols, g = 5;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      const grad = ctx.createLinearGradient(x, y, x, y + th);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.15, '#f3f4f2');
      grad.addColorStop(0.85, '#eceeeb');
      grad.addColorStop(1, '#d6d8d4');
      ctx.fillStyle = grad;
      ctx.fillRect(x + g, y + g, tw - g * 2, th - g * 2);
      // Bevel highlights and shadows.
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(x + g, y + g, tw - g * 2, 3);
      ctx.fillRect(x + g, y + g, 3, th - g * 2);
      ctx.fillStyle = 'rgba(150,152,148,0.6)';
      ctx.fillRect(x + g, y + th - g - 3, tw - g * 2, 3);
      ctx.fillRect(x + tw - g - 3, y + g, 3, th - g * 2);
    }
  }
  speckle(ctx, S, 1500, '150,150,150', 0.08);
  return finish(c, renderer);
}

export function whiteFloorTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#b9bbb8';
  ctx.fillRect(0, 0, S, S);
  const n = 4, w = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 236 + Math.floor(Math.random() * 10);
      ctx.fillStyle = `rgb(${v},${v + 1},${v - 1})`;
      ctx.fillRect(x * w + 2, y * w + 2, w - 4, w - 4);
    }
  }
  // Soft sheen streaks, like a freshly mopped floor.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(Math.random() * S, 0, 6 + Math.random() * 14, S);
  }
  return finish(c, renderer);
}
