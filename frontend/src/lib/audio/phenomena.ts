/** Visual-scene metadata retained by the illustrated UI.
 * Playback lives exclusively in src/main-engine/audio/player.ts on this branch.
 */
export type InstrumentId = "bass" | "harp" | "flute";
export interface VoicePart {
  instrument: InstrumentId;
  notes: number[];
  gains: number[];
  durations: number[];
  values: number[];
  pitch_targets: number[];
}
export interface SpecCell {
  row: number;
  col: number;
  cx: number;
  cy: number;
  brightness: number;
  saturation: number;
  hue: number;
  turbulence: number;
  edges: number;
  gradient: number;
  hot: number;
  green: number;
  water: number;
  white: number;
  dark: number;
  rel?: number;
}
export interface SpecLayer {
  kind: "noise" | "res" | "hit" | "swell" | "tone";
  model: string;
  t0: number;
  dur: number;
  gain: number;
  pan?: number;
  freq?: number;
  q?: number;
  gust?: number;
}
export interface Spec {
  model:
    | "wind"
    | "storm"
    | "fire"
    | "ocean"
    | "city"
    | "canopy"
    | "plume"
    | "space";
  title: string;
  duration: number;
  layers: SpecLayer[];
  mapping: string;
  explain: string;
  grid: { cols: number; rows: number; cells: SpecCell[] };
  frame_stats: Record<string, number>;
  drop_count?: number;
  crackle_count?: number;
  audioUrl?: string;
  terraDetail?: import("../types").TerraTrackDetail;
  terraScore?: import("../types").TerraScore;
  voices?: VoicePart[];
  colorWaves?: { cool: number[]; mid: number[]; hot: number[]; peak: number[] };
}
export interface PlaySnapshot {
  playing: boolean;
  position: number;
  duration: number;
  level: number;
}
