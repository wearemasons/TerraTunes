// TerraTunes 30 s demo compositor. Runs in GPU Edge: canvas 2D (GPU raster) for the
// motion graphics, WebCodecs (hardware H.264 + AAC) for the encode, mp4-muxer to wrap.
import { Muxer, ArrayBufferTarget } from "/mp4-muxer.mjs";

const W = 1920, H = 1080, FPS = 30, DUR = 30, NF = FPS * DUR;
const INK = "#3a2a18", PAPER = "#fdf3dd", BRASS = "#a9773d", AMBER = "#f7b955";
const cv = document.getElementById("c");
cv.width = W; cv.height = H;
const ctx = cv.getContext("2d", { alpha: false });

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sat = (v) => clamp(v, 0, 1);
const lerp = (a, b, k) => a + (b - a) * k;
const eio = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const eout = (k) => 1 - (1 - k) ** 3;
const eback = (k) => { const c = 1.6; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const ramp = (t, a, d) => sat((t - a) / d);
const win = (t, a, b, fi = 0.25, fo = 0.25) => Math.min(ramp(t, a, fi), 1 - ramp(t, b - fo, fo));
const SERIF = "Fraunces", SANS = "Nunito";
const font = (w, px, fam = SANS) => `${w} ${px}px ${fam}`;

function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

// ---------- assets ----------
const loadImg = async (url) => createImageBitmap(await (await fetch(url)).blob());
await Promise.all([
  new FontFace(SERIF, "url(/fonts/fraunces.woff2)", { weight: "100 900" }).load().then((f) => document.fonts.add(f)),
  new FontFace(SANS, "url(/fonts/nunito.woff2)", { weight: "200 1000" }).load().then((f) => document.fonts.add(f)),
]);
const tl = await (await fetch("/cap/timeline.json")).json();
const T0 = tl.frames[0].t;
const capT = tl.frames.map((f) => f.t - T0);
// clicks in capture seconds; drop re-fires at the same spot within 0.4 s
const clicks = [];
for (const c of tl.clicks) {
  if (c.x == null) continue;
  const ct = c.t / 1000 - T0;
  const last = clicks[clicks.length - 1];
  if (last && ct - last.ct < 0.4 && Math.hypot(last.x - c.x, last.y - c.y) < 30) continue;
  clicks.push({ ct, x: c.x, y: c.y, label: c.label });
}
const nasa = await Promise.all([...Array(20)].map((_, i) => loadImg(`/api/tracks/sea-surface-temperature/frames/${i}`)));
const nasaPix = nasa.map((im) => {
  const oc = new OffscreenCanvas(160, 80), o = oc.getContext("2d");
  o.drawImage(im, 0, 0, 160, 80);
  return o.getImageData(0, 0, 160, 80).data;
});
const TRACKS = ["surface-temperature", "wind-speed", "precipitation", "fine-particulates", "surface-ozone", "carbon-monoxide", "nitrogen-oxides", "sea-surface-temperature", "vegetation"];
const TRACK_NAMES = ["Near-Surface Temperature", "Wind Speed", "Precipitation", "Fine Particulates", "Surface Ozone", "Carbon Monoxide", "Nitrogen Oxides", "Sea Surface Temperature", "Vegetation"];
const SST = 7, RAIN = 2;
const pixOf = (im) => { const oc = new OffscreenCanvas(160, 80), o = oc.getContext("2d"); o.drawImage(im, 0, 0, 160, 80); return o.getImageData(0, 0, 160, 80).data; };
const wall = await Promise.all(TRACKS.map((id, i) => (i === SST ? nasa
  : Promise.all([0, 2, 4, 6, 8, 10, 12, 14, 16, 18].map((f) => loadImg(`/api/tracks/${id}/frames/${f}`))))));
const rainPix = wall[RAIN].map(pixOf);
// the night world, with its painted crescent moon removed so the Earth record is the only moon
const night = await (async () => {
  const im = await loadImg("/art/world-night.webp"), oc = new OffscreenCanvas(im.width, im.height), o = oc.getContext("2d");
  o.drawImage(im, 0, 0);
  const mx = im.width * 0.219, my = im.height * 0.185, rr = im.width * 0.06;
  const px = o.getImageData(Math.round(mx + rr * 1.6), Math.round(my), 1, 1).data;
  const g = o.createRadialGradient(mx, my, rr * 0.6, mx, my, rr * 1.5);
  g.addColorStop(0, `rgba(${px[0]},${px[1]},${px[2]},1)`); g.addColorStop(1, `rgba(${px[0]},${px[1]},${px[2]},0)`);
  o.fillStyle = g; o.fillRect(mx - rr * 2, my - rr * 2, rr * 4, rr * 4);
  return oc;
})();
const disc = await loadImg("/art/discs/earth.webp");
const GIRL = {};
for (const n of ["greet", "listen", "point", "v2-sitting", "v2-standing"]) GIRL[n] = await loadImg(`/art/girl-${n}.webp`);
const vtt = (await (await fetch("/vtt")).text()).split(/\r?\n\r?\n/).map((b) => {
  const m = b.match(/(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)\s*\n([\s\S]+)/);
  if (!m) return null;
  const s = (h, mi, se) => +h * 3600 + +mi * 60 + +se;
  return { a: s(m[1], m[2], m[3]), b: s(m[4], m[5], m[6]), text: m[7].trim() };
}).filter(Boolean);

const cache = new Map();
async function capFrame(ct) {
  let lo = 0, hi = capT.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (capT[mid] <= ct) lo = mid; else hi = mid - 1; }
  const name = tl.frames[lo].name;
  if (!cache.has(name)) {
    cache.set(name, await loadImg(`/cap/f/${name}`));
    if (cache.size > 10) { const k = cache.keys().next().value; cache.get(k).close(); cache.delete(k); }
  }
  return cache.get(name);
}

