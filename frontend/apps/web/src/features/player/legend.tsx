// The one component allowed to use data colours inline: it reproduces the source colorbar.

import type { Legend as LegendData } from "@/lib/api/types";
import { legendGradient } from "@/lib/colormap";
import { formatValue, midiToName } from "@/lib/format";
import { legendTicks, tickText } from "@/lib/legend";

export function Legend({ legend, rootMidi }: { legend: LegendData; rootMidi: number }) {
  const ticks = legendTicks(legend);
  const scaleNote = legend.log ? " Logarithmic scale: each step along the bar multiplies the value." : "";
  return (
    <figure className="grid gap-1.5" aria-labelledby="legend-caption">
      <figcaption id="legend-caption" className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium text-foreground">{legend.label}</span>
        <span className="text-muted-foreground">
          {legend.unit}
          {legend.log ? " · log scale" : ""}
        </span>
      </figcaption>
      <div className="h-3 w-full ring-1 ring-foreground/10" style={{ backgroundImage: legendGradient(legend) }} aria-hidden="true" />
      <div className="relative h-4 text-xs tabular-nums text-muted-foreground" aria-hidden="true">
        {ticks.map((tick) => {
          const edge = tick.position <= 0.02 ? "start" : tick.position >= 0.98 ? "end" : "mid";
          return (
            <span
              key={`${tick.position}-${tick.value}`}
              className={
                edge === "start"
                  ? "absolute left-0"
                  : edge === "end"
                    ? "absolute right-0"
                    : "absolute -translate-x-1/2 whitespace-nowrap"
              }
              style={edge === "mid" ? { left: `${tick.position * 100}%` } : undefined}
            >
              {tickText(tick)}
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-3 text-xs text-muted-foreground" aria-hidden="true">
        <span>low note {midiToName(rootMidi)}</span>
        <span className="text-center">↔ pitch ↔</span>
        <span className="text-right">high note {midiToName(rootMidi + 36)}</span>
      </div>
      <p className="sr-only">
        Colour scale from {formatValue(legend.min)} to {formatValue(legend.max)} {legend.unit}.{scaleNote} Low values play low
        notes from {midiToName(rootMidi)}; high values play high notes up to {midiToName(rootMidi + 36)}.
      </p>
    </figure>
  );
}
