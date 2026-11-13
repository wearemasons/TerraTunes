// Deterministic value noise for synthetic demo fields. Same seed → same planet.

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 3-D value noise in [0,1]. `periodX` wraps the x axis so longitude is seamless.
 */
export function valueNoise(x: number, y: number, z: number, seed: number, periodX: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const x0 = ((xi % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;

  const c = (xx: number, yy: number, zz: number) => hash3(xx, yy, zz, seed);
  const a = lerp(lerp(c(x0, yi, zi), c(x1, yi, zi), xf), lerp(c(x0, yi + 1, zi), c(x1, yi + 1, zi), xf), yf);
  const b = lerp(
    lerp(c(x0, yi, zi + 1), c(x1, yi, zi + 1), xf),
    lerp(c(x0, yi + 1, zi + 1), c(x1, yi + 1, zi + 1), xf),
    yf,
  );
  return lerp(a, b, zf);
}

/** Fractal noise over u (0..1, wrapping) and v (0..1), with time z. Output roughly [0,1]. */
export function fbm(u: number, v: number, z: number, seed: number, baseFreq = 4, octaves = 4): number {
  let amp = 0.5;
  let freq = baseFreq;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * freq, v * freq * 0.5, z, seed + o * 101, freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian bump with longitude wrap. du, dv in grid units (0..1). */
export function bump(u: number, v: number, cu: number, cv: number, sigma: number): number {
  let du = Math.abs(u - cu);
  if (du > 0.5) du = 1 - du;
  const dv = (v - cv) * 0.5; // map is 2:1, keep blobs round
  return Math.exp(-(du * du + dv * dv) / (2 * sigma * sigma));
}
