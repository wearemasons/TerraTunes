import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button } from "@my-better-t-app/ui/components/button";
import { ScrollArea } from "@my-better-t-app/ui/components/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@my-better-t-app/ui/components/tabs";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { ExternalLink } from "lucide-react";

import { player } from "@/audio/player";
import type { Score, TrackDetail } from "@/lib/api/types";

import { PitchContour } from "./pitch-contour";

export function InfoTabs({ track, score, frame }: { track: TrackDetail; score: Score; frame: number }) {
  const current = score.frames[frame];

  return (
    <Tabs defaultValue="now" className="gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="now">Now playing</TabsTrigger>
        <TabsTrigger value="key">Audio key</TabsTrigger>
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>

      <TabsContent value="now" className="grid gap-4">
        {current ? (
          <>
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">{current.label}</h3>
              <p className="text-sm leading-relaxed">{current.description}</p>
            </div>
            <PitchContour score={score} frame={current} />
          </>
        ) : null}
      </TabsContent>

      <TabsContent value="key" className="grid gap-3">
        <h3 className="text-sm font-semibold">How to listen to this track</h3>
        <p className="text-sm leading-relaxed">{track.audio_key}</p>
        <p className="text-xs text-muted-foreground">
          Key of {score.key.root} {score.key.scale}, {score.key.bpm} beats per minute. Press K anywhere on this page to hear this
          read aloud by your screen reader.
        </p>
      </TabsContent>

      <TabsContent value="transcript">
        <h3 className="sr-only">Transcript of key moments</h3>
        <ScrollArea className="h-72 pr-3">
          <ol className="grid gap-1">
            {track.transcript.map((entry) => {
              const active = entry.frame === frame;
              const label = score.frames[entry.frame]?.label ?? `Frame ${entry.frame + 1}`;
              return (
                <li key={`${entry.frame}-${entry.text}`}>
                  <Button
                    variant="ghost"
                    className={cn("h-auto w-full justify-start gap-3 py-2 text-left whitespace-normal", active && "bg-muted")}
                    aria-current={active ? "step" : undefined}
                    onClick={() => player.seek(entry.frame)}
                  >
                    <Badge variant={active ? "default" : "outline"} className="shrink-0 font-mono">
                      {label}
                    </Badge>
                    <span className="text-sm font-normal">
                      {entry.text}
                      <span className="sr-only"> Go to this frame.</span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="about" className="grid gap-3">
        <h3 className="text-sm font-semibold">About this visualization</h3>
        <p className="text-sm leading-relaxed">{track.description}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{track.date_range}</Badge>
          <Badge variant="outline">{track.frame_count} frames</Badge>
          {track.calibrated ? <Badge variant="secondary">Calibrated to colorbar</Badge> : <Badge variant="destructive">Artistic mapping</Badge>}
          {track.synthetic ? <Badge variant="ghost">Demo data</Badge> : null}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{track.credit}</p>
        {track.source_url ? (
          <a
            href={track.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
          >
            View the original visualization
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
