import * as THREE from 'three';
import { disposeTextures, mergeGeometries } from '../../world/props.js?v=20261101b';
import { EntityManager } from '../../entities/lib/index.js?v=20261101b';
import { generateCave, buildCaveMeshes, buildColliders, CS, N, WATER } from './cave.js?v=20261101b';

// Level 8 — "Cave Systems".
//
// Endless caves, cold and almost completely dark. Pale stalactites over
// black water. Your flashlight is weak here, and the batteries go fast.
//
//   - The Flooded Mouth, where you come up out of the water from Level 7
//   - The Almond Lake: drink from it (it's all Almond Water down here)
//   - Hyperspace Lane: a long winding tunnel lit by glowing blue bacteria,
//     where the Light Guides hang in the air and lead you on
//   - Rottnest Jungle: a huge cavern of glowing mushrooms, Deathrats, and
//     gravity that sometimes pulls sideways. An old vent pipe: Level 2
//   - New Movile Cave: hot, foul air, toxic gas (cover your mouth),
//     Deathmoths
//   - Kavragost: an abandoned mining town, lanterns still burning, and the
//     start of the 9th Road
//   - Handyland: stone hands as big as houses, glowing red moss, a Wrangler,
//     and a floor that gives way (Level 69)
//   - The 9th Road: marked stakes and rope to a door at its end (Level 9)
//   - Floods: every so often the water comes up, fast

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function tex(own, w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  own.textures.push(t);
  return t;
}

function rockTex(own, base, streaks) {
  return tex(own, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,250' : '20,18,16'},${(Math.random() * 0.12).toFixed(3)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,250,240' : '30,26,22'},${(Math.random() * 0.12).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 4 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flowstone streaks running down.
    for (let i = 0; i < streaks; i++) {
      const x = Math.random() * w;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(240,236,220,0)');
      g.addColorStop(0.5, `rgba(240,236,220,${(Math.random() * 0.25).toFixed(2)})`);
      g.addColorStop(1, 'rgba(240,236,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + Math.random() * 6, h);
    }
  });
}

function softTex(own) {
  return tex(own, 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, false);
}

const put = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
  return g;
};

// A stone hand reaching up out of the floor.
function handGeometry() {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.7, 0.95, 6, 10).translate(0, 3, 0));
  parts.push(new THREE.SphereGeometry(0.8, 10, 8).scale(1, 0.7, 0.75).translate(0, 6.1, 0));
  parts.push(new THREE.BoxGeometry(2.0, 2.2, 0.8).translate(0, 7.3, 0));
  for (let k = 0; k < 4; k++) {
    const x = -0.75 + k * 0.5, len = k === 1 || k === 2 ? 1.4 : 1.15;
    const curl = 0.3 + k * 0.12;
    parts.push(new THREE.CylinderGeometry(0.2, 0.23, len, 7).translate(0, len / 2, 0).rotateX(curl).translate(x, 8.35, 0));
    const tipY = 8.35 + Math.cos(curl) * len, tipZ = Math.sin(curl) * len;
    parts.push(new THREE.CylinderGeometry(0.16, 0.2, len * 0.8, 7).translate(0, len * 0.4, 0).rotateX(curl + 0.7).translate(x, tipY, tipZ));
  }
  parts.push(new THREE.CylinderGeometry(0.22, 0.26, 1.2, 7).translate(0, 0.6, 0).rotateZ(0.9).translate(-1.0, 6.9, 0.1));
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

