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

// ---- Level 1.5 -----------------------------------------------------------
// These are painted as a "real" house hallway; the level shows them as a
// photo negative, so dark here reads as glowing and light reads as void.

// Smooth grey plaster, faintly mottled.
export function plasterTexture(renderer, base = '#8c8c8a') {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 6, '40,40,40', 0.12);
  blotches(ctx, S, S, 20, '255,255,255', 0.05);
  speckle(ctx, S, 6000, '60,60,60', 0.08, 1.2);
  return finish(c, renderer);
}

// Pale plaster ceiling with spreading water stains (they invert into the
// dark, cloudy ceiling in the reference photo).
export function stainedCeilingTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#d0d0cc';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 5, '70,70,64', 0.35);
  blotches(ctx, S, S, 14, '90,90,84', 0.25);
  blotches(ctx, S, S, 40, '60,60,56', 0.15);
  speckle(ctx, S, 5000, '80,80,76', 0.12);
  return finish(c, renderer);
}

// Narrow pale floorboards.
export function floorboardTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const n = 8, w = S / n;
  for (let i = 0; i < n; i++) {
    const v = 175 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
    ctx.fillRect(i * w, 0, w, S);
    // Grain.
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(90,70,50,${(Math.random() * 0.12).toFixed(3)})`;
      ctx.fillRect(i * w + Math.random() * w, Math.random() * S, 1, 20 + Math.random() * 120);
    }
    ctx.fillStyle = 'rgba(40,30,20,0.55)';
    ctx.fillRect(i * w, 0, 2, S);
    // Board ends, staggered.
    const e = ((i * 197) % S);
    ctx.fillRect(i * w, e, w, 2);
  }
  return finish(c, renderer);
}

// Four "photographs" for the picture frames: soft greyscale portraits and
// rooms, some of them wrong.
export function pictureAtlasTexture(renderer) {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const x0 = k * 128;
    const g = ctx.createLinearGradient(x0, 0, x0, H);
    g.addColorStop(0, '#c8c8c8');
    g.addColorStop(1, '#8a8a8a');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, 128, H);
    ctx.fillStyle = '#2a2a2a';
    if (k === 0 || k === 2) {
      // A figure, head and shoulders. The second one has no face.
      ctx.beginPath();
      ctx.ellipse(x0 + 64, 52, 20, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x0 + 30, 82, 68, 46);
      if (k === 0) {
        ctx.fillStyle = '#bdbdbd';
        ctx.fillRect(x0 + 54, 46, 6, 4);
        ctx.fillRect(x0 + 68, 46, 6, 4);
      }
    } else if (k === 1) {
      // A hallway, receding to a door.
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;
      for (const [a, b] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
        ctx.beginPath();
        ctx.moveTo(x0 + a, b);
        ctx.lineTo(x0 + 64 + (a ? 14 : -14), 64 + (b ? 18 : -18));
        ctx.stroke();
      }
      ctx.fillRect(x0 + 52, 46, 24, 36);
    } else {
      // A window with nothing outside it.
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(x0 + 30, 24, 68, 80);
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(x0 + 62, 24, 4, 80);
      ctx.fillRect(x0 + 30, 62, 68, 4);
    }
  }
  speckle(ctx, W, 3000, '30,30,30', 0.15);
  return finish(c, renderer);
}

// Words written on the wall, upside down: what the denizens whisper.
export function wallWritingTexture(renderer, text) {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8c8c8a';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI);
  ctx.fillStyle = 'rgba(15,15,15,0.92)';
  ctx.font = 'italic bold 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  // Drips.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(15,15,15,0.7)';
  for (let i = 0; i < 18; i++) ctx.fillRect(40 + Math.random() * (W - 80), 70 + Math.random() * 10, 2, 10 + Math.random() * 40);
  return finish(c, renderer);
}

// What a fake window in Level 1 shows: a hallway in negative.
export function invertedGlimpseTexture() {
  const W = 256, H = 280;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 4, W / 2, H * 0.45, W);
  g.addColorStop(0, '#f2f2f2');
  g.addColorStop(0.35, '#9a9a9a');
  g.addColorStop(1, '#6a6a6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Receding walls and a dark, mottled ceiling.
  ctx.fillStyle = 'rgba(40,40,40,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W * 0.58, H * 0.36);
  ctx.lineTo(W * 0.42, H * 0.36);
  ctx.fill();
  ctx.fillStyle = 'rgba(10,10,10,0.75)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.58, H * 0.62);
  ctx.lineTo(W * 0.42, H * 0.62);
  ctx.fill();
  // Black fixtures that shine darkness.
  ctx.fillStyle = '#050505';
  for (const [y, w] of [[0.06, 0.16], [0.16, 0.1], [0.24, 0.06], [0.3, 0.035]]) ctx.fillRect(W / 2 - (W * w) / 2, H * y, W * w, H * 0.02);
  // The glowing door at the end, and the white edges of doors along the way.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(W * 0.44, H * 0.36, W * 0.12, H * 0.26);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(W * 0.465, H * 0.39, W * 0.07, H * 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  for (const x of [0.12, 0.26, 0.74, 0.88]) {
    ctx.beginPath();
    ctx.moveTo(W * x, H * (x < 0.5 ? 0.22 : 0.22));
    ctx.lineTo(W * x, H * 0.8);
    ctx.stroke();
  }
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${(Math.random() * 0.12).toFixed(3)})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }
  return new THREE.CanvasTexture(c);
}

// ---- Level 2 -------------------------------------------------------------

// Chalky, whitewashed concrete: peeling paint, rust runs, damp, grime.
// Spans the full wall height once (use [u, 1/height]).
export function chalkyConcreteTexture(renderer) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#aaa391';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 12, '95,88,70', 0.35);
  blotches(ctx, W, H, 30, '215,210,195', 0.2);
  blotches(ctx, W, H, 6, '60,55,42', 0.25);
  // Board-formed concrete: faint horizontal pour lines and tie holes.
  for (let y = 40; y < H; y += 64 + Math.random() * 20) {
    ctx.fillStyle = 'rgba(60,55,45,0.18)';
    ctx.fillRect(0, y, W, 2);
    for (let x = 30; x < W; x += 128) {
      ctx.fillStyle = 'rgba(40,36,30,0.5)';
      ctx.beginPath();
      ctx.arc(x + Math.random() * 6, y + 30, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Peeling whitewash: small jagged flakes of bare grey concrete.
  for (let i = 0; i < 55; i++) {
    const cx = Math.random() * W, cy = H * (0.35 + Math.random() * 0.65);
    const r = 1.5 + Math.random() * (cy > H * 0.75 ? 7 : 4);
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rr = r * (0.45 + Math.random() * 0.75);
      ctx.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(112,108,98,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,222,210,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Rust and water runs from the top, and from where pipes are bolted on.
  for (let i = 0; i < 38; i++) {
    const x = Math.random() * W, y0 = Math.random() < 0.6 ? 0 : Math.random() * H * 0.6;
    const len = H * (0.1 + Math.random() * 0.5);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    const rust = Math.random() < 0.55;
    g.addColorStop(0, rust ? 'rgba(125,62,24,0.4)' : 'rgba(55,50,38,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, 1 + Math.random() * 5, len);
  }
  // Damp and grime toward the floor.
  const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
  g.addColorStop(0, 'rgba(38,34,24,0)');
  g.addColorStop(1, 'rgba(38,34,24,0.7)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);
  // Soot near the ceiling.
  const s2 = ctx.createLinearGradient(0, 0, 0, H * 0.18);
  s2.addColorStop(0, 'rgba(20,18,15,0.45)');
  s2.addColorStop(1, 'rgba(20,18,15,0)');
  ctx.fillStyle = s2;
  ctx.fillRect(0, 0, W, H * 0.18);
  speckle(ctx, W, 12000, '55,50,40', 0.25, 1.4);
  return finish(c, renderer);
}

// Old, dark, sooty brick.
export function darkBrickTexture(renderer) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a302a';
  ctx.fillRect(0, 0, W, H);
  const bh = H / 16, bw = W / 6;
  for (let r = 0; r < 16; r++) {
    for (let k = -1; k < 7; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      const v = 60 + Math.random() * 40;
      ctx.fillStyle = `rgb(${v + 30},${v * 0.7},${v * 0.55})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }
  blotches(ctx, W, H, 14, '20,16,14', 0.55);
  blotches(ctx, W, H, 8, '160,150,130', 0.2);
  speckle(ctx, W, 6000, '15,12,10', 0.3);
  return finish(c, renderer);
}

