// The one component allowed to use data colours inline: it reproduces the source colorbar.

import type { Legend as LegendData } from "@/lib/api/types";
import { legendGradient } from "@/lib/colormap";
import { formatValue, midiToName } from "@/lib/format";

export function Legend({ legend, rootMidi }: { legend: LegendData; rootMidi: number }) {
  const mid = (legend.min + legend.max) / 2;
  return (
    <figure className="grid gap-1.5" aria-labelledby="legend-caption">
      <figcaption id="legend-caption" className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium text-foreground">{legend.label}</span>
        <span className="text-muted-foreground">{legend.unit}</span>
      </figcaption>
      <div className="h-3 w-full ring-1 ring-foreground/10" style={{ backgroundImage: legendGradient(legend) }} aria-hidden="true" />
      <div className="grid grid-cols-3 text-xs tabular-nums text-muted-foreground" aria-hidden="true">
        <span>{formatValue(legend.min)}</span>
        <span className="text-center">{formatValue(mid)}</span>
        <span className="text-right">{formatValue(legend.max)}</span>
      </div>
      <div className="grid grid-cols-3 text-xs text-muted-foreground" aria-hidden="true">
        <span>low note {midiToName(rootMidi)}</span>
        <span className="text-center">↔ pitch ↔</span>
        <span className="text-right">high note {midiToName(rootMidi + 36)}</span>
      </div>
      <p className="sr-only">
        Colour scale from {formatValue(legend.min)} to {formatValue(legend.max)} {legend.unit}. Low values play low notes from{" "}
        {midiToName(rootMidi)}; high values play high notes up to {midiToName(rootMidi + 36)}.
      </p>
    </figure>
  );
}
