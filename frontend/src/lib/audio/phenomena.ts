/**
 * Browser v15 ensemble fallback. The backend render remains preferred whenever `audioUrl`
 * is present; this path only realises the backend's pre-scored notes, durations and gains
 * for bass, harp and flute through the existing deterministic stereo hall.
 */

export type InstrumentId = 'bass' | 'harp' | 'flute'
export interface VoicePart {
  instrument: InstrumentId
  notes: number[]
  gains: number[]
  durations: number[]
  values: number[]
  pitch_targets: number[]
}
export interface VoiceEvent {
  instrument: InstrumentId
  t: number
  midi: number
  gain: number
  duration: number
  gainTargets: { offset: number; value: number }[]
}

export interface SpecCell {
  row: number; col: number; cx: number; cy: number; brightness: number; saturation: number; hue: number
  turbulence: number; edges: number; gradient: number; hot: number; green: number; water: number
  white: number; dark: number; rel?: number
}
export interface SpecLayer { kind: 'noise' | 'res' | 'hit' | 'swell' | 'tone'; model: string; t0: number; dur: number; gain: number; pan?: number; freq?: number; q?: number; gust?: number }
export interface Spec {
  model: 'wind' | 'storm' | 'fire' | 'ocean' | 'city' | 'canopy' | 'plume' | 'space'
  title: string; duration: number; layers: SpecLayer[]; mapping: string; explain: string
  grid: { cols: number; rows: number; cells: SpecCell[] }; frame_stats: Record<string, number>
  drop_count?: number; crackle_count?: number; audioUrl?: string
  terraDetail?: import('../types').TerraTrackDetail; terraScore?: import('../types').TerraScore
  /** A single-frame v15 score for the client-side image scanner. */
  voices?: VoicePart[]
  colorWaves?: { cool: number[]; mid: number[]; hot: number[]; peak: number[] }
}
export interface PlaySnapshot { playing: boolean; position: number; duration: number; level: number }

/**
 * Pure schedule extraction: mirrors the backend's steady scan grid. Equal consecutive tones are
 * one held event, while every stored gain knot remains available for smooth browser automation.
 */
