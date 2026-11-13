import { player } from "@main/audio/use-player";
import type { Legend, Score } from "@main/lib/api/types";
import { formatSigned, formatValue, lowerFirst } from "@main/lib/format";
import { legendValue } from "@main/lib/legend";
import { useDeckPlayhead } from "./playhead";

export function timelineSummary(score: Score, legend: Legend): string {
  const first = score.frames[0];
  const last = score.frames[score.frames.length - 1];
  if (!first || !last) return "No frame timeline is available.";
  const real = (value: number) => legendValue(value, legend);
  const peak = score.frames.reduce(
    (a, b) => (b.tension > a.tension ? b : a),
    first,
  );
  const delta = real(last.stats.mean) - real(first.stats.mean);
  return `${legend.log ? "Typical" : "Average"} ${lowerFirst(legend.label)} goes from ${formatValue(real(first.stats.mean))} to ${formatValue(real(last.stats.mean))} ${legend.unit} (${formatSigned(delta)}). The fastest change is at ${peak.label}.`;
}

export function TensionTimeline({
  score,
  legend,
  frame,
}: {
  score: Score;
  legend: Legend;
  frame: number;
}) {
  const live = useDeckPlayhead();
  const position = live?.frame === frame ? frame + live.progress : frame + 0.5;
  const maxMean = Math.max(
    0.001,
    ...score.frames.map((item) => item.stats.mean),
  );
  return (
    <figure className="deck-timeline" aria-labelledby="deck-timeline-caption">
      <div
        className="deck-timeline-plot"
        role="group"
        aria-label="Frame change timeline. Select a bar to seek to that frame."
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={score.frames
              .map(
                (item, index) =>
                  `${((index + 0.5) / score.frames.length) * 100},${100 - (item.stats.mean / maxMean) * 86}`,
              )
              .join(" ")}
            fill="none"
            stroke="#f1c46f"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
          {frame >= 0 && (
            <line
              data-time-playhead
              x1={(position / score.frames.length) * 100}
              x2={(position / score.frames.length) * 100}
              y1="0"
              y2="100"
              stroke="#fff7df"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div className="deck-timeline-bars">
          {score.frames.map((item, index) => (
            <button
              key={item.index}
              type="button"
              className={index === frame ? "active" : ""}
              style={{
                height: `${Math.max(12, Math.round(item.tension * 86 + 14))}%`,
              }}
              onClick={() => player.seek(index)}
              aria-label={`Seek to frame ${index + 1}: ${item.label}`}
              aria-pressed={index === frame}
              title={`${item.label} · change ${item.tension.toFixed(2)} · mean ${item.stats.mean.toFixed(2)}`}
            />
          ))}
        </div>
      </div>
      <figcaption id="deck-timeline-caption">
        {timelineSummary(score, legend)}
      </figcaption>
    </figure>
  );
}
