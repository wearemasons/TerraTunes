import assert from 'node:assert/strict'
import { GirlRenderer } from '../src/lib/girlRenderer.ts'
const videos=[], images=[], draws=[], clears=[], frames=new Map(), timers=new Map()
let serial=0
const canvas={width:0,height:0,dataset:{},getContext:()=>({clearRect:(...a)=>clears.push(a),drawImage:(source)=>draws.push(source)})}
globalThis.window={setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)}
globalThis.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id}
globalThis.cancelAnimationFrame=id=>frames.delete(id)
class FakeImage {
 complete=false;naturalWidth=0
 constructor(){images.push(this)}
 resolve(){this.complete=true;this.naturalWidth=324;this.onload?.()}
}
class FakeVideo {
 paused=true;readyState=0;seeking=false;currentTime=0;duration=4;loop=false
 constructor(){videos.push(this)}
 load(){}
 removeAttribute(){}
 pause(){this.paused=true}
 play(){this.paused=false;return Promise.resolve()}
 resolve(){this.readyState=4;this.onloadeddata?.();this.oncanplay?.()}
}
globalThis.Image=FakeImage
globalThis.document={createElement:()=>new FakeVideo()}
const states=Object.fromEntries(['standing','sitting','sitdown','standup'].map(s=>[s,{video:`/${s}.webm`,still:`/${s}.webp`,duration:4}]))
const events=[]
const renderer=new GirlRenderer(canvas,{width:324,height:566,fps:12,states},state=>events.push(state))
const flush=async()=>{await Promise.resolve();await Promise.resolve()}
renderer.update(false,false)
const first=videos.at(-1),oldStill=images.at(-1)
first.resolve();await flush()
assert.equal(canvas.dataset.girlAsset,'standing')
const count=draws.length;oldStill.resolve()
assert.equal(draws.length,count,'late still must not paint over decoded alpha video')
assert.equal(frames.size,1,'loadeddata and canplay must start only one render loop')
renderer.update(true,false)
const down=videos.at(-1),lateImage=images.at(-1)
down.resolve();await flush();down.currentTime=1
const staleEnded=down.onended
renderer.update(false,false)
const up=videos.at(-1)
up.resolve();up.onseeked?.();await flush()
assert.equal(up.currentTime,3,'reverse must seek to matching progress')
assert.equal(canvas.dataset.girlAsset,'standup')
const before=draws.length;staleEnded();lateImage.resolve()
assert.equal(draws.length,before,'stale events must not redraw a superseded pose')
assert.equal(events.at(-1),'standup')
renderer.update(true,true)
assert.equal(videos.at(-1),up,'reduced motion must not create another video')
images.at(-1).resolve()
assert.equal(canvas.dataset.girlAsset,'sitting')
assert.equal(canvas.dataset.girlMode,'still')
renderer.update(false,true);const pending=images.at(-1)
renderer.dispose();const disposedCount=draws.length;pending.resolve()
assert.equal(draws.length,disposedCount,'unmounted callbacks must not repaint')
assert.equal(frames.size,0)
assert.equal(timers.size,0)
assert.equal(clears.length,draws.length,'every draw must clear the previous alpha plane')
console.log('Girl renderer: one loop/surface, late still, reversal, stale end, reduced motion and unmount races passed')
