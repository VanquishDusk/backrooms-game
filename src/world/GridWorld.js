import * as THREE from 'three';
import { EDGE_OPEN, EDGE_WALL, EDGE_EXIT, EDGE_BARS } from './GridMap.js';
import { SURFACE, createWorldMaterial, createGlitchMaterial } from './materials.js';
import { mergeGeometries } from './props.js';

// Turns a GridMap plus fixtures (lights, pillars, pits) into renderable,
// collidable geometry. Reusable by any grid-based level.

const CHUNK = 8; // cells per chunk side
const WALL_T = 0.16; // wall thickness
const PIT_DEPTH = 5;
const ATTIC = 0.75; // height of the exposed joist space above a broken ceiling
const DROP = 0.35; // how far a collapsed floor sits below the carpet

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
  }

  // Corners in perimeter order; winding is fixed up to face `n`.
  quad(a, b, c, d, n, uva, uvb, uvc, uvd) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) this.nor.push(n[0], n[1], n[2]);
    for (const t of [uva, uvb, uvc, uvd]) this.uv.push(t[0], t[1]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) {
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  // Horizontal rectangle at height y.
  flat(x0, z0, x1, z1, y, up) {
    if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
    this.quad(
      [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1],
      [0, up ? 1 : -1, 0],
      [x0, z0], [x1, z0], [x1, z1], [x0, z1],
    );
  }

  // Vertical rectangle facing ±x (at x) spanning z0..z1, y0..y1.
  wallX(x, z0, z1, y0, y1, nx) {
    this.quad(
      [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0],
      [nx, 0, 0],
      [z0, y0], [z1, y0], [z1, y1], [z0, y1],
    );
  }

  // Vertical rectangle facing ±z (at z) spanning x0..x1, y0..y1.
  wallZ(z, x0, x1, y0, y1, nz) {
    this.quad(
      [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z],
      [0, 0, nz],
      [x0, y0], [x1, y0], [x1, y1], [x0, y1],
    );
  }

  box(x0, z0, x1, z1, y0, y1, caps = [true, true, true, true]) {
    this.wallZ(z0, x0, x1, y0, y1, -1);
    this.wallZ(z1, x0, x1, y0, y1, 1);
    if (caps[0]) this.wallX(x0, z0, z1, y0, y1, -1);
    if (caps[1]) this.wallX(x1, z0, z1, y0, y1, 1);
  }

  boxZ(x0, z0, x1, z1, y0, y1, caps = [true, true]) {
    this.wallX(x0, z0, z1, y0, y1, -1);
    this.wallX(x1, z0, z1, y0, y1, 1);
    if (caps[0]) this.wallZ(z0, x0, x1, y0, y1, -1);
    if (caps[1]) this.wallZ(z1, x0, x1, y0, y1, 1);
  }

  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export class GridWorld {
  /**
   * @param {object} opts
   * @param {import('./GridMap.js').GridMap} opts.map
   * @param {Array<{x:number,z:number,color:number[],power:number,state:string,zone?:number}>} opts.lights
   *   (layer: 1 bakes a light into the emergency lightmap instead)
   * @param {Array<{x:number,z:number,size:number,round?:boolean,flare?:boolean,style?:string}>} opts.pillars  world-space centers
   * @param {Array<{x0:number,z0:number,x1:number,z1:number}>} opts.pits  world-space rects
   * @param {Array<{x0:number,z0:number,x1:number,z1:number}>} [opts.extraBoxes]  more solid boxes (props)
   * @param {object} opts.textures  { wall, floor, ceiling, wood?, floors?: {name: tex | {map, scale, surface}}, walls?: {...} }
   * @param {object} [opts.texScale]  per-surface UV scale, number or [u, v]
   * @param {(x:number,y:number)=>string} [opts.floorStyle]  floor material name per cell
   * @param {(e:{h:boolean,x:number,y:number})=>string} [opts.wallStyle]  wall material name per edge
   * @param {number[]} [opts.panelSize]  light fixture [width, length]
   * @param {number} [opts.panelDrop]  how far fixtures hang below the ceiling
   * @param {(x:number,z:number)=>number} [opts.dampAt]  carpet wetness 0..1
   * @param {(x:number,y:number)=>number} [opts.ceilingAt]  ceiling height per cell (default: map height)
   * @param {object} opts.shared  shared uniforms
   */
  constructor(opts) {
    this.map = opts.map;
    this.lights = opts.lights;
    this.pillars = opts.pillars || [];
    this.pits = opts.pits || [];
    this.textures = opts.textures;
    this.shared = opts.shared;
    this.shared.emergency.value = 0;
    this.shared.bend.value = 0;
    for (const d of this.shared.decay.value) d.set(0, 0, 0, 0);
    this.shared.globalLight.value = 1;
    this.group = new THREE.Group();
    this.chunksX = Math.ceil(this.map.cols / CHUNK);
    this.chunksY = Math.ceil(this.map.rows / CHUNK);

    this.floorStyle = opts.floorStyle || (() => 'floor');
    this.wallStyle = opts.wallStyle || (() => 'wall');
    this.extraBoxes = opts.extraBoxes || [];
    this.panelSize = opts.panelSize || [0.62, 1.22];
    this.panelDrop = opts.panelDrop || 0.012;
    this.dampAt = opts.dampAt || (() => 1);
    this.ceilingAt = opts.ceilingAt || null;
    const ts = { wall: 1 / 0.9, floor: 1 / 1.6, ceiling: 1 / 1.2, tile: 1 / 1.2, wood: 1 / 1.5, ...opts.texScale };
    const tx = this.textures;
    this.materials = {
      wall: createWorldMaterial(this.shared, tx.wall, SURFACE.WALL, ts.wall),
      floor: createWorldMaterial(this.shared, tx.floor, SURFACE.FLOOR, ts.floor),
      ceiling: createWorldMaterial(this.shared, tx.ceiling, SURFACE.CEILING, ts.ceiling),
      glitch: createGlitchMaterial(this.shared, tx.wall, ts.wall),
    };
    if (tx.wood) this.materials.wood = createWorldMaterial(this.shared, tx.wood, SURFACE.PLAIN, ts.wood);
    // Extra named floor and wall materials.
    const extra = (list, surface, defScale) => {
      for (const [name, v] of Object.entries(list || {})) {
        const def = v.isTexture ? { map: v } : v;
        this.materials[name] = createWorldMaterial(this.shared, def.map, def.surface ?? surface, def.scale ?? ts[name] ?? defScale);
      }
    };
    extra(tx.floors, SURFACE.PLAIN, ts.floor);
    extra(tx.walls, SURFACE.WALL, ts.wall);
    // Per-cell destruction: bit 1 = ceiling gone, bit 2 = floor gone.
    this.broken = new Uint8Array(this.map.cols * this.map.rows);
    this.floorMeshes = [];
    this.dirtyChunks = new Set();
    this.dirtyWalls = new Set();
    this.collisionDirty = false;

    this.pitCells = new Map();
    for (const p of this.pits) {
      const [cx, cy] = this.map.cellAt((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
      this.pitCells.set(this.map.idx(cx, cy), p);
    }

    this.wallMeshes = [];
    this.buildPillars();
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        this.rebuildFloorChunk(cx, cy);
        this.rebuildWallChunk(cx, cy);
      }
    }
    this.rebuildCollision();
    this.buildPanels();
    this.bakeLightmap();
  }

  chunkOf(x, y) {
    return [
      Math.min(this.chunksX - 1, Math.floor(x / CHUNK)),
      Math.min(this.chunksY - 1, Math.floor(y / CHUNK)),
    ];
  }

  // Floors and ceilings of a chunk; rebuilt when cells are destroyed.
  rebuildFloorChunk(cx, cy) {
    const key = cy * this.chunksX + cx;
    for (const m of this.floorMeshes[key] || []) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    const { map } = this;
    const cs = map.cellSize, H = map.height;
    const geos = { floor: new GeoBuilder(), ceiling: new GeoBuilder(), wood: new GeoBuilder() };
    const geoFor = (name) => geos[name] || (geos[name] = new GeoBuilder());
    const broken = (x, y, bit) => map.inBounds(x, y) && (this.broken[map.idx(x, y)] & bit) !== 0;
    for (let y = cy * CHUNK; y < Math.min(map.rows, (cy + 1) * CHUNK); y++) {
      for (let x = cx * CHUNK; x < Math.min(map.cols, (cx + 1) * CHUNK); x++) {
        const x0 = x * cs, z0 = y * cs, x1 = x0 + cs, z1 = z0 + cs;
        const state = this.broken[map.idx(x, y)];

        if (state & 1) {
          // Ceiling gone: the unfinished house's joists and roof deck.
          const top = H + ATTIC;
          const wood = geos.wood;
          wood.flat(x0, z0, x1, z1, top, false);
          if (!broken(x - 1, y, 1)) wood.wallX(x0, z0, z1, H, top, 1);
          if (!broken(x + 1, y, 1)) wood.wallX(x1, z0, z1, H, top, -1);
          if (!broken(x, y - 1, 1)) wood.wallZ(z0, x0, x1, H, top, 1);
          if (!broken(x, y + 1, 1)) wood.wallZ(z1, x0, x1, H, top, -1);
          for (let k = 1; k < 5; k++) {
            const zc = z0 + k * (cs / 5);
            wood.box(x0, zc - 0.04, x1, zc + 0.04, top - 0.3, top, [false, false]);
            wood.flat(x0, zc - 0.04, x1, zc + 0.04, top - 0.3, false);
          }
        } else if (this.ceilingAt) {
          // Ceilings at different heights, with a face where a high ceiling
          // meets a lower one across an opening.
          const ch = this.ceilingAt(x, y);
          geos.ceiling.flat(x0, z0, x1, z1, ch, false);
          const step = geoFor('wall');
          for (let d = 0; d < 4; d++) {
            const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (!map.inBounds(nx, ny) || map.getEdge(map.edge(x, y, d)) === EDGE_WALL) continue;
            const nh = this.ceilingAt(nx, ny);
            if (nh >= ch - 0.01) continue;
            if (d === 0) step.wallX(x1, z0, z1, nh, ch, -1);
            else if (d === 1) step.wallX(x0, z0, z1, nh, ch, 1);
            else if (d === 2) step.wallZ(z1, x0, x1, nh, ch, -1);
            else step.wallZ(z0, x0, x1, nh, ch, 1);
          }
        } else {
          geos.ceiling.flat(x0, z0, x1, z1, H, false);
        }

        if (state & 2) {
          // Floor gone: bare subfloor a step lower.
          const wood = geos.wood;
          wood.flat(x0, z0, x1, z1, -DROP, true);
          if (!broken(x - 1, y, 2)) wood.wallX(x0, z0, z1, -DROP, 0, 1);
          if (!broken(x + 1, y, 2)) wood.wallX(x1, z0, z1, -DROP, 0, -1);
          if (!broken(x, y - 1, 2)) wood.wallZ(z0, x0, x1, -DROP, 0, 1);
          if (!broken(x, y + 1, 2)) wood.wallZ(z1, x0, x1, -DROP, 0, -1);
          continue;
        }
        const style = this.floorStyle(x, y);
        const floor = this.materials[style] ? geoFor(style) : geos.floor;
        const pit = this.pitCells.get(map.idx(x, y));
        if (!pit) {
          floor.flat(x0, z0, x1, z1, 0, true);
          continue;
        }
        floor.flat(x0, z0, pit.x0, z1, 0, true);
        floor.flat(pit.x1, z0, x1, z1, 0, true);
        floor.flat(pit.x0, z0, pit.x1, pit.z0, 0, true);
        floor.flat(pit.x0, pit.z1, pit.x1, z1, 0, true);
        floor.wallX(pit.x0, pit.z0, pit.z1, -PIT_DEPTH, 0, 1);
        floor.wallX(pit.x1, pit.z0, pit.z1, -PIT_DEPTH, 0, -1);
        floor.wallZ(pit.z0, pit.x0, pit.x1, -PIT_DEPTH, 0, 1);
        floor.wallZ(pit.z1, pit.x0, pit.x1, -PIT_DEPTH, 0, -1);
        floor.flat(pit.x0, pit.z0, pit.x1, pit.z1, -PIT_DEPTH, true);
      }
    }
    const meshes = [];
    for (const [name, geo] of Object.entries(geos)) {
      const g = geo.build();
      if (!g) continue;
      const mesh = new THREE.Mesh(g, this.materials[name] || this.materials.floor);
      this.group.add(mesh);
      meshes.push(mesh);
    }
    this.floorMeshes[key] = meshes;
  }

  // Pillars never change; they stay out of wall rebuilds.
  buildPillars() {
    const H = this.map.height;
    const square = {};
    const round = {};
    this.roundGeos = [];
    for (const p of this.pillars) {
      const style = p.style && this.materials[p.style] ? p.style : 'wall';
      if (!p.round) {
        const h = p.size / 2;
        (square[style] ||= new GeoBuilder()).box(p.x - h, p.z - h, p.x + h, p.z + h, 0, H);
        continue;
      }
      // Round column; optionally flaring out into the ceiling like a vault.
      const r = p.size / 2;
      const shaftH = p.flare ? H - 1.1 : H;
      const shaft = new THREE.CylinderGeometry(r, r * 1.05, shaftH, 16, 1, true);
      scaleUv(shaft, Math.PI * p.size, shaftH);
      shaft.translate(p.x, shaftH / 2, p.z);
      (round[style] ||= []).push(shaft);
      if (p.flare) {
        const cap = new THREE.CylinderGeometry(r * 3.2, r, 1.1, 16, 3, true);
        // Curve the flare so it reads as a vault springing from the column.
        const pos = cap.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i) + 0.55, k = y / 1.1;
          const len = Math.hypot(pos.getX(i), pos.getZ(i));
          const target = r + (r * 3.2 - r) * k * k;
          if (len > 1e-4) {
            pos.setX(i, (pos.getX(i) / len) * target);
            pos.setZ(i, (pos.getZ(i) / len) * target);
          }
        }
        cap.computeVertexNormals();
        scaleUv(cap, Math.PI * p.size * 2, 1.1);
        cap.translate(p.x, shaftH + 0.55, p.z);
        round[style].push(cap);
      }
    }
    for (const [style, geo] of Object.entries(square)) {
      const g = geo.build();
      if (g) this.group.add(new THREE.Mesh(g, this.materials[style]));
    }
    for (const [style, list] of Object.entries(round)) {
      const g = mergeGeometries(list);
      for (const piece of list) piece.dispose();
      this.roundGeos.push(g);
      this.group.add(new THREE.Mesh(g, this.materials[style]));
    }
  }

  // ---- Destruction (batched; call flush() once per frame) ---------------

  breakCell(x, y, bits) {
    const i = this.map.idx(x, y);
    if ((this.broken[i] & bits) === bits) return;
    this.broken[i] |= bits;
    // Neighbouring chunks may need their edge skirts updated.
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!this.map.inBounds(x + dx, y + dy)) continue;
      const [cx, cy] = this.chunkOf(x + dx, y + dy);
      this.dirtyChunks.add(cy * this.chunksX + cx);
    }
  }

  removeWall(e) {
    if (this.map.getEdge(e) !== EDGE_WALL) return;
    this.map.setEdge(e, EDGE_OPEN);
    const [cx, cy] = this.chunkOf(Math.min(e.x, this.map.cols - 1), Math.min(e.y, this.map.rows - 1));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < this.chunksX && ny < this.chunksY) this.dirtyWalls.add(ny * this.chunksX + nx);
      }
    }
    this.collisionDirty = true;
  }

  flush() {
    for (const k of this.dirtyChunks) this.rebuildFloorChunk(k % this.chunksX, Math.floor(k / this.chunksX));
    for (const k of this.dirtyWalls) this.rebuildWallChunk(k % this.chunksX, Math.floor(k / this.chunksX));
    this.dirtyChunks.clear();
    this.dirtyWalls.clear();
    if (this.collisionDirty) {
      this.rebuildCollision();
      this.collisionDirty = false;
    }
  }

  // Floor height under a point.
  groundAt(x, z) {
    const [cx, cy] = this.map.cellAt(x, z);
    return this.broken[this.map.idx(cx, cy)] & 2 ? -DROP : 0;
  }

  // Walls of a chunk, rebuilt when the maze shifts.
  rebuildWallChunk(cx, cy) {
    const key = cy * this.chunksX + cx;
    for (const m of this.wallMeshes[key] || []) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    const { map } = this;
    const cs = map.cellSize, H = map.height, t = WALL_T / 2;
    const geos = {};
    const geoFor = (e) => {
      const s = this.wallStyle(e);
      const name = this.materials[s] ? s : 'wall';
      return geos[name] || (geos[name] = new GeoBuilder());
    };
    const sameStyle = (a, b) => this.wallStyle(a) === this.wallStyle(b);
    const xs = cx * CHUNK, xe = Math.min(map.cols, (cx + 1) * CHUNK);
    const ys = cy * CHUNK, ye = Math.min(map.rows, (cy + 1) * CHUNK);

    // Horizontal edges owned by this chunk: y in [ys, ye) plus the last row on the bottom chunk.
    const yEnd = cy === this.chunksY - 1 ? map.rows + 1 : ye;
    for (let y = ys; y < yEnd; y++) {
      let x = xs;
      while (x < xe) {
        if (map.getH(x, y) !== EDGE_WALL) { x++; continue; }
        const start = x;
        const first = { h: true, x, y };
        while (x < xe && map.getH(x, y) === EDGE_WALL && sameStyle(first, { h: true, x, y })) x++;
        const geo = geoFor(first);
        const capStart = start === 0 || map.getH(start - 1, y) !== EDGE_WALL;
        const capEnd = x >= map.cols || map.getH(x, y) !== EDGE_WALL;
        const z = y * cs;
        geo.box(start * cs - (capStart ? t : 0), z - t, x * cs + (capEnd ? t : 0), z + t, 0, H, [capStart, capEnd]);
      }
    }
    const xEnd = cx === this.chunksX - 1 ? map.cols + 1 : xe;
    for (let x = xs; x < xEnd; x++) {
      let y = ys;
      while (y < ye) {
        if (map.getV(x, y) !== EDGE_WALL) { y++; continue; }
        const start = y;
        const first = { h: false, x, y };
        while (y < ye && map.getV(x, y) === EDGE_WALL && sameStyle(first, { h: false, x, y })) y++;
        const geo = geoFor(first);
        const capStart = start === 0 || map.getV(x, start - 1) !== EDGE_WALL;
        const capEnd = y >= map.rows || map.getV(x, y) !== EDGE_WALL;
        const wx = x * cs;
        geo.boxZ(wx - t, start * cs - (capStart ? t : 0), wx + t, y * cs + (capEnd ? t : 0), 0, H, [capStart, capEnd]);
      }
    }
    const meshes = [];
    for (const [name, geo] of Object.entries(geos)) {
      const g = geo.build();
      if (!g) continue;
      const mesh = new THREE.Mesh(g, this.materials[name]);
      this.group.add(mesh);
      meshes.push(mesh);
    }
    this.wallMeshes[key] = meshes;
  }

  // Chunks that hold geometry for an edge (an edge on a chunk border is
  // owned by one chunk but may cap a run in its neighbour).
  rebuildAroundEdge(e) {
    const [cx, cy] = this.chunkOf(Math.min(e.x, this.map.cols - 1), Math.min(e.y, this.map.rows - 1));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < this.chunksX && ny < this.chunksY) this.rebuildWallChunk(nx, ny);
      }
    }
  }

  // ---- Exit wall -------------------------------------------------------

  // `material` defaults to the flickering-wall glitch shader.
  setExit(e, material = this.materials.glitch) {
    this.map.setEdge(e, EDGE_EXIT);
    const cs = this.map.cellSize, H = this.map.height;
    const geo = new GeoBuilder();
    // Slightly thicker than normal walls so it overlaps neighbours cleanly.
    const t = WALL_T / 2 + 0.01;
    if (e.h) {
      const z = e.y * cs;
      geo.box(e.x * cs, z - t, (e.x + 1) * cs, z + t, 0, H);
      this.exit = { x0: e.x * cs, x1: (e.x + 1) * cs, z0: z, z1: z, h: true, cx: (e.x + 0.5) * cs, cz: z };
    } else {
      const x = e.x * cs;
      geo.boxZ(x - t, e.y * cs, x + t, (e.y + 1) * cs, 0, H);
      this.exit = { x0: x, x1: x, z0: e.y * cs, z1: (e.y + 1) * cs, h: false, cx: x, cz: (e.y + 0.5) * cs };
    }
    this.exit.edge = e;
    this.exitMesh = new THREE.Mesh(geo.build(), material);
    this.group.add(this.exitMesh);
    this.rebuildAroundEdge(e);
    this.rebuildCollision();
  }

  // Distance from a point to the exit wall's centre line.
  distanceToExit(px, pz) {
    if (!this.exit) return Infinity;
    const ex = this.exit;
    const cx = Math.max(ex.x0, Math.min(ex.x1, px));
    const cz = Math.max(ex.z0, Math.min(ex.z1, pz));
    return Math.hypot(px - cx, pz - cz);
  }

  // ---- Collision -------------------------------------------------------

  rebuildCollision() {
    const { map } = this;
    const cs = map.cellSize, t = WALL_T / 2;
    const boxes = [];
    for (let y = 0; y <= map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const v = map.getH(x, y);
        if (v === EDGE_WALL) boxes.push(x * cs - t, y * cs - t, (x + 1) * cs + t, y * cs + t);
        else if (v === EDGE_BARS) boxes.push(x * cs, y * cs - 0.05, (x + 1) * cs, y * cs + 0.05);
      }
    }
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x <= map.cols; x++) {
        const v = map.getV(x, y);
        if (v === EDGE_WALL) boxes.push(x * cs - t, y * cs - t, x * cs + t, (y + 1) * cs + t);
        else if (v === EDGE_BARS) boxes.push(x * cs - 0.05, y * cs, x * cs + 0.05, (y + 1) * cs);
      }
    }
    for (const p of this.pillars) {
      const h = p.size / 2;
      boxes.push(p.x - h, p.z - h, p.x + h, p.z + h);
    }
    for (const b of this.extraBoxes) boxes.push(b.x0, b.z0, b.x1, b.z1);
    this.boxes = new Float32Array(boxes);
    // Bucket boxes into every cell they touch.
    this.buckets = Array.from({ length: map.cols * map.rows }, () => []);
    for (let i = 0; i < this.boxes.length; i += 4) {
      const [ax, ay] = map.cellAt(this.boxes[i], this.boxes[i + 1]);
      const [bx, by] = map.cellAt(this.boxes[i + 2], this.boxes[i + 3]);
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) this.buckets[map.idx(x, y)].push(i);
    }
  }

  // Pushes a circle (pos.x, pos.z, radius r) out of walls. Mutates pos.
  collide(pos, r) {
    const { map } = this;
    const [ax, ay] = map.cellAt(pos.x - r, pos.z - r);
    const [bx, by] = map.cellAt(pos.x + r, pos.z + r);
    const B = this.boxes;
    for (let iter = 0; iter < 2; iter++) {
      for (let y = ay; y <= by; y++) {
        for (let x = ax; x <= bx; x++) {
          for (const i of this.buckets[map.idx(x, y)]) {
            const cx = Math.max(B[i], Math.min(B[i + 2], pos.x));
            const cz = Math.max(B[i + 1], Math.min(B[i + 3], pos.z));
            const dx = pos.x - cx, dz = pos.z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              pos.x += (dx / d) * (r - d);
              pos.z += (dz / d) * (r - d);
            } else {
              // Centre is inside the box: leave along the shallowest axis.
              const pen = [pos.x - B[i] + r, B[i + 2] - pos.x + r, pos.z - B[i + 1] + r, B[i + 3] - pos.z + r];
              const m = Math.min(...pen);
              if (m === pen[0]) pos.x -= pen[0];
              else if (m === pen[1]) pos.x += pen[1];
              else if (m === pen[2]) pos.z -= pen[2];
              else pos.z += pen[3];
            }
          }
        }
      }
    }
    pos.x = Math.max(r, Math.min(map.width - r, pos.x));
    pos.z = Math.max(r, Math.min(map.depth - r, pos.z));
  }

  pitAt(x, z, margin = 0) {
    const [cx, cy] = this.map.cellAt(x, z);
    const p = this.pitCells.get(this.map.idx(cx, cy));
    if (!p) return null;
    return x > p.x0 + margin && x < p.x1 - margin && z > p.z0 + margin && z < p.z1 - margin ? p : null;
  }

  // ---- Lights ----------------------------------------------------------

  buildPanels() {
    const H = this.map.height;
    const geo = new THREE.PlaneGeometry(this.panelSize[0], this.panelSize[1]);
    geo.rotateX(Math.PI / 2); // face down
    this.panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, this.panelMat, this.lights.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    this.lights.forEach((l, i) => {
      m.makeTranslation(l.x, H - this.panelDrop, l.z);
      if (l.rotate) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      // Layer-1 (emergency) lights have their own fixtures; hide the panel.
      if (l.layer === 1 || l.hide) m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setRGB(...this.panelColor(l, 1)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    this.panels = mesh;
    this.group.add(mesh);

    // Spatial lookup for nearby lights (flicker updates).
    this.lightCells = Array.from({ length: this.map.cols * this.map.rows }, () => []);
    this.lights.forEach((l, i) => {
      const [x, y] = this.map.cellAt(l.x, l.z);
      this.lightCells[this.map.idx(x, y)].push(i);
    });
  }

  panelColor(l, level) {
    if (l.state === 'off') return [0.32, 0.31, 0.27];
    const tint = l.panelTint || [1, 0.98, 0.9];
    const v = 0.32 + 0.68 * level;
    return [tint[0] * v, tint[1] * v, tint[2] * v];
  }

  setPanelLevel(i, level) {
    const c = this.panelColor(this.lights[i], level);
    this.panels.setColorAt(i, new THREE.Color(c[0], c[1], c[2]));
    this.panels.instanceColor.needsUpdate = true;
  }

  // Lights whose fixture lies within `radius` of a point.
  lightsNear(x, z, radius) {
    const { map } = this;
    const out = [];
    const [ax, ay] = map.cellAt(x - radius, z - radius);
    const [bx, by] = map.cellAt(x + radius, z + radius);
    for (let y = ay; y <= by; y++) {
      for (let cx = ax; cx <= bx; cx++) {
        for (const i of this.lightCells[map.idx(cx, y)]) {
          const l = this.lights[i];
          const d = Math.hypot(l.x - x, l.z - z);
          if (d <= radius) out.push([i, d]);
        }
      }
    }
    return out;
  }

  // Bakes static lights into a floor-plan lightmap with soft wall
  // occlusion. Flickering lights are left out and rendered dynamically.
  bakeLightmap(region) {
    const { map } = this;
    const texel = 0.5;
    if (!this.lm) {
      const w = Math.ceil(map.width / texel), h = Math.ceil(map.depth / texel);
      this.lm = { w, h, texel, data: new Uint8Array(w * h * 4) };
      const makeTex = (data) => {
        const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        return tex;
      };
      this.lightTex = makeTex(this.lm.data);
      this.shared.lightMap.value = this.lightTex;
      // Second layer for lights that switch as a group (emergency lighting).
      this.hasLayer2 = this.lights.some((l) => l.layer === 1);
      if (this.hasLayer2) {
        this.lm.data2 = new Uint8Array(w * h * 4);
        this.lightTex2 = makeTex(this.lm.data2);
        this.shared.lightMap2.value = this.lightTex2;
      } else {
        this.shared.lightMap2.value = blackTexture();
      }
      this.shared.lmScale.value.set(1 / (w * texel), 1 / (h * texel));
    }
    const { w, h, data, data2 } = this.lm;
    const R = 9.5;
    const tx0 = region ? Math.max(0, Math.floor(region.x0 / texel)) : 0;
    const tx1 = region ? Math.min(w - 1, Math.ceil(region.x1 / texel)) : w - 1;
    const tz0 = region ? Math.max(0, Math.floor(region.z0 / texel)) : 0;
    const tz1 = region ? Math.min(h - 1, Math.ceil(region.z1 / texel)) : h - 1;
    for (let tz = tz0; tz <= tz1; tz++) {
      const pz = (tz + 0.5) * texel;
      for (let tx = tx0; tx <= tx1; tx++) {
        const px = (tx + 0.5) * texel;
        let r = 0, g = 0, b = 0, r2 = 0, g2 = 0, b2 = 0;
        const list = this.lightsNear(px, pz, R);
        for (const [i, d] of list) {
          const l = this.lights[i];
          if (l.state !== 'on') continue;
          if (l.layer === 1) {
            const walls = map.wallsBetween(px, pz, l.x, l.z, 2);
            const k = walls ? 0 : l.power * (1 / (1 + 0.3 * (d * d + 1))) * (1 - smoothstep(4, 7, d));
            r2 += k * l.color[0];
            g2 += k * l.color[1];
            b2 += k * l.color[2];
            continue;
          }
          const walls = map.wallsBetween(px, pz, l.x, l.z, 3);
          const trans = walls === 0 ? 1 : walls === 1 ? 0.1 : 0.015;
          const d2 = d * d + 2.0;
          const fall = (1 / (1 + 0.15 * d2)) * (1 - smoothstep(6, R, d));
          const k = l.power * fall * trans;
          r += k * l.color[0];
          g += k * l.color[1];
          b += k * l.color[2];
        }
        const o = (tz * w + tx) * 4;
        data[o] = 255 * (1 - Math.exp(-r * 0.95));
        data[o + 1] = 255 * (1 - Math.exp(-g * 0.95));
        data[o + 2] = 255 * (1 - Math.exp(-b * 0.95));
        data[o + 3] = 255 * Math.max(0, Math.min(1, this.dampAt(px, pz)));
        if (data2) {
          data2[o] = 255 * (1 - Math.exp(-r2));
          data2[o + 1] = 255 * (1 - Math.exp(-g2));
          data2[o + 2] = 255 * (1 - Math.exp(-b2));
          data2[o + 3] = 255;
        }
      }
    }
    this.lightTex.needsUpdate = true;
    if (this.lightTex2) this.lightTex2.needsUpdate = true;
  }

  // Baked light (0..1 per channel) at a world point.
  sampleLight(x, z) {
    const { w, h, texel, data } = this.lm;
    const tx = Math.min(w - 1, Math.max(0, Math.floor(x / texel)));
    const tz = Math.min(h - 1, Math.max(0, Math.floor(z / texel)));
    const o = (tz * w + tx) * 4;
    return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
    this.panelMat.dispose();
    this.lightTex.dispose();
    if (this.lightTex2) this.lightTex2.dispose();
    for (const g of this.roundGeos) g.dispose();
  }
}

// Scale a geometry's 0..1 UVs to metres so world textures tile correctly.
function scaleUv(geo, u, v) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
}

let black = null;
function blackTexture() {
  if (!black) {
    black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    black.needsUpdate = true;
  }
  return black;
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
