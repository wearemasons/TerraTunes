import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2];
const b = await chromium.launch({ channel: "msedge", headless: false, args: ["--use-angle=d3d11"] });
const p = await b.newPage();
await p.route("http://localhost:9917/**", (r) => r.request().url().endsWith(".mp4")
  ? r.fulfill({ status: 200, contentType: "video/mp4", body: readFileSync(f) })
  : r.fulfill({ status: 200, contentType: "text/html", body: "<video id=v muted></video><canvas id=c width=480 height=270></canvas>" }));
await p.goto("http://localhost:9917/");
const info = await p.evaluate(async () => {
  const v = document.getElementById("v"); v.src = URL.createObjectURL(await (await fetch("/f.mp4")).blob()); await new Promise((r) => (v.readyState >= 1 ? r() : (v.onloadedmetadata = r)));
  const ab = await (await fetch("/f.mp4")).arrayBuffer();
  const buf = await new AudioContext().decodeAudioData(ab);
  const d = buf.getChannelData(0), sr = buf.sampleRate, rms = [];
  for (let s = 0; s < Math.floor(buf.duration); s++) { let e = 0; for (let i = s * sr; i < (s + 1) * sr; i++) e += d[i] * d[i]; rms.push(+Math.sqrt(e / sr).toFixed(3)); }
  const shots = [];
  for (const t of [0.5, 2.5, 4.1, 5.0, 6.8, 9.0, 10.5, 12.0, 13.5, 15.5, 17.0, 19.0, 21.0, 23.0, 24.4, 29.5]) {
    v.currentTime = t; await new Promise((r) => (v.onseeked = r)); await new Promise((r) => v.requestVideoFrameCallback ? setTimeout(r, 120) : r());
    const c = document.getElementById("c").getContext("2d"); c.drawImage(v, 0, 0, 480, 270); shots.push(document.getElementById("c").toDataURL("image/jpeg", 0.8));
  }
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, aDur: buf.duration, aRate: buf.sampleRate, rms, shots };
});
info.shots.forEach((s, i) => writeFileSync(`v${String(i).padStart(2, "0")}.jpg`, Buffer.from(s.split(",")[1], "base64")));
delete info.shots; console.log(JSON.stringify(info));
await b.close();
