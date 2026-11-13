import { AspectRatio } from "@my-better-t-app/ui/components/aspect-ratio";
import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";

import { FrameCanvas } from "@/features/visuals/frame-canvas";
import { gridQuery, trackQuery } from "@/lib/api/queries";
import { THEME_LABELS, type TrackSummary } from "@/lib/api/types";
import { formatDuration, formatDurationSpoken } from "@/lib/format";

function Thumbnail({ track }: { track: TrackSummary }) {
  const detail = useQuery({ ...trackQuery(track.id), enabled: !track.thumbnail_url });
  const grid = useQuery({ ...gridQuery(track.id, track.frame_count - 1), enabled: !track.thumbnail_url });

  if (track.thumbnail_url) {
    return <img src={track.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />;
  }
  if (!detail.data || !grid.data) return <Skeleton className="absolute inset-0" />;
  return <FrameCanvas grid={grid.data} legend={detail.data.legend} />;
}

export function TrackCard({ track, index }: { track: TrackSummary; index: number }) {
  const titleId = `track-${track.id}-title`;
  return (
    <Card className="relative h-full gap-0 py-0 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:ring-foreground/30">
      <AspectRatio ratio={2} className="overflow-hidden bg-muted">
        <Thumbnail track={track} />
        <Badge variant="secondary" className="absolute top-2 left-2 font-mono" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </Badge>
      </AspectRatio>
      <CardHeader className="gap-2 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{THEME_LABELS[track.theme]}</Badge>
          {track.synthetic ? <Badge variant="ghost">Demo data</Badge> : null}
        </div>
        <CardTitle className="text-base">
          <h2 id={titleId}>
            <Link
              to="/track/$id"
              params={{ id: track.id }}
              className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
            >
              {track.title}
            </Link>
          </h2>
        </CardTitle>
        <CardDescription className="text-sm">{track.summary}</CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto flex items-center justify-between gap-2 border-t py-3">
        <span className="text-xs text-muted-foreground">
          {track.date_range} · <span aria-hidden="true">{formatDuration(track.duration_s)}</span>
          <span className="sr-only">{formatDurationSpoken(track.duration_s)}</span>
        </span>
        <span aria-hidden="true" className={buttonVariants({ size: "sm" })}>
          <Play data-icon="inline-start" />
          Listen
        </span>
      </CardFooter>
    </Card>
  );
}

export function TrackCardSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <AspectRatio ratio={2}>
        <Skeleton className="absolute inset-0" />
      </AspectRatio>
      <CardHeader className="gap-2 py-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
    </Card>
  );
}
