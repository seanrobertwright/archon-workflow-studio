# Changelog

All notable changes to Archon Workflow Studio are documented here.

## [0.9.0] — 2026-05-12

### Added

**Phase 10 — Tests, CI, docs, release polish**

- Unit tests for all three standalone route components (ConnectPage, WorkflowListPage, BuilderPage) — 9 new tests, fills the Phase 9 smoke gap
- Typecheck step added to CI (`ci.yml`) — runs after build before tests
- READMEs for root, `@archon-studio/core`, and `@archon-studio/api-archon`
- `bunfig.toml` + `tests/setup.ts` for `apps/standalone` (mirrors `packages/studio-core` test infra)

**Phase 9 — Connected mode**

- `ArchonApiClient` — real `fetch` for all 9 `WorkflowApiClient` methods
- `ArchonHttpError` typed error class
- `useConnectionStore` (Zustand + localStorage)
- Offline save queue with localStorage-backed retry
- Router tree: `/connect` → `/workflows` → `/builder/:name`
- `ConnectPage` — Test Connection + progressive cwd dropdown
- `WorkflowListPage` — React Query list with New / Fork / Delete
- `BuilderPage` — load + save with offline banner

**Phase 8 — Editor polish**

- Undo/redo with 400ms coalesce window (`useUndoStore`, `withUndo`)
- Multi-select (shift-click + marquee), `selectedNodeIds[]`, `primarySelectionId`
- Copy/paste/cut with versioned clipboard envelope + in-memory fallback
- Alignment kernels (left/right/top/bottom/centerH/centerV), distribute H/V, auto-arrange via dagre subgraph
- Smart guides SVG overlay during drag
- Grid snap toggle (16px)
- `useThemeStore` + `ThemePicker` (dark / light / high-contrast, localStorage-persisted)
- `VariantPicker` dropdown + confirm modal wired to `convertVariant`
- Full keyboard shortcut layer via `react-hotkeys-hook`

**Phases 0–7** — scaffold, data model, canvas, node library, inspector, `when:` builder, validation pipeline, YAML preview pane

### Packages

- `@archon-studio/core` — 0.9.0
- `@archon-studio/api-archon` — 0.9.0
