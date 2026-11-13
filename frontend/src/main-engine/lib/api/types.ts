// Types mirroring docs/API_CONTRACT.md. Backend Pydantic schemas are the source of truth;
// replace this file with generated types (openapi-typescript) once the backend exists.

export const THEME_IDS = [
  "sea_level",
  "air_quality",
  "wildfires",
  "greenhouse_gases",
  "water",
  "agriculture",
  "biodiversity",
  "energy",
  "disasters",
  "weather",
  "ocean",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  sea_level: "Sea level",
  air_quality: "Air quality",
  wildfires: "Wildfires",
  greenhouse_gases: "Greenhouse gases",
  water: "Water",
  agriculture: "Agriculture",
  biodiversity: "Biodiversity",
  energy: "Energy",
  disasters: "Disasters",
  weather: "Weather",
  ocean: "Oceans",
};

export const PRESET_IDS = ["orchestra", "clear", "musical"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** What a track plays when the URL does not say: the Clear tone's notes on real instruments. */
export const DEFAULT_PRESET: PresetId = "orchestra";

export const PRESET_LABELS: Record<PresetId, string> = {
  orchestra: "Orchestra",
  clear: "Clear tone",
  musical: "Musical",
};

export const MODE_IDS = ["scan", "overview", "explore"] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const MODE_LABELS: Record<ModeId, string> = {
  scan: "Scan",
  overview: "Overview",
  explore: "Explore",
};

/** One colorbar anchor: a data value and the colour the source visualization uses for it. */
export interface LegendAnchor {
  /** Normalized position 0..1 along the colorbar. */
  position: number;
  rgb: [number, number, number];
}

/** A labelled colorbar stop: position along the bar → real value. */
export interface LegendTick {
  position: number;
  value: number;
  label?: string | null;
}

export interface Legend {
  label: string;
  unit: string;
  min: number;
  max: number;
  anchors: LegendAnchor[];
  /** When present, values follow these stops (linear, or logarithmic when `log`); else min..max linear. */
  ticks?: LegendTick[];
  log?: boolean;
}

export interface TrackSummary {
  id: string;
  title: string;
  theme: ThemeId;
  summary: string;
  date_range: string;
  frame_count: number;
  duration_s: number;
  thumbnail_url: string | null;
  credit: string;
  source_url: string | null;
  calibrated: boolean;
  /** True when frames are generated demo fields, not NASA imagery. */
  synthetic: boolean;
}

export interface TranscriptEntry {
  /** Frame index the entry refers to. */
  frame: number;
  text: string;
}

export interface TrackDetail extends TrackSummary {
  description: string;
  audio_key: string;
  legend: Legend;
  presets: PresetId[];
  frame_labels: string[];
  transcript: TranscriptEntry[];
}

export interface Hotspot {
  /** 0..1, west to east. */
  x: number;
  /** 0..1, north to south. */
  y: number;
  note: number;
  strength: number;
}

export interface FrameStats {
  mean: number;
  min: number;
  max: number;
  extreme_share: number;
}
export interface FrameLayers {
  intensity: number;
  column_intensity: number[];
  band_intensity: Record<string, number>;
  band_peak_value: Record<string, number | null>;
  coverage: number;
  alerts: { label: string; value: number; x: number; y: number; region: string; share: number; new: boolean }[];
  regions: { region: string; where: string; value: number; x: number; y: number }[];
}

export interface FrameScore {
  index: number;
  label: string;
  tension: number;
  loudness: number;
  brightness: number;
  /** Rhythm hits per beat: 1, 2 or 4. */
  rhythm_density: number;
  /** MIDI note per scan step, west to east. -1 = silent (no data). */
  column_notes: number[];
  hotspot: Hotspot | null;
  stats: FrameStats;
  description: string;
  /** Optional calibrated analysis metadata; older main scores omit it. */
  layers?: FrameLayers | null;
}

export interface ScoreKey {
  root: string;
  root_midi: number;
  scale: string;
  bpm: number;
}
export interface SoundInfo {
  phenomenon: string;
  description: string;
  listening_guide: string;
  thresholds: { value: number; label: string; above: boolean }[];
  render_url: string | null;
}

export interface Score {
  mapping_version: string;
  track_id: string;
  preset: PresetId;
  key: ScoreKey;
  grid: { cols: number; rows: number };
  steps_per_frame: number;
  frames: FrameScore[];
  sound?: SoundInfo | null;
}

/** Normalized values 0..250 per cell, row-major north→south; 255 = no data. */
export interface ValueGrid {
  cols: number;
  rows: number;
  cells: Uint8Array;
  real_min: number;
  real_max: number;
  unit: string;
}

export const NO_DATA = 255;
export const GRID_MAX = 250;
