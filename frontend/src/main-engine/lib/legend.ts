import type { Legend, LegendTick } from "@main/lib/api/types";
import { formatValue } from "@main/lib/format";

/** Normalized colorbar position (0..1) → real value. Mirrors backend app.mapping.rules.to_real. */
export function legendValue(value01: number, legend: Legend): number {
  const p = Math.min(1, Math.max(0, value01));
  const ticks = legend.ticks && legend.ticks.length >= 2 ? [...legend.ticks].sort((a, b) => a.position - b.position) : null;
  if (!ticks) return legend.min + p * (legend.max - legend.min);
  const log = Boolean(legend.log);
  const f = (v: number) => (log ? Math.log10(v) : v);
  let lo = ticks[0]!;
  let hi = ticks[ticks.length - 1]!;
  for (let i = 0; i < ticks.length - 1; i++) {
    if (p >= ticks[i]!.position && p <= ticks[i + 1]!.position) {
      lo = ticks[i]!;
      hi = ticks[i + 1]!;
      break;
    }
  }
  const span = hi.position - lo.position || 1;
  const t = Math.min(1, Math.max(0, (p - lo.position) / span));
  const v = f(lo.value) + (f(hi.value) - f(lo.value)) * t;
  return log ? 10 ** v : v;
}

/** Ticks to label on the legend bar: the colorbar's own stops, or min/mid/max. */
export function legendTicks(legend: Legend): LegendTick[] {
  if (legend.ticks && legend.ticks.length >= 2) return legend.ticks;
  return [
    { position: 0, value: legend.min },
    { position: 0.5, value: legendValue(0.5, legend) },
    { position: 1, value: legend.max },
  ];
}

export function tickText(tick: LegendTick): string {
  return tick.label ? `${formatValue(tick.value)} (${tick.label})` : formatValue(tick.value);
}
