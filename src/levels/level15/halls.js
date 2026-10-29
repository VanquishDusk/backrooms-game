import * as THREE from 'three';
import { Kit, paintTex } from '../level94/kit.js';

// Level 15's architecture: an endless grid of barrel-vaulted halls between
// blocks of rooms. Every block sits at (i * P, j * P) and owns the hall
// along its west side, the hall along its north side and the crossing at
// its north-west corner; behind its walls is one room, or solid concrete.

export const P = 40; // block pitch
export const W = 6; // hall width
export const R = W / 2; // vault radius
export const WALL_H = 3.2;
export const CROWN = WALL_H + R;
export const DOOR_W = 2.4, DOOR_H = 2.8;

export const TYPES = ['machine', 'bigmachine', 'broken', 'lab', 'dorm', 'kitchen', 'control', 'storage'];
export const GLYPHS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ⟁⟟⟒⟓⟊⟐⟡';

export function hash(i, j, k = 0, seed = 0) {
  let h = (i * 374761393 + j * 668265263 + k * 1442695041 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Draw a line of the unknown script.
function glyphs(ctx, x, y, size, n, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const gx = x + k * size * 1.3;
    ctx.beginPath();
    const strokes = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < strokes; s++) {
      const a = [Math.random(), Math.random(), Math.random(), Math.random()];
      ctx.moveTo(gx + a[0] * size, y + a[1] * size);
      if (Math.random() < 0.35) ctx.arc(gx + size / 2, y + size / 2, size * (0.2 + a[2] * 0.3), 0, Math.PI * (1 + a[3]));
      else ctx.lineTo(gx + a[2] * size, y + a[3] * size);
    }
    ctx.stroke();
  }
}

