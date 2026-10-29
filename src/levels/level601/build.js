import * as THREE from 'three';
import { ChunkedBuilders, TubeBuilder } from '../../world/tubes.js';
import { SURFACE, createWorldMaterial } from '../../world/materials.js';
import { mergeGeometries } from '../../world/props.js';
import { CELL, HEIGHT, COLS, ROWS, STORE_TOP, BULKHEAD, HALL } from './layout.js';

// The bookshop: empty oak shelving, slatted A-frame displays, curved
// service desks with beige computers, sage-green pillars covered in
// THE END posters, and a yellow bulkhead with metal letters on it.

const H = HEIGHT;

// ---- Textures ------------------------------------------------------------------

function canvasTex(w, h, draw, own, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  own.textures.push(t);
  return t;
}

function grain(ctx, w, h, base, lines, alpha = 0.18) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < lines; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '90,50,20' : '255,220,170'},${(Math.random() * alpha).toFixed(3)})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 2);
    ctx.stroke();
  }
}

export function libraryTextures(renderer, own) {
  const T = {};
  T.oak = canvasTex(256, 256, (ctx, w, h) => grain(ctx, w, h, '#b98d5a', 140), own);
  T.oakDark = canvasTex(128, 128, (ctx, w, h) => grain(ctx, w, h, '#7a5634', 60, 0.25), own);
  T.oakBack = canvasTex(128, 128, (ctx, w, h) => grain(ctx, w, h, '#8e6844', 60, 0.2), own);
  T.oakEdge = canvasTex(64, 64, (ctx, w, h) => grain(ctx, w, h, '#c99c64', 30, 0.15), own);
  T.cream = canvasTex(16, 16, (ctx, w, h) => {
    ctx.fillStyle = '#efe6cc';
    ctx.fillRect(0, 0, w, h);
  }, own);
  // Clean beige ceiling tiles: two by two to a texture, faint pinholes.
  T.ceiling = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cdc3ab';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(120,110,90,${(Math.random() * 0.18).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    ctx.fillStyle = '#e2dccc';
    for (const p of [0, w / 2]) {
      ctx.fillRect(p, 0, 3, h);
      ctx.fillRect(0, p, w, 3);
    }
    ctx.fillStyle = 'rgba(80,70,50,0.25)';
    for (const p of [3, w / 2 + 3]) {
      ctx.fillRect(p, 0, 1, h);
      ctx.fillRect(0, p, w, 1);
    }
  }, own);
  T.carpet = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3c3b3d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const c = Math.random();
      ctx.fillStyle = c < 0.5 ? `rgba(20,20,24,${(Math.random() * 0.4).toFixed(2)})` : c < 0.9 ? `rgba(110,108,112,${(Math.random() * 0.25).toFixed(2)})` : `rgba(70,80,110,${(Math.random() * 0.3).toFixed(2)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }, own);
  T.signs = canvasTex(512, 512, (ctx, w, h) => {
    const words = ['FICTION', 'THE END', 'BIOGRAPHY', 'TRAVEL', 'THE END', 'CHILDREN', 'HISTORY', 'HOME'];
    words.forEach((t, i) => {
      const y = i * 64;
      ctx.fillStyle = i % 4 === 1 ? '#1a1a1a' : '#2a5a3a';
      ctx.fillRect(0, y, w, 64);
      ctx.fillStyle = i % 4 === 1 ? '#efe25a' : '#f2ecd8';
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, w / 2, y + 34);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, y + 2, w, 3);
    });
  }, own, false);
  T.slat = canvasTex(128, 128, (ctx, w, h) => {
    grain(ctx, w, h, '#c08a4a', 50);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = 'rgba(40,24,10,0.75)';
      ctx.fillRect(0, y, w, 3);
      ctx.fillStyle = 'rgba(255,230,190,0.25)';
      ctx.fillRect(0, y + 3, w, 1);
    }
  }, own);
  T.wall = canvasTex(256, 512, (ctx, w, h) => {
    // Cream above, mustard yellow below, a thin line between.
    ctx.fillStyle = '#e9e2c8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d6b24a';
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = '#a8862e';
    ctx.fillRect(0, h * 0.615, w, 4);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(80,70,40,${(Math.random() * 0.06).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const g = ctx.createLinearGradient(0, h * 0.94, 0, h);
    g.addColorStop(0, 'rgba(60,50,20,0)');
    g.addColorStop(1, 'rgba(60,50,20,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.94, w, h * 0.06);
  }, own);
  T.hallWall = canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e4dcc4';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b89a5a';
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(80,70,40,${(Math.random() * 0.06).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, own);
  T.sage = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9fb48e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(40,60,30,${(Math.random() * 0.08).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, own);
  T.backCarpet = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8c8e94';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = (x + y) % 64 ? 'rgba(60,62,70,0.35)' : 'rgba(200,200,210,0.2)';
      ctx.fillRect(x + 4, y + 4, 24, 24);
      ctx.strokeStyle = 'rgba(40,40,48,0.3)';
      ctx.strokeRect(x + 10, y + 10, 12, 12);
    }
    for (let i = 0; i < 8000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '40,40,50' : '220,220,230'},${(Math.random() * 0.12).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }, own);
  T.yellow = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e2c25a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(120,90,20,${(Math.random() * 0.08).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, own);
  T.metal = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#6a6c6e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${(Math.random() * 0.1).toFixed(3)})`;
      ctx.fillRect(0, y, w, 1);
    }
  }, own);
  T.beige = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#d6cdb2';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(90,80,50,${(Math.random() * 0.08).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, own);
  const solid = (c) => canvasTex(16, 16, (ctx, w, h) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, w, h);
  }, own);
  T.dark = solid('#222224');
  T.pink = solid('#f07aa8');
  T.blue = solid('#6aa8f0');
  T.vent = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c8c6c0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a5a58';
    for (let y = 6; y < h - 4; y += 6) ctx.fillRect(4, y, w - 8, 3);
    ctx.strokeStyle = '#8a8a88';
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }, own, false);
  T.poster = canvasTex(256, 360, (ctx, w, h) => poster(ctx, w, h), own, false);
  T.notes = canvasTex(256, 64, (ctx, w, h) => {
    const cols = ['#f08ab8', '#8ae08a', '#f0e070', '#90c8f0'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect(i * 64 + 2, 2, 60, 60);
      ctx.strokeStyle = 'rgba(30,30,60,0.8)';
      ctx.lineWidth = 1.2;
      for (let l = 0; l < 5; l++) {
        ctx.beginPath();
        let x = i * 64 + 8;
        ctx.moveTo(x, 14 + l * 9);
        while (x < i * 64 + 54) {
          x += 3 + Math.random() * 4;
          ctx.lineTo(x, 14 + l * 9 + (Math.random() - 0.5) * 3);
        }
        ctx.stroke();
      }
    }
  }, own, false);
  T.glass = canvasTex(64, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#eef2f4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, own, false);
  T.neon = canvasTex(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#100404';
    ctx.fillRect(0, 0, w, h);
    ctx.font = 'bold 68px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff2020';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff6a5a';
    ctx.fillText('EXIT', w / 2, h / 2 + 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd8d0';
    ctx.fillText('EXIT', w / 2, h / 2 + 4);
  }, own, false);
  return T;
}

