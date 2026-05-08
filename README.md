# Archon Workflow Studio

A React-Flow-based visual workflow builder for [Archon](https://github.com/coleam00/Archon). Ships in two modes from one codebase:

1. **Standalone** — for the [Dynamous](https://dynamous.ai) community. Run locally; connect to your own Archon installation; edit workflows visually.
2. **Drop-in for Archon** (planned, v1.5) — the same components replace Archon's existing `/workflows/builder` UI, closing the gap where `loop`, `approval`, `cancel`, and `script` node variants are unsupported.

## Status

**v1 in development.** See [`docs/superpowers/specs/2026-05-08-archon-workflow-studio-design.md`](docs/superpowers/specs/2026-05-08-archon-workflow-studio-design.md) for the design and [`docs/superpowers/plans/2026-05-08-archon-workflow-studio-v1.md`](docs/superpowers/plans/2026-05-08-archon-workflow-studio-v1.md) for the implementation plan.

## Quickstart (standalone, after Phase 2)

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