// Dirty, worn concrete floor.
export function utilityFloorTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#6e6a60';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 10, '30,28,24', 0.4);
  blotches(ctx, S, S, 20, '150,145,130', 0.15);
  speckle(ctx, S, 14000, '30,30,26', 0.25, 1.4);
  cracks(ctx, S, 5, 'rgba(20,18,15,0.5)');
  return finish(c, renderer);
}

// Diamond plate steel, scuffed.
export function diamondPlateTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#5c5c58';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < S; x += 16) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
      ctx.fillStyle = 'rgba(190,190,180,0.5)';
      ctx.fillRect(-5, -1.5, 10, 3);
      ctx.restore();
    }
  }
  blotches(ctx, S, S, 10, '40,30,20', 0.35);
  speckle(ctx, S, 3000, '20,20,20', 0.25);
  return finish(c, renderer);
}

// Low, dark, stained concrete ceiling.
export function utilityCeilingTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#4c4842';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 10, '15,14,12', 0.5);
  blotches(ctx, S, S, 8, '120,110,90', 0.2);
  speckle(ctx, S, 5000, '20,20,18', 0.25);
  return finish(c, renderer);
}

// Pipe surfaces. All tile along the pipe (u around, v along).
export function pipeTexture(renderer, kind) {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  if (kind === 'insulation') {
    // Dirty cream lagging with canvas wrap seams and stains.
    ctx.fillStyle = '#d6cbb0';
    ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, S, 12, '150,120,80', 0.35);
    blotches(ctx, S, S, 6, '90,70,40', 0.3);
    for (let y = 0; y < S; y += 32) {
      ctx.fillStyle = 'rgba(120,100,70,0.35)';
      ctx.fillRect(0, y, S, 3);
    }
    speckle(ctx, S, 1500, '80,70,50', 0.2);
  } else if (kind === 'rust') {
    ctx.fillStyle = '#6a3a22';
    ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, S, 20, '150,80,40', 0.45);
    blotches(ctx, S, S, 14, '40,25,18', 0.45);
    blotches(ctx, S, S, 6, '170,160,140', 0.25);
    speckle(ctx, S, 2500, '200,120,60', 0.25);
  } else if (kind === 'galv') {
    ctx.fillStyle = '#9a9c98';
    ctx.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 3) {
      ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.12).toFixed(3)})`;
      ctx.fillRect(x, 0, 1, S);
    }
    blotches(ctx, S, S, 6, '60,58,50', 0.3);
  } else if (kind === 'duct') {
    // Spiral-seam ducting.
    ctx.fillStyle = '#b4b2a8';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(60,58,52,0.6)';
    ctx.lineWidth = 3;
    for (let k = -S; k < S * 2; k += 22) {
      ctx.beginPath();
      ctx.moveTo(0, k);
      ctx.lineTo(S, k + S * 0.35);
      ctx.stroke();
    }
    blotches(ctx, S, S, 6, '120,100,60', 0.25);
  } else if (kind === 'redpaint') {
    ctx.fillStyle = '#6e2a22';
    ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, S, 10, '40,20,15', 0.5);
    blotches(ctx, S, S, 8, '140,70,40', 0.35);
  } else {
    // Cable / dark machinery paint.
    ctx.fillStyle = kind === 'machine' ? '#3e4a3c' : '#1e1c1a';
    ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, S, 10, '120,110,90', kind === 'machine' ? 0.25 : 0.1);
    blotches(ctx, S, S, 8, '90,50,25', kind === 'machine' ? 0.3 : 0);
  }
  return finish(c, renderer);
}

// Steel maintenance doors, and the rare odd ones.
export function utilityDoorTexture(renderer, kind) {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const base = { locked: '#5a6460', locked2: '#6a5a40', exit1: '#4f6a4a', exit3: '#7a2a20', exit4: '#7a5634' }[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 12, '20,18,15', 0.4);
  blotches(ctx, W, H, 8, '160,150,130', 0.2);
  if (kind === 'exit4') {
    // An office door: wood grain and panels.
    for (let x = 0; x < W; x += 3) {
      ctx.fillStyle = `rgba(40,20,5,${(Math.random() * 0.2).toFixed(3)})`;
      ctx.fillRect(x, 0, 1, H);
    }
    ctx.strokeStyle = 'rgba(30,15,5,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 20, W - 36, 90);
    ctx.strokeRect(18, 130, W - 36, 100);
    ctx.fillStyle = '#c8a050';
    ctx.fillRect(W / 2 - 14, 60, 28, 22);
    ctx.fillStyle = '#3a2810';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText('4', W / 2, 78);
  } else {
    // Rivets, a kick plate and a push bar.
    ctx.fillStyle = 'rgba(20,20,18,0.5)';
    for (const y of [8, H - 8]) for (let x = 8; x < W; x += 16) ctx.fillRect(x, y, 3, 3);
    ctx.fillStyle = 'rgba(30,30,28,0.55)';
    ctx.fillRect(6, H - 40, W - 12, 32);
    ctx.fillStyle = 'rgba(200,200,190,0.35)';
    ctx.fillRect(10, H * 0.45, W - 20, 8);
    if (kind === 'locked' || kind === 'locked2') {
      ctx.fillStyle = '#d8d0b8';
      ctx.fillRect(18, 40, W - 36, 34);
      ctx.fillStyle = '#8a1a14';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AUTHORIZED', W / 2, 54);
      ctx.fillText('PERSONNEL ONLY', W / 2, 68);
    } else if (kind === 'exit1') {
      // Chalk: a circled 1 and an arrow.
      ctx.strokeStyle = 'rgba(230,220,120,0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W / 2, 70, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = 'rgba(230,220,120,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('1', W / 2, 84);
      ctx.beginPath();
      ctx.moveTo(W / 2, 170);
      ctx.lineTo(W / 2, 120);
      ctx.lineTo(W / 2 - 12, 134);
      ctx.moveTo(W / 2, 120);
      ctx.lineTo(W / 2 + 12, 134);
      ctx.stroke();
    } else if (kind === 'exit3') {
      // Hazard tape border and a lightning bolt.
      for (let i = 0; i < (W + H) * 2; i += 14) {
        ctx.fillStyle = (i / 14) % 2 ? '#e0b818' : '#141414';
        ctx.fillRect(i < W ? i : 0, 0, 7, 7);
      }
      ctx.fillStyle = '#e0b818';
      for (const [x, y, w, h] of [[0, 0, W, 8], [0, H - 8, W, 8], [0, 0, 8, H], [W - 8, 0, 8, H]]) ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#141414';
      for (let i = 0; i < W; i += 16) {
        ctx.fillRect(i, 0, 8, 8);
        ctx.fillRect(i, H - 8, 8, 8);
      }
      ctx.fillStyle = '#f0d040';
      ctx.beginPath();
      ctx.moveTo(70, 30);
      ctx.lineTo(42, 92);
      ctx.lineTo(62, 92);
      ctx.lineTo(50, 140);
      ctx.lineTo(86, 70);
      ctx.lineTo(66, 70);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3', W / 2, 190);
    }
  }
  speckle(ctx, W, 2500, '20,20,18', 0.2);
  return finish(c, renderer);
}

// Wall signs, eight tiles in a row: DANGER, HIGH VOLTAGE, KEEP CLEAR,
// NO ENTRY, then stencilled section plates.
export const SIGN_TILES = 8;
export function signAtlasTexture(renderer, labels = ['C-7', 'D-12', 'B-3', 'E-9']) {
  const T = 128, W = T * SIGN_TILES;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = T;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tile = (k, bg) => {
    ctx.fillStyle = bg;
    ctx.fillRect(k * T, 0, T, T);
    return k * T + T / 2;
  };
  // DANGER
  let x = tile(0, '#efece2');
  ctx.fillStyle = '#c81e14';
  ctx.fillRect(x - 60, 8, 120, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('DANGER', x, 29);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('HOT PIPES', x, 70);
  ctx.fillText('DO NOT TOUCH', x, 92);
  // HIGH VOLTAGE
  x = tile(1, '#e8c21c');
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.moveTo(x, 10);
  ctx.lineTo(x + 46, 86);
  ctx.lineTo(x - 46, 86);
  ctx.closePath();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#141414';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 6, 30);
  ctx.lineTo(x - 10, 60);
  ctx.lineTo(x + 2, 60);
  ctx.lineTo(x - 6, 80);
  ctx.lineTo(x + 12, 52);
  ctx.lineTo(x, 52);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('HIGH VOLTAGE', x, 108);
  // KEEP CLEAR
  x = tile(2, '#1f5a9a');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('KEEP', x, 46);
  ctx.fillText('CLEAR', x, 78);
  // NO ENTRY
  x = tile(3, '#efece2');
  ctx.fillStyle = '#c81e14';
  ctx.beginPath();
  ctx.arc(x, 52, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 26, 45, 52, 14);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('NO ENTRY', x, 108);
  // Section plates: black stencil on yellow, scuffed.
  labels.forEach((t, i) => {
    x = tile(4 + i, '#d9b21e');
    ctx.fillStyle = '#141414';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(t, x, 66);
  });
  for (let k = 0; k < SIGN_TILES; k++) {
    // Grime, scratches, a rusty bolt in each corner.
    for (let j = 0; j < 30; j++) {
      ctx.fillStyle = `rgba(60,45,25,${(Math.random() * 0.25).toFixed(3)})`;
      ctx.fillRect(k * T + Math.random() * T, Math.random() * T, 2 + Math.random() * 14, 1 + Math.random() * 3);
    }
    ctx.fillStyle = '#5a3a20';
    for (const [bx, by] of [[6, 6], [T - 10, 6], [6, T - 10], [T - 10, T - 10]]) ctx.fillRect(k * T + bx, by, 4, 4);
  }
  return finish(c, renderer);
}

// ---- Level 3 -------------------------------------------------------------

// Old brick laid in unevenly coloured courses: reds, browns, tans, a few
// grey and black, with sooty patches and white efflorescence.
export function unevenBrickTexture(renderer, palette = 'red') {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const tones = {
    red: [[150, 70, 50], [125, 60, 45], [170, 95, 65], [110, 75, 60], [180, 120, 80], [90, 70, 62], [140, 85, 60]],
    dark: [[80, 52, 42], [70, 48, 40], [95, 62, 48], [60, 50, 46], [110, 74, 54], [50, 42, 38]],
    tan: [[180, 140, 95], [165, 120, 80], [195, 160, 110], [150, 110, 80], [175, 130, 90], [130, 100, 75]],
  }[palette];
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(0, 0, W, H);
  const rows = 22, bw = W / 4;
  const bh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < 5; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      const t = tones[Math.floor(Math.random() * tones.length)];
      const v = 0.82 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${t[0] * v | 0},${t[1] * v | 0},${t[2] * v | 0})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 3);
      // Face texture and chipped corners.
      ctx.fillStyle = `rgba(0,0,0,${(Math.random() * 0.18).toFixed(3)})`;
      ctx.fillRect(x + 2, y + bh - 6, bw - 4, 3);
      if (Math.random() < 0.2) {
        ctx.fillStyle = '#4a4038';
        ctx.fillRect(x + 2 + Math.random() * (bw - 12), y + 2, 6 + Math.random() * 8, 4);
      }
    }
  }
  blotches(ctx, W, H, 10, '20,15,10', 0.5);
  blotches(ctx, W, H, 6, '220,215,200', 0.18);
  // Grime toward the floor.
  const g = ctx.createLinearGradient(0, H * 0.65, 0, H);
  g.addColorStop(0, 'rgba(25,20,15,0)');
  g.addColorStop(1, 'rgba(25,20,15,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.65, W, H * 0.35);
  speckle(ctx, W, 9000, '20,15,10', 0.25);
  return finish(c, renderer);
}

// Glazed brick tile in brown and tan, like an old service tunnel:
// a dark brown dado below, lighter tile above, a shine on every tile.
export function glazedTileTexture(renderer) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(0, 0, W, H);
  const rows = 18, cols = 4;
  const th = H / rows, tw = W / cols;
  for (let r = 0; r < rows; r++) {
    const low = r >= rows - 6;
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      const v = 0.85 + Math.random() * 0.25;
      const base = low ? [92, 58, 30] : [168, 120, 62];
      ctx.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`;
      ctx.fillRect(x + 2, y + 2, tw - 4, th - 4);
      // Glaze highlight along the top edge and a soft sheen.
      const g = ctx.createLinearGradient(0, y, 0, y + th);
      g.addColorStop(0, 'rgba(255,240,210,0.35)');
      g.addColorStop(0.3, 'rgba(255,240,210,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 2, tw - 4, th - 4);
      if (Math.random() < 0.05) {
        // A cracked or missing tile.
        ctx.fillStyle = 'rgba(70,62,52,0.9)';
        ctx.fillRect(x + 4, y + 4, tw * (0.3 + Math.random() * 0.5), th - 8);
      }
    }
  }
  blotches(ctx, W, H, 8, '30,20,10', 0.35);
  speckle(ctx, W, 4000, '20,15,10', 0.2);
  return finish(c, renderer);
}