// ---------- the edit ----------
// window that frames the live site
const WX = 135, WY = 38, WW = 1650, WH = 928, XF = 0.28;
const SEGS = [
  // "So Terra Tunes plays them." — out of the dark, the jukebox powers on and a record is picked
  { a: 7.5, b: 10.2, c0: 0.6, c1: 3.95,
    cam: [[0.6, 1, 960, 540], [2.95, 1, 960, 540], [3.45, 1.5, 1560, 730]],
    callouts: [{ c0: 3.2, c1: 3.95, x: 1290, y: 450, dx: -300, dy: 300, text: "9 records = 9 NASA datasets" }] },
  // "Warmer seas sing higher…" — needle down, the world turns to ocean (then the explainer)
  { a: 10.2, b: 11.0, c0: 5.45, c1: 6.3,
    cam: [[5.45, 1.05, 960, 540], [5.9, 1.3, 960, 600]], callouts: [] },
  // "Every note comes from a real NASA measurement…" — the Data Deck opens on the map
  { a: 15.2, b: 17.8, c0: 9.6, c1: 12.6,
    cam: [[9.6, 1.35, 1450, 360], [9.95, 1.35, 1450, 360], [10.7, 1, 960, 540]],
    callouts: [{ c0: 11.2, c1: 12.6, x: 470, y: 330, dx: 200, dy: 230, text: "Real NASA sea-temperature map" }] },
  // "…and the Data Deck shows you which one." — the transcript
  { a: 17.8, b: 19.5, c0: 12.6, c1: 14.45,
    cam: [[12.6, 1.0, 960, 540], [13.1, 1.55, 1500, 380]],
    callouts: [{ c0: 13.3, c1: 14.45, x: 1536, y: 296, dx: -300, dy: 170, text: "Which measurement made each note" }] },
  { a: 19.5, b: 20.9, c0: 17.35, c1: 18.9,
    cam: [[17.35, 1.12, 760, 420]],
    callouts: [{ c0: 17.55, c1: 18.9, x: 640, y: 400, dx: 160, dy: -150, text: "The measured grid the music reads" }] },
  // "Got a NASA picture of your own? Scan it…"
  { a: 20.9, b: 24.9, c0: 30.3, c1: 35.2,
    cam: [[30.3, 1.05, 960, 540], [30.55, 1.4, 760, 620], [31.6, 1.4, 760, 620], [32.5, 1.3, 1280, 560]],
    callouts: [{ c0: 32.7, c1: 35.2, x: 1240, y: 420, dx: -440, dy: -110, text: "A NASA frame, read and played" }] },
];
const STEPS = [
  { a: 7.6, b: 10.2, n: 1, title: "PICK A RECORD", sub: "Nine records, each a real NASA dataset" },
  { a: 10.2, b: 11.0, n: 2, title: "DROP THE NEEDLE", sub: "The jukebox plays the data as music" },
  { a: 15.2, b: 20.9, n: 3, title: "OPEN THE DATA DECK", sub: "Every note traced to a NASA measurement" },
  { a: 20.9, b: 24.75, n: 4, title: "SCAN ANY FRAME", sub: "Bring a NASA image and it sings too" },
];
const INTRO_OUT = 7.35, EX_A = 11.0, EX_B = 15.2, END_A = 24.85;

function camAt(keys, ct) {
  if (ct <= keys[0][0]) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, ...A] = keys[i], [tb, ...B] = keys[i + 1];
    if (ct <= tb) { const k = eio((ct - ta) / (tb - ta)); return [ct, ...A.map((v, j) => lerp(v, B[j], k))]; }
  }
  return keys[keys.length - 1];
}

// ---------- layers ----------
function background(img, dim = 0.5) {
  ctx.save();
  ctx.filter = "blur(36px) saturate(1.2)";
  ctx.drawImage(img, -80, -60, W + 160, H + 120);
  ctx.filter = "none";
  ctx.fillStyle = `rgba(22,14,7,${dim})`; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1150);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(10,6,2,0.75)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function cursorShape(x, y, press) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.25 - press * 0.18, 1.25 - press * 0.18);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.lineTo(7.5, 23); ctx.lineTo(13, 35); ctx.lineTo(18, 33); ctx.lineTo(12.5, 21.5); ctx.lineTo(22, 21.5); ctx.closePath();
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fff"; ctx.fill(); ctx.shadowColor = "transparent";
  ctx.lineWidth = 2; ctx.strokeStyle = "#1c140c"; ctx.stroke();
  ctx.restore();
}

