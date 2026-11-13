import type { Legend as LegendData } from "@main/lib/api/types";
import { legendGradient } from "@main/lib/colormap";
import { formatValue, midiToName } from "@main/lib/format";
import { legendTicks, tickText } from "@main/lib/legend";

export function DeckLegend({
  legend,
  rootMidi,
}: {
  legend: LegendData;
  rootMidi: number;
}) {
  const ticks = legendTicks(legend);
  return (
    <figure className="deck-legend" aria-labelledby="deck-legend-caption">
      <figcaption id="deck-legend-caption">
        <span>{legend.label}</span>
        <span>
          {legend.unit}
          {legend.log ? " · log scale" : ""}
        </span>
      </figcaption>
      <div
        className="deck-legend-bar"
        style={{ backgroundImage: legendGradient(legend) }}
        aria-hidden="true"
      />
      <div className="deck-legend-ticks" aria-hidden="true">
        {ticks.map((tick) => {
          const edge =
            tick.position <= 0.02
              ? "start"
              : tick.position >= 0.98
                ? "end"
                : "mid";
          return (
            <span
              key={`${tick.position}-${tick.value}`}
              className={edge}
              style={
                edge === "mid" ? { left: `${tick.position * 100}%` } : undefined
              }
            >
              {tickText(tick)}
            </span>
          );
        })}
      </div>
      <div className="deck-legend-midi" aria-hidden="true">
        <span>low note {midiToName(rootMidi)}</span>
        <span>↔ pitch ↔</span>
        <span>high note {midiToName(rootMidi + 36)}</span>
      </div>
      <p className="sr-only">
        Colour scale from {formatValue(legend.min)} to {formatValue(legend.max)}{" "}
        {legend.unit}. Low values play low notes from {midiToName(rootMidi)};
        high values play up to {midiToName(rootMidi + 36)}.
      </p>
    </figure>
  );
}
