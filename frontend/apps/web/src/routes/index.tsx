import { Alert, AlertDescription, AlertTitle } from "@my-better-t-app/ui/components/alert";
import { Badge } from "@my-better-t-app/ui/components/badge";
import { buttonVariants } from "@my-better-t-app/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@my-better-t-app/ui/components/empty";
import { ToggleGroup, ToggleGroupItem } from "@my-better-t-app/ui/components/toggle-group";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Headphones, Info, Keyboard, Play } from "lucide-react";
import { z } from "zod";

import { TrackCard, TrackCardSkeleton } from "@/features/jukebox/track-card";
import { sourceQuery, tracksQuery } from "@/lib/api/queries";
import { THEME_IDS, THEME_LABELS, type ThemeId } from "@/lib/api/types";
import { setUi } from "@/lib/ui-store";

const themeSchema = z.enum(THEME_IDS);

interface JukeboxSearch {
  theme?: ThemeId;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): JukeboxSearch => {
    const parsed = themeSchema.safeParse(search.theme);
    return parsed.success ? { theme: parsed.data } : {};
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(tracksQuery()),
  pendingComponent: JukeboxPending,
  component: JukeboxPage,
});

function Hero({ firstTrackId }: { firstTrackId: string | undefined }) {
  return (
    <section aria-labelledby="page-title" className="grid gap-5 py-8 sm:py-12">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">NASA Space Apps 2026</Badge>
        <Badge variant="ghost">The Earth Information Jukebox</Badge>
      </div>
      <h1 id="page-title" className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Hear the planet change.
      </h1>
      <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
        Pick a NASA Earth visualization and listen to it. Every note comes from the data in the frame: higher pitch for higher
        values, a sweep from west to east, tension when the picture changes fast.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {firstTrackId ? (
          <Link to="/track/$id" params={{ id: firstTrackId }} className={buttonVariants({ size: "lg" })}>
            <Play data-icon="inline-start" />
            Start listening
          </Link>
        ) : null}
        <Link to="/about" className={buttonVariants({ variant: "outline", size: "lg" })}>
          How it works
        </Link>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Highlights">
        <li className="flex items-center gap-1.5">
          <Headphones className="size-3.5" aria-hidden="true" /> Best with headphones: position is in stereo
        </li>
        <li className="flex items-center gap-1.5">
          <Keyboard className="size-3.5" aria-hidden="true" />
          <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => setUi({ shortcutsOpen: true })}>
            Fully keyboard operable
          </button>
        </li>
      </ul>
    </section>
  );
}

function DemoNotice() {
  const { data } = useQuery(sourceQuery());
  if (data !== "demo") return null;
  return (
    <Alert className="mb-6">
      <Info aria-hidden="true" />
      <AlertTitle>Playing demo tracks</AlertTitle>
      <AlertDescription>
        The backend isn't connected, so these tracks use synthetic, Earth-like data generated in your browser. The sound rules
        are the same ones used for real NASA frames.
      </AlertDescription>
    </Alert>
  );
}

function JukeboxPage() {
  const { theme = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const { data: tracks } = useSuspenseQuery(tracksQuery());
  const themesPresent = THEME_IDS.filter((id) => tracks.some((t) => t.theme === id));
  const visible = theme === "all" ? tracks : tracks.filter((t) => t.theme === theme);

  const setTheme = (next: "all" | ThemeId) => {
    void navigate({ search: next === "all" ? {} : { theme: next }, replace: true, resetScroll: false });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <Hero firstTrackId={tracks[0]?.id} />
      <DemoNotice />

      <section aria-labelledby="tracks-heading" className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="tracks-heading" className="text-xl font-semibold tracking-tight">
              Tracks
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {visible.length} of {tracks.length} tracks{theme === "all" ? "" : ` about ${THEME_LABELS[theme].toLowerCase()}`}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <span id="theme-filter-label" className="text-xs font-medium text-muted-foreground">
            Filter by Earth theme
          </span>
          <ToggleGroup
            aria-labelledby="theme-filter-label"
            variant="outline"
            size="sm"
            spacing={1}
            className="flex-wrap"
            value={[theme]}
            onValueChange={(value) => {
              const next = value[0] as "all" | ThemeId | undefined;
              if (next) setTheme(next);
            }}
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {themesPresent.map((id) => (
              <ToggleGroupItem key={id} value={id}>
                {THEME_LABELS[id]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {visible.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No tracks for this theme yet</EmptyTitle>
              <EmptyDescription>Choose another theme or show all tracks.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((track) => (
              <li key={track.id}>
                <TrackCard track={track} index={tracks.indexOf(track)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function JukeboxPending() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="sr-only">Loading tracks</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <TrackCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