// Low dark ceiling, its paint flaking off in sheets.
export function flakingCeilingTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  // Old whitewash, mostly gone grey-brown, with big sheets peeling and
  // hanging off the slab and water stains spreading from the joints.
  ctx.fillStyle = '#5a554c';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 6, '25,22,18', 0.55);
  blotches(ctx, S, S, 14, '150,140,120', 0.18);
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const w = 40 + Math.random() * 120, h = 20 + Math.random() * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 1; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(a) * w * (0.5 + Math.random() * 0.5), y + Math.sin(a) * h * (0.5 + Math.random() * 0.5));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(28,25,21,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,180,160,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const g = ctx.createRadialGradient(Math.random() * S, Math.random() * S, 4, Math.random() * S, Math.random() * S, 80);
    g.addColorStop(0, 'rgba(70,50,25,0.3)');
    g.addColorStop(1, 'rgba(70,50,25,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  speckle(ctx, S, 9000, '15,12,10', 0.25);
  return finish(c, renderer);
}

// Large grey floor tiles, worn and dusty.
export function greyTileFloorTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#4c4c48';
  ctx.fillRect(0, 0, S, S);
  const n = 4, t = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 95 + Math.random() * 25;
      ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
      ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  }
  blotches(ctx, S, S, 12, '40,38,32', 0.4);
  blotches(ctx, S, S, 16, '170,165,150', 0.15);
  speckle(ctx, S, 10000, '30,30,28', 0.25);
  return finish(c, renderer);
}

