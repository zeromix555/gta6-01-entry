// SOLMAR HEAT — seeded random numbers.
//
// One tiny generator (mulberry32) drives the whole city: blocks, buildings,
// traffic, pedestrians and cash drops are all pure functions of the seed, so
// `?seed=7` always builds the same Solmar and the staged screenshots are
// reproducible frame for frame. Nothing here touches Math.random, so a
// headless self-test can never drift between runs.

/** Turn any seed value (number or string) into a uint32 state. */
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const text = String(seed ?? 'solmar');
  let h = 2166136261 >>> 0; // FNV-1a over the string
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32 — a small, fast, well-distributed PRNG. Returns a function
 * that yields floats in [0, 1). The same seed always yields the same stream.
 */
export function mulberry32(seed) {
  let a = hashSeed(seed);
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create the RNG bundle the world carries: one stream, many helpers. */
export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p (0..1). */
    chance(p) {
      return next() < p;
    },
    /** One element of a non-empty array, uniformly. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /**
     * One value from weighted entries: [[value, weight], ...]. Heavier
     * entries come up more often; weights need not sum to anything.
     */
    weighted(entries) {
      let total = 0;
      for (const [, weight] of entries) total += weight;
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    /** A fresh array shuffled in place (Fisher-Yates). */
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
      return list;
    },
  };
}

/** Clamp a number into [min, max]. Used by steering and camera code. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Shortest signed angular difference from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Euclidean distance on the XZ plane. */
export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