export function textures(own) {
  const T = {};
  const noise = (ctx, w, h, n, a, rgb) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(${rgb},${(Math.random() * a).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };
  // Smooth painted plaster for the vault, with faint trowel marks.
  T.vault = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e4e6e4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '170,175,175'},${(Math.random() * 0.12).toFixed(2)})`;
      ctx.lineWidth = 6 + Math.random() * 20;
      ctx.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 40);
      ctx.stroke();
    }
    noise(ctx, w, h, 2000, 0.06, '80,80,80');
  });
  // Grey wall with a band of strange symbols along the top.
  T.wallGrey = paintTex(own, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c4c8c8';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, 0, 2, h);
    }
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, w, 26);
    glyphs(ctx, 8, 5, 15, 26, 'rgba(70,80,90,0.75)');
    ctx.fillStyle = 'rgba(40,40,40,0.25)';
    ctx.fillRect(0, h - 10, w, 10);
    noise(ctx, w, h, 3000, 0.08, '60,60,60');
  });
  // Mint green tiles below, a white band above.
  T.wallTile = paintTex(own, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b8d0c0';
    ctx.fillRect(0, 0, w, h);
    for (let y = 26; y < h; y += 26) for (let x = 0; x < w; x += 52) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,120,100'},${(Math.random() * 0.12).toFixed(2)})`;
      ctx.fillRect(x + 1, y + 1, 50, 24);
      ctx.fillStyle = 'rgba(80,100,90,0.35)';
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y, 1, 26);
    }
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, w, 26);
    glyphs(ctx, 14, 5, 15, 25, 'rgba(70,90,80,0.7)');
    noise(ctx, w, h, 2000, 0.06, '60,60,60');
  });
  T.roomWall = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e6e8e6';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, y, w, 2);
    }
    noise(ctx, w, h, 3000, 0.08, '70,70,70');
  });
  // Polished terrazzo.
  T.floor = paintTex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a4a6a2';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const c = Math.random();
      ctx.fillStyle = c < 0.4 ? 'rgba(60,60,58,0.5)' : c < 0.8 ? 'rgba(230,230,226,0.6)' : 'rgba(140,130,110,0.6)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    ctx.fillRect(0, 0, w, 2);
    ctx.fillRect(0, 0, 2, h);
  });
  T.metal = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#b4b8bc';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${(Math.random() * 0.08).toFixed(3)})`;
      ctx.fillRect(0, y, w, 1);
    }
  });
  T.door = paintTex(own, 128, 160, (ctx, w, h) => {
    ctx.fillStyle = '#9aa0a4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(30,30,30,0.5)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) ctx.strokeRect(10, 10 + k * 36, w - 20, 30);
    for (let x = 14; x < w - 10; x += 12) for (let y = 14; y < h - 10; y += 36) {
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d8b020';
    for (let x = -20; x < w; x += 20) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, h - 16, w, 16);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 10, h);
      ctx.lineTo(x + 26, h - 16);
      ctx.lineTo(x + 16, h - 16);
      ctx.fill();
      ctx.restore();
    }
  }, false);
  // A big symbol over each door. (The exit's door has none.)
  T.sign = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8e8e4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a3440';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    glyphs(ctx, 28, 30, 70, 1, '#2a3440');
  }, false);
  T.screen = paintTex(own, 256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#081418';
    ctx.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 10; y += 16) glyphs(ctx, 10, y, 9, 14 + Math.floor(Math.random() * 6), `rgba(110,230,${Math.random() < 0.2 ? 120 : 220},0.85)`);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  }, false);
  T.coat = paintTex(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8e6e0';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(90,20,15,${(Math.random() * 0.6).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 2 + Math.random() * 5, Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  T.blood = paintTex(own, 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(60,12,10,${(0.3 + Math.random() * 0.5).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(64 + (Math.random() - 0.5) * 60, 64 + (Math.random() - 0.5) * 60, 6 + Math.random() * 26, 4 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, false);
  const L = (o) => {
    const m = new THREE.MeshLambertMaterial(o);
    own.mats.push(m);
    return m;
  };
  const M = {
    vault: L({ map: T.vault, side: THREE.DoubleSide }),
    wallGrey: L({ map: T.wallGrey }),
    wallTile: L({ map: T.wallTile }),
    roomWall: L({ map: T.roomWall, side: THREE.DoubleSide }),
    floor: new THREE.MeshPhongMaterial({ map: T.floor, shininess: 90, specular: 0x9a9a9a }),
    steel: L({ color: 0xf0f2f4 }),
    duct: new THREE.MeshPhongMaterial({ map: T.metal, shininess: 60, specular: 0x777777 }),
    metal: L({ map: T.metal }),
    dark: L({ color: 0x2a2e32 }),
    yellow: L({ color: 0xd8b020 }),
    door: L({ map: T.door }),
    sign: L({ map: T.sign }),
    blank: L({ color: 0xe8e8e4 }),
    panel: new THREE.MeshBasicMaterial({ color: 0xf4f8f8 }),
    panelOff: L({ color: 0x8a8e90 }),
    fixture: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    screen: new THREE.MeshBasicMaterial({ map: T.screen }),
    glass: new THREE.MeshPhongMaterial({ color: 0xc8e0e8, transparent: true, opacity: 0.35, shininess: 100, depthWrite: false }),
    coat: L({ map: T.coat }),
    cloth: L({ color: 0x3a3e48 }),
    skin: L({ color: 0x8a8278 }),
    hound: L({ color: 0xa89a90 }),
    wood: L({ color: 0x8a6a4a }),
    blanket: L({ color: 0x5a6a7a }),
    red: L({ color: 0xc02a20 }),
    green: L({ color: 0x3aa860 }),
    rod: new THREE.MeshPhongMaterial({ color: 0xa8acb0, shininess: 80 }),
    blood: new THREE.MeshBasicMaterial({ map: T.blood, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    daylight: new THREE.MeshBasicMaterial({ color: 0xfffef4 }),
  };
  own.mats.push(M.floor, M.duct, M.panel, M.fixture, M.screen, M.glass, M.rod, M.blood, M.daylight);
  return { T, M };
}

// ---- One block ----------------------------------------------------------------------------

// What's behind the walls of block (i, j)?
export function blockPlan(i, j, seed, overrides) {
  const key = `${i},${j}`;
  if (overrides[key]) return overrides[key];
  const r = hash(i, j, 1, seed);
  const type = r < 0.32 ? 'solid' : TYPES[Math.floor(hash(i, j, 2, seed) * TYPES.length)];
  return {
    type,
    door: Math.floor(hash(i, j, 3, seed) * 4), // 0 west, 1 north, 2 east, 3 south
    dark: hash(i, j, 4, seed) < 0.14,
    panels: hash(i, j, 5, seed) < 0.5,
  };
}

// The hall geometry a block owns, and its walls and room.
export function buildBlock(i, j, plan, neighbours, M, rng) {
  const kit = new Kit();
  const bx = i * P, bz = j * P;
  const solids = [];
  const lights = [];
  const computers = [];
  const anims = [];
  const extra = [];
  const solid = (x0, z0, x1, z1, y1 = 6) => solids.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, rot: 0, y0: 0, y1 });
  const L = P - W;

  // ---- Halls: floor, vault, ribs, ducts, lights ----
  const floorPlane = (x0, z0, x1, z1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (x1 - x0) / 3, uv.getY(k) * (z1 - z0) / 3);
    kit.add('floor', g, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    g.dispose();
  };
  floorPlane(bx, bz, bx + W, bz + P);
  floorPlane(bx + W, bz, bx + P, bz + W);
  // Hall along z (axis z, west of the room), hall along x (north of the room).
  const halls = [
    { axis: 'z', cx: bx + R, a0: bz + W, a1: bz + P, dark: plan.dark },
    { axis: 'x', cz: bz + R, a0: bx + W, a1: bx + P, dark: plan.dark },
  ];
  for (const h of halls) {
    const len = h.a1 - h.a0, mid = (h.a0 + h.a1) / 2;
    const vault = new THREE.CylinderGeometry(R, R, len, 28, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    const uv = vault.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 3, uv.getY(k) * len / 6);
    const at = (along, y, across = 0) => (h.axis === 'z' ? [h.cx + across, y, along] : [along, y, h.cz + across]);
    const ry = h.axis === 'z' ? 0 : Math.PI / 2;
    kit.add('vault', vault, ...at(mid, WALL_H), 0, ry, 0);
    vault.dispose();
    // White steel ribs.
    for (let s = h.a0 + 4; s < h.a1; s += 8) {
      const rib = new THREE.TorusGeometry(R - 0.05, 0.09, 6, 20, Math.PI);
      kit.add('steel', rib, ...at(s, WALL_H), 0, ry, 0);
      rib.dispose();
    }
    // Two big ducts along the crown, hung from straps.
    for (const off of [-0.75, 0.75]) {
      const d = new THREE.CylinderGeometry(0.42, 0.42, len, 14, 1, true).rotateX(Math.PI / 2);
      kit.add('duct', d, ...at(mid, CROWN - 0.75, off), 0, ry, 0);
      d.dispose();
      for (let s = h.a0 + 2; s < h.a1; s += 4) {
        const band = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 14, 1, true).rotateX(Math.PI / 2);
        kit.add('metal', band, ...at(s, CROWN - 0.75, off), 0, ry, 0);
        band.dispose();
      }
    }
    // Lamps hung under the ducts, throwing light up the vault.
    for (let s = h.a0 + 6; s < h.a1; s += 9) {
      for (const off of [-1.5, 1.5]) {
        const box = new THREE.BoxGeometry(0.7, 0.12, 0.35);
        kit.add(h.dark ? 'dark' : 'fixture', box, ...at(s, CROWN - 1.45, off), 0, ry + Math.PI / 2, off > 0 ? -0.6 : 0.6);
        box.dispose();
      }
      const arm = new THREE.CylinderGeometry(0.03, 0.03, 3.2, 5).rotateZ(Math.PI / 2);
      kit.add('metal', arm, ...at(s, CROWN - 1.3), 0, ry + Math.PI / 2, 0);
      arm.dispose();
      const [lx, ly, lz] = at(s, CROWN - 1.6);
      lights.push({ x: lx, y: ly, z: lz, on: !h.dark });
    }
  }
  // The crossing: a flat ceiling at the crown and the arches round it.
  {
    const g = new THREE.PlaneGeometry(W, W).rotateX(Math.PI / 2);
    kit.add('vault', g, bx + R, CROWN, bz + R);
    g.dispose();
    const shape = new THREE.Shape();
    shape.moveTo(-R, 0);
    shape.lineTo(-R, R + 0.01);
    shape.lineTo(R, R + 0.01);
    shape.lineTo(R, 0);
    shape.absarc(0, 0, R, 0, Math.PI, false);
    for (const [x, z, ry] of [[bx + R, bz, 0], [bx + R, bz + W, 0], [bx, bz + R, Math.PI / 2], [bx + W, bz + R, Math.PI / 2]]) {
      const sp = new THREE.ShapeGeometry(shape, 12);
      kit.add('vault', sp, x, WALL_H, z, 0, ry, 0);
      sp.dispose();
    }
    const [lx, lz] = [bx + R, bz + R];
    lights.push({ x: lx, y: CROWN - 0.6, z: lz, on: !plan.dark });
    const lamp = new THREE.CylinderGeometry(0.5, 0.6, 0.15, 16);
    kit.add(plan.dark ? 'dark' : 'fixture', lamp, lx, CROWN - 0.1, lz);
    lamp.dispose();
  }

  // ---- The block's four walls, facing the halls ----
  // side: 0 west (x = bx + W, faces -x), 1 north (z = bz + W, faces -z), 2 east (x = bx + P, faces +x), 3 south (z = bz + P, faces +z)
  const hasRoom = plan.type !== 'solid';
  const faces = [
    { side: 0, x: bx + W, z: bz + W + L / 2, ry: -Math.PI / 2, along: 'z', dark: plan.dark, panels: plan.panels },
    { side: 1, x: bx + W + L / 2, z: bz + W, ry: Math.PI, along: 'x', dark: plan.dark, panels: !plan.panels },
    { side: 2, x: bx + P, z: bz + W + L / 2, ry: Math.PI / 2, along: 'z', dark: neighbours.east.dark, panels: !neighbours.east.panels },
    { side: 3, x: bx + W + L / 2, z: bz + P, ry: 0, along: 'x', dark: neighbours.south.dark, panels: neighbours.south.panels },
  ];
  const T2 = 0.3;
  for (const f of faces) {
    const isDoor = hasRoom && plan.door === f.side;
    const key = f.panels ? 'wallGrey' : 'wallTile';
    const out = f.side === 0 || f.side === 1 ? -1 : 1;
    // Wall pieces, in the face's own frame: u along the wall, centred.
    const piece = (u0, u1, y0, y1) => {
      const w = u1 - u0, hgt = y1 - y0;
      const g = new THREE.PlaneGeometry(w, hgt);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * w + u0) / 8, (uv.getY(k) * hgt + y0) / WALL_H);
      const c = (u0 + u1) / 2;
      const [x, z] = f.along === 'z' ? [f.x, f.z + c] : [f.x + c, f.z];
      kit.add(key, g, x, (y0 + y1) / 2, z, 0, f.ry, 0);
      g.dispose();
    };
    if (isDoor) {
      piece(-L / 2, -DOOR_W / 2, 0, WALL_H);
      piece(DOOR_W / 2, L / 2, 0, WALL_H);
      piece(-DOOR_W / 2, DOOR_W / 2, DOOR_H, WALL_H);
    } else piece(-L / 2, L / 2, 0, WALL_H);
    // The wall's thickness, for collision (with a gap at the door).
    const inset = (d) => (f.along === 'z' ? [f.x - out * d, f.z] : [f.x, f.z - out * d]);
    const [cx, cz] = inset(T2 / 2);
    if (f.along === 'z') {
      if (isDoor) {
        solid(cx - T2 / 2, f.z - L / 2, cx + T2 / 2, f.z - DOOR_W / 2);
        solid(cx - T2 / 2, f.z + DOOR_W / 2, cx + T2 / 2, f.z + L / 2);
      } else solid(cx - T2 / 2, f.z - L / 2, cx + T2 / 2, f.z + L / 2);
    } else if (isDoor) {
      solid(f.x - L / 2, cz - T2 / 2, f.x - DOOR_W / 2, cz + T2 / 2);
      solid(f.x + DOOR_W / 2, cz - T2 / 2, f.x + L / 2, cz + T2 / 2);
    } else solid(f.x - L / 2, cz - T2 / 2, f.x + L / 2, cz + T2 / 2);
    // Light panels down one side of each hall, framed posters down the other.
    const w2 = (u) => (f.along === 'z' ? [f.x + out * 0.03, f.z + u] : [f.x + u, f.z + out * 0.03]);
    for (let u = -L / 2 + 2.5; u < L / 2 - 1.5; u += 4) {
      if (isDoor && Math.abs(u) < DOOR_W / 2 + 1.2) continue;
      const [px, pz] = w2(u);
      if (f.panels) {
        const g = new THREE.PlaneGeometry(1.3, 1.7);
        kit.add(f.dark ? 'panelOff' : 'panel', g, px, 1.55, pz, 0, f.ry, 0);
        g.dispose();
      } else {
        const g = new THREE.PlaneGeometry(1.0, 1.4);
        kit.add('blank', g, px, 1.6, pz, 0, f.ry, 0);
        g.dispose();
      }
    }
    if (isDoor) {
      // A reinforced door, slid half open, a symbol above it.
      const [dx, dz] = w2(0);
      const frame = (u, y, w, h) => {
        const [x, z] = w2(u);
        kit.box('yellow', x, y, z, f.along === 'z' ? 0.25 : w, h, f.along === 'z' ? w : 0.25);
      };
      frame(-DOOR_W / 2 - 0.15, DOOR_H / 2, 0.3, DOOR_H);
      frame(DOOR_W / 2 + 0.15, DOOR_H / 2, 0.3, DOOR_H);
      frame(0, DOOR_H + 0.15, DOOR_W + 0.6, 0.3);
      const leaf = new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.12);
      const lu = plan.open === false ? 0 : DOOR_W * 0.7;
      const [lx, lz] = f.along === 'z' ? [f.x - out * 0.1, f.z + lu] : [f.x + lu, f.z - out * 0.1];
      kit.add('door', leaf, lx, DOOR_H / 2, lz, 0, f.ry, 0);
      leaf.dispose();
      const sg = new THREE.PlaneGeometry(0.7, 0.7);
      kit.add(plan.type === 'exit' ? 'blank' : 'sign', sg, dx, DOOR_H + 0.75, dz, 0, f.ry, 0);
      sg.dispose();
      plan.doorAt = { x: dx, z: dz, out, along: f.along };
    }
  }

  // ---- The room ----
  if (!hasRoom) {
    solid(bx + W + 0.2, bz + W + 0.2, bx + P - 0.2, bz + P - 0.2, 12);
  } else {
    const x0 = bx + W + T2, x1 = bx + P - T2, z0 = bz + W + T2, z1 = bz + P - T2;
    const H = plan.type === 'bigmachine' ? 12 : plan.type === 'exit' ? 7 : 5;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (x1 - x0) / 3, uv.getY(k) * (z1 - z0) / 3);
    kit.add('floor', g, (x0 + x1) / 2, 0.005, (z0 + z1) / 2);
    g.dispose();
    // Inner walls and ceiling as an inside-out box (with the doorway cut by drawing the door wall in pieces).
    const wallIn = (side) => {
      const d = plan.door === side;
      const along = side % 2 === 0 ? 'z' : 'x';
      const len = along === 'z' ? z1 - z0 : x1 - x0;
      const c = along === 'z' ? (z0 + z1) / 2 : (x0 + x1) / 2;
      const pos = side === 0 ? x0 : side === 1 ? z0 : side === 2 ? x1 : z1;
      const ry = side === 0 ? Math.PI / 2 : side === 1 ? 0 : side === 2 ? -Math.PI / 2 : Math.PI;
      const pieces = d ? [[-len / 2, -DOOR_W / 2, 0, H], [DOOR_W / 2, len / 2, 0, H], [-DOOR_W / 2, DOOR_W / 2, DOOR_H, H]] : [[-len / 2, len / 2, 0, H]];
      for (const [u0, u1, y0, y1] of pieces) {
        const pg = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
        const puv = pg.attributes.uv;
        for (let k = 0; k < puv.count; k++) puv.setXY(k, puv.getX(k) * (u1 - u0) / 4, puv.getY(k) * (y1 - y0) / 4);
        const m = (u0 + u1) / 2;
        const [x, z] = along === 'z' ? [pos, c + m] : [c + m, pos];
        kit.add('roomWall', pg, x, (y0 + y1) / 2, z, 0, ry, 0);
        pg.dispose();
      }
    };
    for (let s = 0; s < 4; s++) wallIn(s);
    const cg = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2);
    kit.add('roomWall', cg, (x0 + x1) / 2, H, (z0 + z1) / 2);
    cg.dispose();
    // The door's thickness: a lined opening.
    // Ceiling light strips.
    for (let x = x0 + 5; x < x1 - 2; x += 8) for (let z = z0 + 5; z < z1 - 2; z += 8) {
      const lg = new THREE.BoxGeometry(0.3, 0.08, 2.4);
      kit.add(plan.type === 'broken' ? 'panelOff' : 'fixture', lg, x, H - 0.05, z);
      lg.dispose();
      lights.push({ x, y: H - 0.6, z, on: plan.type !== 'broken' || rng() < 0.3, room: true, flicker: plan.type === 'broken' });
    }
    const room = { x0, x1, z0, z1, H, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, door: plan.door };
    furnish(kit, plan, room, solid, computers, anims, extra, rng);
  }
  return { kit, solids, lights, computers, anims, extra };
}