// A yellow THE END poster, like the ones taped to every pillar.
function poster(ctx, w, h) {
  ctx.fillStyle = '#efe25a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = '#efe25a';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE END', w / 2, 52);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 30px sans-serif';
  for (let i = 0; i < 4; i++) ctx.fillText(i % 2 ? 'END THE END' : 'THE END THE', w / 2, 102 + i * 34);
  ctx.font = 'bold 14px sans-serif';
  for (let i = 0; i < 9; i++) ctx.fillText('THE END THE END THE END THE END', w / 2, 248 + i * 12);
  ctx.fillRect(0, h - 10, w, 10);
}

// Draw a terminal screen: dark glass, green text, a blinking cursor.
export function drawScreen(ctx, lines, cursor, on = true) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.fillStyle = on ? '#08140c' : '#1a1c1a';
  ctx.fillRect(0, 0, w, h);
  if (!on) return;
  ctx.fillStyle = '#7cf09a';
  ctx.font = 'bold 15px monospace';
  ctx.textBaseline = 'top';
  let y = 10;
  for (const l of lines.slice(-9)) {
    ctx.fillText(l, 10, y);
    y += 18;
  }
  if (cursor) ctx.fillRect(10 + ctx.measureText(lines[lines.length - 1] || '').width + 2, y - 18, 9, 15);
  // Scanlines and a soft vignette.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let sy = 0; sy < h; sy += 3) ctx.fillRect(0, sy, w, 1);
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---- Metal letters -------------------------------------------------------------------

