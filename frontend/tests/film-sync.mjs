import assert from 'node:assert/strict'
import { STALL_LIMIT_MS, decideSync } from '../src/lib/filmSync.ts'

const moving = { time: 5, paused: false, seeking: false, readyState: 4, ended: false }
const voice = (time, extra = {}) => ({ time, paused: false, ended: false, duration: 14.7, ...extra })
const at = (ms) => ({ nowMs: ms, lastSeekMs: -Infinity, voiceHeldForPicture: false })

/** 1. the crash-repeat bug: a stalled picture must never drag the voice backwards */
assert.deepEqual(decideSync({ picture: { ...moving, time: 5, paused: true }, voice: voice(6.2), ...at(0) }), {
  kind: 'hold-voice',
})
assert.deepEqual(
  decideSync({ picture: { ...moving, paused: true, readyState: 1 }, voice: voice(9.9), ...at(0) }),
  { kind: 'hold-voice' },
)
assert.deepEqual(
  decideSync({ picture: { ...moving, seeking: true }, voice: voice(9.9), ...at(0) }),
  { kind: 'hold-voice' },
)
// a voice already waiting with the picture is left alone, not seeked again
assert.deepEqual(decideSync({ picture: { ...moving, paused: true }, voice: voice(5, { paused: true }), ...at(0) }), {
  kind: 'hold',
  reason: 'picture-stalled',
})

/** 2. small drift closes by rate, with no seam */
assert.deepEqual(decideSync({ picture: moving, voice: voice(5.3), ...at(0) }), { kind: 'rate', value: 0.97 })
assert.deepEqual(decideSync({ picture: moving, voice: voice(4.7), ...at(0) }), { kind: 'rate', value: 1.03 })
assert.deepEqual(decideSync({ picture: moving, voice: voice(5.03), ...at(0) }), { kind: 'steady' })

/** 3. big drift gets exactly one seek, then the cooldown decides */
assert.deepEqual(decideSync({ picture: moving, voice: voice(6.5), ...at(10000) }), { kind: 'seek', to: 5 })
assert.deepEqual(
  decideSync({ picture: moving, voice: voice(6.5), nowMs: 10500, lastSeekMs: 10000, voiceHeldForPicture: false }),
  { kind: 'rate', value: 0.97 },
  'a second seek inside the cooldown is the freeze-and-repeat bug',
)
assert.deepEqual(
  decideSync({ picture: moving, voice: voice(6.5), nowMs: 11600, lastSeekMs: 10000, voiceHeldForPicture: false }),
  { kind: 'seek', to: 5 },
)

/** 4. the picture may run ahead: the voice catches up, but never past its own end */
const seekTo = (pictureTime, voiceTime, duration) => {
  const action = decideSync({ picture: { ...moving, time: pictureTime }, voice: voice(voiceTime, { duration }), ...at(0) })
  assert.equal(action.kind, 'seek', `picture at ${pictureTime} against a voice at ${voiceTime}`)
  return action.to
}
// the voice is brought to the picture
assert.equal(seekTo(12, 10, 14.7), 12)
// a voice whose end is far enough away still reaches the picture exactly
assert.ok(Math.abs(seekTo(12.5, 11, 12.55) - 12.5) < 1e-9)
// and a short voice is stopped just inside its own end, never seeked past it
assert.ok(Math.abs(seekTo(12.5, 11, 12.52) - (12.52 - 0.05)) < 1e-12, 'stopped a hair short of the end')
assert.ok(seekTo(12.8, 11.9, 12.6) < 12.6, 'never seeked past the end of the voice')

/** 5. after the freeze nothing moves the voice: this is the second restart bug */
for (const drift of [0.3, 1.5, 4]) {
  assert.deepEqual(
    decideSync({ picture: { ...moving, time: 12.9 }, voice: voice(12.9 + drift), ...at(0) }),
    { kind: 'hold', reason: 'frozen' },
    'a frozen picture must not re-seek the narration',
  )
}
assert.deepEqual(decideSync({ picture: { ...moving, ended: true }, voice: voice(15), ...at(0) }), {
  kind: 'hold',
  reason: 'frozen',
})
assert.deepEqual(
  decideSync({ picture: { ...moving, paused: true, time: 13.4 }, voice: voice(15), ...at(0) }),
  { kind: 'hold', reason: 'frozen' },
  'a late canplay after the handover may not rewind the voice',
)

/** 6. sound turned off, or metadata missing, is not an invitation to seek */
assert.deepEqual(decideSync({ picture: moving, voice: voice(9, { paused: true }), ...at(0) }), {
  kind: 'hold',
  reason: 'voice-stopped',
})
assert.deepEqual(decideSync({ picture: moving, voice: voice(9, { ended: true }), ...at(0) }), {
  kind: 'hold',
  reason: 'voice-stopped',
})
assert.deepEqual(decideSync({ picture: moving, voice: voice(9, { duration: NaN }), ...at(0) }), {
  kind: 'hold',
  reason: 'voice-stopped',
})

/** 7. a voice held through a stall is released, not seeked, when the picture returns */
assert.deepEqual(
  decideSync({
    picture: moving,
    voice: voice(5, { paused: true }),
    nowMs: 0,
    lastSeekMs: -Infinity,
    voiceHeldForPicture: true,
  }),
  { kind: 'resume' },
)

/** 8. the waiting limit is a real number the component can use */
assert.equal(STALL_LIMIT_MS, 3200)

console.log('Film sync policy regression checks passed.')
