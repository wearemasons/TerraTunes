// Turns a score into scheduled sound and exposes playback state to React.
// It follows the score; it never re-derives musical decisions (see docs/ARCHITECTURE.md).

import { DEFAULT_PRESET, type FrameScore, type ModeId, type PresetId, type Score, type ThemeId } from "@/lib/api/types";

import { AudioEngine, audioSupported } from "./engine";
import {
  type Chord,
  chooseChord,
  type InstrumentId,
  instrumentsOf,
  type Orchestration,
  orchestrationFor,
  rootIn,
  SampleBank,
  scaleChords,
  tonesIn,
  voiceLead,
} from "./orchestra";
import { type Timbre, timbreFor } from "./timbres";

export type PlayerStatus = "idle" | "playing" | "paused" | "ended";

export interface PlayerSnapshot {
  trackId: string | null;
  status: PlayerStatus;
  frame: number;
  frameCount: number;
  mode: ModeId;
  preset: PresetId;
  volume: number;
  muted: boolean;
  supported: boolean;
  error: string | null;
}

export interface Playhead {
  frame: number;
  /** 0..1 progress through the current frame. */
  progress: number;
  step: number;
  stepsPerFrame: number;
}

interface StepEvent {
  time: number;
  duration: number;
  frame: number;
  step: number;
  steps: number;
}

const LOOKAHEAD_S = 0.15;
const HIDDEN_LOOKAHEAD_S = 1.5;
const TICK_MS = 25;

function overviewChord(frame: FrameScore): number[] {
  const notes = [...new Set(frame.column_notes.filter((n) => n >= 0))].sort((a, b) => a - b);
  if (notes.length === 0) return [];
  const pick = (q: number) => notes[Math.min(notes.length - 1, Math.round(q * (notes.length - 1)))] ?? notes[0]!;
  return [...new Set([pick(0), pick(0.5), pick(1)])];
}

export class Player {
  private engine = new AudioEngine();
  private listeners = new Set<() => void>();
  private snapshot: PlayerSnapshot = {
    trackId: null,
    status: "idle",
    frame: 0,
    frameCount: 0,
    mode: "scan",
    preset: DEFAULT_PRESET,
    volume: 0.7,
    muted: false,
    supported: audioSupported,
    error: null,
  };
  private score: Score | null = null;
  private theme: ThemeId = "sea_level";
  private timbre: Timbre = timbreFor("sea_level", DEFAULT_PRESET);
  private timer: number | null = null;
  private cursor = { frame: 0, step: 0 };
  private nextTime = 0;
  private endTime: number | null = null;
  private events: StepEvent[] = [];
  private lastNote = -1;
  // Orchestra: the section's harmony state (see ./orchestra.ts)
  private bank = new SampleBank(this.engine);
  private orchestration: Orchestration = orchestrationFor("", "sea_level");
  private chords: Chord[] = [];
  private prevChord: Chord | null = null;
  private halfChord: Chord | null = null;
  private padVoicing: number[] = [];

  // --- store API (useSyncExternalStore) ---
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PlayerSnapshot => this.snapshot;

  private set(patch: Partial<PlayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  get analyser(): AnalyserNode | null {
    return this.engine.analyserNode;
  }

  // --- loading ---
  load(args: { trackId: string; score: Score; theme: ThemeId; frame?: number }): void {
    const sameTrack = this.snapshot.trackId === args.trackId;
    const wasPlaying = sameTrack && this.snapshot.status === "playing";
    if (!sameTrack) this.stop();
    this.score = args.score;
    this.theme = args.theme;
    this.timbre = timbreFor(args.theme, this.snapshot.preset);
    this.orchestration = orchestrationFor(args.trackId, args.theme);
    this.chords = scaleChords(args.score.key.scale, args.score.key.root_midi);
    if (this.snapshot.preset === "orchestra") void this.bank.load(instrumentsOf(this.orchestration));
    const frameCount = args.score.frames.length;
    const frame = Math.min(frameCount - 1, Math.max(0, sameTrack ? this.snapshot.frame : (args.frame ?? 0)));
    this.set({ trackId: args.trackId, frameCount, frame, status: sameTrack ? this.snapshot.status : "idle" });
    if (wasPlaying) this.restartFrom(frame);
  }

  unload(): void {
    this.stop();
    this.score = null;
    this.set({ trackId: null, frameCount: 0, frame: 0, status: "idle" });
  }

  // --- settings ---
  setPreset(preset: PresetId): void {
    if (preset === this.snapshot.preset) return;
    this.timbre = timbreFor(this.theme, preset);
    if (preset === "orchestra") void this.bank.load(instrumentsOf(this.orchestration));
    this.set({ preset });
    if (this.snapshot.status === "playing") {
      this.engine.stopDrone();
      this.startVoices();
    }
  }

  setMode(mode: ModeId): void {
    if (mode === this.snapshot.mode) return;
    const wasPlaying = this.snapshot.status === "playing";
    this.set({ mode });
    if (mode === "explore") {
      if (wasPlaying) this.pause();
    } else if (wasPlaying) {
      this.restartFrom(this.snapshot.frame);
    }
  }

  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    this.set({ volume: v, muted: v === 0 ? this.snapshot.muted : false });
    this.engine.setVolume(v, this.snapshot.muted);
  }