function callout(ax, ay, bx, by, text, k, bounds) {
  const a = eout(sat(k * 2.2));
  ctx.save();
  ctx.font = font(800, 27);
  const tw = ctx.measureText(text).width, bw = tw + 44, bh = 54;
  let x = clamp(bx - bw / 2, bounds[0] + 16, bounds[2] - bw - 16), y = clamp(by - bh / 2, bounds[1] + 16, bounds[3] - bh - 16);
  // leader
  const ex = lerp(ax, x + bw / 2, a), ey = lerp(ay, y + bh / 2, a);
  ctx.globalAlpha = sat(k * 4);
  ctx.strokeStyle = AMBER; ctx.lineWidth = 3; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
  // anchor pulse
  const p = (performanceT * 1.6) % 1;
  ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(ax, ay, 8, 0, 7); ctx.fill();
  ctx.strokeStyle = `rgba(247,185,85,${1 - p})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 8 + p * 26, 0, 7); ctx.stroke();
  // box
  const s = eback(sat((k - 0.12) * 3.2));
  if (s > 0) {
    ctx.translate(x + bw / 2, y + bh / 2); ctx.scale(s, s);
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
    rrect(-bw / 2, -bh / 2, bw, bh, 14); ctx.fillStyle = PAPER; ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = 3; ctx.strokeStyle = BRASS; ctx.stroke();
    ctx.fillStyle = INK; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillText(text, 0, 2);
  }
  ctx.restore();
}

let performanceT = 0;

async function drawSeg(seg, t, alpha, extraScale = 1) {
  const ct = seg.c0 + ((t - seg.a) * (seg.c1 - seg.c0)) / (seg.b - seg.a);
  const img = await capFrame(ct);
  const [, s, cx, cy] = camAt(seg.cam, ct);
  const vw = 1920 / s, vh = 1080 / s;
  const vx = clamp(cx - vw / 2, 0, 1920 - vw), vy = clamp(cy - vh / 2, 0, 1080 - vh);
  const map = (px, py) => [WX + ((px - vx) * WW) / vw, WY + ((py - vy) * WH) / vh];
  seg.map = map; seg.alpha = alpha;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(WX + WW / 2, WY + WH / 2); ctx.scale(extraScale, extraScale); ctx.translate(-(WX + WW / 2), -(WY + WH / 2));
  // shadow + frame
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 18;
  rrect(WX, WY, WW, WH, 22); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
  ctx.save(); rrect(WX, WY, WW, WH, 22); ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, vx, vy, vw, vh, WX, WY, WW, WH);

  // click ripples
  for (const c of clicks) {
    const d = ct - c.ct;
    if (d < 0 || d > 0.75 || c.ct < seg.c0 - 0.1 || c.ct > seg.c1 + 0.3) continue;
    const [x, y] = map(c.x, c.y), k = d / 0.75;
    ctx.strokeStyle = `rgba(247,185,85,${1 - k})`; ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(x, y, 14 + eout(k) * 60, 0, 7); ctx.stroke();
    ctx.fillStyle = `rgba(247,185,85,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, 18 * (1 - k) + 6, 0, 7); ctx.fill();
  }
  // callouts
  for (const co of seg.callouts || []) {
    if (ct < co.c0 || ct > co.c1) continue;
    const k = Math.min((ct - co.c0) / 0.9, 1) * (1 - ramp(ct, co.c1 - 0.3, 0.3));
    const [ax, ay] = map(co.x, co.y);
    callout(ax, ay, ax + co.dx, ay + co.dy, co.text, k, [WX, WY, WX + WW, WY + WH]);
  }
  // synthetic pointer gliding between the controls the director clicks
  const inSeg = clicks.filter((c) => c.ct >= seg.c0 - 1.2 && c.ct <= seg.c1 + 0.6);
  if (inSeg.length) {
    let prev = null, next = null;
    for (const c of inSeg) { if (c.ct <= ct) prev = c; else { next = c; break; } }
    let px, py;
    const start = prev || { x: 1180, y: 640 };
    if (next) {
      const k = eio(sat((ct - (next.ct - 0.6)) / 0.52));
      px = lerp(start.x, next.x, k); py = lerp(start.y, next.y, k);
    } else { px = start.x; py = start.y; }
    const press = prev ? Math.max(0, 1 - Math.abs(ct - prev.ct) / 0.15) : 0;
    const [x, y] = map(px, py);
    cursorShape(x, y, press);
  }
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(201,151,90,.95)"; rrect(WX, WY, WW, WH, 22); ctx.stroke();
  ctx.restore();
}

