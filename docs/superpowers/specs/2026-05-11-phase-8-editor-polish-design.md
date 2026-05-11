# Phase 8 — Editor polish: undo/redo, multi-select, copy/paste, alignment, theme

**Status:** Design approved 2026-05-11
**Branch base:** `phase-7`
**Predecessor:** Phase 7 (YAML preview, 440/440 tests)
**Scope flag:** This phase exceeds the roadmap's original Phase 8 brief. In addition to the five roadmap features (undo/redo, multi-select, copy/paste, theme picker, shortcut layer) it absorbs:
- The Phase 4 deferred variant-conversion UI affordance.
- A full Figma-style canvas alignment/spacing toolset (on-demand actions + smart guides + equal-spacing pips + auto-arrange selection + grid snap).

---

## 1. Goal

Make the studio feel like a 2026-grade visual editor by landing seven user-facing features on top of two new infrastructure primitives. Users should be able to multi-select, copy/paste across tabs, undo any change, align and distribute nodes with Figma-class fidelity, switch themes, and convert variants — all driven by keyboard shortcuts where it matters.

## 2. Non-goals

- **Multi-node inspector editing.** The inspector remains single-node. Multi-select drives canvas operations only.
- **Body-reference rewriting on paste.** `$nodeId.output` strings inside prompt/bash/script/loop bodies are not rewritten when IDs change. Validation panel surfaces breakage; full rewrite waits on the Phase 4 autocomplete infrastructure.
- **`when:` string rewriting on paste.** Same reasoning — surfaced by validation, not silently fixed.
- **Undo across `loadWorkflow`.** Stack clears on workflow load; cross-workflow undo is a footgun.
- **Smart guides in screen-space.** Threshold is flow-space; zoom-relative tuning is a polish backlog item.

## 3. Architecture overview

Two infrastructure primitives carry the phase:

1. **Selection model.** `selectedNodeIds: string[]` (replacing `selectedNodeId: string | null`) plus a derived `primarySelectionId` for the inspector. React Flow's built-in shift-click and marquee are enabled; selection state syncs one-way from React Flow → store via `onSelectionChange`.
2. **Undo/redo middleware.** Hand-rolled snapshot stack capturing `{ workflow, nodes, positions }` on an action-allowlist basis. Text-edit actions coalesce within a 400ms window; discrete actions snapshot immediately. Stack capped at 100, cleared on `loadWorkflow` / `clearWorkflow`.

Seven features layer on top:

| Feature | Driven by | New surface |
|---|---|---|
| Undo/redo | Undo middleware | `mod+z` / `mod+shift+z`, toolbar buttons |
| Multi-select | Selection model | RF shift-click + marquee |
| Copy/paste | Selection + clipboard | `mod+c` / `mod+v`, system clipboard JSON envelope |
| Alignment & distribution | Selection | Toolbar group (6 align + 2 distribute), enabled ≥2/≥3 |
| Smart guides + grid snap | RF `onNodeDrag` | Overlay layer + grid toggle in toolbar |
| Auto-arrange selection | Selection + dagre | Toolbar button, ≥2 selected |
| Theme picker | `localStorage` + ThemeProvider | Segmented control in toolbar |
| Variant conversion UI | Existing `convertVariant` | Dropdown on inspector General tab + confirm |
| Shortcut layer | `react-hotkeys-hook` | Single `shortcuts.ts` registry |

## 4. Undo/redo middleware

### Stack shape

`useUndoStore` is kept separate from `useBuilderStore` so the undo state is never snapshotted itself.

```ts
interface UndoSnapshot {
  workflow: WorkflowMeta | null;
  nodes: BuilderNode[];
  positions: Record<string, { x: number; y: number }>;
  label: string;   // "Add node", "Paste 3 nodes", "Align left"
  ts: number;
}

interface UndoState {
  past: UndoSnapshot[];     // oldest → newest
  future: UndoSnapshot[];   // newest → oldest (top = next redo)
  capacity: 100;
}
```

### Capture

A `withUndo(label, fn)` wrapper applied per mutating action. Before `fn` runs:
1. Read current snapshot shape from builder store.
2. Push onto `past`; trim to capacity.
3. Clear `future` (a new action invalidates the redo branch).

Coalescing handled by `withUndoCoalesced(label, fn, 400)` — used for `updateNodeData` text-field edits. Coalesce key is `${actionName}:${nodeId}:${fieldPath}` so different actions/fields never merge.

### Action classification