export function buildEvents(
  voices: VoicePart[],
  frameDurationS: number,
  gainEnvelope: number[] = [],
  stepsPerFrame = 8,
): VoiceEvent[] {
  const steps = Math.max(1, stepsPerFrame)
  const step = frameDurationS / steps
  const levels: Record<InstrumentId, number> = { bass: 0.28, harp: 0.18, flute: 0.17 }
  const events: VoiceEvent[] = []

  for (const voice of voices) {
    for (let index = 0; index < voice.notes.length; index++) {
      const midi = voice.notes[index] ?? -1
      if (midi < 0) continue
      const duration = Math.min(frameDurationS - index * step, Math.max(0, voice.durations[index] ?? 1) * step)
      if (!duration) continue
      const targets = []
      for (let slot = index; slot < steps && (slot - index) * step < duration; slot++) {
        targets.push({
          offset: (slot - index) * step,
          value: levels[voice.instrument] * (voice.gains[slot] ?? 1) * (gainEnvelope[slot] ?? 1),
        })
      }
      events.push({
        instrument: voice.instrument,
        t: index * step,
        midi,
        gain: targets[0]?.value ?? 0,
        duration,
        gainTargets: targets,
      })
    }
  }
  return events
}

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
export class PhenomenonPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private hall: ConvolverNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private timeData: Uint8Array<ArrayBuffer> | null = null
  private spec: Spec | null = null
  private startedAt = 0
  private playing = false
  private volume = 0.8
  private nodes: AudioScheduledSourceNode[] = []
  private mediaEl: HTMLAudioElement | null = null
  private mediaSrc: MediaElementAudioSourceNode | null = null
  private raf = 0
  private snapshot: PlaySnapshot = { playing: false, position: 0, duration: 0, level: 0 }

  onSnapshot: ((s: PlaySnapshot) => void) | null = null
  onEnded: (() => void) | null = null
  onEnergy: ((values: Float32Array, cols: number, rows: number) => void) | null = null
  get isPlaying() { return this.playing }
  get progress() { const d = this.spec?.duration ?? 0; return d ? Math.min(1, this.snapshot.position / d) : 0 }
  get context() { return this.ctx }
  getSpec() { return this.spec }
  get duration() { return this.spec?.duration ?? 0 }

  async init(): Promise<void> {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return }
    const Ctor: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor(); this.ctx = ctx
    this.master = ctx.createGain(); this.master.gain.value = this.volume
    this.dry = ctx.createGain(); this.wet = ctx.createGain(); this.wet.gain.value = 0.3
    this.hall = ctx.createConvolver(); this.hall.buffer = this.makeHallIR(ctx)
    this.limiter = ctx.createDynamicsCompressor(); this.limiter.threshold.value = -2; this.limiter.knee.value = 6
    this.limiter.ratio.value = 12; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.1
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.72
    this.dry.connect(this.master); this.wet.connect(this.hall).connect(this.master)
    this.master.connect(this.limiter).connect(this.analyser).connect(ctx.destination)
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount); this.timeData = new Uint8Array(this.analyser.fftSize)
    if (ctx.state === 'suspended') await ctx.resume()
  }

  private makeHallIR(ctx: AudioContext): AudioBuffer {
    const seconds = 2.6; const n = Math.floor(ctx.sampleRate * seconds); const ir = ctx.createBuffer(2, n, ctx.sampleRate)
    let seed = 0x51f15e7d
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 }
    const pre = Math.floor(ctx.sampleRate * 0.026)
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      let low = 0
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / ctx.sampleRate
        const decay = Math.exp(-6.907755 * t / 2.2)
        // A one-pole low-pass progressively removes high frequencies from the tail.
        low = 0.18 * (rand() * 2 - 1) + 0.82 * low
        data[i] = low * decay * (ch ? 0.96 : 1)
      }
    }
    return ir
  }

  setVolume(v: number) { this.volume = v; this.master?.gain.setTargetAtTime(v, this.ctx?.currentTime ?? 0, 0.04) }
  load(spec: Spec) { this.stop(); this.spec = spec; this.snapshot = { playing: false, position: 0, duration: spec.duration, level: 0 }; this.onSnapshot?.(this.snapshot) }

  async play(from = 0) {
    if (!this.ctx || !this.spec) return
    if (this.ctx.state === 'suspended') await this.ctx.resume(); this.stopSources(); this.playing = true
    if (this.spec.audioUrl) {
      if (!this.mediaEl) { this.mediaEl = new Audio(); this.mediaEl.crossOrigin = 'anonymous'; this.mediaEl.preload = 'auto'; this.mediaSrc = this.ctx.createMediaElementSource(this.mediaEl); this.mediaSrc.connect(this.master!) }
      if (this.mediaEl.src !== new URL(this.spec.audioUrl, window.location.origin).href) this.mediaEl.src = this.spec.audioUrl
      this.mediaEl.currentTime = Math.max(0, from); this.startedAt = this.ctx.currentTime - from; await this.mediaEl.play(); this.loop(); return
    }
    this.startedAt = this.ctx.currentTime - from; this.scheduleFrom(from); this.loop()
  }

  private scheduleFrom(from: number) {
    if (!this.spec) return
    const score = this.spec.terraScore
    if (score) {
      const steps = Math.max(1, score.steps_per_frame || 8)
      const frameS = steps * (60 / score.key.bpm)
      score.frames.forEach((frame, fi) => this.scheduleEvents(
        buildEvents(frame.voices, frameS, frame.gain_envelope, steps), fi * frameS, from,
      ))
    } else if (this.spec.voices) this.scheduleEvents(buildEvents(this.spec.voices, 4), 0, from)
  }

  private scheduleEvents(events: VoiceEvent[], frameOffset: number, from: number) {
    for (const event of events) { const t = frameOffset + event.t; if (t >= from - 0.02) this.scheduleVoice(event, t) }
  }

  private scheduleVoice(event: VoiceEvent, transportTime: number) {
    const ctx = this.ctx!; const when = Math.max(ctx.currentTime + 0.01, this.startedAt + transportTime)
    const duration = Math.max(0.02, event.duration)
    const gain = ctx.createGain(); const amplitude = ctx.createGain()
    const pan = ctx.createStereoPanner(); pan.pan.value = event.instrument === 'bass' ? 0 : event.instrument === 'harp' ? 0.10 : -0.10
    // Separate instrument articulation from measured amplitude automation; only the latter
    // is a data-driven fader. Bound its log-gain slope to the backend's 45 dB/s combined limit.
    let db = 20 * Math.log10(Math.max(0.0001, event.gain))
    let lastOffset = 0
    amplitude.gain.setValueAtTime(10 ** (db / 20), when)
    for (const target of event.gainTargets.slice(1)) {
      const targetTime = when + target.offset
      if (targetTime < when + duration - 0.02) {
        const wanted = 20 * Math.log10(Math.max(0.0001, target.value))
        const limit = 45 * (target.offset - lastOffset)
        db = Math.max(db - limit, Math.min(db + limit, wanted))
        amplitude.gain.exponentialRampToValueAtTime(10 ** (db / 20), targetTime)
        lastOffset = target.offset
      }
    }
    const attack = Math.min(duration / 4, event.instrument === 'flute' ? 0.06 : 0.008)
    const release = Math.min(0.14, duration / 3)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(1, when + attack)
    gain.gain.setValueAtTime(1, when + duration - release)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    gain.connect(amplitude).connect(pan).connect(this.dry!); pan.connect(this.wet!)
    if (event.instrument === 'flute') {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(midiHz(event.midi) * 0.99, when)
      osc.frequency.exponentialRampToValueAtTime(midiHz(event.midi), when + Math.min(0.12, duration / 2))
      const vibrato = ctx.createOscillator(); const depth = ctx.createGain()
      vibrato.frequency.value = 5; depth.gain.setValueAtTime(0, when)
      if (duration > 0.3) depth.gain.linearRampToValueAtTime(midiHz(event.midi) * 0.0045, when + 0.3)
      vibrato.connect(depth).connect(osc.frequency); vibrato.start(when); vibrato.stop(when + duration + 0.02)
      osc.connect(gain); osc.start(when); osc.stop(when + duration + 0.02); this.nodes.push(osc, vibrato)
      return
    }
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; const base = midiHz(event.midi)
    osc.frequency.setValueAtTime(base, when); osc.detune.value = event.instrument === 'harp' ? 3 : -2
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.7; filter.frequency.setValueAtTime(event.instrument === 'harp' ? 5200 : 2400, when); filter.frequency.exponentialRampToValueAtTime(event.instrument === 'harp' ? 900 : 180, when + Math.min(0.5, duration))
    osc.connect(filter).connect(gain); osc.start(when); osc.stop(when + duration + 0.02); this.nodes.push(osc)
  }

  private loop = () => {
    if (!this.playing || !this.ctx || !this.spec) return
    const stream = Boolean(this.spec.audioUrl && this.mediaEl); const duration = stream && this.mediaEl && Number.isFinite(this.mediaEl.duration) && this.mediaEl.duration > 0 ? this.mediaEl.duration : this.spec.duration
    const pos = stream && this.mediaEl ? this.mediaEl.currentTime : this.ctx.currentTime - this.startedAt
    const level = this.getLevel(); this.snapshot = { playing: true, position: Math.min(pos, duration), duration, level }; this.onSnapshot?.(this.snapshot)
    if ((stream && this.mediaEl?.ended) || pos >= duration) { this.stop(); this.onEnded?.(); return }
    if (this.onEnergy) { const values = new Float32Array(this.spec.grid.cols * this.spec.grid.rows); const bands = this.getFrequencyData(); if (bands) { const norm = bands.reduce((a, b) => a + b, 0) / bands.length / 255; values.fill(Math.min(1, norm * 1.5)) } this.onEnergy(values, this.spec.grid.cols, this.spec.grid.rows) }
    this.raf = requestAnimationFrame(this.loop)
  }

  stop() { this.playing = false; cancelAnimationFrame(this.raf); this.stopSources(); this.snapshot = { ...this.snapshot, playing: false, level: 0 }; this.onSnapshot?.(this.snapshot) }
  private stopSources() { if (this.mediaEl && !this.mediaEl.paused) this.mediaEl.pause(); for (const n of this.nodes) { try { n.stop() } catch { /* already stopped */ } } this.nodes = [] }
  getFrequencyData(): Uint8Array | null { if (!this.analyser || !this.freqData) return null; this.analyser.getByteFrequencyData(this.freqData); return this.freqData }
  getTimeDomainData(): Uint8Array | null { if (!this.analyser || !this.timeData) return null; this.analyser.getByteTimeDomainData(this.timeData); return this.timeData }
  getLevel(): number { const data = this.getTimeDomainData(); if (!data) return 0; let sum = 0; for (const x of data) { const v = (x - 128) / 128; sum += v * v } return Math.sqrt(sum / data.length) }
  dispose() { this.stop(); void this.ctx?.close(); this.ctx = null }
}
export const phenomena = new PhenomenonPlayer()