  setMuted(muted: boolean): void {
    this.set({ muted });
    this.engine.setVolume(this.snapshot.volume, muted);
  }

  // --- transport ---
  async play(): Promise<void> {
    if (!this.score || this.snapshot.status === "playing") return;
    try {
      await this.engine.resume();
    } catch (error) {
      this.set({ error: error instanceof Error ? error.message : "Audio could not start", supported: false });
      return;
    }
    this.engine.setVolume(this.snapshot.volume, this.snapshot.muted);
    const from = this.snapshot.status === "ended" ? 0 : this.snapshot.frame;
    if (this.snapshot.mode === "explore") this.set({ mode: "scan" });
    this.restartFrom(from);
  }

  pause(): void {
    if (this.snapshot.status !== "playing") return;
    this.halt();
    this.set({ status: "paused" });
  }

  toggle(): void {
    if (this.snapshot.status === "playing") this.pause();
    else void this.play();
  }

  seek(frame: number): void {
    if (!this.score) return;
    const target = Math.min(this.score.frames.length - 1, Math.max(0, Math.round(frame)));
    if (this.snapshot.status === "playing") {
      this.restartFrom(target);
    } else {
      this.set({ frame: target, status: this.snapshot.status === "ended" ? "paused" : this.snapshot.status });
    }
  }

  step(delta: number): void {
    this.seek(this.snapshot.frame + delta);
  }

  /** Explore mode: one short note for a value under the cursor. Continuous pitch, no quantizing. */
  async probe(value01: number | null, x01: number): Promise<void> {
    if (!this.score) return;
    try {
      await this.engine.resume();
    } catch {
      this.set({ supported: false });
      return;
    }
    this.engine.setVolume(this.snapshot.volume, this.snapshot.muted);
    const ctx = this.engine.context;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const pan = x01 * 1.6 - 0.8;
    if (value01 === null) {
      this.engine.hit(t, "tick", 0.04);
      return;
    }
    const midi = this.score.key.root_midi + value01 * 36;
    this.engine.pluck(midi, t, 0.45, { wave: this.timbre.melody === "square" ? "triangle" : this.timbre.melody, gain: 0.3, pan, cutoff: 3000 });
  }

  /** Where the sound is right now, for visuals. Null when not playing. */
  getPlayhead(): Playhead | null {
    const ctx = this.engine.context;
    if (!ctx || this.snapshot.status !== "playing") return null;
    const now = ctx.currentTime;
    let current: StepEvent | undefined;
    for (const event of this.events) {
      if (event.time <= now) current = event;
      else break;
    }
    if (!current) return null;
    const within = Math.min(1, Math.max(0, (now - current.time) / current.duration));
    return {
      frame: current.frame,
      step: current.step,
      stepsPerFrame: current.steps,
      progress: (current.step + within) / current.steps,
    };
  }

  // --- internals ---
  private stepsFor(): number {
    return this.snapshot.mode === "overview" ? 4 : (this.score?.steps_per_frame ?? 16);
  }

  private stepDuration(frame: FrameScore): number {
    const bpm = this.score?.key.bpm ?? 72;
    const push = 1 + 0.2 * frame.tension; // tempo leans forward on fast change
    return this.snapshot.mode === "overview" ? 60 / bpm / push : 60 / bpm / 2 / push;
  }

  private startVoices(): void {
    this.engine.setReverb(this.timbre.reverb * 0.6);
    if (this.timbre.droneLevel > 0) this.engine.startDrone(this.timbre.drone);
  }

  private restartFrom(frame: number): void {
    const ctx = this.engine.context;
    if (!ctx || !this.score) return;
    this.halt();
    this.cursor = { frame, step: 0 };
    this.nextTime = ctx.currentTime + 0.06;
    this.endTime = null;
    this.events = [];
    this.lastNote = -1;
    this.prevChord = null;
    this.halfChord = null;
    this.padVoicing = [];
    this.startVoices();
    this.set({ status: "playing", frame, error: null });
    this.timer = window.setInterval(this.tick, TICK_MS);
    this.tick();
  }

  private halt(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.engine.stopDrone();
  }

  private stop(): void {
    this.halt();
    this.events = [];
  }

