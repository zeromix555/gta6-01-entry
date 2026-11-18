// SOLMAR HEAT — the city of Solmar, generated from a seed.
//
// Solmar is a 5x5 road grid: avenues run north-south at x = -80, -40, 0, 40,
// 80 and streets run east-west at the same coordinates. Between the roads
// sit 16 blocks; each block holds one to four procedural buildings, and the
// three landmark blocks hold the diner, the hospital and the bank. Roads are
// always clear: nothing is ever built on them, so driving straight down an
// avenue is safe and the self-test's 300-step drive cannot hit a wall.
//
// The module is pure data: generateCity(rng) returns plain objects, and the
// renderer turns them into meshes. Collision code uses the same building
// list, so what you see is what you bump into.

import { WORLD, COLORS, PLACES } from './config.js';
import { dist2d } from './random.js';

/** The road centre lines, shared by avenues and streets. */
export const ROAD_LINES = WORLD.roadCoords;

/** Half-width of a road at coordinate `line` (avenue is wider). */
export function roadHalfWidth(line) {
  return (line === 0 ? WORLD.avenueWidth : WORLD.roadWidth) / 2;
}

/** True when (x, z) is on any road surface (including intersections). */
export function isOnRoad(x, z) {
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) <= roadHalfWidth(line)) return true;
    if (Math.abs(z - line) <= roadHalfWidth(line)) return true;
  }
  return false;
}

/** Nearest road centre line coordinate to a value on one axis. */
export function nearestRoadLine(value) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) {
    if (Math.abs(value - line) < Math.abs(value - best)) best = line;
  }
  return best;
}

/**
 * Generate the whole city from a seeded RNG. Returns:
 *   { buildings, trees, roadLines, places }
 * A building is { x, z, w, d, h, color, kind, label? }; a tree is { x, z, h }.
 * Landmark kinds: 'diner', 'hospital', 'bank'. Ordinary kinds: 'tower',
 * 'shop', 'house'.
 */
export function generateCity(rng) {
  const buildings = [];
  const trees = [];
  const lamps = intersectionLamps();

  // Landmark buildings first, so ordinary blocks never overwrite them.
  const landmarks = [
    { ...PLACES.dinerBuilding, w: 18, d: 12, h: 9, kind: 'diner', label: 'Marisol Diner' },
    { ...PLACES.hospitalBuilding, w: 20, d: 14, h: 16, kind: 'hospital', label: 'Solmar General' },
    { ...PLACES.bankBuilding, w: 16, d: 12, h: 12, kind: 'bank', label: 'Solmar National Bank' },
  ];
  for (const mark of landmarks) {
    buildings.push({
      x: mark.x,
      z: mark.z,
      w: mark.w,
      d: mark.d,
      h: mark.h,
      color: mark.kind === 'hospital' ? 0xe8e8e8 : mark.kind === 'bank' ? 0xc8b890 : 0xb0703a,
      kind: mark.kind,
      label: mark.label,
    });
  }

  // Ordinary blocks: the grid squares between neighbouring road lines.
  // Block (i, j) spans x in [lines[i]+margin, lines[i+1]-margin] and the
  // same on z. Skip the three blocks that already hold a landmark.
  const margin = WORLD.blockMargin;
  const landmarkBlocks = new Set(
    landmarks.map((m) => blockKey(m.x, m.z)),
  );
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x0 = ROAD_LINES[i] + margin;
      const x1 = ROAD_LINES[i + 1] - margin;
      const z0 = ROAD_LINES[j] + margin;
      const z1 = ROAD_LINES[j + 1] - margin;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (landmarkBlocks.has(`${i},${j}`)) continue;
      const blockW = x1 - x0;
      const blockD = z1 - z0;

      // One tall tower, or a pair of shops, or a row of small houses.
      const roll = rng.next();
      if (roll < 0.3) {
        buildings.push({
          x: cx,
          z: cz,
          w: blockW * 0.7,
          d: blockD * 0.7,
          h: rng.range(22, 42),
          color: rng.pick(COLORS.buildingPalette),
          kind: 'tower',
        });
      } else if (roll < 0.65) {
        buildings.push({
          x: cx - blockW * 0.22,
          z: cz,
          w: blockW * 0.42,
          d: blockD * 0.6,
          h: rng.range(7, 13),
          color: rng.pick(COLORS.buildingPalette),
          kind: 'shop',
        });
        buildings.push({
          x: cx + blockW * 0.24,
          z: cz,
          w: blockW * 0.4,
          d: blockD * 0.55,
          h: rng.range(6, 11),
          color: rng.pick(COLORS.buildingPalette),
          kind: 'shop',
        });
      } else {
        for (let k = 0; k < 3; k++) {
          buildings.push({
            x: x0 + ((k + 0.5) / 3) * blockW,
            z: cz + rng.range(-2, 2),
            w: blockW * 0.26,
            d: blockD * 0.6,
            h: rng.range(4, 7),
            color: rng.pick(COLORS.buildingPalette),
            kind: 'house',
          });
        }
      }

      // A couple of street trees on the block corners, clear of the road.
      for (let t = 0; t < 2; t++) {
        trees.push({
          x: rng.range(x0 + 1, x1 - 1),
          z: rng.range(z0 + 1, z1 - 1),
          h: rng.range(2.5, 4.5),
        });
      }
    }
  }

  return { buildings, trees, lamps, roadLines: ROAD_LINES, places: PLACES };
}

