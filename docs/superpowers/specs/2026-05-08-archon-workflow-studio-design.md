---
title: Archon Workflow Studio — design
date: 2026-05-08
status: approved
target_repo: archon-workflow-studio (this repo)
upstream_target: https://github.com/coleam00/Archon
---

# Archon Workflow Studio — design

## TL;DR

Archon Workflow Studio is a TypeScript package — `studio-core` — that delivers a complete React-Flow-based visual editor for Archon workflows. It ships in two runtime modes from one codebase: a **standalone** Vite app for the Dynamous community, and a **drop-in replacement** for the workflow-builder components inside Archon's own `packages/web/`. The studio closes the gap in Archon's existing builder, which today supports only 3 of 7 node variants and silently drops most base fields on save. The studio supports all 7 variants (`command`, `prompt`, `bash`, `script`, `loop`, `approval`, `cancel`), preserves every field byte-equivalent through a forward-compatible `_unknown` bag, validates against Archon's canonical Zod schemas (mirrored with a CI drift check), and saves via the existing Archon REST API (`PUT /api/workflows/<name>?cwd=…`). v1 also ships a visual `when:` builder, a live YAML preview, undo/redo, multi-select copy/paste, inline `$nodeId.output` autocomplete, three theme presets, and a starter snippets library seeded from Archon's bundled defaults.

## 1. Background

### 1.1 What Archon is

