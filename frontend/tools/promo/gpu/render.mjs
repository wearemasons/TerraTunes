// Drive the compositor in GPU Edge.  node render.mjs stills 1,5,9   |   node render.mjs film out.mp4
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RIG = dirname(fileURLToPath(import.meta.url));
const REPO = "D:/TerraTunes";
const FONTS = `${REPO}/frontend/node_modules/@fontsource-variable`;
const MAP = {
  "/film.html": `${RIG}/film.html`,
  "/film.js": `${RIG}/film.js`,
  "/mp4-muxer.mjs": `${RIG}/node_modules/mp4-muxer/build/mp4-muxer.mjs`,
  "/fonts/fraunces.woff2": `${FONTS}/fraunces/files/fraunces-latin-wght-normal.woff2`,
  "/fonts/nunito.woff2": `${FONTS}/nunito/files/nunito-latin-wght-normal.woff2`,
  "/audio/vo.wav": `${REPO}/assets/demo-voiceover-v3.mp3`,
  "/audio/bed.wav": `${RIG}/sst.wav`,
  "/vtt": `${REPO}/assets/demo-subtitles-v3.en.vtt`,
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".wav": "audio/wav" };
const [mode = "stills", arg = "1,5"] = process.argv.slice(2);

const browser = await chromium.launch({
  channel: "msedge", headless: false,
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-zero-copy", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required", "--window-size=1000,620"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

let outBytes = null;
await page.route("http://localhost:9917/**", async (route) => {
  const req = route.request(), path = decodeURIComponent(new URL(req.url()).pathname);
  if (path === "/out") { outBytes = req.postDataBuffer(); return route.fulfill({ status: 200, body: "ok" }); }
  if (path.startsWith("/api/")) {
    const r = await fetch(`http://127.0.0.1:8000${path.slice(4)}`);
    return route.fulfill({ status: r.status, contentType: r.headers.get("content-type") || "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) });
  }
  let file = MAP[path];
  if (!file && path.startsWith("/cap/")) file = join(RIG, path);
  if (!file && path.startsWith("/art/")) file = `${REPO}/frontend/public${path}`;
  if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: "nf " + path });
  route.fulfill({ status: 200, contentType: TYPES[extname(file)] || "application/octet-stream", body: readFileSync(file) });
});

await page.goto("http://localhost:9917/film.html");
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2"); const e = gl?.getExtension("WEBGL_debug_renderer_info");
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "n/a";
});
console.log("GPU:", gpu);

if (mode === "stills") {
  mkdirSync(join(RIG, "stills"), { recursive: true });
  for (const t of arg.split(",").map(Number)) {
    const url = await page.evaluate((t) => window.renderStill(t), t);
    writeFileSync(join(RIG, "stills", `t${t.toFixed(2)}.jpg`), Buffer.from(url.split(",")[1], "base64"));
  }
  console.log("stills done");
} else {
  const info = await page.evaluate(() => window.renderFilm(), null);
  console.log("encode:", JSON.stringify(info));
  for (let i = 0; i < 100 && !outBytes; i++) await new Promise((r) => setTimeout(r, 100));
  writeFileSync(arg, outBytes);
  console.log("wrote", arg, outBytes.length);
}
await browser.close();
