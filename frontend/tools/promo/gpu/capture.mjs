// Capture the live TerraTunes site driving itself (?promo=1) in GPU Edge.
// Writes JPEG screencast frames + timeline.json (frame times, clicks, promo log).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "cap";
const SECONDS = Number(process.argv[3] || 44);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "f"), { recursive: true });

const browser = await chromium.launch({
  channel: "msedge",
  headless: false,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--use-angle=d3d11",
    "--window-size=1940,1200",
    "--hide-scrollbars",
    "--disable-features=Translate,msEdgeSidebarV2",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  const rec = (kind, el, extra = {}) => {
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    (window.__clicks ||= []).push({
      t: Date.now(), kind,
      x: r ? r.x + r.width / 2 : null, y: r ? r.y + r.height / 2 : null,
      w: r ? r.width : 0, h: r ? r.height : 0,
      label: el ? (el.getAttribute?.("aria-label") || (el.textContent || "").trim().slice(0, 50)) : "",
      path: location.pathname, ...extra,
    });
  };
  addEventListener("click", (e) => rec("click", e.target.closest?.("button,[role=button],a") || e.target), true);
  document.addEventListener("keydown", (e) => rec("key", null, { key: e.key }), true);
});
const page = await ctx.newPage();

// warm up (fonts, art, API caches) so the take is not dominated by loading
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "no webgl";
});
console.log("GPU:", gpu);
await page.evaluate(() => sessionStorage.clear());

const cdp = await ctx.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const name = `${String(n++).padStart(5, "0")}.jpg`;
  writeFileSync(join(OUT, "f", name), Buffer.from(data, "base64"));
  frames.push({ t: metadata.timestamp, name });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

const t0 = Date.now() / 1000;
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await page.goto("http://localhost:5173/?promo=1");

const promo = [];
const clicks = [];
const poll = setInterval(async () => {
  try {
    const s = await page.evaluate(() => {
      const c = window.__clicks || []; window.__clicks = [];
      return { c, p: window.__promo || [], path: location.pathname, done: document.documentElement.dataset.promoDone };
    });
    clicks.push(...s.c);
    for (const e of s.p) if (!promo.some((q) => q.label === e.label && q.path === s.path && q.at === e.at)) promo.push({ ...e, path: s.path, seen: Date.now() / 1000 });
  } catch {}
}, 200);

await page.waitForTimeout(SECONDS * 1000);
clearInterval(poll);
await cdp.send("Page.stopScreencast");
await page.waitForTimeout(300);
writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ t0, gpu, frames, clicks, promo }, null, 1));
console.log(`frames ${frames.length}, clicks ${clicks.length}, promo steps ${promo.length}`);
console.log(promo.map((p) => `${(p.seen - t0).toFixed(1)} ${p.path} ${p.label} ${p.ok}`).join("\n"));
await browser.close();
