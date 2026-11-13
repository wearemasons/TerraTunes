import assert from 'node:assert/strict'
import { buildEvents } from '../src/lib/audio/phenomena.ts'

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
const late = buildEvents([{ ...voice, notes: [-1, -1, -1, -1, -1, -1, -1, 45], durations: [0, 0, 0, 0, 0, 0, 0, 4] }], 4)
assert.equal(late[0].t, 3.5)
assert.equal(late[0].duration, 0.5, 'no dry note may cross the next composed chord')
console.log('Browser score-event regression checks passed.')
