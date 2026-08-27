// Deterministic seeded PRNG utilities.

// mulberry32: fast, decent-quality 32-bit PRNG. Returns a function -> [0,1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash several integers into a 32-bit unsigned int (order-sensitive).
export function hashInts(...ints) {
  let h = 2166136261 >>> 0;
  for (const n of ints) {
    h ^= n & 0xffffffff;
    h = Math.imul(h, 16777619);
  }
  // Final avalanche.
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

// A PRNG seeded deterministically from a base seed + coordinates/salt.
export function rngAt(seed, ...coords) {
  return mulberry32(hashInts(seed, ...coords));
}
