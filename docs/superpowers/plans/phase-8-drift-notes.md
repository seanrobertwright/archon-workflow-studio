# Phase 8 drift notes — plan vs. codebase reality

Mirror of `phase-7-drift-notes.md`. Each entry records where the executed
code diverges from the written plan and why.

**Phase summary:** 87 new behavioral tests (440 → 527). Bundle unchanged
from Phase 7 (1,127 kB gzip 357 kB — same CM6 + React Flow + Zustand
baseline; Phase 8 adds only logic, no new heavy libraries except
`react-hotkeys-hook` ~4 kB). No new packages added to workspace
`package.json` beyond `react-hotkeys-hook`.

---

## Drift 8.1 — `selectedNodeId` was already a multi-select slice

**Plan assumed:** the Phase 8 kickoff would find `selectedNodeId: string | null`
and would need to migrate it to `selectedNodeIds: string[]` plus
`primarySelectionId`.

**Reality:** verification (`grep selectedNodeId ...`) showed the slice had
**already been converted** before Phase 8 planning landed. The store already
had `selectedNodeIds`, `primarySelectionId`, `setSelection`, `addToSelection`,
`clearSelection`. Task 8.1 was a no-op; the implementer verified and moved on.

**How to apply:** always run the Task 8.0 reality-check step. Plan authors
write against the last known snapshot; by execution time the state can drift.

---

## Drift 8.2 — PositionContext and Zustand positions are orthogonal stores

**Plan assumed:** `alignSelection` and `distributeSelection` would read from and
write to a single source of truth for node coordinates.

**Reality:** two coordinate stores coexist and were never connected:

1. **PositionContext** (`Map<string, {x,y}>`) — React state, persisted to
   localStorage, fed to ReactFlow's `<ReactFlow nodes={…}>` for visual rendering.
   Updated only on drag-end by `makeOnNodesChange`.

2. **Zustand `positions`** (`Record<string, {x,y}>`) — store slice, used by
   alignment math and undo snapshots. Starts empty `{}` for any node that was
   never dragged.

Alignment called `alignSelection` which wrote correct coords into the Zustand
store — but the visual layer read PositionContext, so nothing moved.
Additionally, since Zustand positions defaulted to `{x:0,y:0}` for
undragged nodes, a naive "sync-after" would have collapsed all nodes to the
origin.

