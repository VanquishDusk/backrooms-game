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
