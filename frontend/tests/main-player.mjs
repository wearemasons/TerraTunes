import assert from 'node:assert/strict'
import { Player } from '../src/main-engine/audio/player.ts'
import { DEFAULT_PRESET } from '../src/main-engine/lib/api/types.ts'
import { orchestrationFor } from '../src/main-engine/audio/orchestra.ts'

const p = new Player()
assert.equal(DEFAULT_PRESET, 'orchestra')
assert.equal(p.getSnapshot().preset, 'orchestra')
assert.equal(p.instrumentsAvailable, false, 'configured URL alone does not prove decoded samples')
p.setPreset('clear')
const score = {
  mapping_version: '2', track_id: 'test', preset: 'clear',
  key: { root: 'D', root_midi: 62, scale: 'mixolydian', bpm: 72 },
  grid: { cols: 96, rows: 48 }, steps_per_frame: 16,
  frames: Array.from({length: 3}, (_, index) => ({
    index, label: `Frame ${index+1}`, tension: 0, loudness: .3, brightness: .2,
    rhythm_density: 1, column_notes: [62, 64, 67], hotspot: null,
    stats: { mean: .2, min: .1, max: .3, extreme_share: 0 }, description: 'test frame',
  })),
}
p.load({trackId: 'test', score, theme: 'weather'})
assert.equal(p.getSnapshot().frameCount, 3)
p.seek(99); assert.equal(p.getSnapshot().frame, 2)
p.step(-1); assert.equal(p.getSnapshot().frame, 1)
p.seek(-10); assert.equal(p.getSnapshot().frame, 0)
p.setVolume(2); assert.equal(p.getSnapshot().volume, 1)
p.setVolume(-1); assert.equal(p.getSnapshot().volume, 0)
p.setMuted(true); assert.equal(p.getSnapshot().muted, true)
p.setMode('explore'); assert.equal(p.getSnapshot().mode, 'explore')
assert.equal(p.getSnapshot().status, 'idle')
p.setMode('overview'); assert.equal(p.getSnapshot().mode, 'overview')
assert.notEqual(orchestrationFor('wind-speed','weather').lead, orchestrationFor('carbon-monoxide','air_quality').lead)
p.unload(); assert.equal(p.getSnapshot().trackId, null)
console.log('Main player: presets, frame seeking, volume, mute, Explore and instrument readiness passed')
