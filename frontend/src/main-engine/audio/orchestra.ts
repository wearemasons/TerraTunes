// The "Orchestra" sound: the Clear tone, note for note, played by a real recorded instrument, with an
// orchestral section underneath that harmonises with it.
//
// Accuracy rule: the lead plays exactly the score's notes, at exactly the Clear tone's times, pans and
// re-strike rule. Nothing here changes a pitch the data chose. The section (bass, pad, texture) only
// adds harmony chosen FROM those notes, quieter, so the lead stays the line you follow.
//
// Instruments: VSCO-2 Community Edition (CC0), prepared by `python -m app.cli samples` and served
// by the API at /samples. Without them (demo mode, offline) the lead falls back to the Clear sine.

import type { ThemeId } from "@main/lib/api/types";

import type { AudioEngine } from "./engine";

export type InstrumentId =
  | "flute" | "oboe" | "clarinet" | "bassoon"
  | "horn" | "trumpet" | "tuba"
  | "violins" | "violin_trem" | "violin_spic" | "violin_pizz" | "violas" | "cello" | "cello_pizz" | "contrabass"
  | "harp" | "marimba" | "glock";

export const INSTRUMENT_NAMES: Record<InstrumentId, string> = {
  flute: "flute", oboe: "oboe", clarinet: "clarinet", bassoon: "bassoon",
  horn: "French horn", trumpet: "trumpet", tuba: "tuba",
  violins: "violins", violin_trem: "trembling violins", violin_spic: "staccato violins",
  violin_pizz: "plucked violins", violas: "violas", cello: "cellos", cello_pizz: "plucked cellos",
  contrabass: "double bass", harp: "harp", marimba: "marimba", glock: "glockenspiel",
};

/** How the texture voice moves under the lead. */
export type Texture = "arp" | "pulse" | "ostinato";

export interface Orchestration {
  /** Plays the Clear tone's exact notes. */
  lead: InstrumentId;
  /** Whole octaves added to every lead note (keeps every interval, so the data reading is unchanged). */
  leadOctave: number;
  bass: InstrumentId;
  /** Bass register, MIDI. */
  bassRange: [number, number];
  pad: InstrumentId;
  padRange: [number, number];
  texture: InstrumentId;
  textureRange: [number, number];
  pattern: Texture;
  /** Sounds on the frame's hotspot, at the hotspot's own note. */
  accent: InstrumentId | null;
  character: string;
}

const ORCHESTRATIONS: Record<string, Orchestration> = {
  "surface-temperature": {
    lead: "violins", leadOctave: 0, bass: "cello", bassRange: [36, 52], pad: "violas", padRange: [55, 69],
    texture: "harp", textureRange: [48, 79], pattern: "arp", accent: "trumpet",
    character: "violins over cellos and violas, harp rippling underneath; a trumpet marks the hottest spot",
  },
  "wind-speed": {
    lead: "flute", leadOctave: 1, bass: "cello", bassRange: [36, 52], pad: "violin_trem", padRange: [62, 79],
    texture: "harp", textureRange: [50, 79], pattern: "arp", accent: "horn",
    character: "a flute an octave up over trembling violins and harp; a horn call marks the strongest wind",
  },
  precipitation: {
    lead: "harp", leadOctave: 0, bass: "cello_pizz", bassRange: [40, 55], pad: "violas", padRange: [55, 67],
    texture: "marimba", textureRange: [60, 84], pattern: "arp", accent: "glock",
    character: "harp over plucked cellos and marimba droplets; a glockenspiel marks the heaviest rain",
  },
  "fine-particulates": {
    lead: "violin_trem", leadOctave: 0, bass: "bassoon", bassRange: [38, 50], pad: "violas", padRange: [55, 67],
    texture: "contrabass", textureRange: [29, 43], pattern: "ostinato", accent: null,
    character: "a trembling, hazy violin line over bassoon, violas and a slow double-bass step",
  },
  "surface-ozone": {
    lead: "oboe", leadOctave: 0, bass: "cello", bassRange: [38, 52], pad: "violins", padRange: [61, 78],
    texture: "harp", textureRange: [54, 81], pattern: "arp", accent: null,
    character: "a plaintive oboe over cellos and soft violins, with harp",
  },
  "carbon-monoxide": {
    lead: "trumpet", leadOctave: 0, bass: "tuba", bassRange: [31, 46], pad: "horn", padRange: [46, 60],
    texture: "contrabass", textureRange: [28, 43], pattern: "ostinato", accent: "violin_trem",
    character: "a trumpet over tuba, horns and a pounding double-bass ostinato; trembling violins at the thickest smoke",
  },
  "nitrogen-oxides": {
    lead: "violin_spic", leadOctave: 0, bass: "tuba", bassRange: [31, 46], pad: "violas", padRange: [55, 69],
    texture: "cello_pizz", textureRange: [43, 60], pattern: "pulse", accent: "trumpet",
    character: "urgent staccato violins over tuba and a driving plucked-cello pulse; a trumpet at the worst spot",
  },
  "sea-surface-temperature": {
    lead: "violas", leadOctave: 0, bass: "contrabass", bassRange: [31, 46], pad: "violins", padRange: [60, 76],
    texture: "harp", textureRange: [51, 82], pattern: "arp", accent: "glock",
    character: "warm violas over double bass and violins, harp waves underneath",
  },
  vegetation: {
    lead: "clarinet", leadOctave: 0, bass: "bassoon", bassRange: [41, 53], pad: "violins", padRange: [60, 77],
    texture: "marimba", textureRange: [60, 84], pattern: "arp", accent: "glock",
    character: "a clarinet over bassoon and violins, with marimba; a glockenspiel at the greenest spot",
  },
};

