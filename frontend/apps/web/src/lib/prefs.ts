// Per-viewer conveniences in localStorage. Never needed for correctness: defaults apply when
// storage is blocked (private mode, previews), so every access is wrapped.

import { useSyncExternalStore } from "react";

export interface Prefs {
  volume: number;
  muted: boolean;
  highContrast: boolean;
  shortcuts: boolean;
  announceFrames: boolean;
}

const KEY = "teratones:prefs:v1";
const DEFAULTS: Prefs = {
  volume: 0.7,
  muted: false,
  highContrast: false,
  shortcuts: true,
  announceFrames: false,
};

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULTS.muted,
      highContrast: typeof parsed.highContrast === "boolean" ? parsed.highContrast : DEFAULTS.highContrast,
      shortcuts: typeof parsed.shortcuts === "boolean" ? parsed.shortcuts : DEFAULTS.shortcuts,
      announceFrames: typeof parsed.announceFrames === "boolean" ? parsed.announceFrames : DEFAULTS.announceFrames,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Prefs = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: keep the in-memory value for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
