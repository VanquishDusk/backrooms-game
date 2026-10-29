import * as THREE from 'three';
import { mergeGeometries } from '../../world/props.js';

// The Thing on Level 7: a sea serpent seventy metres long. The body is one
// tube whose rings follow the path the head has swum, rebuilt every frame.

const RINGS = 112;
const SEG = 14;
const SPACING = 0.62;
const TRAIL_STEP = 0.25;

function skinTextures() {
  const W = 256, H = 128;
  const make = (draw) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const skin = make((ctx) => {
    ctx.fillStyle = '#4a5646';
    ctx.fillRect(0, 0, W, H);
    // The pale belly runs along the bottom of the body (v ~ 0.75).
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.95);
    g.addColorStop(0, 'rgba(150,150,118,0)');
    g.addColorStop(0.35, 'rgba(150,150,118,0.95)');
    g.addColorStop(0.65, 'rgba(160,158,128,0.95)');
    g.addColorStop(1, 'rgba(150,150,118,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.55, W, H * 0.4);
    // Overlapping scales.
    for (let y = 0; y < H; y += 6) {
      for (let x = (y / 6) % 2 ? 4 : 0; x < W; x += 8) {
        ctx.strokeStyle = `rgba(10,14,10,${(0.25 + Math.random() * 0.3).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0.1, Math.PI - 0.1);
        ctx.stroke();
      }
    }
    // Scars and blotches.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '70,80,60' : '15,20,15'},${(Math.random() * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * W, Math.random() * H * 0.6, 3 + Math.random() * 14, 1 + Math.random() * 4, Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const glow = make((ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // Two rows of spots along the flanks.
    for (const v of [0.47, 0.03, 0.53, 0.97]) {
      for (let x = 6; x < W; x += 16) {
        ctx.fillStyle = 'rgba(150,240,230,0.9)';
        ctx.beginPath();
        ctx.arc(x + Math.random() * 3, v * H, 1.6 + Math.random() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  return { skin, glow };
}

const put = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  return geo;
};

export class Serpent {
  constructor(own, harpoonGeo, ironMat) {
    this.own = own;
    const tx = skinTextures();
    own.textures.push(tx.skin, tx.glow);
    tx.skin.repeat.set(1, 1);
    this.skin = new THREE.MeshLambertMaterial({ map: tx.skin, emissive: 0x9fffff, emissiveMap: tx.glow, emissiveIntensity: 0.35 });
    this.bone = new THREE.MeshLambertMaterial({ color: 0xd8d0b0 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8e4b0 });
    this.mouthMat = new THREE.MeshLambertMaterial({ color: 0x3a0c0c });
    this.finMat = new THREE.MeshLambertMaterial({ color: 0x3a2a24, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    own.mats.push(this.skin, this.bone, this.eyeMat, this.mouthMat, this.finMat);
    this.group = new THREE.Group();

    // The body tube.
    const n = RINGS * (SEG + 1);
    this.positions = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k <= SEG; k++) {
        uv[(i * (SEG + 1) + k) * 2] = (i / RINGS) * 22;
        uv[(i * (SEG + 1) + k) * 2 + 1] = k / SEG;
        if (i < RINGS - 1 && k < SEG) {
          const a = i * (SEG + 1) + k, b = a + SEG + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    this.bodyGeo = new THREE.BufferGeometry();
    this.bodyGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.bodyGeo.setIndex(idx);
    own.geos.push(this.bodyGeo);
    this.body = new THREE.Mesh(this.bodyGeo, this.skin);
    this.body.frustumCulled = false;
    this.group.add(this.body);
    this.radius = [];
    for (let i = 0; i < RINGS; i++) {
      const t = i / (RINGS - 1);
      this.radius.push(t < 0.05 ? 1.25 + t * 6 : t < 0.3 ? 1.55 + (t - 0.05) * 1.8 : Math.max(0.18, 2.0 * Math.pow(1 - (t - 0.3) / 0.7, 0.8)));
    }

    // Spines along the back.
    const spine = new THREE.ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0);
    own.geos.push(spine);
    this.spineRings = [];
    for (let i = 3; i < RINGS * 0.82; i += 3) this.spineRings.push(i);
    this.spines = new THREE.InstancedMesh(spine, this.bone, this.spineRings.length);
    this.spines.frustumCulled = false;
    this.group.add(this.spines);

    this.buildHead();
    this.group.add(this.head);

    // Where it has been: the body follows this trail.
    this.pos = new THREE.Vector3(0, -30, -80);
    this.dir = new THREE.Vector3(0, 0, 1);
    this.trail = [];
    this.resetTrail();
    this.centers = Array.from({ length: RINGS }, () => new THREE.Vector3());
    this.sides = Array.from({ length: RINGS }, () => new THREE.Vector3());
    this.ups = Array.from({ length: RINGS }, () => new THREE.Vector3());
    this.tangents = Array.from({ length: RINGS }, () => new THREE.Vector3());
    this.jaw = 0;
    this.phase = 0;
    this.stuck = [];
    this.harpoonGeo = harpoonGeo;
    this.ironMat = ironMat;
    this.updateBody(0);
  }

  buildHead() {
    const h = new THREE.Group();
    const skull = mergeGeometries([
      put(new THREE.SphereGeometry(1, 16, 12), 0, 0.15, 0.2, 0, 0, 0, 1.35, 1.0, 2.0),
      put(new THREE.CylinderGeometry(0.5, 1.15, 3.2, 14), 0, 0.2, 2.6, Math.PI / 2, 0, 0, 1, 1, 0.62),
      put(new THREE.ConeGeometry(0.28, 1.9, 6), 0.75, 0.95, -0.9, -2.3, 0, -0.35),
      put(new THREE.ConeGeometry(0.28, 1.9, 6), -0.75, 0.95, -0.9, -2.3, 0, 0.35),
      put(new THREE.SphereGeometry(0.4, 8, 6), 0.85, 0.65, 1.05, 0, 0, 0, 1, 0.6, 1.4),
      put(new THREE.SphereGeometry(0.4, 8, 6), -0.85, 0.65, 1.05, 0, 0, 0, 1, 0.6, 1.4),
    ]);
    this.own.geos.push(skull);
    h.add(new THREE.Mesh(skull, this.skin));
    // Milky eyes with no pupils.
    const eye = new THREE.SphereGeometry(0.2, 10, 8);
    this.own.geos.push(eye);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eye, this.eyeMat);
      e.position.set(s * 0.98, 0.52, 1.25);
      h.add(e);
    }
    // Upper teeth.
    const teeth = [];
    for (let k = 0; k < 9; k++) {
      for (const s of [-1, 1]) {
        const z = 1.4 + k * 0.33, w = 0.95 - k * 0.075;
        teeth.push(put(new THREE.ConeGeometry(0.07, 0.38 - k * 0.015, 5), s * w, -0.32, z, Math.PI, 0, 0));
      }
    }
    const tg = mergeGeometries(teeth);
    this.own.geos.push(tg);
    h.add(new THREE.Mesh(tg, this.bone));
    // The mouth, and the lower jaw on a hinge.
    const mouth = new THREE.Mesh(put(new THREE.BoxGeometry(1.4, 0.1, 3.4), 0, -0.3, 2.2), this.mouthMat);
    this.own.geos.push(mouth.geometry);
    h.add(mouth);
    this.jawPivot = new THREE.Group();
    this.jawPivot.position.set(0, -0.35, 0.2);
    const lower = mergeGeometries([
      put(new THREE.CylinderGeometry(0.42, 0.95, 3.6, 12), 0, -0.22, 1.9, Math.PI / 2, 0, 0, 1, 1, 0.42),
    ]);
    const lowerTeeth = [];
    for (let k = 0; k < 8; k++) {
      for (const s of [-1, 1]) lowerTeeth.push(put(new THREE.ConeGeometry(0.06, 0.32, 5), s * (0.8 - k * 0.075), 0.05, 1.4 + k * 0.33));
    }
    const ltg = mergeGeometries(lowerTeeth);
    this.own.geos.push(lower, ltg);
    this.jawPivot.add(new THREE.Mesh(lower, this.skin), new THREE.Mesh(ltg, this.bone));
    h.add(this.jawPivot);
    // Frills behind the head.
    for (const s of [-1, 1]) {
      const fin = new THREE.PlaneGeometry(2.4, 1.6, 3, 2);
      const p = fin.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (0.4 + (p.getX(i) + 1.2) / 2.4));
      this.own.geos.push(fin);
      const f = new THREE.Mesh(fin, this.finMat);
      f.position.set(s * 1.25, 0.1, -1.4);
      f.rotation.set(0, s * 1.2, s * 0.25);
      h.add(f);
    }
    this.head = h;
  }

  resetTrail() {
    this.trail.length = 0;
    const n = Math.ceil((RINGS * SPACING) / TRAIL_STEP) + 4;
    for (let i = 0; i < n; i++) this.trail.push(this.pos.clone().addScaledVector(this.dir, -i * TRAIL_STEP));
  }

  // Put it somewhere, pointing some way, body straight out behind.
  place(x, y, z, dx, dy, dz) {
    this.pos.set(x, y, z);
    this.dir.set(dx, dy, dz).normalize();
    this.resetTrail();
  }

  // Swim towards a point, turning at most `turn` radians a second.
  swim(tx, ty, tz, speed, turn, dt) {
    const want = new THREE.Vector3(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const d = want.length();
    if (d > 0.01) {
      want.divideScalar(d);
      const ang = this.dir.angleTo(want);
      if (ang > 1e-4) {
        const k = Math.min(1, (turn * dt) / ang);
        this.dir.lerp(want, k).normalize();
      }
    }
    this.pos.addScaledVector(this.dir, speed * dt);
    this.speed = speed;
    return d;
  }

  // Lay the body along the trail.
  updateBody(dt) {
    this.phase += dt * (1.5 + (this.speed || 0) * 0.25);
    const tr = this.trail;
    if (tr[0].distanceTo(this.pos) >= TRAIL_STEP) {
      tr.unshift(this.pos.clone());
      tr.pop();
    } else {
      tr[0].copy(this.pos);
    }
    let seg = 0, acc = 0;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < RINGS; i++) {
      const s = i * SPACING;
      while (seg < tr.length - 2 && acc + tr[seg].distanceTo(tr[seg + 1]) < s) {
        acc += tr[seg].distanceTo(tr[seg + 1]);
        seg++;
      }
      const a = tr[seg], b = tr[seg + 1];
      const l = a.distanceTo(b) || 1e-6;
      const f = Math.min(1, (s - acc) / l);
      const c = this.centers[i].copy(a).lerp(b, f);
      const t = this.tangents[i].copy(a).sub(b).normalize();
      if (t.lengthSq() < 0.5) t.copy(this.dir);
      const side = this.sides[i].crossVectors(t, up);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      this.ups[i].crossVectors(side, t).normalize();
      // A slow living sway along the body.
      c.addScaledVector(side, Math.sin(this.phase - i * 0.18) * 0.35 * Math.min(1, i / 10));
    }
    const P = this.positions;
    for (let i = 0; i < RINGS; i++) {
      const c = this.centers[i], sd = this.sides[i], u = this.ups[i], r = this.radius[i];
      for (let k = 0; k <= SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        // A flatter belly.
        const rr = r * (sn < 0 ? 1 + sn * 0.18 : 1);
        const o = (i * (SEG + 1) + k) * 3;
        P[o] = c.x + (sd.x * cs + u.x * sn) * rr;
        P[o + 1] = c.y + (sd.y * cs + u.y * sn) * rr;
        P[o + 2] = c.z + (sd.z * cs + u.z * sn) * rr;
      }
    }
    this.bodyGeo.attributes.position.needsUpdate = true;
    this.bodyGeo.computeVertexNormals();
    this.bodyGeo.computeBoundingSphere();

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    this.spineRings.forEach((i, k) => {
      const r = this.radius[i];
      p.copy(this.centers[i]).addScaledVector(this.ups[i], r * 0.85);
      q.setFromUnitVectors(Y, this.ups[i].clone().addScaledVector(this.tangents[i], -0.6).normalize());
      sc.set(r * 0.9, r * 0.9, r * 0.9);
      this.spines.setMatrixAt(k, m.compose(p, q, sc));
    });
    this.spines.instanceMatrix.needsUpdate = true;

    // The head sits at the front, looking along the way it swims.
    this.head.position.copy(this.centers[0]).addScaledVector(this.tangents[0], 0.6);
    const look = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.tangents[0].clone().negate(), this.ups[0]);
    this.head.quaternion.setFromRotationMatrix(look);
    this.jawPivot.rotation.x = this.jaw * 0.75;

    for (const h of this.stuck) {
      if (h.ring == null) continue;
      const i = h.ring;
      h.mesh.position.copy(this.centers[i]).addScaledVector(this.sides[i], h.a).addScaledVector(this.ups[i], h.b).addScaledVector(this.tangents[i], h.c);
      const out = this.sides[i].clone().multiplyScalar(h.a).addScaledVector(this.ups[i], h.b).normalize();
      h.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out.negate().addScaledVector(this.tangents[i], 0.3).normalize());
    }
  }

  // Where the head is (its centre), for hits and bites.
  headPoint(out = new THREE.Vector3()) {
    return out.copy(this.centers[0]).addScaledVector(this.tangents[0], 2.2);
  }

  // A harpoon travelling from a to b: did it hit? Returns { where, ring | head, point }.
  hitTest(a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const l2 = ab.lengthSq() || 1e-6;
    const near = (c, r) => {
      const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(c, a).dot(ab) / l2));
      const p = a.clone().addScaledVector(ab, t);
      return p.distanceTo(c) < r ? p : null;
    };
    const hp = this.headPoint();
    let p = near(hp, 2.3);
    if (p) return { head: true, point: p };
    for (let i = 2; i < RINGS * 0.75; i += 2) {
      p = near(this.centers[i], this.radius[i] + 0.25);
      if (p) return { head: false, ring: i, point: p };
    }
    return null;
  }

  // Leave the harpoon sticking out of it.
  stick(hit) {
    if (this.stuck.length > 14) {
      const old = this.stuck.shift();
      old.mesh.parent?.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(this.harpoonGeo, this.ironMat);
    if (hit.head) {
      this.head.add(mesh);
      const local = this.head.worldToLocal(hit.point.clone());
      local.multiplyScalar(0.85);
      mesh.position.copy(local);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), local.clone().normalize().negate());
      this.stuck.push({ mesh, ring: null });
    } else {
      const i = hit.ring;
      const d = hit.point.clone().sub(this.centers[i]);
      const r = this.radius[i] * 0.9;
      const a = d.dot(this.sides[i]), b = d.dot(this.ups[i]);
      const l = Math.hypot(a, b) || 1;
      this.group.add(mesh);
      this.stuck.push({ mesh, ring: i, a: (a / l) * r, b: (b / l) * r, c: 0 });
    }
  }

  // Is any part of the body near (x, y, z)? Returns the clearance.
  clearance(x, y, z) {
    let best = Infinity;
    for (let i = 0; i < RINGS; i += 3) {
      const c = this.centers[i];
      best = Math.min(best, Math.hypot(c.x - x, c.y - y, c.z - z) - this.radius[i]);
    }
    return best;
  }
}
