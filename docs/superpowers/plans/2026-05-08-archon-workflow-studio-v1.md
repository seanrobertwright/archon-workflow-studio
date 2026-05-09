# Archon Workflow Studio v1 Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React-Flow-based visual workflow builder for Archon that ships standalone for the Dynamous community AND drops into Archon's `packages/web` as a replacement for the existing builder, supporting all 7 node variants with byte-equivalent round-tripping.

**Architecture:** Bun workspaces monorepo with three library packages (`studio-core`, `studio-api-archon`, `studio-fixtures`) and one standalone Vite app (`apps/standalone`). `studio-core` is HTTP-agnostic — it consumes a `WorkflowApiClient` interface via React context, so it works identically standalone (against a remote Archon) and embedded (against Archon's own `apiClient`). All UI state derives from a single Zustand store whose source-of-truth is a `WorkflowDefinition` JSON; React Flow holds only positions and ephemeral selection. The exporter and importer are pure functions powered by a per-variant registry in `nodes/`.

**Tech Stack:** Bun `^1.3.0`, TypeScript `^5.3.0`, React `^19.0.0`, Vite `^6.0.0`, `@xyflow/react ^12.10.1`, `@dagrejs/dagre ^2.0.4`, Tailwind `^4.0.0` + `@tailwindcss/vite`, `@tanstack/react-query ^5.0.0`, `zustand ^5.0.12`, Zod `^3.25.28`, `yaml ^2.x` (browser YAML), `highlight.js ^11.x` + `rehype-highlight` (preview highlighting), `bun test` for unit/component/integration, Playwright for `apps/standalone` E2E only.

**Spec:** [`docs/superpowers/specs/2026-05-08-archon-workflow-studio-design.md`](../specs/2026-05-08-archon-workflow-studio-design.md)
**Research:** [`.research/archon-workflows.md`](../../../.research/archon-workflows.md)
**Archon source pin (provisional):** `fd6d75e76218da8a5804bed5c1548de769c4c658` — finalized in Task 9.

---

## Scope check

This plan covers v1 of one cohesive product, not multiple independent subsystems. The chunks below ARE the phase boundaries; each phase produces a working, testable increment but only Phase 9 onward delivers a shippable end-to-end studio. We do not split into separate plans because earlier phases have no standalone user value (e.g., a registry without a UI is not a thing anyone runs).

The plan is structured as **chunks of ≤1000 lines each, reviewed independently per the writing-plans skill**. Phase 0 is large enough to span two chunks (1 + 2); Phases 1–10 are each one chunk (Chunks 3–12). **This file currently contains Chunks 1, 2, and 3 (Phase 0 + Phase 1) in full detail.** Subsequent chunks will be appended after each is reviewed; until then, the phase outline below is the binding contract for what those chunks will cover.

---

## File structure (target end of v1)

Files listed by responsibility. Day-0 files are created in Phase 0; everything else is annotated by the phase that creates it.

### Repo root

| Path | Responsibility | Phase |
|---|---|---|
| `package.json` | Bun workspaces root; cross-cutting scripts; root devDeps (eslint, prettier, husky, lint-staged) | 0 |
| `bun.lock` | lockfile (committed) | 0 |
| `tailwind.config.ts` | Tailwind 4 root config; design tokens that mirror Archon's palette | 0 |
| `.archon-source-pin` | one-line file: SHA of Archon `main` we mirrored from | 0 |
| `eslint.config.js` | flat-config eslint, mirrors Archon | 0 |
| `prettier.config.js` | matches Archon's prettier config | 0 |
| `.gitignore` | already exists; add `node_modules/`, `dist/`, `.bun/`, `apps/*/dist/`, `playwright-report/`, etc. | 0 |
| `.github/workflows/ci.yml` | build + test + lint per push | 0 |
| `.github/workflows/round-trip.yml` | the killer test, runs against bundled Archon defaults | 0 |
| `.github/workflows/schema-drift.yml` | nightly + on-demand schema-mirror drift check | 0 |
| `README.md` | quickstart for both standalone and embedded modes | 0 (update) |

### `packages/studio-core` (the library — drop-in target)

| Path | Responsibility | Phase |
|---|---|---|
| `package.json` | `@archon-studio/core`; peerDeps react 19 + xyflow 12; exports `./` | 0 |
| `tsconfig.json` | per-package TS config (no shared base) | 0 |
| `src/index.ts` | curated public exports; the *only* import surface for consumers | 0 |
| `src/components/WorkflowBuilder.tsx` | top-level layout shell; mounts ApiClientProvider + ThemeProvider + StoreProvider | 0 (skeleton) → 2 |
| `src/components/Canvas.tsx` | React Flow canvas; drag-from-library, double-click quick-add | 2 |
| `src/components/NodeLibrary.tsx` | left palette: quick-add tiles + commands + snippets | 3 |
| `src/components/NodeInspector.tsx` | right inspector tab shell; mounts variant-specific General + shared base tabs | 4 |
| `src/components/ValidationPanel.tsx` | bottom drawer: errors / warnings / info | 6 |
| `src/components/YamlPreview.tsx` | right drawer: read-only highlighted YAML with click-to-focus | 7 |
| `src/components/Toolbar.tsx` | top bar: name, undo/redo, validate, save, theme picker, codebase pill | 2 / 8 / 9 |
| `src/components/StudioErrorBoundary.tsx` | render-error rescue with JSON copy-out | 0 (skeleton) → 8 |
| `src/nodes/registry.ts` | central `VariantRegistry` + register-time API | 1 |
| `src/nodes/shared/BaseFieldsTabs.tsx` | reused inspector tabs (Execution / Provider / Tools / Hooks / Skills+MCP / Advanced) | 4 |
| `src/nodes/shared/WhenBuilder.tsx` | visual + raw `when:` editor; output is canonical Archon string | 5 |
| `src/nodes/shared/DependsOnEditor.tsx` | chip-list backup for off-screen parents | 4 |
| `src/nodes/shared/pickBaseFields.ts` | pure: extract typed base fields, capture residue into `_unknown` | 1 |
| `src/nodes/shared/detectVariant.ts` | pure: which DagNode key is present → variant id; mirrors Archon's `superRefine` | 1 |
| `src/nodes/{command,prompt,bash,script,loop,approval,cancel}/` | one folder per variant; each: `index.ts`, `Renderer.tsx`, `Inspector.tsx`, `fromDag.ts`, `toDag.ts` | 0 (placeholders) → 1 (data) → 3 (Renderer) → 4 (Inspector) |
| `src/schemas/{workflow,dag-node,loop,retry,hooks}.ts` | Archon Zod schemas verbatim; checked by drift CI | 0 |
| `src/schemas/index.ts` | re-exports + DagNode type | 0 |
| `src/api/WorkflowApiClient.ts` | the seam interface | 0 |
| `src/api/ApiClientProvider.tsx` | React context + `useWorkflowApi()` hook | 0 (skeleton) → 9 |
| `src/store/builder-store.ts` | Zustand store + actions + selectors | 0 (skeleton) → 1 / 2 / 8 |
| `src/store/history.ts` | undo/redo middleware (snapshot-based) | 8 |
| `src/exporter/toWorkflowDefinition.ts` | pure: store nodes + edges → `WorkflowDefinition` | 1 |
| `src/exporter/fromWorkflowDefinition.ts` | pure: `WorkflowDefinition` → store nodes + edges (with dagre layout) | 1 |
| `src/hooks/useBuilderValidation.ts` | instant + debounced client validation | 6 |
| `src/hooks/useServerValidation.ts` | server validation via `WorkflowApiClient.validate` | 6 |
| `src/hooks/useDagre.ts` | layout helpers; matches Archon's existing `dag-layout.ts` settings | 2 |
| `src/theme/tokens.css` | 4 presets (`archon-dark`, `light`, `high-contrast`, `inherit`) | 0 |
| `src/theme/ThemeProvider.tsx` | sets `data-studio-theme` on root | 0 (skeleton) → 8 |
| `src/lib/yaml-preview.ts` | yaml-package serialize + line→node map for click-to-focus | 7 |
| `src/lib/cascade-rename.ts` | id rename → cascade through depends_on / when / `$id.output` | 4 |
| `src/lib/grammar.ts` | parse + format the `when:` grammar | 5 |
| `tests/round-trip.spec.ts` | the killer test; grows fixture-by-fixture | 0 |
| `tests/...` | per-feature tests, colocated by phase | 1+ |

### `packages/studio-api-archon`

| Path | Responsibility | Phase |
|---|---|---|
| `package.json` | `@archon-studio/api-archon`; depends on `@archon-studio/core` (workspace) | 0 |
| `tsconfig.json` | per-package | 0 |
| `src/ArchonApiClient.ts` | default `WorkflowApiClient` implementation; targets Archon's REST endpoints | 0 (stubs) → 9 |
| `src/index.ts` | exports the client | 0 |

### `packages/studio-fixtures`

| Path | Responsibility | Phase |
|---|---|---|
| `package.json` | `@archon-studio/fixtures`; ships YAML + JSON fixtures | 0 |
| `src/index.ts` | helpers to load fixtures by name | 0 |
| `src/snippets/{starters,patterns}/*.yaml` | seed snippets (3+ starters, 3+ patterns by Phase 3) | 0 (1 starter to start) → 3 |
| `src/round-trip-fixtures/*.yaml` | vendored copies of Archon's bundled defaults at the pinned SHA | 0 (1 fixture) → 1 (all bundled defaults) |

### `apps/standalone`

| Path | Responsibility | Phase |
|---|---|---|
| `package.json` | depends on `@archon-studio/core` + `api-archon` (workspaces) | 0 |
| `tsconfig.json` | per-package | 0 |
| `vite.config.ts` | dev proxy → user's Archon URL; tailwind plugin | 0 |
| `index.html` | Vite entry | 0 |
| `src/main.tsx` | mount React; ThemeProvider preset = `archon-dark`; ApiClientProvider | 0 |
| `src/App.tsx` | routes: `/connect`, `/workflows`, `/builder/:name` | 0 (skeleton) → 9 |
| `src/connect/ConnectScreen.tsx` | URL + cwd settings; Test button | 9 |
| `src/workflows/WorkflowListPage.tsx` | grouped list (project/global/bundled), New/Fork actions | 9 |
| `src/builder/BuilderPage.tsx` | hosts `<WorkflowBuilder />` with the selected workflow | 9 |
| `src/settings/SettingsPanel.tsx` | URL change, theme picker, cwd switching | 8 / 9 |
| `e2e/*.spec.ts` | Playwright E2E (one smoke per variant + connect→edit→save→reload roundtrip) | 10 |

### Tooling scripts

| Path | Responsibility | Phase |
|---|---|---|
| `scripts/check-schema-drift.ts` | fetch Archon schemas at pinned SHA, diff against ours | 0 |
| `scripts/probe-archon-endpoints.ts` | one-shot probe; runs `GET /api/openapi.json`, checks `/api/codebases`, etc.; prints findings | 0 |
| `scripts/round-trip-fixtures.ts` | fetch every YAML in Archon's `.archon/workflows/defaults/` at pinned SHA → write into `studio-fixtures/round-trip-fixtures/` | 0 (harness) → 1 (full sweep) |
| `scripts/yaml-equivalence.ts` | compares `Bun.YAML.stringify(parseWorkflow(yaml))` to our `yaml`-package output for a representative workflow; prints normalisation diffs | 0 |

---

## Phase outline

> Each phase below is a future chunk; only Chunk 1 (Phase 0) is fully detailed in this file. Subsequent chunks are appended on approval.

**Phase 0 — Scaffold (Chunk 1, this file).** Bun workspaces root, four packages/apps, tooling, schema mirror at pinned SHA, schema-drift CI, killer round-trip harness with one fixture, Archon-endpoint probes, README updated. Outcome: `bun install && bun run build && bun test` green; CI workflows pass; round-trip test passes on one bundled default.

**Phase 1 — Core data model + registry (Chunk 3, this file).** Variant registry shape + 7 variant placeholder modules, `detectVariant`, `pickBaseFields`, the `_unknown` round-trip, Zustand store + actions, importer (`fromWorkflowDefinition`), exporter (`toWorkflowDefinition`). Vendor every Archon bundled default into `round-trip-fixtures/`. Outcome: round-trip test passes for ALL bundled defaults + the all-nodes smoke fixture, with `_unknown` capturing the residue.

**Phase 2 — Canvas + theme + standalone shell skeleton (Chunk 3).** ThemeProvider with all four presets, `WorkflowBuilder` shell layout, `Canvas` with React Flow + dagre auto-layout (matching Archon's settings), `DagNodeComponent` with single top/bottom handles + variant color stripe + dashed `when:` edges, position persistence to localStorage, basic add/delete/connect/disconnect actions, the standalone `apps/standalone` shell wired to a stubbed `ArchonApiClient` returning a fixture so you can see the editor running locally. Outcome: open standalone, see a fixture workflow rendered, drag nodes around, watch positions persist on reload.

**Phase 3 — NodeLibrary + per-variant Renderers + snippets (Chunk 4).** `NodeLibrary` panel with quick-add tiles, drag-from-library, command palette pulling from `/api/commands`, snippet section. Per-variant `Renderer.tsx` for all 7 (variant-specific visuals: loop badge with iteration cap, approval orange treatment, cancel red, etc.). Snippets seeded into `studio-fixtures/snippets/` (3 starters from Archon defaults + 3 patterns); insertion path runs the importer with auto-rename. Outcome: studio looks like the Section 4 mockup from brainstorm.

**Phase 4 — NodeInspector + variant inspectors + cascading rename (Chunk 5).** `NodeInspector` shell with tabs. Shared `BaseFieldsTabs.tsx` (Execution / Provider / Tools / Hooks / Skills+MCP / Advanced) with capability-driven tab visibility. Per-variant General-tab Inspector for all 7. `DependsOnEditor` chip backup. `cascadeRename` library + tests. Raw fields panel for `_unknown`. Outcome: every variant's every field is editable; rename a node, references update everywhere; Archon-native fields like `output_format` JSON-Schema editor shown.

**Phase 5 — Visual `when:` builder + autocomplete (Chunk 6).** `WhenBuilder` visual mode (AND-groups-as-boxes, OR-creates-new-box, atom rows with node/field/op/value). Raw mode with grammar validation. `lib/grammar.ts` parse + format. `$nodeId.output` autocomplete inside textareas (prompt/bash/script/loop-prompt/approval-message bodies); `.field` autocomplete from upstream `output_format`. Outcome: the worst friction point of the existing Archon builder is gone.

**Phase 6 — Validation pipeline + ValidationPanel (Chunk 7).** Instant client rules (selectors, every render). Debounced client rules (cycles, ref integrity, markdown-stripped scanning) at 300ms. Server validation via `WorkflowApiClient.validate` fired immediately after debounced client settles. `ValidationPanel` UI with click-to-focus. On-demand "Resolve resources" button cross-checking `/api/commands`. Offline yellow state + queued saves. Outcome: studio gates Save on a green panel; user always knows what's wrong and where.

**Phase 7 — YAML preview pane (Chunk 8).** `yaml`-package serializer producing canonical Archon-shape YAML. `highlight.js` + `rehype-highlight` syntax highlighting. Line→node map for hover/click-to-focus. "Preview formatting may differ" note. Drawer toggle in inspector slot. Outcome: live YAML preview, clickable, accurate.

**Phase 8 — Editor polish: undo/redo + multi-select + copy/paste + theme picker (Chunk 9).** Snapshot-based undo middleware on the Zustand store (workflow JSON only — positions excluded). Multi-select via shift-click + marquee. Copy/paste with auto-renamed IDs and remapped `depends_on`. Theme picker in toolbar (3 presets — `inherit` is for embed mode, not exposed in standalone picker). Keyboard shortcut layer. Outcome: studio feels like a 2026-grade visual editor.

**Phase 9 — Connected mode complete: connect, list, save (Chunk 10).** Real `ArchonApiClient` implementations of every method. Connect screen (URL + cwd; Test button hits `/api/openapi.json`). cwd field with progressive enhancement: dropdown if `/api/codebases` exists, manual input otherwise. Workflow list page grouped by source. New / Fork / Save / Delete flows. Bundled-default shadow info banner. Save queue when offline. Outcome: end-to-end Dynamous use case works against any localhost Archon.

**Phase 10 — Tests + drift CI + docs + release polish (Chunk 11).** Fill out unit + component + integration tests to coverage targets (≥80% on `studio-core`). Playwright E2E in `apps/standalone/e2e/`. Drift CI workflow runs against the latest Archon `main` daily. README expansion: install, configure, screenshots. CONTRIBUTING.md. Issue templates. Tag v1.0.0. Outcome: shippable.

---

## Chunk 1: Phase 0a — Workspaces, tooling, four package scaffolds

**Goal of this chunk:** Stand up the empty repo skeleton: Bun workspaces, ESLint/Prettier/husky, the four packages/apps (`studio-core`, `studio-api-archon`, `studio-fixtures`, `apps/standalone`) with their tsconfigs and minimal entry points. The standalone Vite app must render a placeholder "Phase 0" page in the archon-dark theme. Tailwind config, Archon schema mirror, CI, round-trip harness, and probes are all in Chunk 2.

**Definition of done for Phase 0a (this chunk):**
- `bun install` succeeds and `bun.lock` is committed.
- `bun --filter='*' run build` is green across all four packages/apps.
- `bun run lint` and `bun run format:check` are green.
- `apps/standalone` runs locally (`bun --filter='@archon-studio/standalone' run dev`), shows the placeholder page; dark archon-dark theme applied; tokens.css loaded.
- All variant-folder placeholders, `WorkflowApiClient` interface, Zustand store skeleton, and `ThemeProvider` exist and compile.

**Reference skill if you get stuck:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`.

---

### Task 1: Bun workspaces root

**Files:**
- Create: `package.json`
- Verify: `bun.lock` after `bun install`

- [ ] **Step 1: Confirm Bun is installed and on PATH**

Run: `bun --version`
Expected: any output `1.3.x` or higher. If not, install Bun from https://bun.sh.

- [ ] **Step 2: Write `package.json` at repo root**

Create `package.json`:

```json
{
  "name": "archon-workflow-studio",
  "private": true,
  "version": "0.0.0",
  "description": "Visual workflow builder for Archon — standalone for the Dynamous community, drop-in for Archon's web package.",
  "type": "module",
  "engines": {
    "bun": "^1.3.0"
  },
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build": "bun --filter='*' run build",
    "test": "bun --filter='*' run test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check-schema-drift": "bun run scripts/check-schema-drift.ts",
    "probe-archon": "bun run scripts/probe-archon-endpoints.ts"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "bun-types": "^1.3.5",
    "@types/bun": "latest",
    "eslint": "^9.39.1",
    "@eslint/js": "^9.39.1",
    "typescript-eslint": "^8.48.0",
    "eslint-config-prettier": "10.1.8",
    "prettier": "^3.7.4",
    "husky": "^9.1.7",
    "lint-staged": "^15.2.0"
  }
}
```

- [ ] **Step 3: Run install**

Run: `bun install`
Expected: produces `bun.lock`, `node_modules/` symlinks; no errors.

- [ ] **Step 4: Verify scripts dispatch correctly**

Run: `bun run lint`
Expected: ESLint runs (will fail because no `eslint.config.js` yet — that's Task 3); the dispatch itself works.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(scaffold): bun workspaces root + dev tool pins"
```

---

### Task 2: Update `.gitignore` for Bun + JS tooling outputs

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append to `.gitignore`**

Add the following lines to `.gitignore` (existing content already covers `.env`, OS junk, `node_modules`, `dist`, `.next`, `__pycache__`, etc.):

```
# --- Bun ---
.bun/

# --- App build outputs ---
apps/*/dist/
packages/*/dist/

# --- Test artifacts ---
playwright-report/
test-results/
coverage/

# --- Vendored fixtures (regeneratable) ---
# packages/studio-fixtures/src/round-trip-fixtures is COMMITTED — pinned to .archon-source-pin
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore(scaffold): ignore bun cache + dist + test artifacts"
```

---

### Task 3: ESLint + Prettier + husky + lint-staged

**Files:**
- Create: `eslint.config.js`
- Create: `prettier.config.js`
- Create: `.husky/pre-commit`
- Modify: `package.json` (add `prepare` script + `lint-staged` config)

- [ ] **Step 1: Write `prettier.config.js`**

Create `prettier.config.js`:

```js
/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  arrowParens: 'always',
  endOfLine: 'lf',
};
```

- [ ] **Step 2: Write `eslint.config.js` (flat config)**

Create `eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/',
      '**/dist/',
      'apps/*/dist/',
      'packages/*/dist/',
      '.research/',
      '.superpowers/',
    ],
  },
];
```

- [ ] **Step 3: Add `prepare` + `lint-staged` to `package.json`**

In root `package.json`, add to `"scripts"`:

```json
"prepare": "husky"
```

And add at top level (sibling of `scripts`):

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx,json,md}": "prettier --write",
  "*.{ts,tsx}": "eslint --fix"
}
```

- [ ] **Step 4: Initialize husky**

Run: `bunx husky init`
Expected: creates `.husky/pre-commit` containing `bun test` (replace next step).

- [ ] **Step 5: Replace `.husky/pre-commit` content**

Overwrite `.husky/pre-commit` with:

```bash
bunx lint-staged
```

- [ ] **Step 6: Smoke-test the format**

Run: `bun run format`
Expected: rewrites no files (everything is fresh) or formats consistently. No errors.

Run: `bun run lint`
Expected: zero errors (no source code yet).

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js prettier.config.js .husky package.json bun.lock
git commit -m "chore(scaffold): eslint flat config + prettier + husky + lint-staged"
```

---

### Task 4: `studio-core` package shell

**Files:**
- Create: `packages/studio-core/package.json`
- Create: `packages/studio-core/tsconfig.json`
- Create: `packages/studio-core/src/index.ts`
- Create: `packages/studio-core/src/components/.gitkeep` (empty placeholder folder)
- Create: `packages/studio-core/src/nodes/registry.ts` (empty registry skeleton)
- Create: `packages/studio-core/src/nodes/{command,prompt,bash,script,loop,approval,cancel}/index.ts` (variant placeholders)
- Create: `packages/studio-core/src/nodes/shared/.gitkeep`
- Create: `packages/studio-core/src/api/WorkflowApiClient.ts` (interface only)
- Create: `packages/studio-core/src/api/ApiClientProvider.tsx` (skeleton context)
- Create: `packages/studio-core/src/store/builder-store.ts` (Zustand skeleton)
- Create: `packages/studio-core/src/theme/ThemeProvider.tsx` (skeleton)
- Create: `packages/studio-core/src/theme/tokens.css` (4 presets)
- Create: `packages/studio-core/tests/.gitkeep`

- [ ] **Step 1: Write `packages/studio-core/package.json`**

```json
{
  "name": "@archon-studio/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./theme/tokens.css": "./src/theme/tokens.css"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "bun test"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xyflow/react": "^12.10.1"
  },
  "dependencies": {
    "zod": "^3.25.28",
    "zustand": "^5.0.12",
    "@dagrejs/dagre": "^2.0.4",
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/dagre": "^0.7.0",
    "@testing-library/react": "^16.0.0",
    "happy-dom": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xyflow/react": "^12.10.1"
  }
}
```

- [ ] **Step 2: Write `packages/studio-core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

(Phase 0 uses `tsc --noEmit` for type-checking only. We emit `.d.ts` and JS via Vite/bundlers in later phases when the package gets consumed; until then, emit-related options are dead config and would be misleading.)

- [ ] **Step 3: Write `packages/studio-core/src/schemas/index.ts` (stub)**

The full schemas land in Task 9 (Chunk 2). For Phase 0a we only need the type names so dependent files (`WorkflowApiClient.ts`, the public surface, the api-archon stub) can resolve their imports and the build is green.

```ts
// MIRROR-NOTE: Phase 0a stub — real Zod schemas + types replace this in Task 9.
// Both names are aliased to `unknown` so consumers compile but cannot rely on
// runtime shape until the mirror lands.
export type WorkflowDefinition = unknown;
export type DagNode = unknown;
```

- [ ] **Step 4: Write the public surface `packages/studio-core/src/index.ts`**

```ts
// Public surface for @archon-studio/core. Re-export only what consumers should use.
export const STUDIO_CORE_VERSION = '0.0.0';

export { ThemeProvider, type ThemePreset } from './theme/ThemeProvider';
export { ApiClientProvider, useWorkflowApi } from './api/ApiClientProvider';
export type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
} from './api/WorkflowApiClient';
export type { WorkflowDefinition, DagNode } from './schemas';
export { VARIANT_IDS, type VariantId } from './nodes/registry';
```

(Task 9 in Chunk 2 replaces `schemas/index.ts` with real Zod schemas; the public surface here doesn't change because the type names are stable.)

- [ ] **Step 5: Write `packages/studio-core/src/api/WorkflowApiClient.ts`**

```ts
import type { WorkflowDefinition } from '../schemas';

export interface CodebaseInfo {
  id: string;
  name: string;
  default_cwd: string;
}

export interface WorkflowListItem {
  workflow: WorkflowDefinition;
  source: 'project' | 'global' | 'bundled';
}

export interface ValidateResult {
  valid: boolean;
  errors?: string[];
}

/**
 * The seam. studio-core takes no opinion on HTTP. Implementations live elsewhere:
 *   - studio-api-archon (default REST client)
 *   - host adapter (when embedded in Archon, wraps Archon's internal apiClient)
 */
export interface WorkflowApiClient {
  // discovery
  listCodebases(): Promise<CodebaseInfo[] | null>; // null = endpoint not exposed by this Archon
  listWorkflows(cwd: string): Promise<WorkflowListItem[]>;
  listCommands(cwd: string): Promise<{ name: string; source: 'project' | 'global' | 'bundled' }[]>;
  listProviders(): Promise<{ id: string; capabilities: Record<string, boolean> }[]>;

  // CRUD
  getWorkflow(name: string, cwd: string): Promise<WorkflowDefinition>;
  saveWorkflow(name: string, cwd: string, definition: WorkflowDefinition): Promise<WorkflowDefinition>;
  deleteWorkflow(name: string, cwd: string): Promise<void>;

  // validation
  validateWorkflow(definition: WorkflowDefinition): Promise<ValidateResult>;

  // server health (used by the connect screen)
  ping(): Promise<{ ok: true; serverVersion?: string }>;
}
```

- [ ] **Step 6: Write `packages/studio-core/src/api/ApiClientProvider.tsx` (skeleton)**

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { WorkflowApiClient } from './WorkflowApiClient';

const ApiClientContext = createContext<WorkflowApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: WorkflowApiClient;
  children: ReactNode;
}) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useWorkflowApi(): WorkflowApiClient {
  const ctx = useContext(ApiClientContext);
  if (!ctx) throw new Error('useWorkflowApi must be used inside <ApiClientProvider>');
  return ctx;
}
```

- [ ] **Step 7: Write `packages/studio-core/src/nodes/registry.ts` (skeleton)**

```ts
export type VariantId =
  | 'command'
  | 'prompt'
  | 'bash'
  | 'script'
  | 'loop'
  | 'approval'
  | 'cancel';

// Phase 1 fills in VariantDefinition + a working register() / get() API.
// This file exists in Phase 0 as the placeholder anchor.
export const VARIANT_IDS: readonly VariantId[] = [
  'command',
  'prompt',
  'bash',
  'script',
  'loop',
  'approval',
  'cancel',
] as const;
```

- [ ] **Step 8: Create the seven variant placeholder files**

Create one file per variant at the path in the table below. Every file uses the same template, with the variant id literal replacing `<id>`. After this step, `ls packages/studio-core/src/nodes/` must show exactly seven variant folders plus `shared/`.

| Variant id | File path |
|---|---|
| `command` | `packages/studio-core/src/nodes/command/index.ts` |
| `prompt` | `packages/studio-core/src/nodes/prompt/index.ts` |
| `bash` | `packages/studio-core/src/nodes/bash/index.ts` |
| `script` | `packages/studio-core/src/nodes/script/index.ts` |
| `loop` | `packages/studio-core/src/nodes/loop/index.ts` |
| `approval` | `packages/studio-core/src/nodes/approval/index.ts` |
| `cancel` | `packages/studio-core/src/nodes/cancel/index.ts` |

Template (substitute `<id>` with the row's variant id literal — e.g., `'command'`, `'prompt'`, etc.):

```ts
// Phase 1 fills in: VariantDefinition, Renderer, Inspector, fromDag, toDag.
export const variantId = '<id>' as const;
```

- [ ] **Step 9: Write `packages/studio-core/src/store/builder-store.ts` (skeleton)**

```ts
import { create } from 'zustand';

interface BuilderState {
  // Phase 1 will populate workflow / selection / history / ui slices.
  ready: boolean;
}

export const useBuilderStore = create<BuilderState>(() => ({
  ready: false,
}));
```

- [ ] **Step 10: Write `packages/studio-core/src/theme/ThemeProvider.tsx` (skeleton)**

```tsx
import { useEffect, type ReactNode } from 'react';

export type ThemePreset = 'archon-dark' | 'light' | 'high-contrast' | 'inherit';

export function ThemeProvider({
  preset,
  children,
}: {
  preset: ThemePreset;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.dataset.studioTheme = preset;
    return () => {
      delete document.documentElement.dataset.studioTheme;
    };
  }, [preset]);
  return <>{children}</>;
}
```

- [ ] **Step 11: Write `packages/studio-core/src/theme/tokens.css`**

```css
:root[data-studio-theme='archon-dark'] {
  --studio-bg: #0a0d18;
  --studio-surface: #0e1320;
  --studio-fg: #e2e8f0;
  --studio-muted: #94a3b8;
  --studio-accent: #7c3aed;
  --studio-when: #a855f7;
  --studio-error: #ef4444;
  --studio-warn: #f59e0b;
  --studio-success: #22c55e;
  --node-command: #16a34a;
  --node-prompt: #7c3aed;
  --node-bash: #f59e0b;
  --node-script: #a16207;
  --node-loop: #facc15;
  --node-approval: #fb923c;
  --node-cancel: #ef4444;
  --radius-sm: 4px;
  --radius-md: 6px;
}

:root[data-studio-theme='light'] {
  --studio-bg: #ffffff;
  --studio-surface: #f8fafc;
  --studio-fg: #0f172a;
  --studio-muted: #475569;
  --studio-accent: #6d28d9;
  --studio-when: #9333ea;
  --studio-error: #dc2626;
  --studio-warn: #d97706;
  --studio-success: #16a34a;
  --node-command: #15803d;
  --node-prompt: #6d28d9;
  --node-bash: #d97706;
  --node-script: #92400e;
  --node-loop: #ca8a04;
  --node-approval: #ea580c;
  --node-cancel: #dc2626;
  --radius-sm: 4px;
  --radius-md: 6px;
}

:root[data-studio-theme='high-contrast'] {
  --studio-bg: #000000;
  --studio-surface: #000000;
  --studio-fg: #ffffff;
  --studio-muted: #cccccc;
  --studio-accent: #ffff00;
  --studio-when: #ff00ff;
  --studio-error: #ff0000;
  --studio-warn: #ff8800;
  --studio-success: #00ff00;
  --node-command: #00ff00;
  --node-prompt: #ffff00;
  --node-bash: #ff8800;
  --node-script: #ff8800;
  --node-loop: #ffff00;
  --node-approval: #ff8800;
  --node-cancel: #ff0000;
  --radius-sm: 0px;
  --radius-md: 0px;
}

:root[data-studio-theme='inherit'] {
  /* Defer to host CSS variables — used when embedded in Archon. */
  --studio-bg: var(--background, #0a0d18);
  --studio-surface: var(--card, #0e1320);
  --studio-fg: var(--foreground, #e2e8f0);
  --studio-muted: var(--muted-foreground, #94a3b8);
  --studio-accent: var(--primary, #7c3aed);
  --studio-when: var(--primary, #a855f7);
  --studio-error: var(--destructive, #ef4444);
  --studio-warn: #f59e0b;
  --studio-success: #22c55e;
  --node-command: var(--chart-1, #16a34a);
  --node-prompt: var(--chart-2, #7c3aed);
  --node-bash: var(--chart-3, #f59e0b);
  --node-script: var(--chart-4, #a16207);
  --node-loop: var(--chart-5, #facc15);
  --node-approval: var(--chart-3, #fb923c);
  --node-cancel: var(--destructive, #ef4444);
}
```

- [ ] **Step 12: Add `.gitkeep` to empty folders**

Create empty files at:
- `packages/studio-core/src/components/.gitkeep`
- `packages/studio-core/src/nodes/shared/.gitkeep`
- `packages/studio-core/tests/.gitkeep`

- [ ] **Step 13: Verify TypeScript compiles**

Run: `bun --filter='@archon-studio/core' run build`
Expected: succeeds with zero errors. The schemas stub from Step 3 keeps imports resolving; real types arrive in Task 9.

- [ ] **Step 14: Commit**

```bash
git add packages/studio-core
git commit -m "scaffold(studio-core): package shell, api seam, schemas stub, theme presets, variant placeholders"
```

---

### Task 5: `studio-api-archon` package shell

**Files:**
- Create: `packages/studio-api-archon/package.json`
- Create: `packages/studio-api-archon/tsconfig.json`
- Create: `packages/studio-api-archon/src/index.ts`
- Create: `packages/studio-api-archon/src/ArchonApiClient.ts` (stub implementation)

- [ ] **Step 1: Write `packages/studio-api-archon/package.json`**

```json
{
  "name": "@archon-studio/api-archon",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@archon-studio/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Write `packages/studio-api-archon/tsconfig.json`**

Identical to studio-core's tsconfig (same compilerOptions, `include: ["src/**/*"]`). Use the same JSON.

- [ ] **Step 3: Write `packages/studio-api-archon/src/ArchonApiClient.ts` (stub)**

```ts
import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
} from '@archon-studio/core';
import type { WorkflowDefinition } from '@archon-studio/core';

export interface ArchonApiClientOptions {
  baseUrl: string; // e.g., 'http://localhost:3737'
  fetchFn?: typeof fetch;
  authHeader?: string;
}

