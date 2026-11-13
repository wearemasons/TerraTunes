# TerraTunes frontend

The Earth Information Jukebox web app: pick a NASA Earth visualization, watch it and hear it.
React 19 · TanStack Router + Query · Vite · Tailwind 4 · shadcn/ui (`base-lyra`) · Web Audio · bun.

## Run

```bash
bun install
bun run dev:web            # http://localhost:3000
```

With no backend the app uses **demo data**: synthetic, Earth-like fields generated in the browser and clearly labelled as such. To use the FastAPI backend:

```bash
# frontend/apps/web/.env.local
VITE_API_URL=http://localhost:8000
```

The app checks `GET /healthz` on start and falls back to demo data if the API isn't reachable. Set `VITE_STATIC_MODE=1` to force demo data (for example, for an offline demo).

## Checks

Run from `apps/web/`:

| Command | What it does |
|---|---|
| `bun run check-types` | Production build, `tsc`, and the theme-token guard |
| `bun run lint:theme` | Fails on hard-coded colours in app code (hex, `rgb()`, `bg-blue-500`, …) |
| `bun run build && bun run serve` then `bun run test:a11y` | Real-browser axe audit (WCAG 2.2 AA), light and dark, all screens. Uses installed Chrome; `PW_CHANNEL=msedge` for Edge |

## Layout

```
apps/web/src/
  routes/            index (jukebox), track.$id (player), about, __root (shell)
  features/
    jukebox/         track cards
    player/          frame stage + overlays, transport, legend, charts, info tabs, shortcuts
    shortcuts/       shortcut list and dialog
    visuals/         frame canvas (theme-aware)
  audio/             engine.ts (Web Audio graph), player.ts (scheduler + store), timbres.ts
  lib/
    api/             contract types, data source (API or demo), TanStack Query options
    mock/            demo planet, catalogue and a demo port of the mapping rules
    a11y/            live-region announcer
packages/ui/         shadcn components and the theme (styles/globals.css)
```

## Rules

- **Only shadcn components** (`bunx shadcn@latest add <name>`, or `npx shadcn@latest add` if the bun runtime is older than 1.3).
- **Only theme tokens** for colour: `bg-primary`, `text-muted-foreground`, `--chart-1…5`. Canvas code reads tokens at draw time through `themeColor()`.
- The only data colours are colorbars reproduced from the source visualizations (`lib/colormap.ts`, `lib/mock/`, `features/player/legend.tsx`).

## Retheme with tweakcn

1. Design a theme at [tweakcn.com](https://tweakcn.com).
2. Paste its `:root`, `.dark` and `@theme inline` blocks over the same blocks in `packages/ui/src/styles/globals.css`.
3. Run the app in light, dark and high contrast, then run `bun run test:a11y` to confirm contrast still passes.

No component changes are needed. High contrast (`apps/web/src/index.css`) only remaps existing tokens, so it follows the new theme.

More detail: [docs/FRONTEND_PLAN.md](../docs/FRONTEND_PLAN.md) · [docs/ACCESSIBILITY.md](../docs/ACCESSIBILITY.md) · [docs/API_CONTRACT.md](../docs/API_CONTRACT.md)
