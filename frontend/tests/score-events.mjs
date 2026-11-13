import assert from 'node:assert/strict'
import { buildEvents, easeGainTargets } from '../src/lib/audio/phenomena.ts'

const toDb = (value) => 20 * Math.log10(Math.max(0.0001, value))

const voice = {
  instrument: 'bass',
  notes: [38, -1, -1, -1, -1, -1, -1, -1],
  gains: [0.1, 0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0],
  durations: [7.8, 0, 0, 0, 0, 0, 0, 0],
  values: Array(8).fill(0.4),
  pitch_targets: Array(8).fill(38),
}
const events = buildEvents([voice], 4, Array(8).fill(1), 8)
assert.equal(events.length, 1, 'a held tone is one attack')
assert.equal(events[0].midi, 38)
assert.equal(events[0].duration, 3.9, 'duration must be exactly the stored grid-step duration')
assert.equal(events[0].gainTargets.length, 8, 'gain knots inside rests still automate a held note')
assert.equal(events[0].gainTargets[3].offset, 1.5)
assert.ok(Math.abs(events[0].gainTargets[3].value - 0.28 * 0.4) < 1e-12)
assert.equal(buildEvents([{ ...voice, notes: Array(8).fill(-1) }], 4).length, 0)

const eased = easeGainTargets([
  { offset: 0, value: 0.2 },
  { offset: 1, value: 0.8 },
  { offset: 2, value: 0.3 },
])
assert.equal(eased.length, 67, 'v16 easing uses 33 sampled subramps per interval')
assert.equal(eased[0].offset, 0)
assert.equal(eased.at(-1).offset, 2)
assert.equal(eased[0].value, 0.2, 'easing must preserve the first endpoint')
assert.equal(eased.at(-1).value, 0.3, 'easing must preserve the final endpoint')
for (let i = 1; i < eased.length; i++) {
  const previous = eased[i - 1]
  const current = eased[i]
  const slope = Math.abs(toDb(current.value) - toDb(previous.value)) / (current.offset - previous.offset)
  assert.ok(slope <= 45 + 1e-9, 'sampled dB slope must stay within 45 dB/s')
}
for (let interval = 0; interval < 2; interval++) {
  const start = eased[interval * 33].value
  const end = eased[(interval + 1) * 33].value
  const lo = Math.min(start, end) - 1e-12
  const hi = Math.max(start, end) + 1e-12
  for (const target of eased.slice(interval * 33, (interval + 1) * 33 + 1)) {
    assert.ok(target.value >= lo && target.value <= hi, 'cubic easing must not overshoot a knot interval')
  }
}

const late = buildEvents([{ ...voice, notes: [-1, -1, -1, -1, -1, -1, -1, 45], durations: [0, 0, 0, 0, 0, 0, 0, 4] }], 4)
assert.equal(late[0].t, 3.5)
assert.equal(late[0].duration, 0.5, 'no dry note may cross the next composed chord')
console.log('Browser score-event regression checks passed.')
