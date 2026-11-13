import { Alert, AlertDescription, AlertTitle } from "@my-better-t-app/ui/components/alert";
import { Button } from "@my-better-t-app/ui/components/button";
import { Slider } from "@my-better-t-app/ui/components/slider";
import { Toggle } from "@my-better-t-app/ui/components/toggle";
import { ToggleGroup, ToggleGroupItem } from "@my-better-t-app/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@my-better-t-app/ui/components/tooltip";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack, Volume2, VolumeX } from "lucide-react";
import type { ReactElement } from "react";

import { player } from "@/audio/player";
import { usePlayer } from "@/audio/use-player";
import { MODE_IDS, MODE_LABELS, type ModeId, PRESET_IDS, PRESET_LABELS, type PresetId, type Score } from "@/lib/api/types";

import { Waveform } from "./waveform";

function first(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

function IconButton({ label, hint, onClick, disabled, children }: { label: string; hint?: string; onClick: () => void; disabled?: boolean; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" size="icon-lg" aria-label={label} onClick={onClick} disabled={disabled} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{hint ?? label}</TooltipContent>
    </Tooltip>
  );
}

const MODE_HINTS: Record<ModeId, string> = {
  scan: "Sweep each frame west to east",
  overview: "One chord per frame",
  explore: "Move over the map to hear values",
};

export function Transport({
  score,
  mode,
  preset,
  onModeChange,
  onPresetChange,
}: {
  score: Score;
  mode: ModeId;
  preset: PresetId;
  onModeChange: (mode: ModeId) => void;
  onPresetChange: (preset: PresetId) => void;
}) {
  const { status, frame, frameCount, volume, muted, supported, error } = usePlayer();
  const current = score.frames[frame];
  const playing = status === "playing";
  const exploring = mode === "explore";
  const playLabel = playing ? "Pause" : status === "ended" ? "Play again" : "Play";

  return (
    <section aria-labelledby="transport-heading" className="grid gap-4">
      <h2 id="transport-heading" className="sr-only">
        Player controls
      </h2>

      {!supported ? (
        <Alert variant="destructive">
          <AlertTitle>Sound can't start in this browser</AlertTitle>
          <AlertDescription>
            {error ?? "Web Audio isn't available."} You can still read the description, audio key and transcript below.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="First frame" hint="First frame (Home)" onClick={() => player.seek(0)}>
          <SkipBack aria-hidden="true" />
        </IconButton>
        <IconButton label="Previous frame" hint="Previous frame (←)" onClick={() => player.step(-1)} disabled={frame === 0}>
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <Button
          size="lg"
          className="h-11 min-w-32 gap-2 px-5 text-sm"
          onClick={() => player.toggle()}
          disabled={!supported || exploring}
          aria-keyshortcuts="Space"
        >
          {playing ? <Pause aria-hidden="true" /> : status === "ended" ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playLabel}
        </Button>
        <IconButton label="Next frame" hint="Next frame (→)" onClick={() => player.step(1)} disabled={frame >= frameCount - 1}>
          <ChevronRight aria-hidden="true" />
        </IconButton>

        <div className="ml-1 grid min-w-0 flex-1 basis-40 gap-0.5">
          <span className="truncate text-sm font-medium tabular-nums">{current?.label ?? "—"}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Frame {frame + 1} of {frameCount} · {score.key.root} {score.key.scale} · {score.key.bpm} bpm
          </span>
        </div>

        <Waveform className="hidden h-10 w-28 sm:block" />

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  variant="outline"
                  size="lg"
                  aria-label="Mute"
                  pressed={muted}
                  onPressedChange={(pressed) => player.setMuted(pressed)}
                  aria-keyshortcuts="M"
                />
              }
            >
              {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </TooltipTrigger>
            <TooltipContent>Mute (M)</TooltipContent>
          </Tooltip>
          <span id="volume-label" className="sr-only">
            Volume
          </span>
          <div className="w-24">
            <Slider
              aria-labelledby="volume-label"
              min={0}
              max={100}
              step={5}
              value={[Math.round(volume * 100)]}
              onValueChange={(value) => player.setVolume(first(value) / 100)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span id="frame-slider-label">Frame</span>
          <span aria-hidden="true" className="tabular-nums">
            {score.frames[0]?.label} → {score.frames[frameCount - 1]?.label}
          </span>
        </div>
        <Slider
          aria-labelledby="frame-slider-label"
          min={1}
          max={Math.max(1, frameCount)}
          step={1}
          value={[frame + 1]}
          onValueChange={(value) => player.seek(first(value) - 1)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="grid gap-1.5">
          <span id="mode-label" className="text-xs text-muted-foreground">
            Listening mode
          </span>
          <ToggleGroup
            aria-labelledby="mode-label"
            variant="outline"
            spacing={0}
            value={[mode]}
            onValueChange={(value) => {
              const next = value[0] as ModeId | undefined;
              if (next) onModeChange(next);
            }}
          >
            {MODE_IDS.map((id, i) => (
              <Tooltip key={id}>
                <TooltipTrigger render={<ToggleGroupItem value={id} aria-keyshortcuts={String(i + 1)} className="px-3" />}>
                  {MODE_LABELS[id]}
                </TooltipTrigger>
                <TooltipContent>
                  {MODE_HINTS[id]} ({i + 1})
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </div>
        <div className="grid gap-1.5">
          <span id="preset-label" className="text-xs text-muted-foreground">
            Sound
          </span>
          <ToggleGroup
            aria-labelledby="preset-label"
            variant="outline"
            spacing={0}
            value={[preset]}
            onValueChange={(value) => {
              const next = value[0] as PresetId | undefined;
              if (next) onPresetChange(next);
            }}
          >
            {PRESET_IDS.map((id) => (
              <ToggleGroupItem key={id} value={id} aria-keyshortcuts="C" className="px-3">
                {PRESET_LABELS[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {exploring ? (
          <p className="text-xs text-muted-foreground">Playback pauses in Explore mode. Move over the map to hear it.</p>
        ) : null}
      </div>
    </section>
  );
}