// Black and white marble checker, dull with age.
export function marbleFloorTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const t = S / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const dark = (x + y) % 2 === 0;
      ctx.fillStyle = dark ? '#1c1a1a' : '#b8b2a6';
      ctx.fillRect(x * t, y * t, t, t);
      ctx.strokeStyle = dark ? 'rgba(120,110,100,0.35)' : 'rgba(80,70,60,0.35)';
      for (let k = 0; k < 4; k++) {
        ctx.lineWidth = 0.5 + Math.random();
        ctx.beginPath();
        let px = x * t + Math.random() * t, py = y * t;
        ctx.moveTo(px, py);
        for (let j = 0; j < 6; j++) {
          px += (Math.random() - 0.3) * t * 0.35;
          py += t / 6;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }
  blotches(ctx, S, S, 10, '30,25,20', 0.3);
  speckle(ctx, S, 4000, '20,20,20', 0.2);
  return finish(c, renderer);
}

// Dressed stone blocks (ashlar), dark with age.
export function stoneBlockTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(0, 0, S, S);
  const rows = 8, bh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -S / 6 : 0;
    while (x < S) {
      const w = S / 3 * (0.7 + Math.random() * 0.6);
      const v = 0.85 + Math.random() * 0.25;
      ctx.fillStyle = `rgb(${120 * v | 0},${112 * v | 0},${100 * v | 0})`;
      ctx.fillRect(x + 2, r * bh + 2, w - 4, bh - 4);
      x += w;
    }
  }
  blotches(ctx, S, S, 10, '15,12,10', 0.55);
  blotches(ctx, S, S, 8, '180,170,150', 0.12);
  speckle(ctx, S, 9000, '20,18,15', 0.3);
  return finish(c, renderer);
}