/** Tracks without their own orchestration get one by theme (still never the Clear sine). */
const BY_THEME: Record<ThemeId, string> = {
  sea_level: "sea-surface-temperature",
  air_quality: "fine-particulates",
  wildfires: "carbon-monoxide",
  greenhouse_gases: "surface-ozone",
  water: "precipitation",
  agriculture: "vegetation",
  biodiversity: "vegetation",
  energy: "nitrogen-oxides",
  disasters: "carbon-monoxide",
  weather: "surface-temperature",
  ocean: "sea-surface-temperature",
};

export function orchestrationFor(trackId: string, theme: ThemeId): Orchestration {
  return ORCHESTRATIONS[trackId] ?? ORCHESTRATIONS[BY_THEME[theme]] ?? ORCHESTRATIONS["surface-temperature"]!;
}

export function instrumentsOf(o: Orchestration): InstrumentId[] {
  return [...new Set([o.lead, o.bass, o.pad, o.texture, ...(o.accent ? [o.accent] : [])])];
}

// --- harmony from the Clear tone's own notes ----------------------------------------------------

/** Same scales as backend/app/mapping/rules.py (score.key.scale uses spaces instead of underscores). */
const SCALES: Record<string, number[]> = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  "minor pentatonic": [0, 3, 5, 7, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  "whole tone": [0, 2, 4, 6, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  "major pentatonic": [0, 2, 4, 7, 9],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "phrygian dominant": [0, 1, 4, 5, 7, 8, 10],
};

export interface Chord {
  /** Pitch classes, root first. */
  pcs: number[];
  degree: number;
}

/** Triads stacked in the key's own scale, so every chord tone is a scale tone of the melody. */
export function scaleChords(scale: string, rootMidi: number): Chord[] {
  const steps = SCALES[scale] ?? SCALES.dorian!;
  const n = steps.length;
  const root = ((rootMidi % 12) + 12) % 12;
  return steps.map((_, i) => ({
    degree: i,
    pcs: [0, 2, 4].map((k) => (root + steps[(i + k) % n]!) % 12),
  }));
}

/**
 * The chord that best fits a half-frame of melody notes: most melody notes inside it, a little
 * preference for the home chord and for staying put (smooth harmony). Returns null when the
 * melody is silent (no data), so the section rests too.
 */
export function chooseChord(notes: number[], chords: Chord[], previous: Chord | null): Chord | null {
  const played = notes.filter((n) => n >= 0);
  if (!played.length) return null;
  let best: Chord | null = null;
  let bestScore = -Infinity;
  for (const chord of chords) {
    let score = 0;
    for (const note of played) if (chord.pcs.includes(note % 12)) score += 1;
    // the first and last note of the half weigh more: they are what the ear lands on
    if (chord.pcs.includes(played[0]! % 12)) score += 0.5;
    if (chord.pcs.includes(played[played.length - 1]! % 12)) score += 0.5;
    if (chord.degree === 0) score += 0.4;
    if (previous && previous.degree === chord.degree) score += 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = chord;
    }
  }
  return best;
}

