# Frontend Build Plan

Scope: `frontend/apps/web` (React 19, TanStack Router + Query, Vite, Tailwind 4) and the shared UI package `frontend/packages/ui`. Product context: [PLAN.md](PLAN.md). Contract: [API_CONTRACT.md](API_CONTRACT.md). Accessibility: [ACCESSIBILITY.md](ACCESSIBILITY.md).

## 0. Status (2026-11-13)

Phases 0–4 are built, plus most of 5 and 6. The app runs fully offline on synthetic demo data until the backend is connected.

| Area | State |
|---|---|
| Jukebox, player, explore, about pages | Done |
| Audio engine (Web Audio, limiter, scan/overview, clear tone) | Done; needs a listening review on real speakers and headphones |
| Visuals: frame, playhead, hot-spot, legend, pitch contour, tension timeline, waveform | Done |
| Accessibility: keyboard, live regions, focus on navigation, high contrast, reduced motion | Done; axe WCAG 2.2 AA clean in both themes. NVDA pass still to do by hand |
| Theme-token guard | Done (`bun run lint:theme`, also runs in `check-types`) |
| Real API | Client ready behind `VITE_API_URL`; waits for the backend |

## 1. UI rule: shadcn components only, themeable with tweakcn

The whole UI must be restyleable later by pasting a [tweakcn](https://tweakcn.com) theme with **zero component edits**.

### Rules
1. **Only shadcn/ui components** for every visible element. Install with the CLI (`bunx shadcn@latest add <name>`), never hand-copy or hand-write look-alikes. Current style is `base-lyra` (Base UI primitives), keep it.
2. **All color, radius, font, shadow and spacing come from theme tokens** defined in `frontend/packages/ui/src/styles/globals.css` (`:root`, `.dark`, `@theme inline`). Use semantic utilities only: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `ring-ring`, `rounded-lg`, `bg-chart-1`…
3. **Forbidden in app code (one exception, see §11):** hex/rgb/oklch literals, Tailwind palette colors (`bg-blue-500`, `text-gray-400`), arbitrary values like `bg-[#123]`, inline `style` with colors, per-component CSS files, hard-coded font families.
4. **Compose, don't fork.** App components in `apps/web/src/features/*` compose shadcn primitives and pass props/variants. Do not edit files in `packages/ui/src/components/` except through `shadcn add --overwrite` or a documented variant addition.
5. **Non-UI exceptions** (allowed, no shadcn equivalent): the `<canvas>` frame renderer and the audio engine. Wrap the canvas in shadcn `Card` / `AspectRatio`; draw only with colors read from CSS variables (`getComputedStyle`) so tweakcn still themes it.
6. **Data-viz colors** (legend, hot-spot markers) use `--chart-1…5`.
7. **Icons:** `lucide-react` only (already configured).
8. **Dark and light** must both work; keep `next-themes` with class strategy. Add a high-contrast variant as a token override class, not new components.

### Tweakcn workflow
1. Design the theme at tweakcn.com.
2. Copy the generated CSS (`:root`, `.dark`, `@theme inline` blocks, fonts).
3. Paste over the token blocks in `packages/ui/src/styles/globals.css`.
4. Run the app, check contrast (≥ 4.5:1 text, ≥ 3:1 UI) in both modes. Fix in tweakcn, not in components.
5. Commit only `globals.css` (plus font links if any).

CI guard (P1): a script `scripts/check-theme-tokens.mjs` that fails if `apps/web/src` matches `#[0-9a-fA-F]{3,8}\b`, `\b(bg|text|border|ring|fill|stroke)-(red|blue|green|gray|slate|zinc|neutral|…)-\d`, or `\[#`.

## 2. Current state (audit)

| Item | State | Action |
|---|---|---|
| Router, Vite, Tailwind 4, theme provider | Working scaffold | Keep |
| `packages/ui` components | button, card, checkbox, dropdown-menu, empty, input, input-group, label, skeleton, sonner, textarea, tooltip, plus bubble, message, message-scroller, attachment, marker | Chat-style extras (bubble, message*, attachment, marker) look unused: confirm, then remove |
| `routes/index.tsx` | ASCII "BETTER T STACK" placeholder | Replace with Jukebox |
| `routes/__root.tsx` | Title "my-better-t-app" | Rename to TerraTunes, add skip link and live region |
| Package scope `@my-better-t-app/*` | Works | Optional rename to `@terratunes/*` (touches imports, `bun.lock`), do before feature work or never |
| Port | 3000 | Done |
| API client, Query, audio | None | Build (below) |

## 3. shadcn components to install

| Need | Component |
|---|---|
| Track cards, panels | `card`, `badge`, `separator`, `aspect-ratio`, `scroll-area` |
| Transport | `button`, `slider` (scrub, volume), `toggle`, `toggle-group` (mode, preset), `tooltip` |
| Settings | `switch`, `select`, `radio-group`, `label` |
| Audio key, transcript, description | `tabs`, `accordion`, `collapsible` |
| Shortcut help, confirmations | `dialog`, `sheet`, `kbd` |
| Feedback | `sonner` (installed), `alert`, `progress`, `skeleton` |
| Theme and menus | `dropdown-menu` (installed) |
| Charts | `chart` (Recharts wrapper) |
| Layout | `navigation-menu` or plain `button` links, `sidebar` (only if track list needs it) |

Install in one batch at the start of Phase 1. If the CLI cannot find a component for `base-lyra`, stop and report it; do not hand-roll a replacement.

## 4. Routes and screens

| Route | Screen | Key shadcn pieces |
|---|---|---|
| `/` | Jukebox: filter by EIC theme, grid of tracks | `card`, `badge`, `toggle-group`, `skeleton` |
| `/track/$id` | Player: frame, transport, mode/preset, audio key, transcript | `card`, `aspect-ratio`, `slider`, `button`, `tabs`, `toggle-group`, `kbd` |
| `/track/$id/explore` | Explore mode over the frame | same + `alert` for readout |
| `/about` | Method and credits | `card`, `accordion` |
| `__root` | Header, skip link, live region, theme toggle, shortcuts dialog | `dropdown-menu`, `dialog` |

Every route has: one `<h1>`, landmarks, `loader` that prefetches via Query, error and pending components (`alert`, `skeleton`).

## 5. Folder structure (`apps/web/src`)

```
routes/                 # file-based, thin: load data, render a feature
features/
  jukebox/              # TrackList, TrackCard, ThemeFilter
  player/               # FramePanel, Transport, ModeSwitch, AudioKey, Transcript, Description
  explore/              # ExploreSurface, ValueReadout
  shortcuts/            # ShortcutsDialog, useShortcuts
  settings/             # PresetPicker, VolumeControl
audio/                  # engine.ts, voices.ts, scheduler.ts, useAudio.ts (no UI, no colors)
lib/
  api/                  # generated types, client.ts, queries.ts, static-fallback.ts
  a11y/                 # announce.ts, LiveRegion.tsx, SkipLink.tsx
  mock/                 # score.mock.json, tracks.mock.json
components/             # app-level wrappers only (header, theme-provider), shadcn compositions
```

## 6. Phases

### Phase 0 — Foundations (≈ 2 h)
- [ ] Rename app title and metadata to TerraTunes; remove ASCII placeholder.
- [ ] Decide on the `@terratunes/*` scope rename and do it now or skip.
- [ ] Remove unused chat components after confirming no imports.
- [ ] Add deps: `@tanstack/react-query`, `openapi-typescript`, `tone` (or raw Web Audio).
- [ ] `QueryClientProvider` in root; router context carries `queryClient`.
- [ ] Install the shadcn set from §3.
- [ ] Add token guard script, wire into `check-types` or a `lint:theme` script.
- [ ] Commit the baseline tweakcn theme so later swaps are a pure `globals.css` diff.

### Phase 1 — Walking skeleton on mocks (≈ 4 h)
- [ ] `lib/mock/*` conforming to the contract. API client with `VITE_API_URL`, falls back to mocks/static when the API is down.
- [ ] `/` Jukebox from `tracks.mock.json`.
- [ ] `/track/$id`: frame image in `aspect-ratio` card, title, description.
- [ ] Root layout: skip link, `aria-live` region, header, theme toggle.
- **Exit:** open `/`, pick a track by keyboard, see it. No audio yet.

### Phase 2 — Audio engine (≈ 6 h)
- [ ] `AudioEngine`: create context on first gesture, master gain, limiter, `resume()`.
- [ ] Voices: drone, melody, rhythm, accent; exponential ramps (≥ 50 ms).
- [ ] Scheduler turns `score.frames[n]` into notes. Scan mode from `column_notes`.
- [ ] `useAudio` hook: `play/pause/seek/setVolume/mute`, exposes `currentFrame`, `isPlaying`.
- [ ] Pre-rendered MP3 fallback player if Web Audio init fails.
- **Exit:** Play makes sound from the mock score, pause is instant, no clicks, volume steps ≤ 6 dB / 100 ms.

### Phase 3 — Player UX (≈ 6 h)
- [ ] `Transport` (play/pause, prev/next frame, scrubber, volume, mute) using `button` and `slider`.
- [ ] `ModeSwitch` (Scan / Overview / Explore) and `PresetPicker` (Musical / Clear tone) via `toggle-group`.
- [ ] `AudioKey`, `Transcript` (synced to playback), `Description` in `tabs`.
- [ ] Frame canvas highlights the playhead using theme colors read from CSS variables.
- [ ] Announcements through the live region (throttled ≤ 1 per 2 s).
- **Exit:** full track playable and understandable with a screen reader.

### Phase 4 — Keyboard, Explore, Time series (≈ 6 h)
- [ ] Shortcuts: Space, ←/→, ↑/↓, `M`, `K`, `D`, `E`, `?`; toggle to disable; documented in `ShortcutsDialog` with `kbd`.
- [ ] Explore: pointer, touch, arrow keys sample `value_grid`, play local pitch, "read value" key.
- [ ] Time-series playback across frames with tension from the score.
- **Exit:** every action doable without a mouse.

### Phase 5 — Real API + polish (≈ 6 h)
- [ ] Generate types from the backend OpenAPI, replace mocks, keep static fallback.
- [ ] Loading, empty, and error states (`skeleton`, `empty`, `alert`).
- [ ] Responsive at 320 px and 400% zoom; reduced motion respected; high-contrast token class.
- [ ] About page with method and credits.
- [ ] Tweakcn pass: apply the final theme, re-check contrast in both modes.

### Phase 6 — Accessibility and demo hardening (≈ 4 h)
- [ ] axe-core run, Lighthouse a11y ≥ 95, NVDA full-flow, keyboard-only walkthrough (see [ACCESSIBILITY.md](ACCESSIBILITY.md)).
- [ ] Static export build verified offline (`VITE_STATIC_MODE=1`).
- [ ] Freeze, tag, record demo.

## 7. State and data

- **Server state:** TanStack Query (`tracks`, `track`, `score`, `grid`). `staleTime: Infinity` for curated tracks (immutable per `mapping_version`).
- **Playback state:** a small store inside `useAudio` (React context + reducer). Add Zustand only if prop drilling hurts.
- **Persisted per-viewer prefs:** preset, mode, volume, shortcuts on/off in `localStorage` (try/catch, defaults if blocked). Never persist anything needed for correctness.
- **URL state:** `track`, `mode`, `frame` as typed search params (TanStack Router `validateSearch` with zod, already a dependency) so links are shareable.

## 8. Testing

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | scheduler (score → note events), shortcut map, api fallback |
| Component | Vitest + Testing Library | transport labels/state, live-region throttling |
| A11y | `@axe-core/playwright` | each route, both themes |
| E2E | Playwright | keyboard-only: pick track → play → pause → open key |
| Types | `bun run check-types` | must be green before merge |

## 9. Definition of done (frontend PR)
- Only shadcn components and theme tokens used; token guard passes.
- Keyboard path and accessible names verified; no autoplay.
- Works on mocks and on the real API; static fallback intact.
- `bun run check-types` green, tests for new logic added.
- Reviewed by the `a11y-reviewer` agent for UI changes.

## 10. Risks
| Risk | Mitigation |
|---|---|
| A needed component is missing in `base-lyra` | Install the closest shadcn component and compose; report the gap. No custom look-alikes |
| Tweakcn theme breaks contrast | Check both modes after every swap; adjust in tweakcn |
| Canvas ignores theme | Read CSS variables at draw time and on theme change |
| Web Audio latency or autoplay block | Context created on gesture, MP3 fallback |
| Backend not ready | Build against `lib/mock`, contract-first |

## 11. Visualization layer

What the user sees while hearing the track. Everything here is **supporting**: the audio key, transcript and live-region text carry the same information, so no visual is the only carrier of meaning.

### Elements

| Element | Purpose | Built with | Data |
|---|---|---|---|
| **Frame view** | The EIC frame, the thing being sonified | `<img>`/canvas inside shadcn `Card` + `AspectRatio` | `/frames/{n}` |
| **Scan overlay** | Playhead line sweeping west→east, highlights the active column | Overlay `<canvas>` stacked on the frame | `column_notes`, playback time |
| **Hot-spot marker** | Ring where the accent voice fires | Overlay canvas, theme color `--primary` | `frame.hotspot` |
| **Explore cursor** | Cell under pointer/keyboard focus + value | Overlay canvas + `Alert` readout | `value_grid` |
| **Legend / colorbar** | What colors and pitch mean, with units | CSS gradient from colormap anchors + text min/max | `track.legend` |
| **Pitch contour** | Melody of the current frame (note vs x) | shadcn `chart` (Recharts), `--chart-1` | `column_notes` |
| **Tension timeline** | Tension and loudness across all frames, current frame marked | shadcn `chart`, `--chart-2/3`; click to seek | `frames[].tension` |
| **Live waveform / level** | Feedback that audio is running | Small canvas fed by `AnalyserNode`, `aria-hidden` | Audio engine |
| **Frame scrubber** | Seek by frame | shadcn `slider` with tick marks | `frame_count` |

### Rules
1. Charts use the shadcn `chart` component and `--chart-*` tokens only. No other chart library.
2. Canvas drawing reads colors from CSS variables at draw time and re-reads on theme change (`MutationObserver` on `<html class>`), so tweakcn themes still apply.
3. **Exception to the no-hex rule:** *data* colors that reproduce the NASA colormap (legend gradient) come from `colormaps/<id>.json` and are applied through `style`. They are source data, not theme. The token guard must exempt this one component (`features/player/Legend.tsx`).
4. Each visual has a text equivalent: frame `role="img"` with `aria-label`; pitch contour and tension charts get a one-sentence summary below ("Melody rises from D3 to A4 across the frame"); decorative visuals are `aria-hidden`.
5. Respect `prefers-reduced-motion`: no sweeping playhead animation (jump per step instead), waveform shows a static level bar, chart animations off.
6. Never rely on color alone: hot-spot uses shape (ring) plus label, legend has numeric values.

### Performance
- One `requestAnimationFrame` loop owned by the player; overlays draw only when `currentTime`, frame or hover changes.
- Size canvases with `ResizeObserver` × `devicePixelRatio`; keep the value grid at ≈ 96×54 and scale up.
- Pause the loop when the tab is hidden (`visibilitychange`) or playback is stopped.
- Budget: ≤ 4 ms per frame draw on a mid laptop, 60 fps target, no layout thrash.
- Pre-decode frames with `createImageBitmap`; prefetch next 3 frames during playback.

### Tasks (slot into the phases)
- Phase 1: `FramePanel` with image, label, credit.
- Phase 2: `AnalyserNode` tap in the engine.
- Phase 3: `ScanOverlay`, `HotspotMarker`, `Legend`, `PitchContour`, `Waveform`, text summaries.
- Phase 4: `ExploreCursor`, `TensionTimeline` with click-to-seek, reduced-motion variants.
- Phase 5: theme-change redraw, perf pass, `chart` summaries in the transcript tab.
- Phase 6: axe check that every visual has a text equivalent or `aria-hidden`.

### List virtualization
Not needed. The catalogue is 6–9 tracks, ≤ 40 frames per track and a short transcript, so plain rendering is fine. Add TanStack Virtual only if a list passes ≈ 200 rows, for example if we later add user uploads or a large catalogue.
