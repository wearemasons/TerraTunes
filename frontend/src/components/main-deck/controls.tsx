import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { player } from "@main/audio/use-player";
import type { ModeId, PresetId, Score, TrackDetail } from "@main/lib/api/types";
import {
  MODE_IDS,
  MODE_LABELS,
  PRESET_IDS,
  PRESET_LABELS,
} from "@main/lib/api/types";
import { INSTRUMENT_NAMES } from "@main/audio/orchestra";
import { Waveform } from "./waveform";
import type { PlayerLike } from "./types";

const modeHints: Record<ModeId, string> = {
  scan: "Sweep each frame west to east",
  overview: "One chord per frame",
  explore: "Move over the map to hear values",
};
const modeKeys: Record<ModeId, string> = {
  scan: "1",
  overview: "2",
  explore: "3",
};
const labelInstrument = (value: unknown) =>
  INSTRUMENT_NAMES[value as keyof typeof INSTRUMENT_NAMES] ??
  String(value ?? "—").replaceAll("_", " ");
function BrassButton({
  label,
  onClick,
  disabled,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="deck-icon-button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
}
export function Transport({
  score,
  track,
  snapshot,
  onToggle,
  onModeChange,
  onPresetChange,
}: {
  score: Score;
  track: TrackDetail;
  snapshot: PlayerLike;
  onToggle: () => void;
  onModeChange: (mode: ModeId) => void;
  onPresetChange: (preset: PresetId) => void;
}) {
  const playing = snapshot.status === "playing";
  const exploring = snapshot.mode === "explore";
  const current = score.frames[snapshot.frame];
  const playLabel = playing
    ? "Pause"
    : snapshot.status === "ended"
      ? "Play again"
      : "Play";
  const percent =
    snapshot.frameCount > 1
      ? (snapshot.frame / (snapshot.frameCount - 1)) * 100
      : 0;
  return (
    <section
      className="deck-transport"
      aria-labelledby="deck-transport-heading"
    >
      <h2 id="deck-transport-heading" className="sr-only">
        Player controls
      </h2>
      {!snapshot.supported && (
        <p className="deck-warning" role="alert">
          Sound cannot start in this browser.{" "}
          {snapshot.error ?? "Web Audio isn't available."}
        </p>
      )}
      <div className="deck-transport-row">
        <BrassButton label="First frame (Home)" onClick={() => player.seek(0)}>
          <SkipBack size={16} />
        </BrassButton>
        <BrassButton
          label="Previous frame (Left Arrow)"
          onClick={() => player.step(-1)}
          disabled={snapshot.frame <= 0}
        >
          <ChevronLeft size={18} />
        </BrassButton>
        <button
          type="button"
          className="deck-play-button"
          onClick={onToggle}
          disabled={!snapshot.supported || exploring}
          aria-keyshortcuts="Space"
        >
          {playing ? (
            <Pause size={17} fill="currentColor" />
          ) : snapshot.status === "ended" ? (
            <RotateCcw size={17} />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          <span>{playLabel}</span>
        </button>
        <BrassButton
          label="Next frame (Right Arrow)"
          onClick={() => player.step(1)}
          disabled={snapshot.frame >= snapshot.frameCount - 1}
        >
          <ChevronRight size={18} />
        </BrassButton>
        <div className="deck-current-frame">
          <strong>{current?.label ?? "—"}</strong>
          <span>
            Frame {snapshot.frame + 1} of{" "}
            {snapshot.frameCount || score.frames.length} · {score.key.root}{" "}
            {score.key.scale} · {score.key.bpm} bpm
          </span>
        </div>
        <Waveform
          status={snapshot.status}
          className="deck-waveform-transport"
        />
        <div className="deck-volume">
          <button
            type="button"
            className="deck-volume-button"
            onClick={() => player.setMuted(!snapshot.muted)}
            aria-label={snapshot.muted ? "Unmute (M)" : "Mute (M)"}
            aria-pressed={snapshot.muted}
            aria-keyshortcuts="M"
          >
            {snapshot.muted || snapshot.volume === 0 ? (
              <VolumeX size={16} />
            ) : (
              <Volume2 size={16} />
            )}
          </button>
          <label htmlFor="deck-volume-slider" className="sr-only">
            Volume
          </label>
          <input
            id="deck-volume-slider"
            type="range"
            min="0"
            max="100"
            step="5"
            value={Math.round(snapshot.volume * 100)}
            onChange={(event) =>
              player.setVolume(Number(event.target.value) / 100)
            }
          />
        </div>
      </div>
      <div className="deck-slider-row">
        <label htmlFor="deck-frame-slider">
          Frame{" "}
          <span>
            {score.frames[0]?.label ?? ""} →{" "}
            {score.frames[score.frames.length - 1]?.label ?? ""}
          </span>
        </label>
        <input
          id="deck-frame-slider"
          type="range"
          min="0"
          max={Math.max(0, score.frames.length - 1)}
          step="1"
          value={Math.min(snapshot.frame, Math.max(0, score.frames.length - 1))}
          onChange={(event) => player.seek(Number(event.target.value))}
          style={{ "--deck-progress": `${percent}%` } as CSSProperties}
        />
      </div>
      <div className="deck-options-row">
        <fieldset>
          <legend>Listening mode</legend>
          <div className="deck-segmented">
            {MODE_IDS.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={snapshot.mode === mode}
                aria-keyshortcuts={modeKeys[mode]}
                title={`${modeHints[mode]} (${modeKeys[mode]})`}
                onClick={() => onModeChange(mode)}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Sound preset</legend>
          <div className="deck-segmented">
            {PRESET_IDS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={snapshot.preset === preset}
                aria-keyshortcuts="C"
                onClick={() => onPresetChange(preset)}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
          </div>
        </fieldset>
        {snapshot.preset === "orchestra" && (
          <WhoPlays track={track} available={player.instrumentsAvailable} />
        )}
        {exploring && (
          <p className="deck-muted">
            Playback pauses in Explore mode. Move over the map to hear its
            values.
          </p>
        )}
      </div>
    </section>
  );
}
function WhoPlays({
  track,
  available,
}: {
  track: TrackDetail;
  available: boolean;
}) {
  const orchestra = player.orchestra as unknown as {
    lead?: unknown;
    bass?: unknown;
    pad?: unknown;
    texture?: unknown;
    accent?: unknown;
    leadOctave?: number;
    character?: string;
  };
  if (!available)
    return (
      <p className="deck-muted">
        Recorded instruments are unavailable; Orchestra falls back to the Clear
        tone.
      </p>
    );
  return (
    <div className="deck-who-plays" aria-label="Who plays what">
      <strong>Who plays what</strong>
      <span>
        Lead · the exact data notes: {labelInstrument(orchestra.lead)}
        {orchestra.leadOctave ? " (an octave up)" : ""}
      </span>
      <span>
        Harmony: {labelInstrument(orchestra.bass)} bass ·{" "}
        {labelInstrument(orchestra.pad)} chords ·{" "}
        {labelInstrument(orchestra.texture)} movement
        {orchestra.accent
          ? ` · ${labelInstrument(orchestra.accent)} accent`
          : ""}
        .
      </span>
      <span>{orchestra.character ?? `${track.title} orchestration`}</span>
    </div>
  );
}