**Fix:** a seed-before / sync-after pattern:
- Before any alignment/undo/redo/paste: `setManyPositions(positionCtx.positions)`
  (seeds Zustand store from PositionContext's actual dagre-computed coords)
- After the operation: `positionCtx.setMany(Object.entries(store.positions))`
  (pushes the mutated coords back into PositionContext so ReactFlow re-renders)

A new `setManyPositions(entries: Iterable<[string, {x,y}]>)` batch action was
added to `builder-store.ts` for the before-step.

**How to apply:** any future operation that reads/writes node positions must
go through this two-phase sync. If a single position store is ever introduced,
the relevant drift fix is to consolidate PositionContext → Zustand (or vice
versa) so the seed/sync boilerplate can be removed.

---

## Drift 8.3 — Toolbar needs PositionProvider; tests broke

**Plan assumed:** `Toolbar` was a stateless presentational component that could
be rendered in tests without context providers beyond its explicit props.

**Reality:** once the alignment buttons gained the seed-before / sync-after
pattern (Drift 8.2), `Toolbar.tsx` called `usePositionContext()`. Any test
that rendered `<Toolbar>` without a `<PositionProvider>` threw:
`usePositionContext: missing <PositionProvider>`.

Both `Toolbar.spec.tsx` and `Toolbar.undo.spec.tsx` needed a `WithPositions`
wrapper with a mock `UsePositionPersistence` (empty Map, no-op callbacks).
The alignment test needed a non-empty `positions` Map seeded with the actual
node coordinates so the alignment math could see them.

**How to apply:** when a component gains a context dependency during a phase,
audit its test files and add the matching provider wrapper. When mocking
position maps for alignment tests, seed the map with the same `{x,y}` values
that the store will read.

---

## Drift 8.4 — `applyRedo` snapshot ordering was inverted

**Plan assumed:** redo would pop the future stack and restore that snapshot as
current state.

**Reality:** the initial implementation restored the popped future entry as
the current state, which was correct for nodes/workflow — but left the Zustand
positions slice with the *pre-action* values (the snapshot captured before the
action, not after). Ctrl+Z / Ctrl+Shift+Z therefore undid correctly but redo
left nodes in their pre-undo positions.

**Fix:** `applyRedo` now pushes a fresh snapshot of the current pre-redo state
onto `past`, then applies the future snapshot. The integration test
(`fix(undo): applyRedo restores post-action state`) locked this in.

**How to apply:** undo/redo snapshot semantics: `past` entries capture state
*before* the action; `future` entries capture state *after* the action
(identical to the state at the moment the undo was applied). Future implementers
should verify this direction with an integration test that checks both the
node position and the stack depths after a redo.

---

## Drift 8.5 — `SHORTCUTS.delete` readonly tuple requires double cast

**Plan assumed:** `SHORTCUTS.delete` could be passed directly to
`useHotkeys` as a `string[]`.

**Reality:** `SHORTCUTS.delete` is typed `readonly ["delete", "backspace"]`
(`as const`). TypeScript rejects `readonly string[]` where `string[]` is
expected. A single `as string[]` also fails because readonly tuples are not
assignable to mutable arrays.

**Fix:** `SHORTCUTS.delete as unknown as string[]`. The `unknown` intermediate
bypasses the variance check.

**How to apply:** when passing readonly const-typed arrays to third-party APIs
that expect `string[]`, use the double-cast `as unknown as string[]`. This is
preferable to widening the SHORTCUTS type or duplicating the array literal.

---

## Drift 8.6 — Manual smoke revealed shift-click multi-select was non-functional

**Plan assumed:** `onNodeClick` in `Canvas.tsx` would handle shift-click by
checking the MouseEvent.

**Reality:** the initial implementation used `(_, node) => setSelection([node.id])`
— the event parameter was named `_` and discarded. Shift-clicking replaced
the selection rather than extending it.

**Fix:** renamed the param to `event`; added an `addToSelection` selector from
the store; handler now branches on `event.shiftKey`:
```tsx
onNodeClick={(event, node) => {
  if (event.shiftKey) addToSelection(node.id);
  else setSelection([node.id]);
}}
```

**How to apply:** any interaction that needs modifier-key detection must
capture the event parameter. The `_` convention for "unused event" is a red
flag in handlers where modifier keys matter. The smoke gate caught this because
automated tests synthesize clicks without a real `shiftKey` flag.

---

## Drift 8.7 — Manual smoke gate found three regressions that tests missed

The 11-step smoke gate at localhost:5173 caught three bugs automated tests
did not cover, each committed as a fix before the phase was tagged.

### Bug A — Shift-click multi-select discarded the event (commit `560b9d8`)

Same as Drift 8.6.

### Bug B — Alignment not visually working (commit `560b9d8`)

Same as Drift 8.2. Automated tests asserted on Zustand store positions (which
were correct) but never verified that PositionContext received the update —
the only way to catch this is via a rendered ReactFlow canvas.

### Bug C — PositionProvider missing from Toolbar tests (commit `560b9d8`)

Same as Drift 8.3. Tests would have caught this on the next run but the
`beforeAll`/`afterEach` structure masked the error during development.

### Meta-lesson (carry forward from Phase 7)

The manual smoke gate continues to catch bugs the automated suite misses
because JSDOM doesn't render layouts, doesn't relay real mouse events with
modifier keys, and doesn't run ReactFlow's position → coordinate pipeline.
Treat the smoke gate as load-bearing, not optional.

---

## How to apply — Phase 9 feed

1. **Position sync is boilerplate.** Any Phase 9 feature that moves nodes
   (e.g., paste-into-new-position, group layout, auto-connect) must use the
   seed-before / sync-after pattern until PositionContext and Zustand are
   consolidated into a single store.

2. **undo/redo snapshot direction.** Past captures pre-action state; future
   captures the undone state. Verify with a round-trip integration test.

3. **Toolbar test wrapper.** `Toolbar.spec.tsx` and `Toolbar.undo.spec.tsx`
   already have the `WithPositions` wrapper — new Toolbar tests can reuse it.

4. **Smoke gate is non-negotiable.** Phase 9 will touch the Canvas (connected
   mode, live workflow status). Any visual-or-keyboard feature needs the same
   11-step gate.

---

## Summary

7 entries. The two architectural surprises (dual position stores, redo snapshot
ordering) were genuine design gaps that automated tests couldn't surface. The
remaining entries are TypeScript strictness edge cases and JSDOM test-isolation
issues — familiar territory from Phases 6 and 7. The plan's architecture
survived intact: `useUndoStore` coalesce stack, pure alignment kernels,
versioned clipboard envelope, and `react-hotkeys-hook` shortcut layer all
delivered as specified.
