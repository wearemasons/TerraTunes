// Demo-only port of the mapping rules in docs/SONIFICATION_DESIGN.md.
// In production the backend (backend/app/mapping) is the single source of truth and the
// frontend only consumes the score. Keep this file in sync with that doc while mocks are used.

import type { FrameScore, Legend, Score, ThemeId, TranscriptEntry, ValueGrid } from "@/lib/api/types";
import { GRID_MAX, NO_DATA } from "@/lib/api/types";
import { describeRegion, formatSigned, formatValue, lowerFirst, midiToName } from "@/lib/format";
import { legendValue } from "@/lib/legend";

export const MAPPING_VERSION = "demo-1";
export const STEPS_PER_FRAME = 16;
const ROOT_MIDI = 50; // D3

const SCALES: Record<string, number[]> = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  whole_tone: [0, 2, 4, 6, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  major_pentatonic: [0, 2, 4, 7, 9],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
};

export const THEME_KEY: Record<ThemeId, { scale: keyof typeof SCALES; bpm: number }> = {
  sea_level: { scale: "dorian", bpm: 66 },
  air_quality: { scale: "minor_pentatonic", bpm: 72 },
  wildfires: { scale: "phrygian", bpm: 84 },
  greenhouse_gases: { scale: "whole_tone", bpm: 60 },
  water: { scale: "lydian", bpm: 70 },
  agriculture: { scale: "major_pentatonic", bpm: 80 },
  biodiversity: { scale: "major_pentatonic", bpm: 76 },
  energy: { scale: "mixolydian", bpm: 92 },
  disasters: { scale: "phrygian_dominant", bpm: 88 },
  weather: { scale: "mixolydian", bpm: 76 },
  ocean: { scale: "dorian", bpm: 64 },
};

export function scaleLadder(scale: string): number[] {
  const intervals = SCALES[scale] ?? SCALES.dorian ?? [0];
  const ladder: number[] = [];
  for (let octave = 0; octave < 3; octave++) {
    for (const iv of intervals) ladder.push(ROOT_MIDI + octave * 12 + iv);
  }
  ladder.push(ROOT_MIDI + 36);
  return ladder;
}

/** Monotonic: a higher value never gives a lower note. */
export function quantize(value01: number, ladder: number[]): number {
  const i = Math.round(Math.min(1, Math.max(0, value01)) * (ladder.length - 1));
  return ladder[i] ?? ROOT_MIDI;
}

export const toReal = legendValue;

export function frameDurationSeconds(bpm: number): number {
  return STEPS_PER_FRAME * (60 / bpm / 2);
}

export function audioKeyText(legend: Legend): string {
  return [
    `Pitch shows ${lowerFirst(legend.label)} in ${legend.unit}: the lowest notes mean ${formatValue(legend.min)} and the highest mean ${formatValue(legend.max)}.`,
    "The sweep moves west to east across the map, one note per slice.",
    "Louder and brighter sound means more of the map has high values.",
    "Faster rhythm means a more varied, detailed picture.",
    "Clashing, tense notes mean the picture changed quickly since the previous frame.",
    "A bell marks the strongest hot spot, placed left or right to match where it is.",
    "Silence means no data, for example land on an ocean map.",
  ].join(" ");
}

interface FrameAnalysis {
  values: number[];
  mean: number;
  min: number;
  max: number;
  argmax: number;
  std: number;
}

function analyse(grid: ValueGrid): FrameAnalysis {
  const values: number[] = [];
  let sum = 0;
  let min = 1;
  let max = 0;
  let argmax = 0;
  grid.cells.forEach((cell, i) => {
    if (cell === NO_DATA) return;
    const v = cell / GRID_MAX;
    values.push(v);
    sum += v;
    if (v < min) min = v;
    if (v > max) {
      max = v;
      argmax = i;
    }
  });
  const mean = values.length ? sum / values.length : 0;
  const variance = values.length ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length : 0;
  return { values, mean, min: values.length ? min : 0, max, argmax, std: Math.sqrt(variance) };
}

function columnNotes(grid: ValueGrid, ladder: number[]): number[] {
  const block = grid.cols / STEPS_PER_FRAME;
  const notes: number[] = [];
  for (let step = 0; step < STEPS_PER_FRAME; step++) {
    let sum = 0;
    let count = 0;
    let max = 0;
    const c0 = Math.floor(step * block);
    const c1 = Math.floor((step + 1) * block);
    for (let c = c0; c < c1; c++) {
      for (let r = 0; r < grid.rows; r++) {
        const cell = grid.cells[r * grid.cols + c] ?? NO_DATA;
        if (cell === NO_DATA) continue;
        const v = cell / GRID_MAX;
        sum += v;
        count++;
        if (v > max) max = v;
      }
    }
    notes.push(count === 0 ? -1 : quantize(0.5 * (sum / count) + 0.5 * max, ladder));
  }
  return notes;
}

