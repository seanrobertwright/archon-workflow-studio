# Running Archon Workflow Studio locally

Bun workspaces monorepo. Bun handles install + test; Vite serves the standalone app.

## Quick start

From the repo root:

```powershell
bun install
bun --filter '@archon-studio/standalone' run dev
```

Open <http://localhost:5173>.

## Point at your Archon backend

The dev server proxies `/api/*` to `VITE_ARCHON_URL` (default `http://localhost:3737`).

Override in `apps/standalone/.env.local`:

```
VITE_ARCHON_URL=http://localhost:3737
```

If Archon isn't running, the app still loads — you'll see the offline banner from `BuilderPage` and can't load/save workflows.

## Other commands

```powershell
bun run test                                  # all workspaces (558 tests)
bun --filter '@archon-studio/core' run test   # just core
bun run build                                 # typecheck + build everything
bun run lint
```

## Production preview of the standalone

```powershell
bun --filter '@archon-studio/standalone' run build
bun --filter '@archon-studio/standalone' run preview
```

## Notes

- Use the package `name` field with `bun --filter` (e.g. `@archon-studio/standalone`), not the directory path.
- There is no top-level `dev` script — always target the app explicitly.