  private tick = (): void => {
    const ctx = this.engine.context;
    const score = this.score;
    if (!ctx || !score) return;
    const lookahead = document.hidden ? HIDDEN_LOOKAHEAD_S : LOOKAHEAD_S;

    while (this.endTime === null && this.nextTime < ctx.currentTime + lookahead) {
      const frame = score.frames[this.cursor.frame];
      if (!frame) {
        this.endTime = this.nextTime;
        break;
      }
      const steps = this.stepsFor();
      const duration = this.stepDuration(frame);
      this.scheduleStep(frame, this.cursor.step, steps, this.nextTime, duration);
      this.events.push({ time: this.nextTime, duration, frame: this.cursor.frame, step: this.cursor.step, steps });
      this.nextTime += duration;
      this.cursor.step++;
      if (this.cursor.step >= steps) {
        this.cursor = { frame: this.cursor.frame + 1, step: 0 };
      }
    }

    const now = ctx.currentTime;
    // Keep a short history for the visual playhead.
    while (this.events.length > 2 && (this.events[1]?.time ?? Infinity) <= now - 1) this.events.shift();

    const playhead = this.getPlayhead();
    if (playhead && playhead.frame !== this.snapshot.frame) this.set({ frame: playhead.frame });

    if (this.endTime !== null && now >= this.endTime) {
      this.halt();
      this.set({ status: "ended", frame: score.frames.length - 1 });
    }
  };

  private scheduleStep(frame: FrameScore, step: number, steps: number, time: number, duration: number): void {
    if (this.snapshot.preset === "orchestra" && this.snapshot.mode !== "overview") {
      this.scheduleOrchestraStep(frame, step, steps, time, duration);
      return;
    }
    const timbre = this.timbre;
    const root = (this.score?.key.root_midi ?? 50) - 12;

    if (step === 0) {
      const level = (0.04 + 0.08 * frame.loudness) * timbre.droneLevel;
      this.engine.updateDrone(time, root, level, frame.brightness, timbre.tension ? frame.tension : 0);
    }

    const melodyGain = 0.12 + 0.22 * frame.loudness;
    const cutoff = timbre.filterBase + frame.brightness * 3000;

    if (this.snapshot.mode === "overview") {
      const chord = overviewChord(frame);
      if (step === 0) {
        chord.forEach((note, i) => this.engine.pluck(note, time + i * 0.02, duration * 3.5, { wave: timbre.melody, gain: melodyGain * 0.6, pan: (i - 1) * 0.4, cutoff }));
      } else {
        const note = chord[(step - 1) % Math.max(1, chord.length)];
        if (note !== undefined) this.engine.pluck(note + 12, time, duration * 1.2, { wave: timbre.melody, gain: melodyGain * 0.5, pan: 0, cutoff });
      }
      if (step === 0 && timbre.bell && frame.hotspot) {
        this.engine.bell(frame.hotspot.note, time + duration * 0.5, frame.hotspot.x * 1.6 - 0.8, frame.hotspot.strength);
      }
      if (timbre.rhythm !== "none") {
        for (let k = 0; k < frame.rhythm_density; k++) {
          this.engine.hit(time + (k * duration) / frame.rhythm_density, timbre.rhythm, k === 0 ? 0.08 : 0.04);
        }
      }
      return;
    }

    // Scan: one column slice per step, west → east = left → right.
    const pan = steps > 1 ? (step / (steps - 1)) * 1.6 - 0.8 : 0;
    const note = frame.column_notes[step] ?? -1;
    if (note >= 0 && (note !== this.lastNote || step % 4 === 0)) {
      this.engine.pluck(note, time, duration * 1.9, { wave: timbre.melody, gain: melodyGain, pan, cutoff });
      if (timbre.tension && frame.tension > 0.25 && step % 2 === 1) {
        this.engine.pluck(note + 1, time + duration * 0.25, duration * 1.2, { wave: timbre.melody, gain: melodyGain * frame.tension * 0.6, pan: -pan, cutoff });
      }
    }
    this.lastNote = note;

    if (timbre.rhythm !== "none" && note >= 0) {
      const onBeat = step % 2 === 0;
      if (frame.rhythm_density >= 2 || onBeat) this.engine.hit(time, timbre.rhythm, step % 4 === 0 ? 0.07 : 0.035);
      if (frame.rhythm_density >= 4) this.engine.hit(time + duration / 2, timbre.rhythm, 0.025);
    }

    if (timbre.bell && frame.hotspot && step === Math.min(steps - 1, Math.floor(frame.hotspot.x * steps))) {
      this.engine.bell(frame.hotspot.note, time, pan, frame.hotspot.strength);
    }
  }
  /** Whether recorded instruments can load (an API is configured). */
  get instrumentsAvailable(): boolean {
    return this.bank.available;
  }

  /** The current orchestration, for the UI ("who plays what"). */
  get orchestra(): Orchestration {
    return this.orchestration;
  }