// Simple metals and paints for machinery.
export function metalTexture(renderer, kind) {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  const base = { brass: '#a8822e', copper: '#a85a30', green: '#4a5a3a', black: '#121212', ceramic: '#7a4a30', belt: '#1e1e1c', enamel: '#d8d8cc' }[kind];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  if (kind === 'brass') {
    blotches(ctx, S, S, 10, '255,230,150', 0.3);
    blotches(ctx, S, S, 12, '60,50,20', 0.45);
    blotches(ctx, S, S, 6, '60,90,60', 0.2); // verdigris
  } else if (kind === 'copper') {
    blotches(ctx, S, S, 10, '230,140,90', 0.3);
    blotches(ctx, S, S, 10, '50,30,20', 0.4);
  } else if (kind === 'green') {
    blotches(ctx, S, S, 12, '20,25,15', 0.4);
    blotches(ctx, S, S, 8, '140,150,110', 0.2);
    // Chipped paint showing metal.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(70,60,50,0.7)';
      ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 6, 1 + Math.random() * 3);
    }
  } else if (kind === 'black') {
    blotches(ctx, S, S, 8, '60,55,70', 0.25);
  } else if (kind === 'belt') {
    for (let y = 0; y < S; y += 16) {
      ctx.fillStyle = 'rgba(70,70,65,0.8)';
      ctx.fillRect(0, y, S, 4);
    }
    blotches(ctx, S, S, 8, '60,55,40', 0.3);
  } else {
    blotches(ctx, S, S, 10, '40,30,20', 0.3);
  }
  speckle(ctx, S, 1500, '20,20,20', 0.2);
  return finish(c, renderer);
}

// Black fluid seen through a pipe's sight glass: streaks and bubbles.
// Scrolled along v to show it moving.
export function blackFluidTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#050406';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 40},${50 + Math.random() * 30},${80 + Math.random() * 60},${(Math.random() * 0.5).toFixed(2)})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 4 + Math.random() * 30);
  }
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = 'rgba(180,170,200,0.35)';
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  return finish(c, null);
}