// Strokes on a 4 x 6 grid.
const GLYPHS = {
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  D: [[0, 0, 0, 6], [0, 6, 2.6, 6], [2.6, 6, 4, 4.6], [4, 4.6, 4, 1.4], [4, 1.4, 2.6, 0], [2.6, 0, 0, 0]],
  I: [[2, 0, 2, 6], [1, 6, 3, 6], [1, 0, 3, 0]],
  S: [[4, 6, 0.6, 6], [0.6, 6, 0, 5.2], [0, 5.2, 0, 3.6], [0, 3.6, 0.6, 3], [0.6, 3, 3.4, 3], [3.4, 3, 4, 2.4], [4, 2.4, 4, 0.8], [4, 0.8, 3.4, 0], [3.4, 0, 0, 0]],
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [0.9, 2.4, 3.1, 2.4]],
  R: [[0, 0, 0, 6], [0, 6, 3.3, 6], [3.3, 6, 4, 5.3], [4, 5.3, 4, 3.7], [4, 3.7, 3.3, 3], [3.3, 3, 0, 3], [1.6, 3, 4, 0]],
};

// Block letters as geometry, centred on x = 0, standing on y = 0, facing +z.
export function lettersGeometry(text, height, depth = 0.06) {
  const s = height / 6, stroke = s * 0.95, gap = 1.6;
  const parts = [];
  const widths = [...text].map((c) => (c === ' ' ? 2.5 : 4));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let x = -total / 2;
  [...text].forEach((c, i) => {
    for (const [x0, y0, x1, y1] of GLYPHS[c] || []) {
      const dx = (x1 - x0) * s, dy = (y1 - y0) * s;
      const g = new THREE.BoxGeometry(Math.hypot(dx, dy) + stroke, stroke, depth);
      g.rotateZ(Math.atan2(dy, dx));
      g.translate((x + (x0 + x1) / 2) * s, ((y0 + y1) / 2) * s + stroke / 2, depth / 2);
      parts.push(g);
    }
    x += widths[i] + gap;
  });
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return geo;
}

// ---- Furniture builders ------------------------------------------------------------------

// Shelving: `len` long (local x), double- or single-sided (back at -z).
function shelfUnit(b, cx, cz, len, rot, sides) {
  const D = sides === 2 ? 1.0 : 0.5, Ht = 2.35;
  // One-sided shelving stands with its back to the wall (local -z).
  const off = sides === 2 ? 0 : -0.28;
  const P = (lx, lz) => [cx + lx * Math.cos(rot) + (lz + off) * Math.sin(rot), cz - lx * Math.sin(rot) + (lz + off) * Math.cos(rot)];
  const box = (name, lx, y, lz, sx, sy, sz) => {
    const [x, z] = P(lx, lz);
    b.at(name, x, z).box(x, y, z, sx, sy, sz, rot, 1);
  };
  // A recessed dark toe-kick, a back panel, a crown on top.
  box('dark', 0, 0.05, 0, len - 0.04, 0.1, D - 0.14);
  box('oakBack', 0, 1.2, sides === 2 ? 0 : -D / 2 + 0.015, len, 2.2, 0.03);
  box('oak', 0, Ht - 0.03, 0, len + 0.06, 0.06, D + 0.04);
  box('oakDark', 0, Ht - 0.075, 0, len + 0.02, 0.03, D);
  // Uprights every 60 cm, so it reads as rows of cubbies.
  const units = Math.max(1, Math.round(len / 0.62));
  for (let k = 0; k <= units; k++) box(k === 0 || k === units ? 'oak' : 'oakEdge', -len / 2 + (k * len) / units, Ht / 2, 0, k === 0 || k === units ? 0.05 : 0.03, Ht, D);
  for (let k = 0; k <= 6; k++) {
    const y = 0.12 + k * 0.32;
    box('oak', 0, y, 0, len - 0.02, 0.025, D - 0.04);
    // The darker front lip of each shelf.
    for (const s of sides === 2 ? [-1, 1] : [1]) box('oakDark', 0, y + 0.02, s * (D / 2 - 0.02), len - 0.04, 0.045, 0.02);
  }
}

