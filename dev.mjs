#!/usr/bin/env node
// Run the whole TerraTunes project: FastAPI backend + web app, with one command.
//
//   node dev.mjs              install what's missing, start API (:8000) and web (:5173)
//   node dev.mjs --rebuild    re-download and rebuild NASA tracks first (~350 MB, ~10 min)
//   node dev.mjs --open       also open the browser
//   node dev.mjs --skip-install
//
// Ports: API_PORT (default 8000), WEB_PORT (default 5173), e.g.
// `API_PORT=8010 WEB_PORT=3010 node dev.mjs`. The web app talks to the API through
// Vite's `/api` proxy, so `API_TARGET` follows the port you choose automatically.
// Stop everything with Ctrl+C.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(ROOT, "backend");
// The web app is a single flat Vite project on this branch: frontend/, not a
// workspace with apps/web inside it. If you move it, change this and nothing
// else in this file.
const WEB = join(ROOT, "frontend");
const API_PORT = Number(process.env.API_PORT ?? 8000);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const IS_WIN = process.platform === "win32";

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(
    "Usage: node dev.mjs [--rebuild] [--open] [--skip-install]\n" +
      "  --rebuild       rebuild NASA tracks from SVS before starting\n" +
      "  --open          open the browser when ready\n" +
      "  --skip-install  don't run uv sync / bun install\n\n" +
      "The API is required: every sound on this site is a measurement, so there is\n" +
      "no client-only demo mode. Ports follow API_PORT and WEB_PORT.",
  );
  process.exit(0);
}

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const cyan = color(36);
const magenta = color(35);
const green = color(32);
const red = color(31);
const dim = color(2);
const say = (msg) => console.log(`${green("●")} ${msg}`);
const fail = (msg) => {
  console.error(`${red("✖")} ${msg}`);
  process.exit(1);
}

function has(cmd) {
  const probe = spawnSync(cmd, ["--version"], { shell: IS_WIN, stdio: "ignore" });
  return probe.status === 0;
}

function runStep(label, cmd, cmdArgs, cwd) {
  say(`${label} ${dim(`(${cmd} ${cmdArgs.join(" ")})`)}`);
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: IS_WIN });
  if (result.status !== 0) fail(`${label} failed`);
}

// --- prerequisites ---
if (!existsSync(join(WEB, "vite.config.ts"))) {
  fail(`Expected the web app at ${WEB}. This launcher assumes the flat frontend/ layout.`);
}
if (!has("bun")) fail("bun is not installed: https://bun.sh");
if (!has("uv")) fail("uv is not installed: https://docs.astral.sh/uv/");

// --- ports must be free (a second copy, or a leftover server, would be confusing) ---
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "localhost" });
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
for (const [port, what] of [[API_PORT, "API"], [WEB_PORT, "web app"]]) {
  if (await portInUse(port)) {
    fail(`Port ${port} (${what}) is already in use. Stop the other server first, or set ${what === "API" ? "API_PORT" : "WEB_PORT"}.`);
  }
}

// --- install ---
if (!args.has("--skip-install")) {
  if (!existsSync(join(WEB, "node_modules"))) runStep("Installing frontend packages", "bun", ["install"], WEB);
  if (!existsSync(join(BACKEND, ".venv"))) runStep("Installing backend packages", "uv", ["sync"], BACKEND);
}

// --- data ---
if (args.has("--rebuild")) {
  runStep("Rebuilding NASA tracks", "uv", ["run", "python", "-m", "app.cli", "build"], BACKEND);
} else if (!existsSync(join(BACKEND, "data", "tracks"))) {
  say("No processed tracks found; building them from NASA SVS (one-time, ~10 min)");
  runStep("Building NASA tracks", "uv", ["run", "python", "-m", "app.cli", "build"], BACKEND);
}

// --- processes ---
const children = [];

function start(name, paint, cmd, cmdArgs, cwd, env = {}) {
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, FORCE_COLOR: "1", ...env },
    shell: IS_WIN,
    detached: !IS_WIN,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = paint(`[${name}]`.padEnd(6));
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) out.write(`${prefix} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${red("✖")} ${name} stopped (${signal ?? `exit ${code}`}). Shutting down.`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    try {
      if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0)); // terminal window closed
process.on("exit", () => {
  if (!shuttingDown) shutdown(0);
});

async function waitFor(url, label, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    if (shuttingDown) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`${red("✖")} ${label} did not respond at ${url} within ${timeoutMs / 1000}s`);
  shutdown(1);
  return false;
}

function openBrowser(url) {
  const [cmd, cmdArgs] = IS_WIN
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).unref();
}

say(`Starting API on ${API_URL}`);
start("api", cyan, "uv", ["run", "uvicorn", "app.main:app", "--reload", "--port", String(API_PORT)], BACKEND, {
  // Let the web app's origin through CORS, whatever port it runs on.
  TERRATUNES_CORS_ORIGINS: JSON.stringify([WEB_URL, `http://127.0.0.1:${WEB_PORT}`]),
});
await waitFor(`${API_URL}/healthz`, "API");
const health = await (await fetch(`${API_URL}/healthz`)).json().catch(() => ({}));
say(`API ready: ${health.tracks ?? "?"} tracks`);

say(`Starting web app on ${WEB_URL}`);
start("web", magenta, "bun", ["run", "dev", "--port", String(WEB_PORT), "--strictPort"], WEB, {
  // the app calls /api and Vite forwards it; this is where it forwards to
  API_TARGET: API_URL,
});
await waitFor(WEB_URL, "Web app");

console.log(
  `\n${green("TerraTunes is running")}\n` +
    `  Web app   ${WEB_URL}\n` +
    `  API       ${API_URL}  (docs: ${API_URL}/docs)\n` +
    `  Stop      Ctrl+C\n`,
);
if (args.has("--open")) openBrowser(WEB_URL);
