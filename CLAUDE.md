# CLAUDE.md

Follow [AGENTS.md](AGENTS.md); it is the single source of project rules. Key docs:

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Sonification rules: [docs/SONIFICATION_DESIGN.md](docs/SONIFICATION_DESIGN.md)
- Accessibility: [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)
- API contract: [docs/API_CONTRACT.md](docs/API_CONTRACT.md)
- Backlog: [docs/TASKS.md](docs/TASKS.md)

Claude-specific notes:
- Prefer the project sub-agents in `.claude/agents/` for track-specific work.
- The challenge page may be unreachable (TLS error on fetch). Don't retry; use the pasted brief in `docs/PLAN.md`.
- Git: single root repo. `frontend/` is a normal folder (not a submodule or nested repo); never run `git init` inside it. Ask before committing.