| Immediate snapshot | Coalesced (400ms) | Not snapshotted |
|---|---|---|
| addNode | updateNodeData (text fields) | setSelectedNodeIds |
| removeNode | | setHoveredNodeId |
| renameNode | | setFocusedIssue |
| convertVariant | | toggleYamlPreview |
| paste | | (transient UI) |
| alignSelection / distributeSelection | | (loadWorkflow — wipes stack) |
| autoArrangeSelection | | |
| setNodePosition (drag-stop, not drag-move) | | |
| dropNode | | |

### Drag handling

React Flow fires `onNodeDrag` continuously and `onNodeDragStop` once. Capture the before-state on `onNodeDragStart` (write to a holding slot, not the stack) and commit the snapshot on `onNodeDragStop`. Same pattern for marquee-multi-drag (snapshot once per drag, not per node).

### Stack-clearing events

- `loadWorkflow` — new file loaded.
- `clearWorkflow` — explicit reset.

### Excluded fields

- `baselineYaml` — per Phase 7 handoff, represents on-disk state, not user state. Including it would reset the Modified pill on undo.
- `selectedNodeIds`, `hoveredNodeId`, `isYamlPreviewOpen`, `focusedIssue` — transient UI.
- `theme` — lives in `useThemeStore` + localStorage, never in undo.

### Label surfacing

Toolbar undo/redo buttons surface the next action's label as a tooltip (`"Undo: Align left"`). Cheap discoverability win.

### `convertVariant` redo-safety

`convertVariant`'s deep-merge migration is deterministic on the input node. Undo restores the pre-convert node verbatim; redo re-runs `convertVariant` on it and produces the same output. A dedicated round-trip test pins this property.

## 5. Selection, clipboard, alignment

### Selection slice

```ts
// builder-store.ts
selectedNodeIds: string[];
primarySelectionId: string | null;        // derived: last id added
setSelection(ids: string[]): void;        // replace
addToSelection(id: string): void;         // shift-click new
removeFromSelection(id: string): void;    // shift-click already-selected
clearSelection(): void;                   // background click / Esc
```

Canvas wires `onSelectionChange({ nodes }) → setSelection(nodes.map(n => n.id))`. Each React Flow node's `selected` flag is derived in the node-conversion step from `selectedNodeIds.includes(node.id)` — never written directly.

Inspector reads `primarySelectionId`. If `selectedNodeIds.length !== 1` the inspector renders an empty/multi state.

### Clipboard

Versioned envelope:

```json
{
  "__archonStudio": "clipboard-v1",
  "exportedAt": "2026-05-11T...",
  "nodes": [
    { "id": "build", "variant": "bash", "data": {...}, "base": {...}, "unknown": {...} }
  ]
}
```

**Copy (`mod+c`):**
1. Read `selectedNodeIds`.
2. Serialize matching `BuilderNode`s verbatim (keep `_unknown`, `base.depends_on` original).
3. `navigator.clipboard.writeText(JSON.stringify(envelope))`. On rejection, write to `useClipboardStore.lastCopy` fallback slice.
4. Toast: "Copied N nodes".

**Paste (`mod+v`):**
1. Try `navigator.clipboard.readText()`; fall back to `useClipboardStore.lastCopy`.
2. Parse + validate envelope (`__archonStudio === 'clipboard-v1'`, `nodes` is an array). On failure, toast "Nothing to paste" and bail.
3. Run nodes through the same normalizer as `fromWorkflowDefinition` (preserves `_unknown`, ensures shape).
4. **ID remap.** Generate unique IDs against current store: `${id}-copy`, `${id}-copy-2`, etc. Build `Map<oldId, newId>`.
5. **`depends_on` rewrite.** Per pasted node, walk `base.depends_on`:
   - If dep is in paste set → rewrite to new ID.
   - If dep is external → drop it (paste-as-detached-subgraph semantics).
6. **Position.** Offset by `(40, 40)` from original bounding box top-left. For cross-tab paste with no anchor, drop at viewport center.
7. Single `addNodes` action → one undo snapshot labeled "Paste N nodes".
8. New nodes become the selection.

**Documented limitation:** `when:` strings and `$nodeId.output` body refs are not rewritten. Validation panel (Phase 6) surfaces resulting issues.

### Alignment kernels — `hooks/useAlignment.ts`

Pure functions: `(selection: BuilderNode[], positions: PositionMap, dims: DimMap) → PositionMap`. Dimensions sourced from `useReactFlow().getNodes()` (RF measures after render).

| Action | Behavior |
|---|---|
| Align left | All `x = min(x)` of selection |
| Align right | All `x + width = max(x + width)` |
| Align top / bottom | Mirror on y |
| Align center horizontal / vertical | All centers = mean of selection centers |
| Distribute horizontal | Sort by x; equalize gaps; outer extents fixed |
| Distribute vertical | Mirror |