  /** A recorded note if that instrument is loaded; returns false when it is not (caller decides). */
  private playNote(inst: InstrumentId, midi: number, time: number, duration: number, opts: { gain: number; pan: number; attack?: number; release?: number }): boolean {
    const note = this.bank.note(inst, midi);
    if (!note) return false;
    this.engine.sample(note.buffer, note.rate, time, duration, opts);
    return true;
  }

  /**
   * Orchestra, scan mode. The lead is the Clear tone exactly (same note, time, pan and re-strike rule)
   * on a recorded instrument; the section underneath harmonises with the notes of each half-frame.
   */
  private scheduleOrchestraStep(frame: FrameScore, step: number, steps: number, time: number, duration: number): void {
    const o = this.orchestration;
    const pan = steps > 1 ? (step / (steps - 1)) * 1.6 - 0.8 : 0;
    const note = frame.column_notes[step] ?? -1;

    // Lead: the Clear tone, note for note.
    if (note >= 0 && (note !== this.lastNote || step % 4 === 0)) {
      const gain = 0.32 + 0.22 * frame.loudness;
      const played = this.playNote(o.lead, note + 12 * o.leadOctave, time, duration * 1.9, { gain, pan, release: 0.3 });
      if (!played) {
        this.engine.pluck(note, time, duration * 1.9, { wave: "sine", gain: 0.12 + 0.22 * frame.loudness, pan, cutoff: 4000 });
      }
    }
    this.lastNote = note;

    // Section harmony: one chord per half-frame, chosen from the melody's own notes.
    const half = Math.max(1, Math.floor(steps / 2));
    if (step % half === 0) {
      const chord = chooseChord(frame.column_notes.slice(step, step + half), this.chords, this.prevChord);
      this.halfChord = chord;
      if (chord) {
        this.prevChord = chord;
        const span = duration * half;
        const level = 0.6 + 0.4 * frame.loudness;
        const bass = rootIn(chord, o.bassRange[0], o.bassRange[1]);
        if (bass !== null) this.playNote(o.bass, bass, time, span * 0.97, { gain: 0.24 * level, pan: -0.25, attack: 0.03, release: 0.5 });
        this.padVoicing = voiceLead(chord, o.padRange[0], o.padRange[1], this.padVoicing);
        this.padVoicing.forEach((m, i) =>
          this.playNote(o.pad, m, time, span, { gain: 0.075 * level, pan: (i - 1) * 0.3, attack: 0.15, release: 0.8 }),
        );
      }
    }

    const chord = this.halfChord;
    if (chord) {
      const tones = tonesIn(chord.pcs, o.textureRange[0], o.textureRange[1]);
      const mid = Math.max(0, Math.floor(tones.length / 3));
      if (o.pattern === "arp" && step % 2 === 1 && tones.length) {
        const run = tones.slice(mid, mid + 4);
        const m = run[((step - 1) / 2) % run.length];
        if (m !== undefined) this.playNote(o.texture, m, time, duration * 2.5, { gain: 0.11, pan: 0.35, release: 0.6 });
      } else if (o.pattern === "pulse" && tones.length) {
        const m = tones[mid + (step % 2)] ?? tones[mid];
        if (m !== undefined) this.playNote(o.texture, m, time, duration * 0.8, { gain: step % 2 === 0 ? 0.12 : 0.08, pan: 0.3, release: 0.15 });
      } else if (o.pattern === "ostinato" && step % 2 === 0) {
        const root = rootIn(chord, o.textureRange[0], o.textureRange[1]);
        if (root !== null) {
          const fifth = tones.find((t) => t >= root + 6 && t <= root + 8) ?? root;
          const m = step % 4 === 0 ? root : fifth;
          this.playNote(o.texture, m, time, duration * 1.7, { gain: step % 8 === 0 ? 0.2 : 0.14, pan: 0.15, release: 0.3 });
        }
      }
    }

    // Accent on the frame's hotspot, at the hotspot's own pitch class.
    if (o.accent && frame.hotspot && step === Math.min(steps - 1, Math.floor(frame.hotspot.x * steps))) {
      this.playNote(o.accent, (ACCENT_FIT[o.accent] ?? ((m: number) => m))(frame.hotspot.note), time, duration * 3, { gain: 0.28, pan, release: 0.8 });
    }
  }
}

/** Move a note by whole octaves into the accent instrument's comfortable range. */
function fitTo(lo: number, hi: number): (midi: number) => number {
  return (midi) => {
    let m = midi;
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  };
}

const ACCENT_FIT: Partial<Record<InstrumentId, (midi: number) => number>> = {
  glock: fitTo(79, 100),
  trumpet: fitTo(62, 82),
  horn: fitTo(50, 72),
  violin_trem: fitTo(67, 88),
};

/** One player for the whole app: a single audio graph, a single transport. */
export const player = new Player();
