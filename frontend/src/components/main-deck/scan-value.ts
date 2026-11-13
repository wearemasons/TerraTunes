import type { ValueGrid } from "@main/lib/api/types";
import { GRID_MAX, NO_DATA } from "@main/lib/api/types";

/** Matches main's slice boundaries, including non-divisible grid widths. */
export function sliceMaximum(
  grid: ValueGrid | undefined,
  step: number,
  steps: number,
): { normalized: number; col: number; row: number } | null {
  if (!grid || steps <= 0) return null;
  const index = Math.min(steps - 1, Math.max(0, Math.floor(step)));
  const from = Math.floor((index * grid.cols) / steps);
  const to = Math.floor(((index + 1) * grid.cols) / steps);
  let peak: { normalized: number; col: number; row: number } | null = null;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = from; col < to; col++) {
      const raw = grid.cells[row * grid.cols + col] ?? NO_DATA;
      if (raw === NO_DATA) continue;
      const normalized = raw / GRID_MAX;
      if (!peak || normalized > peak.normalized)
        peak = { normalized, col, row };
    }
  }
  return peak;
}
