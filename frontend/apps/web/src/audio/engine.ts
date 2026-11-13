// Low-level Web Audio graph: voices → bus → (dry + reverb) → master → limiter → analyser → out.
// Safety: a hard limiter, smoothed gain changes and envelopes on every note (no clicks).

import { midiToHz } from "@/lib/format";

const AudioContextCtor: typeof AudioContext | undefined =
  typeof window === "undefined"
    ? undefined
    : (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

export const audioSupported = Boolean(AudioContextCtor);

/** Perceptual volume curve; 1.0 → about −2 dBFS before the limiter. */
function volumeToGain(volume: number): number {
  return Math.min(1, Math.max(0, volume)) ** 2 * 0.8;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private reverbSend!: GainNode;
  private master!: GainNode;
  private analyser!: AnalyserNode;
  private noise!: AudioBuffer;
  private drone: { oscs: OscillatorNode[]; gains: GainNode[]; filter: BiquadFilterNode; out: GainNode } | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get analyserNode(): AnalyserNode | null {
    return this.ctx ? this.analyser : null;
  }

  /** Create the graph. Must be called from a user gesture (autoplay policy). */
  ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    if (!AudioContextCtor) throw new Error("Web Audio is not supported in this browser");
    const ctx = new AudioContextCtor({ latencyHint: "interactive" });

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.7;

    this.bus = ctx.createGain();
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(ctx, 2.4);

    this.bus.connect(this.master);
    this.bus.connect(this.reverbSend);
    this.reverbSend.connect(reverb);
    reverb.connect(this.master);
    this.master.connect(limiter);
    limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.noise = this.noiseBuffer(ctx);
    this.ctx = ctx;
    return ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state !== "running") await ctx.resume();
  }

  setVolume(volume: number, muted: boolean): void {
    if (!this.ctx) return;
    const target = muted ? 0 : volumeToGain(volume);
    // τ = 40 ms keeps steps well under 6 dB per 100 ms.
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  setReverb(amount: number): void {
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.1);
  }

  /** Melodic note with attack/decay envelope, lowpass and stereo position. */
  pluck(midi: number, time: number, duration: number, opts: { wave: OscillatorType; gain: number; pan: number; cutoff: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = opts.wave;
    osc.frequency.setValueAtTime(midiToHz(midi), time);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.cutoff, time);
    filter.Q.value = 0.7;
    const env = ctx.createGain();
    const peak = Math.max(0.0002, opts.gain);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(peak, time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan)), time);
    osc.connect(filter).connect(env).connect(pan).connect(this.bus);
    osc.start(time);
    osc.stop(time + duration + 0.05);
    osc.onended = () => pan.disconnect();
  }

  /** Inharmonic bell for hot spots. */
  bell(midi: number, time: number, pan: number, strength: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), time);
    out.connect(panner).connect(this.bus);
    const base = midiToHz(midi);
    const partials: Array<[number, number, number]> = [
      [1, 1, 2.2],
      [2.76, 0.4, 1.4],
      [5.4, 0.18, 0.8],
    ];
    for (const [ratio, level, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * ratio, time);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.16 * level * (0.5 + strength)), time + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      osc.connect(env).connect(out);
      osc.start(time);
      osc.stop(time + decay + 0.05);
    }
    window.setTimeout(() => panner.disconnect(), (time - ctx.currentTime + 2.5) * 1000);
  }

  /** Short percussive hit. */
  hit(time: number, kind: "noise" | "tick", gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, time + (kind === "noise" ? 0.09 : 0.05));
    if (kind === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 6000;
      src.connect(filter).connect(env).connect(this.bus);
      src.start(time);
      src.stop(time + 0.12);
    } else {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1800, time);
      osc.frequency.exponentialRampToValueAtTime(600, time + 0.04);
      osc.connect(env).connect(this.bus);
      osc.start(time);
      osc.stop(time + 0.08);
    }
  }

  /** Decode a recorded note (MP3/WAV bytes) for `sample()`. */
  async decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
    return this.ensure().decodeAudioData(bytes);
  }

  /**
   * A recorded instrument note: plays `buffer` re-pitched by `rate`, held for `duration`, then
   * released. Envelope on both ends, so notes never click.
   */
  sample(
    buffer: AudioBuffer,
    rate: number,
    time: number,
    duration: number,
    opts: { gain: number; pan: number; attack?: number; release?: number },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const attack = opts.attack ?? 0.006;
    const release = opts.release ?? 0.3;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(rate, time);
    const env = ctx.createGain();
    const peak = Math.max(0.0002, opts.gain);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + attack);
    env.gain.setValueAtTime(peak, time + Math.max(attack, duration));
    env.gain.setTargetAtTime(0, time + Math.max(attack, duration), release / 4);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan)), time);
    src.connect(env).connect(pan).connect(this.bus);
    const end = time + Math.max(attack, duration) + release * 1.5;
    src.start(time);
    src.stop(Math.min(end, time + buffer.duration / rate));
    src.onended = () => pan.disconnect();
  }

  /** Start the sustained drone (root + fifth + a dissonant voice faded in by tension). */
  startDrone(wave: OscillatorType): void {
    const ctx = this.ctx;
    if (!ctx || this.drone) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    filter.connect(out).connect(this.bus);
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    [0, 7, 1].forEach((interval, i) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.detune.value = i === 1 ? 4 : 0;
      osc.frequency.value = midiToHz(38 + interval);
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0 : i === 0 ? 0.6 : 0.35;
      osc.connect(g).connect(filter);
      osc.start();
      oscs.push(osc);
      gains.push(g);
    });
    this.drone = { oscs, gains, filter, out };
  }

  updateDrone(time: number, rootMidi: number, level: number, brightness: number, tension: number): void {
    const d = this.drone;
    if (!d) return;
    const [root, fifth, clash] = d.oscs;
    root?.frequency.setTargetAtTime(midiToHz(rootMidi), time, 0.3);
    fifth?.frequency.setTargetAtTime(midiToHz(rootMidi + 7), time, 0.3);
    clash?.frequency.setTargetAtTime(midiToHz(rootMidi + 1), time, 0.3);
    d.gains[2]?.gain.setTargetAtTime(Math.min(0.5, tension * 0.6), time, 0.4);
    d.filter.frequency.setTargetAtTime(250 + brightness * 1400, time, 0.4);
    d.out.gain.setTargetAtTime(level, time, 0.3);
  }

  stopDrone(): void {
    const ctx = this.ctx;
    const d = this.drone;
    if (!ctx || !d) return;
    this.drone = null;
    d.out.gain.cancelScheduledValues(ctx.currentTime);
    d.out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    for (const osc of d.oscs) osc.stop(ctx.currentTime + 0.6);
    window.setTimeout(() => d.out.disconnect(), 800);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 987654;
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed / 4294967296) * 2 - 1;
        data[i] = noise * (1 - i / length) ** 3 * 0.5;
      }
    }
    return buffer;
  }
}