Archon (https://github.com/coleam00/Archon) — *the current TypeScript "harness builder for AI coding"*, not the older Python "task management + RAG" version which has been moved to the `archive/v1-task-management-rag` branch — is a Bun + TypeScript monorepo. Workflows are **YAML files** living in `.archon/workflows/` (project, `~/.archon/workflows/` global, or bundled with the binary). The web UI is React 19 + Vite + `@xyflow/react ^12.10.1` + `@dagrejs/dagre ^2.0.4`. The HTTP API is Hono with `@hono/zod-openapi`.

A workflow is a DAG of nodes — there is no edges array. Every node lists its parents in `depends_on`. The canonical schema lives in `packages/workflows/src/schemas/` and defines exactly seven mutually-exclusive node variants. The variant is identified by which key is present (no `type` discriminator). Cross-node data flow is plain string interpolation of `$nodeId.output` (and optionally `$nodeId.output.field` when an upstream node has produced JSON via `output_format`). Conditional gating is via a restricted `when:` grammar; parent-completion gating is via `trigger_rule`.

The complete reference for what we are designing against — including verbatim Zod schemas, every field's meaning, all REST endpoints, validation rules, execution semantics, and worked YAML examples — is `.research/archon-workflows.md` in this repo.

### 1.2 The gap we're closing

| Engine variant | Recognised by parser/executor | Drag from Archon's NodeLibrary | Editable in Archon's NodeInspector | Round-trips through Archon's `reactFlowToDagNodes` |
| --- | --- | --- | --- | --- |
| `command` | yes | yes | yes | yes |
| `prompt` | yes | yes | yes | yes |
| `bash` | yes | yes | yes | yes |
| `script` | yes | **no** | **no** | **no — silently coerced to `prompt`** |
| `loop` | yes | **no** | **no** | **no — silently coerced** |
| `approval` | yes | **no** | **no** | **no — silently coerced** |
| `cancel` | yes | **no** | **no** | **no — silently coerced** |

Beyond the 4 missing variants, Archon's existing exporter also drops most base fields (`mcp`, `skills`, `hooks`, `agents`, `output_format`, `sandbox`, `betas`, `fallbackModel`, `systemPrompt`, …) even on the 3 variants it covers. A workflow round-tripped through the existing builder loses real engine config silently.

### 1.3 Audience

Primary: Dynamous community members who run Archon locally and want to author workflows visually with all node types supported. Secondary: Archon maintainers, as the eventual upstream PR target.

## 2. Goals and non-goals

### 2.1 Goals (v1)

1. Full coverage of all 7 node variants — drag-from-library, dedicated inspector panels, and full round-trip serialization.
2. Byte-equivalent field preservation on import/export, including fields the studio has no UI for (forward-compat).
3. Connected-mode persistence: list / load / validate / save against a running Archon via its existing REST API.
4. Three-level validation (instant client + debounced client + canonical server) with a unified Problems panel.
5. Visual `when:` builder that renders Archon's restricted grammar as a structured UI.
6. Live read-only YAML preview pane with syntax highlighting and click-to-focus into the canvas.
7. Editor polish: undo/redo, multi-select, copy/paste, cascading rename, inline `$nodeId.output` autocomplete.
8. Three theme presets (`archon-dark`, `light`, `high-contrast`) plus an `inherit` preset for the embedded mode.
9. Snippets library seeded from Archon's bundled default workflows.
10. The package is structured so it is **a literal drop-in replacement** for Archon's existing `packages/web/src/components/workflows/*` when the upstream PR lands.

### 2.2 Non-goals (v1; deferred to v1.5+)

- Test-run launcher and live execution monitor (Archon already has `WorkflowExecution.tsx` / `WorkflowDagViewer.tsx` for this; v1.5 either reuses them embedded or builds a thin runner).
- Bidirectional YAML editing (preview is read-only).
- Public community gallery (snippets ship in `studio-fixtures/`; community contribution path is "open a PR").
- Workflow diff viewer.
- Collaborative / multi-user editing.
- Custom user-defined themes.
- Auth (assumes Archon's default no-auth localhost; header pluggable but unused).
- Upstream PR for a public Level-3 resource validation endpoint (we PR this as a stretch contribution).

## 3. Approach decisions (already made)

These three decisions shaped the rest of the design and are recorded here as the inputs to it:

1. **Positioning: drop-in replacement.** Build a TypeScript package that runs standalone for the community AND can be consumed inside Archon's `packages/web` as a replacement for the existing builder. Tech stack must match Archon exactly (React 19, Vite, `@xyflow/react ^12.10.1`, `@dagrejs/dagre`, Tailwind 4, TanStack Query, radix/shadcn primitives, Zod).
2. **Standalone use case: connected mode.** User has a running Archon (locally or reachable), configures the URL once, and the studio talks to `/api/workflows`, `/api/workflows/validate`, `/api/codebases`, `/api/commands` directly. No own backend for persistence; no offline-only design-then-export workflow as primary path.
3. **v1 scope: Approach B — "Better than Archon's".** Closes the variant gap, fixes the field-drop bug, plus the visual `when:` builder, live YAML preview, undo/redo, copy/paste, autocomplete, theme picker, and snippets library. Excludes test-run / live execution / run history / diff viewer / gallery — those are v1.5 candidates.

## 4. Architecture

### 4.1 Repo layout

Bun workspaces monorepo, mirroring Archon's structure so the upstream PR is essentially `cp -r packages/studio-core/src/* archon/packages/web/src/components/workflow-studio/` plus removing the old builder. **Tooling pins match Archon at the SHA in `.archon-source-pin`**: Bun `^1.3.0`, TypeScript `^5.3.0`, React `^19.0.0`, Vite `^6.0.0`, `@xyflow/react ^12.10.1`, `@dagrejs/dagre ^2.0.4`, Tailwind `^4.0.0` + `@tailwindcss/vite`, `@tanstack/react-query ^5.0.0`, `zustand ^5.0.12`, Zod `^3.25.28`. Each package has its own `tsconfig.json` (Archon does not use a shared base config — we match).

```
archon-workflow-studio/
├── package.json                      # Bun workspaces root
├── packages/
│   ├── studio-core/                  # the library (drop-in target)
│   │   ├── src/
│   │   │   ├── components/           # WorkflowBuilder, Canvas, NodeLibrary, …
│   │   │   ├── nodes/                # 7 variant folders + shared/
│   │   │   ├── hooks/
│   │   │   ├── api/                  # WorkflowApiClient interface
│   │   │   ├── schemas/              # mirrored Archon Zod (CI drift-checked)
│   │   │   ├── exporter/             # React Flow ⇄ DagNode (all 7 variants)
│   │   │   ├── theme/                # CSS-vars, presets
│   │   │   └── index.ts              # public exports
│   │   └── package.json              # peer deps: react 19, @xyflow/react ^12
│   ├── studio-api-archon/            # default WorkflowApiClient (Hono REST)
│   └── studio-fixtures/              # snippets + sample workflows for tests
├── apps/
│   └── standalone/                   # the standalone Vite shell
│       ├── vite.config.ts            # dev proxy to user's Archon
│       └── src/                      # connect / list / builder routes
└── docs/superpowers/specs/           # this doc and future specs
```

### 4.2 Two runtime topologies, one library

- **Mode A — standalone (Dynamous use):** `apps/standalone` consumes `studio-core` and `studio-api-archon`. Talks HTTP to a user-configured Archon URL. Vite dev proxy bypasses CORS in dev; a tiny Bun HTTP server proxies `/api/*` in prod-standalone so users get a single `bun run start`.
- **Mode B — embedded in Archon (upstream PR):** Archon's `packages/web` imports `studio-core`. A 30-line adapter wraps Archon's existing `apiClient` to satisfy `WorkflowApiClient`. Same process; no CORS; same origin.

### 4.3 The seam: `WorkflowApiClient`

`studio-core` is HTTP-agnostic. It defines a `WorkflowApiClient` interface (`list / get / validate / save / delete / listCommands / listProviders / listCodebases`) and consumes it via React context. Standalone mounts the default REST client; embedded mode mounts an adapter over Archon's internal `apiClient`. Same components, same hooks, no forks.

### 4.4 Schema strategy

`studio-core/schemas/` mirrors Archon's `packages/workflows/src/schemas/{workflow,dag-node,loop,retry,hooks}.ts` verbatim. A CI script fetches Archon's source files at the SHA recorded in `.archon-source-pin` and diffs against ours; drift fails the build. We do not take a runtime dep on `@archon/workflows` because that pulls in Bun-isms and the executor; staying lean keeps `bun install && bun run start` viable for any user.

## 5. Components & data flow

### 5.1 Layout (top-level)

`<WorkflowBuilder>` renders five regions:
- **Toolbar** (top): workflow name + description, undo/redo, validate, save, theme picker, codebase pill, settings.
- **NodeLibrary** (left, 240 px): quick-add tiles per variant; commands list (from `/api/commands`); snippets section (from `studio-fixtures`).
- **Canvas** (center): React Flow with dagre auto-layout; `dagre rankdir: 'TB'`, `ranksep: 80`, `nodesep: 40`, node 180×80, smoothstep edges, dashed purple edges into nodes that have `when:`.
- **Inspector** (right, 320 px): variant-aware tabs (General / Execution / Provider / Tools / Hooks / Skills+MCP / Advanced). Tab visibility driven by variant capabilities.
- **YamlPreview** (right drawer): toggles in over the inspector; read-only; syntax-highlighted; click a YAML key → focus node.
- **ValidationPanel** (bottom drawer): Errors / Warnings / Info; click row → focus node + open relevant inspector tab.

### 5.2 State architecture

Three layers, with workflow JSON as the single source of truth:

1. **TanStack Query** for server state: workflow list, individual workflows, commands, providers, codebases. Cache + mutations. Mirrors Archon's existing pattern.
2. **Zustand store (`builder-store`)** for editor state: the in-flight `WorkflowDefinition` JSON, current selection, history (past/future for undo), UI prefs (yaml pane open, theme, library filter). Workflow JSON is authoritative; everything else derives.
3. **React Flow internal state** for spatial state only: positions, hover, drag, marquee selection. Never authoritative for workflow content.

Store actions: `loadWorkflow`, `updateNode(id, patch)`, `addNode(variant, position)`, `deleteNodes(ids)`, `connect(source, target)`, `disconnect(source, target)`, `renameNode(oldId, newId)` — the last action cascades through every `depends_on`, every `when:` string, and every `$nodeId.output` body reference.

### 5.3 Save round-trip

```
edit → store.updateNode → selectors recompute → React Flow re-renders →
useBuilderValidation runs (instant) → debounced 300 ms → POST /api/workflows/validate →
ValidationPanel updates → user clicks Save → exporter(workflow) → JSON definition →
PUT /api/workflows/:name?cwd=… → Archon writes <cwd>/.archon/workflows/<name>.yaml
```

### 5.4 Position handling

Archon's YAML schema has no positions field, and `WorkflowApiClient` does not include a sidecar-file write method (it intentionally maps only to existing Archon HTTP endpoints). Therefore: layout is computed with dagre on load, and user-tweaked positions persist to **`localStorage`** keyed by `<archonUrl>::<cwd>::<workflowName>`. Positions survive reloads on the same browser; they never pollute Archon's authoritative YAML; and they require no upstream API change. Sidecar-on-disk is a v1.5 candidate that would require a `WorkflowApiClient.savePositions` method and a new Archon endpoint.

## 6. Node-type system

### 6.1 The registry pattern

One folder per variant, all conforming to the same `VariantDefinition<TData>` contract. Importer, exporter, library, inspector, and validator are all iterations over the registry. Adding an 8th variant is one folder + one registry line.

```
nodes/
├── registry.ts                       # central VariantRegistry
├── shared/
│   ├── BaseFieldsTabs.tsx            # Execution / Provider / Tools / Hooks / Advanced
│   ├── WhenBuilder.tsx               # visual when: editor
│   ├── DependsOnEditor.tsx           # chip-list backup
│   ├── pickBaseFields.ts             # extract base fields, preserve unknowns
│   └── detectVariant.ts              # which key present → variant id
├── command/        index.ts · Renderer · Inspector · fromDag · toDag
├── prompt/         …same shape…
├── bash/           …
├── script/         …
├── loop/           …
├── approval/       …
└── cancel/         …
```

### 6.2 Variant contract

```ts
interface VariantDefinition<TData> {
  id: VariantId;                          // 'command' | 'prompt' | … | 'cancel'
  discriminator: keyof DagNode;           // matches Archon's superRefine

  capabilities: {
    honorsAiFields: boolean;              // false → bash/script/cancel/approval ignore provider/model/tools at runtime
    forbidsRetry: boolean;                // true for loop
    requiresInteractive?: boolean;        // approval, interactive loop
  };

  library: { label, color, icon, description, defaultIdHint };

  Renderer: React.FC<NodeProps<TData>>;
  Inspector: React.FC<InspectorProps<TData>>;

  schema: ZodSchema<TData>;               // mirrors Archon's per-variant Zod
  createDefault: () => TData;

  fromDagNode: (raw: DagNode) => TData;
  toDagNode: (data: TData) => Partial<DagNode>;

  validate?: (data, ctx) => Issue[];      // instant variant-specific rules
}
```

### 6.3 The forward-compat `_unknown` bag

The preservation rule is **opaque-by-default at every level**:

1. **Top-level base fields not in our schema** at import time go into `_unknown: Record<string, unknown>` on the store node. On export, `_unknown` is spread back into the DagNode body alongside known fields.
2. **Known top-level fields** (like `hooks`, `agents`, `output_format`, `sandbox`) are stored verbatim in their declared shape. Our typed inspector edits the parts it understands and never strips unknown sub-keys — when we replace a known object's value, we deep-merge the user's edits onto the original object so foreign sub-keys survive. (Concretely: each field-editor receives the original value, returns a partial patch; the store applies the patch with `lodash.merge` semantics rather than wholesale replacement.)
3. **The Inspector** exposes an optional **Raw fields** advanced panel (collapsed by default) that displays + edits `_unknown` as JSON. It also exposes a "Raw view" toggle on each known-field editor for power users who want to see / edit the underlying object verbatim.

Result: a workflow round-tripped through the studio is byte-identical for every field except positions (not stored on the wire) and key-ordering normalisations performed by Archon's `Bun.YAML.stringify` server-side. The killer round-trip test (§12.5) verifies this on every CI run.

### 6.4 Inspector composition

The General tab is variant-specific. The base-field tabs (Execution, Provider, Tools, Hooks, Skills+MCP, Advanced) are shared, with their visibility driven by `variant.capabilities`:
- Bash: General + Execution only (no AI tabs).
- Script: General + Execution only.
- Cancel: General + Execution only.
- Approval: General + Execution only.
- Loop: all tabs except Retry (forbidden).
- Command, Prompt: all tabs.

## 7. Editor features

### 7.1 Visual `when:` builder

Implements Archon's grammar: `ATOM ::= '$' nodeId ('.output')? ('.' field)? OPERATOR "'" stringValue "'"`, joined by `&&` / `||`, no parens, AND > OR.

Two modes, content preserved on toggle:
- **Visual:** AND-groups rendered as boxes; OR creates a new box. Each atom row: [node picker] [.output] [.field picker — autocompleted from upstream `output_format`] [operator] [string value]. The `.field` value field becomes a dropdown if the upstream's `output_format` declares an enum.
- **Raw:** textarea with live grammar validation and a known-nodes hint.

Output is always the canonical Archon string. AND-groups-as-boxes structurally enforces the precedence rule so users cannot accidentally produce ungrammatical expressions.

### 7.2 Live YAML preview

Right-side drawer that toggles in over the inspector. Read-only in v1. Generated from `store.workflow` via the exporter and the `yaml` npm package (browser-side). Syntax-highlighted with `highlight.js` + `rehype-highlight` to match Archon's existing rendering stack (Archon already uses these for markdown / code in `react-markdown`). We build a line→node map during YAML generation; hovering a `- id: classify` line highlights and centers the corresponding node on the canvas. Click selects.

The preview is **display-only**, not the canonical disk format. Archon's server is the canonical YAML producer (via `Bun.YAML.stringify` in the PUT handler). The studio's preview YAML may differ from the on-disk YAML in non-semantic ways (key ordering, quoting style, blank-line normalisation). **Round-trip equivalence is asserted on Archon's *server-written* YAML, not on our client preview** — see §12.5. The preview is honest: a small "preview formatting may differ from on-disk" note is shown beside the YAML drawer header. Bidirectional editing deferred to v1.5.

### 7.3 Snippets library

Two categories:
- **Starters** — full workflows seeded from Archon's bundled defaults (`archon-feature-development.yaml`, `archon-fix-github-issue.yaml`, `archon-test-loop-dag.yaml`, etc.).
- **Patterns** — subgraph fragments (classify-then-branch, fan-out + collect, loop-until-signal, approval-gated commit).

Snippets are YAML files in `packages/studio-fixtures/src/snippets/`. Inserting a pattern runs the importer to produce store nodes, renames IDs to avoid collisions, dagre-lays-out the new region near the viewport center, merges into the existing graph. Same machinery as opening a workflow — no special-case path.

### 7.4 Supporting cast

- **Inline `$nodeId.output` autocomplete** in prompt / bash / script / loop-prompt / approval-message bodies. Typing `$` opens a dropdown of upstream node IDs and (when they have `output_format`) their typed fields.
- **Undo/redo** at the workflow-JSON level (Cmd-Z / Cmd-Shift-Z). Position-only changes are not history events.
- **Multi-select & copy/paste.** Shift+click or marquee. Cmd-C copies the selection as a JSON subgraph; Cmd-V pastes with auto-renamed IDs (`classify` → `classify-2`) and `depends_on` remapped.
- **Cascading rename.** Renames cascade through every `depends_on`, every `when:` string, and every `$<old>.output` body reference.
- **Smart edges.** Solid for plain depends_on, dashed purple when target has `when:`, label-tagged when `trigger_rule` is non-default. Mirrors Archon's existing visual language.
- **Dependency chip-editor backup** in the inspector for offscreen parents.

## 8. Validation strategy

Four passes feeding one panel. The pipeline is **sequential**, not parallel: each pass kicks off the next, so the user perceives one progressive refinement, not four overlapping queries.

1. **Instant client (every render).** Workflow name passes `isValidCommandName`, description present, ≥1 node, per-node ID unique + non-empty, exactly one variant key present, variant-specific instant rules (e.g., bash body non-empty, loop's `gate_message` present when `interactive: true`).
2. **Debounced client (300 ms after last edit).** Cycle detection (Kahn's), dangling `depends_on`, broken `$nodeId.output` references in `when:` / prompt / bash / script / loop-prompt / approval-message bodies (markdown code blocks stripped first, mirroring Archon).
3. **Server, fired immediately after the client debounced pass settles** (so effective end-to-end latency is ~300 ms client debounce + 30–200 ms server round-trip — *not* 600 ms double-debounce). `POST /api/workflows/validate` is the canonical Zod + DAG truth. If a new edit lands while the server query is in flight, the in-flight request is cancelled (TanStack Query mutation cancellation) and the cycle restarts. Errors merged into the panel; if server disagrees with client, server wins.
4. **On-demand resource resolution.** "Resolve resources" button. Best-effort cross-check: `command:` names verified against `/api/commands`; for `mcp:`, `skills:`, named `script:`, surface a soft warning ("can't verify offline — will fail at run time if missing"). v1.5 contributes a `POST /api/workflows/validate-resources` endpoint upstream.

ValidationPanel: collapsible bottom drawer. Three sections (Errors, Warnings, Info) with severity icons. Click row → focuses corresponding node, opens relevant inspector tab. Workflow-level issues link to toolbar fields.

## 9. Connected-mode UX

### 9.1 First-launch flow

1. **Connect.** URL field (default `http://localhost:3737`); Test button hits `GET /api/openapi.json`. Show server version on success. Offer "remember this URL" (localStorage).
2. **Pick a working directory (`cwd`).** Two paths, with progressive enhancement based on what Archon exposes:
    - **Default path (works against any Archon):** a settings field where the user pastes / picks an absolute path matching one of their Archon's registered codebases. The studio remembers this in localStorage. If the user gets it wrong, `GET /api/workflows?cwd=…` returns a 4xx and we explain.
    - **Enhanced path (when `GET /api/codebases` exists):** the studio fetches the list and shows a dropdown picker. Auto-selects if exactly one is registered. This is the better UX, but **the manual-cwd default ships in v1 regardless** — `GET /api/codebases` is a progressive enhancement, not a v1 requirement. (See §14.1 — verification + optional upstream contribution.)
3. **Workflow list.** `GET /api/workflows?cwd=<cwd>`. Group by source (project / global / bundled); filter by tag. Project workflows have edit/delete; bundled offer view + fork.
4. **Edit / validate / save.** Save runs canonical validate first, then `PUT /api/workflows/<name>?cwd=<cwd>` body `{definition}`. On 200: toast + cache invalidation. On 400: errors surface inline. Names must satisfy `isValidCommandName` (no `/`, `\`, `..`, no leading `.`).

The connection state is also visible always-on as a toolbar pill ("connected to: localhost:3737 · `<cwd>` ▾") for codebase switching mid-session.

### 9.2 Edge cases

- **Bundled-default name collision.** Archon's precedence is `bundled < global < project`. Saving a project workflow named `archon-feature-development` shadows the bundled one for that codebase. Surface a blue info banner explaining this is reversible.
- **Forking a bundled default.** Archon refuses `DELETE` of bundled but allows `PUT` to shadow them. "Fork" loads the bundled definition into the builder cleared of source flag; saving creates a project shadow.
- **Workflow contains fields newer than our schema.** Handled by the `_unknown` bag (§6.3). Inspector's Raw fields panel surfaces them; save preserves byte-equivalent.
- **Connection drops mid-edit.** Server validation queries fail silently; bottom panel turns yellow with "lost connection — using local validation only · retry"; Save shows "offline" and queues the save for retry. Edits persist in localStorage.
- **Codebase has zero workflows.** Empty state with "Start blank" and "Pick a snippet."
- **Auth.** v1 assumes Archon's default no-auth localhost. The client picks up an `Authorization` header from a settings field if configured. Forward-compatible, unused by default.

## 10. Theming

All studio styles read from `--studio-*` CSS variables. Four presets:
- `archon-dark` — matches Archon's existing palette (the embed default).
- `light`
- `high-contrast` — accessibility preset.
- `inherit` — defines `--studio-*` as `var(--archon-token, fallback)` so embedded studio components consume Archon's design tokens automatically.

`<ThemeProvider preset="…">` sets `data-studio-theme` on `:root`. Standalone exposes a theme picker; embedded defers to the host's theme switcher. No custom user themes in v1.

## 11. Error handling

- **Render errors.** `<StudioErrorBoundary>` wraps the layout; on error, shows a recovery card with the workflow JSON (copy-to-clipboard) and a link to file an issue. Doesn't lose user edits.
- **Import errors.** Malformed YAML or Zod-failing definition → "this workflow has issues" overlay with raw-JSON edit affordance. User fixes, reloads.
- **Export errors.** Should be unreachable (validation gates Save). If they occur: log + toast; do NOT write a corrupted file.
- **API errors.** TanStack Query retry-with-backoff for reads. Mutations fail loud (toast + panel entry) and queue when offline (§9.2).
- **Performance ceilings.** 200+ nodes triggers virtualised inspector lists and a layout-time warning; user can opt into lazy layout.

## 12. Testing strategy

Archon uses **Bun's built-in test runner (`bun test`)** for all of its packages, not Vitest. To stay drop-in-compatible we use the same: `bun test` for `studio-core`, `studio-api-archon`, and `studio-fixtures`. The test API (`describe`, `it`, `expect`) is the same shape as Vitest, so test files port cleanly either direction. Playwright is the exception — it lives in `apps/standalone/` only, because Archon doesn't ship E2E tests and our standalone shell needs browser coverage.

Five layers:

1. **Unit (`bun test`).** Variant `fromDag`/`toDag`, schemas, cascading rename, when-builder grammar parser, cycle detection, exporter purity, importer's `detectVariant`.
2. **Component (`bun test` + `@testing-library/react`).** Inspector renders correct fields per variant; switching variant migrates data correctly; ValidationPanel updates on edits. (`bun test` runs `.tsx` directly via Bun's transpiler — no JSDOM setup needed; happy-dom is pluggable.)
3. **Integration (`bun test` + `msw`).** Mock `/api/*`; walk the connected-mode flow.
4. **E2E (Playwright, in `apps/standalone/` only).** Standalone shell: connect → pick codebase → open workflow → edit → save → reload → asserts byte-equivalent. One smoke test per variant.
5. **★ Round-trip CI (the killer test).** On every CI run, fetch every YAML in Archon's `.archon/workflows/defaults/` and `test-workflows/e2e-pi-all-nodes-smoke.yaml` at `.archon-source-pin`'s SHA. For each: parse → import → export → diff against source. Pass = trustworthy. Fail = our schema mirror drifted or exporter regressed. Until this passes for all bundled defaults *and* the all-nodes smoke test, the studio is not shippable.

## 13. Day-one scaffold (phase-0 deliverables)

Bun workspaces root, three packages, one app. All folders exist; key files are scaffolded; no business logic yet. Schema mirror in place at day 0, with `.archon-source-pin` recording the pinned commit SHA. CI workflows run from day 1 (build, test, schema-drift). The killer round-trip test exists with zero fixtures and grows as features land.

```
archon-workflow-studio/
├── package.json                      # Bun workspaces root
├── bun.lock
├── tsconfig.base.json
├── tailwind.config.ts                # mirrors Archon's tokens
├── .archon-source-pin                # commit SHA we mirrored Archon from
├── .github/
│   └── workflows/
│       ├── ci.yml                    # build · test · schema-drift
│       └── round-trip.yml            # the killer test
├── packages/
│   ├── studio-core/
│   │   ├── package.json              # peer deps: react 19, @xyflow/react ^12
│   │   ├── src/
│   │   │   ├── index.ts              # public exports
│   │   │   ├── components/           # WorkflowBuilder, Canvas, NodeLibrary,
│   │   │   │                         #   NodeInspector, ValidationPanel,
│   │   │   │                         #   YamlPreview — all empty shells
│   │   │   ├── nodes/
│   │   │   │   ├── registry.ts       # scaffold (empty registry)
│   │   │   │   ├── shared/           # empty
│   │   │   │   └── (7 variant folders, scaffolded with index.ts placeholders)
│   │   │   ├── schemas/              # mirrored Archon Zod, day 1
│   │   │   │   ├── workflow.ts
│   │   │   │   ├── dag-node.ts
│   │   │   │   ├── loop.ts
│   │   │   │   ├── retry.ts
│   │   │   │   └── hooks.ts
│   │   │   ├── api/
│   │   │   │   └── WorkflowApiClient.ts   # interface only
│   │   │   ├── store/
│   │   │   │   └── builder-store.ts       # Zustand skeleton
│   │   │   └── theme/
│   │   │       ├── tokens.css             # 4 presets (3 + inherit)
│   │   │       └── ThemeProvider.tsx
│   │   └── tests/
│   │       └── round-trip.spec.ts         # killer test (initially passes
│   │                                      #   on zero fixtures; grows w/ features)
│   ├── studio-api-archon/
│   │   ├── package.json
│   │   └── src/
│   │       └── ArchonApiClient.ts         # default impl, stubs
│   └── studio-fixtures/
│       ├── package.json
│       └── src/
│           └── snippets/                  # 3+ vendored Archon defaults
├── apps/
│   └── standalone/
│       ├── package.json
│       ├── vite.config.ts                 # dev proxy → user's Archon
│       ├── index.html
│       └── src/
│           ├── App.tsx                    # routes scaffolded
│           ├── connect/ConnectScreen.tsx  # URL + cwd settings
│           ├── workflows/WorkflowListPage.tsx
│           └── builder/BuilderPage.tsx
├── docs/superpowers/specs/2026-05-08-archon-workflow-studio-design.md   # this doc
├── README.md                          # quickstart, Mode A vs B explainer
└── .gitignore
```

**Phase-0 must also include the deliverables called out across the spec**, so the implementation plan starts on solid ground:

- The §14 verification probes resolved: confirm `GET /api/codebases` presence (settles which §9.2 path is implemented first); confirm Archon localhost auth posture; document Archon CORS headers; capture a representative `Bun.YAML.stringify` vs `yaml`-package diff.
- The killer round-trip test harness wired up with zero fixtures (the test file exists and runs green; fixtures arrive feature-by-feature).
- A round-trip baseline pass over every Archon bundled default (manual or scripted) to discover any field the schema research missed and to seed the killer-test fixtures.

## 14. Open questions / verifications needed before implementation

These are phase-0 deliverables (see §13). The studio plans for the conservative answer in each case; verifications either unblock a richer UX or confirm the conservative path.

1. **`GET /api/codebases` endpoint.** The research established that the `cwd` query param must match a registered codebase's `default_cwd` and that Archon falls back to "the first codebase" if omitted. The exact endpoint for *listing* codebases needs to be verified. **v1 plans for the conservative path** (manual `cwd` settings field, see §9.1). If `GET /api/codebases` exists, the dropdown picker is implemented as a progressive enhancement during phase-0 itself. If it doesn't exist, a v1.5 upstream contribution adds it.
2. **Auth posture.** Confirm Archon's localhost default is genuinely no-auth and that no header is required for `/api/workflows/*`. If wrong, add a settings field for `Authorization`.
3. **CORS.** Verify that Archon's Hono server does not set restrictive CORS headers that would block our standalone shell. The Vite dev proxy and the prod-standalone Bun proxy work either way, but a less-restrictive Archon CORS policy would let us drop the prod proxy entirely.
4. **YAML output equivalence.** Compare a representative `Bun.YAML.stringify(definition)` output against the `yaml` npm package's output for a complex workflow (`archon-fix-github-issue.yaml`). Identify any normalisation differences and document them so the YAML preview's mismatch is acknowledged, not surprising.
5. **Round-trip baseline.** Before phase 1, run a manual round-trip pass on every Archon bundled default to discover any schema fields the research missed and to seed the killer-test fixtures.

## 15. Glossary

- **DagNode** — Archon's term for a node in a workflow, defined in `packages/workflows/src/schemas/dag-node.ts`. The canonical wire / on-disk shape.
- **Variant** — one of the seven mutually-exclusive DagNode kinds: `command`, `prompt`, `bash`, `script`, `loop`, `approval`, `cancel`. Detected by which key is present (no `type:` discriminator).
- **`nodeId`** — the user-authored `id:` string in YAML. **This is the workflow's identifier for the node** — referenced from `depends_on`, `$nodeId.output`, `when:`, etc. Distinct from React Flow's internal `id` (which we set to the same value for convenience, but the canonical authority is the `id:` field on the DagNode).
- **`cwd`** — Archon's term for "registered codebase working directory." A query parameter on most workflow endpoints. Determines which `.archon/workflows/` is read or written.
- **Source** (of a workflow) — Archon discovery scope: `bundled`, `global` (`~/.archon/workflows/`), or `project` (`<cwd>/.archon/workflows/`). Precedence: `bundled < global < project`.
- **Studio** — this project (`archon-workflow-studio`); the visual editor.

## 16. References

- `.research/archon-workflows.md` (this repo) — the full reference for Archon's workflow data model, node variants, validation, import mechanism, execution model, and file-level citations.
- Archon repo: https://github.com/coleam00/Archon
- Archon workflow schemas: `packages/workflows/src/schemas/{workflow,dag-node,loop,retry,hooks}.ts`
- Archon existing builder: `packages/web/src/components/workflows/`
- Archon REST API: `packages/server/src/routes/api.ts`
- React Flow: `@xyflow/react ^12.10.1` — https://reactflow.dev/
- dagre: `@dagrejs/dagre ^2.0.4`