// ---- What's in the rooms ------------------------------------------------------------------------

function corpse(kit, x, z, rot, hound = false) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const box = (key, lx, y, lz, w, h, d, ry = 0) => {
    const [px, pz] = at(lx, lz);
    kit.box(key, px, y, pz, w, h, d, rot + ry);
  };
  const blood = new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2);
  kit.add('blood', blood, x, 0.012, z, 0, rot, 0);
  blood.dispose();
  if (hound) {
    box('hound', 0, 0.22, 0, 0.45, 0.35, 1.1);
    const [hx, hz] = at(0, 0.75);
    const head = new THREE.SphereGeometry(0.16, 8, 6);
    kit.add('hound', head, hx, 0.18, hz);
    head.dispose();
    for (const [lx, lz, a] of [[-0.3, 0.4, 0.8], [0.3, 0.4, -0.6], [-0.3, -0.4, 1.0], [0.3, -0.4, -0.9]]) box('hound', lx, 0.1, lz, 0.1, 0.1, 0.65, a);
    return;
  }
  // Someone in a lab coat, face down.
  box('coat', 0, 0.14, 0.1, 0.5, 0.24, 0.8);
  box('coat', 0, 0.08, -0.45, 0.6, 0.06, 0.5, 0.15);
  box('cloth', -0.12, 0.09, -0.85, 0.15, 0.15, 0.8, 0.1);
  box('cloth', 0.13, 0.09, -0.8, 0.15, 0.15, 0.78, -0.2);
  box('coat', -0.38, 0.09, 0.4, 0.13, 0.13, 0.6, 0.5);
  box('coat', 0.4, 0.09, 0.45, 0.13, 0.13, 0.6, -0.9);
  const [hx, hz] = at(0, 0.65);
  const head = new THREE.SphereGeometry(0.12, 8, 6);
  kit.add('skin', head, hx, 0.13, hz);
  head.dispose();
}