// Purple discoloration: a soft, ragged stain with transparency.
export function purpleStainTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  for (let i = 0; i < 30; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.5, y = S / 2 + (Math.random() - 0.5) * S * 0.5;
    const r = 20 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${120 + Math.random() * 60},40,${160 + Math.random() * 60},0.35)`);
    g.addColorStop(1, 'rgba(90,20,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Four dark oil paintings: an angel, a haloed figure, a winged procession,
// a burning sky. Old, cracked varnish.
export function sacredPaintingsTexture() {
  const W = 512, H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const x0 = k * 128;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, ['#2a2010', '#1a1408', '#201a12', '#3a1a08'][k]);
    g.addColorStop(1, '#0a0806');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, 128, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, 128, H);
    ctx.clip();
    const cx = x0 + 64;
    if (k === 0 || k === 1) {
      // Halo, robe, face.
      const hg = ctx.createRadialGradient(cx, 50, 4, cx, 50, 34);
      hg.addColorStop(0, 'rgba(240,200,110,0.9)');
      hg.addColorStop(1, 'rgba(240,200,110,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(x0, 0, 128, 110);
      ctx.fillStyle = k === 0 ? '#c8c0a8' : '#6a1a14';
      ctx.beginPath();
      ctx.moveTo(cx, 62);
      ctx.lineTo(cx + 32, H - 10);
      ctx.lineTo(cx - 32, H - 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8b890';
      ctx.beginPath();
      ctx.arc(cx, 52, 11, 0, Math.PI * 2);
      ctx.fill();
      if (k === 0) {
        // Wings.
        ctx.fillStyle = 'rgba(230,225,210,0.85)';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + s * 8, 70);
          ctx.quadraticCurveTo(cx + s * 62, 30, cx + s * 54, 120);
          ctx.quadraticCurveTo(cx + s * 30, 90, cx + s * 8, 92);
          ctx.fill();
        }
      }
      // The faces have been scratched out.
      ctx.strokeStyle = 'rgba(20,10,5,0.9)';
      ctx.lineWidth = 2;
      for (let j = 0; j < 7; j++) {
        ctx.beginPath();
        ctx.moveTo(cx - 10 + Math.random() * 4, 44 + Math.random() * 16);
        ctx.lineTo(cx + 10 - Math.random() * 4, 44 + Math.random() * 16);
        ctx.stroke();
      }
    } else if (k === 2) {
      // A procession of small winged figures toward a light.
      ctx.fillStyle = 'rgba(250,230,170,0.7)';
      ctx.beginPath();
      ctx.arc(cx, 30, 16, 0, Math.PI * 2);
      ctx.fill();
      for (let j = 0; j < 9; j++) {
        const px = x0 + 12 + (j % 5) * 24, py = 80 + Math.floor(j / 5) * 34;
        ctx.fillStyle = '#b8b0a0';
        ctx.fillRect(px, py, 6, 20);
        ctx.beginPath();
        ctx.arc(px + 3, py - 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Burning sky over a tower.
      const sg = ctx.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, '#5a1a08');
      sg.addColorStop(0.6, '#c85a14');
      sg.addColorStop(1, '#1a0a04');
      ctx.fillStyle = sg;
      ctx.fillRect(x0, 0, 128, H);
      ctx.fillStyle = '#0a0604';
      ctx.fillRect(cx - 8, 50, 16, H);
      ctx.beginPath();
      ctx.moveTo(cx - 12, 52);
      ctx.lineTo(cx, 28);
      ctx.lineTo(cx + 12, 52);
      ctx.fill();
    }
    // Craquelure and grime.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.6;
    for (let j = 0; j < 40; j++) {
      ctx.beginPath();
      const px = x0 + Math.random() * 128, py = Math.random() * H;
      ctx.moveTo(px, py);
      ctx.lineTo(px + (Math.random() - 0.5) * 20, py + (Math.random() - 0.5) * 20);
      ctx.stroke();
    }
    const vg = ctx.createRadialGradient(cx, H / 2, 20, cx, H / 2, 100);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(x0, 0, 128, H);
    ctx.restore();
  }
  return finish(c, null);
}

// Level 3 signs, eight tiles: OUT OF BOUNDS, DANGER HIGH VOLTAGE, LIFT,
// M.E.G. BASE GAMMA, KEEP OUT, GENERATOR, BOILER ROOM, an arrow.
export const L3_SIGNS = 8;
export function level3SignTexture(renderer) {
  const T = 128, W = T * L3_SIGNS;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = T / 2;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sign = (k, bg, fg, lines, font = 'bold 15px sans-serif') => {
    ctx.fillStyle = bg;
    ctx.fillRect(k * T, 0, T, T / 2);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.strokeRect(k * T + 4, 4, T - 8, T / 2 - 8);
    ctx.fillStyle = fg;
    ctx.font = font;
    lines.forEach((l, i) => ctx.fillText(l, k * T + T / 2, T / 4 + (i - (lines.length - 1) / 2) * 17));
  };
  sign(0, '#141414', '#e8b81c', ['OUT  OF', 'BOUNDS']);
  sign(1, '#d8c41c', '#141414', ['DANGER', 'HIGH VOLTAGE']);
  sign(2, '#1a1a18', '#e0d8c0', ['↕ LIFT'], 'bold 22px sans-serif');
  sign(3, '#e8e4d8', '#1a3a7a', ['M.E.G.', 'BASE GAMMA']);
  sign(4, '#a81a14', '#ffffff', ['KEEP OUT']);
  sign(5, '#2a3a2a', '#e0e0d0', ['GENERATOR', 'ROOM']);
  sign(6, '#3a2a1a', '#e0d0b0', ['BOILER', 'ROOM']);
  sign(7, '#e8e4d8', '#1a1a1a', ['→ EXIT →'], 'bold 18px sans-serif');
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(60,45,25,${(Math.random() * 0.25).toFixed(3)})`;
    ctx.fillRect(Math.random() * W, Math.random() * T / 2, 2 + Math.random() * 10, 1 + Math.random() * 3);
  }
  return finish(c, renderer);
}

// Wood-panelled freight lift interior, and its door plate.
export function liftPanelTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 64) {
    ctx.fillStyle = 'rgba(20,10,4,0.6)';
    ctx.fillRect(x, 0, 3, S);
  }
  for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = `rgba(30,15,5,${(Math.random() * 0.2).toFixed(3)})`;
    ctx.fillRect(x, 0, 1, S);
  }
  blotches(ctx, S, S, 8, '15,8,3', 0.4);
  return finish(c, renderer);
}

// ---- Level 4 -------------------------------------------------------------