/**
 * Phase 9 fills in real implementations. Phase 0 ships throwing stubs so the
 * type-check passes and consumers can wire the client without runtime calls.
 */
export class ArchonApiClient implements WorkflowApiClient {
  constructor(private readonly options: ArchonApiClientOptions) {}

  ping(): Promise<{ ok: true; serverVersion?: string }> {
    throw new Error('ArchonApiClient.ping not yet implemented (Phase 9)');
  }
  listCodebases(): Promise<CodebaseInfo[] | null> {
    throw new Error('ArchonApiClient.listCodebases not yet implemented (Phase 9)');
  }
  listWorkflows(_cwd: string): Promise<WorkflowListItem[]> {
    throw new Error('ArchonApiClient.listWorkflows not yet implemented (Phase 9)');
  }
  listCommands(
    _cwd: string,
  ): Promise<{ name: string; source: 'project' | 'global' | 'bundled' }[]> {
    throw new Error('ArchonApiClient.listCommands not yet implemented (Phase 9)');
  }
  listProviders(): Promise<{ id: string; capabilities: Record<string, boolean> }[]> {
    throw new Error('ArchonApiClient.listProviders not yet implemented (Phase 9)');
  }
  getWorkflow(_name: string, _cwd: string): Promise<WorkflowDefinition> {
    throw new Error('ArchonApiClient.getWorkflow not yet implemented (Phase 9)');
  }
  saveWorkflow(
    _name: string,
    _cwd: string,
    _definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    throw new Error('ArchonApiClient.saveWorkflow not yet implemented (Phase 9)');
  }
  deleteWorkflow(_name: string, _cwd: string): Promise<void> {
    throw new Error('ArchonApiClient.deleteWorkflow not yet implemented (Phase 9)');
  }
  validateWorkflow(_definition: WorkflowDefinition): Promise<ValidateResult> {
    throw new Error('ArchonApiClient.validateWorkflow not yet implemented (Phase 9)');
  }
}
```

- [ ] **Step 4: Write `packages/studio-api-archon/src/index.ts`**

```ts
export { ArchonApiClient, type ArchonApiClientOptions } from './ArchonApiClient';
```

- [ ] **Step 5: Verify it compiles**

Run: `bun --filter='@archon-studio/api-archon' run build`
Expected: succeeds. (Will require resolving the `@archon-studio/core` workspace symlink — `bun install` in Task 1 already did this.)

- [ ] **Step 6: Commit**

```bash
git add packages/studio-api-archon
git commit -m "scaffold(api-archon): default WorkflowApiClient package, throwing stubs"
```

---

### Task 6: `studio-fixtures` package shell

**Files:**
- Create: `packages/studio-fixtures/package.json`
- Create: `packages/studio-fixtures/tsconfig.json`
- Create: `packages/studio-fixtures/src/index.ts`
- Create: `packages/studio-fixtures/src/round-trip-fixtures/.gitkeep`
- Create: `packages/studio-fixtures/src/snippets/starters/.gitkeep`
- Create: `packages/studio-fixtures/src/snippets/patterns/.gitkeep`

- [ ] **Step 1: Write `packages/studio-fixtures/package.json`**

```json
{
  "name": "@archon-studio/fixtures",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./round-trip-fixtures/*": "./src/round-trip-fixtures/*",
    "./snippets/*": "./src/snippets/*"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Write `packages/studio-fixtures/tsconfig.json`**

Identical to studio-core's. Same JSON.

- [ ] **Step 3: Write `packages/studio-fixtures/src/index.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export function loadRoundTripFixture(name: string): string {
  return readFileSync(join(dirname, 'round-trip-fixtures', `${name}.yaml`), 'utf8');
}

export function loadSnippet(category: 'starters' | 'patterns', name: string): string {
  return readFileSync(join(dirname, 'snippets', category, `${name}.yaml`), 'utf8');
}

export const ROUND_TRIP_FIXTURE_NAMES: readonly string[] = [
  // Filled in by scripts/round-trip-fixtures.ts (Task 13). Phase 0 ships ONE.
  'archon-feature-development',
];
```

- [ ] **Step 4: Verify it compiles**

Run: `bun --filter='@archon-studio/fixtures' run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-fixtures
git commit -m "scaffold(fixtures): package shell, loaders, empty fixture/snippet folders"
```

---

### Task 7: `apps/standalone` Vite app

**Files:**
- Create: `apps/standalone/package.json`
- Create: `apps/standalone/tsconfig.json`
- Create: `apps/standalone/vite.config.ts`
- Create: `apps/standalone/index.html`
- Create: `apps/standalone/src/main.tsx`
- Create: `apps/standalone/src/App.tsx`

- [ ] **Step 1: Write `apps/standalone/package.json`**

```json
{
  "name": "@archon-studio/standalone",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "echo 'no unit tests in apps/standalone (Playwright lives in e2e/)' && exit 0"
  },
  "dependencies": {
    "@archon-studio/core": "workspace:*",
    "@archon-studio/api-archon": "workspace:*",
    "@archon-studio/fixtures": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "@xyflow/react": "^12.10.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Write `apps/standalone/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["bun-types", "vite/client"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `apps/standalone/vite.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const archonUrl = env.VITE_ARCHON_URL ?? 'http://localhost:3737';
  return {
    plugins: [react(), tailwind()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: archonUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
```

- [ ] **Step 4: Write `apps/standalone/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Archon Workflow Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `apps/standalone/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@archon-studio/core/theme/tokens.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Write `apps/standalone/src/index.css`**

```css
@import 'tailwindcss';

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: var(--studio-bg);
  color: var(--studio-fg);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 7: Write `apps/standalone/src/App.tsx`**

```tsx
import { ThemeProvider } from '@archon-studio/core';

export function App() {
  return (
    <ThemeProvider preset="archon-dark">
      <div style={{ padding: 24 }}>
        <h1>Archon Workflow Studio</h1>
        <p>Phase 0 scaffolding. Real UI lands in Phase 2.</p>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 8: Run `bun install` to wire the new app workspace**

Run: `bun install`
Expected: workspace symlinks resolved, no errors.

- [ ] **Step 9: Verify the app builds and starts**

Run: `bun --filter='@archon-studio/standalone' run build`
Expected: TypeScript passes; Vite produces `apps/standalone/dist/`.

Run: `bun --filter='@archon-studio/standalone' run dev` (background; Ctrl-C to stop)
Expected: dev server reports `Local: http://localhost:5173/`.

Open `http://localhost:5173/` in a browser.
Expected: dark page with "Archon Workflow Studio" + "Phase 0 scaffolding..." text. The dark background confirms `tokens.css` is loading and the `archon-dark` preset applied.

- [ ] **Step 10: Commit**

```bash
git add apps/standalone bun.lock
git commit -m "scaffold(standalone): vite + react 19 shell, tailwind 4, archon-dark theme working"
```

---

---

## Chunk 2: Phase 0b — Tailwind, schema mirror, CI, round-trip harness, probes, verification

**Goal of this chunk:** Layer the Archon-alignment, safety nets, and CI on top of Chunk 1's scaffold: the Tailwind 4 root config, the Archon-mirrored Zod schemas at the pinned SHA, the schema-drift check, the killer round-trip test harness with its seed fixture, the three GitHub Actions workflows, and the Archon endpoint + YAML-equivalence probes that resolve the spec's §14 verifications. Outcome: a green CI baseline Phase 1 can build feature commits on top of.

**Definition of done for Phase 0b (this chunk):**
- `tailwind.config.ts` exists; standalone app's content globs work.
- `.archon-source-pin` exists with a valid Archon SHA.
- `packages/studio-core/src/schemas/{workflow,dag-node,loop,retry,hooks,index}.ts` mirror Archon's source verbatim (modulo `@hono/zod-openapi → zod` deopaqueification, marked with `// MIRROR-NOTE:`).
- `bun run check-schema-drift` exits 0 against the pinned SHA.
- `bun --filter='@archon-studio/core' run test` passes the round-trip schema-parse test on `archon-feature-development.yaml`. **The full importer→exporter→byte-diff round-trip is intentionally deferred to Phase 1**, where the importer and exporter exist; Phase 0 only proves the schema mirror parses real Archon YAML.
- All three CI workflows (`ci.yml`, `round-trip.yml`, `schema-drift.yml`) pass on the next push.
- `docs/probes/2026-05-08-archon-endpoints.md` documents the endpoint findings (or notes "Archon not running at probe time" with rerun instructions).
- The `phase-0` tag is pushed.

---

### Task 8: Tailwind 4 root config

**Files:**
- Create: `tailwind.config.ts`

- [ ] **Step 1: Write `tailwind.config.ts`**

Tailwind 4's CSS-first config means most theming lives in `@theme` blocks inside `index.css`, but a root `tailwind.config.ts` still helps for content discovery and shared layers. Create:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './apps/*/index.html',
    './apps/*/src/**/*.{ts,tsx}',
    './packages/*/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
```

- [ ] **Step 2: Commit**

```bash
git add tailwind.config.ts
git commit -m "scaffold(tooling): tailwind 4 root config with monorepo content globs"
```

---

### Task 9: Pin Archon source SHA + mirror Zod schemas

**Files:**
- Create: `.archon-source-pin`
- Create: `packages/studio-core/src/schemas/workflow.ts`
- Create: `packages/studio-core/src/schemas/dag-node.ts`
- Create: `packages/studio-core/src/schemas/loop.ts`
- Create: `packages/studio-core/src/schemas/retry.ts`
- Create: `packages/studio-core/src/schemas/hooks.ts`
- Create: `packages/studio-core/src/schemas/index.ts`

The schema mirror copies code verbatim from Archon at the pinned SHA. **Read the Archon source before writing each file** — do not rely on the spec's summary. The drift CI in Task 10 catches divergence, but day-0 must start matched.

- [ ] **Step 1: Confirm the latest Archon `main` SHA**

Use one of these (in order of preference; first that's available):

```bash
# Best: gh CLI (cross-platform, robust)
gh api repos/coleam00/Archon/commits/main --jq .sha

# Fallback: curl + jq (POSIX shell / Git Bash / WSL)
curl -sL https://api.github.com/repos/coleam00/Archon/commits/main | jq -r .sha

# Pure bash if jq is unavailable
curl -sL https://api.github.com/repos/coleam00/Archon/commits/main \
  | grep -E '^\s*"sha":' | head -1 | sed -E 's/.*"sha":\s*"([a-f0-9]+)".*/\1/'
```

> ⚠ **PowerShell users:** the third form's `grep`/`sed` does not exist natively. Use `gh api` (recommended) or run the command from Git Bash / WSL.

Expected output: a 40-char SHA. Record it. (As of this plan's drafting, `fd6d75e76218da8a5804bed5c1548de769c4c658` was current; pin to whatever's latest at execution time.)

- [ ] **Step 2: Write `.archon-source-pin`**

Single line, no trailing newline beyond the standard one:

```
fd6d75e76218da8a5804bed5c1548de769c4c658
```

(Replace with the SHA from Step 1.)

- [ ] **Step 3: Fetch each schema file from Archon at the pinned SHA**

For each file below, fetch via:

```bash
SHA=$(cat .archon-source-pin)
curl -sL "https://raw.githubusercontent.com/coleam00/Archon/${SHA}/packages/workflows/src/schemas/<filename>" \
  > packages/studio-core/src/schemas/<filename>
```

Files to fetch:
- `workflow.ts`
- `dag-node.ts`
- `loop.ts`
- `retry.ts`
- `hooks.ts`

- [ ] **Step 4: Inspect each fetched file for non-portable imports**

Open each fetched file. Likely tweaks needed:
- Imports from `@archon/...` workspace packages → either inline the imported value (if small) or replace with our own equivalent.
- Bun-specific APIs like `Bun.file(...)` should not appear in pure schemas; if any do, they belong somewhere other than `schemas/`.

The expected typical content is *purely* Zod definitions + types. If anything else appears, file an issue — it indicates we're mirroring more than the schema layer.

- [ ] **Step 5: Write `packages/studio-core/src/schemas/index.ts`**

```ts
export * from './workflow';
export * from './dag-node';
export * from './loop';
export * from './retry';
export * from './hooks';

// Convenience type alias
export type { WorkflowDefinition } from './workflow';
```

- [ ] **Step 6: Add Zod as a runtime dep — already done in Task 4, double-check**

Confirm `packages/studio-core/package.json` has `"zod": "^3.25.28"` in `dependencies`. Update if Archon's version differs from `.archon-source-pin`'s SHA.

- [ ] **Step 7: Deopaqueify `@hono/zod-openapi` calls (mandatory clean-up)**

The Zod schemas in Archon are written against `@hono/zod-openapi`, which decorates schemas with OpenAPI metadata that we don't need browser-side. Walk every fetched file and apply these three transformations in this order:

1. **Replace the import.** Change every `import { z } from '@hono/zod-openapi';` to `import { z } from 'zod';`. There may also be additional named imports — keep `z`, drop OpenAPI-only helpers like `extendZodWithOpenApi`, `RouteConfig`, `OpenAPIRegistry`. (If a schema relies on `extendZodWithOpenApi(z)` being called somewhere, the registry-attaching effect is irrelevant for plain Zod.)

2. **Strip `.openapi(...)` chained calls** wherever they appear. These are method calls on Zod schemas adding OpenAPI metadata, e.g. `z.string().openapi({ example: 'foo' })` or multi-line:

   ```ts
   z.object({...}).openapi({
     example: { ... },
     description: '...'
   })
   ```

   Strip the entire `.openapi(...)` call including its argument. Note the argument may itself contain `{}` and may span multiple lines. **Removal must be paren-balanced — if you regex-strip with a non-greedy `.*?`, verify each removal manually**. The drift script in Task 10 uses the same regex, so anything you leave behind here will surface as drift.

3. **Mark the changes** with a single `// MIRROR-NOTE:` *header comment* at the top of each modified file, e.g.:

   ```ts
   // MIRROR-NOTE: Adapted from packages/workflows/src/schemas/<file> at SHA <pin>.
   // Removed: '@hono/zod-openapi' import (replaced with plain 'zod') and all
   // .openapi(...) chained calls. Schema shape is unchanged at the Zod level.
   ```

   The drift script (Task 10, Step 1) strips these lines before diff to avoid false positives. Keep the `MIRROR-NOTE:` prefix exactly. Inline `// MIRROR-NOTE:` comments next to individual changes are also fine — the drift script strips any line beginning with `// MIRROR-NOTE:`.

- [ ] **Step 8: Verify schemas type-check**

Run: `bun --filter='@archon-studio/core' run build`
Expected: zero TypeScript errors.

If errors persist:
- Multi-line `.openapi(...)` block missed: search for the literal string `.openapi(` across the schemas folder; every occurrence must have been stripped.
- Workspace-relative imports (`@archon/...`) still in the files: replace with our local equivalent or inline the small imports. None are expected — flag if seen.

- [ ] **Step 9: Commit**

```bash
git add .archon-source-pin packages/studio-core/src/schemas
git commit -m "scaffold(schemas): mirror Archon Zod schemas at pinned SHA + MIRROR-NOTE drift markers"
```

---

---

### Task 10: Schema-drift CI script

**Files:**
- Create: `scripts/check-schema-drift.ts`

- [ ] **Step 1: Write `scripts/check-schema-drift.ts`**

```ts
#!/usr/bin/env bun
/**
 * Compare our mirrored schemas at packages/studio-core/src/schemas/ against
 * Archon's source files at the SHA in .archon-source-pin.
 *
 * Strips MIRROR-NOTE blocks and OpenAPI .openapi() chained calls before diff
 * to avoid false positives from intentional adaptations.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PIN = readFileSync(join(ROOT, '.archon-source-pin'), 'utf8').trim();
const FILES = ['workflow.ts', 'dag-node.ts', 'loop.ts', 'retry.ts', 'hooks.ts'];

function strip(s: string): string {
  return (
    s
      // Remove MIRROR-NOTE lines (header or inline)
      .replace(/\/\/ MIRROR-NOTE:[^\n]*\n/g, '')
      // Remove .openapi(...) calls — multiline-friendly via [\s\S].
      // CONSTRAINT: this regex assumes .openapi() arguments contain no
      // un-escaped closing parens. Any Archon code that passes a literal
      // `)` inside an .openapi() string/template will break this strip
      // and surface as phantom drift; fix by escaping that input upstream
      // OR by replacing this regex with a tiny paren-balance walker.
      .replace(/\.openapi\([\s\S]*?\)/g, '')
      // Normalise import paths
      .replace(/from\s+['"][^'"]*['"]/g, "from 'IMPORT'")
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

let drift = false;

for (const file of FILES) {
  const ours = strip(
    readFileSync(join(ROOT, 'packages/studio-core/src/schemas', file), 'utf8'),
  );
  const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/packages/workflows/src/schemas/${file}`;
  const upstream = strip(await (await fetch(url)).text());
  if (ours !== upstream) {
    console.error(`✗ DRIFT: packages/studio-core/src/schemas/${file}`);
    drift = true;
  } else {
    console.log(`✓ ${file}`);
  }
}

if (drift) {
  console.error('\nSchema drift detected. Either update the mirror to match Archon at the pinned SHA, or move the SHA forward and review the implications.');
  process.exit(1);
}
console.log(`\nAll ${FILES.length} schema files match Archon @ ${PIN.slice(0, 8)}.`);
```

- [ ] **Step 2: Run the drift check locally**

Run: `bun run check-schema-drift`
Expected: all 5 files match — exits 0. If any file diffs, fix the mirror until it matches (or annotate intentional deviations with `// MIRROR-NOTE:` comments before the diverging line).

- [ ] **Step 3: Commit**

```bash
git add scripts/check-schema-drift.ts
git commit -m "scaffold(ci): schema-drift check vs Archon at pinned SHA"
```

---

### Task 11: Killer round-trip test harness (one fixture)

**Files:**
- Create: `scripts/round-trip-fixtures.ts`
- Create: `packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml` (vendored)
- Create: `packages/studio-core/tests/round-trip.spec.ts` (test that always passes for the seed fixture)

This task delivers the *harness*, not the full sweep. Phase 1 broadens to all bundled defaults.

- [ ] **Step 1: Write `scripts/round-trip-fixtures.ts`**

```ts
#!/usr/bin/env bun
/**
 * Fetch Archon's bundled-default + smoke YAML files at the pinned SHA into
 * packages/studio-fixtures/src/round-trip-fixtures/.
 *
 * Phase 0 vendors ONE fixture as the seed. Phase 1 expands the FIXTURE_LIST
 * to include every file in `.archon/workflows/defaults/` plus the all-nodes
 * smoke test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PIN = readFileSync(join(ROOT, '.archon-source-pin'), 'utf8').trim();
const OUT = join(ROOT, 'packages/studio-fixtures/src/round-trip-fixtures');

// Phase 0: just the seed. Phase 1 adds the rest.
const FIXTURE_LIST: { archonPath: string; localName: string }[] = [
  {
    archonPath: '.archon/workflows/defaults/archon-feature-development.yaml',
    localName: 'archon-feature-development.yaml',
  },
];

for (const f of FIXTURE_LIST) {
  const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/${f.archonPath}`;
  const yaml = await (await fetch(url)).text();
  writeFileSync(join(OUT, f.localName), yaml, 'utf8');
  console.log(`✓ ${f.localName} (${yaml.length} bytes)`);
}

console.log(`\nWrote ${FIXTURE_LIST.length} fixture(s) at SHA ${PIN.slice(0, 8)}.`);
```

Add to root `package.json` scripts:

```json
"fetch-fixtures": "bun run scripts/round-trip-fixtures.ts"
```

- [ ] **Step 2: Fetch the seed fixture**

Run: `bun run fetch-fixtures`
Expected: writes `packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml`.

- [ ] **Step 3: Write the failing round-trip test**

Create `packages/studio-core/tests/round-trip.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { workflowDefinitionSchema } from '../src/schemas';

const FIXTURE_DIR = join(
  import.meta.dir,
  '../../studio-fixtures/src/round-trip-fixtures',
);

const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.yaml'));

describe('round-trip: every Archon bundled default', () => {
  it('has at least one fixture vendored', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
  });

  for (const fixture of fixtures) {
    it(`${fixture} parses against our mirrored schema`, async () => {
      const yamlText = readFileSync(join(FIXTURE_DIR, fixture), 'utf8');

      // Phase 0 doesn't have an importer/exporter yet — just verify the YAML
      // parses to JSON and the JSON satisfies workflowDefinitionSchema.
      // Phase 1 replaces this body with: parse → import → export → diff.
      const yaml = await import('yaml');
      const json = yaml.parse(yamlText);
      const result = workflowDefinitionSchema.safeParse(json);
      if (!result.success) {
        console.error(`Schema parse failed for ${fixture}:`);
        console.error(JSON.stringify(result.error.format(), null, 2));
      }
      expect(result.success).toBe(true);
    });
  }
});
```

- [ ] **Step 4: Add `yaml` to studio-core's deps**

Pin `yaml` to an exact version (no caret) — byte-equivalence assertions in the round-trip test are sensitive to minor-release serialization changes. In `packages/studio-core/package.json`, add to `dependencies`:

```json
"yaml": "2.5.1"
```

Run: `bun install`

If `2.5.1` is no longer the latest at execution time, prefer the latest stable `2.x.x` exact pin; record the chosen version in a comment in the package.json or a one-line note at the top of `tests/round-trip.spec.ts`.

- [ ] **Step 5: Run the test**

Run: `bun --filter='@archon-studio/core' run test`
Expected:
- "has at least one fixture vendored": PASS
- "archon-feature-development.yaml parses against our mirrored schema": PASS

If the schema parse fails, our mirror has issues — debug the printed Zod error against the actual YAML structure. Common causes: a Zod `.openapi()` we removed had a non-trivial side effect; an import we broke during the mirror.

- [ ] **Step 6: Commit**

```bash
git add scripts/round-trip-fixtures.ts \
        packages/studio-fixtures/src/round-trip-fixtures \
        packages/studio-core/tests/round-trip.spec.ts \
        packages/studio-core/package.json \
        package.json \
        bun.lock
git commit -m "test(round-trip): killer-test harness with seed fixture passing schema parse"
```

---

### Task 12: CI workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/round-trip.yml`
- Create: `.github/workflows/schema-drift.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build-test-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.0
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run format:check
      - run: bun --filter='*' run build
      - run: bun --filter='*' run test
```

- [ ] **Step 2: Write `.github/workflows/round-trip.yml`**

```yaml
name: round-trip
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
jobs:
  round-trip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.0
      - run: bun install --frozen-lockfile
      - name: Re-fetch fixtures from pinned SHA
        run: bun run fetch-fixtures
      - name: Verify fixtures match committed (catches stale vendoring)
        run: git diff --exit-code packages/studio-fixtures/src/round-trip-fixtures
      - name: Run round-trip suite
        # Bun's test filter is positional (no `--` separator). This runs only
        # tests in files matching "round-trip" within studio-core.
        run: bun test --filter='@archon-studio/core' round-trip
```

- [ ] **Step 3: Write `.github/workflows/schema-drift.yml`**

```yaml
name: schema-drift
on:
  schedule:
    - cron: '0 6 * * *' # daily 06:00 UTC
  workflow_dispatch:
  pull_request:
    paths:
      - 'packages/studio-core/src/schemas/**'
      - '.archon-source-pin'
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.0
      - run: bun install --frozen-lockfile
      - run: bun run check-schema-drift
```

- [ ] **Step 4: Verify the YAML parses (locally smoke-test)**

Run: `bunx js-yaml .github/workflows/ci.yml` (if `js-yaml` not on PATH, skip — GitHub will validate on push).

- [ ] **Step 5: Commit**

```bash
git add .github
git commit -m "ci: build/test/lint + round-trip + schema-drift workflows"
```

---

### Task 13: Endpoint probe script + documented findings

**Files:**
- Create: `scripts/probe-archon-endpoints.ts`
- Create: `scripts/yaml-equivalence.ts`
- Create: `docs/probes/2026-05-08-archon-endpoints.md`

These resolve the §14 verifications from the spec. The probe script is reusable; the markdown captures findings for the planner.

- [ ] **Step 1: Write `scripts/probe-archon-endpoints.ts`**

```ts
#!/usr/bin/env bun
/**
 * Probe a running Archon to resolve the open verifications from the spec
 * (§14). Pass --url to target a non-default Archon.
 *
 * Outputs Markdown findings to stdout; redirect to docs/probes/<date>.md
 * to capture.
 */
const argv = Bun.argv.slice(2);
let url = 'http://localhost:3737';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url' && argv[i + 1]) url = argv[++i];
}

interface ProbeResult {
  endpoint: string;
  ok: boolean;
  status: number;
  notes: string;
}

async function probe(path: string, opts: RequestInit = {}): Promise<ProbeResult> {
  try {
    const res = await fetch(`${url}${path}`, opts);
    const text = await res.text();
    return {
      endpoint: path,
      ok: res.ok,
      status: res.status,
      notes: text.slice(0, 200),
    };
  } catch (err) {
    return {
      endpoint: path,
      ok: false,
      status: 0,
      notes: `fetch failed: ${String(err)}`,
    };
  }
}

const results: ProbeResult[] = [];
results.push(await probe('/api/openapi.json'));
results.push(await probe('/api/codebases'));
results.push(await probe('/api/workflows'));
results.push(await probe('/api/commands'));

console.log(`# Archon endpoint probe — ${new Date().toISOString()}\n`);
console.log(`Target: \`${url}\`\n`);
console.log(`| Endpoint | OK | Status | Notes |\n|---|---|---|---|`);
for (const r of results) {
  console.log(
    `| \`${r.endpoint}\` | ${r.ok ? '✓' : '✗'} | ${r.status} | ${r.notes.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 80)} |`,
  );
}

console.log('\n## CORS check (Origin: http://localhost:5173)\n');
const cors = await probe('/api/openapi.json', {
  headers: { Origin: 'http://localhost:5173' },
});
console.log(`Status: ${cors.status}. Manual follow-up: inspect \`Access-Control-Allow-Origin\` response header in browser devtools.\n`);

