import * as THREE from 'three';

// Procedural skins for the entity library. Textures are cached and shared
// by every instance, so spawning many entities costs nothing extra.

const cache = new Map();

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function noise(ctx, w, h, n, rgb, a, size = 1.5) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${rgb},${(Math.random() * a).toFixed(3)})`;
    const s = 0.5 + Math.random() * size;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function blobs(ctx, w, h, n, rgb, a, r0, r1) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = r0 + Math.random() * (r1 - r0);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function veins(ctx, w, h, n, color, width = 1.2) {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    let x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI * 2;
    ctx.lineWidth = width * (0.5 + Math.random());
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      a += (Math.random() - 0.5) * 1.2;
      x += Math.cos(a) * 7;
      y += Math.sin(a) * 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Grey-white skin with blue veins: Skin-Stealer true form.
export const paleSkin = () => cached('paleSkin', () => {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#d9d6d0';
  ctx.fillRect(0, 0, 256, 256);
  blobs(ctx, 256, 256, 30, '170,160,175', 0.35, 10, 40);
  veins(ctx, 256, 256, 22, 'rgba(90,110,150,0.35)');
  noise(ctx, 256, 256, 4000, '120,110,110', 0.12);
  return tex(c);
});

// Hairless, wrinkled grey-pink hide: Hounds.
export const houndSkin = () => cached('houndSkin', () => {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#8f7f7a';
  ctx.fillRect(0, 0, 256, 256);
  blobs(ctx, 256, 256, 40, '60,45,45', 0.4, 8, 30);
  blobs(ctx, 256, 256, 20, '170,130,125', 0.35, 10, 30);
  ctx.strokeStyle = 'rgba(50,35,35,0.35)';
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 256, x = Math.random() * 256;
    ctx.lineWidth = 0.8 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10, y + (Math.random() - 0.5) * 8, x + 20 + Math.random() * 20, y);
    ctx.stroke();
  }
  noise(ctx, 256, 256, 5000, '40,30,30', 0.15);
  return tex(c);
});

// Raw red flesh with darker veins and wet highlights: Wretches, Clumps.
export const flesh = (variant = 'red') => cached('flesh-' + variant, () => {
  const [c, ctx] = canvas(256);
  const base = variant === 'red' ? '#7a1d16' : '#5a2a2c';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  blobs(ctx, 256, 256, 45, variant === 'red' ? '160,40,30' : '120,60,70', 0.5, 6, 26);
  blobs(ctx, 256, 256, 30, '40,5,5', 0.5, 6, 24);
  if (variant !== 'red') blobs(ctx, 256, 256, 18, '170,150,120', 0.35, 5, 14);
  veins(ctx, 256, 256, 30, 'rgba(30,0,10,0.55)', 1.6);
  ctx.strokeStyle = 'rgba(230,180,170,0.25)';
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = 1;
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.beginPath();
    ctx.arc(x, y, 2 + Math.random() * 4, Math.random() * 3, Math.random() * 3 + 1);
    ctx.stroke();
  }
  noise(ctx, 256, 256, 3000, '255,200,190', 0.1);
  return tex(c);
});

// Washed-out, indistinct grey: Dullers.
export const dullGrey = () => cached('dullGrey', () => {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#8a8a88';
  ctx.fillRect(0, 0, 128, 128);
  blobs(ctx, 128, 128, 30, '110,110,108', 0.6, 6, 22);
  blobs(ctx, 128, 128, 20, '150,150,148', 0.5, 6, 22);
  noise(ctx, 128, 128, 3000, '170,170,170', 0.15, 2);
  return tex(c);
});

// Dense dark fur for Deathmoth bodies.
export const mothFur = () => cached('mothFur', () => {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, l = 3 + Math.random() * 5;
    const v = 20 + Math.random() * 60;
    ctx.strokeStyle = `rgba(${v + 20},${v + 10},${v},0.6)`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y + l);
    ctx.stroke();
  }
  return tex(c);
});

// Broad dusty wing with veins and two staring eyespots (alpha cut-out).
export const mothWing = () => cached('mothWing', () => {
  const [c, ctx] = canvas(256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(4, 128);
  ctx.bezierCurveTo(40, 10, 200, -10, 252, 40);
  ctx.bezierCurveTo(240, 120, 230, 200, 150, 248);
  ctx.bezierCurveTo(90, 250, 30, 200, 4, 128);
  ctx.closePath();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 128, 256, 128);
  g.addColorStop(0, '#2c2218');
  g.addColorStop(1, '#4a3c2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  blobs(ctx, 256, 256, 40, '20,14,10', 0.5, 6, 24);
  blobs(ctx, 256, 256, 20, '120,100,80', 0.25, 6, 20);
  ctx.strokeStyle = 'rgba(15,10,6,0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(4, 128);
    const a = -0.9 + i * 0.3;
    ctx.quadraticCurveTo(110, 128 + a * 60, 250, 128 + a * 150);
    ctx.stroke();
  }
  // Eyespot.
  const ex = 160, ey = 110;
  ctx.fillStyle = '#c9b48a';
  ctx.beginPath();
  ctx.arc(ex, ey, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#100a06';
  ctx.beginPath();
  ctx.arc(ex, ey, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8e0cc';
  ctx.beginPath();
  ctx.arc(ex - 6, ey - 6, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Ragged edge.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return tex(c, false);
});

// Glossy plastic yellow: Partygoers.
export const partyYellow = () => cached('partyYellow', () => {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#e8c21a';
  ctx.fillRect(0, 0, 128, 128);
  blobs(ctx, 128, 128, 12, '255,240,150', 0.4, 10, 30);
  blobs(ctx, 128, 128, 12, '170,130,0', 0.3, 10, 30);
  return tex(c);
});

// Faces painted on a transparent canvas, mapped onto a plane.
function face(key, draw, w = 256, h = 256) {
  return cached(key, () => {
    const [c, ctx] = canvas(w, h);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    return tex(c, false);
  });
}

// The Smiler: two eyes and a grin, glowing out of the dark.
export const smilerFace = (open = false) => face('smiler-' + open, (ctx, w) => {
  ctx.shadowColor = 'rgba(255,255,245,0.9)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  for (const x of [w * 0.32, w * 0.68]) {
    ctx.beginPath();
    ctx.ellipse(x, 80, 18, open ? 8 : 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grin: a wide crescent full of teeth.
  const top = open ? 150 : 158, bottom = open ? 225 : 192;
  ctx.beginPath();
  ctx.moveTo(18, 145);
  ctx.quadraticCurveTo(w / 2, top + 40, w - 18, 145);
  ctx.quadraticCurveTo(w / 2, bottom + 40, 18, 145);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  for (let i = 0; i < 22; i++) {
    const x = 26 + i * ((w - 52) / 21);
    const t = (x - 18) / (w - 36);
    const y0 = 145 + Math.sin(t * Math.PI) * (top + 40 - 145) * 0.5;
    const y1 = 145 + Math.sin(t * Math.PI) * (bottom + 40 - 145) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 2);
    ctx.lineTo(x + (i % 2 ? 2 : -2), y1 - 2);
    ctx.stroke();
  }
  if (open) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.ellipse(w / 2, 170, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
});

// Partygoer faces: a drawn-on =) or a jagged, too-wide grin when it drops the act.
export const partyFace = (angry = false) => face('party-' + angry, (ctx, w) => {
  ctx.fillStyle = '#111111';
  ctx.strokeStyle = '#111111';
  ctx.lineCap = 'round';
  if (!angry) {
    for (const x of [w * 0.36, w * 0.64]) {
      ctx.beginPath();
      ctx.ellipse(x, 92, 9, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(w / 2, 120, 72, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    for (const x of [w * 0.36, w * 0.64]) {
      ctx.beginPath();
      ctx.arc(x, 88, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(14, 130);
    ctx.quadraticCurveTo(w / 2, 280, w - 14, 130);
    ctx.quadraticCurveTo(w / 2, 170, 14, 130);
    ctx.fill();
    ctx.fillStyle = '#f4f0e0';
    for (let i = 0; i < 14; i++) {
      const x = 28 + i * 15;
      ctx.beginPath();
      ctx.moveTo(x, 150 + Math.sin(i / 13 * Math.PI) * 18);
      ctx.lineTo(x + 7, 178 + Math.sin(i / 13 * Math.PI) * 40);
      ctx.lineTo(x + 14, 150 + Math.sin(i / 13 * Math.PI) * 18);
      ctx.fill();
    }
  }
});

// A Skin-Stealer's borrowed face, and what's underneath.
export const stolenFace = (revealed = false) => face('stealer-' + revealed, (ctx, w) => {
  if (!revealed) {
    ctx.fillStyle = '#2a1e18';
    for (const x of [w * 0.36, w * 0.64]) {
      ctx.beginPath();
      ctx.ellipse(x, 100, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(80,40,30,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.4, 175);
    ctx.lineTo(w * 0.6, 175);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,90,70,0.5)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 115);
    ctx.lineTo(w / 2 - 6, 150);
    ctx.lineTo(w / 2 + 6, 150);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#000000';
    for (const x of [w * 0.35, w * 0.65]) {
      ctx.beginPath();
      ctx.ellipse(x, 95, 20, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A mouth split far too wide, edges torn.
    ctx.beginPath();
    ctx.moveTo(10, 160);
    for (let i = 0; i <= 20; i++) ctx.lineTo(10 + i * ((w - 20) / 20), 160 + (i % 2 ? 6 : -6) + Math.sin(i / 20 * Math.PI) * 30);
    for (let i = 20; i >= 0; i--) ctx.lineTo(10 + i * ((w - 20) / 20), 175 + Math.sin(i / 20 * Math.PI) * 60);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,20,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
});

// Clothing: a flat fabric colour with weave noise and some grime.
export const fabric = (color) => cached('fabric-' + color, () => {
  const [c, ctx] = canvas(64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, y, 64, 1);
  }
  noise(ctx, 64, 64, 400, '0,0,0', 0.15, 1.5);
  blobs(ctx, 64, 64, 4, '40,30,20', 0.25, 4, 12);
  return tex(c);
});

export const skinTone = (color) => cached('skin-' + color, () => {
  const [c, ctx] = canvas(64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  blobs(ctx, 64, 64, 8, '120,70,60', 0.15, 6, 16);
  noise(ctx, 64, 64, 300, '80,50,40', 0.08);
  return tex(c);
});
