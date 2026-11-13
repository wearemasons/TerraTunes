import { create } from 'zustand'

/**
 * Cabinet state.
 *
 * `powered` is the physical switch: off means the artwork is unlit and the
 * carousel is dark. `loaded` is what sits in the cradle (a disc has travelled
 * there). `playing` is the needle being down.
 *
 * `arrived` is whether the visitor has done anything yet. Until they do, the
 * page stays in the world the opening film left them in — the aurora lake —
 * so the last frame of the film and the first frame of the app are the same
 * place. The record's own weather only arrives with the visitor's own action,
 * which keeps the world change motivated rather than arbitrary.
 */
interface UIState {
  arrived: boolean
  /** the opening film is on screen: nothing behind it is reachable */
  filmUp: boolean
  powered: boolean
  selectedId: string
  loadedId: string
  isPlaying: boolean
  volume: number
  highContrast: boolean
  reduceMotion: boolean
  mechanismMuted: boolean
  announcement: string
  /** live analyser level, published so the world can react to the sound */
  level: number

  setFilmUp: (v: boolean) => void
  setArrived: (v?: boolean) => void
  setPowered: (v: boolean) => void
  select: (id: string) => void
  setLoaded: (id: string) => void
  setPlaying: (v: boolean) => void
  setVolume: (v: number) => void
  setHighContrast: (v: boolean) => void
  setReduceMotion: (v: boolean) => void
  setMechanismMuted: (v: boolean) => void
  setLevel: (v: number) => void
  announce: (msg: string) => void
}

export const useUI = create<UIState>((set) => ({
  arrived: false,
  filmUp: false,
  powered: false,
  selectedId: 'surface-temperature',
  loadedId: '',
  isPlaying: false,
  volume: 0.72,
  highContrast: false,
  reduceMotion: false,
  mechanismMuted: false,
  announcement: '',
  level: 0,

  setFilmUp: (v) => set({ filmUp: v }),
  setArrived: (v = true) => set({ arrived: v }),
  setPowered: (v) => set({ powered: v, ...(v ? {} : { isPlaying: false }) }),
  select: (id) => set({ selectedId: id }),
  setLoaded: (id) => set({ loadedId: id }),
  setPlaying: (v) => set({ isPlaying: v }),
  setVolume: (v) => set({ volume: v }),
  setHighContrast: (v) => set({ highContrast: v }),
  setReduceMotion: (v) => set({ reduceMotion: v }),
  setMechanismMuted: (v) => set({ mechanismMuted: v }),
  // skip no-op writes: every subscriber re-renders on any set()
  setLevel: (v) => set((s) => (s.level === v ? s : { level: v })),
  announce: (msg) => set({ announcement: msg }),
}))