console.log('## Auth check\n');
console.log('No request was sent with credentials. If any of the above returned 401/403, Archon expects auth.\n');
```

- [ ] **Step 2: Write `scripts/yaml-equivalence.ts`**

```ts
#!/usr/bin/env bun
/**
 * Compare Bun.YAML.stringify and the `yaml` npm package output for a
 * representative workflow definition. Documents normalisation differences.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yamlPkg from 'yaml';

const ROOT = join(import.meta.dir, '..');
const FIXTURE = join(
  ROOT,
  'packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml',
);
const yamlText = readFileSync(FIXTURE, 'utf8');

const json = yamlPkg.parse(yamlText);

const bunOut = Bun.YAML.stringify(json);
const pkgOut = yamlPkg.stringify(json);

console.log('# YAML equivalence probe\n');
console.log(`Source: \`packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml\`\n`);
console.log('## bun-out chars / pkg-out chars\n');
console.log(`Bun.YAML.stringify: ${bunOut.length} bytes`);
console.log(`yaml package:       ${pkgOut.length} bytes\n`);

if (bunOut === pkgOut) {
  console.log('## Result: byte-equivalent ✓\n');
} else {
  console.log('## Result: NOT byte-equivalent — diff below\n');
  console.log('### Bun output\n```yaml\n' + bunOut + '\n```\n');
  console.log('### yaml-package output\n```yaml\n' + pkgOut + '\n```');
}
```

- [ ] **Step 3: Run probes against the user's running Archon**

Run: `bun run probe-archon`
If Archon is running on `localhost:3737`: writes findings to stdout. Capture by redirecting:

```bash
bun run probe-archon > docs/probes/2026-05-08-archon-endpoints.md
```

If Archon is NOT running: skip the redirect; create the file by hand documenting "Archon was not running at probe time; rerun with `bun run probe-archon > docs/probes/<today>-archon-endpoints.md` once available."

Run: `bun run scripts/yaml-equivalence.ts`
Capture output:

```bash
bun run scripts/yaml-equivalence.ts >> docs/probes/2026-05-08-archon-endpoints.md
```

- [ ] **Step 4: Add `probe` script to root `package.json`**

In root `package.json` scripts, ensure these entries:

```json
"probe-archon": "bun run scripts/probe-archon-endpoints.ts",
"probe-yaml-equivalence": "bun run scripts/yaml-equivalence.ts"
```

- [ ] **Step 5: Branch on probe findings + capture as gating sign-off**

Update `docs/probes/2026-05-08-archon-endpoints.md` with branch-specific notes based on what each endpoint returned:

| `/api/codebases` returned | Note to record | Phase 9 implication |
|---|---|---|
| `200` with a JSON array | "Codebase listing endpoint exists." | Implement dropdown picker as the primary cwd UX. |
| `404` | "Codebase listing endpoint not exposed." | Manual-cwd field is the primary UX; dropdown deferred to v1.5 upstream contribution. |
| `401` or `403` | "Archon localhost requires auth." | Phase 9 settings UI must collect a token (e.g., bearer header), and the connect screen must surface auth-required state distinctly from "wrong URL." |
| `5xx` or fetch failed | "Server reachable but errored — re-probe under healthier conditions." | Defer interpretation; re-run probe later. |
| (Archon not running) | "Probe deferred — re-run with `bun run probe-archon` once Archon is reachable." | None; this doesn't block Phase 0. |

The same branching applies to any other endpoint that returned 401/403 — Archon may have a single auth posture covering all routes. Note the broadest auth signal at the top of the markdown.

**Gate:** Phase 0 closes regardless of the result of this step (the round-trip test is independent of the probe), but Phase 9 cannot start until this file has a positive answer for at least the codebase + auth questions.

- [ ] **Step 6: Commit**

```bash
git add scripts/probe-archon-endpoints.ts scripts/yaml-equivalence.ts \
        docs/probes/2026-05-08-archon-endpoints.md \
        package.json
git commit -m "scaffold(probes): endpoint + YAML-equivalence probes; capture findings"
```

---

### Task 14: README quickstart

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the README**

Open `README.md`. Currently it says "Empty repository — initial commit only. No code yet." Replace with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): quickstart, repo layout, status"
```

---

### Task 15: Phase 0 verification — green CI baseline

**Files:** none (verification only)

- [ ] **Step 1: Run the full local CI sequence**

Run each in order; each must pass:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run check-schema-drift
bun --filter='*' run build
bun --filter='*' run test
```

If any step fails, fix before continuing — do not paper over with skips or `|| true`.

- [ ] **Step 2: Push and verify GitHub Actions**

```bash
git push
```

Watch the Actions tab. All three workflows should be green (`schema-drift` only triggers on this push because schemas changed; `round-trip` and `ci` should run).

- [ ] **Step 3: Tag Phase 0 complete**

```bash
git tag -a phase-0 -m "Phase 0: scaffolding complete; CI green; one round-trip fixture passing schema parse"
git push origin phase-0
```

- [ ] **Step 4: Update task list (workflow tooling)**

If using the agent-execution path, mark all Phase 0 tasks complete and surface readiness to dispatch Phase 1.

---

## Phase 0 deliverables checklist

- [ ] Bun workspaces root with `package.json`, `bun.lock`, ESLint, Prettier, husky pre-commit (Tasks 1–3, 8)
- [ ] `studio-core` package shell with empty public surface, schema mirror, `WorkflowApiClient` interface, Zustand skeleton, ThemeProvider + 4 theme presets (Tasks 4, 9)
- [ ] `studio-api-archon` package with throwing-stub `ArchonApiClient` (Task 5)
- [ ] `studio-fixtures` package with one vendored Archon bundled-default (Tasks 6, 11)
- [ ] `apps/standalone` Vite app rendering "Phase 0" placeholder with archon-dark theme + `/api/*` dev proxy (Task 7)
- [ ] `.archon-source-pin` recording the pinned SHA (Task 9)
- [ ] Schema-drift CI script + workflow (Tasks 10, 12)
- [ ] Killer round-trip test harness passing schema-parse on the seed fixture (Task 11)
- [ ] CI workflows: build/test/lint, round-trip, schema-drift (Task 12)
- [ ] Endpoint probe + YAML-equivalence probe scripts; findings captured (Task 13)
- [ ] README quickstart (Task 14)
- [ ] All local + remote CI green; `phase-0` tag pushed (Task 15)

**Phase 1 begins** with the registry contract, the seven variant `fromDag`/`toDag` pure functions, importer + exporter, and broadening the round-trip test to all bundled defaults + the all-nodes smoke fixture. Chunk 3 (below) details it in full.

---

---

## Chunk 3: Phase 1 — Core data model, registry, importer/exporter, full round-trip

**Goal of this chunk:** Land the data layer: the `VariantDefinition` contract, per-variant pure data modules for all 7 variants (data shape + capabilities + library metadata + `fromDag` + `toDag`), the `_unknown` capture machinery, the Zustand store with workflow-JSON-as-truth and cascading rename, and the pure `fromWorkflowDefinition` / `toWorkflowDefinition` functions. The killer round-trip test is upgraded from schema-parse-only (Phase 0) to full importer→exporter→deep-equal across **every** Archon bundled default + the all-nodes smoke fixture. After Phase 1, no UI yet, but the entire data spine is verified end-to-end against real Archon workflows.

**Definition of done for Phase 1:**

- All YAML files in Archon's `.archon/workflows/defaults/` (at the pinned SHA) plus `test-workflows/e2e-pi-all-nodes-smoke.yaml` are vendored under `packages/studio-fixtures/src/round-trip-fixtures/`. `ROUND_TRIP_FIXTURE_NAMES` lists them all.
- `packages/studio-core/src/nodes/shared/{detectVariant,pickBaseFields}.ts` exist as pure functions with full unit-test coverage.
- `packages/studio-core/src/nodes/registry.ts` exports the typed `VariantDefinition<TData>` contract, a `VariantRegistry` that maps `VariantId → VariantDefinition`, and a default registry pre-populated with all 7 variants.
- Each of `packages/studio-core/src/nodes/{command,prompt,bash,script,loop,approval,cancel}/` has `data.ts`, `fromDag.ts`, `toDag.ts`, `index.ts` (composing the `VariantDefinition`), and per-variant unit tests. Renderer/Inspector remain absent (Phases 3/4).
- `packages/studio-core/src/exporter/{fromWorkflowDefinition,toWorkflowDefinition}.ts` exist as pure functions; both are unit-tested.
- `packages/studio-core/src/store/builder-store.ts` is a real Zustand store: `loadWorkflow`, `clearWorkflow`, workflow-base setters, `addNode`, `updateNode`, `deleteNodes`, `connect`, `disconnect`, `renameNode`. The cascade covers `depends_on` + `when:` strings; **`$nodeId.output` body-reference cascade is deferred to Phase 4** alongside the inspector autocomplete (no Phase 1 UI calls `renameNode`, so the gap is dead-code-only). Position/canvas state is intentionally absent — Phase 2 adds it.
- The killer round-trip test (`tests/round-trip.spec.ts`) does **parse → import → export → re-parse → deep-equal** for every fixture and is green.
- `bun --filter='*' run build`, `bun --filter='*' run test`, and `bun run check-schema-drift` are all green locally and on CI.
- `phase-1` annotated tag is pushed.

**Reference skills if you get stuck:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`.

**Big-picture data flow (the spine this chunk delivers):**

```
YAML on disk ──parse──▶ raw JSON ──┐
                                   ├─ workflowDefinitionSchema.safeParse → validates
                                   │                                       (server is
                                   │                                        canonical;
                                   │                                        client uses
                                   │                                        for guard)
                                   │
                                   └─ fromWorkflowDefinition(raw) ────────▶ store {workflow, nodes, edges}
                                                                                       │
                                            ┌──────────── per-node ─────────────┐      │
                                            │ detectVariant(rawNode) → VariantId│      │
                                            │ pickBaseFields(rawNode, variantId)│      │
                                            │   ↓ {base, variantSpecific,       │      │
                                            │      unknown}                     │      │
                                            │ variant.fromDag(...) → TData      │      │
                                            └───────────────────────────────────┘      │
                                                                                       ▼
                                                                              user edits via store actions
                                                                                       │
                                                                                       ▼
                                                          toWorkflowDefinition(store) → raw JSON
                                                                                       │
                                                                       workflowDefinitionSchema.parse(reExported)
                                                                                       │
                                                                                       ▼
                                                                              re-emit YAML (Phase 7)
```

**The `_unknown` rule:** at every level (workflow base + node base + per-variant), keys our schema doesn't recognise are captured into a `_unknown` bag and spread back on export. This is the forward-compat guarantee. The killer round-trip test fails immediately if any byte of the source is silently dropped.

---

### Task 16: Vendor every Archon bundled default + smoke fixture

**Files:**
- Modify: `scripts/round-trip-fixtures.ts` (extend `FIXTURE_LIST`)
- Modify: `packages/studio-fixtures/src/index.ts` (extend `ROUND_TRIP_FIXTURE_NAMES`)
- Add: `packages/studio-fixtures/src/round-trip-fixtures/*.yaml` (the new vendored files)

- [ ] **Step 1: Discover the canonical fixture list at the pinned SHA**

Run:
```bash
SHA=$(cat .archon-source-pin)
gh api repos/coleam00/Archon/contents/.archon/workflows/defaults?ref=$SHA --jq '.[].name'
gh api repos/coleam00/Archon/contents/test-workflows?ref=$SHA --jq '.[].name'
```

Expected: a list of `*.yaml` filenames under `defaults/`, plus the smoke file under `test-workflows/`. Record the smoke file's exact path — it has historically been `test-workflows/e2e-pi-all-nodes-smoke.yaml`, but verify against the directory listing in case the path has moved.

If `gh` is unavailable, fall back to `curl -sL https://api.github.com/repos/coleam00/Archon/contents/.archon/workflows/defaults?ref=$SHA | jq -r '.[].name'`.

- [ ] **Step 2: Update `scripts/round-trip-fixtures.ts`'s `FIXTURE_LIST`**

Replace the Phase 0 single-entry array with one entry per file from Step 1. Use the `archonPath` for the upstream location (e.g., `.archon/workflows/defaults/archon-fix-github-issue.yaml`), and `localName` for our flat layout (`archon-fix-github-issue.yaml`). For the smoke fixture, prefix `localName` with `_smoke-` to keep it visually grouped at the top of the directory listing — the test discovers via `readdirSync` so the prefix is harmless.

- [ ] **Step 3: Run the fetcher**

Run: `bun run fetch-fixtures`
Expected: each fixture written with non-zero size, success count printed.

- [ ] **Step 4: Update `packages/studio-fixtures/src/index.ts`'s `ROUND_TRIP_FIXTURE_NAMES`**

Replace the single-entry array with the full list (without the `.yaml` extension). Keep alphabetical order; smoke fixture first via the `_smoke-` prefix.

- [ ] **Step 5: Run the existing round-trip test (still schema-parse-only)**

Run: `bun --filter='@archon-studio/core' run test`
Expected: every new fixture passes the existing `workflowDefinitionSchema.safeParse` body. If any fail, the printed Zod error tells you which schema field is stricter than the YAML — debug against the mirrored schemas, not by relaxing the test. Likely cause: a `.openapi()` strip in Phase 0 Task 9 had a side effect (e.g., a `.default(...)` was attached via `.openapi(...)` and lost). If that happens, fix the mirror and re-run drift to confirm intentional.

- [ ] **Step 6: Commit**

```bash
git add scripts/round-trip-fixtures.ts \
        packages/studio-fixtures/src/round-trip-fixtures \
        packages/studio-fixtures/src/index.ts
git commit -m "test(round-trip): vendor every bundled default + smoke fixture"
```

---

### Task 17: `detectVariant` pure function

**Files:**
- Create: `packages/studio-core/src/nodes/shared/detectVariant.ts`
- Create: `packages/studio-core/tests/nodes/detectVariant.spec.ts`

`detectVariant` mirrors Archon's mutual-exclusivity check from `dagNodeSchema.superRefine` — it returns the variant id when exactly one variant key is present, or a discriminated error otherwise. It does *not* validate the node's body; that's the schema's job. It's the single source of truth our importer uses to dispatch into the per-variant `fromDag`.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/nodes/detectVariant.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { detectVariant } from '../../src/nodes/shared/detectVariant';

describe('detectVariant', () => {
  it.each([
    ['command', { id: 'a', command: 'foo' }],
    ['prompt', { id: 'a', prompt: 'do it' }],
    ['bash', { id: 'a', bash: 'echo hi' }],
    ['script', { id: 'a', script: 'console.log(1)', runtime: 'bun' }],
    ['loop', { id: 'a', loop: { prompt: 'p', until: 'DONE', max_iterations: 1 } }],
    ['approval', { id: 'a', approval: { message: 'ok?' } }],
    ['cancel', { id: 'a', cancel: 'abort' }],
  ])('detects %s', (expected, raw) => {
    expect(detectVariant(raw)).toEqual({ ok: true, variant: expected });
  });

  it('reports zero-variant nodes', () => {
    expect(detectVariant({ id: 'a' })).toEqual({ ok: false, reason: 'no-variant-key' });
  });

  it('reports multi-variant nodes', () => {
    expect(detectVariant({ id: 'a', command: 'foo', prompt: 'bar' })).toEqual({
      ok: false,
      reason: 'multiple-variant-keys',
      keysPresent: ['command', 'prompt'],
    });
  });

  it('treats empty-string command/prompt/bash/script/cancel as absent (matches Archon)', () => {
    expect(detectVariant({ id: 'a', command: '', prompt: 'real' })).toEqual({
      ok: true, variant: 'prompt',
    });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail with module-not-found**

Run: `bun --filter='@archon-studio/core' run test detectVariant`
Expected: tests fail because `detectVariant.ts` doesn't exist yet.

- [ ] **Step 3: Implement `detectVariant`**

Create `packages/studio-core/src/nodes/shared/detectVariant.ts`:

```ts
import type { VariantId } from '../registry';

export type DetectResult =
  | { ok: true; variant: VariantId }
  | { ok: false; reason: 'no-variant-key' | 'multiple-variant-keys'; keysPresent?: string[] };

const VARIANT_KEYS: ReadonlyArray<{ key: string; variant: VariantId }> = [
  { key: 'command', variant: 'command' },
  { key: 'prompt', variant: 'prompt' },
  { key: 'bash', variant: 'bash' },
  { key: 'script', variant: 'script' },
  { key: 'loop', variant: 'loop' },
  { key: 'approval', variant: 'approval' },
  { key: 'cancel', variant: 'cancel' },
];

/** Returns true when the value behaves as "the variant key is present and has content" — matching Archon's superRefine. */
function isPresent(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (key === 'loop' || key === 'approval') return typeof value === 'object';
  // command/prompt/bash/script/cancel are string-typed; empty strings don't count.
  return typeof value === 'string' && value.trim().length > 0;
}

export function detectVariant(raw: Record<string, unknown>): DetectResult {
  const present = VARIANT_KEYS.filter(({ key }) => isPresent(key, raw[key]));
  if (present.length === 0) return { ok: false, reason: 'no-variant-key' };
  if (present.length > 1) {
    return {
      ok: false,
      reason: 'multiple-variant-keys',
      keysPresent: present.map((p) => p.key),
    };
  }
  return { ok: true, variant: present[0]!.variant };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

Run: `bun --filter='@archon-studio/core' run test detectVariant`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/nodes/shared/detectVariant.ts \
        packages/studio-core/tests/nodes/detectVariant.spec.ts
git commit -m "feat(nodes): detectVariant pure function for variant-key dispatch"
```

---

### Task 18: `pickBaseFields` + `_unknown` capture

**Files:**
- Create: `packages/studio-core/src/nodes/shared/pickBaseFields.ts`
- Create: `packages/studio-core/src/nodes/shared/baseFieldKeys.ts`
- Create: `packages/studio-core/tests/nodes/pickBaseFields.spec.ts`

This is where the `_unknown` rule (spec §6.3) is realised at the node level. Given a raw DagNode object and its detected variant, partition the keys into three buckets:
- `base` — the typed keys recognised by `dagNodeBaseSchema` (id, depends_on, when, trigger_rule, idle_timeout, retry, model, provider, context, output_format, allowed_tools, denied_tools, hooks, mcp, skills, agents, effort, thinking, maxBudgetUsd, systemPrompt, fallbackModel, betas, sandbox).
- `variantSpecific` — the keys that are exclusive to this variant (e.g., for `bash`: `bash`, `timeout`; for `script`: `script`, `runtime`, `deps`, `timeout`).
- `unknown` — every remaining key (the forward-compat residue).

The function does not validate values — it only partitions keys.

- [ ] **Step 1: Define `BASE_FIELD_KEYS` + `VARIANT_SPECIFIC_KEYS` in a separate module**

Create `packages/studio-core/src/nodes/shared/baseFieldKeys.ts`:

```ts
import type { VariantId } from '../registry';

/**
 * Keys recognised by `dagNodeBaseSchema` (mirrored from Archon at the pinned SHA).
 * If the upstream base schema gains a field, the schema-drift CI fails; update this list to match.
 */
export const BASE_FIELD_KEYS: readonly string[] = [
  'id',
  'depends_on',
  'when',
  'trigger_rule',
  'idle_timeout',
  'retry',
  'model',
  'provider',
  'context',
  'output_format',
  'allowed_tools',
  'denied_tools',
  'hooks',
  'mcp',
  'skills',
  'agents',
  'effort',
  'thinking',
  'maxBudgetUsd',
  'systemPrompt',
  'fallbackModel',
  'betas',
  'sandbox',
];

/**
 * Keys that are exclusive to a single variant (the variant key itself plus any keys
 * that only appear when that variant is selected). Mirrors the per-variant `extend(...)`
 * blocks in dag-node.ts.
 */
export const VARIANT_SPECIFIC_KEYS: Readonly<Record<VariantId, readonly string[]>> = {
  command: ['command'],
  prompt: ['prompt'],
  bash: ['bash', 'timeout'],
  script: ['script', 'runtime', 'deps', 'timeout'],
  loop: ['loop'],
  approval: ['approval'],
  cancel: ['cancel'],
};
```

- [ ] **Step 2: Write the failing tests**

Create `packages/studio-core/tests/nodes/pickBaseFields.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { pickBaseFields } from '../../src/nodes/shared/pickBaseFields';

describe('pickBaseFields', () => {
  it('partitions a bash node into base + variant-specific + unknown', () => {
    const raw = {
      id: 'do-thing',
      depends_on: ['parent'],
      bash: 'echo hi',
      timeout: 5000,
      __experimental_flag: true,        // unknown
      future_field: { nested: 1 },      // unknown
    };
    expect(pickBaseFields(raw, 'bash')).toEqual({
      base: { id: 'do-thing', depends_on: ['parent'] },
      variantSpecific: { bash: 'echo hi', timeout: 5000 },
      unknown: { __experimental_flag: true, future_field: { nested: 1 } },
    });
  });

  it('partitions a command node with full AI fields', () => {
    const raw = {
      id: 'classify',
      command: 'classify',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      output_format: { schema: { type: 'object' } },
      ai_v2_brand_new: 'placeholder',
    };
    const result = pickBaseFields(raw, 'command');
    expect(result.base).toEqual({
      id: 'classify',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      output_format: { schema: { type: 'object' } },
    });
    expect(result.variantSpecific).toEqual({ command: 'classify' });
    expect(result.unknown).toEqual({ ai_v2_brand_new: 'placeholder' });
  });

  it('preserves nested foreign keys inside known objects in the unknown bag (top-level only here)', () => {
    // pickBaseFields partitions only the top level. Nested-object preservation
    // is handled by per-variant fromDag/toDag (§6.3 deep-merge contract).
    const raw = { id: 'a', loop: { prompt: 'p', until: 'X', max_iterations: 1, future_knob: 7 } };
    const result = pickBaseFields(raw, 'loop');
    expect(result.unknown).toEqual({});
    expect(result.variantSpecific).toEqual({
      loop: { prompt: 'p', until: 'X', max_iterations: 1, future_knob: 7 },
    });
  });
});
```

- [ ] **Step 3: Run tests — confirm they fail with module-not-found**

Run: `bun --filter='@archon-studio/core' run test pickBaseFields`
Expected: tests fail.

- [ ] **Step 4: Implement `pickBaseFields`**

Create `packages/studio-core/src/nodes/shared/pickBaseFields.ts`:

```ts
import type { VariantId } from '../registry';
import { BASE_FIELD_KEYS, VARIANT_SPECIFIC_KEYS } from './baseFieldKeys';

export interface PickedNodeFields {
  base: Record<string, unknown>;
  variantSpecific: Record<string, unknown>;
  unknown: Record<string, unknown>;
}

export function pickBaseFields(raw: Record<string, unknown>, variant: VariantId): PickedNodeFields {
  const baseSet = new Set(BASE_FIELD_KEYS);
  const variantSet = new Set(VARIANT_SPECIFIC_KEYS[variant]);

  const result: PickedNodeFields = { base: {}, variantSpecific: {}, unknown: {} };

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (variantSet.has(key)) {
      result.variantSpecific[key] = value;
    } else if (baseSet.has(key)) {
      result.base[key] = value;
    } else {
      result.unknown[key] = value;
    }
  }
  return result;
}
```

- [ ] **Step 5: Run tests — confirm they pass**

Run: `bun --filter='@archon-studio/core' run test pickBaseFields`
Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/nodes/shared/baseFieldKeys.ts \
        packages/studio-core/src/nodes/shared/pickBaseFields.ts \
        packages/studio-core/tests/nodes/pickBaseFields.spec.ts
git commit -m "feat(nodes): pickBaseFields partitions raw DagNode for _unknown forward-compat"
```

---

### Task 19: `VariantDefinition` contract + central registry

**Files:**
- Modify: `packages/studio-core/src/nodes/registry.ts` (replace Phase 0 skeleton — types + helper only)
- Create: `packages/studio-core/src/nodes/default-registry.ts` (static imports + pre-wired registry; landed here in Task 19, populated by Tasks 20–26)
- Create: `packages/studio-core/src/nodes/shared/types.ts`
- Create: `packages/studio-core/tests/nodes/registry.spec.ts`

Define the data-only slice of `VariantDefinition` that Phase 1 ships. Phase 3 augments with `Renderer`, Phase 4 with `Inspector`. Until then, both fields are typed as optional (`?`) and per-variant index modules omit them.

**Module split:** `registry.ts` is contract-only (types, `VARIANT_IDS`, `buildRegistry`). `default-registry.ts` does the seven static `import`s, calls `buildRegistry({...})`, and exports `defaultRegistry` + `getVariant(id)`. Static imports keep Vite/Rollup happy and avoid CJS `require()`. Per-variant modules import only the **types** from `registry.ts`, which TypeScript erases at emit — no runtime cycle.

- [ ] **Step 1: Define shared types**

Create `packages/studio-core/src/nodes/shared/types.ts`:

```ts
import type { z } from 'zod';
import type { VariantId } from '../registry';
import type { DagNode } from '../../schemas';

/**
 * Variant capabilities — drive Inspector tab visibility (Phase 4) and validator
 * behaviour. Mirrors the runtime semantics of dag-executor.ts at the pinned SHA.
 */
export interface VariantCapabilities {
  /** false → bash/script/cancel/approval ignore provider/model/tools at runtime. */
  honorsAiFields: boolean;
  /** true on loop — `retry` is rejected by Archon's superRefine. */
  forbidsRetry: boolean;
  /** true on approval and interactive loops — Archon pauses execution. */
  requiresInteractive?: boolean;
}

/** NodeLibrary metadata — used by Phase 3 to render the left palette. */
export interface VariantLibraryMetadata {
  label: string;
  description: string;
  /** CSS-variable-friendly token name (e.g. 'command' → `var(--node-command)`). */
  colorToken: string;
  /** Lucide icon name (the actual import happens in Phase 3). */
  iconName: string;
  /** Default id prefix when adding a fresh node ('classify', 'gate', etc.). */
  defaultIdHint: string;
}

/**
 * In-store representation of a node. Distinct from `DagNode` (the wire shape)
 * to keep the editor's data structure stable as Archon's schema evolves.
 */
export interface BuilderNode<TData = unknown> {
  /** The user-authored id; matches the YAML `id:` field and React Flow's `id`. */
  id: string;
  variant: VariantId;
  /** Variant-specific data shape (see per-variant data.ts). */
  data: TData;
  /**
   * Top-level DagNode keys our schema doesn't recognise. Spread back on export.
   * Empty object when the source was fully recognised.
   */
  unknown: Record<string, unknown>;
}

/** Reusable types passed to per-variant fromDag/toDag. */
export type BaseFields = Record<string, unknown>;
export type VariantSpecificFields = Record<string, unknown>;

/** Shape of a per-variant module's contribution to the registry (Phase 1 data slice). */
export interface VariantDefinition<TData> {
  id: VariantId;
  capabilities: VariantCapabilities;
  library: VariantLibraryMetadata;
  schema: z.ZodTypeAny;
  /** Build a fresh TData for "Add node" actions (Phase 2 wires this up). */
  createDefault: () => TData;
  /**
   * Pure mapping: raw partitioned fields → typed TData.
   * Receives base/variantSpecific from pickBaseFields and the upstream DagNode for diagnostics.
   */
  fromDag: (input: { base: BaseFields; variantSpecific: VariantSpecificFields; raw: DagNode }) => TData;
  /** Inverse of fromDag — produces the variant-specific subset of a DagNode. */
  toDag: (data: TData) => Partial<DagNode>;
  // Phase 3 adds: Renderer; Phase 4 adds: Inspector.
}
```

- [ ] **Step 2: Replace `nodes/registry.ts` with the contract-only module**

Replace the Phase 0 skeleton with:

```ts
import type { VariantDefinition } from './shared/types';

export type VariantId =
  | 'command'
  | 'prompt'
  | 'bash'
  | 'script'
  | 'loop'
  | 'approval'
  | 'cancel';

export const VARIANT_IDS: readonly VariantId[] = [
  'command',
  'prompt',
  'bash',
  'script',
  'loop',
  'approval',
  'cancel',
] as const;

export type VariantRegistry = {
  readonly [K in VariantId]: VariantDefinition<unknown>;
};

/**
 * Build a typed registry from a per-variant lookup. Throws if any variant is missing
 * or declares a mismatching id. Per-variant modules are the only registrants;
 * consumer code reads via `getVariant` (in `default-registry.ts`).
 */
export function buildRegistry(entries: {
  [K in VariantId]: VariantDefinition<unknown>;
}): VariantRegistry {
  for (const id of VARIANT_IDS) {
    if (!entries[id]) throw new Error(`Variant registry missing: ${id}`);
    if (entries[id].id !== id) {
      throw new Error(`Variant registry mismatch: entry under '${id}' declares id '${entries[id].id}'`);
    }
  }
  return entries;
}
```

- [ ] **Step 2b: Create the pre-wired default registry**

Create `packages/studio-core/src/nodes/default-registry.ts`:

```ts
import { buildRegistry, type VariantId, type VariantRegistry } from './registry';
import type { VariantDefinition } from './shared/types';
import { commandVariant } from './command';
import { promptVariant } from './prompt';
import { bashVariant } from './bash';
import { scriptVariant } from './script';
import { loopVariant } from './loop';
import { approvalVariant } from './approval';
import { cancelVariant } from './cancel';

export const defaultRegistry: VariantRegistry = buildRegistry({
  command: commandVariant,
  prompt: promptVariant,
  bash: bashVariant,
  script: scriptVariant,
  loop: loopVariant,
  approval: approvalVariant,
  cancel: cancelVariant,
});

export function getVariant<TData = unknown>(id: VariantId): VariantDefinition<TData> {
  return defaultRegistry[id] as VariantDefinition<TData>;
}
```

This file imports the seven per-variant modules eagerly via static `import`. Vite/Rollup tree-shake correctly; tests in CI compile cleanly. The per-variant modules import only types (`VariantId`, `VariantDefinition`) from `registry.ts`, which TypeScript erases — no runtime cycle.

**Bootstrap order:** until Tasks 20–26 ship the per-variant `<v>Variant` exports, the seven static imports in `default-registry.ts` will fail to type-check. To break the chicken-and-egg, **commit `default-registry.ts` only after Task 26 lands** — Step 6 of this task ships only `registry.ts` + `shared/types.ts` + a skipped registry test. Step 6 of Task 26 adds `default-registry.ts` and un-skips the test.

- [ ] **Step 3: Write registry tests**

Create `packages/studio-core/tests/nodes/registry.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { VARIANT_IDS } from '../../src/nodes/registry';
import { defaultRegistry, getVariant } from '../../src/nodes/default-registry';

describe.skip('default variant registry', () => {
  // Un-skipped in Task 26 once all 7 per-variant modules ship.
  it('contains all 7 variant ids', () => {
    for (const id of VARIANT_IDS) {
      expect(defaultRegistry[id]).toBeDefined();
      expect(defaultRegistry[id].id).toBe(id);
    }
  });

  it('exposes a variant by id', () => {
    expect(getVariant('command').id).toBe('command');
    expect(getVariant('cancel').id).toBe('cancel');
  });

  it('every variant has capabilities + library metadata + schema + createDefault + fromDag + toDag', () => {
    for (const id of VARIANT_IDS) {
      const v = getVariant(id);
      expect(v.capabilities).toBeDefined();
      expect(v.library.label).toBeTruthy();
      expect(v.library.colorToken).toBeTruthy();
      expect(typeof v.createDefault).toBe('function');
      expect(typeof v.fromDag).toBe('function');
      expect(typeof v.toDag).toBe('function');
    }
  });
});
```

The `describe.skip` is intentional — `default-registry.ts` doesn't exist yet (it's added in Task 26 after all variants ship). Importing from a non-existent module would fail. Step 4 amends.

- [ ] **Step 4: Adjust the test file so it compiles before `default-registry.ts` exists**

In Step 3 the test imports from `../../src/nodes/default-registry`, which won't exist until Task 26. To keep this task's commit type-clean, replace those two imports with stubs commented out:

```ts
// Imports re-enabled in Task 26 along with default-registry.ts.
// import { defaultRegistry, getVariant } from '../../src/nodes/default-registry';
const defaultRegistry = {} as Record<string, never>;
const getVariant = (_id: string) => ({}) as never;
```

The `describe.skip` ensures the stub assertions never run. Task 26's Step 6 restores the real imports and removes the `.skip`.

- [ ] **Step 5: Verify `bun build` is still green (no type errors)**

Run: `bun --filter='@archon-studio/core' run build`
Expected: zero errors. `registry.ts` is contract-only (no per-variant imports). `shared/types.ts` is types-only. The skipped test compiles against the stubs.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/nodes/registry.ts \
        packages/studio-core/src/nodes/shared/types.ts \
        packages/studio-core/tests/nodes/registry.spec.ts
git commit -m "feat(nodes): VariantDefinition contract + buildRegistry helper"
```

(`default-registry.ts` is NOT staged here — it lands in Task 26 after the per-variant modules exist.)

---

### Tasks 20–26: Per-variant data modules (template + per-variant differences)

These seven tasks all follow the same template. The differences live in **the variant TData shape**, **what `fromDag` extracts**, **what `toDag` produces**, and **library metadata**. Implement them in this order; round-trip support arrives task-by-task.

**Per-variant template (apply to each task):**

For variant `<V>`, create:
- `packages/studio-core/src/nodes/<V>/data.ts` — exports `<V>NodeData` (the TData), `create<V>Default()`, `<V>Capabilities`, `<V>Library`.
- `packages/studio-core/src/nodes/<V>/fromDag.ts` — exports `<V>FromDag({ base, variantSpecific, raw })`.
- `packages/studio-core/src/nodes/<V>/toDag.ts` — exports `<V>ToDag(data: <V>NodeData): Partial<DagNode>`.
- `packages/studio-core/src/nodes/<V>/index.ts` — composes `<V>Variant: VariantDefinition<<V>NodeData>` from the three files + the variant's mirrored Zod schema.
- `packages/studio-core/tests/nodes/variants/<V>.spec.ts` — unit tests for `fromDag`, `toDag`, and round-trip `toDag(fromDag(x))` on a representative DagNode.

**TDD per task:** write the test, watch it fail, implement, watch it pass, commit.

**The capabilities table** (declared verbatim in each `data.ts`):

| Variant | honorsAiFields | forbidsRetry | requiresInteractive |
|---|---|---|---|
| `command` | true | false | undefined |
| `prompt` | true | false | undefined |
| `bash` | false | false | undefined |
| `script` | false | false | undefined |
| `loop` | true | true | depends on `data.interactive` |
| `approval` | false | false | true |
| `cancel` | false | false | undefined |

**Library metadata table:**

| Variant | label | description | colorToken | iconName | defaultIdHint |
|---|---|---|---|---|---|
| `command` | "Command" | "Run a named command from `.archon/commands/`" | `node-command` | `Terminal` | `run-command` |
| `prompt` | "Prompt" | "Inline AI prompt — no command file" | `node-prompt` | `Sparkles` | `prompt` |
| `bash` | "Bash" | "Shell script — no AI" | `node-bash` | `SquareTerminal` | `bash` |
| `script` | "Script" | "TypeScript or Python via Bun/uv" | `node-script` | `FileCode` | `script` |
| `loop` | "Loop" | "AI prompt looped until completion signal" | `node-loop` | `RefreshCw` | `loop` |
| `approval` | "Approval" | "Pause for human review" | `node-approval` | `UserCheck` | `approve` |
| `cancel` | "Cancel" | "Terminate the workflow with a reason" | `node-cancel` | `XOctagon` | `cancel` |

**Per-variant TData shapes** — kept deliberately close to the wire shape so `fromDag` is mostly a partition + cast. Foreign top-level keys go to `BuilderNode.unknown` (not into TData).

**Variant-specific `fromDag` / `toDag` rules:**

| Variant | Variant-specific fields handled by fromDag/toDag |
|---|---|
| `command` | `command: string` |
| `prompt` | `prompt: string` |
| `bash` | `bash: string`, `timeout?: number` |
| `script` | `script: string`, `runtime: 'bun' \| 'uv'`, `deps?: string[]`, `timeout?: number` |
| `loop` | `loop: LoopNodeConfig` (the entire object — preserved verbatim) |
| `approval` | `approval: { message, capture_response?, on_reject? }` |
| `cancel` | `cancel: string` |

The base fields (id, depends_on, when, trigger_rule, etc.) are NOT carried in TData — they live on the `BuilderNode`'s outer envelope (the importer/exporter handles them centrally; the per-variant module owns only the variant-specific subset).

**Per-task structure (use this template; differences come from the tables above):**

For Task 20 (`command`), each variant task expands the template like this:

```
### Task 20: command variant module

**Files:**
- Create: packages/studio-core/src/nodes/command/data.ts
- Create: packages/studio-core/src/nodes/command/fromDag.ts
- Create: packages/studio-core/src/nodes/command/toDag.ts
- Create: packages/studio-core/src/nodes/command/index.ts (replaces Phase 0 placeholder)
- Create: packages/studio-core/tests/nodes/variants/command.spec.ts

