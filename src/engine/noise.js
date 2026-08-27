import { hashInts } from './rng.js';

// Value noise with smooth interpolation, deterministic from a seed.
// Good enough for biome/elevation masks without external deps.

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function gridValue(seed, xi, yi) {
  // Map hash to [-1, 1].
  return (hashInts(seed, xi, yi) / 4294967296) * 2 - 1;
}

// Single-octave value noise at (x, y). Returns roughly [-1, 1].
export function valueNoise(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = fade(x - x0);
  const sy = fade(y - y0);

  const n00 = gridValue(seed, x0, y0);
  const n10 = gridValue(seed, x1, y0);
  const n01 = gridValue(seed, x0, y1);
  const n11 = gridValue(seed, x1, y1);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

// Fractal (fBm) noise: sum of octaves. Returns roughly [-1, 1].
export function fbm(seed, x, y, { octaves = 4, frequency = 1, lacunarity = 2, gain = 0.5 } = {}) {
  let amp = 1;
  let freq = frequency;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 1013, x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
