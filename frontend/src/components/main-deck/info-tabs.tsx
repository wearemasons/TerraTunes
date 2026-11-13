import { useState } from "react";
import type { ReactNode } from "react";
import { Download, ExternalLink } from "lucide-react";
import { player, usePlayer } from "@main/audio/use-player";
import type { FrameScore, Score, TrackDetail } from "@main/lib/api/types";
import { midiToName } from "@main/lib/format";
import { api } from "../../lib/api";
import { useDeckPlayhead } from "./playhead";

const TABS = ["now", "key", "transcript", "data", "source"] as const;
type Tab = (typeof TABS)[number];
function DownloadLink({
  href,
  children,
  download,
}: {
  href: string;
  children: ReactNode;
  download?: string;
}) {
  return (
    <a
      className="deck-action"
      href={href}
      download={download}
      target={download ? undefined : "_blank"}
      rel={download ? undefined : "noreferrer"}
    >
      {children}
    </a>
  );
}
function Contour({ frame }: { frame: FrameScore }) {
  const live = useDeckPlayhead();
  const { mode } = usePlayer();
  const playhead = mode === "scan" && live?.frame === frame.index ? live : null;
  const notes = frame.column_notes;
  const valid = notes.filter((item) => item >= 0);
  const lo = valid.length ? Math.min(...valid) : 48;
  const hi = valid.length ? Math.max(...valid) : 60;
  const span = Math.max(12, hi - lo);
  const path = notes
    .map(
      (note, index) =>
        `${index ? "L" : "M"}${((index + 0.5) / Math.max(1, notes.length)) * 100},${note < 0 ? 95 : 90 - ((note - lo) / span) * 78}`,
    )
    .join(" ");
  return (
    <div className="deck-contour">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={path}
          fill="none"
          stroke="#ffd27a"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {playhead && (
          <line
            data-current-frame-playhead
            x1={playhead.progress * 100}
            x2={playhead.progress * 100}
            y1="0"
            y2="100"
            stroke="#fff4cf"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div>
        <span>{midiToName(lo)}</span>
        <span>
          {playhead && (notes[playhead.step] ?? -1) >= 0
            ? `Now ${midiToName(notes[playhead.step]!)}`
            : midiToName(hi)}
        </span>
      </div>
    </div>
  );
}
export function InfoTabs({
  track,
  score,
  frame,
  datasetId,
}: {
  track: TrackDetail;
  score: Score;
  frame: number;
  datasetId: string;
}) {
  const [tab, setTab] = useState<Tab>("now");
  const current = score.frames[frame];
  const frameUrl = api.framePngUrl(datasetId, frame);
  const wavUrl = api.renderWavUrl(datasetId);
  return (
    <section className="deck-info" aria-labelledby="deck-info-heading">
      <h2 id="deck-info-heading" className="sr-only">
        Track details
      </h2>
      <div className="deck-tab-list" role="tablist" aria-label="Track details">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            id={`deck-tab-button-${id}`}
            tabIndex={tab === id ? 0 : -1}
            aria-controls={tab === id ? `deck-tab-${id}` : undefined}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const current = TABS.indexOf(id);
              const next =
                event.key === "Home"
                  ? TABS[0]
                  : event.key === "End"
                    ? TABS[TABS.length - 1]
                    : TABS[
                        (current +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          TABS.length) %
                          TABS.length
                      ];
              if (next) {
                setTab(next);
                document.getElementById(`deck-tab-button-${next}`)?.focus();
              }
            }}
            onClick={() => setTab(id)}
          >
            {id === "now"
              ? "Now playing"
              : id === "key"
                ? "Audio key"
                : id === "transcript"
                  ? "Transcript"
                  : id === "data"
                    ? "Data & stats"
                    : "Source & downloads"}
          </button>
        ))}
      </div>
      <div
        id={`deck-tab-${tab}`}
        role="tabpanel"
        aria-labelledby={`deck-tab-button-${tab}`}
        tabIndex={0}
        className="deck-tab-panel"
      >
        {tab === "now" && current && (
          <div className="deck-tab-stack">
            <div>
              <p className="deck-eyebrow">current frame</p>
              <h3>{current.label}</h3>
              <p>{current.description}</p>
            </div>
            <Contour frame={current} />
            <p className="deck-muted">
              The main score maps measured values to MIDI notes west → east;
              silent cells are not invented into instruments.
            </p>
          </div>
        )}
        {tab === "key" && (
          <div className="deck-tab-stack">
            <h3>How to listen to this track</h3>
            <p>{track.audio_key}</p>
            <p className="deck-muted">
              Key of {score.key.root} {score.key.scale}, {score.key.bpm} beats
              per minute. Press K to have this read aloud.
            </p>
            <div className="deck-stat-grid">
              <span>preset</span>
              <strong>{score.preset}</strong>
              <span>mapping</span>
              <strong>{score.mapping_version}</strong>
            </div>
          </div>
        )}
        {tab === "transcript" && (
          <ol className="deck-transcript">
            {track.transcript.map((entry) => {
              const active = entry.frame === frame;
              return (
                <li key={`${entry.frame}-${entry.text}`}>
                  <button
                    type="button"
                    aria-current={active ? "step" : undefined}
                    className={active ? "active" : ""}
                    onClick={() => player.seek(entry.frame)}
                  >
                    <b>
                      {score.frames[entry.frame]?.label ??
                        `Frame ${entry.frame + 1}`}
                    </b>
                    <span>{entry.text}</span>
                    <em className="sr-only"> Go to this frame.</em>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {tab === "data" && (
          <div className="deck-tab-stack">
            <h3>Measured frame data</h3>
            {current && (
              <div className="deck-stat-grid">
                <span>mean</span>
                <strong>{current.stats.mean.toFixed(3)}</strong>
                <span>minimum</span>
                <strong>{current.stats.min.toFixed(3)}</strong>
                <span>maximum</span>
                <strong>{current.stats.max.toFixed(3)}</strong>
                <span>extreme share</span>
                <strong>
                  {Math.round(current.stats.extreme_share * 100)}%
                </strong>
                <span>tension</span>
                <strong>{current.tension.toFixed(3)}</strong>
                <span>loudness</span>
                <strong>{current.loudness.toFixed(3)}</strong>
                <span>brightness</span>
                <strong>{current.brightness.toFixed(3)}</strong>
                <span>rhythm density</span>
                <strong>{current.rhythm_density}</strong>
              </div>
            )}
          </div>
        )}
        {tab === "source" && (
          <div className="deck-tab-stack">
            <h3>About this visualization</h3>
            <p>{track.description}</p>
            <div className="deck-chip-row">
              <span>{track.date_range}</span>
              <span>{track.frame_count} frames</span>
              <span>
                {track.calibrated
                  ? "Calibrated to colorbar"
                  : "Artistic mapping"}
              </span>
              {track.synthetic ? <span>Demo data</span> : null}
            </div>
            <p className="deck-muted">{track.credit}</p>
            <div className="deck-action-row">
              <DownloadLink
                href={frameUrl}
                download={`${datasetId}-frame-${frame + 1}`}
              >
                <Download size={14} /> frame image
              </DownloadLink>
              <DownloadLink href={wavUrl} download="terra-tunes.wav">
                <Download size={14} /> natural soundscape WAV
              </DownloadLink>
              {track.source_url ? (
                <DownloadLink href={track.source_url}>
                  <ExternalLink size={14} /> original source
                </DownloadLink>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
