// Logical layout for grid-based levels. Cells are square; walls live on the
// edges between cells. Most Backrooms levels (offices, halls, corridors) map
// onto this, so future levels can reuse it with their own generators.
//
// Edge values: 0 = open, 1 = wall, 2 = exit wall (blocks sight and paths,
// but the player can noclip through it).

export const EDGE_OPEN = 0;
export const EDGE_WALL = 1;
export const EDGE_EXIT = 2;

// Directions: 0 = +x, 1 = -x, 2 = +y (+z in world), 3 = -y.
export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class GridMap {
  constructor(cols, rows, cellSize, height) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.height = height;
    // Horizontal edges run along x at z = y * cellSize; x in [0, cols), y in [0, rows].
    this.wallsH = new Uint8Array(cols * (rows + 1));
    // Vertical edges run along z at x = x * cellSize; x in [0, cols], y in [0, rows).
    this.wallsV = new Uint8Array((cols + 1) * rows);
  }

  get width() {
    return this.cols * this.cellSize;
  }

  get depth() {
    return this.rows * this.cellSize;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  idx(x, y) {
    return y * this.cols + x;
  }

  getH(x, y) {
    return this.wallsH[y * this.cols + x];
  }

  setH(x, y, v) {
    if (x >= 0 && x < this.cols && y >= 0 && y <= this.rows) this.wallsH[y * this.cols + x] = v;
  }

  getV(x, y) {
    return this.wallsV[y * (this.cols + 1) + x];
  }

  setV(x, y, v) {
    if (x >= 0 && x <= this.cols && y >= 0 && y < this.rows) this.wallsV[y * (this.cols + 1) + x] = v;
  }

  // Edge on a given side of a cell, as { h, x, y } so it can be read/written.
  edge(x, y, dir) {
    switch (dir) {
      case 0: return { h: false, x: x + 1, y };
      case 1: return { h: false, x, y };
      case 2: return { h: true, x, y: y + 1 };
      default: return { h: true, x, y };
    }
  }

  getEdge(e) {
    return e.h ? this.getH(e.x, e.y) : this.getV(e.x, e.y);
  }

  setEdge(e, v) {
    if (e.h) this.setH(e.x, e.y, v);
    else this.setV(e.x, e.y, v);
  }

  isBoundaryEdge(e) {
    return e.h ? e.y === 0 || e.y === this.rows : e.x === 0 || e.x === this.cols;
  }

  canMove(x, y, dir) {
    const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
    if (!this.inBounds(nx, ny)) return false;
    return this.getEdge(this.edge(x, y, dir)) === EDGE_OPEN;
  }

  addBoundary() {
    for (let x = 0; x < this.cols; x++) {
      this.setH(x, 0, EDGE_WALL);
      this.setH(x, this.rows, EDGE_WALL);
    }
    for (let y = 0; y < this.rows; y++) {
      this.setV(0, y, EDGE_WALL);
      this.setV(this.cols, y, EDGE_WALL);
    }
  }

  // Breadth-first distances (in cells) from a start cell; -1 = unreachable.
  bfs(sx, sy, out) {
    const n = this.cols * this.rows;
    const dist = out || new Int32Array(n);
    dist.fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    dist[this.idx(sx, sy)] = 0;
    queue[tail++] = this.idx(sx, sy);
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % this.cols, cy = (cur / this.cols) | 0;
      for (let d = 0; d < 4; d++) {
        if (!this.canMove(cx, cy, d)) continue;
        const ni = this.idx(cx + DIRS[d][0], cy + DIRS[d][1]);
        if (dist[ni] !== -1) continue;
        dist[ni] = dist[cur] + 1;
        queue[tail++] = ni;
      }
    }
    return dist;
  }

  // Knock out walls between disconnected regions until every cell is
  // reachable (Kruskal-style union of components over random wall edges).
  connectAll(rng, keep = () => false) {
    const n = this.cols * this.rows;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const union = (a, b) => {
      const ra = find(a), rb = find(b);
      if (ra === rb) return false;
      parent[ra] = rb;
      return true;
    };
    const walls = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = this.idx(x, y);
        if (x + 1 < this.cols) {
          if (this.canMove(x, y, 0)) union(i, i + 1);
          else walls.push([x, y, 0]);
        }
        if (y + 1 < this.rows) {
          if (this.canMove(x, y, 2)) union(i, i + this.cols);
          else walls.push([x, y, 2]);
        }
      }
    }
    rng.shuffle(walls);
    for (const [x, y, d] of walls) {
      const e = this.edge(x, y, d);
      if (keep(e)) continue;
      const a = this.idx(x, y), b = this.idx(x + DIRS[d][0], y + DIRS[d][1]);
      if (union(a, b)) this.setEdge(e, EDGE_OPEN);
    }
  }

  // Number of walls a straight line crosses between two world points
  // (2D, x/z). Stops counting at `limit`.
  wallsBetween(ax, az, bx, bz, limit = 99) {
    const cs = this.cellSize;
    let cx = Math.floor(ax / cs), cy = Math.floor(az / cs);
    const tx = Math.floor(bx / cs), ty = Math.floor(bz / cs);
    const dx = bx - ax, dz = bz - az;
    const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tDeltaY = dz !== 0 ? Math.abs(cs / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((stepX > 0 ? (cx + 1) * cs - ax : ax - cx * cs) / Math.abs(dx)) : Infinity;
    let tMaxY = dz !== 0 ? ((stepY > 0 ? (cy + 1) * cs - az : az - cy * cs) / Math.abs(dz)) : Infinity;
    let count = 0;
    let guard = 0;
    while ((cx !== tx || cy !== ty) && guard++ < 512) {
      if (tMaxX < tMaxY) {
        if (tMaxX > 1) break;
        const ex = stepX > 0 ? cx + 1 : cx;
        if (ex >= 0 && ex <= this.cols && cy >= 0 && cy < this.rows && this.getV(ex, cy)) count++;
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        if (tMaxY > 1) break;
        const ey = stepY > 0 ? cy + 1 : cy;
        if (cx >= 0 && cx < this.cols && ey >= 0 && ey <= this.rows && this.getH(cx, ey)) count++;
        cy += stepY;
        tMaxY += tDeltaY;
      }
      if (count >= limit) break;
    }
    return count;
  }

  hasLineOfSight(ax, az, bx, bz) {
    return this.wallsBetween(ax, az, bx, bz, 1) === 0;
  }

  cellCenter(x, y) {
    return [(x + 0.5) * this.cellSize, (y + 0.5) * this.cellSize];
  }

  cellAt(wx, wz) {
    const x = Math.min(this.cols - 1, Math.max(0, Math.floor(wx / this.cellSize)));
    const y = Math.min(this.rows - 1, Math.max(0, Math.floor(wz / this.cellSize)));
    return [x, y];
  }
}
