export interface Dataset {
  id: string
  title: string
  short: string
  svs_id: string
  svs_url: string
  year_range: string
  source_frame: string
  credit: string
  dataset_name: string
  sensor: string
  description: string
  accessibility: string
  element: 'storms' | 'wind' | 'fire' | 'ocean' | 'land' | 'space' | string
  model: 'wind' | 'storm' | 'fire' | 'ocean' | 'city' | 'canopy' | 'plume' | 'space'
  series: { asset: string; label: string; frameIndex?: number }[]
  frameCount?: number
}

export type { Spec, SpecCell, SpecLayer, PlaySnapshot } from './audio/phenomena'

export const ELEMENTS = ['storms', 'wind', 'fire', 'ocean', 'land', 'space'] as const
export type Element = (typeof ELEMENTS)[number]

export interface AnalyzeResponse {
  filename: string
  width: number
  height: number
  model: string
  title: string
  explain: string
  duration: number
  layers: import('./audio/phenomena').SpecLayer[]
  /** one line: what the frame measures → what the ear hears */
  mapping: string
  grid: { cols: number; rows: number; cells: import('./audio/phenomena').SpecCell[] }
  frame_stats: Record<string, number>
  voices?: import('./audio/phenomena').VoicePart[]
}

export const ELEMENT_META: Record<string, { label: string; blurb: string }> = {
  storms: { label: 'Storms', blurb: 'Hurricanes and thunderstorms' },
  wind: { label: 'Wind & air', blurb: 'Winds, aerosols, carbon' },
  fire: { label: 'Fire', blurb: 'Wildfire smoke' },
  ocean: { label: 'Ocean', blurb: 'Currents and sea temperature' },
  land: { label: 'Land', blurb: 'Cities and forests' },
  space: { label: 'Space', blurb: "NASA's own sonification method" },
}

/* ---- TerraTunes backend API schema types (backend/app/schemas/models.py) ---- */

export interface TerraLegendTick {
  position: number
  value: number
  label?: string | null
}

export interface TerraLegend {
  label: string
  unit: string
  min: number
  max: number
  anchors: { position: number; rgb: [number, number, number] }[]
  ticks?: TerraLegendTick[]
  log?: boolean
}

export interface TerraTrackSummary {
  id: string
  title: string
  theme: string
  summary: string
  date_range: string
  frame_count: number
  duration_s: number
  thumbnail_url: string | null
  credit: string
  source_url: string | null
  calibrated: boolean
  synthetic: boolean
}

export interface TerraSoundInfo {
  phenomenon: 'rain' | 'wind' | 'fire' | 'surf' | 'biophony' | 'temperature' | 'haze' | 'traffic'
  description: string
  listening_guide: string
  thresholds: { value: number; label: string; above: boolean }[]
  render_url: string | null
}

export interface TerraTrackDetail extends TerraTrackSummary {
  description: string
  audio_key: string
  legend: TerraLegend
  presets: ('musical' | 'clear')[]
  frame_labels: string[]
  transcript: { frame: number; text: string }[]
  sound: TerraSoundInfo | null
}

export interface TerraFrameLayers {
  intensity: number
  column_intensity: number[]
  band_intensity: Record<string, number>
  band_peak_value: Record<string, number | null>
  coverage: number
  alerts: {
    label: string
    value: number
    x: number
    y: number
    region: string
    share: number
    new: boolean
  }[]
  regions: {
    region: string
    where: string
    value: number
    x: number
    y: number
  }[]
}

export interface TerraVoicePart {
  instrument: 'bass' | 'harp' | 'flute'
  notes: number[]
  gains: number[]
  durations: number[]
  values: number[]
  pitch_targets: number[]
}

export interface TerraFrameScore {
  index: number
  label: string
  tension: number
  loudness: number
  brightness: number
  rhythm_density: number
  column_notes: number[]
  /** v15 score: all musical choices are backend-authored; the browser only realises them. */
  voices: TerraVoicePart[]
  chord_name: string
  chord_pcs: number[]
  activity: number[]
  gain_envelope: number[]
  hotspot: { x: number; y: number; note: number; strength: number } | null
  stats: { mean: number; min: number; max: number; extreme_share: number }
  description: string
  layers: TerraFrameLayers | null
}

/** What one voice of the ensemble carries, and when it joins (audio-key material). */
export interface TerraInstrumentInfo {
  instrument: 'bass' | 'harp' | 'flute'
  family: string
  carries: string
  entry: string
  note_range: string
  range_low: number
  range_high: number
}

export interface TerraScore {
  mapping_version: string
  track_id: string
  preset: 'musical' | 'clear'
  seed: number
  chord_progression: string[]
  key: { root: string; root_midi: number; scale: string; bpm: number }
  grid: { cols: number; rows: number }
  steps_per_frame: number
  instruments: TerraInstrumentInfo[]
  frames: TerraFrameScore[]
  sound: TerraSoundInfo | null
}

export interface TerraGridResponse {
  cols: number
  rows: number
  cells_b64: string
  real_min: number
  real_max: number
  unit: string
}
