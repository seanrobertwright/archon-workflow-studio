# Phase 7 — YAML preview pane: Design

> **Status:** Design locked 2026-05-10. Decisions below were resolved interactively before writing the plan.
>
> **Reference plan:** `docs/superpowers/plans/2026-05-10-phase-7-yaml-preview.md`.
>
> **Master design context:** `docs/superpowers/specs/2026-05-08-archon-workflow-studio-design.md` §2.1 item 6 (read-only YAML preview), §2.2 item 2 (no bidirectional YAML editing), and the v1 plan one-paragraph sketch at `docs/superpowers/plans/2026-05-08-archon-workflow-studio-v1.md:149`.

## 1. Goal

Land a live, read-only YAML preview drawer that lets the author see the canonical Archon-shape YAML their workflow will serialize to, with bidirectional click/hover linkage between the YAML and the canvas nodes.

## 2. Decisions made before planning

These four scope questions were resolved with the user; the plan implements them as written.

| # | Question | Decision |
|---|---|---|
| 1 | Where does the pane live? | **Toggleable right drawer** in the inspector slot, gated by a toolbar toggle. |
| 2 | Cross-highlight direction? | **Bidirectional with hover.** Click YAML line → select node + scroll canvas to it. Click node → highlight YAML line range + scroll preview. Hover both directions paints a transient highlight. |
| 3 | Source of truth for the preview? | **Always re-serialize** from the in-memory workflow on every store change. No fetch path. The "preview formatting may differ from disk" note is shown in the drawer header. |
| 4 | Phase 7 extras? | All four ship in Phase 7: copy-to-clipboard, download `.yaml`, diff-vs-baseline badge, search-in-preview (Ctrl+F). |

## 3. Architecture

### 3.1 Module map

```
packages/studio-core/src/
  exporter/
    serializeYaml.ts        ← NEW. Pure: LoadWorkflowInput → { yaml, sourceMap }.
                              Reuses toWorkflowDefinition() then yaml.stringify().
                              Round-trip-parses its own output with LineCounter
                              to attach node-level line ranges.
  components/preview/        ← NEW directory.
    YamlPreviewDrawer.tsx    ← Drawer shell: header (title, "may differ" note,
                              copy/download buttons, diff badge), CmEditor body,
                              footer (Ctrl+F hint).
    YamlPreview.tsx          ← The CmEditor instance: read-only, yaml language,
                              search extension, line-click handler, decoration
                              for selected/hovered node line range.
    yamlPreviewExtensions.ts ← CM6 building blocks: yamlLanguage(),
                              yamlSearch(), readOnlyExt(), rangesField,
                              highlightField (DecorationSet StateField),
                              setRanges / setHighlightTargets StateEffects,
                              domEventLineHandler({ onPick, onHover }),
                              previewBaseExtensions() bundle.
  store/
    builder-store.ts         ← MODIFIED. Adds:
                                hoveredNodeId: string | null
                                setHoveredNodeId(id|null)
                                isYamlPreviewOpen: boolean
                                setYamlPreviewOpen(boolean)
                                baselineYaml: string | null
                                _setBaselineYaml(string|null)   // internal
                              loadWorkflow() now seeds baselineYaml by
                              serializing the loaded input.
  components/
    Toolbar.tsx              ← MODIFIED. Adds a "YAML" toggle button bound
                              to isYamlPreviewOpen.
    WorkflowBuilder.tsx      ← MODIFIED. Right column slot becomes:
                                isYamlPreviewOpen
                                  ? <YamlPreviewDrawer />
                                  : <NodeInspector />.
                              Both panels share the same grid column to keep
                              canvas width stable across the toggle.
    Canvas.tsx               ← MODIFIED. onMouseEnter/Leave on each rendered
                              node sets hoveredNodeId.
```

No changes to schemas, validation, importer, or grammar packages.

### 3.2 Data flow

```
                builder-store (workflow + nodes)
                          |
                          v
            useYamlPreview() hook (memoized)
                          |
                serializeYaml(input)
                          |
        +-----------------+-----------------+
        |                                   |
        v                                   v
  yaml: string                  sourceMap: Array<NodeRange>
        |                                   |
        v                                   v
   <CmEditor>                  selectedNodeId/hoveredNodeId
   (yaml-highlighted)             |    -> NodeRange lookup
                                  v
                    Decoration: selectedLine, hoveredLine

        line-click in editor → reverse lookup → setSelectedNodeId
        node click in canvas → setSelectedNodeId → preview scrolls
        node hover in canvas → setHoveredNodeId → preview decorates
        line hover in editor → setHoveredNodeId → canvas decorates
```

### 3.3 Source map model

```ts
type NodeRange = {
  id: string;
  startLine: number;   // 1-based, line of the `- id:` token
  endLine: number;     // 1-based, last line of the node's mapping
};

type SerializeResult = {
  yaml: string;
  sourceMap: NodeRange[];   // in document order
};
```

