import assert from 'node:assert/strict'
import { sliceMaximum } from '../src/components/main-deck/scan-value.ts'
const grid = {cols: 6, rows: 1, cells: Uint8Array.from([0,200,100,0,250,255]), real_min: -40, real_max:40, unit:'°C'}
assert.deepEqual(sliceMaximum(grid,0,3),{normalized:.8,col:1,row:0})
assert.deepEqual(sliceMaximum(grid,1,3),{normalized:.4,col:2,row:0})
assert.deepEqual(sliceMaximum(grid,2,3),{normalized:1,col:4,row:0})
assert.equal(sliceMaximum({...grid,cells:new Uint8Array(6).fill(255)},0,3),null)
assert.deepEqual(sliceMaximum({...grid,cells:new Uint8Array(6).fill(0)},0,3),{normalized:0,col:0,row:0})
assert.equal(sliceMaximum(undefined,0,16),null)
assert.equal(sliceMaximum(grid,0,0),null)
console.log('Scan readout: exact main slice boundaries, maximum, zero and no-data cases passed')