// Off-white office wall: flat paint, scuffs at chair height, a dark grey
// vinyl baseboard. Spans the wall height once (use [u, 1/height]).
export function officeWallTexture(renderer, base = '#d9d8d0') {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 8, '160,158,145', 0.12);
  blotches(ctx, W, H, 14, '245,245,238', 0.12);
  speckle(ctx, Math.max(W, H), 4000, '140,138,125', 0.07, 1.2);
  // Scuffs where chairs and trolleys hit.
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(90,88,80,${(0.05 + Math.random() * 0.12).toFixed(3)})`;
    ctx.fillRect(Math.random() * W, H * (0.62 + Math.random() * 0.2), 4 + Math.random() * 30, 1 + Math.random() * 2);
  }
  // Baseboard.
  ctx.fillStyle = '#3c3e40';
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, H - 18, W, 2);
  return finish(c, renderer);
}

// Blue-grey commercial loop-pile carpet tile with a faint grid and stains.
export function officeCarpetTexture(renderer, color = '#555c68') {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    const fleck = Math.random() < 0.04 ? 30 : Math.random() < 0.05 ? -25 : 0;
    d[i] += n + fleck;
    d[i + 1] += n + fleck;
    d[i + 2] += n * 1.1 + fleck;
  }
  ctx.putImageData(img, 0, 0);
  // Carpet tiles, laid quarter-turned so their pile catches the light differently.
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.008)' : 'rgba(0,0,0,0.01)';
      ctx.fillRect(x * S / 2, y * S / 2, S / 2, S / 2);
    }
  }
  ctx.fillStyle = 'rgba(20,22,28,0.08)';
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, S / 2, S, 1);
  ctx.fillRect(0, 0, 1, S);
  ctx.fillRect(S / 2, 0, 1, S);
  blotches(ctx, S, S, 6, '30,28,22', 0.18);
  return finish(c, renderer);
}

// 2x2 ft acoustic ceiling tiles in a white tee-bar grid, a few stained.
export function dropCeilingTexture(renderer) {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#d4d4ce';
  ctx.fillRect(0, 0, S, S);
  // Fissured mineral-fibre texture.
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(110,108,100,${(Math.random() * 0.35).toFixed(3)})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 4, 1);
  }
  speckle(ctx, S, 9000, '140,138,128', 0.3, 1.2);
  // A faint water stain on one tile (the texture repeats, so keep it subtle).
  for (let i = 0; i < 1; i++) {
    const x = (Math.floor(Math.random() * 2) + 0.5) * S / 2, y = (Math.floor(Math.random() * 2) + 0.5) * S / 2;
    const g = ctx.createRadialGradient(x, y, 5, x, y, 70 + Math.random() * 40);
    g.addColorStop(0, 'rgba(150,120,70,0.14)');
    g.addColorStop(0.8, 'rgba(150,120,70,0.06)');
    g.addColorStop(1, 'rgba(150,120,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 128, y - 128, 256, 256);
  }
  ctx.fillStyle = '#f0f0ea';
  for (const p of [0, S / 2]) {
    ctx.fillRect(p - 4, 0, 8, S);
    ctx.fillRect(0, p - 4, S, 8);
  }
  ctx.fillRect(S - 4, 0, 4, S);
  ctx.fillRect(0, S - 4, S, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (const p of [0, S / 2]) {
    ctx.fillRect(p + 4, 0, 1, S);
    ctx.fillRect(0, p + 4, S, 1);
  }
  return finish(c, renderer);
}

// Blacked-out window: black plastic sheeting taped over the glass.
export function blackoutTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#0c0c0e';
  ctx.fillRect(0, 0, S, S);
  // Creases and sheen.
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(90,90,100,${(Math.random() * 0.2).toFixed(3)})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const x = Math.random() * S, y = Math.random() * S;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120, x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 200);
    ctx.stroke();
  }
  // Grey duct tape round the edge and across.
  ctx.fillStyle = 'rgba(150,150,145,0.9)';
  for (const [x, y, w, h] of [[0, 0, S, 14], [0, S - 14, S, 14], [0, 0, 14, S], [S - 14, 0, 14, S]]) ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(0.7);
  ctx.fillRect(-S, -6, S * 2, 12);
  ctx.restore();
  return finish(c, renderer);
}

// What a trap window shows: a pale, too-bright view of an empty city at
// dusk, slightly wrong (no lights in any window, a sun that's too big).
export function outsideViewTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#9fb4c8');
  sky.addColorStop(0.55, '#e8dcc0');
  sky.addColorStop(1, '#c8b896');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.62, H * 0.42, 10, W * 0.62, H * 0.42, 120);
  sun.addColorStop(0, 'rgba(255,250,230,1)');
  sun.addColorStop(0.3, 'rgba(255,240,200,0.7)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  // Rows of identical office blocks into the haze.
  for (let row = 0; row < 4; row++) {
    const base = H * (0.62 + row * 0.1);
    const k = 1 - row * 0.2;
    ctx.fillStyle = `rgba(${120 * k + 60},${118 * k + 60},${112 * k + 55},${0.55 + row * 0.15})`;
    for (let x = -20; x < W; x += 40 + row * 10) {
      const h = 60 + ((x * 7919 + row * 131) % 90);
      ctx.fillRect(x, base - h, 30 + row * 8, h + 200);
    }
  }
  const haze = ctx.createLinearGradient(0, H * 0.4, 0, H);
  haze.addColorStop(0, 'rgba(230,220,200,0)');
  haze.addColorStop(1, 'rgba(230,220,200,0.45)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, W, H);
  return finish(c, null);
}

// A vending machine front: lit panel of Almond Water bottles.
export function vendingTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1e3a5a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8eef0';
  ctx.fillRect(14, 14, 160, 330);
  for (let r = 0; r < 6; r++) {
    ctx.fillStyle = '#9aa0a4';
    ctx.fillRect(14, 64 + r * 50, 160, 3);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(22 + k * 31, 30 + r * 50, 16, 32);
      ctx.fillStyle = '#c8a050';
      ctx.fillRect(22 + k * 31, 42 + r * 50, 16, 8);
      ctx.fillStyle = '#2a6aa0';
      ctx.fillRect(25 + k * 31, 26 + r * 50, 10, 5);
    }
  }
  ctx.fillStyle = '#0e1c2c';
  ctx.fillRect(186, 40, 56, 120);
  ctx.fillStyle = '#40ff60';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('0.00', 194, 64);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = '#c0c4c8';
    ctx.fillRect(194 + (i % 3) * 14, 80 + Math.floor(i / 3) * 18, 10, 12);
  }
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(30, 380, 130, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('ALMOND', 22, 488);
  ctx.fillText('WATER', 120, 488);
  return finish(c, null);
}

// Whiteboard with half-erased writing; cork board with pinned notices; a
// bland corporate poster. Three tiles in a row.
export function officeBoardsTexture(renderer) {
  const T = 256;
  const c = document.createElement('canvas');
  c.width = T * 3;
  c.height = T / 2;
  const ctx = c.getContext('2d');
  // Whiteboard.
  ctx.fillStyle = '#eef0ee';
  ctx.fillRect(0, 0, T, T / 2);
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,60,140' : '60,60,60'},${(0.1 + Math.random() * 0.3).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let x = 14 + Math.random() * 40, y = 16 + i * 12;
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      x += 8 + Math.random() * 14;
      ctx.lineTo(x, y + (Math.random() - 0.5) * 6);
    }
    ctx.stroke();
  }
  blotches(ctx, T, T / 2, 6, '160,170,180', 0.15);
  ctx.fillStyle = '#9a9ea0';
  ctx.fillRect(0, T / 2 - 6, T, 6);
  // Cork board.
  ctx.fillStyle = '#a07a4a';
  ctx.fillRect(T, 0, T, T / 2);
  speckle(ctx, T * 3, 3000, '60,40,20', 0.25);
  for (let i = 0; i < 6; i++) {
    const x = T + 12 + (i % 3) * 80 + Math.random() * 10, y = 10 + Math.floor(i / 3) * 58 + Math.random() * 6;
    ctx.fillStyle = ['#f4f0e0', '#f0e68c', '#e8f0f8'][i % 3];
    ctx.fillRect(x, y, 56, 46);
    ctx.fillStyle = 'rgba(40,40,40,0.5)';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + 6, y + 10 + k * 8, 40 - (k % 2) * 12, 2);
    ctx.fillStyle = '#c82020';
    ctx.beginPath();
    ctx.arc(x + 28, y + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#6a5030';
  ctx.lineWidth = 6;
  ctx.strokeRect(T + 3, 3, T - 6, T / 2 - 6);
  // Poster: a blue sky and one word.
  const g = ctx.createLinearGradient(0, 0, 0, T / 2);
  g.addColorStop(0, '#4a7ab0');
  g.addColorStop(1, '#a8c8e0');
  ctx.fillStyle = g;
  ctx.fillRect(T * 2, 0, T, T / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px serif';
  ctx.textAlign = 'center';
  ctx.fillText('TEAMWORK', T * 2.5, T / 2 - 22);
  ctx.font = '10px serif';
  ctx.fillText('Together, we go further.', T * 2.5, T / 2 - 8);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 6;
  ctx.strokeRect(T * 2 + 3, 3, T - 6, T / 2 - 6);
  return finish(c, renderer);
}

// Brushed stainless steel (elevator doors, fountains).
export function brushedSteelTexture(renderer) {
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#9ea2a4';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${(Math.random() * 0.06).toFixed(3)})`;
    ctx.fillRect(0, y, S, 1);
  }
  blotches(ctx, S, S, 6, '60,62,64', 0.12);
  return finish(c, renderer);
}