function stepChip(t) {
  const st = STEPS.find((s) => t >= s.a && t < s.b);
  const vis = win(t, 7.6, EX_A, 0.4, 0.3) + win(t, EX_B, 24.75, 0.4, 0.35);
  if (!st || vis <= 0) return;
  const k = eback(sat((t - st.a) / 0.45));
  ctx.save();
  const x = 92 - (1 - eout(vis)) * 60, y = 66;
  ctx.globalAlpha = vis;
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
  rrect(x, y, 660, 108, 20); ctx.fillStyle = "rgba(28,19,10,.93)"; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.lineWidth = 2.5; ctx.strokeStyle = AMBER; ctx.stroke();
  // number badge
  ctx.save(); ctx.translate(x + 58, y + 54); ctx.scale(k, k);
  ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.fill();
  ctx.fillStyle = INK; ctx.font = font(800, 40, SERIF); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(st.n), 0, 2); ctx.restore();
  // text
  const tk = eout(sat((t - st.a) / 0.4));
  ctx.globalAlpha = vis * tk; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = PAPER; ctx.font = font(900, 34); ctx.letterSpacing = "2px";
  ctx.fillText(st.title, x + 112 + (1 - tk) * 24, y + 50);
  ctx.letterSpacing = "0px"; ctx.fillStyle = "#f3d6a2"; ctx.font = font(700, 25);
  ctx.fillText(st.sub, x + 112 + (1 - tk) * 24, y + 84);
  // progress dots
  for (let i = 1; i <= 4; i++) {
    ctx.globalAlpha = vis;
    ctx.fillStyle = i <= st.n ? AMBER : "rgba(253,243,221,.25)";
    ctx.beginPath(); ctx.arc(x + 600 + ((i - 1) % 2) * 22, y + 32 + Math.floor((i - 1) / 2) * 22, 7, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function captions(t) {
  const c = vtt.find((v) => t >= v.a - 0.05 && t <= v.b + 0.15);
  if (!c) return;
  const a = win(t, c.a - 0.05, c.b + 0.15, 0.18, 0.2);
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = font(600, 40, SERIF);
  const tw = ctx.measureText(c.text).width;
  const y = t > END_A ? 1010 : 1024;
  rrect(W / 2 - tw / 2 - 30, y - 34, tw + 60, 64, 32); ctx.fillStyle = "rgba(18,12,6,.72)"; ctx.fill();
  ctx.fillStyle = PAPER; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(c.text, W / 2, y + 1);
  ctx.restore();
}

// ---------- the guide: the listener girl from the site's own art ----------
// x = centre, y = feet (canvas px). Consecutive poses at the same spot cross-fade with a little pop.
const HOST = [
  // she looks up at NASA's nine paintings...
  { a: 0.55, b: 5.5, img: "point", x: 175, y: 1075, s: 0.95, calm: true },
  // ...the lights go down; she closes her eyes and listens instead
  { a: 5.5, b: 7.55, img: "listen", x: 185, y: 1075, s: 1.05, bob: true, soft: true, exit: true },
  // the ending: under the Earth-record moon, still listening
  { a: 25.3, b: 30.3, img: "v2-sitting", x: 330, y: 935, s: 0.62, bob: true, soft: true, calm: true },
];
// speech bubbles: canvas anchors, or seg + capture coords to follow the girl inside the live site
const BUBBLES = [];

function drawGirl(h, t) {
  const im = GIRL[h.img];
  let alpha = 1, dy = 0, sc = h.s;
  if (h.calm) { const k = sat((t - h.a) / 0.9); alpha = eout(k); dy = (1 - eout(k)) * 30; }
  else if (h.enter) { const k = sat((t - h.a) / 0.5); alpha = sat(k * 2.5); dy = (1 - eback(k)) * 140; }
  else { alpha = sat((t - h.a) / 0.18); sc *= 1 + 0.06 * Math.sin(Math.PI * sat((t - h.a) / 0.28)); }
  if (h.exit) { const k = ramp(t, h.b - 0.35, 0.35); alpha *= 1 - k; dy += eio(k) * 160; }
  else alpha *= 1 - ramp(t, h.b, 0.18);
  if (alpha <= 0) return;
  const w = im.width * sc, hh = im.height * sc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(h.x, h.y - 4 + dy, w * 0.38, 14, 0, 0, 7); ctx.fill();
  ctx.translate(h.x, h.y + dy);
  if (h.bob) { const m = h.soft ? 0.45 : 1; ctx.rotate(Math.sin(t * Math.PI * 2) * 0.03 * m); ctx.translate(0, -Math.abs(Math.sin(t * Math.PI * 2)) * 7 * m); }
  else ctx.scale(1, 1 + Math.sin(t * 3.1) * 0.008);
  if (h.wave) ctx.rotate(Math.sin(t * 9) * 0.02);
  if (h.flip) ctx.scale(-1, 1);
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.drawImage(im, -w / 2, -hh, w, hh);
  ctx.restore();
}

function bubble(b, t) {
  let ax, ay, bx, by;
  if (b.seg != null) {
    const sg = SEGS[b.seg]; if (!sg.map || !(sg.alpha > 0.5)) return;
    [ax, ay] = sg.map(b.cx, b.cy); bx = ax + b.dx; by = ay + b.dy;
  } else { ax = b.ax; ay = b.ay; bx = b.bx; by = b.by; }
  const k = sat((t - b.a) / 0.42), out = ramp(t, b.b - 0.2, 0.2);
  if (k <= 0 || out >= 1) return;
  const chars = Math.ceil(b.text.length * sat((t - b.a - 0.08) / 0.55));
  ctx.save();
  ctx.font = `italic ${font(600, 34, SERIF)}`;
  const tw = ctx.measureText(b.text).width, bw = tw + 52, bh = 70;
  bx = clamp(bx, bw / 2 + 20, W - bw / 2 - 20); by = clamp(by, bh / 2 + 20, H - bh / 2 - 130);
  const s = eback(k) * (1 - out * 0.15);
  ctx.globalAlpha = 1 - out;
  ctx.translate(bx, by); ctx.scale(s, s);
  const tx = (ax - bx) / s, ty = (ay - by) / s, len = Math.hypot(tx, ty), ux = tx / len, uy = ty / len;
  const reach = Math.min(len - 18, Math.max(bh * 0.5 + 34, len * 0.55));
  const tail = () => { ctx.beginPath(); ctx.moveTo(-uy * 18, ux * 18); ctx.lineTo(ux * reach, uy * reach); ctx.lineTo(uy * 18, -ux * 18); };
  ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = PAPER;
  tail(); ctx.fill();
  rrect(-bw / 2, -bh / 2, bw, bh, 35); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3; ctx.strokeStyle = BRASS; ctx.stroke();
  tail(); ctx.stroke();
  ctx.fillStyle = PAPER; rrect(-bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6, 32); ctx.fill();
  ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(b.text.slice(0, chars), -tw / 2, 2);
  ctx.restore();
}

function recordNotes(t) {
  const [cx, cy] = moonAt(t);
  for (let ts = 25.6; ts < Math.min(t, 29.4); ts += 0.42) {
    const k = (t - ts) / 2.1; if (k > 1) continue;
    const e = eio(k), x0 = cx - 120 + Math.sin(ts * 13) * 40, y0 = cy + 110, x1 = 338, y1 = 640;
    const x = lerp(x0, x1, e) + Math.sin(e * 6 + ts) * 14, y = lerp(y0, y1, e) - Math.sin(Math.PI * e) * 70;
    ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * k) * 0.95;
    ctx.fillStyle = AMBER; ctx.font = 'bold 40px "Segoe UI Symbol"'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(247,185,85,.8)"; ctx.shadowBlur = 16;
    ctx.fillText(Math.round(ts * 10) % 2 ? "♪" : "♫", x, y); ctx.restore();
  }
}

function guide(t) {
  for (const h of HOST) if (t >= h.a && t < h.b + 0.2) drawGirl(h, t);
  if (t > 25.5) recordNotes(t);
  for (const b of BUBBLES) if (t >= b.a && t < b.b) bubble(b, t);
}

// intro: real NASA frames, a playhead turns the map into notes
const PX = 250, PY = 168, PW = 1420, PH = 710;
const GAP = 14, TW = (PW - 2 * GAP) / 3, TH = (PH - 2 * GAP) / 3;
const tileRect = (i) => [PX + (i % 3) * (TW + GAP), PY + Math.floor(i / 3) * (TH + GAP), TW, TH];
const DARK_A = 3.7, DARK_D = 2.3;

function intro(t) {
  ctx.fillStyle = "#140d07"; ctx.fillRect(0, 0, W, H);
  const fi = Math.floor(t * 5) % 20;
  const dk = eio(ramp(t, DARK_A, DARK_D));                 // 0 = lit gallery, 1 = darkness
  const a = eout(sat(t / 0.7)) * (1 - ramp(t, INTRO_OUT, 0.45));
  ctx.save(); ctx.globalAlpha = a;
  background(nasa[fi], 0.62);
  ctx.fillStyle = `rgba(4,3,2,${dk * 0.85})`; ctx.fillRect(0, 0, W, H);
  const s = lerp(0.95, 1, eout(sat(t / 0.9))) * lerp(1, 1.04, sat(t / 7.5));
  ctx.translate(W / 2, PY + PH / 2); ctx.scale(s, s); ctx.translate(-W / 2, -(PY + PH / 2));
  // the paintings blur, drain and go dark: what "never see" feels like
  ctx.filter = dk > 0.001 ? `blur(${(dk * 16).toFixed(1)}px) grayscale(${(dk * 0.85).toFixed(2)}) brightness(${(1 - dk * 0.85).toFixed(2)})` : "none";
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 20;
  rrect(PX - 10, PY - 10, PW + 20, PH + 20, 24); ctx.fillStyle = "rgba(14,9,5,.92)"; ctx.fill(); ctx.restore();
  for (let i = 0; i < 9; i++) {
    const pop = eback(sat((t - 0.12 - i * 0.07) / 0.45));
    const al = sat((t - 0.12 - i * 0.07) / 0.3);
    if (al <= 0) continue;
    const [x, y, w, h] = tileRect(i), frames = wall[i];
    const fr = frames[Math.floor(t * 2.5 * (1 - dk * 0.8) + i * 3) % frames.length];
    ctx.save(); ctx.globalAlpha = a * al;
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(pop, pop);
    ctx.save(); rrect(-w / 2, -h / 2, w, h, 12); ctx.clip(); ctx.drawImage(fr, -w / 2, -h / 2, w, h); ctx.restore();
    rrect(-w / 2, -h / 2, w, h, 12); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(201,151,90,.8)"; ctx.stroke();
    ctx.font = font(800, 19); const lw = ctx.measureText(TRACK_NAMES[i]).width;
    rrect(-w / 2 + 10, h / 2 - 40, lw + 24, 30, 15); ctx.fillStyle = "rgba(20,13,6,.8)"; ctx.fill();
    ctx.fillStyle = PAPER; ctx.textBaseline = "middle"; ctx.fillText(TRACK_NAMES[i], -w / 2 + 22, h / 2 - 24);
    ctx.restore();
  }
  ctx.filter = "none";
  ctx.restore();
  // a small pool of warm light stays on her
  if (dk > 0) {
    const g = ctx.createRadialGradient(185, 860, 40, 185, 860, 460);
    g.addColorStop(0, `rgba(247,185,85,${0.2 * dk * a})`); g.addColorStop(1, "rgba(247,185,85,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 380, 700, 700);
  }
  // in the dark, the first notes reach her
  for (let ts = 6.1; ts < Math.min(t, 7.4); ts += 0.2) {
    const k = (t - ts) / 1.3; if (k > 1) continue;
    const ang = -1.2 + Math.sin(ts * 17) * 0.9, d = 30 + eout(k) * 190;
    ctx.save(); ctx.globalAlpha = a * Math.sin(Math.PI * k) * 0.9;
    ctx.fillStyle = AMBER; ctx.font = 'bold 40px "Segoe UI Symbol"'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(247,185,85,.9)"; ctx.shadowBlur = 16;
    ctx.fillText(Math.round(ts * 10) % 2 ? "♪" : "♫", 190 + Math.cos(ang) * d, 720 + Math.sin(ang) * d);
    ctx.restore();
  }
  // kicker + source line while the gallery is lit
  ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const k1 = win(t, 0.25, 3.9, 0.4, 0.5);
  ctx.font = font(900, 30); ctx.letterSpacing = "5px";
  ctx.globalAlpha = k1; ctx.fillStyle = AMBER; ctx.fillText("9 REAL NASA EARTH DATASETS", W / 2, 104 - (1 - eout(k1)) * 16);
  ctx.letterSpacing = "1px"; ctx.font = font(700, 23); ctx.fillStyle = PAPER;
  ctx.globalAlpha = win(t, 0, 3.9, 0.8, 0.5) * 0.85;
  ctx.fillText("Visualizations from NASA's Scientific Visualization Studio", W / 2, PY + PH + 40);
  ctx.restore();
}

// "Hear where the oceans run hot, where storms pour down, and so much more."
const EXMAPS = [
  { a: EX_A, b: 12.15, frames: nasa, pix: nasaPix, kicker: "WHERE THE OCEANS RUN HOT", name: "Sea Surface Temperature" },
  { a: 12.15, b: 13.85, frames: wall[RAIN], pix: rainPix, kicker: "WHERE STORMS POUR DOWN", name: "Precipitation" },
];
const MORE_A = 13.85;
function noteFrom(m, ts) {
  const u = sat((ts - m.a - 0.1) / (m.b - m.a - 0.15)), fi = Math.floor(ts * 5) % m.pix.length, d = m.pix[fi];
  const col = Math.min(159, Math.floor(u * 160)), rows = [];
  for (let r = 4; r < 76; r++) {
    const o = (r * 160 + col) * 4, R = d[o], G = d[o + 1], B = d[o + 2];
    if (Math.abs(R - G) < 14 && Math.abs(G - B) < 14) continue; // grey land / empty sky
    if (R + G + B < 60) continue;
    rows.push({ r, R, G, B, w: (Math.max(R, G, B) - Math.min(R, G, B)) / 255 });
  }
  if (!rows.length) return null;
  rows.sort((p, q) => q.w - p.w);
  const pk = rows[(Math.floor(ts * 1000) * 7919) % Math.min(rows.length, 14)];
  return { x: PX + u * PW, y: PY + (pk.r / 80) * PH, w: pk.w, c: `rgb(${pk.R},${pk.G},${pk.B})` };
}
function mapPanel(m, t, alpha) {
  if (alpha <= 0) return;
  const fi = Math.floor(t * 5) % m.frames.length;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 20;
  rrect(PX, PY, PW, PH, 18); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
  ctx.save(); rrect(PX, PY, PW, PH, 18); ctx.clip();
  ctx.drawImage(m.frames[fi], PX, PY, PW, PH);
  const u = sat((t - m.a - 0.1) / (m.b - m.a - 0.15)), px = PX + u * PW;
  if (t > m.a + 0.05) {
    const g = ctx.createLinearGradient(px - 160, 0, px, 0);
    g.addColorStop(0, "rgba(247,185,85,0)"); g.addColorStop(1, "rgba(247,185,85,.28)");
    ctx.fillStyle = g; ctx.fillRect(px - 160, PY, 160, PH);
    ctx.fillStyle = AMBER; ctx.fillRect(px - 2, PY, 4, PH);
  }
  ctx.restore();
  rrect(PX, PY, PW, PH, 18); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(201,151,90,.95)"; ctx.stroke();
  // notes rise off the playhead; the strongest readings throw the biggest, highest notes
  for (let ts = m.a + 0.12; ts <= t && ts < m.b; ts += 0.055) {
    const age = t - ts; if (age > 1.1) continue;
    const n = noteFrom(m, ts); if (!n) continue;
    const k = age / 1.1, rise = lerp(40, 230, n.w) * eout(k), size = Math.round(lerp(34, 62, n.w));
    ctx.save(); ctx.globalAlpha = alpha * (1 - k) * sat(k / 0.08);
    ctx.fillStyle = "#fff1d6"; ctx.font = `bold ${size}px "Segoe UI Symbol"`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowColor = n.c; ctx.shadowBlur = 20;
    ctx.fillText(Math.round(ts * 100) % 3 ? "♪" : "♫", n.x + Math.sin(ts * 37) * 12, n.y - rise);
    ctx.restore();
  }
  ctx.restore();
}
function explainer(t, alpha) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha;
  const cur = EXMAPS.find((m) => t < m.b) || EXMAPS[EXMAPS.length - 1];
  background(cur.frames[Math.floor(t * 5) % cur.frames.length], 0.62);
  const s = lerp(0.96, 1, eout(ramp(t, EX_A, 0.5)));
  ctx.save(); ctx.translate(W / 2, PY + PH / 2); ctx.scale(s, s); ctx.translate(-W / 2, -(PY + PH / 2));
  // map 1, then map 2 crossfading over it, then the whole crate of nine
  const mk = ramp(t, MORE_A, 0.4);
  mapPanel(EXMAPS[0], t, (1 - ramp(t, EXMAPS[1].a, 0.3)) * (1 - mk));
  mapPanel(EXMAPS[1], t, eio(ramp(t, EXMAPS[1].a, 0.3)) * (1 - mk));
  if (mk > 0) {
    for (let i = 0; i < 9; i++) {
      const played = i === SST || i === RAIN;
      const pop = played ? 1 : eback(sat((t - MORE_A - 0.1 - i * 0.06) / 0.4));
      const al = played ? mk : sat((t - MORE_A - 0.1 - i * 0.06) / 0.25);
      if (al <= 0) continue;
      const [x, y, w, h] = tileRect(i), fr = wall[i][Math.floor(t * 2.5 + i * 3) % wall[i].length];
      ctx.save(); ctx.globalAlpha = alpha * al;
      ctx.translate(x + w / 2, y + h / 2); ctx.scale(pop, pop);
      ctx.save(); rrect(-w / 2, -h / 2, w, h, 12); ctx.clip(); ctx.drawImage(fr, -w / 2, -h / 2, w, h); ctx.restore();
      rrect(-w / 2, -h / 2, w, h, 12); ctx.lineWidth = played ? 3 : 2; ctx.strokeStyle = played ? AMBER : "rgba(201,151,90,.8)"; ctx.stroke();
      ctx.font = font(800, 19); const lw = ctx.measureText(TRACK_NAMES[i]).width;
      rrect(-w / 2 + 10, h / 2 - 40, lw + 24, 30, 15); ctx.fillStyle = "rgba(20,13,6,.8)"; ctx.fill();
      ctx.fillStyle = played ? AMBER : PAPER; ctx.textBaseline = "middle"; ctx.fillText(TRACK_NAMES[i], -w / 2 + 22, h / 2 - 24);
      // every record plays: a small note badge bobs on each tile
      ctx.fillStyle = AMBER; ctx.font = 'bold 30px "Segoe UI Symbol"'; ctx.textAlign = "center";
      ctx.fillText("♪", w / 2 - 26, -h / 2 + 28 - Math.abs(Math.sin(t * 6 + i)) * 6);
      ctx.restore();
    }
  }
  ctx.restore();
  // words: one kicker per beat
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const kick = (txt, a, b) => {
    const q = win(t, a, b, 0.3, 0.25); if (q <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha * q; ctx.font = font(900, 30); ctx.letterSpacing = "5px"; ctx.fillStyle = AMBER;
    ctx.fillText(txt, W / 2, 104 - (1 - eout(q)) * 14); ctx.restore();
  };
  kick(EXMAPS[0].kicker, EX_A + 0.05, EXMAPS[0].b + 0.1);
  kick(EXMAPS[1].kicker, EXMAPS[1].a, EXMAPS[1].b + 0.1);
  kick("…AND SO MUCH MORE: 9 RECORDS", MORE_A, EX_B + 0.3);
  const sub = t < EXMAPS[1].a ? "Sea Surface Temperature  ·  the playhead reads the map from west to east"
    : t < MORE_A ? "Precipitation  ·  every reading becomes a note" : "Wind, air quality, ozone, vegetation and more: every record plays";
  ctx.save(); ctx.letterSpacing = "1px"; ctx.font = font(700, 23); ctx.fillStyle = PAPER; ctx.globalAlpha = alpha * 0.85;
  ctx.fillText(sub, W / 2, PY + PH + 40); ctx.restore();
  ctx.restore();
}

const moonAt = (t) => [W / 2, lerp(330, 252, eout(sat((t - 24.95) / 1.8)))];
function endCard(t) {
  const k = ramp(t, END_A, 0.6);
  ctx.save(); ctx.globalAlpha = k;
  const z = lerp(1.0, 1.06, eio(sat((t - END_A) / 5.2))), ox = W / 2, oy = 760;
  ctx.drawImage(night, ox - ox * z, oy - oy * z, W * z, H * z);
  ctx.fillStyle = "rgba(8,10,24,.2)"; ctx.fillRect(0, 0, W, H);
  // a soft dark bed behind the centred title
  const gc = ctx.createRadialGradient(W / 2, 700, 80, W / 2, 700, 760);
  gc.addColorStop(0, "rgba(5,5,12,.6)"); gc.addColorStop(1, "rgba(5,5,12,0)");
  ctx.fillStyle = gc; ctx.fillRect(0, 0, W, H);
  const gb = ctx.createLinearGradient(0, 820, 0, H);
  gb.addColorStop(0, "rgba(4,4,10,0)"); gb.addColorStop(1, "rgba(4,4,10,.6)");
  ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H);

  // the Earth record rises like a moon, centred, and spins
  const [cx, cy] = moonAt(t), r = 150, ra = eout(sat((t - 24.95) / 1.2));
  ctx.save(); ctx.globalAlpha = k * ra;
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.6);
  halo.addColorStop(0, "rgba(190,210,255,.30)"); halo.addColorStop(1, "rgba(190,210,255,0)");
  ctx.fillStyle = halo; ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
  ctx.translate(cx, cy); ctx.rotate((t - END_A) * 3.46);
  ctx.fillStyle = "#120d08"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  for (let rr = 78; rr < r - 4; rr += 5) { ctx.strokeStyle = rr % 15 ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.11)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.stroke(); }
  const sh = ctx.createLinearGradient(-r, -r, r, r);
  sh.addColorStop(0.35, "rgba(255,255,255,0)"); sh.addColorStop(0.5, "rgba(220,230,255,.14)"); sh.addColorStop(0.65, "rgba(255,255,255,0)");
  ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 74, 0, 7); ctx.clip(); ctx.drawImage(disc, -74, -74, 148, 148); ctx.restore();
  ctx.strokeStyle = BRASS; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 74, 0, 7); ctx.stroke();
  ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
  ctx.restore();

  // title, centred under the record; "TERRA TUNES" lands as the narrator says it
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const line = (txt, f, y, color, at, ls = "0px") => {
    const q = eout(sat((t - at) / 0.6)); if (q <= 0) return;
    ctx.save(); ctx.globalAlpha = k * q; ctx.font = f; ctx.fillStyle = color; ctx.letterSpacing = ls;
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 18;
    ctx.fillText(txt, W / 2, y + (1 - q) * 20); ctx.restore();
  };
  line("TERRA TUNES", font(700, 112, SERIF), 548, PAPER, 25.1, "6px");
  line("The Earth Information Jukebox", `italic ${font(500, 44, SERIF)}`, 610, AMBER, 25.35);
  const dq = eout(sat((t - 25.6) / 0.6));
  ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = BRASS; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(W / 2 - 260 * dq, 646); ctx.lineTo(W / 2 + 260 * dq, 646); ctx.stroke(); ctx.restore();
  line("BY TEAM BIT AND BEAT", font(900, 34), 704, AMBER, 26.0, "6px");
  line("9 real NASA datasets, played as music  ·  scan your own frame", font(800, 28), 758, PAPER, 27.65);
  line("NASA Space Apps Challenge 2026  ·  Space Apps Cairo", font(700, 25), 806, "#e8cfa4", 27.85);
  line("github.com/wearemasons/TerraTunes", font(700, 25), 842, "#c9a46e", 28.0, "1px");
  ctx.restore();
}