Source map is built by:
1. `yaml.stringify(toWorkflowDefinition(input))` to produce the canonical text.
2. `yaml.parseDocument(text, { lineCounter })` to recover positions.
3. Walk `doc.get('nodes')` (a `YAMLSeq`); for each `YAMLMap` item, take `range[0]` and `range[1]`, convert with `lineCounter.linePos` to 1-based line numbers, read the `id` scalar value.

Reverse lookup: `sourceMap.find(r => line >= r.startLine && line <= r.endLine)`.

### 3.4 Diff baseline

`baselineYaml` is set by `loadWorkflow()` (called when the user opens a workflow, imports a snippet, or starts a new blank workflow). The badge compares `currentYaml !== baselineYaml` using string equality after a trailing-newline trim. No structural diff in Phase 7 — the badge is a single "Modified" pill. (Real save flow lands in Phase 9 and will reset the baseline on successful save.)

### 3.5 Drawer ↔ inspector coexistence

The `WorkflowBuilder` grid has four slots: `toolbar`, `library`, `canvas`, `inspector` (right column), plus a bottom `drawer` slot housing the Phase-6 `ValidationPanel`. Phase 7 turns **only** the `inspector` slot into single-occupancy — when the YAML drawer is open, `NodeInspector` is unmounted and `YamlPreviewDrawer` takes its place inside the same `styles.inspector` grid cell. The bottom validation drawer is **not** touched. The inspector's scroll position and edit drafts are lost on toggle, which is acceptable for v1.

### 3.6 CmEditor prep (Task 7.0.5)

The Phase-5 `CmEditor` primitive bakes its `extensions` prop at mount via a `useEffect(…, [])` and exposes no handle to the underlying `EditorView`. Phase 7 needs both. Task 7.0.5 extends `CmEditor` with:

- A `Compartment` wrapping the `extensions` prop so React-driven changes reconfigure the editor in place instead of being silently ignored.
- An optional `onCreate?: (view: EditorView) => void` callback so `YamlPreview` can capture a `viewRef` and dispatch `scrollIntoView` effects.

Existing Phase-5 callers pass stable extension arrays, so the compartment reconfigure is a no-op for them. The change is backwards-compatible.

## 4. Why CodeMirror, not highlight.js

The v1 sketch named `highlight.js + rehype-highlight`. We deviate: Phase 5 already adopted CodeMirror 6 for body-field editing (`CmEditor.tsx`), so reusing it for the YAML preview gets:

- Syntax highlighting: `@codemirror/lang-yaml`.
- Search overlay (Ctrl+F): `@codemirror/search` (free with the dep).
- Line gutter and per-line click handler: built-in.
- Line-range decoration: `Decoration.line()` with a `StateField`.
- Read-only mode: `EditorState.readOnly.of(true)`.

Only one new dep is added: `@codemirror/lang-yaml`. `@codemirror/search` is already pulled in transitively via `@codemirror/view`'s peer set in CM 6.x; if a direct dep is needed, the plan adds it explicitly.

## 5. Non-goals (Phase 7)

- Bidirectional editing (typing in the preview does not mutate the workflow). Per master spec §2.2.
- Structural diff viewer ("3 fields changed in node X"). Just a binary "Modified" pill.
- Per-character cross-highlight. Highlight is line-range-granular per node.
- Highlighting workflow-base lines (only nodes are clickable in v1). Workflow-base lines render with no decoration.
- Persisting the drawer-open toggle across reloads. Resets to closed on app load.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `yaml.stringify` formatting differs subtly from Archon's writer (multiline scalars, quoting style) | Pin `yaml@2.5.1` (already pinned). Add a serializer round-trip test against every fixture: parse → toWorkflowDefinition input shape → serialize → parse → assert deep-equal. The "may differ from disk" note in the header documents the expected reformat. |
| `lineCounter` positions are byte offsets, not line numbers | The `LineCounter.linePos(offset)` API explicitly returns `{ line, col }` (1-based). Test against a fixture with multiline scalars to confirm node ranges include the full block. |
| CM6 contenteditable resists `fireEvent.click` (Phase 5 hit this) | Test the *extension factory* in isolation: assert it returns the right `EditorState` config and that the click handler, called with a synthetic line number, dispatches `setSelectedNodeId`. Don't try to drive clicks through the rendered DOM. |
| Inspector edit drafts lost on toggle | Documented as v1 behavior. JsonField's local draft is the only victim; users see this as "I had unsaved JSON, now it's gone" — acceptable for the toggle, painful only if accidentally toggled. Toolbar button label is unambiguous. |
| Drawer toggle changes canvas width and disrupts saved positions | The toggle swaps inspector ↔ drawer in the same column — canvas width is unchanged. No position recalculation. |

## 7. Verification targets

- ~25 new tests, taking the suite from the post-Phase-6 baseline (~370) to ~395.
- Round-trip-fixture serializer test runs over all `_smoke-*.yaml` and `archon-*.yaml` fixtures (no new fixtures).
- All packages build, typecheck, lint, format, schema-drift, grammar-drift remain green.
- Manual smoke: open `_smoke-pi-all-nodes.yaml`, toggle drawer, click each node — preview scrolls and decorates; click each node-id line in the preview — canvas selects.
