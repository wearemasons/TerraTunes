# AGENTS.md — rules for AI coding agents on TerraTunes

Project: Earth Information Jukebox (NASA Space Apps 2026). Read [README.md](README.md) and [docs/PLAN.md](docs/PLAN.md) first.

## Stack
- Frontend: `frontend/` — one flat package, no workspaces. React 19 + **TanStack Router** (+ TanStack Query) + Vite + Tailwind 4 + Zustand. There is no UI kit: the cabinet, the painted world and the opening film are hand-written components with their own stylesheet.
- Backend: `backend/` = **FastAPI**, Python 3.12, `uv`, Pydantic v2, NumPy, OpenCV (headless), Pillow, ffmpeg.
- Contract: [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Pydantic schemas are the source of truth; TS types are generated.

## Commands
```bash
# frontend (from frontend/) — or just `node dev.mjs` from the repo root
bun install
bun run dev              # http://localhost:5173, proxies /api to 127.0.0.1:8000
bun run typecheck        # tsc -b --noEmit
bun run build            # production bundle

# backend (from backend/)
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
uv run ruff check . && uv run mypy app
```
Painted and animated assets are generated, not hand-edited: `frontend/tools/*.sh` rebuild
them from a raw source file that is deliberately **not** in git (the plate path is passed
in). If you change one, say so — the committed output is the only copy anyone else has.

## Non-negotiables
1. **Accessibility first.** Every UI change must be keyboard operable, labelled, and have a text equivalent for any audio or visual-only information. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md). The cabinet never starts playing by itself. The one exception is the opening film, which arrives with its narration on: browsers still gate that, so if no gesture has happened the captions carry the story and the first click, tap or key starts the voice at the picture's current time. Muting is one always-visible control, the four sentences are readable as text, and reduced motion gets a held frame instead of a film.
2. **Mapping logic lives in one place:** `backend/app/mapping/`. The frontend consumes score fields; it does not re-derive musical decisions.
3. **Honest sonification.** Values come from colormap calibration, not hue guesswork. Uncalibrated output must be labelled as artistic.
4. **Determinism.** Same input → same score. Seed any randomness and store the seed.
5. **Contract first.** Changing an endpoint or field = update schemas, then `docs/API_CONTRACT.md`, then clients, in the same PR. Bump `mapping_version` when mapping rules change.
6. **Credits and licensing.** Every media asset needs a credit and source URL in `backend/data/tracks.json`. No raw videos in git.
7. **Safety of audio.** Master limiter, no sudden gain jumps (> 6 dB / 100 ms), exponential ramps.
8. **No secrets in the repo.** `.env` files are git-ignored. The app reads none: it calls `/api`, and `API_TARGET` decides where Vite forwards that.
9. **The look is drawn, not installed.** No component library on this branch. Illustration lives in `frontend/public/art` and `public/video`; layout and motion in `src/styles/scene.css`, with the shared tokens in `src/index.css`. Where a literal colour is unavoidable — painted scenery sampled from the art, brass and wood on the cabinet — keep it in one place and say why in a comment. Do not scatter palette classes.

## Conventions
- TypeScript strict; no `any` without a comment. Functional components, hooks, feature folders (`features/<name>/`).
- Routes live in `src/routes`, with the route tree written by hand in `src/routeTree.tsx` (there is no codegen step). Data fetching is TanStack Query over the client in `src/lib/api.ts`.
- Python fully typed; ruff + mypy clean; pure functions in `vision/` and `mapping/` with unit tests.
- Structured logging with request id; errors use the contract's error shape.
- Small PRs, one track each. Conventional commits (`feat:`, `fix:`, `docs:`).
- Do not add heavy dependencies without noting it in the PR (bundle size and install time matter at a hackathon).

## Definition of done
Runs from a clean clone, types and lint pass, one test on the core function, keyboard and screen-reader path checked, docs updated.

## Sub-agents
Defined in [.claude/agents/](.claude/agents/): `sonification-engineer`, `backend-fastapi`, `frontend-tanstack`, `a11y-reviewer`, `data-curator`.

## When docs and code disagree
Stop and fix the doc or ask. Do not silently diverge.