/**
 * One lamp post at every intersection corner, on the sidewalk: the city
 * reads at night and the crossroads get a landmark each. Lamps are pure
 * decoration — they never collide with anything.
 */
export function intersectionLamps() {
  const lamps = [];
  for (const line of ROAD_LINES) {
    for (const cross of ROAD_LINES) {
      lamps.push({ x: line + 7.5, z: cross + 7.5 });
    }
  }
  return lamps;
}

/** Which block (i,j) a point belongs to, for the landmark skip above. */
function blockKey(x, z) {
  let i = 0;
  let j = 0;
  for (let k = 0; k < ROAD_LINES.length - 1; k++) {
    if (x >= ROAD_LINES[k] && x < ROAD_LINES[k + 1]) i = k;
    if (z >= ROAD_LINES[k] && z < ROAD_LINES[k + 1]) j = k;
  }
  return `${i},${j}`;
}

/**
 * Circle-vs-building collision: if the circle (x, z, radius) overlaps a
 * building, push it out along the smallest penetration axis and report the
 * push. Returns { x, z, hit } with the corrected position.
 */
export function collideBuildings(buildings, x, z, radius) {
  let hit = false;
  for (const b of buildings) {
    const hw = b.w / 2 + radius;
    const hd = b.d / 2 + radius;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
    // Overlap: resolve along the axis with the least penetration.
    const px = hw - Math.abs(dx);
    const pz = hd - Math.abs(dz);
    if (px < pz) {
      x = b.x + (dx >= 0 ? hw : -hw);
    } else {
      z = b.z + (dz >= 0 ? hd : -hd);
    }
    hit = true;
  }
  return { x, z, hit };
}

/** A random point on a road (used for cash drops and traffic spawns). */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    // On an avenue, somewhere along z.
    const line = rng.pick(ROAD_LINES);
    return { x: line + rng.range(-roadHalfWidth(line) + 2, roadHalfWidth(line) - 2), z: rng.range(-95, 95) };
  }
  const line = rng.pick(ROAD_LINES);
  return { x: rng.range(-95, 95), z: line + rng.range(-roadHalfWidth(line) + 2, roadHalfWidth(line) - 2) };
}

/** Distance from a point to the nearest building (for spawn safety). */
export function nearestBuildingGap(buildings, x, z) {
  let best = Infinity;
  for (const b of buildings) {
    const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
    best = Math.min(best, dist2d(0, 0, dx, dz));
  }
  return best;
}
