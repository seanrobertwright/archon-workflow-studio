# Archon Workflow Studio

A React-Flow-based visual workflow builder for [Archon](https://github.com/coleam00/Archon). Ships in two modes from one codebase:

1. **Standalone** — for the [Dynamous](https://dynamous.ai) community. Run locally; connect to your own Archon installation; edit workflows visually.
2. **Drop-in for Archon** (planned, v1.5) — the same components replace Archon's existing `/workflows/builder` UI, closing the gap where `loop`, `approval`, `cancel`, and `script` node variants are unsupported.

## Status

**v0.9.0** — Phases 0–10 complete. All core features shipped: canvas, node library, inspector, `when:` builder, validation, YAML preview, undo/redo, multi-select, copy/paste, alignment, themes, variant picker, and connected mode (connect → list → build → save against a live Archon).

Live smoke test pending: connect the standalone app to a running Archon instance to verify the `/connect` → `/workflows` → `/builder/:name` flow end-to-end.

See [`docs/superpowers/plans/`](docs/superpowers/plans/) for per-phase implementation history and drift notes.

## Quickstart (standalone)

```bash
# requires Bun >= 1.3.0
bun install
bun --filter='@archon-studio/standalone' run dev
# open http://localhost:5173
```

By default, the dev server proxies `/api/*` to `http://localhost:3737` (your Archon). Override with:

```bash
VITE_ARCHON_URL=http://my-archon-host:3737 bun --filter='@archon-studio/standalone' run dev
```

## Repo layout

- `packages/studio-core/` — the library (drop-in target)
- `packages/studio-api-archon/` — default `WorkflowApiClient` (Archon REST)
- `packages/studio-fixtures/` — sample workflows for tests + snippets
- `apps/standalone/` — the standalone Vite shell
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans
- `.research/` — research reference (Archon workflow data model)

## Contributing

This project follows the [Superpowers](https://github.com/anthropics/superpowers) brainstorm → spec → plan → execute workflow. Implementation lands phase-by-phase per the plan; each phase is reviewed before the next is written.

License TBD.
