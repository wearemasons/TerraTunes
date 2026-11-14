import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
await p.route("http://localhost:9917/**", (r) => r.request().url().endsWith(".mp3")
  ? r.fulfill({ status: 200, contentType: "audio/mpeg", body: readFileSync(process.argv[2]) })
  : r.fulfill({ status: 200, contentType: "text/html", body: "<p>x</p>" }));
await p.goto("http://localhost:9917/");
const out = await p.evaluate(async () => {
  const ab = await (await fetch("/v.mp3")).arrayBuffer();
  const buf = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(ab);
  const d = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.round(sr * 0.02);
  let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
  const on = []; for (let i = 0; i + hop < d.length; i += hop) { let m = 0; for (let j = i; j < i + hop; j++) m = Math.max(m, Math.abs(d[j])); on.push(m > peak * 0.06); }
  const segs = []; let s = null, last = -1;
  on.forEach((v, i) => { if (!v) return; if (s === null) s = i; else if ((i - last) * 0.02 > 0.16) { segs.push([s, last]); s = i; } last = i; });
  if (s !== null) segs.push([s, last]);
  return { dur: buf.duration, sr, ch: buf.numberOfChannels, peak, segs: segs.map(([a, z]) => [+(a * 0.02).toFixed(2), +(z * 0.02 + 0.02).toFixed(2)]) };
});
console.log(JSON.stringify(out));
await b.close();