async function drawFrame(t) {
  performanceT = t;
  ctx.globalAlpha = 1; ctx.filter = "none";
  ctx.fillStyle = "#140d07"; ctx.fillRect(0, 0, W, H);
  if (t < INTRO_OUT + 0.5) intro(t);
  const active = SEGS.filter((s) => t >= s.a && t < s.b + XF);
  const first = SEGS[0], last = SEGS[SEGS.length - 1];
  const drawSegs = async (list) => {
    if (!list.length) return;
    const s0 = list[0], ct0 = s0.c0 + ((t - s0.a) * (s0.c1 - s0.c0)) / (s0.b - s0.a);
    const bgk = s0 === first ? ramp(t, INTRO_OUT, 0.45) : s0.a === EX_B ? eio(ramp(t, EX_B, XF)) : 1;
    ctx.save(); ctx.globalAlpha = bgk; background(await capFrame(ct0), 0.5); ctx.restore();
    for (const s of list) {
      let alpha = s === first ? eout(ramp(t, INTRO_OUT, 0.45)) : eio(ramp(t, s.a, XF));
      let sc = s === first ? lerp(0.9, 1, eout(ramp(t, INTRO_OUT, 0.5))) : 1;
      if (s === last && t > END_A - 0.2) { alpha *= 1 - eio(ramp(t, END_A - 0.2, 0.5)); sc *= lerp(1, 1.08, eio(ramp(t, END_A - 0.2, 0.5))); }
      await drawSeg(s, t, alpha, sc);
    }
  };
  // shots before the explainer, the explainer, then the shots after it (each fades in over the last)
  await drawSegs(active.filter((s) => s.a < EX_A));
  if (t >= EX_A && t < EX_B + XF) explainer(t, eio(ramp(t, EX_A, XF)));
  await drawSegs(active.filter((s) => s.a >= EX_B));
  if (t >= END_A) endCard(t);
  guide(t);
  stepChip(t);
  captions(t);
}