Disabled in toolbar when `selectedNodeIds.length < 2` (align) or `< 3` (distribute).

### Auto-arrange selection — `hooks/useAutoArrangeSelection.ts`

Reuses dagre engine from `useDagre`:
- Input nodes = `selectedNodeIds`.
- Input edges = edges where *both* endpoints are in selection.
- Output positions translated so the bounding-box top-left of the result lands at the selection's current bounding-box top-left (in-place, no viewport reset).

## 6. Smart guides, snap-to-grid, theme, variant picker, shortcuts

### Smart guides — `components/canvas/SmartGuidesLayer.tsx`

Absolutely-positioned overlay inside the React Flow viewport (`<Panel position="top-left">`, `pointer-events: none`).

`onNodeDrag` computes via pure `computeGuides(dragged, others, threshold) → Guide[]`:

1. **Alignment lines.** For dragged node, compare each of 6 reference values (left, center-h, right, top, center-v, bottom) against the same 6 of every other node. If within **6px**, emit a guide at that coordinate spanning dragged → matched far edge.
2. **Equal-spacing pips.** When dragged node sits between two others on the same axis, compute gap-A and gap-B. If `|gapA - gapB| < 6px`, emit red "=" pips in both gaps.

**Snap-to-guide.** When a guide is active for axis X (or Y), override the drag coordinate to the matched value before writing to the store.

**Cleared on:** `onNodeDragStop`, `onSelectionChange`, Esc.

**Performance:** Memoize per-frame by hashing dragged position. Guard `if (allNodes.length > 200) return []` to keep drag responsive at scale.

### Snap-to-grid

Toolbar checkbox ("Snap to grid"). Wraps RF's `snapToGrid={enabled}` + `snapGrid={[16, 16]}`. Persisted in `localStorage` (`archon-studio:snap-grid`).

**Precedence:** when both smart guides and grid snap are on, our `onNodeDrag` override runs first; if it emits a guide-snap, the guide wins, otherwise RF's grid snap applies.

### Theme picker

**Surface:** segmented control in toolbar — three icon buttons (moon = `archon-dark`, sun = `light`, contrast = `high-contrast`), keyboard-navigable, active preset filled.

**Storage:** `useThemeStore`:

```ts
{ preset: ThemePreset; setPreset(p: ThemePreset): void }
```

`setPreset` writes `localStorage` (`archon-studio:theme`). Boot reads it, defaults to `archon-dark`.

**Standalone:** `<ThemeProvider preset={useThemeStore(s => s.preset)} />`.
**Embed:** caller passes `preset='inherit'`. Picker hidden via `showThemePicker?: boolean` prop on `WorkflowBuilder` (default `true` standalone, `false` embed).

### Variant picker — `components/inspector/general/VariantPicker.tsx`

Dropdown on the General tab, immediately below the ID input. Selecting a target variant opens a confirm modal:

> Convert *build_step* from **bash** to **agent**? Variant-specific fields will be migrated; unrecognized fields preserved in `_unknown`. This can be undone with Cmd-Z.

Buttons: Cancel / Convert. Confirm calls existing `convertVariant(id, targetVariant)`.

Hidden when `selectedNodeIds.length !== 1` (inspector itself is hidden in that case).

### Shortcut layer — `shortcuts.ts`

```ts
export const SHORTCUTS = {
  undo: 'mod+z',
  redo: 'mod+shift+z',
  copy: 'mod+c',
  paste: 'mod+v',
  cut: 'mod+x',
  delete: ['delete', 'backspace'],
  selectAll: 'mod+a',
  clearSelection: 'escape',
  alignLeft: 'mod+alt+left',
  alignRight: 'mod+alt+right',
  alignTop: 'mod+alt+up',
  alignBottom: 'mod+alt+down',
  autoArrangeSelection: 'mod+shift+a',
  toggleYamlPreview: 'mod+/',
  toggleGridSnap: "mod+'",
} as const;
```

Bound in `WorkflowBuilder` via `useHotkeys` with `enableOnFormTags: false` and `enableOnContentEditable: false` so they don't fire while typing in inspector fields or CodeMirror surfaces.

## 7. Testing strategy

Target: ~520–560 tests (Phase 7 ended at 440).

### Unit (pure)

- `useAlignment` kernels — 8 functions × (2-node, 3-node, edge-aligned-already) ≈ 24 tests.
- `clipboard.ts` ID-remap + `depends_on` rewrite — table-driven: nodes-only, with internal deps, with external deps (dropped), with collisions (`build`, `build-copy`, `build-copy-2`).
- `undo-middleware.ts` — snapshot, coalesce, branch-invalidation, capacity-trim, label-correctness.
- `computeGuides` — pure geometry; alignment-line and equal-spacing-pip cases.

