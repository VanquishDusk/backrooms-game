import * as THREE from 'three';
import { createNoise2D } from '../../core/rng.js';
import { mergeGeometries } from '../../world/props.js';
import { lettersGeometry } from './build.js';
import { partyYellow } from '../../entities/lib/textures.js';

// The fake reality: an overexposed field of long grass under a white sky,
// low green hills all round, and a vending machine standing on its own in
// the middle of it. The library leaks in: shelves in the grass, carpet,
// ceiling tiles hanging in the sky. At the very end, a house.

export const FIELD = { x: 3000, z: 0 };

function tex(w, h, draw, own, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  own.textures.push(t);
  return t;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
varying vec3 vDir;
void main() {
  float h = max(vDir.y, 0.0);
  vec3 c = mix(horizon, top, pow(h, 0.55));
  gl_FragColor = vec4(c, 1.0);
}
`;

export function buildField(rng, own) {
  const group = new THREE.Group();
  const noise = createNoise2D(rng.fork('field'));
  const mats = (m) => (own.mats.push(m), m);
  const geos = (g) => (own.geos.push(g), g);

  // Ground height: gentle swells nearby, hills far off.
  const heightAt = (x, z) => {
    const dx = x - FIELD.x, dz = z - FIELD.z, r = Math.hypot(dx, dz);
    let h = (noise(dx / 40, dz / 40) - 0.5) * 1.6 + (noise(dx / 13 + 5, dz / 13) - 0.5) * 0.4;
    const hill = Math.max(0, (r - 260) / 200);
    h += hill * hill * 28 * (0.6 + noise(dx / 120 + 9, dz / 120) * 0.9);
    // One taller knoll on the horizon, like a landmark.
    const k = Math.hypot(dx + 160, dz + 470);
    h += Math.max(0, 1 - k / 150) ** 2 * 32;
    return h;
  };

  // Sky.
  const sky = new THREE.Mesh(
    geos(new THREE.SphereGeometry(950, 32, 16)),
    mats(new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(0xcfe2f2) }, horizon: { value: new THREE.Color(0xffffff) } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    })),
  );
  sky.renderOrder = -1;
  group.add(sky);

  // Ground.
  const grassTex = tex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b8cf6c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 4 + Math.random() * 10;
      const tan = Math.random() < 0.4;
      ctx.strokeStyle = tan ? `rgba(230,218,160,${0.5 + Math.random() * 0.4})` : `rgba(${130 + Math.random() * 60},${175 + Math.random() * 50},${60 + Math.random() * 40},0.7)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - l);
      ctx.stroke();
    }
  }, own);
  grassTex.repeat.set(1, 1);
  const N = 150, S = 1500;
  const gg = geos(new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2));
  const pos = gg.attributes.position, uv = gg.attributes.uv;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + FIELD.x, z = pos.getZ(i) + FIELD.z;
    pos.setXYZ(i, x, heightAt(x, z), z);
    uv.setXY(i, x / 4, z / 4);
    const dry = noise(x / 25 + 3, z / 25 + 7);
    const far = Math.min(1, Math.hypot(x - FIELD.x, z - FIELD.z) / 400);
    const c = new THREE.Color().setRGB(1, 1, 1).lerp(new THREE.Color(1.15, 1.05, 0.75), Math.max(0, dry - 0.5) * 1.6).lerp(new THREE.Color(0.6, 0.85, 0.55), far * 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, mats(new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true })));
  group.add(ground);

  // Long grass: crossed cards, swaying.
  const bladeTex = tex(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = 8 + Math.random() * (w - 16), l = h * (0.45 + Math.random() * 0.55);
      const tan = Math.random() < 0.45;
      ctx.strokeStyle = tan ? `rgb(${225 + Math.random() * 30},${212 + Math.random() * 30},${150 + Math.random() * 40})` : `rgb(${140 + Math.random() * 60},${185 + Math.random() * 50},${70 + Math.random() * 40})`;
      ctx.lineWidth = 1.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 10, h - l * 0.5, x + (Math.random() - 0.5) * 22, h - l);
      ctx.stroke();
    }
  }, own, false);
  const card = (r) => {
    const g = new THREE.PlaneGeometry(1.1, 0.8);
    g.translate(0, 0.4, 0);
    g.rotateY(r);
    return g;
  };
  const tuftGeo = geos(mergeGeometries([card(0), card(Math.PI / 3), card((2 * Math.PI) / 3)]));
  const grassMat = mats(new THREE.MeshLambertMaterial({ map: bladeTex, alphaTest: 0.35, side: THREE.DoubleSide }));
  const wind = { value: 0 };
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.wind = wind;
    sh.vertexShader = 'uniform float wind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 wp0 = instanceMatrix * vec4(position, 1.0);
      float sway = sin(wind * 1.7 + wp0.x * 0.15 + wp0.z * 0.1) * 0.12 + sin(wind * 3.1 + wp0.x * 0.4) * 0.04;
      transformed.x += sway * position.y;
      transformed.z += sway * 0.5 * position.y;`,
    );
  };
  const tufts = 9000;
  const grass = new THREE.InstancedMesh(tuftGeo, grassMat, tufts);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  for (let i = 0; i < tufts; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.pow(rng.next(), 0.6) * 130;
    const x = FIELD.x + Math.cos(a) * r, z = FIELD.z + Math.sin(a) * r;
    p.set(x, heightAt(x, z) - 0.05, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
    const s = rng.range(0.7, 1.5);
    sc.set(s, s * rng.range(0.8, 1.3), s);
    grass.setMatrixAt(i, m4.compose(p, q, sc));
    grass.setColorAt(i, tint.setRGB(rng.range(0.9, 1.2), rng.range(0.95, 1.15), rng.range(0.8, 1)));
  }
  grass.frustumCulled = false;
  group.add(grass);

  // The vending machine.
  const vendTex = tex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a4a20';
    ctx.fillRect(0, 0, w, h);
    // The lit header.
    ctx.fillStyle = '#f4e8d0';
    ctx.fillRect(8, 8, w - 16, 26);
    ctx.fillStyle = '#c03020';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRINKS', w / 2, 28);
    // Glass front full of cans.
    ctx.fillStyle = '#e8eef0';
    ctx.fillRect(8, 40, 84, 150);
    const cans = ['#d02020', '#2060c0', '#20a040', '#e0a020', '#f0f0f0', '#a020a0'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = cans[(r * 3 + c) % cans.length];
      ctx.fillRect(13 + c * 20, 46 + r * 29, 14, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(15 + c * 20, 48 + r * 29, 3, 18);
    }
    // Buttons, coin slot, the flap.
    for (let r = 0; r < 6; r++) {
      ctx.fillStyle = '#e8e0c0';
      ctx.fillRect(98, 46 + r * 14, 22, 9);
    }
    ctx.fillStyle = '#202020';
    ctx.fillRect(104, 140, 10, 26);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(14, 205, 74, 30);
    ctx.fillStyle = '#d8c070';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('601', 109, 186);
  }, own, false);
  const vendBody = mats(new THREE.MeshLambertMaterial({ color: 0x8a4a20 }));
  const vendFront = mats(new THREE.MeshLambertMaterial({ map: vendTex, emissive: 0xffffff, emissiveMap: vendTex, emissiveIntensity: 0.25 }));
  const vgeo = geos(new THREE.BoxGeometry(1.0, 1.95, 0.8));
  const vending = new THREE.Mesh(vgeo, [vendBody, vendBody, vendBody, vendBody, vendFront, vendBody]);
  vending.position.y = 0.975;
  const vgroup = new THREE.Group();
  vgroup.add(vending);
  group.add(vgroup);

  // A scrap of paper in the grass.
  const note = new THREE.Mesh(geos(new THREE.IcosahedronGeometry(0.16, 0)), mats(new THREE.MeshLambertMaterial({ color: 0xf4f4f0 })));
  note.scale.set(1, 0.35, 0.8);
  group.add(note);

  // The library leaking in: shelves, carpet, ceiling tiles, a pillar, letters.
  const blend = new THREE.Group();
  group.add(blend);
  const oak = mats(new THREE.MeshLambertMaterial({ color: 0xc4904e }));
  const oakDark = mats(new THREE.MeshLambertMaterial({ color: 0x8a5a2c }));
  const shelfGeo = (() => {
    const parts = [];
    const B = (x, y, z, sx, sy, sz) => parts.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
    B(0, 1.16, 0, 3.7, 2.1, 0.03);
    B(0, 2.23, 0, 3.74, 0.04, 1.0);
    for (let k = 0; k <= 3; k++) B(-1.85 + k * 1.233, 1.12, 0, 0.04, 2.25, 1.0);
    for (let k = 1; k <= 6; k++) B(0, 0.12 + k * 0.3, 0, 3.7, 0.025, 0.96);
    B(0, 0.06, 0, 3.7, 0.12, 0.94);
    const g = mergeGeometries(parts);
    for (const q2 of parts) q2.dispose();
    return geos(g);
  })();
  const shelves = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(shelfGeo, oak);
    m.visible = false;
    blend.add(m);
    shelves.push(m);
  }
  const carpetMat = mats(new THREE.MeshLambertMaterial({ color: 0x4c4a48, polygonOffset: true, polygonOffsetFactor: -2 }));
  const carpets = [];
  for (let i = 0; i < 14; i++) {
    const g = geos(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));
    const m = new THREE.Mesh(g, carpetMat);
    m.visible = false;
    blend.add(m);
    carpets.push(m);
  }
  // A patch of drop ceiling, hanging in the sky with its lights on.
  const ceiling = new THREE.Group();
  const tileTex = tex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a8880';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
  }, own);
  tileTex.repeat.set(16, 16);
  const ceil = new THREE.Mesh(geos(new THREE.PlaneGeometry(20, 20).rotateX(Math.PI / 2)), mats(new THREE.MeshBasicMaterial({ map: tileTex, color: 0xd8d4cc, side: THREE.DoubleSide })));
  ceiling.add(ceil);
  const panelMat = mats(new THREE.MeshBasicMaterial({ color: 0xfffff4 }));
  const panelGeo = geos(new THREE.PlaneGeometry(0.62, 1.22).rotateX(Math.PI / 2));
  for (let x = -8; x <= 8; x += 4) for (let z = -8; z <= 8; z += 4) {
    const pm = new THREE.Mesh(panelGeo, panelMat);
    pm.position.set(x, -0.01, z);
    ceiling.add(pm);
  }
  ceiling.visible = false;
  blend.add(ceiling);
  // Metal letters standing in the grass.
  const letters = new THREE.Mesh(geos(lettersGeometry('THE END', 1.6, 0.25)), mats(new THREE.MeshPhongMaterial({ color: 0x9a9c9e, specular: 0x777777, shininess: 40 })));
  letters.visible = false;
  blend.add(letters);
  // Yellow figures, far off, watching.
  const yellow = mats(new THREE.MeshLambertMaterial({ map: partyYellow(), color: 0xffffff }));
  const figGeo = (() => {
    const parts = [
      new THREE.CylinderGeometry(0.19, 0.16, 0.6, 10).translate(0, 1.2, 0),
      new THREE.SphereGeometry(0.18, 12, 10).scale(1, 1.1, 1).translate(0, 1.72, 0),
      new THREE.CylinderGeometry(0.07, 0.06, 0.9, 6).translate(-0.1, 0.45, 0),
      new THREE.CylinderGeometry(0.07, 0.06, 0.9, 6).translate(0.1, 0.45, 0),
      new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6).rotateZ(-2.6).translate(-0.38, 1.6, 0),
      new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6).rotateZ(2.6).translate(0.38, 1.6, 0),
    ];
    const g = mergeGeometries(parts);
    for (const q2 of parts) q2.dispose();
    return geos(g);
  })();
  const figures = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(figGeo, yellow);
    f.visible = false;
    blend.add(f);
    figures.push(f);
  }

  // The house at the end.
  const house = buildHouse(own, heightAt);
  house.group.visible = false;
  group.add(house.group);

  // Light: a white overcast sun, too bright.
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c08a, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.position.set(FIELD.x + 120, 300, FIELD.z + 80);
  sun.target.position.set(FIELD.x, 0, FIELD.z);
  group.add(hemi, sun, sun.target);

  return { group, sky, heightAt, wind, grass, vending: vgroup, note, blend, shelves, carpets, ceiling, letters, figures, house, hemi, sun, oakDark };
}

// A two-storey house on the rise, porch light on, front door open.
function buildHouse(own, heightAt) {
  const g = new THREE.Group();
  const mats = (m) => (own.mats.push(m), m);
  const sidingTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eef0ec';
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 12) {
      ctx.fillStyle = 'rgba(80,90,100,0.35)';
      ctx.fillRect(0, y + 10, 128, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 3);
    t.colorSpace = THREE.SRGBColorSpace;
    own.textures.push(t);
    return t;
  })();
  const siding = mats(new THREE.MeshLambertMaterial({ map: sidingTex }));
  const roof = mats(new THREE.MeshLambertMaterial({ color: 0x4a4c52 }));
  const trim = mats(new THREE.MeshLambertMaterial({ color: 0xf8f8f4 }));
  const wood = mats(new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  const warm = mats(new THREE.MeshBasicMaterial({ color: 0xffd090 }));
  const door = mats(new THREE.MeshLambertMaterial({ color: 0x3a5a7a }));
  const W = 9, D = 7, Hh = 5.6;
  const x0 = FIELD.x, z0 = FIELD.z - 72;
  const y0 = heightAt(x0, z0) + 0.4;
  g.position.set(x0, y0, z0);
  const add = (geo, mat, x, y, z, ry = 0) => {
    own.geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
    return m;
  };
  // Walls, with the front wall split around the door.
  add(new THREE.BoxGeometry(W, Hh, 0.2), siding, 0, Hh / 2, -D / 2);
  add(new THREE.BoxGeometry(0.2, Hh, D), siding, -W / 2, Hh / 2, 0);
  add(new THREE.BoxGeometry(0.2, Hh, D), siding, W / 2, Hh / 2, 0);
  add(new THREE.BoxGeometry(W / 2 - 0.6, Hh, 0.2), siding, -(W / 4 + 0.3), Hh / 2, D / 2);
  add(new THREE.BoxGeometry(W / 2 - 0.6, Hh, 0.2), siding, W / 4 + 0.3, Hh / 2, D / 2);
  add(new THREE.BoxGeometry(1.2, Hh - 2.2, 0.2), siding, 0, 2.2 + (Hh - 2.2) / 2, D / 2);
  // Inside: warm light.
  add(new THREE.BoxGeometry(W - 0.4, Hh - 0.2, D - 0.4), warm, 0, Hh / 2, 0).material = mats(new THREE.MeshBasicMaterial({ color: 0xffc880, side: THREE.BackSide }));
  // Gable roof.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-W / 2 - 0.5, 0);
  roofShape.lineTo(0, 3);
  roofShape.lineTo(W / 2 + 0.5, 0);
  roofShape.lineTo(-W / 2 - 0.5, 0);
  const rg = new THREE.ExtrudeGeometry(roofShape, { depth: D + 1, bevelEnabled: false });
  rg.translate(0, 0, -(D + 1) / 2);
  add(rg, roof, 0, Hh, 0);
  add(new THREE.BoxGeometry(0.8, 2, 0.8), mats(new THREE.MeshLambertMaterial({ color: 0x8a5a4a })), 2.5, Hh + 2, -1);
  // Windows, lit from inside.
  for (const [x, y] of [[-3, 1.6], [3, 1.6], [-3, 4.2], [0, 4.2], [3, 4.2]]) {
    add(new THREE.PlaneGeometry(1.1, 1.2), warm, x, y, D / 2 + 0.11);
    add(new THREE.BoxGeometry(1.3, 0.1, 0.1), trim, x, y - 0.65, D / 2 + 0.12);
    add(new THREE.BoxGeometry(0.08, 1.2, 0.06), trim, x, y, D / 2 + 0.13);
  }
  // The door, standing open.
  const leaf = new THREE.BoxGeometry(1.0, 2.15, 0.06);
  leaf.translate(0.5, 1.075, 0);
  const dl = add(leaf, door, -0.55, 0, D / 2);
  dl.rotation.y = -1.4;
  add(new THREE.BoxGeometry(1.3, 0.12, 0.12), trim, 0, 2.26, D / 2 + 0.06);
  // Porch: deck, steps, posts, a little roof, a light.
  add(new THREE.BoxGeometry(4.5, 0.3, 2.4), wood, 0, 0.15, D / 2 + 1.2);
  for (let k = 0; k < 2; k++) add(new THREE.BoxGeometry(1.6, 0.15, 0.4), wood, 0, 0.075 - k * 0.15, D / 2 + 2.6 + k * 0.4);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.15, 2.6, 0.15), trim, s * 2.1, 1.6, D / 2 + 2.25);
  add(new THREE.BoxGeometry(4.8, 0.15, 2.7), roof, 0, 2.95, D / 2 + 1.25);
  add(new THREE.SphereGeometry(0.12, 10, 8), warm, 0.8, 2.45, D / 2 + 0.2);
  // The welcome mat.
  const matTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('WELCOME', 64, 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    own.textures.push(t);
    return t;
  })();
  const mt = add(new THREE.PlaneGeometry(1.2, 0.6).rotateX(-Math.PI / 2), mats(new THREE.MeshLambertMaterial({ map: matTex })), 0, 0.31, D / 2 + 0.6);
  void mt;
  const light = new THREE.PointLight(0xffc070, 0, 14, 1.4);
  light.position.set(0, 2.3, D / 2 + 1.0);
  g.add(light);
  return { group: g, door: { x: x0, z: z0 + D / 2 + 0.3, y: y0 }, light };
}
