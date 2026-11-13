/**
 * The opening film.
 *
 * One 15-second animated cut scene plays before the cabinet is ever touched. It
 * is the "why" of TerraTunes in four sentences: NASA paints the planet's
 * weather, blind and low-vision people are left out of that painting, every
 * pixel is measured and scored as sound, so listen.
 *
 * Picture and sound ship as two files on purpose. The film's last two seconds
 * dissolve away from the girl and the cabinet into empty sky, which is a lovely
 * ending for a film and a bad one for a home page: the app has a cabinet in it.
 * So the picture freezes at `matchAt`, on the frame where the painted girl and
 * the painted cabinet sit almost exactly where the React components put them,
 * and the live page cross-fades up underneath it while the last sentence is
 * still being spoken. Nothing in the film had to be re-cut to do it.
 *
 * The narration timings were measured from the delivered audio track (a 1.05x
 * speed correction on the recorded take), so every caption sits on a real word
 * boundary rather than a guess. The four sentences are also kept here in full:
 * that text is the equivalent of the film for a screen reader, for the
 * "read the film" panel, and for a video that fails to load.
 */

export interface BootCue {
  /** seconds from the start of the film */
  start: number
  end: number
  text: string
}

export const BOOT_FILM = {
  /** picture only: no audio track, so it can hold its last frame */
  video: '/video/boot-film.mp4',
  audio: '/video/boot-film.mp3',
  /** first frame, so the overlay never flashes white */
  poster: '/art/boot-poster.webp',
  /** total picture length, in seconds */
  duration: 15.0,
  /** where the picture stops and the live cabinet takes over */
  matchAt: 12.9,
  /** how long that cross-fade lasts */
  fadeMs: 1250,
  /** where the sound ends */
  audioEnd: 14.74,

  /** the film's own frame size, in px — the match-move crops against it */
  frame: [1280, 720],
  /**
   * Where the painted cabinet and the painted girl sit in that final frame,
   * measured off the delivered frame with a 10% grid. The cabinet is cropped at
   * the right edge and the girl at the bottom, which is why the cabinet is
   * pinned by its top-left corner and she is pinned by her feet.
   */
  cabinetBox: { l: 0.655, t: 0.26, w: 0.33, h: 0.74 },
  girlBox: { l: 0.135, t: 0.285, w: 0.31, h: 0.715 },
} as const

export const BOOT_CUES: readonly BootCue[] = [
  { start: 0.0, end: 2.9, text: 'Every day, NASA paints our planet’s weather.' },
  { start: 3.37, end: 6.43, text: 'But if you can’t see it, that story stays silent.' },
  { start: 7.09, end: 11.04, text: 'TerraTunes measures every pixel — and scores it as sound.' },
  { start: 11.64, end: 14.05, text: 'Don’t just watch the Earth change. Listen.' },
] as const

/** The whole narration as prose: the accessible text equivalent of the film. */
export const BOOT_TRANSCRIPT = BOOT_CUES.map((c) => c.text).join(' ')

/** Index of the caption that belongs on screen at `t` seconds, or -1 for none. */
export function cueAt(t: number): number {
  for (let i = 0; i < BOOT_CUES.length; i++) {
    const c = BOOT_CUES[i]!
    if (t >= c.start && t < c.end) return i
  }
  return -1
}

/**
 * Sound never starts by itself: the film is silent until the visitor asks, and
 * the captions tell the story either way.
 */
export const BOOT_SOUND_OFF = 'Sound is off.'

/** the film ends with the switch already thrown, so the ask is the needle */
export const BOOT_HINT = 'Press the jewel to drop the needle.'