// Level 4 signs, eight tiles: STAIRS, EXIT (green), ELEVATOR, BASEMENT,
// M.E.G. OUTPOST, and three room numbers.
export const L4_SIGNS = 8;
export function level4SignTexture(renderer) {
  const T = 128, W = T * L4_SIGNS;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = T / 2;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sign = (k, bg, fg, text, font = 'bold 20px sans-serif') => {
    ctx.fillStyle = bg;
    ctx.fillRect(k * T, 0, T, T / 2);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.fillText(text, k * T + T / 2, T / 4 + 1);
  };
  sign(0, '#2a2c30', '#e8e8e0', 'STAIRS');
  sign(1, '#0a3a1a', '#40e070', 'EXIT', 'bold 28px sans-serif');
  sign(2, '#2a2c30', '#e8e8e0', 'ELEVATOR', 'bold 17px sans-serif');
  sign(3, '#2a2c30', '#e8c060', 'BASEMENT', 'bold 17px sans-serif');
  sign(4, '#e8e4d8', '#1a3a7a', 'M.E.G. OUTPOST', 'bold 14px sans-serif');
  for (let k = 0; k < 3; k++) sign(5 + k, '#b8b4a8', '#2a2a2a', `4${Math.floor(Math.random() * 9)}${Math.floor(Math.random() * 10)}`, 'bold 24px sans-serif');
  return finish(c, renderer);
}

// Wood veneer office door with a steel kick plate and a narrow wired
// glass vision panel (or none).
export function officeDoorTexture(renderer, glass = true, tone = '#8a6440') {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 2) {
    ctx.fillStyle = `rgba(40,20,5,${(Math.random() * 0.15).toFixed(3)})`;
    ctx.fillRect(x, 0, 1, H);
  }
  if (glass) {
    ctx.fillStyle = '#1a1c1e';
    ctx.fillRect(W * 0.62, 30, 22, 90);
    ctx.strokeStyle = 'rgba(160,160,160,0.4)';
    for (let k = 0; k < 90; k += 8) {
      ctx.beginPath();
      ctx.moveTo(W * 0.62, 30 + k);
      ctx.lineTo(W * 0.62 + 22, 30 + k);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#9a9ea0';
  ctx.fillRect(0, H - 26, W, 26);
  return finish(c, renderer);
}