- [ ] Step 1: Write failing test (round-trip on a representative CommandNode + capability assertions)
- [ ] Step 2: Run test — fails (modules don't exist)
- [ ] Step 3: Implement data.ts (TData shape + createDefault + capabilities + library)
- [ ] Step 4: Implement fromDag.ts (partition.variantSpecific.command → CommandNodeData.command)
- [ ] Step 5: Implement toDag.ts (CommandNodeData → { command })
- [ ] Step 6: Implement index.ts (compose VariantDefinition; export commandVariant)
- [ ] Step 7: Run test — passes
- [ ] Step 8: Commit (one commit per variant: `feat(nodes/command): variant module`)
```

The test for `command` looks like:

```ts
import { describe, it, expect } from 'bun:test';
import { commandVariant } from '../../../src/nodes/command';

describe('command variant', () => {
  it('createDefault returns valid empty CommandNodeData', () => {
    const d = commandVariant.createDefault();
    expect(d.command).toBe('');
  });
  it('fromDag extracts the command name', () => {
    const data = commandVariant.fromDag({
      base: { id: 'a' },
      variantSpecific: { command: 'classify' },
      raw: { id: 'a', command: 'classify' } as never,
    });
    expect(data).toEqual({ command: 'classify' });
  });
  it('toDag produces { command }', () => {
    expect(commandVariant.toDag({ command: 'classify' })).toEqual({ command: 'classify' });
  });
  it('declares honorsAiFields = true and forbidsRetry = false', () => {
    expect(commandVariant.capabilities.honorsAiFields).toBe(true);
    expect(commandVariant.capabilities.forbidsRetry).toBe(false);
  });
});
```

Replicate this structure for **Tasks 21–26** (`prompt`, `bash`, `script`, `loop`, `approval`, `cancel`), substituting the variant-specific fields per the tables above. The interesting variants:

- **Task 23 (`script`)**: `runtime` is required; test that `createDefault` returns `runtime: 'bun'` and `script: ''`. `fromDag` carries through `runtime`, `deps?`, `timeout?` verbatim.
- **Task 24 (`loop`)**: TData is `{ loop: LoopNodeConfig }`. `fromDag` lifts `variantSpecific.loop` verbatim — the importer never calls `loopNodeConfigSchema.parse()`, so foreign sub-keys inside the `loop` object survive by reference regardless of whether the schema declares `.passthrough()`. `toDag` returns `{ loop: data.loop }`. Add a test `it('preserves nested foreign keys inside loop config on round-trip')` that imports `{ id: 'l', loop: { prompt: 'p', until: 'X', max_iterations: 1, future_loop_knob: 7 } }` and asserts `toDag(fromDag(...))` returns `{ loop: { ..., future_loop_knob: 7 } }`.
- **Task 25 (`approval`)**: TData is `{ approval: { message: string; capture_response?: boolean; on_reject?: ApprovalOnReject } }`. `requiresInteractive` capability is `true`. Test that `on_reject.max_attempts` round-trips.
- **Task 26 (`cancel`)**: TData is `{ cancel: string }`. Test the trim semantics — Archon's transform calls `.trim()` on the cancel reason; our `toDag` should produce the trimmed value.

**Task 26 closes the chain.** After Task 26 implements `cancelVariant`, add one extra closing step before its commit:

- **Task 26, Step 9 (registry wire-up):** Create `packages/studio-core/src/nodes/default-registry.ts` per the body in Task 19 Step 2b. Restore the real imports in `tests/nodes/registry.spec.ts` (replace the stubs from Task 19 Step 4 with `import { defaultRegistry, getVariant } from '../../src/nodes/default-registry';`). Remove the `.skip` on the `describe('default variant registry', ...)` block.
- **Task 26, Step 10 (verify):** Run `bun --filter='@archon-studio/core' run test`. Expected: every variant test passes AND the registry test (now un-skipped) passes its 3 assertions.
- **Task 26, Step 11 (commit):** Stage `cancel/`, `default-registry.ts`, and the registry test edits in one commit: `feat(nodes/cancel): variant module + wire all 7 into default-registry`.

**Commit cadence:** one commit per variant task. Tasks 20–25 each commit only the variant they implement. Task 26 commits cancel + the default-registry wire-up together (so the registry test transitions from skipped to passing in a single commit).

**Phase-1-equivalent issue to watch:** Phase 0 Task 5 caught a TypeScript noUnusedLocals trap on `private readonly options`. Same risk here on per-variant `data.ts` files that declare unused capability fields — keep them as `export const xxxCapabilities: VariantCapabilities = {…}` (top-level value, not a class field).

---

### Task 27: Zustand store rewrite — workflow-JSON-as-truth + cascading rename (depends_on + when)

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts` (replace Phase 0 skeleton)
- Create: `packages/studio-core/tests/store/builder-store.spec.ts`

The store carries the in-flight workflow. **Workflow JSON is authoritative**, including `_unknown` bags. Phase 1's store knows nothing about positions, selections, or undo — those land in Phase 2 and Phase 8.

**Rename scope (Phase 1):** the cascade traverses `depends_on` arrays and `when:` strings. `$nodeId.output` body references in `prompt`/`bash`/`script`/`loop.prompt`/`approval.message` bodies are **explicitly deferred to Phase 4** (when the inspector autocomplete lands and per-variant body-ref metadata is meaningful). No Phase 1 UI exposes rename, so the gap is dead-code-only.

State shape:

```ts
interface WorkflowMeta {
  name: string;
  description: string;
  base: Record<string, unknown>;     // typed workflow-base fields (provider, model, etc.)
  unknown: Record<string, unknown>;  // top-level workflow keys we don't recognise
}

interface BuilderState {
  workflow: WorkflowMeta | null;
  nodes: BuilderNode[];               // includes id, variant, data, unknown, base
  // Edges are derived from depends_on; keep nodes authoritative and recompute.
}
```

`BuilderNode` from Task 19 gets a `base` field added in this task — to carry typed base fields (depends_on, when, trigger_rule, etc.) on the node envelope. (Variant-specific data lives in `data`; foreign top-level keys live in `unknown`.) Update `shared/types.ts` accordingly.

- [ ] **Step 1: Update `BuilderNode` to carry `base`**

Edit `packages/studio-core/src/nodes/shared/types.ts` and extend `BuilderNode`:

```ts
export interface BuilderNode<TData = unknown> {
  id: string;
  variant: VariantId;
  data: TData;
  /** Typed base fields (depends_on, when, trigger_rule, idle_timeout, retry, hooks, etc.). */
  base: Record<string, unknown>;
  /** Top-level keys not in our schema. */
  unknown: Record<string, unknown>;
}
```

- [ ] **Step 2: Write failing tests**

Create `packages/studio-core/tests/store/builder-store.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';

describe('builder-store', () => {
  beforeEach(() => useBuilderStore.getState().clearWorkflow());

  it('starts empty', () => {
    expect(useBuilderStore.getState().workflow).toBeNull();
    expect(useBuilderStore.getState().nodes).toEqual([]);
  });

  it('loadWorkflow seeds workflow + nodes', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} },
      ],
    });
    expect(useBuilderStore.getState().workflow?.name).toBe('w');
    expect(useBuilderStore.getState().nodes).toHaveLength(1);
  });

  it('updateNode patches data.command', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} },
      ],
    });
    useBuilderStore.getState().updateNode('a', { data: { command: 'bar' } });
    const a = useBuilderStore.getState().nodes.find((n) => n.id === 'a')!;
    expect((a.data as { command: string }).command).toBe('bar');
  });

  it('renameNode cascades through depends_on', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'classify', variant: 'command', data: { command: 'c' }, base: {}, unknown: {} },
        {
          id: 'act',
          variant: 'command',
          data: { command: 'a' },
          base: { depends_on: ['classify'] },
          unknown: {},
        },
      ],
    });
    useBuilderStore.getState().renameNode('classify', 'sort');
    const act = useBuilderStore.getState().nodes.find((n) => n.id === 'act')!;
    expect(act.base.depends_on).toEqual(['sort']);
  });

  it('renameNode cascades through when: strings', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'classify', variant: 'command', data: { command: 'c' }, base: {}, unknown: {} },
        {
          id: 'act',
          variant: 'command',
          data: { command: 'a' },
          base: { when: "$classify.output == 'ok'" },
          unknown: {},
        },
      ],
    });
    useBuilderStore.getState().renameNode('classify', 'sort');
    const act = useBuilderStore.getState().nodes.find((n) => n.id === 'act')!;
    expect(act.base.when).toBe("$sort.output == 'ok'");
  });

  it('renameNode rejects collisions', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'command', data: { command: 'a' }, base: {}, unknown: {} },
        { id: 'b', variant: 'command', data: { command: 'b' }, base: {}, unknown: {} },
      ],
    });
    expect(() => useBuilderStore.getState().renameNode('a', 'b')).toThrow();
  });

  it('deleteNodes removes target + clears references in others depends_on', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'command', data: { command: 'a' }, base: {}, unknown: {} },
        {
          id: 'b',
          variant: 'command',
          data: { command: 'b' },
          base: { depends_on: ['a'] },
          unknown: {},
        },
      ],
    });
    useBuilderStore.getState().deleteNodes(['a']);
    const nodes = useBuilderStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.base.depends_on).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests — fail**

Run: `bun --filter='@archon-studio/core' run test builder-store`
Expected: tests fail (store skeleton lacks these methods).

- [ ] **Step 4: Implement the store**

Replace `packages/studio-core/src/store/builder-store.ts`:

```ts
import { create } from 'zustand';
import type { BuilderNode } from '../nodes/shared/types';
import type { VariantId } from '../nodes/registry';

export interface WorkflowMeta {
  name: string;
  description: string;
  base: Record<string, unknown>;
  unknown: Record<string, unknown>;
}

export interface LoadWorkflowInput {
  meta: WorkflowMeta;
  nodes: BuilderNode[];
}

export interface BuilderState {
  workflow: WorkflowMeta | null;
  nodes: BuilderNode[];

  loadWorkflow: (input: LoadWorkflowInput) => void;
  clearWorkflow: () => void;

  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (description: string) => void;

  addNode: (node: BuilderNode) => void;
  updateNode: (id: string, patch: Partial<BuilderNode>) => void;
  deleteNodes: (ids: string[]) => void;

  connect: (source: string, target: string) => void;
  disconnect: (source: string, target: string) => void;
  renameNode: (oldId: string, newId: string) => void;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  workflow: null,
  nodes: [],

  loadWorkflow: ({ meta, nodes }) => set({ workflow: meta, nodes }),
  clearWorkflow: () => set({ workflow: null, nodes: [] }),

  setWorkflowName: (name) =>
    set((s) => (s.workflow ? { workflow: { ...s.workflow, name } } : s)),
  setWorkflowDescription: (description) =>
    set((s) => (s.workflow ? { workflow: { ...s.workflow, description } } : s)),

  addNode: (node) =>
    set((s) => {
      if (s.nodes.some((n) => n.id === node.id)) {
        throw new Error(`addNode: id collision '${node.id}'`);
      }
      return { nodes: [...s.nodes, node] };
    }),

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),

  deleteNodes: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      nodes: s.nodes
        .filter((n) => !idSet.has(n.id))
        .map((n) => {
          const dep = (n.base.depends_on as string[] | undefined) ?? undefined;
          if (!dep) return n;
          const filtered = dep.filter((d) => !idSet.has(d));
          const newBase = { ...n.base };
          if (filtered.length === 0) delete newBase.depends_on;
          else newBase.depends_on = filtered;
          return { ...n, base: newBase };
        }),
    }));
  },

  connect: (source, target) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== target) return n;
        const dep = (n.base.depends_on as string[] | undefined) ?? [];
        if (dep.includes(source)) return n;
        return { ...n, base: { ...n.base, depends_on: [...dep, source] } };
      }),
    })),

  disconnect: (source, target) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== target) return n;
        const dep = (n.base.depends_on as string[] | undefined) ?? [];
        const filtered = dep.filter((d) => d !== source);
        const newBase = { ...n.base };
        if (filtered.length === 0) delete newBase.depends_on;
        else newBase.depends_on = filtered;
        return { ...n, base: newBase };
      }),
    })),

  renameNode: (oldId, newId) => {
    if (oldId === newId) return;
    const state = get();
    if (state.nodes.some((n) => n.id === newId)) {
      throw new Error(`renameNode: collision — '${newId}' already exists`);
    }
    if (!state.nodes.some((n) => n.id === oldId)) {
      throw new Error(`renameNode: '${oldId}' not found`);
    }

    // Cascading rename — see spec §5.2 / §7.4.
    const renameRefs = (n: BuilderNode): BuilderNode => {
      const next: BuilderNode = { ...n, base: { ...n.base } };
      // 1. id itself
      if (next.id === oldId) next.id = newId;
      // 2. depends_on
      const dep = (next.base.depends_on as string[] | undefined) ?? undefined;
      if (dep) next.base.depends_on = dep.map((d) => (d === oldId ? newId : d));
      // 3. when: strings ($oldId.* → $newId.*)
      const w = next.base.when as string | undefined;
      if (typeof w === 'string') {
        next.base.when = w.replace(
          new RegExp(`\\$${escapeRegExp(oldId)}\\b`, 'g'),
          `$${newId}`,
        );
      }
      // Phase 4 will extend with: $nodeId.output body refs in prompt/bash/script/
      // loop.prompt/approval.message via per-variant `renameBodyRefs(data, oldId, newId)`.
      // No Phase 1 UI exposes renameNode, so the gap is dead-code-only today.
      return next;
    };
    set({ nodes: state.nodes.map(renameRefs) });
  },
}));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 5: Run tests — pass**

Run: `bun --filter='@archon-studio/core' run test builder-store`
Expected: 7/7 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/nodes/shared/types.ts \
        packages/studio-core/tests/store/builder-store.spec.ts
git commit -m "feat(store): workflow-JSON-as-truth + cascading rename through depends_on/when"
```

---

### Task 28: `fromWorkflowDefinition` importer

**Files:**
- Create: `packages/studio-core/src/exporter/fromWorkflowDefinition.ts`
- Create: `packages/studio-core/tests/exporter/fromWorkflowDefinition.spec.ts`

Pure function: takes a `WorkflowDefinition`-shaped raw object → `LoadWorkflowInput` (the store's input shape from Task 27). Composes `detectVariant`, `pickBaseFields`, and per-variant `fromDag`. Captures `_unknown` at workflow-base level too.

**Workflow-base known keys** (mirrored from `workflowBaseSchema` in workflow.ts at the pinned SHA):

```
name, description, provider, model, modelReasoningEffort, webSearchMode,
additionalDirectories, interactive, effort, thinking, fallbackModel, betas,
sandbox, worktree, mutates_checkout, tags
```

(Plus `nodes` which is never `_unknown` — it's structurally required.)

- [ ] **Step 1: Write failing tests**

Create `packages/studio-core/tests/exporter/fromWorkflowDefinition.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { fromWorkflowDefinition } from '../../src/exporter/fromWorkflowDefinition';

describe('fromWorkflowDefinition', () => {
  it('imports a minimal command workflow', () => {
    const result = fromWorkflowDefinition({
      name: 'w',
      description: 'd',
      nodes: [{ id: 'a', command: 'classify' }],
    });
    expect(result.meta.name).toBe('w');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.variant).toBe('command');
    expect((result.nodes[0]!.data as { command: string }).command).toBe('classify');
  });

  it('captures unknown workflow-base + node-level keys', () => {
    const result = fromWorkflowDefinition({
      name: 'w',
      description: 'd',
      future_workflow_knob: 'experimental',
      nodes: [
        { id: 'a', command: 'classify', __experimental_node_flag: true },
      ],
    });
    expect(result.meta.unknown).toEqual({ future_workflow_knob: 'experimental' });
    expect(result.nodes[0]!.unknown).toEqual({ __experimental_node_flag: true });
  });

  it('partitions every variant correctly across a mixed workflow', () => {
    const result = fromWorkflowDefinition({
      name: 'mixed',
      description: 'all variants',
      nodes: [
        { id: 'c', command: 'foo' },
        { id: 'p', prompt: 'do', depends_on: ['c'] },
        { id: 'b', bash: 'echo', timeout: 1000 },
        { id: 's', script: 'export {}', runtime: 'bun' },
        { id: 'l', loop: { prompt: 'p', until: 'X', max_iterations: 3 } },
        { id: 'a', approval: { message: 'go?' } },
        { id: 'x', cancel: 'abort' },
      ],
    });
    expect(result.nodes.map((n) => n.variant)).toEqual([
      'command',
      'prompt',
      'bash',
      'script',
      'loop',
      'approval',
      'cancel',
    ]);
  });
});
```

- [ ] **Step 2: Run tests — fail**

Run: `bun --filter='@archon-studio/core' run test fromWorkflowDefinition`
Expected: fails (module doesn't exist).

- [ ] **Step 3: Implement the importer**

Create `packages/studio-core/src/exporter/fromWorkflowDefinition.ts`:

```ts
import { detectVariant } from '../nodes/shared/detectVariant';
import { pickBaseFields } from '../nodes/shared/pickBaseFields';
import { getVariant } from '../nodes/registry';
import type { BuilderNode } from '../nodes/shared/types';
import type { LoadWorkflowInput } from '../store/builder-store';

// `name` and `description` are handled separately above; this set covers the rest of workflowBaseSchema.
const WORKFLOW_BASE_KEYS = new Set([
  'provider',
  'model',
  'modelReasoningEffort',
  'webSearchMode',
  'additionalDirectories',
  'interactive',
  'effort',
  'thinking',
  'fallbackModel',
  'betas',
  'sandbox',
  'worktree',
  'mutates_checkout',
  'tags',
]);

export function fromWorkflowDefinition(raw: Record<string, unknown>): LoadWorkflowInput {
  const name = String(raw.name ?? '');
  const description = String(raw.description ?? '');

  const base: Record<string, unknown> = {};
  const unknown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'nodes' || key === 'name' || key === 'description') continue;
    if (value === undefined) continue;
    if (WORKFLOW_BASE_KEYS.has(key)) base[key] = value;
    else unknown[key] = value;
  }

  const rawNodes = (raw.nodes as Array<Record<string, unknown>>) ?? [];
  const nodes: BuilderNode[] = rawNodes.map((rawNode) => {
    const detection = detectVariant(rawNode);
    if (!detection.ok) {
      throw new Error(
        `fromWorkflowDefinition: node '${String(rawNode.id)}' — ${detection.reason}` +
          ('keysPresent' in detection ? ` (${detection.keysPresent!.join(', ')})` : ''),
      );
    }
    const partitioned = pickBaseFields(rawNode, detection.variant);
    const variant = getVariant(detection.variant);
    const data = variant.fromDag({
      base: partitioned.base,
      variantSpecific: partitioned.variantSpecific,
      raw: rawNode as never,
    });
    // Strip 'id' from base — it's the node envelope's identity.
    const { id: _id, ...baseSansId } = partitioned.base;
    return {
      id: String(rawNode.id),
      variant: detection.variant,
      data,
      base: baseSansId,
      unknown: partitioned.unknown,
    };
  });

  return { meta: { name, description, base, unknown }, nodes };
}
```

- [ ] **Step 4: Run tests — pass**

Run: `bun --filter='@archon-studio/core' run test fromWorkflowDefinition`
Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/exporter/fromWorkflowDefinition.ts \
        packages/studio-core/tests/exporter/fromWorkflowDefinition.spec.ts
git commit -m "feat(exporter): fromWorkflowDefinition — parse → store, _unknown captured at every level"
```

---

### Task 29: `toWorkflowDefinition` exporter

**Files:**
- Create: `packages/studio-core/src/exporter/toWorkflowDefinition.ts`
- Create: `packages/studio-core/tests/exporter/toWorkflowDefinition.spec.ts`

Inverse of Task 28. Takes the store's `{ meta, nodes }` → a raw `WorkflowDefinition`-shaped object. Each node's output is `{ id, ...base, ...variant.toDag(data), ...unknown }`. The workflow envelope is `{ name, description, ...meta.base, ...meta.unknown, nodes: [...] }`.

- [ ] **Step 1: Write failing tests**

Create `packages/studio-core/tests/exporter/toWorkflowDefinition.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { toWorkflowDefinition } from '../../src/exporter/toWorkflowDefinition';
import { fromWorkflowDefinition } from '../../src/exporter/fromWorkflowDefinition';

describe('toWorkflowDefinition', () => {
  it('round-trips a minimal command workflow byte-equivalent', () => {
    const input = {
      name: 'w',
      description: 'd',
      nodes: [{ id: 'a', command: 'classify' }],
    };
    const out = toWorkflowDefinition(fromWorkflowDefinition(input));
    expect(out).toEqual(input);
  });

  it('preserves unknown workflow + node keys on round-trip', () => {
    const input = {
      name: 'w',
      description: 'd',
      future_workflow_knob: 'experimental',
      nodes: [{ id: 'a', command: 'classify', __experimental_node_flag: true }],
    };
    const out = toWorkflowDefinition(fromWorkflowDefinition(input));
    expect(out).toEqual(input);
  });

  it('preserves trigger_rule, depends_on, when, idle_timeout', () => {
    const input = {
      name: 'w',
      description: 'd',
      nodes: [
        { id: 'a', command: 'classify' },
        {
          id: 'b',
          command: 'act',
          depends_on: ['a'],
          when: "$a.output == 'ok'",
          trigger_rule: 'all_success',
          idle_timeout: 1000,
        },
      ],
    };
    const out = toWorkflowDefinition(fromWorkflowDefinition(input));
    expect(out).toEqual(input);
  });
});
```

- [ ] **Step 2: Run tests — fail**

Run: `bun --filter='@archon-studio/core' run test toWorkflowDefinition`

- [ ] **Step 3: Implement the exporter**

Create `packages/studio-core/src/exporter/toWorkflowDefinition.ts`:

```ts
import { getVariant } from '../nodes/registry';
import type { LoadWorkflowInput } from '../store/builder-store';

export function toWorkflowDefinition(input: LoadWorkflowInput): Record<string, unknown> {
  const { meta, nodes } = input;

  const out: Record<string, unknown> = {
    name: meta.name,
    description: meta.description,
    ...meta.base,
    ...meta.unknown,
    nodes: nodes.map((n) => {
      const variantPart = getVariant(n.variant).toDag(n.data);
      return {
        id: n.id,
        ...n.base,
        ...variantPart,
        ...n.unknown,
      };
    }),
  };
  return out;
}
```

- [ ] **Step 4: Run tests — pass**

Run: `bun --filter='@archon-studio/core' run test toWorkflowDefinition`
Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/exporter/toWorkflowDefinition.ts \
        packages/studio-core/tests/exporter/toWorkflowDefinition.spec.ts
git commit -m "feat(exporter): toWorkflowDefinition — store → raw with _unknown spread"
```

---

### Task 30: Killer round-trip test upgrade — full pipeline

**Files:**
- Modify: `packages/studio-core/tests/round-trip.spec.ts`

Upgrade from Phase 0's schema-parse-only body to the full pipeline. Every fixture is parsed → imported → exported → re-parsed → deep-equal asserted against the original parsed object.

- [ ] **Step 1: Replace the test body**

Replace the inner `it` body in `tests/round-trip.spec.ts` with:

```ts
for (const fixture of fixtures) {
  it(`${fixture} round-trips byte-equivalent through importer + exporter`, async () => {
    const yamlText = readFileSync(join(FIXTURE_DIR, fixture), 'utf8');
    const yaml = await import('yaml');
    const original = yaml.parse(yamlText);

    // Step 1: schema validates the source
    const validation = workflowDefinitionSchema.safeParse(original);
    if (!validation.success) {
      console.error(`Schema parse failed for ${fixture}:`);
      console.error(JSON.stringify(validation.error.format(), null, 2));
    }
    expect(validation.success).toBe(true);

    // Step 2: import → export
    const { fromWorkflowDefinition } = await import('../src/exporter/fromWorkflowDefinition');
    const { toWorkflowDefinition } = await import('../src/exporter/toWorkflowDefinition');
    const reExported = toWorkflowDefinition(fromWorkflowDefinition(original));

    // Step 3: schema validates the round-tripped object
    const reValidation = workflowDefinitionSchema.safeParse(reExported);
    expect(reValidation.success).toBe(true);

    // Step 4: deep-equal — every byte preserved
    expect(reExported).toEqual(original);
  });
}
```

- [ ] **Step 2: Run the full suite**

Run: `bun --filter='@archon-studio/core' run test`
Expected: every fixture passes the four assertions.

If any fixture fails the **deep-equal** step:
- Diff `original` vs `reExported` (Bun's test framework prints a diff). The diff tells you which key was added/dropped/reshaped.
- Common causes:
  - A schema-recognised field accidentally listed as both `base` and `variantSpecific` (key duplication).
  - A nested object inside a known key (e.g. `output_format`) lost a foreign sub-key — see §6.3 deep-merge contract; if a per-variant `fromDag/toDag` round-trips a known key by extracting then rebuilding it, foreign sub-keys are dropped. Fix: round-trip the whole known-object verbatim and let inspectors patch via deep-merge later.
  - Order of keys differs but content is identical — `expect().toEqual()` is order-insensitive for objects, so this should not fail; if it does, you're comparing arrays whose elements are structurally identical but ordered differently. Check `depends_on`.

If any fixture fails the **schema parse** step on the *original*: a schema-mirror gap. Fix the mirror; drift CI confirms intentional.

- [ ] **Step 3: Commit**

```bash
git add packages/studio-core/tests/round-trip.spec.ts
git commit -m "test(round-trip): full importer→exporter byte-equivalent assertion"
```

---

### Task 31: Phase 1 verification + push + tag

**Files:** none (verification only)

- [ ] **Step 1: Full local CI sweep**

Run, in order, each must pass:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run check-schema-drift
bun --filter='*' run build
bun --filter='*' run test
```

If any step fails, fix root cause; do not paper over.

- [ ] **Step 2: Push to origin/main**

```bash
git push origin main
```

Verify the `CI` and `round-trip` workflows go green on GitHub Actions before tagging.

- [ ] **Step 3: Tag**

```bash
git tag -a phase-1 -m "Phase 1: data spine complete; importer+exporter round-trip every Archon bundled default + smoke fixture byte-equivalent"
git push origin phase-1
```

- [ ] **Step 4: Update Phase 1 deliverables checklist below**

---

## Phase 1 deliverables checklist

- [ ] Every Archon bundled default + `e2e-pi-all-nodes-smoke.yaml` vendored at the pinned SHA (Task 16)
- [ ] `detectVariant` pure function (Task 17)
- [ ] `pickBaseFields` + `BASE_FIELD_KEYS` + `VARIANT_SPECIFIC_KEYS` (Task 18)
- [ ] `VariantDefinition<TData>` contract + statically-imported default registry (Tasks 19 + 26)
- [ ] All 7 per-variant data modules with `fromDag`/`toDag`/`createDefault`/capabilities/library (Tasks 20–26)
- [ ] Zustand store with workflow-JSON-as-truth + cascading rename (Task 27)
- [ ] `fromWorkflowDefinition` importer (Task 28)
- [ ] `toWorkflowDefinition` exporter (Task 29)
- [ ] Killer round-trip test upgraded; passes for every fixture (Task 30)
- [ ] All local + remote CI green; `phase-1` tag pushed (Task 31)

---

## Chunk 4: Phase 2 — Canvas, DagNode, position persistence, WorkflowBuilder shell, standalone smoke

**Goal of this chunk:** Stand up the visible editor on top of the Phase 1 data spine. Land the React Flow canvas with Archon-equivalent dagre auto-layout, a single Phase-2 `DagNodeComponent` (variant color stripe + single top/bottom handle pair), the localStorage-backed position-persistence hook, the `WorkflowBuilder` layout shell (toolbar slot + library slot + canvas + inspector slot — last two are stubs), a stub `ArchonApiClient` that returns the bundled smoke fixture, and the wiring in `apps/standalone` that mounts `WorkflowBuilder` against that stub. After Phase 2, `bun --filter='@archon-studio/standalone' run dev` opens a browser tab showing the smoke fixture rendered as a real graph; the user can drag nodes, connect/disconnect by edge, delete, and reload — positions persist on the same browser. No inspector, no library palette, no validation, no save: those land in Phases 3–9.

**Definition of done for Phase 2:**

- `packages/studio-core/src/components/canvas/deriveFlow.ts` — pure function `(nodes, positions) → { rfNodes, rfEdges }` with a `mode: 'whenIsDashed'` edge-style decision baked in. Unit-tested.
- `packages/studio-core/src/hooks/useDagre.ts` — pure layout helper matching Archon's `packages/web/src/lib/dag-layout.ts` settings (`rankdir: 'TB'`, `ranksep: 80`, `nodesep: 40`, node 180×80, smoothstep). Unit-tested.
- `packages/studio-core/src/hooks/usePositionPersistence.ts` — localStorage-backed map of node id → position keyed by `<archonUrl>::<cwd>::<workflowName>`, with debounced writes and a `reset()` for the toolbar's "Reset layout" action. Unit-tested via a JSDOM-style happy-dom storage shim.
- `packages/studio-core/src/components/DagNodeComponent.tsx` — single Phase-2 unified node renderer (variant color stripe via `--node-<variant>` token, top + bottom Handle, id label, variant tag chip). Per-variant Renderer split is Phase 3 — the registry's `Renderer` field stays unset for now and the canvas registers exactly one `nodeType: 'dag'`. Component-tested with `@testing-library/react`.
- `packages/studio-core/src/components/Canvas.tsx` — React Flow integration that consumes `deriveFlow` + `useDagre` + `usePositionPersistence`, wires `onConnect`/`onNodesDelete`/`onEdgesDelete`/`onNodesChange` back to the Zustand store actions from Phase 1. Component-tested for: store-driven render, drag persists, connect/disconnect mutates store, delete removes node + cleans `depends_on`.
- `packages/studio-core/src/components/Toolbar.tsx` — Phase-2 skeleton showing the workflow name (read-only display) and a "Reset layout" button that drops persisted positions and triggers re-layout. Phase 8 fills in the rest (undo/redo, validate, save, theme picker, codebase pill).
- `packages/studio-core/src/components/WorkflowBuilder.tsx` — top-level layout shell. Mounts `<ApiClientProvider>` (passed in via prop) + `<ThemeProvider>` (preset prop) + `<QueryClientProvider>` (own QueryClient) + `<StudioErrorBoundary>` (Phase 0 skeleton). Renders a CSS-grid layout: top row = `<Toolbar>`; left column = `NodeLibrary` slot (empty `<aside>` placeholder until Phase 3); center = `<Canvas>`; right column = `NodeInspector` slot (empty `<aside>` placeholder until Phase 4); bottom = `ValidationPanel` slot (empty until Phase 6). Component-tested for: smoke render with a fixture-backed store; reset-layout button calls the hook's `reset()`.
- `packages/studio-core/src/index.ts` re-exports `WorkflowBuilder` and the `WorkflowBuilderProps` type. (Internal pieces — `Canvas`, `Toolbar`, `DagNodeComponent`, hooks — stay private.)
- `packages/studio-api-archon/src/StubArchonApiClient.ts` — a `WorkflowApiClient` impl that resolves `getWorkflow(name, _cwd)` from `loadRoundTripFixture(name)` (from `@archon-studio/fixtures`), returns a canned `[{ workflow, source: 'bundled' }]` for `listWorkflows`, `null` for `listCodebases`, `[]` for `listCommands`/`listProviders`, no-ops `saveWorkflow` (echoes the input), and `{ valid: true }` for `validateWorkflow`. Its purpose is to let the standalone shell open a real fixture without an Archon process. Real impls land in Phase 9.
- `apps/standalone/src/App.tsx` mounts `<WorkflowBuilder>` against `StubArchonApiClient`, hydrates `useBuilderStore` from the smoke fixture by calling `client.getWorkflow('_smoke-pi-all-nodes', '/dev')` → `fromWorkflowDefinition` → `loadWorkflow`, and renders full-viewport. Routing is intentionally not added in Phase 2 — `react-router-dom` arrives in Phase 9 with `/connect`, `/workflows`, `/builder/:name`.
- `apps/standalone/src/index.css` extended so the studio fills the viewport (the existing `html,body,#root { height: 100% }` rule is enough; verify the React Flow container inherits height correctly).
- `bun --filter='*' run build`, `bun --filter='*' run test`, and `bun --filter='@archon-studio/standalone' run dev` are all green; the dev server renders the smoke fixture as a graph; CI green.
- `phase-2` annotated tag is pushed.

**Reference skills if you get stuck:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`. The `agent-browser` or `browse` skill is useful for the manual verification step (Task 41) — open the dev URL, take a screenshot, confirm the graph layout matches Archon visually.

**Big-picture data flow (the pieces this chunk delivers):**

```
fixture YAML ──parse──▶ JSON ──fromWorkflowDefinition──▶ store {workflow, nodes}
                                                                  │
                                                                  ▼
                                              deriveFlow(nodes, positionMap)
                                                                  │
                                                       ┌──────────┴──────────┐
                                                       ▼                     ▼
                                                  rfNodes (no pos       rfEdges
                                                  for unset ids)            │
                                                       │                    │
                                                       ▼                    │
                                          useDagre fills missing positions  │
                                                       │                    │
                                                       └─────────┬──────────┘
                                                                 ▼
                                                       <ReactFlow nodes/edges/>
                                                                 │
                                                                 ▼
                                                onNodesChange → usePositionPersistence
                                                                 │     (debounced
                                                                 │      localStorage write)
                                                                 ▼
                                                onConnect/onNodesDelete/onEdgesDelete
                                                          → store.connect/disconnect/deleteNodes
                                                                 │
                                                                 ▼
                                                        store update → re-render
```

**Phase-2 invariant (worth re-stating because it's easy to violate):** React Flow holds positions; the Zustand store does **not**. Any code that wants to know "where is node X on screen" reads from React Flow internal state (or the persistence map). Any code that wants to mutate the workflow goes through store actions. If a future task is tempted to add `position` to `BuilderNode`, that's a sign the spec drift has begun — push back; the workflow JSON must stay positionally pure.

---

### Task 32: `deriveFlow` — pure store-to-React-Flow projection

**Files:**
- Create: `packages/studio-core/src/components/canvas/deriveFlow.ts`
- Create: `packages/studio-core/tests/components/canvas/deriveFlow.spec.ts`

This is the pure boundary between our Zustand world and React Flow's world. Given store nodes and a position map, return `{ rfNodes, rfEdges }`. Edges are derived from each node's `base.depends_on`; an edge whose **target** has a `base.when` string gets the dashed-purple style (mirrors Archon's `WorkflowCanvas.tsx:121-135`). Keep this function dependency-free of React or `@xyflow/react` runtime — only its types.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/components/canvas/deriveFlow.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { deriveFlow } from '../../../src/components/canvas/deriveFlow';
import type { BuilderNode } from '../../../src/nodes/shared/types';

const node = (over: Partial<BuilderNode>): BuilderNode => ({
  id: 'x',
  variant: 'command',
  data: {},
  base: {},
  unknown: {},
  ...over,
});

describe('deriveFlow', () => {
  it('emits one rfNode per store node, all with type "dag"', () => {
    const { rfNodes } = deriveFlow(
      [node({ id: 'a' }), node({ id: 'b' })],
      new Map(),
    );
    expect(rfNodes).toHaveLength(2);
    expect(rfNodes.every((n) => n.type === 'dag')).toBe(true);
    expect(rfNodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('uses position map when present, defaults to {x:0,y:0} otherwise', () => {
    const { rfNodes } = deriveFlow(
      [node({ id: 'a' }), node({ id: 'b' })],
      new Map([['a', { x: 100, y: 200 }]]),
    );
    expect(rfNodes.find((n) => n.id === 'a')?.position).toEqual({ x: 100, y: 200 });
    expect(rfNodes.find((n) => n.id === 'b')?.position).toEqual({ x: 0, y: 0 });
  });

  it('emits one edge per depends_on entry with id "<source>-><target>"', () => {
    const { rfEdges } = deriveFlow(
      [
        node({ id: 'a' }),
        node({ id: 'b', base: { depends_on: ['a'] } }),
        node({ id: 'c', base: { depends_on: ['a', 'b'] } }),
      ],
      new Map(),
    );
    expect(rfEdges.map((e) => e.id).sort()).toEqual(['a->b', 'a->c', 'b->c']);
    expect(rfEdges.every((e) => e.type === 'smoothstep')).toBe(true);
  });

  it('marks edges as dashed-purple when the TARGET has a when: string', () => {
    const { rfEdges } = deriveFlow(
      [
        node({ id: 'a' }),
        node({ id: 'b', base: { depends_on: ['a'], when: "$a.output == 'go'" } }),
      ],
      new Map(),
    );
    const e = rfEdges.find((e) => e.id === 'a->b')!;
    expect(e.style?.strokeDasharray).toBeDefined();
    expect(e.style?.stroke).toBe('var(--studio-when)');
  });

  it('passes variant id through on rfNode.data so DagNodeComponent can read it', () => {
    const { rfNodes } = deriveFlow([node({ id: 'a', variant: 'loop' })], new Map());
    expect(rfNodes[0].data).toMatchObject({ variant: 'loop', storeId: 'a' });
  });

  it('skips depends_on entries whose source is missing (defensive)', () => {
    const { rfEdges } = deriveFlow(
      [node({ id: 'b', base: { depends_on: ['ghost'] } })],
      new Map(),
    );
    expect(rfEdges).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect compile/runtime failure**

Run: `bun --filter='@archon-studio/core' test deriveFlow`
Expected: module-not-found for `deriveFlow`.

- [ ] **Step 3: Implement `deriveFlow`**

Create `packages/studio-core/src/components/canvas/deriveFlow.ts`:

```ts
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { BuilderNode } from '../../nodes/shared/types';
import type { VariantId } from '../../nodes/registry';

export interface DagNodeData extends Record<string, unknown> {
  variant: VariantId;
  storeId: string;
  /** Read by DagNodeComponent for label rendering. */
  label: string;
}

export interface DeriveFlowResult {
  rfNodes: RFNode<DagNodeData>[];
  rfEdges: RFEdge[];
}