export class Level8 {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, rng, shared } = ctx;
    this.scene = scene;
    this.shared = shared;
    this.rng = rng.fork('runtime');
    this.cameraFar = 220;
    this.own = { geos: [], mats: [], textures: [] };
    const cave = (this.cave = generateCave(rng.fork('cave')));
    this.group = new THREE.Group();
    scene.add(this.group);
    const T = {
      floor: rockTex(this.own, '#6a645c', 10),
      wall: rockTex(this.own, '#bcb6a8', 60),
      ceil: rockTex(this.own, '#dcd6c6', 90),
    };
    const L = (o, phong = false) => {
      const m = phong ? new THREE.MeshPhongMaterial(o) : new THREE.MeshLambertMaterial(o);
      this.own.mats.push(m);
      return m;
    };
    this.M = {
      floor: L({ map: T.floor, vertexColors: true, shininess: 70, specular: 0x4a4a4a }, true),
      wall: L({ map: T.wall, vertexColors: true, side: THREE.DoubleSide, shininess: 40, specular: 0x3a3a3a }, true),
      ceil: L({ map: T.ceil, vertexColors: true, side: THREE.DoubleSide }),
    };
    const meshes = buildCaveMeshes(cave, this.M);
    this.own.geos.push(...meshes.geos);
    this.group.add(meshes.group);
    this.col = buildColliders(cave);
    this.soft = softTex(this.own);
    this.glows = [];
    this.buildFormations(rng.fork('stal'));
    this.buildWater();
    this.buildLane(rng.fork('lane'));
    this.buildLakeGlow(rng.fork('lakeglow'));
    this.buildJungle(rng.fork('jungle'));
    this.buildMovile(rng.fork('movile'));
    this.buildKavragost(rng.fork('kav'));
    this.buildHands(rng.fork('hands'));
    this.buildRoad(rng.fork('road'));
    this.buildGuides();
    this.drips = this.buildDrips();

    this.hemi = new THREE.HemisphereLight(0x5a6a7a, 0x1a1816, 0.3);
    this.spot = new THREE.SpotLight(0xfff0d8, 0, 30, 0.55, 0.55, 1.1);
    this.group.add(this.hemi, this.spot, this.spot.target);
    this.pool = Array.from({ length: 8 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 22, 1.3);
      this.group.add(l);
      return l;
    });

    const Z = cave.zones;
    const sp = this.findAir(Z.spawn.x + 8, Z.spawn.z, 4);
    this.spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-(Z.lake.x - sp.x), -(Z.lake.z - sp.z)) };
    this.world = {
      map: cave.map,
      collide: (pos, r) => this.col.collide(pos, r),
      groundAt: (x, z) => Math.max(cave.floorAt(x, z), -2.2),
      sampleLight: (x, z) => {
        const l = this.lightAt(x, z);
        return [l, l, l];
      },
      ceilingHeight: (x, z) => cave.ceilAt(x, z) - cave.floorAt(x, z),
      lights: this.glows.map((g) => ({ x: g.x, z: g.z, state: 'on' })),
      lightsNear: (x, z, r) => this.glows.map((g, i) => [i, Math.hypot(g.x - x, g.z - z)]).filter((p) => p[1] <= r),
    };
    this.entities = new EntityManager({ scene, world: this.world, audio: ctx.audio, rng: this.rng.fork('ents'), shared });
    this.spawnEntities();

    this.time = 0;
    this.done = false;
    this.told = {};
    this.water = WATER;
    this.flood = { state: 'calm', t: 0, next: this.rng.range(80, 130), peak: 1 };
    this.breath = 100;
    this.gravity = { t: 0, next: 30, dx: 0, dz: 0 };
    this.fog = new THREE.Color();
    this.zone = null;
    this.crumble = 0;
    this.nextDrip = 1;
    this.script = [
      [1.5, 'You come up gasping in a freezing pool, in the dark. Rock all around, dripping.'],
      [7, 'Your flashlight seems weaker down here. The batteries won\'t last.'],
    ];
  }

  findAir(x, z, r = 8) {
    const { cave } = this;
    for (let k = 0; k < 400; k++) {
      const a = k * 2.4, d = (k / 400) * r * 3;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const i = Math.floor(px / CS), j = Math.floor(pz / CS);
      if (i >= 0 && j >= 0 && i < N && j < N && cave.walk[j * N + i]) return { x: (i + 0.5) * CS, z: (j + 0.5) * CS };
    }
    return { x, z };
  }

  // Air spots in a zone (or, with a predicate, anywhere it holds).
  spotsIn(zone, n, rng, minFromCentre = 0) {
    const Z = this.cave.zones[zone];
    const out = [];
    for (let k = 0; k < n * 40 && out.length < n; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(minFromCentre, Z.r * 0.95);
      const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
      const i = Math.floor(x / CS), j = Math.floor(z / CS);
      if (i < 0 || j < 0 || i >= N || j >= N || !this.cave.walk[j * N + i]) continue;
      out.push({ x, z });
    }
    return out;
  }

  // ---- Decoration --------------------------------------------------------------------

  buildFormations(rng) {
    const { cave } = this;
    const cone = new THREE.ConeGeometry(1, 1, 7, 1).translate(0, -0.5, 0);
    cone.rotateX(Math.PI);
    const coneUp = new THREE.ConeGeometry(1, 1, 7, 1).translate(0, 0.5, 0);
    this.own.geos.push(cone, coneUp);
    const mat = new THREE.MeshPhongMaterial({ color: 0xded8c4, shininess: 60, specular: 0x666660 });
    const matUp = new THREE.MeshPhongMaterial({ color: 0xb8b0a0, shininess: 50, specular: 0x444440 });
    this.own.mats.push(mat, matUp);
    const down = [], up = [];
    for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
      if (!cave.isAir(i, j)) continue;
      // More of them near the walls, and big ones in the caverns.
      let nearRock = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (!cave.isAir(i + di, j + dj)) nearRock++;
      const p = 0.18 + nearRock * 0.05;
      for (let k = 0; k < 3; k++) {
        if (rng.next() > p) continue;
        const x = i * CS + rng.range(-1, 1), z = j * CS + rng.range(-1, 1);
        const h = cave.ceilAt(x, z) - cave.floorAt(x, z);
        const len = rng.range(0.3, 1) * Math.min(4, 0.6 + h * 0.18) * (rng.next() < 0.1 ? 2 : 1);
        down.push([x, cave.ceilAt(x, z) + 0.15, z, len, rng.range(0.06, 0.12) * (0.6 + len * 0.35)]);
      }
      if (rng.next() < 0.05 + nearRock * 0.01) {
        const x = i * CS + rng.range(-1, 1), z = j * CS + rng.range(-1, 1);
        if (cave.floorAt(x, z) > WATER + 0.2) up.push([x, cave.floorAt(x, z) - 0.1, z, rng.range(0.3, 1.6), rng.range(0.12, 0.3)]);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [list, geo, m] of [[down, cone, mat], [up, coneUp, matUp]]) {
      const mesh = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach(([x, y, z, len, r], i) => mesh.setMatrixAt(i, m4.compose(p.set(x, y, z), q.identity(), s.set(r, len, r))));
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(N * CS, N * CS, 1, 1).rotateX(-Math.PI / 2);
    this.own.geos.push(geo);
    const mat = new THREE.MeshPhongMaterial({ color: 0x0c1618, emissive: 0x050a0c, transparent: true, opacity: 0.82, shininess: 140, specular: 0xa0b0b0, depthWrite: false });
    this.own.mats.push(mat);
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.set((N * CS) / 2, WATER, (N * CS) / 2);
    this.waterMesh.renderOrder = 2;
    this.group.add(this.waterMesh);
  }

  // Glowing points on the rock: bacteria, moss.
  glowPoints(list, color, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(), 3));
    this.own.geos.push(geo);
    const mat = new THREE.PointsMaterial({ color, size, map: this.soft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    this.own.mats.push(mat);
    const pts = new THREE.Points(geo, mat);
    this.group.add(pts);
    return mat;
  }

  // Points on the walls and ceiling near a predicate's cells.
  rockSpecks(rng, n, test) {
    const { cave } = this;
    const out = [];
    for (let k = 0; k < n * 30 && out.length < n; k++) {
      const i = rng.int(2, N - 2), j = rng.int(2, N - 2);
      if (!cave.isAir(i, j)) continue;
      const x = i * CS + rng.range(-1, 1), z = j * CS + rng.range(-1, 1);
      if (!test(x, z)) continue;
      const f = cave.floorAt(x, z), c = cave.ceilAt(x, z);
      // Mostly high up, and near the rock.
      let y = c - rng.range(0, 0.4);
      if (rng.next() < 0.35) {
        // On a wall: step towards the nearest rock corner.
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!cave.isAir(i + di, j + dj)) {
            out.push([x + di * 0.9, rng.range(f + 0.5, c), z + dj * 0.9]);
            break;
          }
        }
        continue;
      }
      out.push([x, y, z]);
    }
    return out;
  }

  buildLane(rng) {
    const pts = this.rockSpecks(rng, 5000, (x, z) => this.cave.kindAt(x, z) === 1);
    this.laneMat = this.glowPoints(pts, 0x5aa8ff, 0.6);
    // Light sources every so often along the lane.
    const t = this.cave.tunnels.find((x) => x.kind === 'lane');
    for (let k = 0; k < t.pts.length; k += 3) {
      const p = t.pts[k];
      this.glows.push({ x: p.x, y: this.cave.ceilAt(p.x, p.z) - 0.8, z: p.z, color: [0.3, 0.55, 1], power: 5, zone: 'lane' });
    }
  }

  buildLakeGlow(rng) {
    const Z = this.cave.zones.lake;
    this.glowPoints(this.rockSpecks(rng, 1400, (x, z) => Math.hypot(x - Z.x, z - Z.z) < Z.r + 2), 0x9adcff, 0.3);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const x = Z.x + Math.cos(a) * Z.r * 0.5, z = Z.z + Math.sin(a) * Z.r * 0.5;
      this.glows.push({ x, y: this.cave.ceilAt(x, z) - 1, z, color: [0.55, 0.8, 1], power: 2.2, zone: 'lake' });
    }
  }

  buildJungle(rng) {
    const Z = this.cave.zones.jungle;
    const stem = new THREE.CylinderGeometry(0.05, 0.08, 1, 6).translate(0, 0.5, 0);
    const cap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1);
    this.own.geos.push(stem, cap);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0xc8d8d0, emissive: 0x203028 });
    const capMats = [0x30f0d0, 0x7a6aff, 0x40c0ff, 0xd060ff].map((c) => new THREE.MeshBasicMaterial({ color: c }));
    this.own.mats.push(stemMat, ...capMats);
    const shrooms = this.spotsIn('jungle', 420, rng);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const stems = new THREE.InstancedMesh(stem, stemMat, shrooms.length);
    const caps = capMats.map((m) => ({ m, list: [] }));
    shrooms.forEach((sh, k) => {
      const big = rng.next() < 0.08;
      const h = big ? rng.range(1.5, 3) : rng.range(0.15, 0.6);
      const r = big ? rng.range(0.8, 1.6) : rng.range(0.08, 0.3);
      const y = this.cave.floorAt(sh.x, sh.z);
      stems.setMatrixAt(k, m4.compose(p.set(sh.x, y, sh.z), q.identity(), s.set(big ? 3 : 1, h, big ? 3 : 1)));
      caps[k % caps.length].list.push([sh.x, y + h, sh.z, r]);
      if (big || k % 25 === 0) this.glows.push({ x: sh.x, y: y + h + 0.6, z: sh.z, color: [0.25, 0.95, 0.85], power: big ? 4 : 2.5, zone: 'jungle' });
      if (big) this.col.extra.push({ x: sh.x, z: sh.z, r: 0.3 });
    });
    stems.computeBoundingSphere();
    this.group.add(stems);
    for (const c of caps) {
      const mesh = new THREE.InstancedMesh(cap, c.m, c.list.length);
      c.list.forEach(([x, y, z, r], k) => mesh.setMatrixAt(k, m4.compose(p.set(x, y, z), q.identity(), s.set(r, r, r))));
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    // Glowing moss up on the ceiling, and ferns.
    this.glowPoints(this.rockSpecks(rng, 900, (x, z) => Math.hypot(x - Z.x, z - Z.z) < Z.r + 2), 0x40e0a0, 0.6);
    const fern = new THREE.PlaneGeometry(0.5, 1.2).translate(0, 0.6, 0);
    this.own.geos.push(fern);
    const fernMat = new THREE.MeshLambertMaterial({ color: 0x2a6a4a, emissive: 0x0a2a1a, side: THREE.DoubleSide });
    this.own.mats.push(fernMat);
    const ferns = this.spotsIn('jungle', 500, rng);
    const fm = new THREE.InstancedMesh(fern, fernMat, ferns.length);
    ferns.forEach((f, k) => fm.setMatrixAt(k, m4.compose(p.set(f.x, this.cave.floorAt(f.x, f.z), f.z), q.setFromEuler(new THREE.Euler(rng.range(-0.5, 0.5), rng.range(0, 6), rng.range(-0.3, 0.3))), s.setScalar(rng.range(0.6, 1.5)))));
    fm.computeBoundingSphere();
    this.group.add(fm);
    // The old vent pipe, sticking out of the rock at the cavern's edge: Level 2.
    let best = null;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      for (let r = Z.r * 0.5; r < Z.r + 20; r += 1) {
        const x = Z.x + Math.cos(a) * r, z = Z.z + Math.sin(a) * r;
        if (!this.cave.isAir(Math.round(x / CS), Math.round(z / CS))) {
          if (!best || r > best.r) best = { x: Z.x + Math.cos(a) * (r - 2.2), z: Z.z + Math.sin(a) * (r - 2.2), a, r };
          break;
        }
      }
    }
    const rust = new THREE.MeshLambertMaterial({ color: 0x7a4a2a });
    const dark = new THREE.MeshBasicMaterial({ color: 0x020202 });
    this.own.mats.push(rust, dark);
    const pg = new THREE.Group();
    const y = this.cave.floorAt(best.x, best.z) + 1.3;
    pg.position.set(best.x, y, best.z);
    pg.rotation.y = -best.a + Math.PI / 2;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 18, 1, true).rotateX(Math.PI / 2), rust);
    pipe.material.side = THREE.DoubleSide;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.15, 18), dark);
    hole.position.z = -1.5;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 18), rust);
    rim.position.z = 2.5;
    pipe.position.z = 0.2;
    this.own.geos.push(pipe.geometry, hole.geometry, rim.geometry);
    pg.add(pipe, hole, rim);
    this.group.add(pg);
    this.vent = { x: best.x, z: best.z };
  }

  buildMovile(rng) {
    const Z = this.cave.zones.movile;
    this.glowPoints(this.rockSpecks(rng, 500, (x, z) => Math.hypot(x - Z.x, z - Z.z) < Z.r + 3), 0xd8e070, 0.35);
    // Bacterial mats floating on the water.
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a8a40, transparent: true, opacity: 0.6, depthWrite: false });
    this.own.mats.push(mat);
    for (let k = 0; k < 30; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0, Z.r * 0.8);
      const g = new THREE.CircleGeometry(rng.range(0.5, 2), 7).rotateX(-Math.PI / 2);
      this.own.geos.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(Z.x + Math.cos(a) * r, WATER + 0.02, Z.z + Math.sin(a) * r);
      this.group.add(m);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      this.glows.push({ x: Z.x + Math.cos(a) * Z.r * 0.5, y: 2.5, z: Z.z + Math.sin(a) * Z.r * 0.5, color: [0.85, 0.9, 0.4], power: 2.2, zone: 'movile' });
    }
  }

  buildKavragost(rng) {
    const Z = this.cave.zones.kav;
    const wood = new THREE.MeshLambertMaterial({ map: tex(this.own, 64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#5a4028';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        ctx.fillStyle = 'rgba(20,10,4,0.5)';
        ctx.fillRect(0, y, w, 1);
      }
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '120,90,60' : '20,10,4'},0.3)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 4, 1);
      }
    }) });
    const iron = new THREE.MeshLambertMaterial({ color: 0x3a3836 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb050 });
    this.own.mats.push(wood, iron, lampMat);
    const parts = { wood: [], iron: [], lamp: [] };
    const fy = (x, z) => this.cave.floorAt(x, z);
    const box = (k, x, y, z, w, h, d, ry = 0) => parts[k].push(put(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry, 0));
    // Shacks.
    for (const s of this.spotsIn('kav', 7, rng, 5)) {
      const ry = rng.range(0, Math.PI), y = fy(s.x, s.z);
      const w = rng.range(3, 4.5), d = rng.range(3, 4);
      box('wood', s.x, y + 1.2, s.z, w, 2.4, d, ry);
      box('wood', s.x, y + 2.55, s.z, w + 0.5, 0.15, d + 0.5, ry);
      box('iron', s.x + Math.cos(ry) * 0.01, y + 1, s.z + Math.sin(-ry) * (d / 2 + 0.01), 0.8, 2, 0.05, ry);
      const r = Math.max(w, d) / 2 + 0.2;
      this.col.extra.push({ x: s.x, z: s.z, r });
      this.glows.push({ x: s.x + 1, y: y + 2, z: s.z + 1, color: [1, 0.65, 0.3], power: 2.4, zone: 'kav' });
      parts.lamp.push(put(new THREE.SphereGeometry(0.14, 8, 6), s.x + 1, y + 2, s.z + 1));
    }
    // Scaffolding against the rock.
    for (const s of this.spotsIn('kav', 4, rng, Z.r * 0.6)) {
      const y = fy(s.x, s.z);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box('wood', s.x + dx, y + 3, s.z + dz, 0.15, 6, 0.15);
      for (const hy of [2, 4, 6]) box('wood', s.x, y + hy, s.z, 2.3, 0.1, 2.3);
      this.col.extra.push({ x: s.x, z: s.z, r: 1.5 });
    }
    // Rails along the start of the 9th Road, and a cart.
    const road = this.cave.tunnels.find((t) => t.kind === 'road');
    for (let k = 0; k < Math.min(14, road.pts.length - 1); k++) {
      const a = road.pts[k], b = road.pts[k + 1];
      const ang = Math.atan2(b.x - a.x, b.z - a.z), len = Math.hypot(b.x - a.x, b.z - a.z);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, y = fy(mx, mz);
      for (const s of [-0.5, 0.5]) box('iron', mx + Math.cos(ang) * s, y + 0.06, mz - Math.sin(ang) * s, 0.06, 0.08, len + 0.05, ang);
      box('wood', mx, y + 0.02, mz, 1.4, 0.06, 0.2, ang);
    }
    const c0 = road.pts[3], c1 = road.pts[4];
    const ca = Math.atan2(c1.x - c0.x, c1.z - c0.z);
    box('iron', c0.x, fy(c0.x, c0.z) + 0.75, c0.z, 1.2, 0.9, 1.8, ca);
    this.col.extra.push({ x: c0.x, z: c0.z, r: 1 });
    // A sign.
    const signTex = tex(this.own, 256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#4a3420';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e8dcc0';
      ctx.font = 'bold 34px serif';
      ctx.textAlign = 'center';
      ctx.fillText('KAVRAGOST', w / 2, 48);
      ctx.fillStyle = '#e8c040';
      ctx.font = 'bold 26px serif';
      ctx.fillText('9th ROAD  →', w / 2, 100);
    }, false);
    const signMat = new THREE.MeshLambertMaterial({ map: signTex, emissive: 0x201810 });
    this.own.mats.push(signMat);
    const r0 = road.pts[1];
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), signMat);
    sg.position.set(r0.x + 1.6, fy(r0.x, r0.z) + 1.9, r0.z);
    sg.rotation.y = Math.atan2(Z.x - r0.x, Z.z - r0.z);
    this.own.geos.push(sg.geometry);
    this.group.add(sg);
    for (const [k, m] of [['wood', wood], ['iron', iron], ['lamp', lampMat]]) {
      if (!parts[k].length) continue;
      const g = mergeGeometries(parts[k]);
      for (const p of parts[k]) p.dispose();
      this.own.geos.push(g);
      this.group.add(new THREE.Mesh(g, m));
    }
  }

  buildHands(rng) {
    const Z = this.cave.zones.hands;
    const geo = handGeometry();
    this.own.geos.push(geo);
    const mat = new THREE.MeshLambertMaterial({ color: 0xa89a8a, emissive: 0x100808 });
    this.own.mats.push(mat);
    const spots = this.spotsIn('hands', 9, rng, 6);
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach((h, k) => {
      const sc = rng.range(0.9, 1.9);
      const hgt = this.cave.ceilAt(h.x, h.z) - this.cave.floorAt(h.x, h.z);
      const fit = Math.min(sc, (hgt - 1) / 9.5);
      mesh.setMatrixAt(k, m4.compose(p.set(h.x, this.cave.floorAt(h.x, h.z) - 0.3, h.z), q.setFromEuler(new THREE.Euler(rng.range(-0.25, 0.25), rng.range(0, 6), rng.range(-0.25, 0.25))), s.setScalar(fit)));
      this.col.extra.push({ x: h.x, z: h.z, r: 0.95 * fit });
    });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.glowPoints(this.rockSpecks(rng, 1100, (x, z) => Math.hypot(x - Z.x, z - Z.z) < Z.r + 3), 0xff3a30, 0.4);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      this.glows.push({ x: Z.x + Math.cos(a) * Z.r * 0.6, y: 3, z: Z.z + Math.sin(a) * Z.r * 0.6, color: [1, 0.25, 0.2], power: 2.6, zone: 'hands' });
    }
    // A patch of floor that's cracked right through.
    const c = this.spotsIn('hands', 1, rng, Z.r * 0.3)[0] || { x: Z.x + 6, z: Z.z };
    const crackTex = tex(this.own, 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      for (let k = 0; k < 9; k++) {
        ctx.lineWidth = 1 + Math.random() * 3;
        ctx.beginPath();
        let x = 64, y = 64;
        ctx.moveTo(x, y);
        const a = (k / 9) * Math.PI * 2;
        for (let s2 = 0; s2 < 6; s2++) {
          x += Math.cos(a + (Math.random() - 0.5)) * 10;
          y += Math.sin(a + (Math.random() - 0.5)) * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }, false);
    const cm = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.own.mats.push(cm);
    const cg = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2);
    this.own.geos.push(cg);
    const crack = new THREE.Mesh(cg, cm);
    crack.position.set(c.x, this.cave.floorAt(c.x, c.z) + 0.03, c.z);
    this.group.add(crack);
    this.crack = c;
  }

  buildRoad(rng) {
    const road = this.cave.tunnels.find((t) => t.kind === 'road');
    const stake = new THREE.MeshLambertMaterial({ color: 0x6a5030 });
    const band = new THREE.MeshLambertMaterial({ color: 0xe0b020, emissive: 0x403000 });
    const rope = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
    this.own.mats.push(stake, band, rope);
    const parts = { stake: [], band: [], rope: [] };
    let prev = null;
    for (let k = 2; k < road.pts.length - 1; k += 3) {
      const a = road.pts[k], b = road.pts[k + 1];
      const nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz) || 1;
      const x = a.x + (nx / l) * 1.0, z = a.z + (nz / l) * 1.0;
      const y = this.cave.floorAt(x, z);
      parts.stake.push(put(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6), x, y + 0.6, z));
      parts.band.push(put(new THREE.CylinderGeometry(0.065, 0.065, 0.18, 6), x, y + 1.05, z));
      if (prev) {
        const dx = x - prev.x, dz = z - prev.z, dy = y - prev.y, len = Math.hypot(dx, dy, dz);
        const g = new THREE.CylinderGeometry(0.015, 0.015, len, 4).translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()));
        g.translate(prev.x, prev.y + 0.95, prev.z);
        parts.rope.push(g);
      }
      prev = { x, y, z };
    }
    for (const [k, m] of [['stake', stake], ['band', band], ['rope', rope]]) {
      const g = mergeGeometries(parts[k]);
      for (const p of parts[k]) p.dispose();
      this.own.geos.push(g);
      this.group.add(new THREE.Mesh(g, m));
    }
    // The door at the end of the road.
    const E = this.cave.zones.road;
    const last = road.pts[road.pts.length - 4];
    const ang = Math.atan2(last.x - E.x, last.z - E.z);
    const door = new THREE.Group();
    door.position.set(E.x, this.cave.floorAt(E.x, E.z), E.z);
    door.rotation.y = ang;
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    const nine = new THREE.MeshBasicMaterial({ map: tex(this.own, 64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f0c030';
      ctx.font = 'bold 50px serif';
      ctx.textAlign = 'center';
      ctx.fillText('9', w / 2, 50);
    }, false) });
    this.own.mats.push(doorMat, nine);
    const add = (g, m, x, y, z) => {
      this.own.geos.push(g);
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      door.add(o);
    };
    add(new THREE.BoxGeometry(0.2, 2.4, 0.3), doorMat, -0.65, 1.2, 0);
    add(new THREE.BoxGeometry(0.2, 2.4, 0.3), doorMat, 0.65, 1.2, 0);
    add(new THREE.BoxGeometry(1.5, 0.2, 0.3), doorMat, 0, 2.4, 0);
    add(new THREE.BoxGeometry(1.1, 2.2, 0.06), doorMat, 0, 1.1, 0);
    add(new THREE.PlaneGeometry(0.4, 0.4), nine, 0, 1.6, 0.04);
    add(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }), 0.9, 2.1, 0.2);
    this.group.add(door);
    this.glows.push({ x: E.x, y: this.cave.floorAt(E.x, E.z) + 2.2, z: E.z, color: [1, 0.7, 0.35], power: 3, zone: 'road' });
    this.door9 = { x: E.x + Math.sin(ang) * 0.5, z: E.z + Math.cos(ang) * 0.5 };
  }

  // The Light Guides: little lights that hang ahead of you and wait.
  buildGuides() {
    this.guides = [];
    const mat = new THREE.SpriteMaterial({ map: this.soft, color: 0xcfe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.own.mats.push(mat);
    const L = this.cave.zones.lake;
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.7);
      s.position.set(L.x + 10 + k, 1.6, L.z);
      this.group.add(s);
      this.guides.push({ s, ph: k * 2.1 });
    }
    this.guideGoal = null;
  }

  buildDrips() {
    const n = 120;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.own.geos.push(geo);
    const mat = new THREE.PointsMaterial({ color: 0xd8e0e8, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false });
    this.own.mats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    return { pts, pos, vel: new Float32Array(n), n };
  }

  // ---- Entities ----------------------------------------------------------------------------

  spawnEntities() {
    const m = this.entities;
    const rng = this.rng.fork('spawns');
    const at = (zone, n, type, opts = {}) => {
      for (const s of this.spotsIn(zone, n, rng, 4)) m.spawn(type, { x: s.x, z: s.z, ...opts });
    };
    at('jungle', 5, 'deathrat', { variant: 'pale' });
    at('lake', 2, 'deathrat', { variant: 'grey' });
    at('movile', 3, 'deathmoth', { variant: 'soldier' });
    at('hands', 1, 'wrangler', { variant: 'human' });
    at('hands', 1, 'wretch');
    at('kav', 1, 'wretch');
    // In the tunnels: Smilers in the dark, Nguithr'xurh on the lane's ceiling.
    const lane = this.cave.tunnels.find((t) => t.kind === 'lane');
    for (const k of [0.35, 0.7]) {
      const p = lane.pts[Math.floor(lane.pts.length * k)];
      const s = this.findAir(p.x, p.z, 3);
      m.spawn('nguithrxurh', { x: s.x, z: s.z, ceiling: this.cave.ceilAt(s.x, s.z) - this.cave.floorAt(s.x, s.z) });
    }
    for (const t of this.cave.tunnels.filter((x) => x.kind === 'side').slice(0, 3)) {
      const p = t.pts[t.pts.length - 2];
      const s = this.findAir(p.x, p.z, 3);
      m.spawn('smiler', { x: s.x, z: s.z });
    }
  }

  // ---- Light --------------------------------------------------------------------------------

  lightAt(x, z) {
    let l = 0.04;
    for (const g of this.glows) {
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < 10) l += (1 - d / 10) * 0.3 * g.power * 0.4;
    }
    return Math.min(1, l);
  }

  updateLights(dt, player) {
    const cands = this.glows.map((g) => [g, Math.hypot(g.x - player.pos.x, g.z - player.pos.z)]).filter((c) => c[1] < 45).sort((a, b) => a[1] - b[1]);
    this.pool.forEach((pl, k) => {
      const c = cands[k];
      if (!c) {
        pl.intensity = 0;
        return;
      }
      const g = c[0];
      pl.position.set(g.x, g.y, g.z);
      pl.color.setRGB(...g.color);
      pl.intensity = g.power * 3 * (0.85 + Math.sin(this.time * 1.3 + g.x) * 0.15);
    });
    // A weak flashlight that gets weaker.
    const cp = Math.cos(player.pitch);
    const f = new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
    this.spot.position.set(player.pos.x, player.pos.y + player.eye - 0.1, player.pos.z);
    this.spot.target.position.copy(this.spot.position).addScaledVector(f, 10);
    const b = player.battery / 100;
    const flick = b < 0.3 && Math.sin(this.time * 31) > 0.6 ? 0.3 : 1;
    this.spot.intensity = player.flashlight ? 42 * (0.35 + 0.65 * b) * flick : 0;
    if (player.flashlight) player.battery = Math.max(0, player.battery - 1.1 * dt);
    this.laneMat.opacity = 0.8 + Math.sin(this.time * 0.8) * 0.2;
  }

  // ---- Per frame ------------------------------------------------------------------------------

  update(dt, player) {
    if (this.done) return;
    this.time += dt;
    const { ctx, cave } = this;
    while (this.script.length && this.time > this.script[0][0]) ctx.hud.message(this.script.shift()[1], 5);
    const px = player.pos.x, pz = player.pos.z;
    // Areas.
    const zone = cave.zoneAt(px, pz) || (cave.kindAt(px, pz) === 1 ? 'lane' : cave.kindAt(px, pz) === 2 ? 'roadway' : null);
    if (zone !== this.zone) {
      this.zone = zone;
      const name = zone === 'lane' ? 'HYPERSPACE LANE' : zone === 'roadway' ? 'THE 9TH ROAD' : zone && cave.zones[zone]?.name;
      if (name && !this.told[`z-${zone}`]) {
        this.told[`z-${zone}`] = true;
        ctx.hud.message(name, 3);
      }
    }
    this.updateLights(dt, player);
    this.updateGuides(dt, player);
    this.updateDrips(dt, player);
    this.updateFlood(dt, player);
    this.updateHazards(dt, player);
    if (this.done) return;
    const res = this.entities.update(dt, player, ctx);
    for (const e of this.entities.list) {
      e.root.position.y = cave.floorAt(e.pos.x, e.pos.z) + (e.pos.y || 0);
      e.root.visible = e.distTo(player) < 50;
    }
    this.updateExits(dt, player);
    if (this.done) return;
    // The dark wears on you.
    player.sanity = Math.max(0, player.sanity - (0.08 + (this.lightAt(px, pz) < 0.1 && !player.flashlight ? 0.12 : 0)) * dt);
    if (player.health <= 0 || player.sanity <= 0 || res.dead) {
      this.done = true;
      const cause = this.breath <= 0 ? 'The water came up, and you couldn\'t find air.' : this.gassed ? 'The air in New Movile Cave was poison.' : player.sanity <= 0 ? 'The dark and the dripping got into your head.' : res.cause;
      ctx.onDeath(cause);
    }
  }

  updateGuides(dt, player) {
    const { cave } = this;
    const L = cave.zones.lake, K = cave.zones.kav, R = cave.zones.road;
    const near = (Z, r) => Math.hypot(player.pos.x - Z.x, player.pos.z - Z.z) < r;
    // Lead to Kavragost, then down the 9th Road.
    const goal = near(K, K.r + 6) || this.passedKav ? R : K;
    if (near(K, K.r)) this.passedKav = true;
    if (goal !== this.guideGoal) {
      this.guideGoal = goal;
      const g = this.findAir(goal.x, goal.z, 4);
      const [gi, gj] = cave.map.cellAt(g.x, g.z);
      this.flow = cave.map.bfs(gi, gj);
    }
    const active = near(L, L.r + 20) || cave.kindAt(player.pos.x, player.pos.z) || this.guidesSeen && !near(R, 10);
    let [ci, cj] = cave.map.cellAt(player.pos.x, player.pos.z);
    let d = this.flow[cave.map.idx(ci, cj)];
    if (d < 0) {
      // Off the grid (deep water): look around for a cell that has a path.
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const v = this.flow[cave.map.idx(Math.min(N - 1, Math.max(0, ci + di)), Math.min(N - 1, Math.max(0, cj + dj)))];
        if (v >= 0) {
          ci += di;
          cj += dj;
          d = v;
          break;
        }
      }
    }
    // Walk the flow field a few steps ahead.
    for (let s = 0; s < 6 && d > 0; s++) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        if (this.flow[cave.map.idx(ni, nj)] === d - 1) {
          ci = ni;
          cj = nj;
          d--;
          break;
        }
      }
    }
    const tx = (ci + 0.5) * CS, tz = (cj + 0.5) * CS;
    this.guides.forEach((g, k) => {
      const ox = Math.sin(this.time * 0.7 + g.ph) * 1.2, oz = Math.cos(this.time * 0.6 + g.ph) * 1.2;
      const want = new THREE.Vector3(tx + ox, cave.floorAt(tx, tz) + 1.6 + Math.sin(this.time * 1.4 + g.ph) * 0.3, tz + oz);
      g.s.position.lerp(want, Math.min(1, dt * 1.2));
      g.s.visible = !!active;
      g.s.material.opacity = 0.75 + Math.sin(this.time * 3 + g.ph) * 0.25;
    });
    if (active && !this.guidesSeen) {
      const gp = this.guides[0].s.position;
      if (Math.hypot(gp.x - player.pos.x, gp.z - player.pos.z) < 18) {
        this.guidesSeen = true;
        this.ctx.hud.message('Little lights hang in the air ahead of you. When you move, they move. Then they wait.', 5);
      }
    }
  }

  updateDrips(dt, player) {
    const D = this.drips;
    for (let k = 0; k < D.n; k++) {
      const o = k * 3;
      if (D.pos[o + 1] < this.cave.floorAt(D.pos[o], D.pos[o + 2]) || D.vel[k] === 0) {
        const x = player.pos.x + this.rng.range(-12, 12), z = player.pos.z + this.rng.range(-12, 12);
        D.pos[o] = x;
        D.pos[o + 1] = this.cave.ceilAt(x, z) - this.rng.range(0, 3);
        D.pos[o + 2] = z;
        D.vel[k] = 0.1;
      }
      D.vel[k] += 9.8 * dt;
      D.pos[o + 1] -= D.vel[k] * dt;
    }
    D.pts.geometry.attributes.position.needsUpdate = true;
    this.nextDrip -= dt;
    if (this.nextDrip <= 0) {
      this.nextDrip = this.rng.range(0.4, 1.8);
      this.ctx.audio.drip(this.rng.range(-1, 1), this.rng.range(0.05, 0.16));
    }
  }

  updateFlood(dt, player) {
    const F = this.flood, { ctx } = this;
    F.t += dt;
    if (F.state === 'calm' && F.t > F.next) {
      F.state = 'rumble';
      F.t = 0;
      F.peak = this.rng.chance(0.4) ? 1.6 : 0.7;
      ctx.audio.crash(this.rng.range(-1, 1), 0.5);
      ctx.hud.message('A deep roar comes up through the rock. Water is pouring in from somewhere. Get to high ground.', 4.5);
    } else if (F.state === 'rumble' && F.t > 4) {
      F.state = 'rise';
      F.t = 0;
    } else if (F.state === 'rise') {
      this.water = WATER + (F.peak - WATER) * smooth(0, 14, F.t);
      if (F.t > 14) {
        F.state = 'hold';
        F.t = 0;
      }
    } else if (F.state === 'hold' && F.t > 15) {
      F.state = 'fall';
      F.t = 0;
    } else if (F.state === 'fall') {
      this.water = F.peak + (WATER - F.peak) * smooth(0, 20, F.t);
      if (F.t > 20) {
        F.state = 'calm';
        F.t = 0;
        F.next = this.rng.range(100, 170);
        this.water = WATER;
        ctx.hud.message('The water drains away into the rock.', 3);
      }
    }
    if (F.state !== 'calm' && this.rng.chance(dt * 2)) ctx.audio.slosh?.(ctx.audio.ctx?.currentTime, 0.06);
    this.waterMesh.position.y = this.water;
    // In the water: slow, and under it, no air.
    const depth = this.water - player.pos.y;
    player.speedMul = depth > 0.4 ? Math.max(0.45, 1 - depth * 0.4) : 1;
    const eye = player.pos.y + player.eye;
    this.under = eye < this.water;
    if (this.under) {
      this.breath = Math.max(0, this.breath - (100 / 25) * dt);
      if (this.breath <= 0) player.damage(14 * dt);
    } else this.breath = Math.min(100, this.breath + 30 * dt);
  }

  updateHazards(dt, player) {
    const { ctx } = this;
    const zone = this.zone;
    // New Movile: poison air. Covering your mouth (C) helps.
    this.gassed = zone === 'movile';
    if (this.gassed) {
      player.damage((player.coveringEars ? 0.5 : 2.2) * dt);
      player.sanity = Math.max(0, player.sanity - 0.4 * dt);
      if (!this.told.gas) {
        this.told.gas = true;
        ctx.hud.message('The air is hot and foul and stings your eyes. Toxic gas. Cover your mouth (C) and get through quickly.', 5);
      }
    }
    // Rottnest Jungle: gravity tilts.
    const G = this.gravity;
    if (zone === 'jungle') {
      G.next -= dt;
      if (G.next <= 0 && G.t <= 0) {
        G.t = 4;
        const a = this.rng.range(0, Math.PI * 2);
        G.dx = Math.cos(a);
        G.dz = Math.sin(a);
        G.next = this.rng.range(25, 45);
        ctx.audio.creak(0, 0.3);
        ctx.hud.message('Your stomach drops. "Down" is suddenly off to one side, and you slide.', 3);
      }
    }
    if (G.t > 0) {
      G.t -= dt;
      const k = Math.sin(Math.min(1, G.t / 4) * Math.PI) * 2.6;
      player.pos.x += G.dx * k * dt;
      player.pos.z += G.dz * k * dt;
      this.col.collide(player.pos, player.radius);
    }
    // Drinking water is everywhere: hint once.
    if (!this.told.drink && player.pos.y < this.water + 0.3 && zone !== 'movile') {
      this.told.drink = true;
      ctx.hud.message('The water tastes sweet: it\'s Almond Water. Press E to drink and fill a bottle.', 4);
    }
  }

  updateExits(dt, player) {
    const { ctx, cave } = this;
    const near = (p, r) => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r;
    const Z = cave.zones;
    if (near(this.door9, 1.3)) {
      this.done = true;
      ctx.award?.('road9');
      ctx.hud.message('At the end of the 9th Road, a door with a 9 painted on it. Behind it, the smell of cut grass.', 4);
      ctx.onEscape('level9', 'door');
      return;
    }
    if (near(this.vent, 2.2)) {
      this.done = true;
      ctx.hud.message('You crawl into the old pipe. It goes up, and up, and comes out in a concrete tunnel full of pipes.', 4);
      ctx.onEscape('level2', 'walk');
      return;
    }
    if (near(Z.spawn, 2.4) && this.time > 4) {
      this.done = true;
      ctx.hud.message('You take a breath and dive back down into the flooded passage.', 3);
      ctx.onEscape('level7', 'noclip');
      return;
    }
    if (near(this.crack, 1.8)) {
      this.crumble += dt;
      if (this.crumble > 0.3 && !this.told.crack) {
        this.told.crack = true;
        ctx.audio.crack?.(0, 0.4);
        ctx.hud.message('The floor creaks and shifts under you. It\'s cracked right through.', 2.5);
      }
      if (this.crumble > 1.8) {
        this.done = true;
        ctx.audio.crash(0, 0.6);
        ctx.hud.message('The floor gives way.', 3);
        ctx.onEscape('level69', 'noclip');
      }
    } else this.crumble = Math.max(0, this.crumble - dt);
  }

  photoSubjects() {
    return this.guides.filter((g) => g.s.visible).map((g) => ({ type: 'lightguide', x: g.s.position.x, y: g.s.position.y, z: g.s.position.z, range: 25 }));
  }

  panTo(player, x, z) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / d;
  }

  drink(player) {
    const { ctx } = this;
    if (player.pos.y < this.water + 0.4 && this.zone !== 'movile') {
      player.sanity = Math.min(100, player.sanity + 25);
      ctx.audio.drink();
      const filled = player.count('water') < 2 && player.give('water');
      ctx.hud.message(filled ? 'You drink from the water, and fill a bottle. Sweet and cold.' : 'You drink from the water. Sweet and cold.', 2.5);
      return;
    }
    if (!player.takeItem('water')) {
      ctx.hud.message('No Almond Water. (Find some water to drink from.)', 2);
      return;
    }
    player.sanity = Math.min(100, player.sanity + 30);
    ctx.audio.drink();
  }

  // ---- Values the game reads every frame ---------------------------------------------

  audioMix(player) {
    let drone = 0.05;
    for (const e of this.entities.list) {
      if (!['chase', 'hunt', 'attack', 'stalk', 'lunge'].includes(e.state)) continue;
      drone = Math.max(drone, 0.25 * Math.max(0, 1 - e.distTo(player) / 25));
    }
    const L = this.cave.zones.lake;
    const dl = Math.hypot(player.pos.x - L.x, player.pos.z - L.z);
    return {
      hum: 0, exitGain: 0, exitPan: 0, drone, machine: 0, jazz: 0,
      wind: this.zone === 'jungle' ? 0.03 : 0.015,
      waves: 0.04 + 0.12 * Math.max(0, 1 - dl / 40) + (this.flood.state === 'rise' ? 0.25 : 0), wavesPan: this.panTo(player, L.x, L.z) * 0.6,
      underwater: this.under,
      sanity: player.sanity, ears: player.coveringEars && !this.gassed,
    };
  }

  atmosphere(dt, player) {
    const insane = 1 - player.sanity / 100;
    const z = this.zone;
    let density = 0.05;
    if (this.under) {
      this.fog.setRGB(0.02, 0.05, 0.06);
      density = 0.25;
    } else if (z === 'movile') {
      this.fog.setRGB(0.16, 0.16, 0.06);
      density = 0.09;
    } else if (z === 'jungle') {
      this.fog.setRGB(0.01, 0.04, 0.04);
      density = 0.035;
    } else if (z === 'lane') {
      this.fog.setRGB(0.01, 0.02, 0.05);
      density = 0.045;
    } else if (z === 'hands') {
      this.fog.setRGB(0.04, 0.01, 0.01);
      density = 0.04;
    } else this.fog.setRGB(0.005, 0.008, 0.01);
    const g = this.gravity.t > 0 ? Math.sin(Math.min(1, this.gravity.t / 4) * Math.PI) : 0;
    return {
      fogColor: this.fog, fogDensity: density,
      warp: insane * insane + (this.gassed ? 0.5 : 0) + (this.under ? 0.4 : 0),
      aberr: 0.25 + insane + (this.gassed ? 0.8 : 0),
      grain: 0.08, soften: 0.15,
      roll: g * 0.3 * (this.gravity.dx >= 0 ? 1 : -1),
    };
  }

  hudInfo(player) {
    let warn = null;
    if (this.under && this.breath < 40) warn = 'OUT OF AIR';
    else if (this.gassed) warn = player.coveringEars ? 'HOLDING YOUR BREATH' : 'TOXIC GAS — COVER YOUR MOUTH';
    else if (this.flood.state === 'rise' || this.flood.state === 'rumble') warn = 'THE WATER IS RISING';
    return {
      warn, warnCovered: warn, coverLabel: this.gassed ? 'MOUTH' : 'EARS', health: true,
      bars: { breath: this.under || this.breath < 99 ? this.breath : null },
    };
  }

  dispose() {
    this.scene.remove(this.group);
    this.entities.dispose();
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) m.dispose();
    disposeTextures(this.own.textures);
  }
}

export const LEVEL8 = {
  id: 'level8',
  number: 8,
  name: 'Level 8',
  title: 'Cave Systems',
  difficulty: 4,
  next: 'level9',
  create: (ctx) => new Level8(ctx),
};
