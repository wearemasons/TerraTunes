import type { PresetId, ThemeId } from "@main/lib/api/types";

export interface Timbre {
  melody: OscillatorType;
  drone: OscillatorType;
  /** 0..1 drone level multiplier; 0 disables the drone. */
  droneLevel: number;
  rhythm: "noise" | "tick" | "none";
  bell: boolean;
  /** Dissonant extra voice when the picture changes fast. */
  tension: boolean;
  reverb: number;
  /** Lowpass base for melody, Hz. */
  filterBase: number;
}

const THEME_TIMBRES: Record<ThemeId, Timbre> = {
  sea_level: { melody: "sine", drone: "triangle", droneLevel: 1, rhythm: "none", bell: true, tension: true, reverb: 0.4, filterBase: 1400 },
  air_quality: { melody: "triangle", drone: "sawtooth", droneLevel: 0.6, rhythm: "noise", bell: true, tension: true, reverb: 0.35, filterBase: 1100 },
  wildfires: { melody: "triangle", drone: "sawtooth", droneLevel: 0.8, rhythm: "tick", bell: true, tension: true, reverb: 0.25, filterBase: 1800 },
  greenhouse_gases: { melody: "sawtooth", drone: "sawtooth", droneLevel: 1, rhythm: "none", bell: false, tension: true, reverb: 0.45, filterBase: 900 },
  water: { melody: "sine", drone: "sine", droneLevel: 0.7, rhythm: "noise", bell: true, tension: true, reverb: 0.5, filterBase: 2000 },
  agriculture: { melody: "triangle", drone: "triangle", droneLevel: 0.5, rhythm: "tick", bell: true, tension: true, reverb: 0.3, filterBase: 2200 },
  biodiversity: { melody: "sine", drone: "triangle", droneLevel: 0.6, rhythm: "noise", bell: true, tension: true, reverb: 0.45, filterBase: 2400 },
  energy: { melody: "square", drone: "sawtooth", droneLevel: 0.6, rhythm: "tick", bell: true, tension: true, reverb: 0.2, filterBase: 1300 },
  disasters: { melody: "sawtooth", drone: "sawtooth", droneLevel: 0.9, rhythm: "tick", bell: true, tension: true, reverb: 0.3, filterBase: 1200 },
  weather: { melody: "triangle", drone: "triangle", droneLevel: 0.8, rhythm: "noise", bell: true, tension: true, reverb: 0.35, filterBase: 1600 },
  ocean: { melody: "sine", drone: "sine", droneLevel: 1, rhythm: "none", bell: true, tension: true, reverb: 0.5, filterBase: 1500 },
};

/** "Clear tone": pitch only, no music. For listeners who find harmony distracting. */
const CLEAR: Timbre = {
  melody: "sine",
  drone: "sine",
  droneLevel: 0,
  rhythm: "none",
  bell: false,
  tension: false,
  reverb: 0,
  filterBase: 4000,
};

/** "Orchestra": the Clear tone on real instruments (see ./orchestra.ts); only the hall is set here. */
const ORCHESTRA: Timbre = { ...CLEAR, reverb: 0.6 };

export function timbreFor(theme: ThemeId, preset: PresetId): Timbre {
  if (preset === "orchestra") return ORCHESTRA;
  return preset === "clear" ? CLEAR : THEME_TIMBRES[theme];
}