export function deriveFlow(
  storeNodes: readonly BuilderNode[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
): DeriveFlowResult {
  const knownIds = new Set(storeNodes.map((n) => n.id));

  const rfNodes: RFNode<DagNodeData>[] = storeNodes.map((n) => ({
    id: n.id,
    type: 'dag',
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { variant: n.variant, storeId: n.id, label: n.id },
  }));

  const rfEdges: RFEdge[] = [];
  for (const target of storeNodes) {
    const dep = target.base.depends_on as string[] | undefined;
    if (!dep) continue;
    const targetHasWhen = typeof target.base.when === 'string';
    for (const source of dep) {
      if (!knownIds.has(source)) continue; // defensive
      rfEdges.push({
        id: `${source}->${target.id}`,
        source,
        target: target.id,
        type: 'smoothstep',
        style: targetHasWhen
          ? { stroke: 'var(--studio-when)', strokeDasharray: '6 4' }
          : { stroke: 'var(--studio-muted)' },
      });
    }
  }

  return { rfNodes, rfEdges };
}
```

- [ ] **Step 4: Run, expect green**

Run: `bun --filter='@archon-studio/core' test deriveFlow`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/components/canvas/deriveFlow.ts \
        packages/studio-core/tests/components/canvas/deriveFlow.spec.ts
git commit -m "feat(canvas): deriveFlow — pure store→React-Flow projection with when-aware edge styling"
```

---

### Task 33: `useDagre` — Archon-equivalent layout helper

**Files:**
- Create: `packages/studio-core/src/hooks/useDagre.ts`
- Create: `packages/studio-core/tests/hooks/useDagre.spec.ts`

`useDagre` is **not** a React hook in the strict sense — it's exported as a pure function `layoutWithDagre(rfNodes, rfEdges) → Map<id, {x,y}>` plus a thin React wrapper `useDagre(rfNodes, rfEdges)` that memoises. The pure function is what we test; the wrapper gets coverage incidentally through Canvas tests. Settings are pinned to **Archon's exact values** at the SHA in `.archon-source-pin`: `rankdir: 'TB'`, `ranksep: 80`, `nodesep: 40`, node 180×80. If Archon's layout settings change upstream, that's a deliberate decision — schema-drift CI doesn't watch this file, so any rev of the pin should re-confirm by inspection (note this in the Phase 10 drift checklist).

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/hooks/useDagre.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { layoutWithDagre } from '../../src/hooks/useDagre';

describe('layoutWithDagre', () => {
  it('returns one position per node id', () => {
    const positions = layoutWithDagre(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'b', position: { x: 0, y: 0 } },
      ],
      [{ id: 'a->b', source: 'a', target: 'b' }],
    );
    expect(positions.size).toBe(2);
    expect(positions.has('a')).toBe(true);
    expect(positions.has('b')).toBe(true);
  });

  it('lays out top-to-bottom: parent above child given rankdir TB', () => {
    const positions = layoutWithDagre(
      [
        { id: 'parent', position: { x: 0, y: 0 } },
        { id: 'child', position: { x: 0, y: 0 } },
      ],
      [{ id: 'p->c', source: 'parent', target: 'child' }],
    );
    expect(positions.get('parent')!.y).toBeLessThan(positions.get('child')!.y);
  });

  it('separates siblings horizontally given nodesep 40', () => {
    const positions = layoutWithDagre(
      [
        { id: 'root', position: { x: 0, y: 0 } },
        { id: 'left', position: { x: 0, y: 0 } },
        { id: 'right', position: { x: 0, y: 0 } },
      ],
      [
        { id: 'r->l', source: 'root', target: 'left' },
        { id: 'r->r', source: 'root', target: 'right' },
      ],
    );
    expect(positions.get('left')!.x).not.toEqual(positions.get('right')!.x);
  });

  it('handles disconnected nodes (no edges)', () => {
    const positions = layoutWithDagre(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'b', position: { x: 0, y: 0 } },
      ],
      [],
    );
    expect(positions.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    expect(layoutWithDagre([], []).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect compile failure**

Run: `bun --filter='@archon-studio/core' test useDagre`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `packages/studio-core/src/hooks/useDagre.ts`:

```ts
import { useMemo } from 'react';
import dagre from '@dagrejs/dagre';

/** Mirrors Archon's `packages/web/src/lib/dag-layout.ts` settings at the pinned SHA. */
const DAGRE_OPTIONS = { rankdir: 'TB', ranksep: 80, nodesep: 40 } as const;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

interface MinimalRFNode {
  id: string;
  position: { x: number; y: number };
}
interface MinimalRFEdge {
  id: string;
  source: string;
  target: string;
}

/** Pure: compute dagre positions for the given graph. Caller decides what to do with them. */
export function layoutWithDagre(
  nodes: readonly MinimalRFNode[],
  edges: readonly MinimalRFEdge[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  const g = new dagre.graphlib.Graph();
  g.setGraph(DAGRE_OPTIONS);
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.source, e.target);

  try {
    dagre.layout(g);
  } catch (err) {
    // Cycle or other dagre failure — return identity positions; Canvas surfaces a warning.
    // (Phase 6's cycle detector is the authoritative gatekeeper; this is just a soft fallback.)
    // eslint-disable-next-line no-console
    console.error('[useDagre] layout failed, using identity positions:', err);
    for (const n of nodes) result.set(n.id, { x: 0, y: 0 });
    return result;
  }

  for (const n of nodes) {
    const laid = g.node(n.id);
    if (!laid) continue;
    // Dagre returns CENTER positions; React Flow expects TOP-LEFT.
    result.set(n.id, { x: laid.x - NODE_WIDTH / 2, y: laid.y - NODE_HEIGHT / 2 });
  }
  return result;
}

/** Memoised React wrapper. Re-runs only when the input identity changes. */
export function useDagre<N extends MinimalRFNode, E extends MinimalRFEdge>(
  nodes: readonly N[],
  edges: readonly E[],
): Map<string, { x: number; y: number }> {
  return useMemo(() => layoutWithDagre(nodes, edges), [nodes, edges]);
}
```

- [ ] **Step 4: Run, expect green**

Run: `bun --filter='@archon-studio/core' test useDagre`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/hooks/useDagre.ts \
        packages/studio-core/tests/hooks/useDagre.spec.ts
git commit -m "feat(canvas): layoutWithDagre + useDagre — Archon-equivalent rankdir TB / 80 / 40 layout"
```

---

### Task 34: `usePositionPersistence` — localStorage-backed position map

**Files:**
- Create: `packages/studio-core/src/hooks/usePositionPersistence.ts`
- Create: `packages/studio-core/tests/hooks/usePositionPersistence.spec.ts`

The contract: given a composite key `<archonUrl>::<cwd>::<workflowName>`, expose a `positions: Map<id, {x,y}>`, a `setPosition(id, pos)` action that writes through (debounced 200ms), and a `reset()` that clears the persisted entry. localStorage is the only state — re-reading the key on remount yields the same map. Phase 9 supplies real values for `archonUrl`/`cwd`; Phase 2 uses `__dev__::__dev__::<workflowName>` from the standalone wiring.

**Why debounced:** React Flow fires `onNodesChange` at every animation frame during a drag — we'd thrash the synchronous localStorage write otherwise. Debounce-to-trailing-edge keeps the final drop position. We must also flush on unmount or page hide so a fast click→drag→close doesn't lose the move.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/hooks/usePositionPersistence.spec.ts`:

```ts
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {
  loadPersistedPositions,
  persistPositions,
  positionStorageKey,
} from '../../src/hooks/usePositionPersistence';

beforeEach(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
  globalThis.localStorage.clear();
});

describe('positionStorageKey', () => {
  it('joins archonUrl :: cwd :: workflowName', () => {
    expect(positionStorageKey('http://localhost:3737', '/repos/foo', 'wf-1')).toBe(
      'studio:positions:http://localhost:3737::/repos/foo::wf-1',
    );
  });
});

describe('loadPersistedPositions', () => {
  it('returns empty map when nothing stored', () => {
    expect(loadPersistedPositions('a', 'b', 'c').size).toBe(0);
  });

  it('round-trips a positions map', () => {
    persistPositions(
      'a',
      'b',
      'c',
      new Map([
        ['n1', { x: 100, y: 200 }],
        ['n2', { x: 300, y: 400 }],
      ]),
    );
    const got = loadPersistedPositions('a', 'b', 'c');
    expect(got.get('n1')).toEqual({ x: 100, y: 200 });
    expect(got.get('n2')).toEqual({ x: 300, y: 400 });
  });

  it('returns empty map when stored payload is corrupt JSON', () => {
    globalThis.localStorage.setItem(positionStorageKey('a', 'b', 'c'), 'NOT_JSON');
    expect(loadPersistedPositions('a', 'b', 'c').size).toBe(0);
  });
});

describe('usePositionPersistence (hook)', () => {
  it('does not persist synchronously when setPosition is called', async () => {
    const { usePositionPersistence } = await import('../../src/hooks/usePositionPersistence');
    const { result, unmount } = renderHook(() => usePositionPersistence('u', 'c', 'wf'));
    act(() => {
      result.current.setPosition('n1', { x: 50, y: 60 });
    });
    // setPosition updates in-memory state immediately…
    expect(result.current.positions.get('n1')).toEqual({ x: 50, y: 60 });
    // …but localStorage is still empty (debounced).
    expect(globalThis.localStorage.getItem(positionStorageKey('u', 'c', 'wf'))).toBeNull();
    unmount();
  });

  it('persists after the debounce window elapses', async () => {
    const { usePositionPersistence } = await import('../../src/hooks/usePositionPersistence');
    const { result, unmount } = renderHook(() => usePositionPersistence('u', 'c', 'wf'));
    act(() => {
      result.current.setPosition('n1', { x: 50, y: 60 });
    });
    await new Promise((resolve) => setTimeout(resolve, 250)); // > 200ms debounce
    const raw = globalThis.localStorage.getItem(positionStorageKey('u', 'c', 'wf'));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ n1: { x: 50, y: 60 } });
    unmount();
  });

  it('flushes pending writes on unmount before the debounce expires', async () => {
    const { usePositionPersistence } = await import('../../src/hooks/usePositionPersistence');
    const { result, unmount } = renderHook(() => usePositionPersistence('u', 'c', 'wf'));
    act(() => {
      result.current.setPosition('n1', { x: 11, y: 22 });
    });
    expect(globalThis.localStorage.getItem(positionStorageKey('u', 'c', 'wf'))).toBeNull();
    unmount();
    // Unmount cleanup synchronously calls flush().
    const raw = globalThis.localStorage.getItem(positionStorageKey('u', 'c', 'wf'));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ n1: { x: 11, y: 22 } });
  });

  it('reset() clears state and removes the localStorage entry', async () => {
    const { usePositionPersistence } = await import('../../src/hooks/usePositionPersistence');
    persistPositions('u', 'c', 'wf', new Map([['x', { x: 1, y: 2 }]]));
    const { result, unmount } = renderHook(() => usePositionPersistence('u', 'c', 'wf'));
    expect(result.current.positions.get('x')).toEqual({ x: 1, y: 2 });
    act(() => {
      result.current.reset();
    });
    expect(result.current.positions.size).toBe(0);
    expect(globalThis.localStorage.getItem(positionStorageKey('u', 'c', 'wf'))).toBeNull();
    unmount();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test usePositionPersistence`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `packages/studio-core/src/hooks/usePositionPersistence.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_PREFIX = 'studio:positions:';
const DEBOUNCE_MS = 200;

export function positionStorageKey(archonUrl: string, cwd: string, workflowName: string): string {
  return `${STORAGE_PREFIX}${archonUrl}::${cwd}::${workflowName}`;
}

export function loadPersistedPositions(
  archonUrl: string,
  cwd: string,
  workflowName: string,
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  try {
    const raw = globalThis.localStorage?.getItem(positionStorageKey(archonUrl, cwd, workflowName));
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    for (const [id, pos] of Object.entries(parsed)) {
      if (typeof pos?.x === 'number' && typeof pos?.y === 'number') map.set(id, pos);
    }
  } catch {
    // corrupt payload — ignore, treat as empty
  }
  return map;
}

export function persistPositions(
  archonUrl: string,
  cwd: string,
  workflowName: string,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): void {
  const obj: Record<string, { x: number; y: number }> = {};
  for (const [id, pos] of positions) obj[id] = pos;
  try {
    globalThis.localStorage?.setItem(
      positionStorageKey(archonUrl, cwd, workflowName),
      JSON.stringify(obj),
    );
  } catch {
    // quota / privacy mode — fail silently; positions are non-critical
  }
}

export interface UsePositionPersistence {
  positions: Map<string, { x: number; y: number }>;
  setPosition: (id: string, pos: { x: number; y: number }) => void;
  setMany: (entries: Iterable<[string, { x: number; y: number }]>) => void;
  reset: () => void;
}

export function usePositionPersistence(
  archonUrl: string,
  cwd: string,
  workflowName: string,
): UsePositionPersistence {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(() =>
    loadPersistedPositions(archonUrl, cwd, workflowName),
  );

  // Re-hydrate when the key changes (workflow switch).
  useEffect(() => {
    setPositions(loadPersistedPositions(archonUrl, cwd, workflowName));
  }, [archonUrl, cwd, workflowName]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  const flush = useCallback(() => {
    if (pendingRef.current) {
      persistPositions(archonUrl, cwd, workflowName, pendingRef.current);
      pendingRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [archonUrl, cwd, workflowName]);

  // Flush on unmount and on tab hide so a fast drag→close doesn't lose the move.
  useEffect(() => {
    const onHide = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  const schedule = useCallback(
    (next: Map<string, { x: number; y: number }>) => {
      pendingRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingRef.current) persistPositions(archonUrl, cwd, workflowName, pendingRef.current);
        pendingRef.current = null;
        debounceRef.current = null;
      }, DEBOUNCE_MS);
    },
    [archonUrl, cwd, workflowName],
  );

  const setPosition = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(id, pos);
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  const setMany = useCallback(
    (entries: Iterable<[string, { x: number; y: number }]>) => {
      setPositions((prev) => {
        const next = new Map(prev);
        for (const [id, pos] of entries) next.set(id, pos);
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  const reset = useCallback(() => {
    pendingRef.current = null;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      globalThis.localStorage?.removeItem(positionStorageKey(archonUrl, cwd, workflowName));
    } catch {
      // ignore
    }
    setPositions(new Map());
  }, [archonUrl, cwd, workflowName]);

  return useMemo(
    () => ({ positions, setPosition, setMany, reset }),
    [positions, setPosition, setMany, reset],
  );
}
```

- [ ] **Step 4: Add `@happy-dom/global-registrator` if missing**

Run: `cd packages/studio-core && bun add -d @happy-dom/global-registrator`
Expected: install succeeds; `package.json` records the new devDep.

- [ ] **Step 5: Run, expect green**

Run: `bun --filter='@archon-studio/core' test usePositionPersistence`
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/hooks/usePositionPersistence.ts \
        packages/studio-core/tests/hooks/usePositionPersistence.spec.ts \
        packages/studio-core/package.json bun.lock
git commit -m "feat(canvas): usePositionPersistence — localStorage-backed positions, debounced + flush-on-hide"
```

---

### Task 35: `DagNodeComponent` — Phase-2 unified node renderer

**Files:**
- Create: `packages/studio-core/src/components/DagNodeComponent.tsx`
- Create: `packages/studio-core/src/components/DagNodeComponent.module.css`
- Create: `packages/studio-core/tests/components/DagNodeComponent.spec.tsx`

This is the **single** node renderer for Phase 2. Per-variant Renderers split out in Phase 3. The Phase-2 component reads `data.variant` and `data.label` from `deriveFlow`'s `DagNodeData`, draws a 180×80 card with a 4-px-wide left stripe in `var(--node-<variant>)`, the id label in the body, and a small variant tag in the corner. Two `<Handle>` instances — one `Position.Top` (target), one `Position.Bottom` (source). Single handle pair only — Archon's web builder uses the same convention. Selection/hover styling reads from React Flow's `selected` prop.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/components/DagNodeComponent.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { DagNodeComponent } from '../../src/components/DagNodeComponent';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

const baseProps = {
  id: 'classify',
  type: 'dag',
  selected: false,
  dragging: false,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  zIndex: 0,
};

describe('DagNodeComponent', () => {
  it('renders the id label', () => {
    render(
      <ReactFlowProvider>
        <DagNodeComponent
          {...(baseProps as any)}
          data={{ variant: 'command', storeId: 'classify', label: 'classify' }}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('classify')).toBeDefined();
  });

  it('shows the variant tag', () => {
    render(
      <ReactFlowProvider>
        <DagNodeComponent
          {...(baseProps as any)}
          data={{ variant: 'loop', storeId: 'l', label: 'l' }}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('loop')).toBeDefined();
  });

  it('applies the variant color stripe via CSS variable', () => {
    const { container } = render(
      <ReactFlowProvider>
        <DagNodeComponent
          {...(baseProps as any)}
          data={{ variant: 'approval', storeId: 'gate', label: 'gate' }}
        />
      </ReactFlowProvider>,
    );
    const stripe = container.querySelector('[data-stripe="true"]') as HTMLElement;
    expect(stripe).toBeTruthy();
    expect(stripe.style.background).toContain('--node-approval');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test DagNodeComponent`
Expected: module-not-found.

- [ ] **Step 3: Implement the component**

Create `packages/studio-core/src/components/DagNodeComponent.tsx`:

```tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DagNodeData } from './canvas/deriveFlow';
import styles from './DagNodeComponent.module.css';

function DagNodeComponentInner({ data, selected }: NodeProps<DagNodeData>) {
  return (
    <div
      className={styles.node}
      data-selected={selected ? 'true' : 'false'}
      data-variant={data.variant}
      style={{ width: 180, height: 80 }}
    >
      <div
        className={styles.stripe}
        data-stripe="true"
        style={{ background: `var(--node-${data.variant})` }}
      />
      <div className={styles.body}>
        <div className={styles.label}>{data.label}</div>
        <div className={styles.tag}>{data.variant}</div>
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const DagNodeComponent = memo(DagNodeComponentInner);
```

Create `packages/studio-core/src/components/DagNodeComponent.module.css`:

```css
.node {
  position: relative;
  display: flex;
  background: var(--studio-surface);
  color: var(--studio-fg);
  border: 1px solid var(--studio-muted);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.node[data-selected='true'] {
  border-color: var(--studio-accent);
  box-shadow: 0 0 0 2px var(--studio-accent);
}
.stripe {
  width: 4px;
  flex: 0 0 4px;
  height: 100%;
}
.body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 12px;
  gap: 4px;
  min-width: 0;
}
.label {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--studio-muted);
}
```

- [ ] **Step 4: Add the test-runtime CSS-module + DOM-shim setup**

Bun's test runner doesn't natively understand `.module.css` imports, and happy-dom is missing a couple of browser globals React Flow expects. Add both unconditionally so the test environment is reproducible across machines.

Create `packages/studio-core/bunfig.toml`:

```toml
[test]
preload = ["./tests/setup.ts"]
```

Create `packages/studio-core/tests/setup.ts`:

```ts
import { plugin } from 'bun';

// Stub `.module.css` imports — return a Proxy whose property access yields the key as a string.
// Tests must select by `data-*` attributes, NOT by class name, to stay robust under this stub.
plugin({
  name: 'css-stub',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, () => ({
      loader: 'js',
      contents: 'export default new Proxy({}, { get: (_, k) => k });',
    }));
    // Plain `.css` imports (e.g., '@xyflow/react/dist/style.css') become no-ops.
    build.onLoad({ filter: /\.css$/ }, () => ({
      loader: 'js',
      contents: 'export default {};',
    }));
  },
});

// React Flow uses ResizeObserver for the canvas viewport; happy-dom doesn't ship it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
```

The selectors in the DagNodeComponent test (and every component test in this chunk) use `data-*` attributes precisely because the CSS stub turns `styles.node` into the literal string `'node'` rather than a hashed class — driving tests by data-attrs avoids any disagreement between dev and test resolvers.

- [ ] **Step 5: Run, expect green**

Run: `bun --filter='@archon-studio/core' test DagNodeComponent`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/components/DagNodeComponent.tsx \
        packages/studio-core/src/components/DagNodeComponent.module.css \
        packages/studio-core/tests/components/DagNodeComponent.spec.tsx \
        packages/studio-core/bunfig.toml \
        packages/studio-core/tests/setup.ts
git commit -m "feat(canvas): DagNodeComponent — Phase-2 unified node renderer with variant color stripe"
```

---

### Task 36: `Canvas` — React Flow integration

**Files:**
- Create: `packages/studio-core/src/components/canvas/canvasHandlers.ts` (pure handler factories)
- Create: `packages/studio-core/src/components/Canvas.tsx`
- Create: `packages/studio-core/tests/components/canvas/canvasHandlers.spec.ts`
- Create: `packages/studio-core/tests/components/Canvas.spec.tsx`

`Canvas` is the runtime glue. It selects nodes from the store, runs `deriveFlow`, overlays dagre-computed positions for any node id missing from the persistence map, registers `nodeTypes: { dag: DagNodeComponent }`, and translates React Flow events back to store actions:

- `onConnect({source, target})` → `store.connect(source, target)`
- `onNodesDelete([{id}])` → `store.deleteNodes([id, ...])` (also auto-removes incident edges from store via `deleteNodes`'s built-in dependency cleanup from Phase 1, lines 59-74 of `builder-store.ts`)
- `onEdgesDelete([{source,target}])` → `store.disconnect(source, target)`
- `onNodesChange(changes)` — for `change.type === 'position'` with `change.position` set and `change.dragging === false` (drag end), call `positions.setPosition(change.id, change.position)`. **Crucially, the same handler also forwards every change to React-Flow's internal node state via `applyNodeChanges` so the node moves on screen during the drag** — without this, the node would only jump to its final spot on release. Ignore selection/dimensions in our persistence path; React Flow still applies them internally.

`Canvas` takes a `positions` hook instance (from the parent `WorkflowBuilder`) so it doesn't have to know the composite key. The four event-handler bodies are factored into a separate `canvasHandlers.ts` module as **pure, exported factories** — that's what lets us unit-test the `dragging === false` filter (issue called out by reviewer: regressions here are silent, so a direct test is required).

- [ ] **Step 1: Write the canvasHandlers tests**

Create `packages/studio-core/tests/components/canvas/canvasHandlers.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import {
  makeOnNodesChange,
  makeOnConnect,
  makeOnEdgesDelete,
  makeOnNodesDelete,
} from '../../../src/components/canvas/canvasHandlers';
import type { UsePositionPersistence } from '../../../src/hooks/usePositionPersistence';

const stubPositions = (): UsePositionPersistence & { _calls: unknown[][] } => {
  const map = new Map<string, { x: number; y: number }>();
  const calls: unknown[][] = [];
  return {
    positions: map,
    setPosition: (id, pos) => {
      calls.push(['setPosition', id, pos]);
      map.set(id, pos);
    },
    setMany: (entries) => {
      calls.push(['setMany', entries]);
      for (const [id, p] of entries) map.set(id, p);
    },
    reset: () => {
      calls.push(['reset']);
      map.clear();
    },
    _calls: calls,
  } as UsePositionPersistence & { _calls: unknown[][] };
};

describe('makeOnNodesChange', () => {
  it('persists ONLY for position changes with dragging === false', () => {
    const positions = stubPositions();
    const onChange = makeOnNodesChange(positions);

    onChange([
      // mid-drag: should NOT persist
      { type: 'position', id: 'a', dragging: true, position: { x: 5, y: 5 } } as any,
      // selection / dimensions: should NOT persist
      { type: 'select', id: 'a', selected: true } as any,
      { type: 'dimensions', id: 'a', dimensions: { width: 180, height: 80 } } as any,
      // drag end: SHOULD persist
      { type: 'position', id: 'a', dragging: false, position: { x: 10, y: 20 } } as any,
    ]);

    const setPositionCalls = positions._calls.filter((c) => c[0] === 'setPosition');
    expect(setPositionCalls).toHaveLength(1);
    expect(setPositionCalls[0]).toEqual(['setPosition', 'a', { x: 10, y: 20 }]);
  });

  it('skips position changes that lack a position object', () => {
    const positions = stubPositions();
    const onChange = makeOnNodesChange(positions);
    onChange([{ type: 'position', id: 'a', dragging: false } as any]);
    expect(positions._calls.filter((c) => c[0] === 'setPosition')).toHaveLength(0);
  });
});

describe('makeOnConnect', () => {
  it('calls store.connect with source/target when both present', () => {
    const calls: unknown[] = [];
    const onConnect = makeOnConnect((s, t) => calls.push([s, t]));
    onConnect({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null } as any);
    expect(calls).toEqual([['a', 'b']]);
  });

  it('ignores self-connections and missing endpoints', () => {
    const calls: unknown[] = [];
    const onConnect = makeOnConnect((s, t) => calls.push([s, t]));
    onConnect({ source: 'a', target: 'a' } as any); // self
    onConnect({ source: null, target: 'b' } as any); // missing source
    onConnect({ source: 'a', target: null } as any); // missing target
    expect(calls).toEqual([]);
  });
});

describe('makeOnEdgesDelete', () => {
  it('calls store.disconnect once per edge', () => {
    const calls: unknown[] = [];
    const onDelete = makeOnEdgesDelete((s, t) => calls.push([s, t]));
    onDelete([
      { id: 'a->b', source: 'a', target: 'b' } as any,
      { id: 'a->c', source: 'a', target: 'c' } as any,
    ]);
    expect(calls).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  });
});

describe('makeOnNodesDelete', () => {
  it('calls store.deleteNodes with the array of ids', () => {
    const calls: unknown[] = [];
    const onDelete = makeOnNodesDelete((ids) => calls.push(ids));
    onDelete([{ id: 'a' } as any, { id: 'b' } as any]);
    expect(calls).toEqual([['a', 'b']]);
  });
});
```

- [ ] **Step 2: Implement the handler factories**

Create `packages/studio-core/src/components/canvas/canvasHandlers.ts`:

```ts
import type { Connection, NodeChange, Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { UsePositionPersistence } from '../../hooks/usePositionPersistence';

/**
 * Pure factory returning an `onNodesChange` callback that persists drag-end positions.
 * Note: this handler ONLY tracks persistence — Canvas separately forwards every change
 * to React Flow's internal state via `applyNodeChanges` so the in-flight drag renders.
 */
export function makeOnNodesChange(positions: UsePositionPersistence) {
  return (changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type !== 'position') continue;
      if (c.dragging !== false) continue; // ignore mid-drag frames
      if (!c.position) continue;
      positions.setPosition(c.id, c.position);
    }
  };
}

export function makeOnConnect(connect: (source: string, target: string) => void) {
  return (conn: Connection) => {
    if (!conn.source || !conn.target) return;
    if (conn.source === conn.target) return;
    connect(conn.source, conn.target);
  };
}

export function makeOnEdgesDelete(disconnect: (source: string, target: string) => void) {
  return (edges: RFEdge[]) => {
    for (const e of edges) disconnect(e.source, e.target);
  };
}

export function makeOnNodesDelete(deleteNodes: (ids: string[]) => void) {
  return (nodes: RFNode[]) => {
    deleteNodes(nodes.map((n) => n.id));
  };
}
```

- [ ] **Step 3: Run handler tests, expect green**

Run: `bun --filter='@archon-studio/core' test canvasHandlers`
Expected: 6 passing.

- [ ] **Step 4: Write the Canvas component tests**

Create `packages/studio-core/tests/components/Canvas.spec.tsx`:

```tsx
import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { Canvas } from '../../src/components/Canvas';
import { useBuilderStore } from '../../src/store/builder-store';
import type { UsePositionPersistence } from '../../src/hooks/usePositionPersistence';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  globalThis.localStorage?.clear();
});

const stubPositionsHook = (): UsePositionPersistence & { _calls: unknown[][] } => {
  const map = new Map<string, { x: number; y: number }>();
  const calls: unknown[][] = [];
  return {
    positions: map,
    setPosition: (id, pos) => {
      calls.push(['setPosition', id, pos]);
      map.set(id, pos);
    },
    setMany: (entries) => {
      const arr = Array.from(entries);
      calls.push(['setMany', arr]);
      for (const [id, p] of arr) map.set(id, p);
    },
    reset: () => {
      calls.push(['reset']);
      map.clear();
    },
    _calls: calls,
  } as UsePositionPersistence & { _calls: unknown[][] };
};

const seedTwoNodes = () => {
  useBuilderStore.getState().loadWorkflow({
    meta: { name: 'w', description: 'd', base: {}, unknown: {} },
    nodes: [
      { id: 'a', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} },
      {
        id: 'b',
        variant: 'command',
        data: { command: 'bar' },
        base: { depends_on: ['a'] },
        unknown: {},
      },
    ],
  });
};

describe('Canvas', () => {
  it('renders one DagNodeComponent per store node', () => {
    seedTwoNodes();
    const positions = stubPositionsHook();
    render(
      <ReactFlowProvider>
        <Canvas positions={positions} />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('a')).toBeDefined();
    expect(screen.getByText('b')).toBeDefined();
  });

  it('seeds dagre positions for nodes missing from the persistence map', () => {
    seedTwoNodes();
    const positions = stubPositionsHook();
    render(
      <ReactFlowProvider>
        <Canvas positions={positions} />
      </ReactFlowProvider>,
    );
    const setManyCall = positions._calls.find((c) => c[0] === 'setMany');
    expect(setManyCall).toBeDefined();
    const entries = setManyCall![1] as [string, { x: number; y: number }][];
    expect(entries.map(([id]) => id).sort()).toEqual(['a', 'b']);
  });

  it('does not re-seed nodes that already have a persisted position', () => {
    seedTwoNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 999, y: 999 });
    render(
      <ReactFlowProvider>
        <Canvas positions={positions} />
      </ReactFlowProvider>,
    );
    const setManyCall = positions._calls.find((c) => c[0] === 'setMany');
    if (setManyCall) {
      const entries = setManyCall[1] as [string, { x: number; y: number }][];
      const ids = entries.map(([id]) => id);
      expect(ids).not.toContain('a');
      expect(ids).toContain('b');
    }
  });
});
```

(Deeper interaction tests — onConnect, onNodesDelete fired through React Flow's internal pointer events — are brittle in happy-dom; Phase 10's Playwright suite covers those end-to-end. Phase 2 verifies the handler logic via `canvasHandlers.spec.ts` and trusts React Flow's prop wiring.)

- [ ] **Step 5: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test Canvas`
Expected: module-not-found.

- [ ] **Step 6: Implement `Canvas`**

Create `packages/studio-core/src/components/Canvas.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  type NodeChange,
  type NodeProps,
  type Node as RFNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useBuilderStore } from '../store/builder-store';
import { deriveFlow, type DagNodeData } from './canvas/deriveFlow';
import { layoutWithDagre } from '../hooks/useDagre';
import type { UsePositionPersistence } from '../hooks/usePositionPersistence';
import { DagNodeComponent } from './DagNodeComponent';
import {
  makeOnNodesChange,
  makeOnConnect,
  makeOnEdgesDelete,
  makeOnNodesDelete,
} from './canvas/canvasHandlers';

const NODE_TYPES = { dag: DagNodeComponent as React.FC<NodeProps<DagNodeData>> };

export interface CanvasProps {
  /** Position-persistence handle. WorkflowBuilder constructs the real one; tests pass a stub. */
  positions: UsePositionPersistence;
}

export function Canvas({ positions }: CanvasProps) {
  const storeNodes = useBuilderStore((s) => s.nodes);
  const connect = useBuilderStore((s) => s.connect);
  const disconnect = useBuilderStore((s) => s.disconnect);
  const deleteNodes = useBuilderStore((s) => s.deleteNodes);

  // Derive RF nodes/edges from the store. `deriveFlow` returns {x:0,y:0} for
  // any node missing from the persistence map; we overlay seeded/persisted
  // positions when rendering below.
  const { rfNodes: derivedNodes, rfEdges } = useMemo(
    () => deriveFlow(storeNodes, positions.positions),
    [storeNodes, positions.positions],
  );

  // Local in-flight node array for React Flow. We hydrate it from `derivedNodes`
  // whenever the *set* of node ids changes (load, add, delete) but otherwise let
  // applyNodeChanges drive it during drag/select so the canvas stays smooth.
  const [rfNodes, setRfNodes] = useState<RFNode<DagNodeData>[]>(derivedNodes);

  const idsKey = useMemo(() => storeNodes.map((n) => n.id).join(' '), [storeNodes]);

  useEffect(() => {
    setRfNodes(
      derivedNodes.map((n) => ({
        ...n,
        position: positions.positions.get(n.id) ?? n.position,
      })),
    );
    // We only re-hydrate when the set of ids changes; updates to an existing
    // node's position go through applyNodeChanges instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Seed dagre-computed positions for any node id NOT already in the map.
  // setMany is debounced inside the persistence hook so this writes once.
  // FRAGILITY (Phase 3+): when a node is added mid-session, dagre re-lays out
  // every node assuming UNMAPPED ones sit at {0,0}. For Phase 2 (single load,
  // no add) this is fine; Phase 3's NodeLibrary will need to feed dagre the
  // currently-persisted positions as fixed anchors (or only lay out the new
  // subgraph). Track this as a Phase-3 prerequisite.
  useEffect(() => {
    const missing = derivedNodes.filter((n) => !positions.positions.has(n.id));
    if (missing.length === 0) return;
    const laid = layoutWithDagre(derivedNodes, rfEdges);
    const newEntries: [string, { x: number; y: number }][] = missing
      .map((n) => [n.id, laid.get(n.id)] as const)
      .filter((entry): entry is [string, { x: number; y: number }] => entry[1] !== undefined);
    if (newEntries.length > 0) positions.setMany(newEntries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Persistence hook — drag-end only. Pure factory tested in canvasHandlers.spec.ts.
  const persistOnNodesChange = useMemo(() => makeOnNodesChange(positions), [positions]);

  // Forward every change to React Flow's internal state AND record drag-end persistence.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((prev) => applyNodeChanges(changes, prev));
      persistOnNodesChange(changes);
    },
    [persistOnNodesChange],
  );

  const onConnect = useMemo(() => makeOnConnect(connect), [connect]);
  const onEdgesDelete = useMemo(() => makeOnEdgesDelete(disconnect), [disconnect]);
  const onNodesDelete = useMemo(() => makeOnNodesDelete(deleteNodes), [deleteNodes]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onEdgesDelete={onEdgesDelete}
      onNodesDelete={onNodesDelete}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
```

- [ ] **Step 7: Run, expect green**

Run: `bun --filter='@archon-studio/core' test Canvas`
Expected: 3 passing. (`tests/setup.ts` from Task 35 already provides the `ResizeObserver` shim.)

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/src/components/Canvas.tsx \
        packages/studio-core/src/components/canvas/canvasHandlers.ts \
        packages/studio-core/tests/components/Canvas.spec.tsx \
        packages/studio-core/tests/components/canvas/canvasHandlers.spec.ts
