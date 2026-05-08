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
