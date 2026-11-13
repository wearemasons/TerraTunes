import type { Dataset } from "../lib/types";
import type { Spec } from "../lib/audio/phenomena";
import { MainDeck } from "./main-deck";

/**
 * Parent-compatible adapter for the current jukebox route. MainDeck owns only
 * presentation and main-player controls; player load/settings lifecycle stays in
 * the parent route as requested.
 */
export function NowPlaying(props: {
  dataset: Dataset;
  spec: Spec | null;
  loading: boolean;
  playing: boolean;
  progress?: number;
  onToggle: () => void;
}) {
  return <MainDeck {...props} />;
}