git commit -m "feat(canvas): Canvas + canvasHandlers — drag renders via applyNodeChanges, drag-end persists"
```

---

### Task 37: `WorkflowBuilder` shell + `Toolbar` skeleton + public exports

**Files:**
- Create: `packages/studio-core/src/components/WorkflowBuilder.tsx`
- Create: `packages/studio-core/src/components/WorkflowBuilder.module.css`
- Create: `packages/studio-core/src/components/Toolbar.tsx`
- Create: `packages/studio-core/src/components/StudioErrorBoundary.tsx`
- Create: `packages/studio-core/tests/components/WorkflowBuilder.spec.tsx`
- Modify: `packages/studio-core/src/index.ts` (export `WorkflowBuilder` + props)

The shell receives a `client` (a `WorkflowApiClient`), a `theme` preset, an `archonUrl`, a `cwd`, and a `workflowName` (the loaded workflow's identity for position-keying purposes). It mounts the providers and lays out a CSS-grid: header (Toolbar, 56px), three columns (NodeLibrary slot 240px / Canvas / NodeInspector slot 320px), bottom (ValidationPanel slot 0px in Phase 2 — it'll grow when Phase 6 lands). Phase 2 leaves the library/inspector/validation slots as empty `<aside>` placeholders so the layout looks like the eventual product even when the only working part is the canvas.

- [ ] **Step 1: Write failing tests**

Create `packages/studio-core/tests/components/WorkflowBuilder.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { WorkflowBuilder } from '../../src/components/WorkflowBuilder';
import { useBuilderStore } from '../../src/store/builder-store';
import type { WorkflowApiClient } from '../../src/api/WorkflowApiClient';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  globalThis.localStorage?.clear();
});

const noopClient: WorkflowApiClient = {
  ping: async () => ({ ok: true }),
  listCodebases: async () => null,
  listWorkflows: async () => [],
  listCommands: async () => [],
  listProviders: async () => [],
  getWorkflow: async () => ({ name: 'noop', description: '', nodes: [] }) as unknown as never,
  saveWorkflow: async (_n, _c, d) => d,
  deleteWorkflow: async () => undefined,
  validateWorkflow: async () => ({ valid: true }),
};

