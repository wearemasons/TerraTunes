// A synthetic Earth-like planet used by the demo data source.
// It is NOT real geography; it exists so the jukebox works offline and without NASA assets.

import { bump, fbm, rng } from "./noise";

export const GRID_COLS = 64;
export const GRID_ROWS = 32;

const WORLD_SEED = 7;
const LAND_SHARE = 0.32;

let landCache: Uint8Array | null = null;

function rawLand(u: number, v: number): number {
  const lat = Math.abs(0.5 - v) * 2; // 0 equator → 1 pole
  return fbm(u, v, 0, WORLD_SEED, 3, 5) - lat * lat * 0.08;
}

/** Land mask on the demo grid: 1 = land, 0 = ocean. */
export function landMask(): Uint8Array {
  if (landCache) return landCache;
  const values: number[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      values.push(rawLand((c + 0.5) / GRID_COLS, (r + 0.5) / GRID_ROWS));
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * (1 - LAND_SHARE))] ?? 0.5;
  const mask = new Uint8Array(values.length);
  values.forEach((value, i) => {
    const row = Math.floor(i / GRID_COLS);
    const polar = row >= GRID_ROWS - 3; // southern ice continent
    mask[i] = value >= threshold || polar ? 1 : 0;
  });
  landCache = mask;
  return mask;
}

export function isLand(u: number, v: number): boolean {
  const c = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(u * GRID_COLS)));
  const r = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(v * GRID_ROWS)));
  return landMask()[r * GRID_COLS + c] === 1;
}

export interface Point {
  u: number;
  v: number;
  weight: number;
}

function placeOnLand(count: number, seed: number, vMin: number, vMax: number): Point[] {
  const random = rng(seed);
  const points: Point[] = [];
  let guard = 0;
  while (points.length < count && guard < 5000) {
    guard++;
    const u = random();
    const v = vMin + random() * (vMax - vMin);
    if (isLand(u, v)) points.push({ u, v, weight: 0.5 + random() * 0.5 });
  }
  return points;
}

let citiesCache: Point[] | null = null;
/** Population centres, biased to the northern mid-latitudes. */
export function cities(): Point[] {
  citiesCache ??= [...placeOnLand(14, 11, 0.18, 0.42), ...placeOnLand(6, 13, 0.42, 0.7)];
  return citiesCache;
}

export interface Fire extends Point {
  start: number;
  length: number;
}

let firesCache: Fire[] | null = null;
export function fires(): Fire[] {
  if (firesCache) return firesCache;
  const random = rng(29);
  firesCache = [...placeOnLand(7, 31, 0.15, 0.35), ...placeOnLand(5, 37, 0.5, 0.72)].map((p) => ({
    ...p,
    start: random() * 0.7,
    length: 0.2 + random() * 0.3,
  }));
  return firesCache;
}

/** Sum of Gaussian bumps at the given points. */
export function field(points: Point[], u: number, v: number, sigma: number): number {
  let sum = 0;
  for (const p of points) sum += p.weight * bump(u, v, p.u, p.v, sigma);
  return sum;
}

/** Moisture proxy for vegetation and biodiversity: wetter near the equator and coasts. */
export function moisture(u: number, v: number): number {
  const lat = Math.abs(0.5 - v) * 2;
  const tropical = Math.exp(-((lat / 0.3) ** 2));
  return Math.min(1, 0.25 + 0.6 * tropical + 0.5 * (fbm(u, v, 3, 41, 4, 3) - 0.5));
}
