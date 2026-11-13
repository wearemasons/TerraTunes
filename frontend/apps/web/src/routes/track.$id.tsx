import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";

import { player } from "@/audio/player";
import { ExploreReadout, readoutText } from "@/features/player/explore-readout";
import { type Cell, cellValue, FrameStage } from "@/features/player/frame-stage";
import { InfoTabs } from "@/features/player/info-tabs";
import { Legend } from "@/features/player/legend";
import { TensionTimeline } from "@/features/player/tension-timeline";
import { Transport } from "@/features/player/transport";
import { usePlayerShortcuts } from "@/features/player/use-player-shortcuts";
import { useTrackPlayer } from "@/features/player/use-track-player";
import { announce } from "@/lib/a11y/announce";
import { frameImageQuery, gridQuery, scoreQuery, trackQuery } from "@/lib/api/queries";
import { NotFoundError } from "@/lib/api/source";
import { MODE_IDS, type ModeId, PRESET_IDS, type PresetId, THEME_LABELS } from "@/lib/api/types";

interface TrackSearch {
  mode?: ModeId;
  preset?: PresetId;
  frame?: number;
}

export const Route = createFileRoute("/track/$id")({
  validateSearch: (search: Record<string, unknown>): TrackSearch => {
    const result: TrackSearch = {};
    if (MODE_IDS.includes(search.mode as ModeId) && search.mode !== "scan") result.mode = search.mode as ModeId;
    if (PRESET_IDS.includes(search.preset as PresetId) && search.preset !== "musical") result.preset = search.preset as PresetId;
    const frame = Number(search.frame);
    if (Number.isInteger(frame) && frame > 1) result.frame = frame;
    return result;
  },
  loaderDeps: ({ search }) => ({ preset: search.preset ?? "musical" }),
  loader: async ({ context, params, deps }) => {
    try {
      const [track] = await Promise.all([
        context.queryClient.ensureQueryData(trackQuery(params.id)),
        context.queryClient.ensureQueryData(scoreQuery(params.id, deps.preset)),
      ]);
      return { title: track.title };
    } catch (error) {
      if (error instanceof NotFoundError) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} · TeraTones` : "TeraTones" }] }),
  pendingComponent: TrackPending,
  component: TrackPage,
});

function TrackPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const mode: ModeId = search.mode ?? "scan";
  const preset: PresetId = search.preset ?? "musical";
  const navigate = useNavigate({ from: "/track/$id" });

  const { data: track } = useSuspenseQuery(trackQuery(id));
  const { data: score } = useSuspenseQuery(scoreQuery(id, preset));
  const snapshot = useTrackPlayer({ track, score, mode, preset, initialFrame: (search.frame ?? 1) - 1 });
  const frameIndex = snapshot.trackId === id ? snapshot.frame : Math.max(0, (search.frame ?? 1) - 1);
  const frame = score.frames[frameIndex];

  const grid = useQuery({ ...gridQuery(id, frameIndex), placeholderData: (prev) => prev });
  const image = useQuery(frameImageQuery(id, frameIndex));
  const [cursor, setCursor] = useState<Cell | null>(null);

  const setMode = useCallback(
    (next: ModeId) => void navigate({ search: (prev) => ({ ...prev, mode: next === "scan" ? undefined : next }), replace: true, resetScroll: false }),
    [navigate],
  );
  const setPreset = useCallback(
    (next: PresetId) => void navigate({ search: (prev) => ({ ...prev, preset: next === "musical" ? undefined : next }), replace: true, resetScroll: false }),
    [navigate],
  );
  usePlayerShortcuts({ track, score, preset, onModeChange: setMode, onPresetChange: setPreset });

  const onCursorChange = (cell: Cell, source: "keyboard" | "pointer") => {
    setCursor(cell);
    if (!grid.data) return;
    void player.probe(cellValue(grid.data, cell), (cell.col + 0.5) / grid.data.cols);
    if (source === "keyboard") announce(readoutText(grid.data, cell, track.legend));
  };

  const readValue = () => announce(readoutText(grid.data, cursor, track.legend), { assertive: true });

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 pb-16">
      <div className="grid gap-3">
        <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "w-fit" })}>
          <ArrowLeft data-icon="inline-start" />
          All tracks
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{THEME_LABELS[track.theme]}</Badge>
          <Badge variant="outline">{track.date_range}</Badge>
          {track.synthetic ? <Badge variant="ghost">Demo data</Badge> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{track.title}</h1>
        <p className="max-w-3xl text-base text-pretty text-muted-foreground">{track.summary}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card className="gap-4 py-0">
            <FrameStage
              grid={grid.data}
              legend={track.legend}
              imageUrl={image.data ?? null}
              frame={frame}
              mode={mode}
              cursor={cursor}
              onCursorChange={onCursorChange}
              onReadValue={readValue}
              readoutId="explore-readout"
            />
            <CardContent className="grid gap-4 pb-4">
              <Legend legend={track.legend} rootMidi={score.key.root_midi} />
              {mode === "explore" ? <ExploreReadout id="explore-readout" grid={grid.data} cell={cursor} legend={track.legend} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Transport score={score} mode={mode} preset={preset} onModeChange={setMode} onPresetChange={setPreset} />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>
                <h2 className="text-sm">Change over time</h2>
              </CardTitle>
              <CardDescription>Bars show how fast the picture changes; the line shows the average value.</CardDescription>
            </CardHeader>
            <CardContent>
              <TensionTimeline score={score} legend={track.legend} frame={frameIndex} />
            </CardContent>
          </Card>
        </div>

        <Card className="content-start self-start lg:sticky lg:top-4">
          <CardContent>
            <h2 className="sr-only">Track details</h2>
            <InfoTabs track={track} score={score} frame={frameIndex} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrackPending() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
      <h1 className="sr-only">Loading track</h1>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="aspect-[2/1] w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
