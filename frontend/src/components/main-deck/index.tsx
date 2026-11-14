import { useState } from "react";
import { Download, Eye, EyeOff, Loader2, Volume2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { player, usePlayer } from "@main/audio/use-player";
import {
  frameImageQuery,
  gridQuery,
  scoreQuery,
  trackQuery,
} from "@main/lib/api/queries";
import { announce } from "@main/lib/a11y/announce";
import { formatLatLon, formatValue, lowerFirst } from "@main/lib/format";
import { legendValue } from "@main/lib/legend";
import type { ModeId, PresetId, Score, TrackDetail } from "@main/lib/api/types";
import type { Dataset } from "../../lib/types";
import type { Spec } from "../../lib/audio/phenomena";
import { api } from "../../lib/api";
import { Transport } from "./controls";
import { FrameStage } from "./frame-stage";
import { DeckLegend } from "./legend";
import { InfoTabs } from "./info-tabs";
import { TensionTimeline } from "./timeline";
import { usePlayerShortcuts } from "@main/features/player/use-player-shortcuts";
import "./deck.css";

export interface MainDeckProps {
  dataset: Dataset;
  spec: Spec | null;
  loading: boolean;
  playing: boolean;
  progress?: number;
  onToggle: () => void;
}
function normalizeMode(mode: string): ModeId {
  return mode === "overview" || mode === "explore" ? mode : "scan";
}
function normalizePreset(preset: string): PresetId {
  return preset === "clear" || preset === "musical" ? preset : "orchestra";
}
function ShortcutBridge({
  track,
  score,
  preset,
  onModeChange,
  onPresetChange,
  onToggle,
}: {
  track: TrackDetail;
  score: Score;
  preset: PresetId;
  onModeChange: (mode: ModeId) => void;
  onPresetChange: (preset: PresetId) => void;
  onToggle: () => void;
}) {
  usePlayerShortcuts({
    track,
    score,
    preset,
    onModeChange,
    onPresetChange,
    onToggle,
  });
  return null;
}
function mapReadout(
  grid: import("@main/lib/api/types").ValueGrid | undefined,
  track: TrackDetail | undefined,
  cursor: { col: number; row: number } | null,
): string {
  if (!grid || !track || !cursor)
    return "Move over the map, or focus it and use the arrow keys.";
  const raw = grid.cells[cursor.row * grid.cols + cursor.col] ?? 255;
  const where = formatLatLon(
    (cursor.col + 0.5) / grid.cols,
    (cursor.row + 0.5) / grid.rows,
  );
  if (raw === 255) return `${where}: no data here.`;
  return `${where}: ${lowerFirst(track.legend.label)} ${formatValue(legendValue(raw / 250, track.legend))} ${track.legend.unit}.`;
}

export function MainDeck({ dataset, spec, loading, onToggle }: MainDeckProps) {
  const snapshot = usePlayer();
  const [showImage, setShowImage] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [cursor, setCursor] = useState<{ col: number; row: number } | null>(
    null,
  );
  const frameIndex = Math.max(0, snapshot.frame);
  const trackQueryState = useQuery({
    ...trackQuery(dataset.id),
    enabled: Boolean(dataset.id),
  });
  const scoreQueryState = useQuery({
    ...scoreQuery(dataset.id, normalizePreset(snapshot.preset)),
    enabled: Boolean(dataset.id),
  });
  const gridQueryState = useQuery({
    ...gridQuery(dataset.id, frameIndex),
    enabled: Boolean(dataset.id && scoreQueryState.data),
  });
  const imageQueryState = useQuery({
    ...frameImageQuery(dataset.id, frameIndex),
    enabled: Boolean(dataset.id && scoreQueryState.data),
  });
  const track = trackQueryState.data;
  const score = scoreQueryState.data;
  const frame = score?.frames[frameIndex];
  const validNotes = frame?.column_notes.filter((note) => note >= 0) ?? [];
  const noteSpan = validNotes.length
    ? `${Math.min(...validNotes)}–${Math.max(...validNotes)}`
    : "no notes";
  const grid = gridQueryState.data;
  const imageUrl = imageQueryState.data ?? null;
  const onModeChange = (mode: ModeId) => player.setMode(mode);
  const onPresetChange = (preset: PresetId) => player.setPreset(preset);
  const readout = mapReadout(grid, track, cursor);
  if (!track || !score)
    return (
      <section className="main-deck" id="now-playing" aria-label="Data Deck">
        <div className="deck-main-grid">
          <div className="deck-column">
            <div className="deck-card" style={{ padding: 18 }}>
              <Loader2
                className="animate-spin"
                size={18}
                aria-label="Loading main track data"
              />
            </div>
          </div>
          <div className="deck-right-stack">
            <div className="deck-card deck-header-card">
              <p className="deck-eyebrow">Earth information jukebox</p>
              <h2 className="deck-title">{dataset.title}</h2>
              <p className="deck-copy">
                {loading
                  ? "Measuring the frame…"
                  : (spec?.explain ?? dataset.description)}
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  return (
    <section
      className="main-deck"
      id="now-playing"
      aria-label="Earth information Data Deck"
    >
      <ShortcutBridge
        track={track}
        score={score}
        preset={normalizePreset(snapshot.preset)}
        onModeChange={onModeChange}
        onPresetChange={onPresetChange}
        onToggle={onToggle}
      />
      <div className="deck-main-grid">
        <div className="deck-column">
          <div className="deck-card deck-frame-card">
            <div className="deck-frame-head">
              <div>
                <p className="deck-eyebrow">
                  the frame · {track.date_range} ·{" "}
                  {/* the window is already marked approximate; the frame label
                      repeats it, so the page says it once */}
                  {frame?.label?.replace(/\s*\(approximate\)$/i, "") ??
                    `Frame ${frameIndex + 1}`}
                </p>
                <h3>{track.title}</h3>
              </div>
              <div className="deck-head-actions">
                <button
                  type="button"
                  className="deck-brass-button"
                  onClick={() => setShowImage((value) => !value)}
                  aria-pressed={showImage}
                >
                  {showImage ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showImage ? "hide image" : "show image"}
                </button>
                <button
                  type="button"
                  className="deck-brass-button"
                  onClick={() => setShowGrid((value) => !value)}
                  aria-pressed={showGrid}
                >
                  {showGrid ? "hide grid" : "show grid"}
                </button>
              </div>
            </div>
            <div className="deck-frame-stage">
              <FrameStage
                grid={grid}
                legend={track.legend}
                imageUrl={imageUrl}
                frame={frame}
                mode={normalizeMode(snapshot.mode)}
                showImage={showImage}
                showGrid={showGrid}
                cursor={cursor}
                onCursorChange={(cell, source) => {
                  setCursor(cell);
                  const raw =
                    grid?.cells[cell.row * (grid?.cols ?? 1) + cell.col] ?? 255;
                  void player.probe(
                    raw === 255 ? null : raw / 250,
                    (cell.col + 0.5) / (grid?.cols ?? 1),
                  );
                  if (source === "keyboard")
                    announce(mapReadout(grid, track, cell), {
                      assertive: true,
                    });
                }}
                onReadValue={() => announce(readout, { assertive: true })}
                readoutId="deck-explore-readout"
              />
            </div>
            <DeckLegend legend={track.legend} rootMidi={score.key.root_midi} />
            <div className="deck-frame-footer">
              <a
                className="deck-action"
                href={api.framePngUrl(dataset.id, frameIndex)}
                download={`${dataset.id}-frame-${frameIndex + 1}`}
              >
                <Download size={13} /> frame
              </a>
              <a
                className="deck-action"
                href={api.renderWavUrl(dataset.id)}
                download={`${dataset.id}.wav`}
              >
                <Volume2 size={13} /> natural soundscape WAV
              </a>
              {track.source_url && (
                <a
                  className="deck-action"
                  href={track.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  source ↗
                </a>
              )}
              <span className="deck-credit" title={track.credit}>
                {track.credit}
              </span>
            </div>
          </div>
          <div className="deck-card deck-transport-card">
            <Transport
              score={score}
              track={track}
              snapshot={snapshot}
              onToggle={onToggle}
              onModeChange={onModeChange}
              onPresetChange={onPresetChange}
            />
          </div>
        </div>
        <div className="deck-right-stack">
          <div className="deck-card deck-header-card">
            <div className="deck-story-grid">
              <div>
                <p className="deck-eyebrow">the earth story · {track.date_range}</p>
                <h2 className="deck-title">{track.title}</h2>
                <p className="deck-copy" title={track.description}>
                  {track.description}
                </p>
              </div>
              <div className="deck-instruments">
                <div className="deck-instrument">
                  <b>main score</b>
                  <strong>
                    {score.key.root} {score.key.scale}
                  </strong>
                  <span>
                    {score.key.bpm} bpm · {score.steps_per_frame} measured steps per
                    frame.
                  </span>
                </div>
                <div className="deck-instrument">
                  <b>lead</b>
                  <strong>exact data notes</strong>
                  <span>Column MIDI values from the main score.</span>
                </div>
                <div className="deck-instrument">
                  <b>harmony</b>
                  <strong>score-derived section</strong>
                  <span>
                    Orchestra preset adds bass, chords and movement around those
                    notes.
                  </span>
                </div>
                <div className="deck-instrument">
                  <b>mapping</b>
                  <strong>{score.mapping_version}</strong>
                  <span>
                    Backend-authored musical decisions; colors remain data colors.
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="deck-card deck-info-card">
            <InfoTabs
              track={track}
              score={score}
              frame={frameIndex}
              datasetId={dataset.id}
            />
          </div>
          <div className="deck-card deck-info-card">
            <p className="deck-eyebrow">current map readout</p>
            <p id="deck-explore-readout" className="deck-copy">
              {readout}
            </p>
            {snapshot.mode === "explore" && (
              <p className="deck-muted">
                Pointer and arrow keys probe the map. Enter or Space reads the
                selected cell.
              </p>
            )}
            <div className="deck-stat-grid" style={{ marginTop: 12 }}>
              <span>frame</span>
              <strong>{frame?.label ?? "—"}</strong>
              <span>mean</span>
              <strong>{frame ? frame.stats.mean.toFixed(3) : "—"}</strong>
              <span>tension</span>
              <strong>{frame ? frame.tension.toFixed(3) : "—"}</strong>
              <span>pitch span (MIDI)</span>
              <strong>{noteSpan}</strong>
            </div>
          </div>
          <div className="deck-card deck-timeline-card">
            <div className="deck-card-head">
              <h3>Change over time</h3>
              <span className="deck-eyebrow">{score.frames.length} frames</span>
            </div>
            <TensionTimeline
              score={score}
              legend={track.legend}
              frame={frameIndex}
            />
          </div>
          {dataset.series?.length ? (
            <div className="deck-card deck-series">
              <p className="deck-eyebrow">the series · sampled frames</p>
              <div className="deck-series-grid">
                {dataset.series.map((item) => (
                  <button
                    key={item.asset}
                    type="button"
                    aria-pressed={frameIndex === (item.frameIndex ?? 0)}
                    onClick={() => player.seek(item.frameIndex ?? 0)}
                  >
                    <img
                      src={api.assetUrl(dataset.id, item.asset)}
                      alt={`${dataset.title}, ${item.label}`}
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