// ---------- audio: voice + the real sonification, ducked under the voice ----------
const VO_OFF = 0;
async function mixAudio() {
  const SR = 48000, ac = new OfflineAudioContext(2, SR * DUR, SR);
  const dec = async (u) => ac.decodeAudioData(await (await fetch(u)).arrayBuffer());
  const bed = await dec("/audio/bed.wav");
  const voRes = await fetch("/audio/vo.wav");
  // no take yet: build a silent stand-in and duck the music under the caption timings instead
  const vo = voRes.ok ? await ac.decodeAudioData(await voRes.arrayBuffer()) : null;
  // level the voice from its speech, not its peaks: ~0.13 RMS while talking
  const ch = vo ? vo.getChannelData(0) : new Float32Array(0), voRate = vo ? vo.sampleRate : SR;
  if (vo) {
    let e2 = 0, n = 0;
    for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) > 0.02) { e2 += ch[i] * ch[i]; n++; }
    const vs = ac.createBufferSource(); vs.buffer = vo;
    const vg = ac.createGain(); vg.gain.value = 0.13 / Math.sqrt(e2 / Math.max(1, n));
    vs.connect(vg).connect(ac.destination); vs.start(VO_OFF);
  }
  const bs = ac.createBufferSource(); bs.buffer = bed;
  const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70;
  const bg = ac.createGain(); bs.connect(hp).connect(bg).connect(ac.destination); bs.start(0, 9.0);
  // the music: quiet under the gallery, gone in the dark, swelling when the jukebox plays
  const hop = Math.floor(voRate * 0.05), g = bg.gain; g.setValueAtTime(0, 0);
  for (let i = 0; i * 0.05 < DUR; i++) {
    const t = i * 0.05, vi = Math.floor((t - VO_OFF) / 0.05);
    let e = 0;
    if (vi >= 0) for (let j = vi * hop; j < Math.min(ch.length, (vi + 4) * hop); j++) e = Math.max(e, Math.abs(ch[j]));
    const talking = vo ? e > 0.05 : vtt.some((c) => t >= c.a - 0.1 && t <= c.b);
    let base;
    if (t < 3.7) base = lerp(0.03, 0.08, t / 3.7);
    else if (t < 7.3) base = 0.08 * (1 - sat((t - 3.7) / 1.8));
    else base = lerp(0, 0.34, eout(sat((t - 7.3) / 1.4)));
    base *= 1 - sat((t - 28.0) / 1.9);
    g.setTargetAtTime(talking ? base * 0.38 : base, t, talking ? 0.04 : 0.18);
  }
  const out = await ac.startRendering();
  let peak = 0;
  for (let c = 0; c < 2; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const norm = 0.89 / peak;
  for (let c = 0; c < 2; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) { d[i] *= norm; const tt = i / SR; if (tt > DUR - 0.25) d[i] *= (DUR - tt) / 0.25; }
  }
  return out;
}

