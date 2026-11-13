# AGENTS.md — rules for AI coding agents on TeraTones

Project: Earth Information Jukebox (NASA Space Apps 2026). Read [README.md](README.md) and [docs/PLAN.md](docs/PLAN.md) first.

## Stack
- Frontend: `frontend/` (bun workspaces). `apps/web` = React 19 + **TanStack Router** (+ TanStack Query) + Vite + Tailwind 4. Shared UI in `packages/ui` (shadcn).
- Backend: `backend/` = **FastAPI**, Python 3.12, `uv`, Pydantic v2, NumPy, OpenCV (headless), Pillow, ffmpeg.
- Contract: [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Pydantic schemas are the source of truth; TS types are generated.

## Commands
```bash
# frontend (from frontend/)
bun install
bun run dev:web          # http://localhost:3000
bun run check-types

# backend (from backend/)
uv sync
uv run fastapi dev app/main.py
uv run pytest
uv run ruff check . && uv run mypy app
```

## Non-negotiables
1. **Accessibility first.** Every UI change must be keyboard operable, labelled, and have a text equivalent for any audio or visual-only information. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md). No autoplay.
2. **Mapping logic lives in one place:** `backend/app/mapping/`. The frontend consumes score fields; it does not re-derive musical decisions.
3. **Honest sonification.** Values come from colormap calibration, not hue guesswork. Uncalibrated output must be labelled as artistic.
4. **Determinism.** Same input → same score. Seed any randomness and store the seed.
5. **Contract first.** Changing an endpoint or field = update schemas, then `docs/API_CONTRACT.md`, then clients, in the same PR. Bump `mapping_version` when mapping rules change.
6. **Credits and licensing.** Every media asset needs a credit and source URL in `backend/data/tracks.json`. No raw videos in git.
7. **Safety of audio.** Master limiter, no sudden gain jumps (> 6 dB / 100 ms), exponential ramps.
8. **No secrets in the repo.** `.env` files are git-ignored; frontend env goes through varlock (`apps/web/src/env.ts`).

## Conventions
- TypeScript strict; no `any` without a comment. Functional components, hooks, feature folders (`features/<name>/`).
- Routes are file-based under `apps/web/src/routes/`. Data fetching via TanStack Query hooks in `lib/api/`.
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
