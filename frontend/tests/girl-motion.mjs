import assert from 'node:assert/strict'
import {nextGirlMotion} from '../src/lib/girlMotion.ts'
assert.equal(nextGirlMotion('standing',false,0,false),null)
assert.deepEqual(nextGirlMotion('standing',true,0,false),{state:'sitdown',progress:0,still:false})
assert.equal(nextGirlMotion('sitdown',true,.3,false),null)
assert.deepEqual(nextGirlMotion('sitdown',false,.25,false),{state:'standup',progress:.75,still:false})
assert.deepEqual(nextGirlMotion('standup',true,.25,false),{state:'sitdown',progress:.75,still:false})
assert.deepEqual(nextGirlMotion('sitdown',false,0,false),{state:'standing',progress:0,still:false})
assert.deepEqual(nextGirlMotion('standup',true,0,false),{state:'sitting',progress:0,still:false})
assert.deepEqual(nextGirlMotion('sitting',false,0,false),{state:'standup',progress:0,still:false})
assert.equal(nextGirlMotion('sitting',true,0,false),null)
for (const state of ['standing','sitting','sitdown','standup']) {
 assert.deepEqual(nextGirlMotion(state,true,.5,true),{state:'sitting',progress:0,still:true})
 assert.deepEqual(nextGirlMotion(state,false,.5,true),{state:'standing',progress:0,still:true})
}
console.log('Girl motion: idle, play, pause, reversal, interrupted loading and reduced-motion policy passed')