// ---------- encode ----------
window.renderStill = async (t) => { await drawFrame(t); return cv.toDataURL("image/jpeg", 0.85); };

window.renderFilm = async () => {
  const vcfg = { codec: "avc1.640028", width: W, height: H, bitrate: 16_000_000, framerate: FPS, hardwareAcceleration: "prefer-hardware", latencyMode: "quality", avc: { format: "avc" } };
  let hw = (await VideoEncoder.isConfigSupported(vcfg)).supported;
  if (!hw) vcfg.hardwareAcceleration = "no-preference";
  const acfg = { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
  const aOk = (await AudioEncoder.isConfigSupported(acfg)).supported;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: FPS },
    audio: aOk ? { codec: "aac", sampleRate: 48000, numberOfChannels: 2 } : undefined,
    fastStart: "in-memory", firstTimestampBehavior: "offset",
  });
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => console.error("venc", e) });
  venc.configure(vcfg);

  if (aOk) {
    const buf = await mixAudio();
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => console.error("aenc", e) });
    aenc.configure(acfg);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), N = 1024, TOT = Math.floor(L.length / N) * N; // whole AAC frames: film ends at 30.000
    for (let i = 0; i < TOT; i += N) {
      const n = Math.min(N, TOT - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      aenc.encode(new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / 48000) * 1e6), data }));
    }
    await aenc.flush();
  }

  const t0 = performance.now();
  for (let i = 0; i < NF; i++) {
    await drawFrame(i / FPS);
    const vf = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: i % 60 === 0 });
    vf.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
    if (i % 90 === 0) console.log(`frame ${i}/${NF}`);
  }
  await venc.flush();
  muxer.finalize();
  const bytes = muxer.target.buffer;
  await fetch("/out", { method: "POST", body: bytes });
  return { hw, codec: vcfg.codec, accel: vcfg.hardwareAcceleration, audio: aOk, bytes: bytes.byteLength, secs: ((performance.now() - t0) / 1000).toFixed(1) };
};
window.__ready = true;