// A tall tapering slatwall display.
function aFrame(b, cx, cz, rot) {
  const bw = 1.0, bd = 0.85, tw = 0.42, td = 0.22, Ht = 2.75;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, y, lz) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
  const t = b.at('slat', cx, cz);
  const q = (a, bb, cc, d, n) => t.quad(P(...a), P(...bb), P(...cc), P(...d), n, [0, 0], [1, 0], [1, Ht], [0, Ht]);
  const N = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
  const fy = (bd - td) / 2 / Ht, fx = (bw - tw) / 2 / Ht;
  q([-bw / 2, 0, bd / 2], [bw / 2, 0, bd / 2], [tw / 2, Ht, td / 2], [-tw / 2, Ht, td / 2], N(0, fy, 1));
  q([bw / 2, 0, -bd / 2], [-bw / 2, 0, -bd / 2], [-tw / 2, Ht, -td / 2], [tw / 2, Ht, -td / 2], N(0, fy, -1));
  q([bw / 2, 0, bd / 2], [bw / 2, 0, -bd / 2], [tw / 2, Ht, -td / 2], [tw / 2, Ht, td / 2], N(1, fx, 0));
  q([-bw / 2, 0, -bd / 2], [-bw / 2, 0, bd / 2], [-tw / 2, Ht, td / 2], [-tw / 2, Ht, -td / 2], N(-1, fx, 0));
  b.at('oakDark', cx, cz).box(cx, Ht + 0.02, cz, tw, 0.04, td, rot);
  // A couple of little shelves near the bottom.
  for (const y of [0.35, 0.75]) {
    const w = bw - (bw - tw) * (y / Ht);
    const d = bd - (bd - td) * (y / Ht);
    for (const sd of [-1, 1]) {
      const [x, , z] = P(0, y, sd * (d / 2 + 0.1));
      b.at('oak', x, z).box(x, y, z, w * 0.9, 0.025, 0.2, rot);
    }
  }
}

// A curved service desk, with a lower end where the computer sits.
// Returns where the monitor is (world space) and which way it faces.
function desk(b, d) {
  const x0 = d.x0 * CELL, x1 = (d.x1 + 1) * CELL, z0 = d.y0 * CELL, z1 = (d.y1 + 1) * CELL;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const face = d.face;
  // Local frame: customers at +z.
  const rot = face === 2 ? 0 : face === 3 ? Math.PI : face === 0 ? Math.PI / 2 : -Math.PI / 2;
  const W = face <= 1 ? z1 - z0 : x1 - x0, Dp = face <= 1 ? x1 - x0 : z1 - z0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const R = W * 0.9, span = 2 * Math.asin(Math.min(0.98, (W / 2 - 0.1) / R));
  const n = 14;
  // Which end is low (the terminal end): the end nearer the terminal cell.
  const termL = face <= 1 ? (d.term + 0.5) * CELL - cz : (d.term + 0.5) * CELL - cx;
  const lowEnd = (face === 0 || face === 3 ? -termL : termL) < 0 ? -1 : 1;
  for (let k = 0; k < n; k++) {
    const a0 = -span / 2 + (k / n) * span, a1 = -span / 2 + ((k + 1) / n) * span, am = (a0 + a1) / 2;
    const segW = 2 * R * Math.sin((a1 - a0) / 2) + 0.06;
    const lx = R * Math.sin(am), lz = Dp / 2 - 0.3 - R * (1 - Math.cos(am));
    const low = Math.sign(lx) === lowEnd && Math.abs(lx) > W * 0.26;
    const hgt = low ? 0.78 : 1.06;
    const [x, z] = P(lx, lz);
    const r = rot + am;
    b.at('oak', x, z).box(x, hgt / 2, z, segW, hgt - 0.04, 0.42, r);
    b.at('oakDark', x, z).box(x, 0.04, z, segW, 0.08, 0.44, r);
    const [tx, tz] = P(lx + Math.sin(am) * 0.06, lz + Math.cos(am) * 0.06);
    b.at('oak', tx, tz).box(tx, hgt + 0.02, tz, segW + 0.04, 0.04, 0.6, r);
    // The clerk's side: a lower work surface.
    const [ix, iz] = P(lx - Math.sin(am) * 0.55, lz - Math.cos(am) * 0.55);
    b.at('oak', ix, iz).box(ix, 0.74, iz, segW, 0.04, 0.6, r);
  }
  // The computer: on the low end of the counter, facing the customer.
  const ml = lowEnd * W * 0.32;
  const am = Math.asin(Math.max(-1, Math.min(1, ml / R)));
  const mz = Dp / 2 - 0.3 - R * (1 - Math.cos(am)) + 0.02;
  const [mx, mzw] = P(ml, mz);
  const mr = rot + am;
  return { x: mx, z: mzw, y: 0.8, rot: mr };
}

