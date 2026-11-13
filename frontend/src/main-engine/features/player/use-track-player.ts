import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { player } from "@main/audio/player";
import { usePlayer } from "@main/audio/use-player";
import { announce } from "@main/lib/a11y/announce";
import { gridQuery } from "@main/lib/api/queries";
import type { ModeId, PresetId, Score, TrackDetail } from "@main/lib/api/types";
import { getPrefs } from "@main/lib/prefs";

/** Connects a track page to the global player: loading, URL-driven settings, prefetch and announcements. */
export function useTrackPlayer(args: { track: TrackDetail; score: Score; mode: ModeId; preset: PresetId; initialFrame: number }) {
  const { track, score, mode, preset, initialFrame } = args;
  const snapshot = usePlayer();
  const queryClient = useQueryClient();
  const lastStatus = useRef(snapshot.status);
  const lastFrame = useRef(snapshot.frame);

  // Preset first so load() picks the right timbre.
  useEffect(() => {
    player.setPreset(preset);
  }, [preset]);

  useEffect(() => {
    player.load({ trackId: track.id, score, theme: track.theme, frame: initialFrame });
    // initialFrame only matters on first load of a track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.theme, score]);

  useEffect(() => {
    player.setMode(mode);
  }, [mode]);

  // Announce the track once it's ready.
  useEffect(() => {
    announce(`${track.title} loaded. ${track.frame_count} frames. Press Space or the Play button to listen, K for the audio key.`, { force: true });
  }, [track.id, track.title, track.frame_count]);

  // Prefetch the next few frames so visuals never wait.
  useEffect(() => {
    for (let i = 1; i <= 3; i++) {
      const next = snapshot.frame + i;
      if (next < track.frame_count) void queryClient.prefetchQuery(gridQuery(track.id, next));
    }
  }, [snapshot.frame, track.id, track.frame_count, queryClient]);

  // Status and frame announcements.
  useEffect(() => {
    const prevStatus = lastStatus.current;
    const prevFrame = lastFrame.current;
    lastStatus.current = snapshot.status;
    lastFrame.current = snapshot.frame;
    const frame = score.frames[snapshot.frame];
    if (!frame) return;

    if (prevStatus !== snapshot.status) {
      if (snapshot.status === "playing") announce(`Playing from ${frame.label}.`, { force: true });
      else if (snapshot.status === "paused") announce(`Paused at ${frame.label}.`, { force: true });
      else if (snapshot.status === "ended") announce("Track finished. Press Play to hear it again.", { force: true });
      return;
    }
    if (prevFrame !== snapshot.frame) {
      if (snapshot.status !== "playing") announce(frame.description);
      else if (getPrefs().announceFrames) announce(frame.label);
    }
  }, [snapshot.status, snapshot.frame, score]);

  return snapshot;
}
