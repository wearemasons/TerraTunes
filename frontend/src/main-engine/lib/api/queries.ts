import { queryOptions } from "@tanstack/react-query";

import { getSource } from "./source";
import type { PresetId } from "./types";

// Curated tracks are immutable per mapping_version, so nothing ever goes stale in a session.
const forever = { staleTime: Number.POSITIVE_INFINITY, gcTime: 30 * 60 * 1000 } as const;

export const sourceQuery = () =>
  queryOptions({
    queryKey: ["source"],
    queryFn: async () => (await getSource()).kind,
    ...forever,
  });

export const tracksQuery = () =>
  queryOptions({
    queryKey: ["tracks"],
    queryFn: async () => (await getSource()).listTracks(),
    ...forever,
  });

export const trackQuery = (id: string) =>
  queryOptions({
    queryKey: ["track", id],
    queryFn: async () => (await getSource()).getTrack(id),
    ...forever,
  });

export const scoreQuery = (id: string, preset: PresetId) =>
  queryOptions({
    queryKey: ["score", id, preset],
    queryFn: async () => (await getSource()).getScore(id, preset),
    ...forever,
  });

export const gridQuery = (id: string, frame: number) =>
  queryOptions({
    queryKey: ["grid", id, frame],
    queryFn: async () => (await getSource()).getGrid(id, frame),
    ...forever,
  });

export const frameImageQuery = (id: string, frame: number) =>
  queryOptions({
    queryKey: ["frame-image", id, frame],
    queryFn: async () => (await getSource()).frameImageUrl(id, frame),
    ...forever,
  });