### Component

- `Toolbar` — align-group disabled <2, distribute disabled <3, undo/redo tooltips reflect next stack entry, theme segmented control writes `data-studio-theme`.
- `VariantPicker` — opens confirm modal; calls `convertVariant` only on confirm; cancel is no-op.
- `SmartGuidesLayer` — structural render for a fixture `Guide[]`. (Live drag skipped — Phase 7 lesson: JSDOM doesn't paint.)

### Integration (store-level)

- Copy → paste → undo → redo preserves node identity and shape.
- Multi-select shift-click sequence matches expected `selectedNodeIds`.
- Auto-arrange selection translates bounding box correctly.
- `loadWorkflow` clears undo stack.
- `convertVariant` round-trip: state → convert → undo → assert original → redo → assert converted.

### Manual smoke (required, per Phase 7 meta-lesson)

1. Drag a node — alignment guides appear near another node's edge/center.
2. Shift-click two nodes — both highlighted; inspector shows empty/multi state.
3. Marquee-drag across three nodes — all selected.
4. `mod+c` then `mod+v` — three new nodes appear offset, inter-deps preserved.
5. Paste in a fresh tab (same origin) — nodes appear.
6. Align-left — selected nodes left-align.
7. Auto-arrange selection — selected subgraph rearranges; others untouched.
8. `mod+z` repeatedly — replays in reverse.
9. Toggle snap-to-grid — drag snaps to 16px grid.
10. Switch theme — `light` and `high-contrast` apply; reload preserves choice.
11. Variant picker: convert `bash` → `agent` → confirm → `mod+z` restores.

## 8. Error handling

- **Clipboard parse failure** → toast "Nothing to paste"; no store mutation.
- **`navigator.clipboard` rejected** → fall back to `useClipboardStore.lastCopy`.
- **Undo on empty stack** → no-op; button disabled.
- **Auto-arrange with 0 intra-selection edges** → dagre arranges as disconnected row; not an error.
- **Smart-guides at scale** → bail above 200 nodes; documented limit.
- **Variant convert deep-merge anomaly** → existing path; surfaces via validation panel.

## 9. File layout

```
packages/studio-core/src/
  shortcuts.ts                                       (new)
  store/
    builder-store.ts                                 (modified: multi-select slice)
    undo-middleware.ts                               (new)
    undo-store.ts                                    (new)
    clipboard.ts                                     (new)
    clipboard-store.ts                               (new, fallback slice)
    theme-store.ts                                   (new)
  components/
    Toolbar.tsx                                      (modified: heavy)
    Toolbar.module.css                               (modified)
    canvas/
      Canvas.tsx                                     (modified: onNodeDrag, selection sync)
      SmartGuidesLayer.tsx                           (new)
      SmartGuidesLayer.module.css                    (new)
      computeGuides.ts                               (new, pure)
    inspector/
      general/
        VariantPicker.tsx                            (new)
        VariantPicker.module.css                     (new)
        VariantConvertConfirmModal.tsx               (new)
  hooks/
    useAlignment.ts                                  (new)
    useAutoArrangeSelection.ts                       (new)
  theme/
    ThemeProvider.tsx                                (modified: read theme-store)

apps/standalone/src/App.tsx                          (modified: mount theme-store, pass showThemePicker)
```

## 10. Risks

- **React Flow selection sync drift.** RF internal selection and our store could desync. Mitigation: one-way sync RF → store; never write `selected` directly.
- **Coalesce window vs. paste-then-type.** Mitigation: coalesce key includes action/node/field, so heterogeneous actions don't merge.
- **System clipboard in tests.** JSDOM lacks `navigator.clipboard`. Tests use in-memory fallback path; manual smoke covers real clipboard (step 5).
- **Guide threshold zoom-relative.** 6px is flow-space, not screen-space. Acceptable v1; flag as polish backlog.

## 11. Dependencies added

- `react-hotkeys-hook` (^4.x) — ~5 kB, focus-scoping built-in.

No other new runtime deps. Dagre and React Flow are already in.

## 12. Definition of done

- All 7 features ship per spec.
- Manual smoke (11 steps) passes.
- Test count ≥ ~520, all green.
- `bun --filter='*' run build`, lint, format, typecheck, schema-drift, grammar-drift all green.
- Drift cheat sheet at `docs/superpowers/plans/phase-8-drift-notes.md`.
- `phase-8` annotated tag created locally; push pending user (per established practice — Phases 6 & 7 also tag-locally / push-on-user).
