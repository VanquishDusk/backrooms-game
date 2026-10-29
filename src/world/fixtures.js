import * as THREE from 'three';

// Light fixtures for industrial grid levels: bare fluorescent tubes and caged
// bulbs (and hanging dome lamps). Housings go into ChunkedBuilders ('housing',
// 'cage', 'glass'); the glowing parts are instanced so each fixture can be
// lit, dimmed, flickered or killed individually, with an additive halo.
//
// Each light: { x, z, type: 'tube' | 'bulb' | 'dome', axis (0 = along x),
//   state, power, color, ceil? (ceiling height above it), missing? }

export class Fixtures {
  /**
   * @param {object} o { lights, cb, group, rng, H }
   */
  constructor({ lights, cb, group, rng, H }) {
    this.lights = lights;
    this.group = group;
    this.geos = [];
    this.mats = [];
    const tubes = [], bulbs = [];
    lights.forEach((l, i) => {
      const top = l.ceil ?? H;
      l.top = top;
      if (l.type === 'tube') {
        const along = l.axis === 1;
        const sx = along ? 0.07 : 1.3, sz = along ? 1.3 : 0.07;
        const b = cb.at('housing', l.x, l.z);
        b.box(l.x, top - 0.025, l.z, sx, 0.05, sz);
        for (const s of [-0.62, 0.62]) b.box(l.x + (along ? 0 : s), top - 0.075, l.z + (along ? s : 0), 0.04, 0.05, 0.04);
        // Some dead tubes are gone entirely; the glass is on the floor.
        l.missing = l.missing ?? (l.state === 'off' && rng.chance(0.35));
        if (l.missing) brokenGlass(cb, rng, l.x, l.z);
        l.glowY = top - 0.085;
        tubes.push(i);
      } else if (l.type === 'candle' || l.type === 'none') {
        // A candle's flame (its stand is the level's to build), or a light
        // with no visible source at all.
        l.glowY = l.hang ?? top - 0.5;
        l.hidden = l.type === 'none';
        bulbs.push(i);
      } else if (l.type === 'dome') {
        // Industrial pendant: a long drop rod and an enamel shade.
        const b = cb.at('cage', l.x, l.z);
        const y = l.hang ?? top - 1.2;
        b.cylinder([l.x, top, l.z], [l.x, y + 0.2, l.z], 0.012, 4);
        b.cylinder([l.x, y + 0.2, l.z], [l.x, y + 0.08, l.z], 0.06, 8, { caps: true });
        const shade = cb.at('housing', l.x, l.z);
        shade.cylinder([l.x, y + 0.08, l.z], [l.x, y - 0.06, l.z], 0.07, 12);
        for (let k = 0; k < 12; k++) {
          const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
          shade.quad(
            [l.x + Math.cos(a0) * 0.07, y - 0.06, l.z + Math.sin(a0) * 0.07], [l.x + Math.cos(a1) * 0.07, y - 0.06, l.z + Math.sin(a1) * 0.07],
            [l.x + Math.cos(a1) * 0.28, y - 0.2, l.z + Math.sin(a1) * 0.28], [l.x + Math.cos(a0) * 0.28, y - 0.2, l.z + Math.sin(a0) * 0.28],
            [Math.cos((a0 + a1) / 2) * 0.5, 0.8, Math.sin((a0 + a1) / 2) * 0.5], [0, 0], [1, 0], [1, 1], [0, 1],
          );
        }
        l.glowY = y - 0.1;
        bulbs.push(i);
      } else {
        const b = cb.at('cage', l.x, l.z);
        b.box(l.x, top - 0.03, l.z, 0.12, 0.06, 0.12);
        b.cylinder([l.x, top - 0.06, l.z], [l.x, top - 0.17, l.z], 0.014, 5);
        b.cylinder([l.x, top - 0.17, l.z], [l.x, top - 0.19, l.z], 0.085, 6);
        b.cylinder([l.x, top - 0.31, l.z], [l.x, top - 0.33, l.z], 0.06, 6);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          b.cylinder([l.x + Math.cos(a) * 0.084, top - 0.18, l.z + Math.sin(a) * 0.084], [l.x + Math.cos(a) * 0.06, top - 0.33, l.z + Math.sin(a) * 0.06], 0.005, 3);
        }
        l.glowY = top - 0.25;
        bulbs.push(i);
      }
    });
    const tubeGeo = new THREE.CylinderGeometry(0.019, 0.019, 1.18, 6, 1, true);
    tubeGeo.rotateZ(Math.PI / 2);
    const bulbGeo = new THREE.SphereGeometry(0.055, 7, 5);
    this.geos.push(tubeGeo, bulbGeo);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mats.push(this.glowMat);
    const make = (geo, list) => {
      const mesh = new THREE.InstancedMesh(geo, this.glowMat, Math.max(1, list.length));
      const m = new THREE.Matrix4();
      list.forEach((li, k) => {
        const l = lights[li];
        if (l.type === 'tube') {
          m.makeRotationY(l.axis === 1 ? Math.PI / 2 : 0);
          m.setPosition(l.x, l.glowY, l.z);
          if (l.missing) m.makeScale(0, 0, 0);
        } else {
          m.makeTranslation(l.x, l.glowY, l.z);
          if (l.hidden) m.makeScale(0, 0, 0);
          else if (l.type === 'candle') m.scale(new THREE.Vector3(0.28, 0.5, 0.28));
        }
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, new THREE.Color(0, 0, 0));
        l.inst = { mesh, k };
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    make(tubeGeo, tubes);
    make(bulbGeo, bulbs);

    // Soft halos around lit fixtures.
    this.glowTex = glowTexture();
    const halo = (list, size) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
      list.forEach((li, k) => {
        const l = lights[li];
        pos.set([l.x, l.glowY - 0.02, l.z], k * 3);
        l.halo = { geo, k };
      });
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({ size, map: this.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.geos.push(geo);
      this.mats.push(mat);
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      group.add(pts);
    };
    halo(tubes, 1.5);
    halo(bulbs, 0.9);
    lights.forEach((l, i) => this.set(i, l.state === 'on' ? 1 : l.state === 'flicker' ? 0.6 : 0));

    this.flickers = lights.map((l, i) => (l.state === 'flicker' ? i : -1)).filter((i) => i >= 0);
    this.phase = lights.map(() => rng.next() * 100);
  }

  // Glow level 0..1 of fixture i.
  set(i, level) {
    const l = this.lights[i];
    if (l.level === level) return;
    l.level = level;
    if (l.hidden) return;
    const tube = l.type === 'tube';
    const base = l.glow || (tube ? [1, 1, 1] : [1, 0.72, 0.36]);
    const dead = tube ? 0.2 : 0.1;
    const k = level > 0.02 ? 0.25 + 0.75 * level : 0;
    const c = level > 0.02 ? [base[0] * k, base[1] * k, base[2] * k] : [dead, dead * 0.98, dead * 0.94];
    l.inst.mesh.setColorAt(l.inst.k, _c.setRGB(c[0], c[1], c[2]));
    l.inst.mesh.instanceColor.needsUpdate = true;
    const h = tube ? 0.32 : l.type === 'candle' ? 0.25 : 0.55;
    const col = l.halo.geo.attributes.color;
    col.setXYZ(l.halo.k, base[0] * level * h, base[1] * level * h, base[2] * level * h);
    col.needsUpdate = true;
  }

  /**
   * Animate flickering fixtures near (px, pz). `dark(i)` = fixture has no
   * power right now. Returns dynamic-light candidates { d, x, y, z, power, color }.
   */
  flicker(time, px, pz, dark = () => false) {
    const out = [];
    for (const i of this.flickers) {
      const l = this.lights[i];
      if (l.state !== 'flicker' || dark(i)) {
        if (l.state === 'flicker') this.set(i, 0);
        continue;
      }
      const d = Math.hypot(l.x - px, l.z - pz);
      const ph = this.phase[i];
      const t = time * 8 + ph;
      const on = Math.sin(t * 1.3) + Math.sin(t * 0.41 + ph) * 1.1 > -0.3 && fract(Math.sin(Math.floor(t) * 77.1 + ph) * 43758.5) > 0.25;
      const level = on ? 1 : 0.04;
      if (d < 30) this.set(i, level);
      if (d < 16) out.push({ d, x: l.x, y: l.glowY - 0.05, z: l.z, power: l.power * 1.15 * level, color: l.color });
    }
    return out;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.glowTex.dispose();
  }
}

// Write dynamic-light candidates (nearest first) into the shared uniforms.
// Returns the distance to the nearest one used.
export function applyDynamicLights(shared, cands, max) {
  cands.sort((a, b) => a.d - b.d);
  let nearest = Infinity;
  for (let k = 0; k < max; k++) {
    const pos = shared.dynPos.value[k], col = shared.dynCol.value[k];
    const c = cands[k];
    if (!c) {
      pos.set(0, -100, 0, 0);
      continue;
    }
    pos.set(c.x, c.y, c.z, c.power);
    col.setRGB(c.color[0], c.color[1], c.color[2]);
    nearest = Math.min(nearest, c.d);
  }
  return nearest;
}

export function brokenGlass(cb, r, x, z) {
  const b = cb.at('glass', x, z);
  for (let k = 0; k < 3; k++) {
    const a = r.range(0, Math.PI), len = r.range(0.15, 0.5);
    const cx = x + r.range(-0.4, 0.4), cz = z + r.range(-0.4, 0.4);
    b.cylinder([cx - Math.cos(a) * len / 2, 0.018, cz - Math.sin(a) * len / 2], [cx + Math.cos(a) * len / 2, 0.018, cz + Math.sin(a) * len / 2], 0.017, 5);
  }
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const _c = new THREE.Color();

function fract(x) {
  return x - Math.floor(x);
}
