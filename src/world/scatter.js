// Scatter items for the backpack across a level: reachable spots between
// `min` and `max` metres (walking) from a start cell, one item per spot.
export function scatterItems(ctx, world, rng, ids, start, { min = 15, max = 90, ok = () => true } = {}) {
  if (!ctx.placeItem) return;
  const map = world.map;
  const dist = map.bfs(start[0], start[1]);
  const cells = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 0 || !ok(i)) continue;
    const d = dist[i] * map.cellSize;
    if (d >= min && d <= max) cells.push(i);
  }
  rng.shuffle(cells);
  ids.forEach((id, k) => {
    const i = cells[k];
    if (i == null) return;
    const [cx, cz] = map.cellCenter(i % map.cols, (i / map.cols) | 0);
    const p = { x: cx + rng.range(-0.5, 0.5), z: cz + rng.range(-0.5, 0.5) };
    world.collide(p, 0.3);
    ctx.placeItem(id, p.x, p.z);
  });
}
