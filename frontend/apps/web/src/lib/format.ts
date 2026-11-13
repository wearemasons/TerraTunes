const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;

/** MIDI note number → name with octave, e.g. 62 → "D4". */
export function midiToName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] ?? "C";
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Grid position (0..1 west→east, 0..1 north→south) → "12°N, 45°W" on an equirectangular map. */
export function formatLatLon(x: number, y: number): string {
  const lon = -180 + x * 360;
  const lat = 90 - y * 180;
  const latText = `${Math.abs(Math.round(lat))}°${lat >= 0 ? "N" : "S"}`;
  const lonText = `${Math.abs(Math.round(lon))}°${lon >= 0 ? "E" : "W"}`;
  return `${latText}, ${lonText}`;
}

/** Rough region name for spoken descriptions. Honest about being approximate. */
export function describeRegion(x: number, y: number): string {
  const ns = y < 0.33 ? "northern" : y > 0.67 ? "southern" : "equatorial";
  const ew = x < 0.33 ? "western" : x > 0.67 ? "eastern" : "central";
  return `${ns} ${ew} part of the map (${formatLatLon(x, y)})`;
}

export function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatSigned(value: number): string {
  const text = formatValue(value);
  return value > 0 ? `+${text}` : text;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDurationSpoken(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} seconds`;
  return s === 0 ? `${m} minute${m === 1 ? "" : "s"}` : `${m} min ${s} s`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
