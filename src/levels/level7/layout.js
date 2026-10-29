import { createNoise2D } from '../../core/rng.js';

// Level 7's world, as plain numbers: where everything is and how deep the
// sea is at any point. The surface is y = 0 and the concrete ceiling is
// CEILING metres above it. The entrance room sits inside a huge concrete
// pillar at the origin, its doorway facing -z, high above the water.

export const CEILING = 46;
export const ROOM_Y = 14;
// Depth zones, by how far below the surface you are.
export const ZONES = [
  { name: 'THE DAYLIGHT ZONE', top: 0 },
  { name: 'THE TWILIGHT ZONE', top: -15 },
  { name: 'THE MIDNIGHT ZONE', top: -38 },
  { name: 'THE ABYSS', top: -75 },
];
export const WEST_EDGE = -560;

export function zoneAt(y) {
  let z = 0;
  for (let i = 0; i < ZONES.length; i++) if (y < ZONES[i].top) z = i;
  return z;
}

// Swells on the surface. The water shader uses the same sums.
export const WAVES = [
  [0.22, 0.11, 0.0, 0.7],
  [0.15, 0.054, 0.104, -0.9],
  [0.06, 0.37, 0.37, 1.7],
];
export function waveHeight(x, z, t) {
  let h = 0;
  for (const [a, kx, kz, w] of WAVES) h += a * Math.sin(kx * x + kz * z + w * t);
  return h;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function generateLevel7(rng) {
  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  // Keep everything away from the far west, where the sea just goes on.
  const angle = () => rng.range(-Math.PI * 0.7, Math.PI * 0.7);
  const a9 = angle();
  const door = polar(a9, rng.range(140, 175));
  const aM = a9 + (rng.chance(0.5) ? 1 : -1) * rng.range(1.7, 2.3);
  const mountain = polar(aM, rng.range(310, 340));
  const aA = a9 - Math.sign(aM - a9) * rng.range(1.6, 2.2);
  const abyss = polar(aA, rng.range(250, 290));
  let fort = null;
  for (let tries = 0; tries < 40 && !fort; tries++) {
    const p = polar(rng.range(0, Math.PI * 2), rng.range(105, 150));
    const far = (q, d) => Math.hypot(p[0] - q[0], p[1] - q[1]) > d;
    if (far(door, 90) && far([0, -30], 70) && far(abyss, 120) && far(mountain, 210)) fort = p;
  }
  fort = fort || polar(a9 + Math.PI, 130);
  // The cave mouth: at the mountain's foot, round the side, out in the deep.
  const toM = Math.atan2(-mountain[1], -mountain[0]) + (rng.chance(0.5) ? 1 : -1) * Math.PI * 0.5;
  const cave = [mountain[0] + Math.cos(toM) * 126, mountain[1] + Math.sin(toM) * 126];

  // Pillars from the sea floor up into the ceiling.
  const pillars = [];
  for (let tries = 0; tries < 200 && pillars.length < 9; tries++) {
    const p = polar(rng.range(0, Math.PI * 2), rng.range(70, 520));
    const ok = [door, fort, abyss, [0, 0], cave].every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 60) && Math.hypot(p[0] - mountain[0], p[1] - mountain[1]) > 190 && pillars.every((q) => Math.hypot(p[0] - q.x, p[1] - q.z) > 90);
    if (ok) pillars.push({ x: p[0], z: p[1], w: rng.range(9, 16), d: rng.range(9, 16), rot: rng.range(0, Math.PI) });
  }
  // Huge pipes around the Level 9 platform, rising into the ceiling.
  const pipes = [];
  for (let k = 0; k < 4; k++) {
    const a = a9 + (k / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(17, 24);
    pipes.push({ x: door[0] + Math.cos(a) * r, z: door[1] + Math.sin(a) * r, r: rng.range(1.4, 2.1) });
  }

  const noise = createNoise2D(rng.fork('floor'));
  const fbm = (x, z) => noise(x / 90, z / 90) * 0.6 + noise(x / 30 + 7, z / 30) * 0.3 + noise(x / 11, z / 11 + 3) * 0.1;

  // The sea floor (or land, where it rises out of the water).
  function floorY(x, z) {
    const r = Math.hypot(x, z);
    let y = -14 - smooth(55, 200, r) * 16 - smooth(200, 330, r) * 26 - smooth(620, 900, r) * 80;
    y += (fbm(x, z) - 0.5) * (r < 60 ? 3 : 7);
    // The mountain: rises out of the midnight zone almost to the ceiling.
    const dm = Math.hypot(x - mountain[0], z - mountain[1]);
    if (dm < 150) {
      const t = 1 - dm / 150;
      y = Math.max(y, -60 + 100 * Math.pow(t, 1.3) + (fbm(x * 2, z * 2) - 0.5) * 10 * t);
    }
    // Fort Surrender's island.
    const df = Math.hypot(x - fort[0], z - fort[1]);
    if (df < 46) y = Math.max(y, -24 + 31 * smooth(46, 22, df) + (fbm(x * 3, z * 3) - 0.5) * 2.5);
    // A hollow for the Level 9 platform to stand in.
    const dd = Math.hypot(x - door[0], z - door[1]);
    if (dd < 34) y += (-32 - y) * smooth(34, 14, dd);
    // The Abyss: a hole in the sea floor with no bottom anyone has found.
    const da = Math.hypot(x - abyss[0], z - abyss[1]);
    if (da < 90) y = y + (-900 - y) * smooth(90, 55, da);
    return y;
  }

  // Bones and wreckage in the twilight zone; skeletons in the midnight zone.
  const debris = [];
  for (let i = 0; i < 520; i++) {
    const [x, z] = polar(rng.range(0, Math.PI * 2), Math.sqrt(rng.next()) * 430 + 30);
    const y = floorY(x, z);
    if (y < -150 || y > -2) continue;
    const zone = zoneAt(y + 1);
    if (zone === 0 && !rng.chance(0.15)) continue;
    let kind;
    if (zone === 0) kind = 'rock';
    else if (zone === 1) kind = rng.pick(['bone', 'bone', 'ribs', 'beam', 'beam', 'barrel', 'chain', 'plate', 'rock']);
    else kind = rng.pick(['skeleton', 'skeleton', 'skeleton', 'bone', 'ribs', 'spine', 'skull', 'rock']);
    debris.push({ kind, x, z, y, rot: rng.range(0, Math.PI * 2), tilt: rng.range(-0.3, 0.3), s: rng.range(0.8, 1.25) });
  }

  return {
    door: { x: door[0], z: door[1], y: -27.5, rot: a9 + Math.PI },
    mountain: { x: mountain[0], z: mountain[1] },
    cave: { x: cave[0], z: cave[1], y: floorY(cave[0], cave[1]), rot: toM },
    abyss: { x: abyss[0], z: abyss[1] },
    fort: { x: fort[0], z: fort[1] },
    pillars,
    pipes,
    debris,
    boat: { x: 5, z: -20, heading: rng.range(-0.6, 0.6) },
    floorY,
  };
}