// A beige computer: monitor with sticky notes, the case under it, a keyboard.
export function buildComputer(b, at) {
  const { x, z, y, rot } = at;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const box = (name, lx, ly, lz, sx, sy, sz) => {
    const [px, py, pz] = P(lx, ly, lz);
    b.at(name, px, pz).box(px, py, pz, sx, sy, sz, rot, 1);
  };
  box('beige', 0, 0.07, -0.02, 0.46, 0.13, 0.4);
  box('beige', 0, 0.37, -0.06, 0.4, 0.36, 0.36);
  box('beige', 0, 0.37, -0.28, 0.3, 0.28, 0.12);
  box('beige', 0, 0.006, 0.28, 0.44, 0.025, 0.15);
  box('dark', 0.3, 0.008, 0.28, 0.06, 0.02, 0.09);
  // Sticky notes on the top corners of the monitor.
  box('pink', -0.17, 0.53, 0.115, 0.07, 0.07, 0.01);
  box('blue', 0.17, 0.53, 0.115, 0.07, 0.07, 0.01);
  // Screen plane position, for the level to put a live texture on.
  const [sx, sy, sz] = P(0, 0.38, 0.125);
  return { x: sx, y: sy, z: sz, rot };
}

export function buildLibrary(L, shared, T, own) {
  const group = new THREE.Group();
  const mat = (tex, scale = 1) => {
    const m = createWorldMaterial(shared, tex, SURFACE.PLAIN, scale);
    own.mats.push(m);
    return m;
  };
  const M = {
    oak: mat(T.oak, 1 / 1.2), oakDark: mat(T.oakDark, 1 / 0.8), oakBack: mat(T.oakBack, 1 / 1.2), oakEdge: mat(T.oakEdge, 1 / 0.5), cream: mat(T.cream, 1), slat: mat(T.slat, [1, 1 / 1.6]), beige: mat(T.beige, 2),
    dark: mat(T.dark, 1), pink: mat(T.pink, 1), blue: mat(T.blue, 1), sage: mat(T.sage, 1), yellow: mat(T.yellow, 1), metal: mat(T.metal, 2), vent: mat(T.vent, 1 / 0.6),
  };
  const b = new ChunkedBuilders(14);
  const screens = [];
  for (const f of L.furniture) {
    const cx = ((f.x0 + f.x1 + 1) / 2) * CELL, cz = ((f.y0 + f.y1 + 1) / 2) * CELL;
    if (f.type === 'shelf') {
      if (f.along === 'x') {
        const rot = f.sides === 1 ? (f.face === 2 ? 0 : Math.PI) : 0;
        shelfUnit(b, cx, cz, (f.x1 - f.x0 + 1) * CELL - 0.08, rot, f.sides);
      } else {
        const rot = f.sides === 1 ? (f.face === 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI / 2;
        shelfUnit(b, cx, cz, (f.y1 - f.y0 + 1) * CELL - 0.08, rot, f.sides);
      }
    } else if (f.type === 'aframe') {
      aFrame(b, cx, cz, f.rot);
    } else if (f.type === 'desk') {
      const at = desk(b, f);
      f.screen = buildComputer(b, at);
      screens.push(f);
    } else if (f.type === 'pillar') {
      // Wooden plinth and capital around a sage-green column.
      b.at('oak', cx, cz).box(cx, 0.45, cz, 0.9, 0.9, 0.9);
      b.at('oakDark', cx, cz).box(cx, 0.05, cz, 0.94, 0.1, 0.94);
      b.at('oak', cx, cz).box(cx, H - 0.25, cz, 0.94, 0.5, 0.94);
      b.at('beige', cx, cz).box(cx, H - 0.55, cz, 0.96, 0.1, 0.96);
    }
  }
  // Ceiling vents scattered over the shop.
  for (let i = 0; i < 46; i++) {
    const x = (2 + Math.floor(Math.random() * (COLS - 4))) * CELL + CELL / 2;
    const z = (STORE_TOP + 2 + Math.floor(Math.random() * (ROWS - STORE_TOP - 4))) * CELL + CELL / 2;
    b.at('vent', x, z).quad([x - 0.3, H - 0.006, z - 0.3], [x + 0.3, H - 0.006, z - 0.3], [x + 0.3, H - 0.006, z + 0.3], [x - 0.3, H - 0.006, z + 0.3], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  }
  // The yellow bulkhead across the back of the shop.
  const bz = BULKHEAD * CELL;
  const bx0 = 8 * CELL, bx1 = 56 * CELL;
  b.at('yellow', (bx0 + bx1) / 2, bz).aabb(bx0, H - 0.95, bz - 0.5, bx1, H, bz + 0.5, 1);
  b.at('oakDark', (bx0 + bx1) / 2, bz).aabb(bx0 - 0.02, H - 0.98, bz + 0.48, bx1 + 0.02, H - 0.93, bz + 0.53, 1);
  b.at('cream', (bx0 + bx1) / 2, bz).aabb(bx0 - 0.02, H - 0.98, bz - 0.53, bx1 + 0.02, H - 0.93, bz - 0.48, 1);
  // Glass front doors (white light behind them) in the south wall.
  const sz = ROWS * CELL - 0.09;
  for (let k = 0; k < 3; k++) {
    const dx = (28.5 + k * 2.2) * CELL;
    for (const s of [-0.9, 0, 0.9]) b.at('metal', dx + s, sz).box(dx + s, 1.15, sz - 0.03, 0.08, 2.3, 0.08);
    b.at('metal', dx, sz).box(dx, 2.33, sz - 0.03, 1.9, 0.08, 0.08);
    b.at('metal', dx, sz).box(dx, 1.0, sz - 0.09, 1.6, 0.04, 0.04);
  }
  for (const g of b.finish(group, M)) own.geos.push(g);

  // Downlights under the bulkhead, glowing.
  const dlMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
  own.mats.push(dlMat);
  const dlGeo = new THREE.CircleGeometry(0.11, 16).rotateX(Math.PI / 2);
  own.geos.push(dlGeo);
  for (let x = bx0 + 1.2; x < bx1; x += 2.4) {
    const d = new THREE.Mesh(dlGeo, dlMat);
    d.position.set(x, H - 0.955, bz);
    group.add(d);
  }
  // Hanging signs over the aisles, on thin wires.
  const signMat = new THREE.MeshBasicMaterial({ map: T.signs });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  own.mats.push(signMat, wireMat);
  const wireGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4);
  own.geos.push(wireGeo);
  const signRows = [46.5, 58.5, 70.5];
  const signCols = [9, 22, 41, 54];
  let si = 0;
  for (const r of signRows) for (const c of signCols) {
    const g = new THREE.PlaneGeometry(1.5, 0.19);
    const k = si++ % 8;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (7 - k + uv.getY(i)) / 8);
    own.geos.push(g);
    const m = new THREE.Mesh(g, signMat);
    // Facing down the aisle.
    m.position.set(c * CELL, H - 0.75, r * CELL);
    m.rotation.y = Math.PI / 2 + (si % 2) * 0.03;
    const back = m.clone();
    back.rotation.y += Math.PI;
    group.add(m, back);
    for (const sz of [-0.6, 0.6]) {
      const w = new THREE.Mesh(wireGeo, wireMat);
      w.position.set(c * CELL, H - 0.35, r * CELL + sz);
      group.add(w);
    }
  }

  // Glass panes: just light.
  const glassMat = new THREE.MeshBasicMaterial({ map: T.glass, color: 0xffffff });
  own.mats.push(glassMat);
  const paneGeo = new THREE.PlaneGeometry(1.76, 2.26);
  own.geos.push(paneGeo);
  for (let k = 0; k < 3; k++) {
    const p = new THREE.Mesh(paneGeo, glassMat);
    p.position.set((28.5 + k * 2.2) * CELL, 1.15, sz - 0.02);
    p.rotation.y = Math.PI;
    group.add(p);
  }
  // Posters and notes on the pillars.
  const posterMat = mat(T.poster, 1);
  const notesMat = mat(T.notes, 1);
  const pb = new TubeBuilder(), nb = new TubeBuilder();
  for (const p of L.pillars) {
    const cx = (p.x + 0.5) * CELL, cz = (p.y + 0.5) * CELL;
    for (let face = 0; face < 4; face++) {
      if (Math.random() < 0.35) continue;
      const a = (face * Math.PI) / 2;
      const nx = Math.sin(a), nz = Math.cos(a);
      const r = 0.37;
      const ux = Math.cos(a), uz = -Math.sin(a);
      const y0 = 1.55 + Math.random() * 0.2, w = 0.5, h = 0.7;
      const at = (u, y) => [cx + nx * r + ux * u, y, cz + nz * r + uz * u];
      pb.quad(at(-w / 2, y0), at(w / 2, y0), at(w / 2, y0 + h), at(-w / 2, y0 + h), [nx, 0, nz], [0, 0], [1, 0], [1, 1], [0, 1]);
      // A couple of sticky notes under it.
      const k = Math.floor(Math.random() * 4);
      const ny0 = 1.1 + Math.random() * 0.2;
      nb.quad(at(-0.1, ny0), at(0.08, ny0), at(0.08, ny0 + 0.18), at(-0.1, ny0 + 0.18), [nx, 0, nz], [k / 4, 0], [(k + 1) / 4, 0], [(k + 1) / 4, 1], [k / 4, 1]);
    }
  }
  for (const [tb, m] of [[pb, posterMat], [nb, notesMat]]) {
    const g = tb.build();
    if (!g) continue;
    own.geos.push(g);
    group.add(new THREE.Mesh(g, m));
  }

  // Terminal screens: a canvas each.
  for (const f of screens) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 200;
    const tex = new THREE.CanvasTexture(c);
    own.textures.push(tex);
    const m = new THREE.MeshBasicMaterial({ map: tex });
    own.mats.push(m);
    const g = new THREE.PlaneGeometry(0.32, 0.25);
    own.geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(f.screen.x, f.screen.y, f.screen.z);
    mesh.rotation.y = f.screen.rot;
    group.add(mesh);
    f.canvas = c;
    f.ctx2d = c.getContext('2d');
    f.tex = tex;
    drawScreen(f.ctx2d, [], false, false);
    tex.needsUpdate = true;
  }

  // Metal letters on the bulkhead (rebuilt as the words change).
  const letters = new THREE.Group();
  group.add(letters);
  const letterMat = mat(T.metal, 3);

  // A neon EXIT sign over the hallway door (lit at the end) and the front doors.
  const neonMat = new THREE.MeshBasicMaterial({ map: T.neon, color: 0x000000 });
  own.mats.push(neonMat);
  const neonGeo = new THREE.PlaneGeometry(0.9, 0.34);
  own.geos.push(neonGeo);
  const hallNeon = new THREE.Mesh(neonGeo, neonMat.clone());
  own.mats.push(hallNeon.material);
  hallNeon.position.set(3 * CELL, 2.65, STORE_TOP * CELL + 0.1);
  group.add(hallNeon);
  const frontNeon = new THREE.Mesh(neonGeo, neonMat.clone());
  own.mats.push(frontNeon.material);
  frontNeon.position.set((28.5 + 2.2) * CELL, 2.62, ROWS * CELL - 0.1);
  frontNeon.rotation.y = Math.PI;
  group.add(frontNeon);
  // The EXIT door at the far end of the hallway.
  const endDoor = new THREE.Group();
  const ex = (HALL.x1 + 1) * CELL - 0.09, ez = (HALL.row + 1) * CELL;
  const endLeaf = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), glassMat);
  endLeaf.position.set(ex, 1.05, ez);
  endLeaf.rotation.y = -Math.PI / 2;
  const endNeon = new THREE.Mesh(neonGeo, neonMat.clone());
  own.mats.push(endNeon.material);
  endNeon.position.set(ex - 0.02, 2.5, ez);
  endNeon.rotation.y = -Math.PI / 2;
  own.geos.push(endLeaf.geometry);
  endDoor.add(endLeaf, endNeon);
  endDoor.visible = false;
  group.add(endDoor);

  return { group, M, letters, letterMat, screens, hallNeon, frontNeon, endDoor, endNeon, posterMat, notesMat };
}

// Rebuild the words on the bulkhead.
export function setLetters(lib, text, own) {
  const g = lib.letters;
  for (const m of g.children) m.geometry.dispose();
  g.clear();
  const geo = lettersGeometry(text, 0.42, 0.05);
  const m = new THREE.Mesh(geo, lib.letterMat);
  m.position.set(32 * CELL, HEIGHT - 0.7, BULKHEAD * CELL + 0.54);
  g.add(m);
  void own;
}
