/**
 * The one decision the opening film cannot get wrong: how the voice follows the picture.
 *
 * The first version of this file did not exist. The overlay looped inline and hard-seeked
 * the narration whenever picture and voice differed by more than 0.12 s. On a real machine
 * that is fine until the picture stalls for a moment — buffering, a slow decode, a tab that
 * lost its renderer — because then the voice keeps running, the gap grows, and the loop
 * drags it backwards on every animation frame. Sixty rewinds a second is exactly the sound
 * of a computer crashing, and it is what visitors reported on first start.
 *
 * So the policy lives here, as a pure function of two clocks, tested directly in
 * `tests/film-sync.mjs` instead of being rediscovered in a browser fifteen seconds at a time:
 *
 *   - if the picture is not moving, the voice waits with it. Nothing is ever seeked backwards.
 *   - small drift is closed with the playback rate, which has no audible seam.
 *   - large drift gets one seek, then a cooldown, so a seek can never repeat per frame.
 *   - once the picture has frozen on its match frame or ended, the answer is always `hold`:
 *     a late `canplay` may not start the roll again, and may not pull the voice backwards.
 */

export interface PictureClock {
  /** seconds */
  time: number
  paused: boolean
  seeking: boolean
  /** HTMLMediaElement.readyState, 0..4 */
  readyState: number
  ended: boolean
}

export interface VoiceClock {
  time: number
  paused: boolean
  ended: boolean
  /** NaN before the metadata has arrived, which is not a licence to seek */
  duration: number
}

export type SyncAction =
  /** do nothing to the voice: the handover has begun, the picture is waiting, or sound is off */
  | { kind: 'hold'; reason: 'frozen' | 'picture-stalled' | 'voice-stopped' }
  /** the voice ran ahead of a stalled picture: pause it, do not rewind it */
  | { kind: 'hold-voice' }
  /** the picture is moving again after a stall: let the voice go */
  | { kind: 'resume' }
  /** jump the voice to the picture — one time only, then the cooldown decides */
  | { kind: 'seek'; to: number }
  /** close a small gap by ear, not by seam */
  | { kind: 'rate'; value: number }
  /** in step: put the rate back to exactly one */
  | { kind: 'steady' }

export interface SyncLimits {
  /** seconds: the freeze point where the live cabinet takes over */
  matchAt: number
  /** seconds of drift beyond which nudging is pointless */
  hardSeekAfter: number
  /** milliseconds between two hard seeks */
  seekCooldownMs: number
  /** the nudge applied to close a gap */
  nudgeRate: number
  /** |drift| under this is already in step */
  tolerance: number
}

export const DEFAULT_SYNC_LIMITS: SyncLimits = {
  matchAt: 12.9,
  hardSeekAfter: 0.6,
  seekCooldownMs: 1500,
  nudgeRate: 0.03,
  tolerance: 0.05,
}

/** how long a stalled picture may be waited for before the page is handed over anyway */
export const STALL_LIMIT_MS = 3200

export interface SyncInput {
  picture: PictureClock
  voice: VoiceClock
  /** now, in milliseconds */
  nowMs: number
  /** when the last hard seek happened, or -Infinity for none yet */
  lastSeekMs: number
  /** true when the voice is paused only because the picture stalled */
  voiceHeldForPicture: boolean
  limits?: SyncLimits
}

export function decideSync({
  picture,
  voice,
  nowMs,
  lastSeekMs,
  voiceHeldForPicture,
  limits = DEFAULT_SYNC_LIMITS,
}: SyncInput): SyncAction {
  // The handover has begun. The picture is frozen on purpose, so the voice is left alone:
  // it is still saying the last sentence over the live cabinet.
  if (picture.ended || picture.time >= limits.matchAt) return { kind: 'hold', reason: 'frozen' }

  const pictureMoving = !picture.paused && !picture.seeking && picture.readyState >= 2
  if (!pictureMoving) {
    return voice.paused ? { kind: 'hold', reason: 'picture-stalled' } : { kind: 'hold-voice' }
  }
  if (voiceHeldForPicture && voice.paused && !voice.ended) return { kind: 'resume' }
  if (voice.paused || voice.ended || Number.isNaN(voice.duration)) {
    return { kind: 'hold', reason: 'voice-stopped' }
  }

  const drift = voice.time - picture.time
  if (Math.abs(drift) <= limits.tolerance) return { kind: 'steady' }

  if (Math.abs(drift) > limits.hardSeekAfter && nowMs - lastSeekMs >= limits.seekCooldownMs) {
    // Never seek the voice past its own end.
    return { kind: 'seek', to: Math.max(0, Math.min(picture.time, voice.duration - 0.05)) }
  }
  // The voice is ahead: slow it down. The picture is ahead: speed the voice up.
  return { kind: 'rate', value: drift > 0 ? 1 - limits.nudgeRate : 1 + limits.nudgeRate }
}
