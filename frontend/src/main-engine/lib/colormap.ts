// Turns a track's colorbar anchors into a lookup table. These are DATA colours reproducing the
// source visualization (exempt from the theme-token rule); UI chrome never uses them.

import type { Legend, ValueGrid } from "@main/lib/api/types";
import { GRID_MAX, NO_DATA } from "@main/lib/api/types";

export type Lut = Uint8ClampedArray; // (GRID_MAX + 1) * 3

export function buildLut(legend: Legend): Lut {
  const lut = new Uint8ClampedArray((GRID_MAX + 1) * 3);
  const anchors = [...legend.anchors].sort((a, b) => a.position - b.position);
  for (let i = 0; i <= GRID_MAX; i++) {
    const p = i / GRID_MAX;
    let lo = anchors[0];
    let hi = anchors[anchors.length - 1];
    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      if (a && b && p >= a.position && p <= b.position) {
        lo = a;
        hi = b;
        break;
      }
    }
    if (!lo || !hi) continue;
    const span = hi.position - lo.position || 1;
    const t = Math.min(1, Math.max(0, (p - lo.position) / span));
    for (let ch = 0; ch < 3; ch++) {
      lut[i * 3 + ch] = lo.rgb[ch]! + (hi.rgb[ch]! - lo.rgb[ch]!) * t;
    }
  }
  return lut;
}

/** Paints a value grid into ImageData; no-data cells stay transparent so the theme shows through. */
export function gridToImageData(grid: ValueGrid, lut: Lut): ImageData {
  const image = new ImageData(grid.cols, grid.rows);
  const { data } = image;
  for (let i = 0; i < grid.cells.length; i++) {
    const cell = grid.cells[i] ?? NO_DATA;
    if (cell === NO_DATA) continue;
    const v = Math.min(GRID_MAX, cell);
    data[i * 4] = lut[v * 3]!;
    data[i * 4 + 1] = lut[v * 3 + 1]!;
    data[i * 4 + 2] = lut[v * 3 + 2]!;
    data[i * 4 + 3] = 255;
  }
  return image;
}

/** CSS gradient for the legend bar. */
export function legendGradient(legend: Legend): string {
  const stops = [...legend.anchors]
    .sort((a, b) => a.position - b.position)
    .map((a) => `rgb(${a.rgb[0]} ${a.rgb[1]} ${a.rgb[2]}) ${(a.position * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
