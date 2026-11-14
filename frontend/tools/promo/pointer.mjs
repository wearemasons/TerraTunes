/**
 * Glide the real X pointer to each control just before the promo director
 * clicks it, so the recording reads as a person driving the site.
 * Positions are read live, so a layout change cannot make the pointer drift
 * off target; the schedule only decides when it starts moving.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const DIR = process.env.PROMO_DIR || "/home/ubuntu/gen/promo"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const move = (x, y) =>
  execFileSync("xdotool", ["mousemove", "--sync", String(Math.round(x)), String(Math.round(y))], {
    env: { ...process.env, DISPLAY: ":99" },
  })

const js = (src) => {
  const f = `${DIR}/_rect.js`
  writeFileSync(f, src)
  const r = spawnSync("node", [`${DIR}/cdp.mjs`, `@${f}`], { cwd: DIR, encoding: "utf8" })
  try {
    return JSON.parse(JSON.parse(r.stdout.trim()))
  } catch {
    return null
  }
}

const sel = {
  power: "[data-guide='power']",
  crate: "[data-guide='crate']",
  needle: "[data-guide='needle']",
  deck: "[data-guide='deck']",
  scan: "[data-guide='scan']",
  record: "[aria-label^='Record 8']",
}

const centre = async (name) => {
  const out = js(`JSON.stringify(document.querySelector(${JSON.stringify(sel[name])})?.getBoundingClientRect()||null)`)
  if (!out) return null
  return { x: out.x + out.width / 2, y: out.y + out.height / 2 }
}

let cursor = { x: 960, y: 560 }
move(cursor.x, cursor.y)

const glide = async (to, ms) => {
  if (!to) return
  const from = { ...cursor }
  const steps = Math.max(4, Math.round(ms / 45))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
    await sleep(45)
  }
  cursor = to
}

// recording seconds → where the pointer should be heading, gliding for ~0.7s
const script = [
  [1.2, () => centre("power")],
  [3.4, () => centre("crate")],
  [5.0, () => centre("record")],
  [8.1, () => centre("needle")],
  [11.4, async () => ({ x: cursor.x + 210, y: cursor.y - 180 })],
  [16.8, () => centre("deck")],
  [22.4, async () => ({ x: 1520, y: 700 })],
  [28.5, () => centre("scan")],
]

const t0 = Date.now()
for (const [when, target] of script) {
  const wait = when * 1000 - (Date.now() - t0)
  if (wait > 0) await sleep(wait)
  await glide(await target(), 700)
}
console.log("pointer script finished")