/** Every MIDI note of `pcs` inside [lo, hi]. */
export function tonesIn(pcs: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}

/** Root of the chord in a register (lowest root inside it, else lowest chord tone). */
export function rootIn(chord: Chord, lo: number, hi: number): number | null {
  const roots = tonesIn([chord.pcs[0]!], lo, hi);
  return roots[0] ?? tonesIn(chord.pcs, lo, hi)[0] ?? null;
}

/** Move each voice of `previous` to the nearest tone of the new chord: smooth, orchestral. */
export function voiceLead(chord: Chord, lo: number, hi: number, previous: number[]): number[] {
  const tones = tonesIn(chord.pcs, lo, hi);
  if (!tones.length) return [];
  const start = previous.length ? previous : tones.slice(0, 3);
  const nearest = (t: number) => tones.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  const voiced = [...new Set(start.map(nearest))];
  for (const t of tones) {
    if (voiced.length >= 3) break;
    if (!voiced.includes(t)) voiced.push(t);
  }
  return voiced.sort((a, b) => a - b);
}

// --- recorded notes ------------------------------------------------------------------------------

interface ManifestEntry {
  midi: number;
  file: string;
}

interface Recorded {
  midi: number;
  buffer: AudioBuffer;
}

const API_URL = "/api";

/** Loads and keeps the recorded notes of each instrument; picks and re-pitches the nearest one. */
export class SampleBank {
  private manifest: Promise<Record<string, ManifestEntry[]> | null> | null = null;
  private loaded = new Map<InstrumentId, Recorded[]>();
  private loading = new Map<InstrumentId, Promise<void>>();

  constructor(private engine: AudioEngine) {}

  get available(): boolean {
    return Boolean(API_URL);
  }

  private getManifest(): Promise<Record<string, ManifestEntry[]> | null> {
    this.manifest ??= fetch(`${API_URL}/samples/manifest.json`)
      .then(async (r) => (r.ok ? ((await r.json()) as { instruments: Record<string, ManifestEntry[]> }).instruments : null))
      .catch(() => null);
    return this.manifest;
  }

  /** Start loading these instruments (idempotent). Resolves when all that could load have. */
  load(instruments: InstrumentId[]): Promise<void> {
    if (!API_URL) return Promise.resolve();
    return Promise.all(
      instruments.map((inst) => {
        const existing = this.loading.get(inst);
        if (existing) return existing;
        const job = (async () => {
          const manifest = await this.getManifest();
          const entries = manifest?.[inst] ?? [];
          const notes = await Promise.all(
            entries.map(async (e) => {
              try {
                const res = await fetch(`${API_URL}/samples/${e.file}`);
                if (!res.ok) return null;
                return { midi: e.midi, buffer: await this.engine.decode(await res.arrayBuffer()) };
              } catch {
                return null;
              }
            }),
          );
          const ok = notes.filter((n): n is Recorded => n !== null);
          if (ok.length) this.loaded.set(inst, ok);
        })();
        this.loading.set(inst, job);
        return job;
      }),
    ).then(() => undefined);
  }

  ready(inst: InstrumentId): boolean {
    return this.loaded.has(inst);
  }

  /** Nearest recorded note and the playback rate that turns it into `midi`, or null if not loaded. */
  note(inst: InstrumentId, midi: number): { buffer: AudioBuffer; rate: number } | null {
    const notes = this.loaded.get(inst);
    if (!notes?.length) return null;
    let best = notes[0]!;
    for (const n of notes) if (Math.abs(n.midi - midi) < Math.abs(best.midi - midi)) best = n;
    return { buffer: best.buffer, rate: 2 ** ((midi - best.midi) / 12) };
  }
}