describe('WorkflowBuilder', () => {
  it('renders the layout shell with toolbar / canvas / library + inspector slots', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'demo', description: '', base: {}, unknown: {} },
      nodes: [
        { id: 'only', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} },
      ],
    });
    render(
      <WorkflowBuilder
        client={noopClient}
        theme="archon-dark"
        archonUrl="__dev__"
        cwd="__dev__"
        workflowName="demo"
      />,
    );
    expect(screen.getByText('demo')).toBeDefined(); // toolbar shows name
    expect(screen.getByText('only')).toBeDefined(); // canvas renders the node
    expect(screen.getByLabelText('Node library')).toBeDefined();
    expect(screen.getByLabelText('Node inspector')).toBeDefined();
  });

  it('Reset layout button drops persisted positions and re-runs dagre', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'demo', description: '', base: {}, unknown: {} },
      nodes: [
        { id: 'only', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} },
      ],
    });
    // Pre-seed a hand-tweaked position via localStorage
    globalThis.localStorage.setItem(
      'studio:positions:__dev__::__dev__::demo',
      JSON.stringify({ only: { x: 999, y: 999 } }),
    );
    render(
      <WorkflowBuilder
        client={noopClient}
        theme="archon-dark"
        archonUrl="__dev__"
        cwd="__dev__"
        workflowName="demo"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reset layout/i }));
    expect(globalThis.localStorage.getItem('studio:positions:__dev__::__dev__::demo')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test WorkflowBuilder`
Expected: module-not-found.

- [ ] **Step 3: Implement `StudioErrorBoundary`**

Create `packages/studio-core/src/components/StudioErrorBoundary.tsx`:

```tsx
import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class StudioErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[StudioErrorBoundary]', error);
  }

  render() {
    if (this.state.error) {
      // Phase 8 expands this with workflow-JSON copy-out and an issue link.
      return (
        <div role="alert" style={{ padding: 24, color: 'var(--studio-error)' }}>
          <h2>Studio crashed</h2>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Implement `Toolbar`**

Create `packages/studio-core/src/components/Toolbar.tsx`:

```tsx
export interface ToolbarProps {
  workflowName: string;
  onResetLayout: () => void;
}

export function Toolbar({ workflowName, onResetLayout }: ToolbarProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 16px',
        background: 'var(--studio-surface)',
        borderBottom: '1px solid var(--studio-muted)',
      }}
    >
      <strong style={{ flex: 1 }}>{workflowName}</strong>
      <button
        type="button"
        onClick={onResetLayout}
        style={{
          background: 'transparent',
          color: 'var(--studio-fg)',
          border: '1px solid var(--studio-muted)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 8px',
          cursor: 'pointer',
        }}
      >
        Reset layout
      </button>
    </header>
  );
}
```

- [ ] **Step 4.5: Verify Phase-0 provider exports match what `WorkflowBuilder` will import**

Two preconditions for Step 5 to compile cleanly. Run them now and fix root causes if either fails.

1. Confirm `ThemePreset` is a named export of `theme/ThemeProvider.tsx`:

```bash
grep -nE "^export type \{?\s*ThemePreset|^export type ThemePreset" \
     packages/studio-core/src/theme/ThemeProvider.tsx
```

Expected: a hit. If absent (e.g., the type is exported under a different name like `Preset`, or inlined), update `theme/ThemeProvider.tsx` to add `export type { ThemePreset }` rather than working around it in `WorkflowBuilder.tsx` — keep the public name stable.

2. Confirm `ApiClientProvider` does NOT internally consume `useQueryClient` (the order `QueryClientProvider → ApiClientProvider` in Step 5 is only safe if the API provider is independent of the query client; if it's the other way around the nesting is reversed):

```bash
grep -n "useQueryClient\|@tanstack/react-query" \
     packages/studio-core/src/api/ApiClientProvider.tsx
```

Expected: no hits. If there ARE hits (Phase 0 may have wired them), swap the nesting in Step 5 so `ApiClientProvider` sits inside `QueryClientProvider` regardless. Re-read the file to confirm before proceeding.

- [ ] **Step 5: Implement `WorkflowBuilder`**

Create `packages/studio-core/src/components/WorkflowBuilder.module.css`:

```css
.shell {
  display: grid;
  grid-template-rows: 56px 1fr;
  grid-template-columns: 240px 1fr 320px;
  grid-template-areas:
    'toolbar  toolbar  toolbar'
    'library  canvas   inspector';
  height: 100%;
  width: 100%;
  background: var(--studio-bg);
  color: var(--studio-fg);
}
.toolbar { grid-area: toolbar; }
.library { grid-area: library; border-right: 1px solid var(--studio-muted); }
.canvas { grid-area: canvas; min-width: 0; min-height: 0; }
.inspector { grid-area: inspector; border-left: 1px solid var(--studio-muted); }
```

Create `packages/studio-core/src/components/WorkflowBuilder.tsx`:

```tsx
import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ApiClientProvider } from '../api/ApiClientProvider';
import { ThemeProvider, type ThemePreset } from '../theme/ThemeProvider';
import type { WorkflowApiClient } from '../api/WorkflowApiClient';
import { useBuilderStore } from '../store/builder-store';
import { usePositionPersistence } from '../hooks/usePositionPersistence';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import { StudioErrorBoundary } from './StudioErrorBoundary';
import styles from './WorkflowBuilder.module.css';

export interface WorkflowBuilderProps {
  client: WorkflowApiClient;
  theme: ThemePreset;
  /** Used to key persisted positions. In dev/standalone Phase 2, pass `__dev__`. */
  archonUrl: string;
  cwd: string;
  /** The current workflow's name — also used for position keying. */
  workflowName: string;
}

export function WorkflowBuilder({
  client,
  theme,
  archonUrl,
  cwd,
  workflowName,
}: WorkflowBuilderProps) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const positions = usePositionPersistence(archonUrl, cwd, workflowName);
  const storeName = useBuilderStore((s) => s.workflow?.name ?? workflowName);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={client}>
        <ThemeProvider preset={theme}>
          <StudioErrorBoundary>
            <div className={styles.shell}>
              <div className={styles.toolbar}>
                <Toolbar workflowName={storeName} onResetLayout={positions.reset} />
              </div>
              <aside className={styles.library} aria-label="Node library">
                {/* Phase 3 fills in NodeLibrary */}
              </aside>
              <main className={styles.canvas}>
                <ReactFlowProvider>
                  <Canvas positions={positions} />
                </ReactFlowProvider>
              </main>
              <aside className={styles.inspector} aria-label="Node inspector">
                {/* Phase 4 fills in NodeInspector */}
              </aside>
            </div>
          </StudioErrorBoundary>
        </ThemeProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Add the public exports**

Edit `packages/studio-core/src/index.ts`. Add:

```ts
export { WorkflowBuilder, type WorkflowBuilderProps } from './components/WorkflowBuilder';
```

Keep all existing exports.

- [ ] **Step 7: Run, expect green**

Run: `bun --filter='@archon-studio/core' test WorkflowBuilder`
Expected: 2 passing.

- [ ] **Step 8: Build the package**

Run: `bun --filter='@archon-studio/core' run build`
Expected: `tsc --noEmit` passes (no type errors).

- [ ] **Step 9: Commit**

```bash
git add packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/src/components/WorkflowBuilder.module.css \
        packages/studio-core/src/components/Toolbar.tsx \
        packages/studio-core/src/components/StudioErrorBoundary.tsx \
        packages/studio-core/src/index.ts \
        packages/studio-core/tests/components/WorkflowBuilder.spec.tsx
git commit -m "feat(builder): WorkflowBuilder shell, Toolbar skeleton, error boundary"
```

---

### Task 38: `StubArchonApiClient` for the standalone shell

**Files:**
- Create: `packages/studio-api-archon/src/StubArchonApiClient.ts`
- Modify: `packages/studio-api-archon/src/index.ts` (re-export the stub)
- Modify: `packages/studio-api-archon/package.json` (add `@archon-studio/fixtures` workspace dep — needed to resolve fixture YAML at runtime)

The stub satisfies `WorkflowApiClient` end-to-end without an Archon process. `getWorkflow(name)` reads the bundled YAML for that fixture name and parses it; `listWorkflows` returns one canned `[{workflow, source: 'bundled'}]`. The standalone uses this in Phase 2; Phase 9 swaps to the real `ArchonApiClient`.

**Layering note (read before writing code):** `WorkflowDefinition` is the *Zod-validated, schema-typed* shape. Parsing YAML produces an `unknown`-shaped JavaScript object. We do NOT cast `parsed as WorkflowDefinition` — that's a lie the type system will let through but the round-trip importer (Phase 1) will surface as a runtime mismatch on a malformed fixture. Instead, pipe through `workflowDefinitionSchema.safeParse` so the stub either returns a real `WorkflowDefinition` or throws a typed error. This matches the spec's §6.3 forward-compat model: unknowns survive at the *node* level via `_unknown`, but the workflow envelope must satisfy the schema or fail loudly.

- [ ] **Step 0: Verify `@archon-studio/core` re-exports the names this file imports**

Confirm these are public exports of `@archon-studio/core` (via `packages/studio-core/src/index.ts`):

```bash
grep -nE "^export (\{|type \{)[^}]*(WorkflowDefinition|CodebaseInfo|WorkflowListItem|ValidateResult|WorkflowApiClient)" \
     packages/studio-core/src/index.ts
```

Expected: hits for all five names. If any are missing, add the relevant `export type {…}` line(s) to `packages/studio-core/src/index.ts` BEFORE writing the stub. (Phase 0/1 should already cover this — `WorkflowApiClient` was added in Phase 0, the others in Phase 1's schema mirror.)

Additionally, confirm `workflowDefinitionSchema` is exported (Step 3 needs it for runtime validation):

```bash
grep -nE "workflowDefinitionSchema" packages/studio-core/src/schemas/workflow.ts \
     packages/studio-core/src/schemas/index.ts packages/studio-core/src/index.ts
```

Expected: a hit in `schemas/workflow.ts` (Phase 0 mirror) and at least a re-export from `schemas/index.ts`. If `src/index.ts` doesn't surface it, add `export { workflowDefinitionSchema } from './schemas';` so the stub can import it.

- [ ] **Step 1: Add the workspace dep**

Edit `packages/studio-api-archon/package.json`. Add to `dependencies`:

```json
"@archon-studio/fixtures": "workspace:*",
"yaml": "2.5.1"
```

- [ ] **Step 2: Reinstall to pick up the workspace edge**

Run: `bun install`
Expected: succeeds; `bun.lock` updated with the new edge.

- [ ] **Step 3: Implement the stub**

Create `packages/studio-api-archon/src/StubArchonApiClient.ts`:

```ts
import { parse as parseYaml } from 'yaml';
import { loadRoundTripFixture } from '@archon-studio/fixtures';
import { workflowDefinitionSchema } from '@archon-studio/core';
import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
  WorkflowDefinition,
} from '@archon-studio/core';

/**
 * Phase-2 stub. Resolves `getWorkflow` from the bundled round-trip fixtures.
 * The real `ArchonApiClient` lands in Phase 9.
 */
export class StubArchonApiClient implements WorkflowApiClient {
  async ping(): Promise<{ ok: true; serverVersion?: string }> {
    return { ok: true, serverVersion: 'stub' };
  }
  async listCodebases(): Promise<CodebaseInfo[] | null> {
    return null; // simulates an Archon that doesn't expose the endpoint
  }
  async listWorkflows(_cwd: string): Promise<WorkflowListItem[]> {
    return [];
  }
  async listCommands(
    _cwd: string,
  ): Promise<{ name: string; source: 'project' | 'global' | 'bundled' }[]> {
    return [];
  }
  async listProviders(): Promise<{ id: string; capabilities: Record<string, boolean> }[]> {
    return [];
  }
  async getWorkflow(name: string, _cwd: string): Promise<WorkflowDefinition> {
    const yamlText = loadRoundTripFixture(name);
    const parsed: unknown = parseYaml(yamlText);
    const result = workflowDefinitionSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `StubArchonApiClient.getWorkflow('${name}'): fixture failed schema validation — ${result.error.message}`,
      );
    }
    return result.data;
  }
  async saveWorkflow(
    _name: string,
    _cwd: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    return definition;
  }
  async deleteWorkflow(_name: string, _cwd: string): Promise<void> {
    return undefined;
  }
  async validateWorkflow(_definition: WorkflowDefinition): Promise<ValidateResult> {
    return { valid: true };
  }
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Edit `packages/studio-api-archon/src/index.ts`. Make sure both clients are exported:

```ts
export { ArchonApiClient } from './ArchonApiClient';
export type { ArchonApiClientOptions } from './ArchonApiClient';
export { StubArchonApiClient } from './StubArchonApiClient';
```

(If a different name is used, check the existing file — the line count of this task assumes a one-liner. If `index.ts` doesn't yet exist, create it.)

- [ ] **Step 5: Build the package**

Run: `bun --filter='@archon-studio/api-archon' run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-api-archon/src/StubArchonApiClient.ts \
        packages/studio-api-archon/src/index.ts \
        packages/studio-api-archon/package.json bun.lock
git commit -m "feat(api-archon): StubArchonApiClient — fixture-backed client for the standalone shell"
```

---

### Task 39: Wire `apps/standalone` to mount `WorkflowBuilder`

**Files:**
- Modify: `apps/standalone/src/App.tsx` (replace the placeholder)
- Modify: `apps/standalone/src/index.css` (no changes expected — verify only)
- Modify: `apps/standalone/package.json` (no changes expected — verify deps already have `@archon-studio/api-archon`, `@archon-studio/fixtures`)

The standalone's job in Phase 2 is to demonstrate the editor running locally, not to navigate. Single page: load the smoke fixture via the stub, hydrate the store with `fromWorkflowDefinition`, mount `WorkflowBuilder`. Once Phase 9 lands, this file is replaced with a real route tree. Until then, this is the smoke harness.

- [ ] **Step 1: Replace `App.tsx`**

Replace the contents of `apps/standalone/src/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { WorkflowBuilder, fromWorkflowDefinition, useBuilderStore } from '@archon-studio/core';
import { StubArchonApiClient } from '@archon-studio/api-archon';

const FIXTURE_NAME = '_smoke-pi-all-nodes';
const client = new StubArchonApiClient();

export function App() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const def = await client.getWorkflow(FIXTURE_NAME, '/dev');
      if (cancelled) return;
      // The cast is a structural no-op: WorkflowDefinition is shaped as
      // Record<string, unknown> at runtime (Zod-validated, but not branded).
      // Phase 1's `fromWorkflowDefinition` accepts the loose type so the same
      // importer handles untrusted parsed JSON. Phase 9 may tighten by giving
      // the importer an overload that accepts WorkflowDefinition directly.
      const input = fromWorkflowDefinition(def as Record<string, unknown>);
      useBuilderStore.getState().loadWorkflow(input);
      setLoaded(true);
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[standalone] fixture load failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <div style={{ padding: 24, color: 'var(--studio-fg)' }}>
        Loading {FIXTURE_NAME}…
      </div>
    );
  }

  return (
    <WorkflowBuilder
      client={client}
      theme="archon-dark"
      archonUrl="__dev__"
      cwd="__dev__"
      workflowName={FIXTURE_NAME}
    />
  );
}
```

- [ ] **Step 2: Re-export `fromWorkflowDefinition` and `useBuilderStore` from studio-core**

The current `studio-core/src/index.ts` doesn't export these. Add to the existing file (preserve the existing exports):

```ts
export { fromWorkflowDefinition } from './exporter/fromWorkflowDefinition';
export { toWorkflowDefinition } from './exporter/toWorkflowDefinition';
export { useBuilderStore } from './store/builder-store';
export type {
  BuilderState,
  WorkflowMeta,
  LoadWorkflowInput,
} from './store/builder-store';
```

(The hook is the easiest way for the standalone to seed the store. Phase 9 will introduce a higher-level `useLoadWorkflow` query and we can drop this surface — but for Phase 2, exposing the store hook is the right amount of API.)

- [ ] **Step 3: Build the standalone**

Run: `bun --filter='@archon-studio/standalone' run build`
Expected: tsc passes; Vite bundle written to `apps/standalone/dist/`.

If type errors flag on `parsing` `def` as `Record<string, unknown>`, the cast in the `fromWorkflowDefinition` call resolves them. Leave any other errors visible — fix root causes.

- [ ] **Step 4: Run the dev server (background)**

Run (background): `bun --filter='@archon-studio/standalone' run dev`
Expected: Vite prints "Local: http://localhost:5173/" within ~2 seconds. Leave it running for the next task.

- [ ] **Step 5: Commit**

```bash
git add apps/standalone/src/App.tsx packages/studio-core/src/index.ts
git commit -m "feat(standalone): mount WorkflowBuilder against StubArchonApiClient with the smoke fixture"
```

---

### Task 40: Manual visual smoke

**Files:** none

This task is the human-eyes verification that Phase 2 actually delivered a working canvas. Skip is not an option — automated tests cover unit behaviour, but only the eyes catch "the canvas is invisible because flex collapsed" or "the dagre layout overlapped two nodes."

- [ ] **Step 1: Open the dev URL**

If you have the `agent-browser` or `browse` skill, invoke it now to open `http://localhost:5173/`. Otherwise, open the URL in any modern browser.

- [ ] **Step 2: Visual checks**

Confirm by looking:

1. The page has a dark background (`archon-dark` preset is applied).
2. Top header shows `_smoke-pi-all-nodes` and a "Reset layout" button.
3. Left aside is a thin empty column with a right border.
4. Right aside is a slightly wider empty column with a left border.
5. Center area has React Flow's canvas: the smoke fixture's nodes are visible, laid out top-to-bottom, parents above children.
6. Each node card has a colored stripe on the left (commands green, prompt purple, bash orange, loop yellow, etc. — matches `tokens.css`).
7. Each node shows its id label and a small `command` / `prompt` / `loop` / `bash` / `script` tag.
8. Edges are rendered as smooth curves. Edges into nodes that have a `when:` field are dashed and purple.
9. Bottom-left has React Flow's controls (zoom in/out/fit/lock).

- [ ] **Step 3: Drag a node**

Click and drag any node ~100 px in either direction. Release. Confirm the node stays where you dropped it — no snap-back.

- [ ] **Step 4: Reload the page**

Hard reload (Ctrl/Cmd-Shift-R). Confirm the dragged node is back in its dropped position, not snapped to a fresh dagre layout.

- [ ] **Step 5: Click "Reset layout"**

Confirm the dragged node returns to its dagre-computed position. Reload again — confirm the node stays at the dagre position (because reset cleared the localStorage key).

- [ ] **Step 6: Connect / disconnect**

Drag from the bottom handle of any node onto the top handle of another. Confirm a new edge appears. Right-click or select-and-press-Delete on an edge — confirm it disappears. Optionally, open devtools and run `useBuilderStore.getState().nodes.find(n=>n.id==='<target>').base.depends_on` to confirm the store mirrors the visual change.

- [ ] **Step 7: Delete a node**

Select a node (click), press Delete or Backspace. Confirm the node disappears AND any edges into it disappear. Confirm via store: `useBuilderStore.getState().nodes.length` decreased by 1 and no surviving node has the deleted id in its `depends_on`.

- [ ] **Step 8: Optional — capture a screenshot**

If the `browse` skill is available, save a screenshot to `docs/superpowers/specs/phase-2-smoke.png` for posterity. (Don't commit large binary if the repo's policy prefers external storage — check `.gitignore` first.)

- [ ] **Step 9: Stop the dev server**

Cancel the background process (the runtime offers a "kill" affordance per the long-running command UI).

If any of Steps 2–7 fail, **do not move on**. Diagnose:
- Blank canvas → React Flow's parent has no height. Confirm `WorkflowBuilder.module.css`'s grid `min-height` propagates from `apps/standalone/src/index.css`'s `#root { height: 100% }`.
- Nodes overlap perfectly → `useDagre`'s setNode call missed `width`/`height` (Task 33 step 3 — re-read).
- Edges missing → `deriveFlow`'s `knownIds` filter is dropping valid sources. Inspect `storeNodes` in devtools.
- Drag doesn't persist → `Canvas`'s `onNodesChange` isn't filtering on `dragging === false`; it's catching the wrong frame.

---

### Task 41: Phase 2 verification — full local + CI green, push, tag

**Files:** none

Same shape as Task 31 (Phase 1 verification). All-green guard before tagging.

- [ ] **Step 1: Run the full local pipeline**

Run:
```bash
bun --filter='*' run build
bun --filter='*' run test
bun run check-schema-drift
```

If any step fails, fix root cause; do not paper over.

- [ ] **Step 2: Push to origin/main**

```bash
git push origin main
```

Verify the `CI` and `round-trip` workflows go green on GitHub Actions before tagging.

- [ ] **Step 3: Tag**

```bash
git tag -a phase-2 -m "Phase 2: Canvas + DagNode + position persistence + WorkflowBuilder shell + standalone smoke"
git push origin phase-2
```

- [ ] **Step 4: Update Phase 2 deliverables checklist below**

---

## Phase 2 deliverables checklist

- [x] `deriveFlow` pure store→React-Flow projection with when-aware edge styling (Task 32)
- [x] `layoutWithDagre` + `useDagre` matching Archon's `rankdir TB / 80 / 40` settings (Task 33)
- [x] `usePositionPersistence` localStorage-backed positions, debounced + flush-on-hide, with `reset()` (Task 34)
- [x] `DagNodeComponent` Phase-2 unified renderer (variant color stripe, top/bottom handles, label + tag) (Task 35)
- [x] `Canvas` React Flow integration: store-driven render, dagre seeding, drag persists, connect/disconnect/delete mutate store (Task 36)
- [x] `WorkflowBuilder` shell + `Toolbar` skeleton + `StudioErrorBoundary` + public exports (Task 37)
- [x] `StubArchonApiClient` — constructor takes injectable `loadFixture` instead of importing `@archon-studio/fixtures` directly (deviation from plan: fixtures uses `node:fs`/`url` at top level and can't be bundled by Vite; documented in commit 17c1ed4) (Task 38)
- [x] `apps/standalone` mounts `WorkflowBuilder` against the stub, loads the smoke fixture via Vite `?raw` import (Task 39)
- [x] Manual visual smoke passed — drag, reload, reset, connect/disconnect, delete confirmed by user (Task 40)
- [x] Full local pipeline green (build + test + schema-drift); `phase-2` tag to be pushed (Task 41)

---

## Chunk 5: Phase 3 — NodeLibrary + per-variant Renderers + snippets

**Goal of this chunk:** The studio looks like the §5.1 spec mockup. Every variant renders distinctly on the canvas (loop with iteration cap, approval orange, cancel red, etc.). The left rail (`NodeLibrary`) ships with quick-add tiles per variant, a commands list pulled from `WorkflowApiClient.listCommands`, and a snippets section that inserts pre-authored subgraphs into the existing graph. Three starter snippets (curated bundled defaults) and three pattern fragments (classify-then-branch, fan-out-collect, loop-until-signal) ship in `studio-fixtures/snippets/`.

**Definition of done for Phase 3:**
- All 7 variants have their own `Renderer.tsx` registered in `VariantDefinition`. The Phase-2 `DagNodeComponent` is gone (its visuals live in a shared `NodeShell` primitive used by every variant Renderer).
- React Flow's `nodeTypes` is built from the registry; `deriveFlow` emits `type: <variant>` and passes the full `BuilderNode` through on `data`.
- `NodeLibrary` renders three sections (Variants / Commands / Snippets) with click-to-add and HTML5 drag-from-library; Canvas decodes a unified drag payload type and calls store actions to mount the new node(s).
- `makeUniqueId(hint, existingIds)` is a pure tested helper used by drag-drop, click-to-add, and snippet insertion.
- `insertSnippet` runs the existing importer, auto-renames id collisions (cascading through `depends_on` / `when:` / body refs), translates positions to anchor near viewport center, and seeds the persisted positions map so dagre doesn't re-lay-out on next render.
- Snippet YAML files in `packages/studio-fixtures/src/snippets/{starters,patterns}/` parse cleanly through `fromWorkflowDefinition` (validated by a small fixture-validity test).
- Manual visual smoke passes — open standalone, see all 7 variants distinct in the library; drag a tile to canvas; click a command row; insert a snippet; everything persists across reload.
- All local + remote CI green; round-trip test still passes for all bundled defaults; `phase-3` tag pushed.

**Reference skills if you get stuck:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`.

**Standing assumptions for this chunk:**
- Phase 2 is **planned but unexecuted at the time this chunk was written**. If Phase 2 has been executed by the time you reach this chunk, the file paths and shapes described here will already exist on disk; if it hasn't, you must have just executed Phase 2 (Tasks 32–41) before starting Task 42. Phase 3 cannot land without the Phase-2 canvas, store, deriveFlow, and standalone shell in place.
- `BuilderNode<TData>` lives at `packages/studio-core/src/nodes/shared/types.ts`; the registry's `Renderer` slot is reserved on the `VariantDefinition` interface (line 75 comment "Phase 3 adds: Renderer"). Task 42 fills it.
- The `WorkflowBuilder` shell (Task 37) lays out a CSS-grid with a left `<aside aria-label="Node library">` placeholder. Task 46 fills that aside with the real `NodeLibrary`.

---

### Task 42: Migrate `deriveFlow` + extend `VariantDefinition` with `Renderer`

**Files:**
- Modify: `packages/studio-core/src/nodes/shared/types.ts:57-76`
- Modify: `packages/studio-core/src/components/canvas/deriveFlow.ts` (created in Task 32)
- Modify: `packages/studio-core/tests/components/canvas/deriveFlow.spec.ts` (created in Task 32)
- Delete: `packages/studio-core/src/components/DagNodeComponent.tsx` (created in Task 35)
- Delete: `packages/studio-core/src/components/DagNodeComponent.module.css`
- Delete: `packages/studio-core/tests/components/DagNodeComponent.spec.tsx`
- Modify: `packages/studio-core/src/components/canvas/Canvas.tsx` (created in Task 36) — `nodeTypes` built from registry instead of `{ dag: DagNodeComponent }`

The Phase-2 stopgap projects `data: { variant, storeId, label }` and registers a single `dag` nodeType. Phase 3 needs each variant to render with its own component, so we:

1. Add `Renderer: ComponentType<NodeProps<DagNodeData<TData>>>` to `VariantDefinition`.
2. Change `deriveFlow` to emit `type: n.variant` and pass the full `BuilderNode` through on `data` so per-variant Renderers can read their typed `data` natively (advisor recommendation; spec §6.2 contract).
3. Build `nodeTypes` in Canvas from the registry: `Object.fromEntries(VARIANT_IDS.map((id) => [id, getVariant(id).Renderer]))`.
4. Retire `DagNodeComponent`. Forward-compat for unrecognised variants is unnecessary because `BuilderNode.variant: VariantId` is type-narrowed to the 7-member union; truly-unknown variants would have failed `detectVariant` at import.

The Phase-2 deriveFlow tests asserted `n.type === 'dag'` and `data.variant === 'loop'` — those assertions migrate to `n.type === 'loop'` and `data.node.variant === 'loop'`.

- [ ] **Step 1: Update the failing tests first** (TDD red phase)

Modify `packages/studio-core/tests/components/canvas/deriveFlow.spec.ts`. Replace the existing test bodies to assert the new shape:

```ts
import { describe, it, expect } from 'bun:test';
import { deriveFlow } from '../../../src/components/canvas/deriveFlow';
import type { BuilderNode } from '../../../src/nodes/shared/types';

const node = (over: Partial<BuilderNode>): BuilderNode => ({
  id: 'x',
  variant: 'command',
  data: {},
  base: {},
  unknown: {},
  ...over,
});

describe('deriveFlow', () => {
  it('emits one rfNode per store node, type === each node\'s variant id', () => {
    const { rfNodes } = deriveFlow(
      [node({ id: 'a', variant: 'command' }), node({ id: 'b', variant: 'loop' })],
      new Map(),
    );
    expect(rfNodes).toHaveLength(2);
    expect(rfNodes.find((n) => n.id === 'a')?.type).toBe('command');
    expect(rfNodes.find((n) => n.id === 'b')?.type).toBe('loop');
  });

  it('passes the full BuilderNode through on rfNode.data.node', () => {
    const src = node({ id: 'a', variant: 'loop', data: { iteration_cap: 5 } });
    const { rfNodes } = deriveFlow([src], new Map());
    expect(rfNodes[0].data.node).toBe(src); // identity, not deep-clone — pure projection
    expect(rfNodes[0].data.storeId).toBe('a');
  });

  // Position-map test, edge-id test, when-aware-edge test, ghost-source test from Phase 2 are unchanged.
  // Copy those four bodies forward verbatim from Task 32's spec.
});
```

Re-run the four unchanged Phase-2 tests verbatim alongside the two new ones.

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test deriveFlow`
Expected: tests fail because deriveFlow still emits `type: 'dag'` and `data: { variant, storeId, label }`.

- [ ] **Step 3: Update `VariantDefinition` to include `Renderer`**

Modify `packages/studio-core/src/nodes/shared/types.ts`. Update the file header import and the `VariantDefinition` interface:

```ts
import type { ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { z } from 'zod';
import type { VariantId } from '../registry';
import type { DagNode } from '../../schemas';

// ... (VariantCapabilities, VariantLibraryMetadata, BuilderNode, BaseFields, VariantSpecificFields unchanged) ...

/**
 * What every per-variant Renderer receives via React Flow's `data` prop.
 * `node` is a reference to the live store BuilderNode (never deep-cloned by deriveFlow).
 */
export interface DagNodeData<TData = unknown> extends Record<string, unknown> {
  storeId: string;
  node: BuilderNode<TData>;
}

export interface VariantDefinition<TData> {
  id: VariantId;
  capabilities: VariantCapabilities;
  library: VariantLibraryMetadata;
  schema: z.ZodTypeAny;
  createDefault: () => TData;
  fromDag: (input: { base: BaseFields; variantSpecific: VariantSpecificFields; raw: DagNode }) => TData;
  toDag: (data: TData) => Partial<DagNode>;
  /** Phase-3 React component that React Flow mounts for `type === id`. */
  Renderer: ComponentType<NodeProps<DagNodeData<TData>>>;
  // Phase 4 adds: Inspector.
}
```

- [ ] **Step 4: Update `deriveFlow` to emit `type: variant` + pass-through**

Replace the body of `packages/studio-core/src/components/canvas/deriveFlow.ts`:

```ts
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { BuilderNode } from '../../nodes/shared/types';
import type { DagNodeData } from '../../nodes/shared/types';

export type { DagNodeData };

export interface DeriveFlowResult {
  rfNodes: RFNode<DagNodeData>[];
  rfEdges: RFEdge[];
}

export function deriveFlow(
  storeNodes: readonly BuilderNode[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
): DeriveFlowResult {
  const knownIds = new Set(storeNodes.map((n) => n.id));

  const rfNodes: RFNode<DagNodeData>[] = storeNodes.map((n) => ({
    id: n.id,
    type: n.variant, // ← was 'dag' in Phase 2
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { storeId: n.id, node: n }, // ← passes BuilderNode through; renderer reads n.data, n.base, n.variant directly
  }));

  const rfEdges: RFEdge[] = [];
  for (const target of storeNodes) {
    const dep = target.base.depends_on as string[] | undefined;
    if (!dep) continue;
    const targetHasWhen = typeof target.base.when === 'string';
    for (const source of dep) {
      if (!knownIds.has(source)) continue;
      rfEdges.push({
        id: `${source}->${target.id}`,
        source,
        target: target.id,
        type: 'smoothstep',
        style: targetHasWhen
          ? { stroke: 'var(--studio-when)', strokeDasharray: '6 4' }
          : { stroke: 'var(--studio-muted)' },
      });
    }
  }

  return { rfNodes, rfEdges };
}
```

The previous `DagNodeData` definition in this file disappears — it's now defined and exported from `nodes/shared/types.ts`.

- [ ] **Step 5: Add a `Renderer` placeholder to every variant module so the registry compiles**

The registry's `VariantDefinition<unknown>` now requires `Renderer`. Ship a trivial placeholder per variant for this task only — Task 44 replaces them with the real visuals. Same shape across all 7; do it as a sweep.

For each of `command/`, `prompt/`, `bash/`, `script/`, `loop/`, `approval/`, `cancel/`:

1. Create `packages/studio-core/src/nodes/<variant>/Renderer.tsx`:

```tsx
import type { NodeProps } from '@xyflow/react';
import type { DagNodeData } from '../shared/types';
import type { <Variant>NodeData } from './data';

export function <Variant>Renderer(_: NodeProps<DagNodeData<<Variant>NodeData>>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="<variant>" style={{ width: 180, height: 80 }} />;
}
```

2. Modify `packages/studio-core/src/nodes/<variant>/index.ts` to import the Renderer and add it to the exported `VariantDefinition`:

```ts
import { <Variant>Renderer } from './Renderer';
// ...
export const <variant>Variant: VariantDefinition<<Variant>NodeData> = {
  // ...existing fields...
  Renderer: <Variant>Renderer,
};
```

(Type names: `Command`/`commandVariant`/`CommandNodeData` etc. Substitute per variant.)

- [ ] **Step 6: Build `nodeTypes` from the registry in `Canvas`**

Modify `packages/studio-core/src/components/canvas/Canvas.tsx`. Replace the Phase-2 nodeTypes import with a registry-derived one:

```tsx
import { useMemo } from 'react';
import { defaultRegistry } from '../../nodes/default-registry';
import { VARIANT_IDS } from '../../nodes/registry';
// remove: import { DagNodeComponent } from '../DagNodeComponent';

// Inside the component body, replace the Phase-2 `const nodeTypes = { dag: DagNodeComponent }`:
const nodeTypes = useMemo(
  () =>
    Object.fromEntries(
      VARIANT_IDS.map((id) => [id, defaultRegistry[id].Renderer]),
    ) as Record<string, ComponentType<NodeProps>>,
  [],
);
```

The `as Record<string, ComponentType<NodeProps>>` cast is the unavoidable boundary cast: `VariantDefinition<unknown>.Renderer` is `ComponentType<NodeProps<DagNodeData<unknown>>>`, which `nodeTypes` accepts via `ComponentType<NodeProps>`. The cast is justified at the dispatcher boundary; per-variant Renderers reclaim their typed `TData` from `props.data.node.data` because each is registered under its own variant id.

- [ ] **Step 7: Delete `DagNodeComponent` and its CSS + spec**

```bash
git rm packages/studio-core/src/components/DagNodeComponent.tsx \
       packages/studio-core/src/components/DagNodeComponent.module.css \
       packages/studio-core/tests/components/DagNodeComponent.spec.tsx
```

- [ ] **Step 8: Run, expect green**

Run: `bun --filter='@archon-studio/core' test`
Expected: deriveFlow's six tests pass; no DagNodeComponent test runs (deleted); no other regressions.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(nodes): per-variant Renderer slot + deriveFlow pass-through; retire DagNodeComponent"
```

---

### Task 43: Shared `NodeShell` visual primitive

**Files:**
- Create: `packages/studio-core/src/nodes/shared/NodeShell.tsx`
- Create: `packages/studio-core/src/nodes/shared/NodeShell.module.css`
- Create: `packages/studio-core/tests/nodes/shared/NodeShell.spec.tsx`

The seven per-variant Renderers share 80% of their visual structure: a 180×80 card with a 4-px left stripe in `var(--node-<variant>)`, top/bottom React Flow handles, label area, optional badge area in the corner, optional secondary text row. Extract that scaffolding into one component so per-variant Renderers stay short — they only describe *what's variant-specific* (badge content, secondary text, capability flags).

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/nodes/shared/NodeShell.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { NodeShell } from '../../../src/nodes/shared/NodeShell';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

describe('NodeShell', () => {
  it('renders label and applies the variant color stripe', () => {
    const { container } = render(
      <ReactFlowProvider>
        <NodeShell variant="loop" label="iterate" selected={false} />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('iterate')).toBeDefined();
    const stripe = container.querySelector('[data-stripe="true"]') as HTMLElement;
    expect(stripe.style.background).toContain('--node-loop');
  });

  it('renders the badge when supplied', () => {
    render(
      <ReactFlowProvider>
        <NodeShell variant="loop" label="iterate" selected={false} badge="cap 5" />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('cap 5')).toBeDefined();
  });

  it('renders secondary text when supplied', () => {
    render(
      <ReactFlowProvider>
        <NodeShell variant="bash" label="run" selected={false} secondary="echo hi" />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('echo hi')).toBeDefined();
  });

  it('reflects the selected prop on data-attribute', () => {
    const { container } = render(
      <ReactFlowProvider>
        <NodeShell variant="command" label="x" selected={true} />
      </ReactFlowProvider>,
    );
    expect(container.querySelector('[data-selected="true"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test NodeShell`
Expected: module-not-found.

- [ ] **Step 3: Implement `NodeShell`**

Create `packages/studio-core/src/nodes/shared/NodeShell.tsx`:

```tsx
import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { VariantId } from '../registry';
import styles from './NodeShell.module.css';

export interface NodeShellProps {
  variant: VariantId;
  label: string;
  selected: boolean;
  /** Top-right pill (e.g., "cap 5", "interactive", "fail-fast"). */
  badge?: ReactNode;
  /** Single line of secondary text under the label (truncated). */
  secondary?: ReactNode;
}

export function NodeShell({ variant, label, selected, badge, secondary }: NodeShellProps) {
  return (
    <div
      className={styles.node}
      data-selected={selected ? 'true' : 'false'}
      data-variant={variant}
      style={{ width: 180, height: 80 }}
    >
      <div
        className={styles.stripe}
        data-stripe="true"
        style={{ background: `var(--node-${variant})` }}
      />
      <div className={styles.body}>
        <div className={styles.headerRow}>
          <div className={styles.label}>{label}</div>
          {badge !== undefined && <div className={styles.badge}>{badge}</div>}
        </div>
        {secondary !== undefined && <div className={styles.secondary}>{secondary}</div>}
        {badge !== variant && <div className={styles.tag}>{variant}</div>}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

Create `packages/studio-core/src/nodes/shared/NodeShell.module.css`:

```css
.node {
  position: relative;
  display: flex;
  background: var(--studio-surface);
  color: var(--studio-fg);
  border: 1px solid var(--studio-muted);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.node[data-selected='true'] {
  border-color: var(--studio-accent);
  box-shadow: 0 0 0 2px var(--studio-accent);
}
.stripe {
  width: 4px;
  flex: 0 0 4px;
  height: 100%;
}
.body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 12px;
  gap: 4px;
  min-width: 0;
}
.headerRow {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.label {
  flex: 1 1 auto;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  flex: 0 0 auto;
  font-size: 10px;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--studio-muted);
  color: var(--studio-fg);
}
.secondary {
  font-size: 11px;
  color: var(--studio-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--studio-muted);
}
```

- [ ] **Step 4: Run, expect green**

Run: `bun --filter='@archon-studio/core' test NodeShell`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/nodes/shared/NodeShell.tsx \
        packages/studio-core/src/nodes/shared/NodeShell.module.css \
        packages/studio-core/tests/nodes/shared/NodeShell.spec.tsx
git commit -m "feat(nodes): NodeShell shared visual primitive — 4-px stripe + handles + label + optional badge/secondary"
```

---

### Task 44: Per-variant Renderers — template + 7 variants

**Files (one Renderer.tsx + one spec per variant — 14 files total; the placeholders from Task 42 are *replaced*, not augmented):**
- Modify: `packages/studio-core/src/nodes/command/Renderer.tsx`
- Modify: `packages/studio-core/src/nodes/prompt/Renderer.tsx`
- Modify: `packages/studio-core/src/nodes/bash/Renderer.tsx`
- Modify: `packages/studio-core/src/nodes/script/Renderer.tsx`
- Modify: `packages/studio-core/src/nodes/loop/Renderer.tsx`
- Modify: `packages/studio-core/src/nodes/approval/Renderer.tsx`
- Modify: `packages/studio-core/src/nodes/cancel/Renderer.tsx`
- Create: one `tests/nodes/<variant>/Renderer.spec.tsx` per variant.

Each Renderer is a thin wrapper that pulls variant-specific accents out of `props.data.node` and delegates layout to `NodeShell`. The visual differences (per spec §6.1 & the phase outline at line 141) are:

| Variant | Label | Badge | Secondary | Notes |
|---|---|---|---|---|
| `command` | `data.command` (or `id` if blank) | — | — | Stripe `--node-command` (cyan) |
| `prompt` | `id` | — | first 32 chars of `data.prompt` | Stripe `--node-prompt` (blue) |
| `bash` | `id` | — | first 32 chars of `data.bash` | Stripe `--node-bash` (slate) |
| `script` | `id` | `data.script` (file ref) | — | Stripe `--node-script` (gray) |
| `loop` | `id` | `cap N` if `data.iteration_cap` set; else `loop` | "interactive" if `data.interactive` | Stripe `--node-loop` (purple) |
| `approval` | `id` | "approval" | first 32 chars of `data.gate_message` if set | Stripe `--node-approval` (orange) |
| `cancel` | `id` | "cancel" | — | Stripe `--node-cancel` (red) |

The label fallback to `id` is the universal default. Variants that have a meaningful identifier in their data (`command.command`, future-thoughts etc.) prefer that. For prompt/bash/script/approval the body content goes in the *secondary* slot, never as the label, because the id is what's referenced from `depends_on`/`when:`/etc. and identification by id is the priority.

#### Step 1: Write `command/Renderer.tsx` (the template)

Replace the placeholder at `packages/studio-core/src/nodes/command/Renderer.tsx`:

```tsx
import type { NodeProps } from '@xyflow/react';
import type { DagNodeData } from '../shared/types';
import { NodeShell } from '../shared/NodeShell';
import type { CommandNodeData } from './data';

export function CommandRenderer({ data, selected }: NodeProps<DagNodeData<CommandNodeData>>) {
  const { node } = data;
  const label = node.data.command || node.id;
  return <NodeShell variant="command" label={label} selected={!!selected} />;
}
```

Create `packages/studio-core/tests/nodes/command/Renderer.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { CommandRenderer } from '../../../src/nodes/command/Renderer';
import type { BuilderNode } from '../../../src/nodes/shared/types';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

const baseProps = {
  id: 'x', type: 'command', selected: false, dragging: false,
  isConnectable: true, xPos: 0, yPos: 0, zIndex: 0,
};

const mkNode = (over: Partial<BuilderNode>): BuilderNode => ({
  id: 'x', variant: 'command', data: { command: '' }, base: {}, unknown: {}, ...over,
});

describe('CommandRenderer', () => {
  it('uses data.command as label when set', () => {
    render(
      <ReactFlowProvider>
        <CommandRenderer
          {...(baseProps as any)}
          data={{ storeId: 'x', node: mkNode({ data: { command: 'classify' } }) }}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('classify')).toBeDefined();
  });

  it('falls back to node id when data.command is empty', () => {
    render(
      <ReactFlowProvider>
        <CommandRenderer
          {...(baseProps as any)}
          data={{ storeId: 'classify', node: mkNode({ id: 'classify', data: { command: '' } }) }}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('classify')).toBeDefined();
  });
});
```

#### Step 2: Per-variant differences (apply the same template, change only what the table demands)

For each remaining variant the diff against `command/Renderer.tsx` is the import (`<Variant>NodeData`), the variant id passed to `NodeShell`, and what's pulled out of `node.data` for `label`/`badge`/`secondary`. The per-variant body table:

```tsx
// prompt/Renderer.tsx
const secondary = node.data.prompt ? node.data.prompt.slice(0, 32) : undefined;
return <NodeShell variant="prompt" label={node.id} selected={!!selected} secondary={secondary} />;

// bash/Renderer.tsx
const secondary = node.data.bash ? node.data.bash.slice(0, 32) : undefined;
return <NodeShell variant="bash" label={node.id} selected={!!selected} secondary={secondary} />;

// script/Renderer.tsx
return <NodeShell variant="script" label={node.id} selected={!!selected} badge={node.data.script || undefined} />;

// loop/Renderer.tsx
const cap = node.data.iteration_cap;
const badge = typeof cap === 'number' ? `cap ${cap}` : 'loop';
const secondary = node.data.interactive ? 'interactive' : undefined;
return <NodeShell variant="loop" label={node.id} selected={!!selected} badge={badge} secondary={secondary} />;

// approval/Renderer.tsx
const secondary = node.data.gate_message ? node.data.gate_message.slice(0, 32) : undefined;
return <NodeShell variant="approval" label={node.id} selected={!!selected} badge="approval" secondary={secondary} />;

// cancel/Renderer.tsx
return <NodeShell variant="cancel" label={node.id} selected={!!selected} badge="cancel" />;
```

Each spec follows the command template — assert label, badge (where applicable), and secondary (where applicable). One spec per variant; bodies are 2–3 `it()` blocks each. Estimated ~25 lines of test per variant.

#### Step 3: Run all 7 renderer specs

Run: `bun --filter='@archon-studio/core' test Renderer`
Expected: 7 spec files, ≥14 passing tests across them. (Two each for command/prompt/bash/script/loop, three for approval, one for cancel — total scales as you add edge-case `it()` blocks per variant.)

#### Step 4: Commit per-variant batch

```bash
git add packages/studio-core/src/nodes/*/Renderer.tsx \
        packages/studio-core/tests/nodes/*/Renderer.spec.tsx
git commit -m "feat(nodes): per-variant Renderers — variant-specific label/badge/secondary via NodeShell"
```

---

### Task 45: `makeUniqueId` helper + `addNodeFromVariant` store action

**Files:**
- Create: `packages/studio-core/src/nodes/shared/makeUniqueId.ts`
- Create: `packages/studio-core/tests/nodes/shared/makeUniqueId.spec.ts`
- Modify: `packages/studio-core/src/store/builder-store.ts` — add `addNodeFromVariant`
- Modify: `packages/studio-core/tests/store/builder-store.spec.ts` (created in Task 27) — extend
- Modify: `packages/studio-core/src/nodes/shared/types.ts` — re-export `makeUniqueId`

The helper `makeUniqueId(hint, existingIds): string` returns `hint` if free, else `<hint>-2`, `-3`, … incrementing until unique. Pure, no React, no store. Three call sites use it: drag-drop, click-to-add, and snippet-collision rename. One implementation, one test surface.

The `addNodeFromVariant(variantId, options?)` store action wraps `getVariant(variantId).createDefault()` to mint a fresh `BuilderNode`, picks a unique id from `library.defaultIdHint`, and calls the existing `addNode`. Optional `idHintOverride` (used by the commands list to seed `run-<commandName>`-style ids) and `dataPatch` (used to prefill `data.command` when dropped from the Commands section).

- [ ] **Step 1: Write the failing tests for `makeUniqueId`**

Create `packages/studio-core/tests/nodes/shared/makeUniqueId.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { makeUniqueId } from '../../../src/nodes/shared/makeUniqueId';

describe('makeUniqueId', () => {
  it('returns the hint unchanged when free', () => {
    expect(makeUniqueId('classify', new Set())).toBe('classify');
    expect(makeUniqueId('classify', new Set(['other']))).toBe('classify');
  });

  it('appends -2 on first collision', () => {
    expect(makeUniqueId('classify', new Set(['classify']))).toBe('classify-2');
  });

  it('keeps incrementing past existing -N suffixes', () => {
    expect(makeUniqueId('x', new Set(['x', 'x-2', 'x-3']))).toBe('x-4');
  });

  it('does not collide with sibling roots that share a prefix', () => {
    expect(makeUniqueId('foo', new Set(['foo-bar', 'foo-bar-2']))).toBe('foo');
    // 'foo-bar' must not block 'foo' itself.
  });

  it('handles non-numeric suffixes that look like our scheme', () => {
    expect(makeUniqueId('x', new Set(['x', 'x-banana']))).toBe('x-2');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test makeUniqueId`
Expected: module-not-found.

- [ ] **Step 3: Implement `makeUniqueId`**

Create `packages/studio-core/src/nodes/shared/makeUniqueId.ts`:

```ts
/**
 * Pick a free id by appending `-2`, `-3`, … to `hint` until it doesn't collide.
 * Pure — no React, no store. Used by drag-drop, click-to-add, and snippet insertion.
 */
export function makeUniqueId(hint: string, existing: ReadonlySet<string>): string {
  if (!existing.has(hint)) return hint;
  let n = 2;
  while (existing.has(`${hint}-${n}`)) n += 1;
  return `${hint}-${n}`;
}
```

- [ ] **Step 4: Run, expect green**

Run: `bun --filter='@archon-studio/core' test makeUniqueId`
Expected: 5 passing.

- [ ] **Step 5: Add `addNodeFromVariant` to the store**

Modify `packages/studio-core/src/store/builder-store.ts`. Add to the imports:

```ts
import { defaultRegistry } from '../nodes/default-registry';
import type { VariantId } from '../nodes/registry';
import { makeUniqueId } from '../nodes/shared/makeUniqueId';
```

Add to `BuilderState`:

```ts
addNodeFromVariant: (
  variantId: VariantId,
  options?: { idHintOverride?: string; dataPatch?: Record<string, unknown> },
) => string;
```

Implement in the `create()` body:

```ts
addNodeFromVariant: (variantId, options) => {
  const def = defaultRegistry[variantId];
  const hint = options?.idHintOverride ?? def.library.defaultIdHint;
  const existingIds = new Set(get().nodes.map((n) => n.id));
  const id = makeUniqueId(hint, existingIds);
  const data = { ...(def.createDefault() as Record<string, unknown>), ...(options?.dataPatch ?? {}) };
  set((s) => ({
    nodes: [...s.nodes, { id, variant: variantId, data, base: {}, unknown: {} }],
  }));
  return id;
},
```

Returns the chosen id so callers (drag-drop, snippet insert) can later persist a position for it.

- [ ] **Step 6: Extend the store test**

Add to `packages/studio-core/tests/store/builder-store.spec.ts`:

```ts
describe('addNodeFromVariant', () => {
  it('mints a node with a default id from the variant library hint', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: '', base: {}, unknown: {} }, nodes: [],
    });
    const id = useBuilderStore.getState().addNodeFromVariant('command');
    expect(id).toBe('run-command'); // command/data.ts:defaultIdHint
    expect(useBuilderStore.getState().nodes).toHaveLength(1);
    expect(useBuilderStore.getState().nodes[0].variant).toBe('command');
  });

  it('disambiguates the id when the default collides', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: '', base: {}, unknown: {} },
      nodes: [{ id: 'run-command', variant: 'command', data: { command: 'x' }, base: {}, unknown: {} }],
    });
    const id = useBuilderStore.getState().addNodeFromVariant('command');
    expect(id).toBe('run-command-2');
  });

  it('respects idHintOverride and dataPatch (used by commands list)', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: '', base: {}, unknown: {} }, nodes: [],
    });
    const id = useBuilderStore.getState().addNodeFromVariant('command', {
      idHintOverride: 'run-classify',
      dataPatch: { command: 'classify' },
    });
    expect(id).toBe('run-classify');
    expect(useBuilderStore.getState().nodes[0].data).toMatchObject({ command: 'classify' });
  });
});
```

- [ ] **Step 7: Run, expect green**

Run: `bun --filter='@archon-studio/core' test builder-store`
Expected: existing tests still pass + 3 new ones.

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/src/nodes/shared/makeUniqueId.ts \
        packages/studio-core/tests/nodes/shared/makeUniqueId.spec.ts \
        packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/tests/store/builder-store.spec.ts
git commit -m "feat(store): addNodeFromVariant + makeUniqueId helper for click-to-add and drag-drop"
```

---

### Task 46: `NodeLibrary` shell + Variants section + click-to-add

**Files:**
- Create: `packages/studio-core/src/components/NodeLibrary.tsx`
- Create: `packages/studio-core/src/components/NodeLibrary.module.css`
- Create: `packages/studio-core/src/components/library/VariantTile.tsx`
- Create: `packages/studio-core/tests/components/NodeLibrary.spec.tsx`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx` (created in Task 37) — replace the empty `<aside>` library placeholder with `<NodeLibrary />`

The library has three sections (Variants / Commands / Snippets). This task wires the shell + Variants section + click-to-add. Drag wiring is Task 47, Commands is Task 48, Snippets is Task 51.

Click-to-add behaviour: click a variant tile → `useBuilderStore.getState().addNodeFromVariant(variantId)` → new node appears at `{x:0, y:0}` for now. Position-near-viewport-center is the drag-only path (Task 47); click is the keyboard-friendly fallback and lands at origin so the user can drag it into place. (We can add a viewport-center click in v1.5 if it's noisy.)

- [ ] **Step 1: Write the failing test**

Create `packages/studio-core/tests/components/NodeLibrary.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { NodeLibrary } from '../../src/components/NodeLibrary';
import { useBuilderStore } from '../../src/store/builder-store';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

beforeEach(() => useBuilderStore.getState().clearWorkflow());

describe('NodeLibrary', () => {
  it('renders one tile per variant under the Variants heading', () => {
    render(
      <ReactFlowProvider>
        <NodeLibrary />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole('heading', { name: /variants/i })).toBeDefined();
    for (const v of ['command', 'prompt', 'bash', 'script', 'loop', 'approval', 'cancel']) {
      expect(screen.getByLabelText(`Add ${v} node`)).toBeDefined();
    }
  });

  it('click-to-add appends a node via addNodeFromVariant', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: '', base: {}, unknown: {} }, nodes: [],
    });
    render(
      <ReactFlowProvider>
        <NodeLibrary />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByLabelText('Add loop node'));
    const nodes = useBuilderStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].variant).toBe('loop');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test NodeLibrary`
Expected: module-not-found.

- [ ] **Step 3: Implement `VariantTile`**

Create `packages/studio-core/src/components/library/VariantTile.tsx`:

```tsx
import type { VariantId } from '../../nodes/registry';
import type { VariantLibraryMetadata } from '../../nodes/shared/types';

export interface VariantTileProps {
  id: VariantId;
  meta: VariantLibraryMetadata;
  onActivate: () => void;
  /** Drag wiring — Task 47 supplies these props; click-only mode passes nothing. */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export function VariantTile({ id, meta, onActivate, draggable, onDragStart }: VariantTileProps) {
  return (
    <button
      type="button"
      aria-label={`Add ${id} node`}
      onClick={onActivate}
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 10px',
        textAlign: 'left',
        background: 'var(--studio-surface)',
        color: 'var(--studio-fg)',
        border: '1px solid var(--studio-muted)',
        borderRadius: 'var(--radius-sm)',
        cursor: draggable ? 'grab' : 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 4, height: 28, borderRadius: 2,
          background: `var(--node-${id})`,
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{meta.label}</div>
        <div style={{ fontSize: 11, color: 'var(--studio-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {meta.description}
        </div>
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Implement `NodeLibrary`**

Create `packages/studio-core/src/components/NodeLibrary.tsx`:

```tsx
import { VARIANT_IDS } from '../nodes/registry';
import { defaultRegistry } from '../nodes/default-registry';
import { useBuilderStore } from '../store/builder-store';
import { VariantTile } from './library/VariantTile';
import styles from './NodeLibrary.module.css';

export function NodeLibrary() {
  const addNodeFromVariant = useBuilderStore((s) => s.addNodeFromVariant);
  return (
    <aside aria-label="Node library" className={styles.library}>
      <section className={styles.section}>
        <h3 className={styles.heading}>Variants</h3>
        <ul className={styles.tileList}>
          {VARIANT_IDS.map((id) => (
            <li key={id}>
              <VariantTile
                id={id}
                meta={defaultRegistry[id].library}
                onActivate={() => addNodeFromVariant(id)}
              />
            </li>
          ))}
        </ul>
      </section>
      {/* Commands section — Task 48 */}
      {/* Snippets section — Task 51 */}
    </aside>
  );
}
```

Create `packages/studio-core/src/components/NodeLibrary.module.css`:

```css
.library {
  display: flex; flex-direction: column;
  height: 100%;
  background: var(--studio-bg);
  border-right: 1px solid var(--studio-muted);
  overflow-y: auto;
}
.section {
  padding: 12px;
  border-bottom: 1px solid var(--studio-muted);
}
.heading {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--studio-muted);
  margin: 0 0 8px 0;
}
.tileList {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 5: Wire into `WorkflowBuilder`**

Modify `packages/studio-core/src/components/WorkflowBuilder.tsx` — replace the placeholder `<aside aria-label="Node library">` with `<NodeLibrary />`. Ensure the import is added.

- [ ] **Step 6: Run, expect green**

Run: `bun --filter='@archon-studio/core' test NodeLibrary`
Expected: 2 passing. Phase-2 `WorkflowBuilder.spec.tsx` still passes (it asserts `getByLabelText('Node library')` which `NodeLibrary` carries through on its `<aside>`).

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/components/NodeLibrary.tsx \
        packages/studio-core/src/components/NodeLibrary.module.css \
        packages/studio-core/src/components/library/VariantTile.tsx \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/tests/components/NodeLibrary.spec.tsx
git commit -m "feat(library): NodeLibrary shell + Variants section + click-to-add"
```

---

### Task 47: Drag-from-library payload + `PositionContext` + Canvas `onDrop` integration

**Files:**
- Create: `packages/studio-core/src/components/library/dragPayload.ts`
- Create: `packages/studio-core/tests/components/library/dragPayload.spec.ts`
- Create: `packages/studio-core/src/hooks/PositionContext.tsx`
- Create: `packages/studio-core/tests/hooks/PositionContext.spec.tsx`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx` (created in Task 37) — wrap children in `<PositionProvider>` so `Canvas` and `SnippetsSection` share one persistence handle
- Modify: `packages/studio-core/src/components/library/VariantTile.tsx` — wire `onDragStart`
- Modify: `packages/studio-core/src/components/NodeLibrary.tsx` — pass drag handlers
- Modify: `packages/studio-core/src/components/canvas/Canvas.tsx` (created in Task 36) — consume `usePositionContext`; wire `onDrop`/`onDragOver`
- Modify: `packages/studio-core/tests/components/NodeLibrary.spec.tsx` — drag-payload assertion test

Library tiles emit a typed JSON payload via `dataTransfer`. Canvas owns React Flow's instance and calls `screenToFlowPosition` to convert the drop coordinates to graph space. The shape is built for three drag sources (variant tile, command row, snippet tile) so one `onDrop` handles everything; Tasks 48 and 51 plug their own kinds into the same channel.

The MIME type is `application/x-archon-studio` (custom; survives clipboard interop concerns we don't have in v1).

**Persistence-handle seam.** Phase 2's `usePositionPersistence(archonUrl, cwd, workflowName)` is *stateful*; calling it twice in sibling components produces two independent state instances and breaks consistency. Phase 3 needs the handle in two new sites (`Canvas`'s drop handler and `SnippetsSection`'s click-to-add). Solve once: `WorkflowBuilder` calls the hook (it already does — Phase 2 Task 37, line ~5005), wraps children in `<PositionProvider value={persistence}>`, and every descendant reads via `usePositionContext()`. Both this task (Canvas) and Task 51 (SnippetsSection) consume the same context — no prop drilling, no double-running.

- [ ] **Step 1: Introduce `PositionProvider` + `usePositionContext`**

Create `packages/studio-core/src/hooks/PositionContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { UsePositionPersistence } from './usePositionPersistence';

const PositionContext = createContext<UsePositionPersistence | null>(null);

export function PositionProvider({
  value, children,
}: { value: UsePositionPersistence; children: ReactNode }) {
  return <PositionContext.Provider value={value}>{children}</PositionContext.Provider>;
}

export function usePositionContext(): UsePositionPersistence {
  const ctx = useContext(PositionContext);
  if (!ctx) {
    throw new Error('usePositionContext: missing <PositionProvider>. Wrap descendants of WorkflowBuilder.');
  }
  return ctx;
}
```

Create `packages/studio-core/tests/hooks/PositionContext.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'bun:test';
import { renderHook } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { PositionProvider, usePositionContext } from '../../src/hooks/PositionContext';
import type { UsePositionPersistence } from '../../src/hooks/usePositionPersistence';

beforeAll(() => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register(); });

const stub: UsePositionPersistence = {
  positions: new Map(),
  setPosition: () => undefined,
  setMany: () => undefined,
  reset: () => undefined,
};

describe('PositionContext', () => {
  it('throws when read outside <PositionProvider>', () => {
    expect(() => renderHook(() => usePositionContext())).toThrow(/PositionProvider/);
  });

  it('returns the provided handle inside <PositionProvider>', () => {
    const { result } = renderHook(() => usePositionContext(), {
      wrapper: ({ children }) => <PositionProvider value={stub}>{children}</PositionProvider>,
    });
    expect(result.current).toBe(stub);
  });
});
```

Modify `packages/studio-core/src/components/WorkflowBuilder.tsx`. Phase 2 Task 37 already calls `const positions = usePositionPersistence(archonUrl, cwd, workflowName);` at the top of the component. Wrap the existing JSX tree with `<PositionProvider value={positions}>…</PositionProvider>` (between `QueryClientProvider`/`ApiClientProvider` and the layout grid — anywhere inside the providers but above `<Canvas/>` and `<NodeLibrary/>` is fine).

Run: `bun --filter='@archon-studio/core' test PositionContext`
Expected: 2 passing.

- [ ] **Step 2: Write the failing tests for the payload codec**

Create `packages/studio-core/tests/components/library/dragPayload.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import {
  encodeLibraryDrag, decodeLibraryDrag, LIBRARY_DRAG_MIME, type LibraryDragPayload,
} from '../../../src/components/library/dragPayload';

describe('library drag payload', () => {
  it('round-trips a variant payload', () => {
    const p: LibraryDragPayload = { kind: 'variant', variantId: 'loop' };
    expect(decodeLibraryDrag(encodeLibraryDrag(p))).toEqual(p);
  });

  it('round-trips a command payload with prefill', () => {
    const p: LibraryDragPayload = { kind: 'variant', variantId: 'command', prefill: { command: 'classify' } };
    expect(decodeLibraryDrag(encodeLibraryDrag(p))).toEqual(p);
  });

  it('round-trips a snippet payload', () => {
    const p: LibraryDragPayload = { kind: 'snippet', category: 'starters', name: 'archon-feature-development' };
    expect(decodeLibraryDrag(encodeLibraryDrag(p))).toEqual(p);
  });

  it('returns null on garbage', () => {
    expect(decodeLibraryDrag('not-json')).toBeNull();
    expect(decodeLibraryDrag('{}')).toBeNull();
    expect(decodeLibraryDrag('{"kind":"unknown"}')).toBeNull();
  });

  it('exposes the MIME constant', () => {
    expect(LIBRARY_DRAG_MIME).toBe('application/x-archon-studio');
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test dragPayload`
Expected: module-not-found.

- [ ] **Step 4: Implement the payload codec**

Create `packages/studio-core/src/components/library/dragPayload.ts`:

```ts
import type { VariantId } from '../../nodes/registry';

export const LIBRARY_DRAG_MIME = 'application/x-archon-studio';

export type LibraryDragPayload =
  | { kind: 'variant'; variantId: VariantId; prefill?: Record<string, unknown> }
  | { kind: 'snippet'; category: 'starters' | 'patterns'; name: string };

const VARIANT_IDS = new Set<VariantId>(['command', 'prompt', 'bash', 'script', 'loop', 'approval', 'cancel']);
const SNIPPET_CATEGORIES = new Set(['starters', 'patterns']);

export function encodeLibraryDrag(p: LibraryDragPayload): string {
  return JSON.stringify(p);
}

export function decodeLibraryDrag(raw: string): LibraryDragPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.kind === 'variant' && typeof o.variantId === 'string' && VARIANT_IDS.has(o.variantId as VariantId)) {
    const out: LibraryDragPayload = { kind: 'variant', variantId: o.variantId as VariantId };
    if (o.prefill && typeof o.prefill === 'object') out.prefill = o.prefill as Record<string, unknown>;
    return out;
  }
  if (
    o.kind === 'snippet' &&
    typeof o.category === 'string' && SNIPPET_CATEGORIES.has(o.category) &&
    typeof o.name === 'string'
  ) {
    return { kind: 'snippet', category: o.category as 'starters' | 'patterns', name: o.name };
  }
  return null;
}
```

- [ ] **Step 5: Run, expect green**

Run: `bun --filter='@archon-studio/core' test dragPayload`
Expected: 5 passing.

- [ ] **Step 6: Wire `onDragStart` on `VariantTile`**

The tile is already prop-ready from Task 46 (`draggable`, `onDragStart`). Pass these from `NodeLibrary`:

```tsx
// In NodeLibrary.tsx, inside the .map((id) => …):
<VariantTile
  id={id}
  meta={defaultRegistry[id].library}
  onActivate={() => addNodeFromVariant(id)}
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData(LIBRARY_DRAG_MIME, encodeLibraryDrag({ kind: 'variant', variantId: id }));
    e.dataTransfer.effectAllowed = 'copy';
  }}
/>
```

Add `import { LIBRARY_DRAG_MIME, encodeLibraryDrag } from './library/dragPayload';` at the top.

- [ ] **Step 7: Wire `onDrop`/`onDragOver` on `Canvas`**

Modify `packages/studio-core/src/components/canvas/Canvas.tsx`. Inside the component body, near where `useReactFlow` is called (Task 36 already gives us the instance for `screenToFlowPosition`):

```tsx
import { LIBRARY_DRAG_MIME, decodeLibraryDrag } from '../library/dragPayload';
import { useBuilderStore } from '../../store/builder-store';
import { usePositionContext } from '../../hooks/PositionContext';

// ...

const reactFlow = useReactFlow();
const addNodeFromVariant = useBuilderStore((s) => s.addNodeFromVariant);
const { setPosition } = usePositionContext();

const onDragOver = useCallback((e: React.DragEvent) => {
  if (e.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
}, []);

const onDrop = useCallback((e: React.DragEvent) => {
  const raw = e.dataTransfer.getData(LIBRARY_DRAG_MIME);
  const payload = decodeLibraryDrag(raw);
  if (!payload) return;
  e.preventDefault();
  const flowPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  if (payload.kind === 'variant') {
    const id = addNodeFromVariant(payload.variantId, { dataPatch: payload.prefill });
    setPosition(id, flowPos);
  }
  // payload.kind === 'snippet' handled in Task 51 (insertSnippet wiring).
}, [reactFlow, addNodeFromVariant, setPosition]);

// In the JSX, on the <div> wrapping <ReactFlow>:
<div className={styles.canvas} onDrop={onDrop} onDragOver={onDragOver}>
  <ReactFlow ...{...all the existing Phase-2 props} />
</div>
```

- [ ] **Step 8: Add a drag-encode test in `NodeLibrary.spec.tsx`**

Append to `packages/studio-core/tests/components/NodeLibrary.spec.tsx`:

```tsx
import { LIBRARY_DRAG_MIME, decodeLibraryDrag } from '../../src/components/library/dragPayload';

it('emits a variant drag payload via dataTransfer on tile drag', () => {
  render(<ReactFlowProvider><NodeLibrary /></ReactFlowProvider>);
  const tile = screen.getByLabelText('Add command node');
  const data: Record<string, string> = {};
  const dataTransfer = {
    setData: (k: string, v: string) => { data[k] = v; },
    getData: (k: string) => data[k] ?? '',
    types: [] as string[],
  };
  fireEvent.dragStart(tile, { dataTransfer });
  expect(decodeLibraryDrag(data[LIBRARY_DRAG_MIME])).toEqual({ kind: 'variant', variantId: 'command' });
});
```

(Canvas-side `onDrop` integration is exercised end-to-end by the manual smoke in Task 52; testing JSDOM dataTransfer through React Flow is not worth the gymnastics in unit-test scope.)

- [ ] **Step 9: Run, expect green**

Run: `bun --filter='@archon-studio/core' test`
Expected: PositionContext (2), dragPayload (5), NodeLibrary (3), all prior Phase-1/2 tests still green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(library): PositionContext + drag-from-library payload + Canvas onDrop wiring with screenToFlowPosition"
```

---

### Task 48: Commands section — `listCommands` via TanStack Query

**Files:**
- Create: `packages/studio-core/src/components/library/CommandsSection.tsx`
- Create: `packages/studio-core/tests/components/library/CommandsSection.spec.tsx`
- Modify: `packages/studio-core/src/components/NodeLibrary.tsx` — render `<CommandsSection />`

The Commands section pulls from `useWorkflowApi().listCommands()` (the `WorkflowApiClient` interface defined in Task 4 / Phase 0a). Each row is a `<button>` that on click adds a new `command` node prefilled with that command name and an id hint of `run-<name>`. Drag emits the same payload but with a `prefill: { command: name }`.

The standalone shell's `StubArchonApiClient` (Task 38) returns an empty list by default; we'll add a couple of stub command names so the section is non-empty during smoke. Real Archon connection lands in Phase 9.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/components/library/CommandsSection.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { ApiClientProvider } from '../../../src/api/ApiClientProvider';
import { CommandsSection } from '../../../src/components/library/CommandsSection';
import { useBuilderStore } from '../../../src/store/builder-store';
import type { WorkflowApiClient } from '../../../src/api/WorkflowApiClient';

beforeAll(() => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register(); });
beforeEach(() => useBuilderStore.getState().clearWorkflow());

const mkClient = (cmds: string[]): WorkflowApiClient => ({
  ping: async () => ({ ok: true }),
  listCodebases: async () => null,
  listWorkflows: async () => [],
  listCommands: async () => cmds,
  listProviders: async () => [],
  getWorkflow: async () => ({ name: '', description: '', nodes: [] }) as any,
  saveWorkflow: async (_n, _c, d) => d,
  deleteWorkflow: async () => undefined,
  validateWorkflow: async () => ({ valid: true }),
});

function renderWith(client: WorkflowApiClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={client}>
        <CommandsSection />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('CommandsSection', () => {
  it('renders one row per command from listCommands', async () => {
    renderWith(mkClient(['classify', 'review']));
    await waitFor(() => expect(screen.getByText('classify')).toBeDefined());
    expect(screen.getByText('review')).toBeDefined();
  });

  it('click-to-add appends a command node with prefilled command + scoped id hint', async () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: '', base: {}, unknown: {} }, nodes: [],
    });
    renderWith(mkClient(['classify']));
    await waitFor(() => expect(screen.getByText('classify')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Add command running classify'));
    const nodes = useBuilderStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].variant).toBe('command');
    expect(nodes[0].id).toBe('run-classify');
    expect(nodes[0].data).toMatchObject({ command: 'classify' });
  });

  it('renders an empty-state message when listCommands returns []', async () => {
    renderWith(mkClient([]));
    await waitFor(() => expect(screen.getByText(/no commands/i)).toBeDefined());
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test CommandsSection`
Expected: module-not-found.

- [ ] **Step 3: Implement `CommandsSection`**

Create `packages/studio-core/src/components/library/CommandsSection.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useWorkflowApi } from '../../api/ApiClientProvider';
import { useBuilderStore } from '../../store/builder-store';
import { LIBRARY_DRAG_MIME, encodeLibraryDrag } from './dragPayload';

export function CommandsSection() {
  const client = useWorkflowApi();
  const addNodeFromVariant = useBuilderStore((s) => s.addNodeFromVariant);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['commands'],
    queryFn: () => client.listCommands(),
  });

  return (
    <section style={{ padding: 12, borderBottom: '1px solid var(--studio-muted)' }}>
      <h3 style={headingStyle}>Commands</h3>
      {isLoading && <div style={emptyStyle}>Loading…</div>}
      {isError && <div style={emptyStyle}>Couldn't load commands.</div>}
      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div style={emptyStyle}>No commands.</div>
      )}
      {data && data.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.map((name) => (
            <li key={name}>
              <button
                type="button"
                aria-label={`Add command running ${name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    LIBRARY_DRAG_MIME,
                    encodeLibraryDrag({ kind: 'variant', variantId: 'command', prefill: { command: name } }),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() =>
                  addNodeFromVariant('command', {
                    idHintOverride: `run-${name}`,
                    dataPatch: { command: name },
                  })
                }
                style={rowStyle}
              >
                <span style={{ width: 4, height: 16, borderRadius: 2, background: 'var(--node-command)' }} />
                <span style={{ fontSize: 13 }}>{name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const headingStyle: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--studio-muted)', margin: '0 0 8px 0',
};
const emptyStyle: React.CSSProperties = { fontSize: 12, color: 'var(--studio-muted)' };
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '6px 8px', textAlign: 'left',
  background: 'transparent', color: 'var(--studio-fg)',
  border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
  cursor: 'grab',
};
```

- [ ] **Step 4: Render `CommandsSection` inside `NodeLibrary`**

Modify `packages/studio-core/src/components/NodeLibrary.tsx`. Replace the `{/* Commands section — Task 48 */}` comment with `<CommandsSection />` and add the import.

- [ ] **Step 5: Add 2 stub command names to `StubArchonApiClient` so smoke is non-empty**

Modify `apps/standalone/src/StubArchonApiClient.ts` (created in Task 38). Change `listCommands` to return `['classify', 'review']` instead of `[]`. (When Phase 9 swaps in the real client, this returns to whatever the user's Archon ships.)

- [ ] **Step 6: Run, expect green**

Run: `bun --filter='@archon-studio/core' test`
Expected: CommandsSection (3), all priors green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(library): Commands section — listCommands via TanStack Query, click-to-add + drag with prefill"
```

---

### Task 49: Snippet machinery — `renameSubgraph` + `insertSnippet`

**Files:**
- Create: `packages/studio-core/src/snippets/renameSubgraph.ts`
- Create: `packages/studio-core/src/snippets/insertSnippet.ts`
- Create: `packages/studio-core/tests/snippets/renameSubgraph.spec.ts`
- Create: `packages/studio-core/tests/snippets/insertSnippet.spec.ts`

`renameSubgraph(nodes, idMap)` is a pure function that takes a list of `BuilderNode`s and a `Map<oldId, newId>`, then returns a new list with: each node's `id` rewritten, every `depends_on` entry rewritten, every `when:` string's `$<oldId>` references rewritten. Body refs (`$nodeId.output` inside `prompt`/`bash`/`script`/`loop.prompt`/`approval.message`) are deferred to Phase 4 — the same gap noted in `builder-store.ts:122-124`. Snippets we ship in Task 50 are designed not to rely on body refs internally so we don't ship a Phase-3 bug.

`insertSnippet({ yaml, anchorPosition, dagre })` does the wiring:
1. Parse YAML via the existing importer (`fromWorkflowDefinition`).
2. Build `idMap` from snippet IDs to free IDs in the *current* graph (uses `makeUniqueId` per snippet id).
3. Apply `renameSubgraph` to get the new `BuilderNode`s.
4. Run dagre on the renamed subgraph alone to compute a relative layout.
5. Translate by `anchorPosition - subgraphCentroid` so the snippet lands centred on `anchorPosition`.
6. Add each node to the store; immediately call `setPosition(newId, pos)` on each so `usePositionPersistence` records them and dagre doesn't re-lay-out on next render (advisor flag).

- [ ] **Step 1: Write the failing tests for `renameSubgraph`**

Create `packages/studio-core/tests/snippets/renameSubgraph.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { renameSubgraph } from '../../src/snippets/renameSubgraph';
import type { BuilderNode } from '../../src/nodes/shared/types';

const n = (over: Partial<BuilderNode>): BuilderNode => ({
  id: 'x', variant: 'command', data: {}, base: {}, unknown: {}, ...over,
});

describe('renameSubgraph', () => {
  it('rewrites ids per the map', () => {
    const out = renameSubgraph(
      [n({ id: 'a' }), n({ id: 'b' })],
      new Map([['a', 'a-2'], ['b', 'b-2']]),
    );
    expect(out.map((x) => x.id)).toEqual(['a-2', 'b-2']);
  });

  it('rewrites depends_on entries', () => {
    const out = renameSubgraph(
      [n({ id: 'a' }), n({ id: 'b', base: { depends_on: ['a'] } })],
      new Map([['a', 'a-2'], ['b', 'b-2']]),
    );
    expect(out[1].base.depends_on).toEqual(['a-2']);
  });

  it('rewrites $oldId references in when: strings, not unrelated identifiers', () => {
    const out = renameSubgraph(
      [n({ id: 'gate', base: { when: "$a.output == 'go' && $abc.output == 'no'" } })],
      new Map([['a', 'a-2']]),
    );
    expect(out[0].base.when).toBe("$a-2.output == 'go' && $abc.output == 'no'");
  });

  it('leaves untouched ids alone', () => {
    const out = renameSubgraph(
      [n({ id: 'keep' }), n({ id: 'change', base: { depends_on: ['keep'] } })],
      new Map([['change', 'change-2']]),
    );
    expect(out[0].id).toBe('keep');
    expect(out[1].base.depends_on).toEqual(['keep']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test renameSubgraph`
Expected: module-not-found.

- [ ] **Step 3: Implement `renameSubgraph`**

Create `packages/studio-core/src/snippets/renameSubgraph.ts`:

```ts
import type { BuilderNode } from '../nodes/shared/types';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure subgraph rename. For each node:
 *  - rewrite `id` if mapped
 *  - rewrite each entry of `base.depends_on` if mapped
 *  - rewrite `$<oldId>` references in `base.when` (string identifier boundary; never partial)
 * Body refs in prompt/bash/script/loop.prompt/approval.message are Phase 4 work and not handled here.
 */
export function renameSubgraph(
  nodes: readonly BuilderNode[],
  idMap: ReadonlyMap<string, string>,
): BuilderNode[] {
  if (idMap.size === 0) return nodes.map((n) => ({ ...n, base: { ...n.base } }));
  return nodes.map((n) => {
    const next: BuilderNode = { ...n, base: { ...n.base } };
    if (idMap.has(next.id)) next.id = idMap.get(next.id)!;
    const dep = next.base.depends_on as string[] | undefined;
    if (dep) next.base.depends_on = dep.map((d) => idMap.get(d) ?? d);
    const w = next.base.when as string | undefined;
    if (typeof w === 'string') {
      let result = w;
      for (const [oldId, newId] of idMap) {
        result = result.replace(new RegExp(`\\$${escapeRegExp(oldId)}\\b`, 'g'), `$${newId}`);
      }
      next.base.when = result;
    }
    return next;
  });
}
```

- [ ] **Step 4: Run, expect green**

Run: `bun --filter='@archon-studio/core' test renameSubgraph`
Expected: 4 passing.

- [ ] **Step 5: Write the failing tests for `insertSnippet`**

Create `packages/studio-core/tests/snippets/insertSnippet.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { insertSnippet } from '../../src/snippets/insertSnippet';
import { useBuilderStore } from '../../src/store/builder-store';

const trivialSnippetYaml = `
name: pattern-classify-then-branch
description: Classify input, branch on result.
nodes:
  - id: classify
    command: classify
  - id: branch-yes
    prompt: "$classify.output is yes"
    depends_on: [classify]
    when: "$classify.output == 'yes'"
  - id: branch-no
    prompt: "$classify.output is no"
    depends_on: [classify]
    when: "$classify.output == 'no'"
`;

beforeEach(() => useBuilderStore.getState().loadWorkflow({
  meta: { name: 'host', description: '', base: {}, unknown: {} },
  nodes: [{ id: 'classify', variant: 'command', data: { command: 'x' }, base: {}, unknown: {} }],
}));

describe('insertSnippet', () => {
  it('renames colliding ids and preserves depends_on / when wiring', () => {
    const positions = new Map<string, { x: number; y: number }>();
    const setPosition = (id: string, p: { x: number; y: number }) => positions.set(id, p);
    const result = insertSnippet({
      yaml: trivialSnippetYaml,
      anchorPosition: { x: 500, y: 300 },
      setPosition,
    });
    const ids = useBuilderStore.getState().nodes.map((n) => n.id);
    expect(ids).toContain('classify'); // host node untouched
    expect(ids).toContain('classify-2'); // colliding snippet id renamed
    expect(ids).toContain('branch-yes');
    expect(ids).toContain('branch-no');
    const yes = useBuilderStore.getState().nodes.find((n) => n.id === 'branch-yes')!;
    expect(yes.base.depends_on).toEqual(['classify-2']);
    expect(yes.base.when).toBe("$classify-2.output == 'yes'");
    expect(result.insertedIds).toEqual(['classify-2', 'branch-yes', 'branch-no']);
    // setPosition was called for each inserted id
    expect(positions.size).toBe(3);
    for (const id of result.insertedIds) expect(positions.has(id)).toBe(true);
  });
});
```

- [ ] **Step 6: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test insertSnippet`
Expected: module-not-found.

- [ ] **Step 7: Implement `insertSnippet`**

Create `packages/studio-core/src/snippets/insertSnippet.ts`:

```ts
import { fromWorkflowDefinition } from '../exporter/fromWorkflowDefinition';
import { layoutWithDagre } from '../hooks/useDagre'; // pure helper exported from Task 33
import { useBuilderStore } from '../store/builder-store';
import { makeUniqueId } from '../nodes/shared/makeUniqueId';
import { renameSubgraph } from './renameSubgraph';
import { parse as parseYaml } from 'yaml';

export interface InsertSnippetOptions {
  yaml: string;
  anchorPosition: { x: number; y: number };
  setPosition: (id: string, position: { x: number; y: number }) => void;
}

export interface InsertSnippetResult {
  insertedIds: string[];
}

export function insertSnippet({ yaml, anchorPosition, setPosition }: InsertSnippetOptions): InsertSnippetResult {
  const definition = parseYaml(yaml);
  const { nodes: snippetNodes } = fromWorkflowDefinition(definition);

  const existingIds = new Set(useBuilderStore.getState().nodes.map((n) => n.id));
  const idMap = new Map<string, string>();
  for (const n of snippetNodes) {
    const newId = makeUniqueId(n.id, existingIds);
    if (newId !== n.id) idMap.set(n.id, newId);
    existingIds.add(newId); // keep collisions disjoint within the snippet itself
  }

  const renamed = renameSubgraph(snippetNodes, idMap);

  const layout = layoutWithDagre(renamed); // returns Map<id, {x,y}>; same dagre params as Phase 2

  // Centroid of the laid-out subgraph
  let cx = 0, cy = 0, count = 0;
  for (const pos of layout.values()) { cx += pos.x; cy += pos.y; count += 1; }
  if (count > 0) { cx /= count; cy /= count; }

  // Translate so the centroid lands at anchorPosition
  const dx = anchorPosition.x - cx;
  const dy = anchorPosition.y - cy;

  const insertedIds: string[] = [];
  const addNode = useBuilderStore.getState().addNode;
  for (const n of renamed) {
    addNode(n);
    insertedIds.push(n.id);
    const local = layout.get(n.id) ?? { x: 0, y: 0 };
    setPosition(n.id, { x: local.x + dx, y: local.y + dy });
  }
  return { insertedIds };
}
```

If `layoutWithDagre` isn't yet exported as a pure helper from Task 33, surface the dagre call in this module with the same params (`rankdir: 'TB'`, `ranksep: 80`, `nodesep: 40`, node 180×80) — duplication is fine here; we DRY when there are >2 call sites. The Phase 4 plan should hoist it.

- [ ] **Step 8: Run, expect green**

Run: `bun --filter='@archon-studio/core' test insertSnippet`
Expected: 1 passing. The renameSubgraph + insertSnippet specs together: 5 passing.

- [ ] **Step 9: Commit**

```bash
git add packages/studio-core/src/snippets \
        packages/studio-core/tests/snippets
git commit -m "feat(snippets): renameSubgraph + insertSnippet — auto-rename + dagre + position seeding"
```

---

### Task 50: Seed snippet YAMLs (3 starters + 3 patterns) + fixture-validity test

**Files:**
- Create: `packages/studio-fixtures/src/snippets/starters/archon-feature-development.yaml`
- Create: `packages/studio-fixtures/src/snippets/starters/archon-fix-github-issue.yaml`
- Create: `packages/studio-fixtures/src/snippets/starters/archon-test-loop-dag.yaml`
- Create: `packages/studio-fixtures/src/snippets/patterns/classify-then-branch.yaml`
- Create: `packages/studio-fixtures/src/snippets/patterns/fan-out-collect.yaml`
- Create: `packages/studio-fixtures/src/snippets/patterns/loop-until-signal.yaml`
- Create: `packages/studio-fixtures/src/index.ts` — add `SNIPPET_STARTERS` and `SNIPPET_PATTERNS` constant arrays
- Create: `packages/studio-core/tests/snippets/snippet-fixtures.spec.ts` — fixture-validity round-trip

**Starters** are curated copies of three Archon bundled defaults — *not* re-exports of `loadRoundTripFixture`. Snippets and round-trip-fixtures serve different roles: round-trip fixtures are pinned to `.archon-source-pin` and exist for the killer test; snippets are user-facing starter content that may diverge (we may want to trim env-specific values out, e.g. drop hard-coded codebase paths). Independent files are clearer (advisor recommendation).

**Patterns** are net-new fragments that don't exist anywhere. They must round-trip through `fromWorkflowDefinition` cleanly — the fixture-validity test enforces this.

- [ ] **Step 1: Vendor 3 starter YAMLs**

For each of `archon-feature-development`, `archon-fix-github-issue`, `archon-test-loop-dag`:

```bash
cp packages/studio-fixtures/src/round-trip-fixtures/<name>.yaml \
   packages/studio-fixtures/src/snippets/starters/<name>.yaml
```

Then trim each: remove any `cwd:` fields and any `provider:` defaults that hard-code an org-specific value, leaving the structural workflow intact. Keep `description:` so the library tile shows it.

- [ ] **Step 2: Author 3 pattern YAMLs**

Create `packages/studio-fixtures/src/snippets/patterns/classify-then-branch.yaml`:

```yaml
name: classify-then-branch
description: Classify input, branch on result.
nodes:
  - id: classify
    command: classify
  - id: branch-yes
    prompt: |
      $classify.output indicates yes — proceed with the affirmative path.
    depends_on: [classify]
    when: "$classify.output == 'yes'"
  - id: branch-no
    prompt: |
      $classify.output indicates no — handle the negative path.
    depends_on: [classify]
    when: "$classify.output == 'no'"
```

Create `packages/studio-fixtures/src/snippets/patterns/fan-out-collect.yaml`:

```yaml
name: fan-out-collect
description: Three parallel workers feeding a single collector.
nodes:
  - id: dispatch
    command: dispatch-work
  - id: worker-a
    prompt: "Process slice A from $dispatch.output"
    depends_on: [dispatch]
  - id: worker-b
    prompt: "Process slice B from $dispatch.output"
    depends_on: [dispatch]
  - id: worker-c
    prompt: "Process slice C from $dispatch.output"
    depends_on: [dispatch]
  - id: collect
    prompt: |
      Combine results: $worker-a.output, $worker-b.output, $worker-c.output
    depends_on: [worker-a, worker-b, worker-c]
```

Create `packages/studio-fixtures/src/snippets/patterns/loop-until-signal.yaml`:

```yaml
name: loop-until-signal
description: Loop with iteration cap, stops when the body emits a 'done' signal.
nodes:
  - id: iterate
    loop:
      iteration_cap: 5
      prompt: |
        Make incremental progress on the task. End your output with 'done' if complete.
  - id: gate
    bash: |
      echo "$iterate.output" | grep -q 'done$' && exit 0 || exit 1
    depends_on: [iterate]
```

(These are Phase-3-shippable: no body-ref cycles, no fields outside the registered Zod schemas, no resources to resolve.)

- [ ] **Step 3: Update `studio-fixtures` index to expose snippet constants**

Modify `packages/studio-fixtures/src/index.ts`. Add:

```ts
export const SNIPPET_STARTERS = ['archon-feature-development', 'archon-fix-github-issue', 'archon-test-loop-dag'] as const;
export const SNIPPET_PATTERNS = ['classify-then-branch', 'fan-out-collect', 'loop-until-signal'] as const;
export type SnippetStarter = typeof SNIPPET_STARTERS[number];
export type SnippetPattern = typeof SNIPPET_PATTERNS[number];
```

`loadSnippet` already exists in this file; nothing to change there.

- [ ] **Step 4: Write the fixture-validity test**

Create `packages/studio-core/tests/snippets/snippet-fixtures.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { parse } from 'yaml';
import {
  SNIPPET_STARTERS, SNIPPET_PATTERNS, loadSnippet,
} from '@archon-studio/fixtures';
import { fromWorkflowDefinition } from '../../src/exporter/fromWorkflowDefinition';

describe('snippet fixtures', () => {
  for (const name of SNIPPET_STARTERS) {
    it(`starter '${name}' parses cleanly through fromWorkflowDefinition`, () => {
      const yaml = loadSnippet('starters', name);
      const def = parse(yaml);
      const result = fromWorkflowDefinition(def);
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  }
  for (const name of SNIPPET_PATTERNS) {
    it(`pattern '${name}' parses cleanly through fromWorkflowDefinition`, () => {
      const yaml = loadSnippet('patterns', name);
      const def = parse(yaml);
      const result = fromWorkflowDefinition(def);
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 5: Run, expect green**

Run: `bun --filter='@archon-studio/core' test snippet-fixtures`
Expected: 6 passing (3 starters + 3 patterns).

- [ ] **Step 6: Commit**

```bash
git add packages/studio-fixtures/src/snippets \
        packages/studio-fixtures/src/index.ts \
        packages/studio-core/tests/snippets/snippet-fixtures.spec.ts
git commit -m "feat(snippets): seed 3 starters + 3 patterns + fixture-validity round-trip"
```

---

### Task 51: Snippets section in `NodeLibrary` + drag/click insertion

**Files:**
- Create: `packages/studio-core/src/components/library/SnippetsSection.tsx`
- Create: `packages/studio-core/tests/components/library/SnippetsSection.spec.tsx`
- Modify: `packages/studio-core/src/components/NodeLibrary.tsx` — render `<SnippetsSection />`
- Modify: `packages/studio-core/src/components/canvas/Canvas.tsx` — extend `onDrop` to handle `kind: 'snippet'`

The snippets UI groups starters and patterns under separate subheadings. Each row carries the snippet's `description` as a tooltip and emits a `kind: 'snippet'` drag payload. Click-to-add inserts the snippet at canvas viewport center (the React Flow instance's `getViewport()` centre, projected back to flow space).

`apps/standalone` ships `yaml` as a peer dep (verify Phase 0 already pinned it; if not, add to `packages/studio-core/package.json` deps).

- [ ] **Step 1: Verify `yaml` is in core deps**

```bash
grep -n '"yaml"' packages/studio-core/package.json
```
Expected: a `"yaml": "^2.x.x"` line. If absent, `bun add --filter '@archon-studio/core' yaml@^2` and commit the manifest update separately.

- [ ] **Step 2: Write the failing test**

Create `packages/studio-core/tests/components/library/SnippetsSection.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { SnippetsSection } from '../../../src/components/library/SnippetsSection';
import { PositionProvider } from '../../../src/hooks/PositionContext';
import { useBuilderStore } from '../../../src/store/builder-store';
import type { UsePositionPersistence } from '../../../src/hooks/usePositionPersistence';

beforeAll(() => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register(); });
beforeEach(() => useBuilderStore.getState().clearWorkflow());

const stubPersistence: UsePositionPersistence = {
  positions: new Map(),
  setPosition: () => undefined,
  setMany: () => undefined,
  reset: () => undefined,
};

const renderWithPositionStub = (ui: React.ReactElement) =>
  render(
    <ReactFlowProvider>
      <PositionProvider value={stubPersistence}>{ui}</PositionProvider>
    </ReactFlowProvider>,
  );

describe('SnippetsSection', () => {
  it('renders starter and pattern headings + 3 rows under each', () => {
    renderWithPositionStub(<SnippetsSection />);
    expect(screen.getByText(/starters/i)).toBeDefined();
    expect(screen.getByText(/patterns/i)).toBeDefined();
    expect(screen.getByLabelText(/Insert snippet classify-then-branch/i)).toBeDefined();
  });

  it('click-to-add inserts a snippet into the store', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'host', description: '', base: {}, unknown: {} }, nodes: [],
    });
    renderWithPositionStub(<SnippetsSection />);
    fireEvent.click(screen.getByLabelText(/Insert snippet classify-then-branch/i));
    const ids = useBuilderStore.getState().nodes.map((n) => n.id);
    expect(ids).toEqual(['classify', 'branch-yes', 'branch-no']);
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `bun --filter='@archon-studio/core' test SnippetsSection`
Expected: module-not-found.

- [ ] **Step 4: Implement `SnippetsSection`**

Create `packages/studio-core/src/components/library/SnippetsSection.tsx`:

```tsx
import {
  SNIPPET_STARTERS, SNIPPET_PATTERNS, loadSnippet,
} from '@archon-studio/fixtures';
import { LIBRARY_DRAG_MIME, encodeLibraryDrag } from './dragPayload';
import { insertSnippet } from '../../snippets/insertSnippet';
import { usePositionContext } from '../../hooks/PositionContext';

export function SnippetsSection() {
  // Click-to-add lands at {x:0,y:0} for keyboard parity with Variants click. Drag uses Canvas onDrop.
  // Reads the same persistence handle that WorkflowBuilder provided in Task 47 — never re-runs the hook.
  const { setPosition } = usePositionContext();

  const insertAtOrigin = (category: 'starters' | 'patterns', name: string) => {
    insertSnippet({
      yaml: loadSnippet(category, name),
      anchorPosition: { x: 0, y: 0 },
      setPosition,
    });
  };

  return (
    <section style={{ padding: 12 }}>
      <h3 style={headingStyle}>Snippets</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SnippetGroup label="Starters" category="starters" names={SNIPPET_STARTERS} onActivate={insertAtOrigin} />
        <SnippetGroup label="Patterns" category="patterns" names={SNIPPET_PATTERNS} onActivate={insertAtOrigin} />
      </div>
    </section>
  );
}

function SnippetGroup({
  label, category, names, onActivate,
}: {
  label: string;
  category: 'starters' | 'patterns';
  names: readonly string[];
  onActivate: (category: 'starters' | 'patterns', name: string) => void;
}) {
  return (
    <div>
      <div style={subheadingStyle}>{label}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              aria-label={`Insert snippet ${name}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  LIBRARY_DRAG_MIME,
                  encodeLibraryDrag({ kind: 'snippet', category, name }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onActivate(category, name)}
              style={rowStyle}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const headingStyle: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--studio-muted)', margin: '0 0 8px 0',
};
const subheadingStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--studio-fg)', marginBottom: 4,
};
const rowStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '6px 8px', fontSize: 13,
  background: 'transparent', color: 'var(--studio-fg)',
  border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
  cursor: 'grab',
};
```

- [ ] **Step 5: Render `<SnippetsSection />` inside `NodeLibrary`**

Modify `NodeLibrary.tsx` — replace the `{/* Snippets section — Task 51 */}` comment with `<SnippetsSection />` and add the import.

- [ ] **Step 6: Extend Canvas `onDrop` to handle `kind: 'snippet'`**

Modify `packages/studio-core/src/components/canvas/Canvas.tsx`. In the `onDrop` handler from Task 47, add the snippet branch:

```tsx
import { loadSnippet } from '@archon-studio/fixtures';
import { insertSnippet } from '../../snippets/insertSnippet';

// inside onDrop, after the existing variant branch:
if (payload.kind === 'snippet') {
  insertSnippet({
    yaml: loadSnippet(payload.category, payload.name),
    anchorPosition: flowPos,
    setPosition,
  });
}
```

- [ ] **Step 7: Run, expect green**

Run: `bun --filter='@archon-studio/core' test`
Expected: SnippetsSection (2), insertSnippet (1), renameSubgraph (4), snippet-fixtures (6), all priors green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(library): Snippets section + Canvas onDrop snippet branch"
```

---

### Task 52: Manual visual smoke + Phase 3 verification + push + tag

**Files:**
- None (verification only).

This is the parity-with-spec gate. Open the standalone, exercise every Phase 3 surface, take a screenshot for posterity, then push and tag.

- [ ] **Step 1: Run all tests + lint + format**

```bash
bun run lint
bun run format:check
bun --filter='*' run test
bun --filter='*' run build
```
Expected: all green. If anything fails, fix and re-run before proceeding.

- [ ] **Step 2: Run round-trip drift safety**

```bash
bun run check-schema-drift
bun --filter='@archon-studio/core' test round-trip
```
Expected: schema-drift green; round-trip green for all 21 bundled defaults + smoke. (Phase 3 should NOT have touched the schema mirror or the importer/exporter; if these fail, an unintended regression slipped in.)

- [ ] **Step 3: Manual visual smoke — standalone shell**

Run: `bun --filter='@archon-studio/standalone' run dev`
Open `http://localhost:5173`. Verify, in this exact sequence:

1. Left rail shows three sections: **Variants** (7 tiles, distinct color stripes), **Commands** (`classify`, `review` from the stub), **Snippets** (Starters / Patterns subheadings).
2. Click each variant tile in turn — a node of that variant appears at canvas origin; its renderer matches the visual table from Task 44 (loop has `cap N` or `loop` badge, approval has orange + "approval" badge, cancel has red + "cancel" badge, etc.).
3. Drag a `prompt` tile to canvas at any position — node appears under the cursor.
4. Drag the `classify` row from Commands → a `command` node lands with `data.command === 'classify'` and id `run-classify`.
5. Click **classify-then-branch** under Snippets → three nodes (`classify`, `branch-yes`, `branch-no`) appear; edges are dashed-purple into `branch-yes` and `branch-no` (because they have `when:`); `classify` here is the snippet's id and may have been auto-renamed to `classify-2` if you'd already added a `classify` from step 2.
6. Drag **fan-out-collect** to the canvas at a chosen anchor — five nodes appear centred on the drop point with proper edges; positions persist across reload.
7. Reload the browser — entire graph including snippet inserts is in the same place.
8. Reset Layout button — re-runs dagre, all positions overwritten, snippet inserts move to dagre-chosen positions; localStorage cleared per Task 34's reset semantics.

If anything is wrong, file a bug against the appropriate task and fix before tagging.

- [ ] **Step 4: Capture a screenshot**

Save a screenshot of the standalone showing all three library sections + several variant types on the canvas to `docs/superpowers/screenshots/phase-3-smoke.png` (mkdir if needed). Reference it in the Phase 3 deliverables checklist below.

- [ ] **Step 5: Update phases.md**

Mark Phase 3 as **Planned ✅ Reviewed (after this chunk passes review) ✅ Executed (after Step 6) ✅** in `phases.md`.

- [ ] **Step 6: Push + tag**

```bash
git push origin main
git tag -a phase-3 -m "Phase 3: NodeLibrary + per-variant Renderers + snippets"
git push origin phase-3
```

- [ ] **Step 7: Update Phase 3 deliverables checklist below**

---

## Phase 3 deliverables checklist

- [ ] `VariantDefinition.Renderer` slot filled; `deriveFlow` emits `type: variant` + pass-through `BuilderNode`; nodeTypes built from registry; DagNodeComponent retired (Task 42)
- [ ] `NodeShell` shared visual primitive with optional badge / secondary slots (Task 43)
- [ ] All 7 per-variant Renderers — distinct stripes, variant-appropriate badges and secondaries (Task 44)
- [ ] `makeUniqueId` pure helper + `addNodeFromVariant` store action with `idHintOverride` / `dataPatch` (Task 45)
- [ ] `NodeLibrary` shell + Variants section + click-to-add wired through `addNodeFromVariant` (Task 46)
- [ ] `PositionProvider` + `usePositionContext` so Canvas and SnippetsSection share one persistence handle; library drag payload codec + Canvas `onDrop` / `onDragOver` projecting screen → flow position (Task 47)
- [ ] Commands section pulls from `WorkflowApiClient.listCommands` via TanStack Query; click-to-add and drag both prefill `data.command` (Task 48)
- [ ] `renameSubgraph` (id + depends_on + when string refs) + `insertSnippet` (importer → rename → dagre → translate → seed positions) (Task 49)
- [ ] 3 starter snippets (curated bundled defaults) + 3 pattern snippets (classify-then-branch, fan-out-collect, loop-until-signal) + fixture-validity test (Task 50)
- [ ] Snippets section in `NodeLibrary` + Canvas `onDrop` snippet branch (Task 51)
- [ ] Manual visual smoke + screenshot + push + `phase-3` tag (Task 52)