function tensionBetween(a: ValueGrid, b: ValueGrid | null): number {
  if (!b) return 0;
  let diff = 0;
  let count = 0;
  for (let i = 0; i < a.cells.length; i++) {
    const x = a.cells[i] ?? NO_DATA;
    const y = b.cells[i] ?? NO_DATA;
    if (x === NO_DATA || y === NO_DATA) continue;
    diff += Math.abs(x - y) / GRID_MAX;
    count++;
  }
  return count ? Math.min(1, (diff / count) * 8) : 0;
}

export function buildScore(args: {
  trackId: string;
  theme: ThemeId;
  legend: Legend;
  labels: string[];
  grids: ValueGrid[];
  preset: Score["preset"];
}): Score {
  const { trackId, theme, legend, labels, grids, preset } = args;
  const key = THEME_KEY[theme];
  const ladder = scaleLadder(key.scale);
  const first = grids[0];
  const cols = first?.cols ?? 0;
  const rows = first?.rows ?? 0;
  const startMean = first ? analyse(first).mean : 0;

  const frames: FrameScore[] = grids.map((grid, index) => {
    const a = analyse(grid);
    const label = labels[index] ?? `Frame ${index + 1}`;
    const extremeShare = a.values.length ? a.values.filter((v) => v >= 0.8).length / a.values.length : 0;
    const hx = ((a.argmax % cols) + 0.5) / cols;
    const hy = (Math.floor(a.argmax / cols) + 0.5) / rows;
    const hotspot =
      a.max >= 0.72 && a.max - a.mean >= 0.25
        ? { x: hx, y: hy, note: quantize(a.max, ladder) + 12, strength: Math.min(1, a.max - a.mean) }
        : null;
    const unit = legend.unit;
    const change = toReal(a.mean, legend) - toReal(startMean, legend);
    const parts = [
      `${label}. ${legend.label} averages ${formatValue(toReal(a.mean, legend))} ${unit}, ranging from ${formatValue(toReal(a.min, legend))} to ${formatValue(toReal(a.max, legend))}.`,
      hotspot ? `The strongest values are in the ${describeRegion(hotspot.x, hotspot.y)}.` : "",
      index > 0 ? `Change since the first frame: ${formatSigned(change)} ${unit}.` : "",
    ];
    return {
      index,
      label,
      tension: tensionBetween(grid, grids[index - 1] ?? null),
      loudness: Math.min(1, 0.3 + 0.5 * extremeShare + 0.3 * a.mean),
      brightness: a.mean,
      rhythm_density: a.std < 0.08 ? 1 : a.std < 0.18 ? 2 : 4,
      column_notes: columnNotes(grid, ladder),
      hotspot,
      stats: { mean: a.mean, min: a.min, max: a.max, extreme_share: extremeShare },
      description: parts.filter(Boolean).join(" "),
    };
  });

  return {
    mapping_version: MAPPING_VERSION,
    track_id: trackId,
    preset,
    key: { root: midiToName(ROOT_MIDI), root_midi: ROOT_MIDI, scale: key.scale.replace("_", " "), bpm: key.bpm },
    grid: { cols, rows },
    steps_per_frame: STEPS_PER_FRAME,
    frames,
  };
}

export function buildTranscript(score: Score, legend: Legend): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const { frames } = score;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) return entries;
  const real = (v: number) => toReal(v, legend);

  const sounding = first.column_notes.filter((n) => n >= 0);
  const range = sounding.length
    ? ` Melody from ${midiToName(Math.min(...sounding))} to ${midiToName(Math.max(...sounding))}.`
    : "";
  entries.push({
    frame: 0,
    text: `Starts at ${first.label}: average ${formatValue(real(first.stats.mean))} ${legend.unit}.${range}`,
  });

  let maxTension = first;
  frames.forEach((frame, i) => {
    const prev = frames[i - 1];
    if (frame.hotspot && (!prev || !prev.hotspot)) {
      entries.push({
        frame: i,
        text: `${frame.label}: a hot spot appears in the ${describeRegion(frame.hotspot.x, frame.hotspot.y)}. Listen for the bell.`,
      });
    }
    if (!frame.hotspot && prev?.hotspot) {
      entries.push({ frame: i, text: `${frame.label}: the hot spot fades; the bell stops.` });
    }
    if (frame.tension > maxTension.tension) maxTension = frame;
  });

  if (maxTension.index > 0 && maxTension.tension > 0.12) {
    entries.push({
      frame: maxTension.index,
      text: `${maxTension.label}: the fastest change in the track. Notes clash and the tempo pushes forward.`,
    });
  }

  const change = real(last.stats.mean) - real(first.stats.mean);
  entries.push({
    frame: last.index,
    text: `Ends at ${last.label}: average ${formatValue(real(last.stats.mean))} ${legend.unit}, ${formatSigned(change)} ${legend.unit} since the start.`,
  });

  return entries.sort((a, b) => a.frame - b.frame);
}