function computer(kit, computers, x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [mx, mz] = at(0, -0.1);
  kit.box('metal', mx, 1.05, mz, 0.6, 0.42, 0.08, rot);
  const scr = new THREE.PlaneGeometry(0.54, 0.36);
  const [sx, sz] = at(0, -0.055);
  kit.add('screen', scr, sx, 1.05, sz, 0, rot, 0);
  scr.dispose();
  const [kx, kz] = at(0, 0.18);
  kit.box('dark', kx, 0.79, kz, 0.5, 0.03, 0.18, rot);
  const [ux, uz] = at(0, 0.75);
  computers.push({ x: sx, z: sz, ux, uz, rot });
}

function furnish(kit, plan, room, solid, computers, anims, extra, rnd) {
  const { x0, x1, z0, z1, cx, cz } = room;
  const desk = (x, z, w, d, rot = 0) => {
    kit.box('metal', x, 0.76, z, w, 0.05, d, rot);
    kit.box('dark', x, 0.38, z, w - 0.1, 0.74, d - 0.15, rot);
    solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 1);
  };
  const t = plan.type;
  if (t === 'machine') {
    // A machine that makes steel rods, still running.
    kit.box('metal', cx, 1.8, cz - 4, 9, 3.6, 4.5);
    kit.box('yellow', cx, 3.65, cz - 4, 9.2, 0.15, 4.7);
    for (let k = 0; k < 6; k++) {
      const p = new THREE.CylinderGeometry(0.25, 0.25, 5 - 3.6, 10);
      kit.add('duct', p, cx - 3.5 + k * 1.4, 3.6 + 0.7, cz - 4.5);
      p.dispose();
    }
    for (let k = 0; k < 3; k++) kit.box(['red', 'green', 'yellow'][k], cx - 3 + k * 0.5, 2.6, cz - 1.74, 0.25, 0.25, 0.05);
    solid(cx - 4.6, cz - 6.3, cx + 4.6, cz - 1.7, 4);
    // The conveyor, and rods coming off it.
    kit.box('dark', cx, 0.9, cz + 3, 2, 0.1, 9);
    kit.box('metal', cx, 0.45, cz + 3, 1.8, 0.8, 8.8);
    solid(cx - 1.05, cz - 1.7, cx + 1.05, cz + 7.6, 1);
    const rods = [];
    const rg = new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8).rotateZ(Math.PI / 2);
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(rg, null);
      rods.push(m);
    }
    extra.push({ kind: 'rods', geo: rg, rods, x: cx, z0: cz - 1.6, z1: cz + 7.4, y: 1.02 });
    // A rack of finished rods.
    for (let k = 0; k < 14; k++) {
      const g = new THREE.CylinderGeometry(0.05, 0.05, 3, 8).rotateZ(Math.PI / 2);
      kit.add('rod', g, cx + 6, 0.4 + (k % 5) * 0.12, cz + 3 + Math.floor(k / 5) * 0.14);
      g.dispose();
    }
    kit.box('dark', cx + 6, 0.2, cz + 3.1, 3.2, 0.4, 0.8);
    solid(cx + 4.4, cz + 2.6, cx + 7.6, cz + 3.6, 1);
    anims.push({ kind: 'machine', x: cx, z: cz - 4 });
    if (rnd() < 0.5) corpse(kit, cx - 6, cz + 5, rnd() * 6);
  } else if (t === 'bigmachine') {
    // A machine so big the room was built around it.
    const g = new THREE.CylinderGeometry(7, 7.5, 11, 32);
    kit.add('metal', g, cx, 5.5, cz);
    g.dispose();
    for (let y = 1.5; y < 11; y += 2.4) {
      const r = new THREE.TorusGeometry(7.6, 0.25, 8, 40).rotateX(Math.PI / 2);
      kit.add('yellow', r, cx, y, cz);
      r.dispose();
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const p = new THREE.CylinderGeometry(0.4, 0.4, 12, 10);
      kit.add('duct', p, cx + Math.cos(a) * 8.6, 6, cz + Math.sin(a) * 8.6);
      p.dispose();
      solid(cx + Math.cos(a) * 8.6 - 0.45, cz + Math.sin(a) * 8.6 - 0.45, cx + Math.cos(a) * 8.6 + 0.45, cz + Math.sin(a) * 8.6 + 0.45);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      solid(cx + Math.cos(a) * 7.6 - 1.5, cz + Math.sin(a) * 7.6 - 1.5, cx + Math.cos(a) * 7.6 + 1.5, cz + Math.sin(a) * 7.6 + 1.5, 12);
    }
    const lights = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, y = 2.5 + (k % 4) * 2.4;
      const lg = new THREE.SphereGeometry(0.12, 8, 6);
      kit.add(k % 3 ? 'green' : 'red', lg, cx + Math.cos(a) * 7.45, y, cz + Math.sin(a) * 7.45);
      lg.dispose();
      lights.push(k);
    }
    anims.push({ kind: 'big', x: cx, z: cz });
  } else if (t === 'broken') {
    // Machinery torn open, tipped over, burnt.
    for (let k = 0; k < 3; k++) {
      const x = cx - 7 + k * 7, z = cz - 3 + (k % 2) * 5;
      const g = new THREE.BoxGeometry(3.5, 2.6, 2.6);
      kit.add('metal', g, x, 1.1, z, 0.15 * (k - 1), rnd() * 2, 0.25 * (k - 1));
      g.dispose();
      solid(x - 2, z - 2, x + 2, z + 2, 3);
    }
    for (let k = 0; k < 30; k++) {
      const s = 0.15 + rnd() * 0.5;
      const g = new THREE.BoxGeometry(s, s * 0.5, s * 1.4);
      kit.add(rnd() < 0.5 ? 'dark' : 'metal', g, x0 + 1 + rnd() * (x1 - x0 - 2), s * 0.25, z0 + 1 + rnd() * (z1 - z0 - 2), 0, rnd() * 6, 0);
      g.dispose();
    }
    for (let k = 0; k < 5; k++) {
      const g = new THREE.CylinderGeometry(0.05, 0.05, 2.5 + rnd() * 2, 6);
      kit.add('rod', g, x0 + 2 + rnd() * (x1 - x0 - 4), 0.08, z0 + 2 + rnd() * (z1 - z0 - 4), Math.PI / 2, rnd() * 6, 0);
      g.dispose();
    }
    corpse(kit, cx + 4, cz + 8, rnd() * 6, true);
    if (rnd() < 0.6) corpse(kit, cx - 8, cz + 7, rnd() * 6);
    anims.push({ kind: 'sparks', x: cx - 7, z: cz - 3, y: 2.2 });
  } else if (t === 'lab') {
    for (let row = 0; row < 3; row++) {
      const z = z0 + 6 + row * 8;
      desk(cx, z, 12, 1.2);
      for (let k = 0; k < 10; k++) {
        const g = new THREE.CylinderGeometry(0.05 + rnd() * 0.05, 0.06, 0.15 + rnd() * 0.2, 10);
        kit.add('glass', g, cx - 5.5 + k * 1.2 + rnd() * 0.3, 0.88, z + (rnd() - 0.5) * 0.6);
        g.dispose();
      }
    }
    // A fume hood along one wall.
    kit.box('metal', x1 - 1, 1.2, cz, 1.6, 2.4, 6);
    kit.box('glass', x1 - 1.8, 1.4, cz, 0.04, 1.2, 5.6);
    solid(x1 - 1.8, cz - 3, x1, cz + 3, 3);
    computer(kit, computers, x0 + 2.5, z0 + 2.2, 0);
    desk(x0 + 2.5, z0 + 1.9, 1.6, 0.9);
    computer(kit, computers, cx + 4, z1 - 2.2, Math.PI);
    desk(cx + 4, z1 - 1.9, 1.6, 0.9);
    corpse(kit, cx - 3, z0 + 10, rnd() * 6);
    corpse(kit, cx + 6, z0 + 18.5, rnd() * 6);
  } else if (t === 'dorm') {
    for (let k = 0; k < 6; k++) for (const side of [-1, 1]) {
      const x = side < 0 ? x0 + 1.2 : x1 - 1.2, z = z0 + 3 + k * 4.6;
      for (const y of [0.45, 1.65]) {
        kit.box('metal', x, y, z, 2.1, 0.08, 1.0);
        kit.box('blanket', x, y + 0.12, z, 1.9, 0.16, 0.92);
        kit.box('blank', x - side * 0.75, y + 0.24, z, 0.4, 0.12, 0.6);
      }
      for (const [dx, dz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) kit.box('metal', x + dx, 1.1, z + dz * 0.95, 0.05, 2.2, 0.05);
      solid(x - 1.1, z - 0.55, x + 1.1, z + 0.55, 2.3);
    }
    for (let k = 0; k < 8; k++) {
      kit.box('metal', cx - 5.6 + k * 1.6, 1.0, z1 - 0.4, 1.5, 2, 0.6);
      kit.box('dark', cx - 5.6 + k * 1.6, 1.6, z1 - 0.09, 0.4, 0.05, 0.02);
    }
    solid(cx - 6.5, z1 - 0.8, cx + 6.5, z1, 2);
    corpse(kit, cx, cz + 2, rnd() * 6);
  } else if (t === 'kitchen') {
    kit.box('metal', cx, 0.45, z0 + 0.5, 20, 0.9, 1);
    kit.box('dark', cx - 4, 0.94, z0 + 0.5, 4, 0.04, 0.9);
    solid(cx - 10, z0, cx + 10, z0 + 1.1, 1);
    for (let k = 0; k < 3; k++) {
      kit.box('blank', x1 - 0.6, 1.0, z0 + 6 + k * 1.3, 1.0, 2.0, 1.2);
      solid(x1 - 1.2, z0 + 5.4 + k * 1.3, x1, z0 + 6.6 + k * 1.3, 2);
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = cx - 7 + c * 7, z = cz - 2 + r * 6;
      kit.box('metal', x, 0.74, z, 3.2, 0.06, 1.2);
      kit.box('dark', x, 0.37, z, 0.2, 0.74, 0.2);
      solid(x - 1.6, z - 0.6, x + 1.6, z + 0.6, 1);
      for (const s of [-1, 1]) for (const u of [-1, 0, 1]) kit.box('blanket', x + u * 1, 0.45, z + s * 0.95, 0.42, 0.06, 0.42);
      for (let k = 0; k < 2; k++) kit.box('blank', x + (rnd() - 0.5) * 2, 0.79, z + (rnd() - 0.5) * 0.6, 0.35, 0.03, 0.25);
    }
    if (rnd() < 0.7) corpse(kit, cx + 3, cz + 9, rnd() * 6);
  } else if (t === 'control' || t === 'enric') {
    // A wall of screens, and rows of consoles facing it.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      const g = new THREE.PlaneGeometry(2.2, 1.4);
      kit.add('screen', g, cx - 9 + c * 2.5 + 0.05, 1.6 + r * 1.55, z0 + 0.04);
      g.dispose();
    }
    for (let row = 0; row < 2; row++) {
      const z = z0 + 6 + row * 5;
      kit.box('metal', cx, 0.6, z, 16, 1.2, 1.4);
      kit.box('dark', cx, 1.23, z - 0.2, 15.6, 0.06, 1.0);
      for (let k = 0; k < 30; k++) kit.box(['red', 'green', 'yellow', 'blank'][k % 4], cx - 7.5 + k * 0.5, 1.27, z - 0.25 + (k % 3) * 0.15, 0.08, 0.04, 0.08);
      solid(cx - 8, z - 0.7, cx + 8, z + 0.7, 1.3);
      for (let k = 0; k < 3; k++) computer(kit, computers, cx - 5 + k * 5, z + 0.2, 0);
    }
    if (t === 'enric') {
      // Enric's camp in the corner: a mattress, a lamp, crates, notes on the wall.
      kit.box('blanket', x1 - 3, 0.2, z1 - 3, 2.2, 0.4, 1.2);
      kit.box('wood', x1 - 5.5, 0.4, z1 - 1.5, 1.2, 0.8, 0.8);
      kit.box('wood', x1 - 5.5, 1.2, z1 - 1.5, 1.0, 0.8, 0.7);
      for (let k = 0; k < 12; k++) kit.box('blank', x1 - 0.05, 1.2 + (k % 3) * 0.45, z1 - 9 + k * 0.5, 0.02, 0.3, 0.22);
      solid(x1 - 4.1, z1 - 3.6, x1 - 1.9, z1 - 2.4, 0.5);
      solid(x1 - 6.1, z1 - 2, x1 - 4.9, z1 - 1, 1.6);
    } else if (rnd() < 0.6) corpse(kit, cx - 4, z0 + 8.5, rnd() * 6);
  } else if (t === 'storage') {
    for (let row = 0; row < 4; row++) {
      const z = z0 + 4 + row * 6.5;
      for (const side of [-1, 1]) {
        const x = cx + side * 6;
        for (const y of [0.1, 1.3, 2.5]) kit.box('yellow', x, y, z, 8, 0.08, 1.2);
        for (const dx of [-4, 0, 4]) kit.box('dark', x + dx, 1.6, z, 0.1, 3.2, 1.2);
        for (let k = 0; k < 9; k++) {
          if (rnd() < 0.3) continue;
          const s = 0.6 + rnd() * 0.4;
          kit.box('wood', x - 3.3 + (k % 3) * 2.6, [0.1, 1.3, 2.5][Math.floor(k / 3)] + s / 2 + 0.04, z, s * 1.6, s, s);
        }
        solid(x - 4, z - 0.6, x + 4, z + 0.6, 3.3);
      }
    }
  } else if (t === 'exit') {
    // A plain room, and a stairway climbing away from you up into daylight.
    for (let k = 0; k < 16; k++) kit.box('blank', cx, 0.125 * (k + 1), cz + 1 + k * 0.45, 3, 0.25 * (k + 1), 0.45);
    const sky = new THREE.PlaneGeometry(3, 3.2);
    kit.add('daylight', sky, cx, 5.4, cz + 8.3, 0, Math.PI, 0);
    sky.dispose();
    for (const s of [-1, 1]) {
      kit.box('steel', cx + s * 1.6, 3.5, cz + 4.5, 0.08, 7, 8);
      solid(cx + s * 1.65 - 0.1, cz + 0.5, cx + s * 1.65 + 0.1, cz + 8.5, 7);
    }
    room.stairs = { x: cx, z: cz + 1.5 };
    plan.stairs = room.stairs;
  }
}
