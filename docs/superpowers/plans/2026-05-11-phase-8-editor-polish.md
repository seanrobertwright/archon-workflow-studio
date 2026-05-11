# Phase 8 — Editor polish: Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship seven user-facing features on two new infrastructure primitives — selection model (single → multi) and undo/redo middleware — to make the studio feel like a 2026-grade visual editor: undo/redo, multi-select, copy/paste, alignment & distribution, smart guides + grid snap, auto-arrange selection, theme picker, variant conversion UI, and a unified keyboard shortcut layer.

**Architecture:** A new `useUndoStore` holds a coarse snapshot stack (`{ workflow, nodes, positions }`) wrapped around mutating actions via a `withUndo(label, fn)` helper, with a 400ms coalesce window for text-edit bursts. The builder store's `selectedNodeId` is replaced by `selectedNodeIds: string[]` plus a derived `primarySelectionId`. A `clipboard.ts` module serializes/parses a versioned envelope to/from `navigator.clipboard` with an in-memory fallback. Pure `useAlignment` kernels operate on positions + dims sourced from React Flow; smart guides run as an overlay layer driven by `onNodeDrag`. Theme moves to its own `useThemeStore` synced to `localStorage`. A single `shortcuts.ts` registry plus `react-hotkeys-hook` bindings on `WorkflowBuilder` drive every keyboard action.

**Tech Stack:** TypeScript + React 19 (existing); Zustand (existing); React Flow (existing); dagre via `useDagre` (existing); CodeMirror 6 surfaces (existing — informs shortcut focus-scoping); `react-hotkeys-hook` (NEW, ^4.x); `bun:test` + `@testing-library/react` (existing).

**Reference design doc:** `docs/superpowers/specs/2026-05-11-phase-8-editor-polish-design.md`.

**Reference skills:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`.

**Drift discipline:** Phases 4–7 all taught the same lesson — the plan describes the codebase as of today, but it drifts. Every task begins with a verification step; if reality deviates, capture the deviation inline (mirror `docs/superpowers/plans/phase-7-drift-notes.md`) and adapt the task before continuing. After execution, write `docs/superpowers/plans/phase-8-drift-notes.md`.

**Test environment quirks carried forward from Phase 7:**
- Workspace package name is `@archon-studio/core` (NOT `@archon-studio/studio-core`).
- `@testing-library/react` `cleanup()` is NOT auto-called by bun-test — every React spec needs `afterEach(() => cleanup())`.
- Transient store slices (selection, hover, drawer, focus) must be reset in `afterEach`, not just `beforeEach`, or state leaks across files.
- CSS Modules mangle class names; any class that travels JS → DOM as a literal string (CM6 line decorations, React Flow class hooks) needs `:global(...)` inside `.module.css`.
- JSDOM doesn't paint or run a real keystroke loop — visual + keyboard features need a manual smoke gate regardless of automated coverage. **Phase 8 is heavy on this; smoke is non-negotiable.**

**Branch:** Execute on `phase-8` cut from `phase-7` tip (Phase 7 is tag-locally / push-pending per established practice). Tag `phase-8` after the verify task; push pending user.

**Test target:** ~90 new behavioral tests (8 alignment × 3 shapes + 6 clipboard cases + 14 undo + 8 computeGuides + Toolbar + VariantPicker + SmartGuidesLayer + 6 integration). Suite goes from Phase 7's **440** to **~530**.

---

## Chunk 1: Foundations — selection slice, shortcuts, theme

### Task 8.0: Phase-7 reality check (read-only verification)

**Files:** None (verification only).

Confirm the surfaces Phase 8 depends on are still in the shape Phase 7 left them.

- [ ] **Step 1: Confirm `selectedNodeId` is currently a single value**

```bash
grep -n "selectedNodeId" packages/studio-core/src/store/builder-store.ts
```
Expected: `selectedNodeId: string | null` plus `setSelectedNodeId`. If Phase 7 changed this, Task 8.1 adapts.

- [ ] **Step 2: Confirm `loadWorkflow` / `clearWorkflow` shapes**

```bash
grep -n "loadWorkflow\|clearWorkflow" packages/studio-core/src/store/builder-store.ts
```
Expected: `loadWorkflow` writes `{workflow, nodes, baselineYaml}`; `clearWorkflow` nulls transient UI slices. Both need to clear the undo stack in Chunk 2.

- [ ] **Step 3: Confirm `convertVariant` still in place**

```bash
grep -n "convertVariant" packages/studio-core/src/store/builder-store.ts
```
Expected: `convertVariant(id, newVariantId)` action with the deep-merge migration described in Phase 4. Task 8.18 wraps the UI around it.

- [ ] **Step 4: Confirm React Flow version and selection events**

```bash
grep '"reactflow"\|"@xyflow/react"' apps/standalone/package.json packages/studio-core/package.json
```
Record the React Flow package name and version. Task 8.1 uses `onSelectionChange` and Task 8.16 uses `onNodeDragStart` / `onNodeDrag` / `onNodeDragStop` — confirm these exist on the installed version's `<ReactFlow>` props.

- [ ] **Step 5: Confirm `ThemeProvider` signature**

```bash
grep -n "ThemePreset\|ThemeProvider" packages/studio-core/src/theme/ThemeProvider.tsx
```
Expected: `ThemePreset = 'archon-dark' | 'light' | 'high-contrast' | 'inherit'`. Task 8.3 wires the theme store into this provider.

- [ ] **Step 6: Confirm `WorkflowBuilder` shape and prop surface**

```bash
grep -n "export.*WorkflowBuilder\|interface WorkflowBuilderProps" packages/studio-core/src/components/WorkflowBuilder.tsx
```
Record the prop set. Task 8.19 adds `showThemePicker?: boolean` (default `true`).

- [ ] **Step 7: Confirm Toolbar layout for incoming buttons**

```bash
grep -n "button\|<div" packages/studio-core/src/components/Toolbar.tsx
```
Record the existing button order. Tasks 8.13, 8.17, 8.19 insert alignment group, grid checkbox, undo/redo, theme picker.

- [ ] **Step 8: Confirm `useDagre` is reusable for selection-scoped runs**

```bash
grep -n "export.*useDagre\|function" packages/studio-core/src/hooks/useDagre.ts
```
Task 8.12 reuses the dagre kernel scoped to a node subset. If `useDagre` is a hook with no extractable pure function, Task 8.12 extracts one.

- [ ] **Step 9: Snapshot the current test count**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -10
```
Record the pass/fail count (expected: **440 pass**). Each chunk closes by re-running and confirming a delta of new passing tests.

---

### Task 8.1: Selection slice — single → multi

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts`
- Modify: `packages/studio-core/src/components/Canvas.tsx`
- Modify: `packages/studio-core/src/components/canvas/deriveFlow.ts`
- Modify: every reader of `selectedNodeId` (Inspector, ValidationPanel, etc.)
- Test: `packages/studio-core/tests/store/selection.spec.ts` (new)

- [ ] **Step 1: Write failing tests for the new selection slice**

Create `tests/store/selection.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';

describe('selection slice', () => {
  beforeEach(() => {
    useBuilderStore.setState({ nodes: [], selectedNodeIds: [], primarySelectionId: null });
  });

  it('setSelection replaces the array and sets primary to the last id', () => {
    useBuilderStore.getState().setSelection(['a', 'b']);
    expect(useBuilderStore.getState().selectedNodeIds).toEqual(['a', 'b']);
    expect(useBuilderStore.getState().primarySelectionId).toBe('b');
  });

  it('addToSelection appends and updates primary; ignores duplicates', () => {
    useBuilderStore.getState().setSelection(['a']);
    useBuilderStore.getState().addToSelection('b');
    expect(useBuilderStore.getState().selectedNodeIds).toEqual(['a', 'b']);
    useBuilderStore.getState().addToSelection('b');
    expect(useBuilderStore.getState().selectedNodeIds).toEqual(['a', 'b']);
  });

  it('removeFromSelection drops the id and re-picks primary from the tail', () => {
    useBuilderStore.getState().setSelection(['a', 'b', 'c']);
    useBuilderStore.getState().removeFromSelection('c');
    expect(useBuilderStore.getState().selectedNodeIds).toEqual(['a', 'b']);
    expect(useBuilderStore.getState().primarySelectionId).toBe('b');
  });

  it('clearSelection empties both', () => {
    useBuilderStore.getState().setSelection(['a']);
    useBuilderStore.getState().clearSelection();
    expect(useBuilderStore.getState().selectedNodeIds).toEqual([]);
    expect(useBuilderStore.getState().primarySelectionId).toBe(null);
  });

  it('selectAll selects every node id in store order', () => {
    useBuilderStore.setState({
      nodes: [
        { id: 'a', variant: 'bash', data: {}, base: {}, unknown: {} } as any,
        { id: 'b', variant: 'bash', data: {}, base: {}, unknown: {} } as any,
      ],
    });
    useBuilderStore.getState().selectAll();
    expect(useBuilderStore.getState().selectedNodeIds).toEqual(['a', 'b']);
    expect(useBuilderStore.getState().primarySelectionId).toBe('b');
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
bun --filter='@archon-studio/core' run test tests/store/selection.spec.ts 2>&1 | tail -15
```
Expected: `setSelection`/`addToSelection`/`removeFromSelection`/`clearSelection`/`selectAll` undefined.

- [ ] **Step 3: Replace `selectedNodeId` with the new slice**

In `builder-store.ts`:

1. Remove `selectedNodeId: string | null` from `BuilderState`; remove `setSelectedNodeId` from the action list.
2. Add to `BuilderState`:

```ts
selectedNodeIds: string[];
primarySelectionId: string | null;
setSelection: (ids: string[]) => void;
addToSelection: (id: string) => void;
removeFromSelection: (id: string) => void;
clearSelection: () => void;
selectAll: () => void;
removeSelected: () => void;
```

3. In the `create` body, replace the slice values + setters:

```ts
selectedNodeIds: [],
primarySelectionId: null,
setSelection: (ids) =>
  set({ selectedNodeIds: ids, primarySelectionId: ids.length ? ids[ids.length - 1] : null }),
addToSelection: (id) =>
  set((s) => {
    if (s.selectedNodeIds.includes(id)) return s;
    const next = [...s.selectedNodeIds, id];
    return { selectedNodeIds: next, primarySelectionId: id };
  }),
removeFromSelection: (id) =>
  set((s) => {
    const next = s.selectedNodeIds.filter((x) => x !== id);
    return {
      selectedNodeIds: next,
      primarySelectionId: next.length ? next[next.length - 1] : null,
    };
  }),
clearSelection: () => set({ selectedNodeIds: [], primarySelectionId: null }),
selectAll: () =>
  set((s) => {
    const ids = s.nodes.map((n) => n.id);
    return { selectedNodeIds: ids, primarySelectionId: ids.length ? ids[ids.length - 1] : null };
  }),
removeSelected: () => {
  const { selectedNodeIds, deleteNodes } = get();
  if (selectedNodeIds.length === 0) return;
  deleteNodes(selectedNodeIds);
  set({ selectedNodeIds: [], primarySelectionId: null });
},
```

4. In `clearWorkflow`, replace `selectedNodeId: null` with `selectedNodeIds: [], primarySelectionId: null`.

- [ ] **Step 4: Update Canvas / Inspector / ValidationPanel readers**

Grep for `selectedNodeId` outside `builder-store.ts`:

```bash
grep -rn "selectedNodeId" packages/studio-core/src --include='*.ts' --include='*.tsx' | grep -v builder-store
```

For each call site:
- Inspector — read `primarySelectionId` (single-node editor); render empty state when `selectedNodeIds.length !== 1`.
- Canvas — wire `onSelectionChange={({ nodes }) => setSelection(nodes.map(n => n.id))}` on `<ReactFlow>`.
- `deriveFlow.ts` — set each rfNode's `selected: store.selectedNodeIds.includes(node.id)`.
- ValidationPanel — read `primarySelectionId` if it currently reads `selectedNodeId`.

- [ ] **Step 5: Run all tests — expect green**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -5
```
Expected: 440 + 5 = 445 pass. If any prior selection-dependent test fails, fix the reader rather than the test.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/components \
        packages/studio-core/src/validation \
        packages/studio-core/tests/store/selection.spec.ts
git commit -m "feat(store): selectedNodeIds + primarySelectionId multi-selection slice"
```

---

### Task 8.2: Shortcut registry + `react-hotkeys-hook` install

**Files:**
- Modify: `packages/studio-core/package.json`
- Create: `packages/studio-core/src/shortcuts.ts`
- Test: `packages/studio-core/tests/shortcuts.spec.ts` (new)

- [ ] **Step 1: Install dep**

```bash
cd packages/studio-core
bun add react-hotkeys-hook@^4
cd ../..
bun install
```
Verify `react-hotkeys-hook` appears in `packages/studio-core/package.json` `dependencies`.

- [ ] **Step 2: Write failing test for the registry surface**

Create `tests/shortcuts.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { SHORTCUTS } from '../src/shortcuts';

describe('SHORTCUTS', () => {
  it('exposes mod-based bindings (works as both Cmd and Ctrl)', () => {
    expect(SHORTCUTS.undo).toBe('mod+z');
    expect(SHORTCUTS.redo).toBe('mod+shift+z');
    expect(SHORTCUTS.copy).toBe('mod+c');
    expect(SHORTCUTS.paste).toBe('mod+v');
    expect(SHORTCUTS.cut).toBe('mod+x');
  });

  it('delete is an array of equivalent keys', () => {
    expect(SHORTCUTS.delete).toEqual(['delete', 'backspace']);
  });

  it('alignment shortcuts use mod+alt+arrow', () => {
    expect(SHORTCUTS.alignLeft).toBe('mod+alt+left');
    expect(SHORTCUTS.alignRight).toBe('mod+alt+right');
    expect(SHORTCUTS.alignTop).toBe('mod+alt+up');
    expect(SHORTCUTS.alignBottom).toBe('mod+alt+down');
  });
});
```

- [ ] **Step 3: Create the registry**

`src/shortcuts.ts`:

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

export type ShortcutId = keyof typeof SHORTCUTS;
```

- [ ] **Step 4: Run tests — expect pass**

```bash
bun --filter='@archon-studio/core' run test tests/shortcuts.spec.ts 2>&1 | tail -5
```
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/package.json bun.lock packages/studio-core/src/shortcuts.ts \
        packages/studio-core/tests/shortcuts.spec.ts
git commit -m "feat(shortcuts): SHORTCUTS registry + react-hotkeys-hook dep"
```

---

### Task 8.3: Theme store + picker

**Files:**
- Create: `packages/studio-core/src/store/theme-store.ts`
- Modify: `packages/studio-core/src/theme/ThemeProvider.tsx`
- Modify: `packages/studio-core/src/components/Toolbar.tsx`
- Modify: `packages/studio-core/src/components/Toolbar.module.css`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx` (add `showThemePicker?: boolean`)
- Modify: `apps/standalone/src/App.tsx`
- Test: `packages/studio-core/tests/store/theme-store.spec.ts` (new)
- Test: `packages/studio-core/tests/components/ThemePicker.spec.tsx` (new)

- [ ] **Step 1: Write failing test for theme store**

`tests/store/theme-store.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useThemeStore } from '../../src/store/theme-store';

describe('theme-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ preset: 'archon-dark' });
  });

  it('defaults to archon-dark when localStorage empty', () => {
    expect(useThemeStore.getState().preset).toBe('archon-dark');
  });

  it('setPreset writes to localStorage', () => {
    useThemeStore.getState().setPreset('light');
    expect(useThemeStore.getState().preset).toBe('light');
    expect(localStorage.getItem('archon-studio:theme')).toBe('light');
  });

  it('reads localStorage on hydrate()', () => {
    localStorage.setItem('archon-studio:theme', 'high-contrast');
    useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preset).toBe('high-contrast');
  });

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('archon-studio:theme', 'midnight-purple');
    useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().preset).toBe('archon-dark');
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

- [ ] **Step 3: Implement `theme-store.ts`**

```ts
import { create } from 'zustand';
import type { ThemePreset } from '../theme/ThemeProvider';

const STORAGE_KEY = 'archon-studio:theme';
const VALID: ThemePreset[] = ['archon-dark', 'light', 'high-contrast'];

interface ThemeState {
  preset: ThemePreset;
  setPreset: (p: ThemePreset) => void;
  hydrate: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preset: 'archon-dark',
  setPreset: (p) => {
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // private mode, etc. — non-fatal
    }
    set({ preset: p });
  },
  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && (VALID as string[]).includes(raw)) set({ preset: raw as ThemePreset });
    } catch {
      // ignore
    }
  },
}));
```

- [ ] **Step 4: Run — expect 4 pass**

- [ ] **Step 5: Write failing component test**

`tests/components/ThemePicker.spec.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ThemePicker } from '../../src/components/ThemePicker';
import { useThemeStore } from '../../src/store/theme-store';

describe('<ThemePicker>', () => {
  beforeEach(() => useThemeStore.setState({ preset: 'archon-dark' }));
  afterEach(() => cleanup());

  it('renders three buttons; active one has aria-pressed=true', () => {
    const { getByLabelText } = render(<ThemePicker />);
    expect(getByLabelText('Theme: archon-dark').getAttribute('aria-pressed')).toBe('true');
    expect(getByLabelText('Theme: light').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a button updates the store', () => {
    const { getByLabelText } = render(<ThemePicker />);
    fireEvent.click(getByLabelText('Theme: light'));
    expect(useThemeStore.getState().preset).toBe('light');
  });
});
```

- [ ] **Step 6: Create `ThemePicker` component**

`src/components/ThemePicker.tsx`:

```tsx
import { useThemeStore } from '../store/theme-store';
import type { ThemePreset } from '../theme/ThemeProvider';
import styles from './ThemePicker.module.css';

const PRESETS: { id: ThemePreset; label: string; glyph: string }[] = [
  { id: 'archon-dark', label: 'archon-dark', glyph: '◐' },
  { id: 'light', label: 'light', glyph: '☀' },
  { id: 'high-contrast', label: 'high-contrast', glyph: '◑' },
];

export function ThemePicker() {
  const preset = useThemeStore((s) => s.preset);
  const setPreset = useThemeStore((s) => s.setPreset);
  return (
    <div role="group" aria-label="Theme" className={styles.group}>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-label={`Theme: ${p.label}`}
          aria-pressed={preset === p.id}
          className={styles.button}
          onClick={() => setPreset(p.id)}
        >
          {p.glyph}
        </button>
      ))}
    </div>
  );
}
```

Plus minimal `ThemePicker.module.css` (flex row, button with `[aria-pressed="true"]` filled background).

- [ ] **Step 7: Wire `ThemeProvider` to read store**

Modify `theme/ThemeProvider.tsx` so the standalone path reads from `useThemeStore`. Keep the `preset` prop as the highest-priority override (embed mode passes `inherit`):

```tsx
import { useThemeStore } from '../store/theme-store';

export function ThemeProvider({ preset, children }: { preset?: ThemePreset; children: ReactNode }) {
  const storePreset = useThemeStore((s) => s.preset);
  const effective = preset ?? storePreset;
  useEffect(() => {
    document.documentElement.dataset.studioTheme = effective;
  }, [effective]);
  return <>{children}</>;
}
```

- [ ] **Step 8: Add `showThemePicker` to WorkflowBuilder and slot it into Toolbar**

`WorkflowBuilder.tsx`: extend `WorkflowBuilderProps` with `showThemePicker?: boolean` (default `true`). Pass through to `<Toolbar showThemePicker={showThemePicker}>`. Toolbar renders `<ThemePicker />` when true.

- [ ] **Step 9: Standalone hydrate-on-boot**

`apps/standalone/src/App.tsx`: call `useThemeStore.getState().hydrate()` once on mount (or at module load).

- [ ] **Step 10: Run all tests — expect 445 + 4 + 2 = 451 pass**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -5
```

- [ ] **Step 11: Commit**

```bash
git add packages/studio-core/src/store/theme-store.ts \
        packages/studio-core/src/components/ThemePicker* \
        packages/studio-core/src/theme/ThemeProvider.tsx \
        packages/studio-core/src/components/Toolbar.tsx \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        apps/standalone/src/App.tsx \
        packages/studio-core/tests/store/theme-store.spec.ts \
        packages/studio-core/tests/components/ThemePicker.spec.tsx
git commit -m "feat(theme): theme-store + ThemePicker with localStorage persistence"
```

---

## Chunk 2: Undo/redo middleware

### Task 8.4: `useUndoStore` and `withUndo` wrapper

**Files:**
- Create: `packages/studio-core/src/store/undo-store.ts`
- Create: `packages/studio-core/src/store/withUndo.ts`
- Test: `packages/studio-core/tests/store/undo-store.spec.ts`
- Test: `packages/studio-core/tests/store/withUndo.spec.ts`

- [ ] **Step 1: Write failing test for stack mechanics**

`tests/store/undo-store.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useUndoStore, type UndoSnapshot } from '../../src/store/undo-store';

const snap = (label: string, n = 0): UndoSnapshot => ({
  workflow: null,
  nodes: [],
  positions: {},
  label,
  ts: n,
});

describe('useUndoStore', () => {
  beforeEach(() => useUndoStore.setState({ past: [], future: [] }));

  it('push appends to past and clears future', () => {
    useUndoStore.setState({ future: [snap('redo-1')] });
    useUndoStore.getState().push(snap('s1'));
    expect(useUndoStore.getState().past.length).toBe(1);
    expect(useUndoStore.getState().future).toEqual([]);
  });

  it('caps past at 100 entries (oldest dropped)', () => {
    for (let i = 0; i < 105; i += 1) useUndoStore.getState().push(snap(`s${i}`, i));
    const past = useUndoStore.getState().past;
    expect(past.length).toBe(100);
    expect(past[0].label).toBe('s5');
    expect(past[99].label).toBe('s104');
  });

  it('pop returns top of past and moves it to future', () => {
    useUndoStore.getState().push(snap('a'));
    useUndoStore.getState().push(snap('b'));
    const popped = useUndoStore.getState().pop();
    expect(popped?.label).toBe('b');
    expect(useUndoStore.getState().past.length).toBe(1);
    expect(useUndoStore.getState().future[0].label).toBe('b');
  });

  it('pop on empty past returns null', () => {
    expect(useUndoStore.getState().pop()).toBeNull();
  });

  it('redoPop returns top of future and moves it to past', () => {
    useUndoStore.setState({ future: [snap('f1'), snap('f2')] });
    const r = useUndoStore.getState().redoPop();
    expect(r?.label).toBe('f1');
    expect(useUndoStore.getState().past[0].label).toBe('f1');
    expect(useUndoStore.getState().future).toHaveLength(1);
  });

  it('clear empties both stacks', () => {
    useUndoStore.setState({ past: [snap('a')], future: [snap('b')] });
    useUndoStore.getState().clear();
    expect(useUndoStore.getState().past).toEqual([]);
    expect(useUndoStore.getState().future).toEqual([]);
  });

  it('nextUndoLabel returns the top-of-past label or null', () => {
    expect(useUndoStore.getState().nextUndoLabel()).toBeNull();
    useUndoStore.getState().push(snap('Align left'));
    expect(useUndoStore.getState().nextUndoLabel()).toBe('Align left');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `undo-store.ts`**

```ts
import { create } from 'zustand';
import type { BuilderNode } from '../nodes/shared/types';
import type { WorkflowMeta } from './builder-store';

export interface UndoSnapshot {
  workflow: WorkflowMeta | null;
  nodes: BuilderNode[];
  positions: Record<string, { x: number; y: number }>;
  label: string;
  ts: number;
}

interface UndoState {
  past: UndoSnapshot[];
  future: UndoSnapshot[];
  push: (s: UndoSnapshot) => void;
  pop: () => UndoSnapshot | null;
  redoPop: () => UndoSnapshot | null;
  clear: () => void;
  nextUndoLabel: () => string | null;
  nextRedoLabel: () => string | null;
}

const CAPACITY = 100;

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  push: (s) =>
    set((st) => ({
      past: [...st.past, s].slice(-CAPACITY),
      future: [],
    })),
  pop: () => {
    const st = get();
    if (st.past.length === 0) return null;
    const top = st.past[st.past.length - 1];
    set({ past: st.past.slice(0, -1), future: [top, ...st.future] });
    return top;
  },
  redoPop: () => {
    const st = get();
    if (st.future.length === 0) return null;
    const top = st.future[0];
    set({ past: [...st.past, top], future: st.future.slice(1) });
    return top;
  },
  clear: () => set({ past: [], future: [] }),
  nextUndoLabel: () => {
    const p = get().past;
    return p.length ? p[p.length - 1].label : null;
  },
  nextRedoLabel: () => {
    const f = get().future;
    return f.length ? f[0].label : null;
  },
}));
```

- [ ] **Step 4: Run — expect 7 pass**

- [ ] **Step 5: Write failing test for `withUndo` + coalesce**

`tests/store/withUndo.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUndoStore } from '../../src/store/undo-store';
import { withUndo, withUndoCoalesced } from '../../src/store/withUndo';

describe('withUndo', () => {
  beforeEach(() => {
    useBuilderStore.setState({ workflow: null, nodes: [] });
    useUndoStore.setState({ past: [], future: [] });
  });

  it('pushes a snapshot of the pre-action state, labeled', () => {
    useBuilderStore.setState({ nodes: [{ id: 'a' } as any] });
    withUndo('Add node', () => useBuilderStore.setState((s) => ({ nodes: [...s.nodes, { id: 'b' } as any] })));
    const past = useUndoStore.getState().past;
    expect(past).toHaveLength(1);
    expect(past[0].label).toBe('Add node');
    expect(past[0].nodes.map((n: any) => n.id)).toEqual(['a']);
  });

  it('clears redo stack on new action', () => {
    useUndoStore.setState({ future: [{ label: 'r', past: [], nodes: [], workflow: null, positions: {}, ts: 0 } as any] });
    withUndo('Add node', () => {});
    expect(useUndoStore.getState().future).toEqual([]);
  });
});

describe('withUndoCoalesced', () => {
  beforeEach(() => {
    useBuilderStore.setState({ workflow: null, nodes: [] });
    useUndoStore.setState({ past: [], future: [] });
  });

  it('first call within window pushes; subsequent within window do not', () => {
    withUndoCoalesced('Edit field:a:body', () => {}, 400);
    withUndoCoalesced('Edit field:a:body', () => {}, 400);
    withUndoCoalesced('Edit field:a:body', () => {}, 400);
    expect(useUndoStore.getState().past).toHaveLength(1);
  });

  it('different keys do not coalesce', () => {
    withUndoCoalesced('Edit field:a:body', () => {}, 400);
    withUndoCoalesced('Edit field:b:body', () => {}, 400);
    expect(useUndoStore.getState().past).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Implement `withUndo.ts`**

```ts
import { useBuilderStore } from './builder-store';
import { useUndoStore, type UndoSnapshot } from './undo-store';

function captureSnapshot(label: string): UndoSnapshot {
  const s = useBuilderStore.getState();
  return {
    workflow: s.workflow,
    nodes: s.nodes,
    positions: (s as any).positions ?? {},
    label,
    ts: Date.now(),
  };
}

export function withUndo(label: string, fn: () => void): void {
  useUndoStore.getState().push(captureSnapshot(label));
  fn();
}

const lastCoalesceKey = new Map<string, number>();

export function withUndoCoalesced(key: string, fn: () => void, windowMs = 400): void {
  const now = Date.now();
  const last = lastCoalesceKey.get(key) ?? 0;
  if (now - last > windowMs) {
    useUndoStore.getState().push(captureSnapshot(key));
  }
  lastCoalesceKey.set(key, now);
  fn();
}

export function resetCoalesceMap(): void {
  lastCoalesceKey.clear();
}
```

Notes:
- `positions` is read defensively (`(s as any).positions`) because the positions slice is added in Task 8.6. Until then, undo for positions is a no-op.
- `resetCoalesceMap` is exported for test isolation.

- [ ] **Step 7: Run — expect 11 total in this task (7 store + 4 wrapper)**

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/src/store/undo-store.ts \
        packages/studio-core/src/store/withUndo.ts \
        packages/studio-core/tests/store/undo-store.spec.ts \
        packages/studio-core/tests/store/withUndo.spec.ts
git commit -m "feat(undo): snapshot stack + withUndo wrapper + coalesce"
```

---

### Task 8.5: Positions slice and instrument existing actions

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts` (add `positions` slice, wrap actions in `withUndo`)
- Modify: `packages/studio-core/src/hooks/usePositionPersistence.ts` (if positions currently live here, fold into store)
- Test: `packages/studio-core/tests/store/undo-integration.spec.ts` (new)

- [ ] **Step 1: Reality check — where do positions currently live?**

```bash
grep -rn "positions\|positionMap\|Position" packages/studio-core/src/hooks/usePositionPersistence.ts \
  packages/studio-core/src/components/canvas/deriveFlow.ts
```
Record the current shape. If positions live in `localStorage` via the hook and *not* in the store, this task migrates them into the store (still mirrored to `localStorage` for persistence) so they can be snapshotted.

- [ ] **Step 2: Add `positions` slice to builder-store**

```ts
positions: Record<string, { x: number; y: number }>;
setNodePosition: (id: string, pos: { x: number; y: number }) => void;
setNodePositions: (patch: Record<string, { x: number; y: number }>) => void;
```

Initial value `{}`. `setNodePosition` updates one key; `setNodePositions` shallow-merges (used by align/distribute/auto-arrange). Mirror to `localStorage` via a small subscription in standalone (or keep `usePositionPersistence` as the persistence layer reading the store).

- [ ] **Step 3: Wrap mutating actions with `withUndo`**

In each store action, wrap the body so the pre-state is captured before the mutation:

| Action | Label |
|---|---|
| `addNode`, `addNodeFromVariant` | `'Add node'` |
| `deleteNodes` | `len === 1 ? 'Delete node' : \`Delete ${len} nodes\`` |
| `renameNode` | `'Rename node'` |
| `updateNode` | `'Update node'` |
| `updateNodeData` | coalesced; key `\`Edit ${id}\``, 400ms — see Task 8.5 step 4 |
| `convertVariant` | `'Convert variant'` |
| `connect`/`disconnect` | `'Connect'` / `'Disconnect'` |
| `setNodePosition` (drag-stop) | `'Move node'` (called by Task 8.6) |

The wrap pattern:

```ts
addNode: (node) => {
  withUndo('Add node', () => {
    set((s) => {
      if (s.nodes.some((n) => n.id === node.id)) throw new Error(...);
      return { nodes: [...s.nodes, node] };
    });
  });
},
```

- [ ] **Step 4: Special-case `updateNodeData` with coalesce**

```ts
updateNodeData: (id, patch) => {
  const key = `Edit ${id}`;
  withUndoCoalesced(
    key,
    () => {
      // existing partitioned set logic
    },
    400,
  );
},
```

- [ ] **Step 5: Clear undo on `loadWorkflow` / `clearWorkflow`**

In each, append `useUndoStore.getState().clear()` after the `set()` call.

- [ ] **Step 6: Write integration test**

`tests/store/undo-integration.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUndoStore } from '../../src/store/undo-store';
import { resetCoalesceMap } from '../../src/store/withUndo';

describe('undo integration', () => {
  beforeEach(() => {
    useBuilderStore.setState({ workflow: null, nodes: [], positions: {} });
    useUndoStore.setState({ past: [], future: [] });
    resetCoalesceMap();
  });

  it('addNode pushes one snapshot labeled "Add node"', () => {
    useBuilderStore.getState().addNode({ id: 'a' } as any);
    const past = useUndoStore.getState().past;
    expect(past).toHaveLength(1);
    expect(past[0].label).toBe('Add node');
  });

  it('loadWorkflow clears the stack', () => {
    useBuilderStore.getState().addNode({ id: 'a' } as any);
    useBuilderStore.getState().loadWorkflow({ meta: { name: 'w', description: '', base: {}, unknown: {} }, nodes: [] });
    expect(useUndoStore.getState().past).toEqual([]);
  });

  it('updateNodeData coalesces within 400ms', () => {
    useBuilderStore.setState({ nodes: [{ id: 'a', variant: 'bash', data: {}, base: {}, unknown: {} } as any] });
    useBuilderStore.getState().updateNodeData('a', { body: 'x' });
    useBuilderStore.getState().updateNodeData('a', { body: 'xy' });
    useBuilderStore.getState().updateNodeData('a', { body: 'xyz' });
    expect(useUndoStore.getState().past).toHaveLength(1);
  });

  it('convertVariant is undoable round-trip', () => {
    useBuilderStore.setState({
      nodes: [{ id: 'a', variant: 'bash', data: { bash: { code: 'echo' } }, base: {}, unknown: {} } as any],
    });
    useBuilderStore.getState().convertVariant('a', 'agent');
    expect(useBuilderStore.getState().nodes[0].variant).toBe('agent');
    const pre = useUndoStore.getState().pop();
    expect(pre).not.toBeNull();
    useBuilderStore.setState({ nodes: pre!.nodes });
    expect(useBuilderStore.getState().nodes[0].variant).toBe('bash');
  });
});
```

- [ ] **Step 7: Run — expect 4 new pass + ensure prior tests still green**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/hooks/usePositionPersistence.ts \
        packages/studio-core/tests/store/undo-integration.spec.ts
git commit -m "feat(undo): instrument mutating actions + positions slice"
```

---

### Task 8.6: Drag-stop snapshot capture + apply/revert helpers

**Files:**
- Modify: `packages/studio-core/src/components/Canvas.tsx`
- Modify: `packages/studio-core/src/store/withUndo.ts` (add holding-slot helper)
- Create: `packages/studio-core/src/store/applyUndo.ts` (apply/revert helpers)
- Test: `packages/studio-core/tests/store/applyUndo.spec.ts`

- [ ] **Step 1: Add `beginDrag` / `commitDrag` to `withUndo.ts`**

```ts
let dragHoldingSlot: UndoSnapshot | null = null;

export function beginDrag(label: string): void {
  dragHoldingSlot = captureSnapshot(label);
}

export function commitDrag(): void {
  if (dragHoldingSlot) {
    useUndoStore.getState().push(dragHoldingSlot);
    dragHoldingSlot = null;
  }
}

export function abortDrag(): void {
  dragHoldingSlot = null;
}
```

- [ ] **Step 2: Wire into Canvas `onNodeDragStart` / `onNodeDragStop`**

```tsx
<ReactFlow
  onNodeDragStart={() => beginDrag('Move node')}
  onNodeDragStop={(_, node) => {
    setNodePosition(node.id, node.position);  // direct set, no withUndo (snapshot already captured)
    commitDrag();
  }}
/>
```

`setNodePosition` here must bypass `withUndo` (the begin/commit pair owns the snapshot). Provide a `_setNodePositionRaw` that's not wrapped, and have `setNodePosition` route through `withUndo('Move node', _setNodePositionRaw)` for non-drag callers (e.g., if any keyboard nudge ships later).

- [ ] **Step 3: Implement `applyUndo` / `applyRedo`**

`src/store/applyUndo.ts`:

```ts
import { useBuilderStore } from './builder-store';
import { useUndoStore } from './undo-store';

export function applyUndo(): boolean {
  const top = useUndoStore.getState().nextUndoLabel();
  if (!top) return false;
  // Capture current state into future before reverting
  const current = {
    workflow: useBuilderStore.getState().workflow,
    nodes: useBuilderStore.getState().nodes,
    positions: useBuilderStore.getState().positions,
    label: top,
    ts: Date.now(),
  };
  const popped = useUndoStore.getState().pop();
  if (!popped) return false;
  useBuilderStore.setState({
    workflow: popped.workflow,
    nodes: popped.nodes,
    positions: popped.positions,
  });
  // `pop` placed `popped` into future. Replace future-top with `current` (which represents "after the undo, we are HERE; redo goes back to that state").
  // The right model: pop returns the pre-action snapshot. We need to place the *post-action* state on future so redo restores it.
  // Adjust the store: replace the future-top (which is popped) with current.
  useUndoStore.setState((s) => ({
    future: [current, ...s.future.slice(1)],
  }));
  return true;
}

export function applyRedo(): boolean {
  const next = useUndoStore.getState().redoPop();
  if (!next) return false;
  // Symmetric: capture current as past, restore from next.
  // redoPop already moved next from future to past. That gives a "before" snapshot in past, but the slot now holds the post-state. We need to overwrite past-top with the current pre-redo state, then apply next.
  const current = {
    workflow: useBuilderStore.getState().workflow,
    nodes: useBuilderStore.getState().nodes,
    positions: useBuilderStore.getState().positions,
    label: next.label,
    ts: Date.now(),
  };
  useUndoStore.setState((s) => ({
    past: [...s.past.slice(0, -1), current],
  }));
  useBuilderStore.setState({
    workflow: next.workflow,
    nodes: next.nodes,
    positions: next.positions,
  });
  return true;
}
```

**Drift note risk:** this dance with the stack is the most error-prone part of the phase. If the test suite catches asymmetry, simplify by switching to a "two-stack peek-and-swap" model with explicit `apply(snapshot)` rather than reusing pop/push primitives.

- [ ] **Step 4: Test applyUndo/applyRedo round-trip**

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUndoStore } from '../../src/store/undo-store';
import { applyUndo, applyRedo } from '../../src/store/applyUndo';

describe('applyUndo/applyRedo', () => {
  beforeEach(() => {
    useBuilderStore.setState({ workflow: null, nodes: [], positions: {} });
    useUndoStore.setState({ past: [], future: [] });
  });

  it('undo restores pre-action state; redo restores post-action state', () => {
    useBuilderStore.getState().addNode({ id: 'a' } as any);
    useBuilderStore.getState().addNode({ id: 'b' } as any);
    expect(useBuilderStore.getState().nodes.map((n) => n.id)).toEqual(['a', 'b']);

    expect(applyUndo()).toBe(true);
    expect(useBuilderStore.getState().nodes.map((n) => n.id)).toEqual(['a']);

    expect(applyRedo()).toBe(true);
    expect(useBuilderStore.getState().nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('returns false on empty stacks', () => {
    expect(applyUndo()).toBe(false);
    expect(applyRedo()).toBe(false);
  });
});
```

- [ ] **Step 5: Run all tests — expect green delta**

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/store/withUndo.ts \
        packages/studio-core/src/store/applyUndo.ts \
        packages/studio-core/src/components/Canvas.tsx \
        packages/studio-core/tests/store/applyUndo.spec.ts
git commit -m "feat(undo): drag-stop capture + applyUndo/applyRedo helpers"
```

---

## Chunk 3: Clipboard, cut/copy/paste

### Task 8.7: Clipboard envelope + serialize/parse

**Files:**
- Create: `packages/studio-core/src/store/clipboard.ts`
- Create: `packages/studio-core/src/store/clipboard-store.ts` (fallback slice)
- Test: `packages/studio-core/tests/store/clipboard.spec.ts`

- [ ] **Step 1: Write failing tests for serialize/parse/validate**

```ts
import { describe, it, expect } from 'bun:test';
import { serializeClipboard, parseClipboard } from '../../src/store/clipboard';

const node = (id: string, deps: string[] = []) =>
  ({ id, variant: 'bash', data: { bash: { code: 'echo' } }, base: deps.length ? { depends_on: deps } : {}, unknown: {} } as any);

describe('clipboard', () => {
  it('serialize wraps nodes in a versioned envelope', () => {
    const text = serializeClipboard([node('a')]);
    const obj = JSON.parse(text);
    expect(obj.__archonStudio).toBe('clipboard-v1');
    expect(obj.nodes).toHaveLength(1);
  });

  it('parse accepts a valid envelope and returns nodes', () => {
    const text = serializeClipboard([node('a', ['b'])]);
    const result = parseClipboard(text);
    expect(result?.nodes[0].id).toBe('a');
    expect(result?.nodes[0].base.depends_on).toEqual(['b']);
  });

  it('parse rejects non-JSON', () => {
    expect(parseClipboard('not json')).toBeNull();
  });

  it('parse rejects wrong magic', () => {
    expect(parseClipboard(JSON.stringify({ nodes: [] }))).toBeNull();
  });

  it('parse rejects wrong version', () => {
    expect(parseClipboard(JSON.stringify({ __archonStudio: 'clipboard-v2', nodes: [] }))).toBeNull();
  });

  it('parse rejects when nodes is not an array', () => {
    expect(parseClipboard(JSON.stringify({ __archonStudio: 'clipboard-v1', nodes: 'oops' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `clipboard.ts` (serialize/parse only)**

```ts
import type { BuilderNode } from '../nodes/shared/types';

export interface ClipboardEnvelope {
  __archonStudio: 'clipboard-v1';
  exportedAt: string;
  nodes: BuilderNode[];
}

export function serializeClipboard(nodes: BuilderNode[]): string {
  const env: ClipboardEnvelope = {
    __archonStudio: 'clipboard-v1',
    exportedAt: new Date().toISOString(),
    nodes,
  };
  return JSON.stringify(env);
}

export function parseClipboard(text: string): ClipboardEnvelope | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const e = obj as Partial<ClipboardEnvelope>;
  if (e.__archonStudio !== 'clipboard-v1') return null;
  if (!Array.isArray(e.nodes)) return null;
  return e as ClipboardEnvelope;
}
```

- [ ] **Step 3: Implement fallback slice `clipboard-store.ts`**

```ts
import { create } from 'zustand';
import type { BuilderNode } from '../nodes/shared/types';

interface ClipboardState {
  lastCopy: BuilderNode[] | null;
  setLastCopy: (nodes: BuilderNode[] | null) => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  lastCopy: null,
  setLastCopy: (nodes) => set({ lastCopy: nodes }),
}));
```

- [ ] **Step 4: Run — expect 6 pass**

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/store/clipboard.ts \
        packages/studio-core/src/store/clipboard-store.ts \
        packages/studio-core/tests/store/clipboard.spec.ts
git commit -m "feat(clipboard): serialize/parse envelope + fallback slice"
```

---

### Task 8.8: Copy + paste actions with ID remap + `depends_on` rewrite

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts` (add `copySelection`, `pasteFromText`)
- Modify: `packages/studio-core/src/store/clipboard.ts` (ID-remap helpers)
- Test: `packages/studio-core/tests/store/paste.spec.ts`

- [ ] **Step 1: Write failing tests for ID-remap helper**

```ts
import { describe, it, expect } from 'bun:test';
import { remapPastedNodes } from '../../src/store/clipboard';

const node = (id: string, deps: string[] = []) =>
  ({ id, variant: 'bash', data: {}, base: deps.length ? { depends_on: deps } : {}, unknown: {} } as any);

describe('remapPastedNodes', () => {
  it('no collision: appends -copy', () => {
    const out = remapPastedNodes([node('build')], new Set(['build']));
    expect(out[0].id).toBe('build-copy');
  });

  it('collision: increments suffix', () => {
    const out = remapPastedNodes([node('build')], new Set(['build', 'build-copy']));
    expect(out[0].id).toBe('build-copy-2');
  });

  it('source already has -copy suffix: strips and re-suffixes', () => {
    const out = remapPastedNodes([node('build-copy-3')], new Set(['build', 'build-copy']));
    expect(out[0].id).toBe('build-copy-2');
  });

  it('rewrites internal depends_on', () => {
    const out = remapPastedNodes(
      [node('a'), node('b', ['a'])],
      new Set(['a', 'b']),
    );
    expect(out[0].id).toBe('a-copy');
    expect(out[1].id).toBe('b-copy');
    expect(out[1].base.depends_on).toEqual(['a-copy']);
  });

  it('drops external depends_on (not in paste set)', () => {
    const out = remapPastedNodes([node('a', ['external'])], new Set(['external', 'a']));
    expect(out[0].base.depends_on).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `remapPastedNodes`**

In `clipboard.ts`:

```ts
const COPY_SUFFIX = /-copy(?:-(\d+))?$/;

function stripCopySuffix(id: string): string {
  return id.replace(COPY_SUFFIX, '');
}

function nextFreeId(base: string, taken: Set<string>): string {
  const candidate = `${base}-copy`;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${base}-copy-${n}`)) n += 1;
  return `${base}-copy-${n}`;
}

export function remapPastedNodes(input: BuilderNode[], takenIds: Set<string>): BuilderNode[] {
  const idMap = new Map<string, string>();
  const reservation = new Set(takenIds);
  for (const node of input) {
    const base = stripCopySuffix(node.id);
    const newId = nextFreeId(base, reservation);
    idMap.set(node.id, newId);
    reservation.add(newId);
  }
  const pasteSet = new Set(input.map((n) => n.id));
  return input.map((n) => {
    const deps = (n.base.depends_on as string[] | undefined) ?? [];
    const rewritten = deps
      .filter((d) => pasteSet.has(d))
      .map((d) => idMap.get(d)!);
    const newBase = { ...n.base };
    if (rewritten.length === 0) delete newBase.depends_on;
    else newBase.depends_on = rewritten;
    return { ...n, id: idMap.get(n.id)!, base: newBase };
  });
}
```

- [ ] **Step 3: Run — expect 5 pass**

- [ ] **Step 4: Write failing test for `copySelection` / `pasteFromText` store actions**

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUndoStore } from '../../src/store/undo-store';

const node = (id: string, deps: string[] = []) =>
  ({ id, variant: 'bash', data: {}, base: deps.length ? { depends_on: deps } : {}, unknown: {} } as any);

describe('copy + paste', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      workflow: null,
      nodes: [node('a'), node('b', ['a'])],
      selectedNodeIds: ['a', 'b'],
      positions: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    });
    useUndoStore.setState({ past: [], future: [] });
  });

  it('copySelection returns a clipboard envelope text', () => {
    const text = useBuilderStore.getState().copySelection();
    expect(text).toContain('clipboard-v1');
    const obj = JSON.parse(text!);
    expect(obj.nodes).toHaveLength(2);
  });

  it('copySelection returns null when nothing selected', () => {
    useBuilderStore.setState({ selectedNodeIds: [] });
    expect(useBuilderStore.getState().copySelection()).toBeNull();
  });

  it('pasteFromText adds remapped nodes with one undo snapshot', () => {
    const text = useBuilderStore.getState().copySelection()!;
    useBuilderStore.getState().pasteFromText(text);
    const ids = useBuilderStore.getState().nodes.map((n) => n.id);
    expect(ids).toEqual(['a', 'b', 'a-copy', 'b-copy']);
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().past[0].label).toBe('Paste 2 nodes');
  });

  it('pasteFromText sets new nodes as selection', () => {
    const text = useBuilderStore.getState().copySelection()!;
    useBuilderStore.getState().pasteFromText(text);
    expect(useBuilderStore.getState().selectedNodeIds).toEqual(['a-copy', 'b-copy']);
  });

  it('pasteFromText offsets positions by (40, 40)', () => {
    const text = useBuilderStore.getState().copySelection()!;
    useBuilderStore.getState().pasteFromText(text);
    const positions = useBuilderStore.getState().positions;
    expect(positions['a-copy']).toEqual({ x: 40, y: 40 });
    expect(positions['b-copy']).toEqual({ x: 140, y: 40 });
  });

  it('pasteFromText returns false for malformed input', () => {
    expect(useBuilderStore.getState().pasteFromText('garbage')).toBe(false);
  });
});
```

- [ ] **Step 5: Implement `copySelection` and `pasteFromText` in builder-store**

```ts
copySelection: () => {
  const { selectedNodeIds, nodes } = get();
  if (selectedNodeIds.length === 0) return null;
  const selected = nodes.filter((n) => selectedNodeIds.includes(n.id));
  return serializeClipboard(selected);
},

pasteFromText: (text) => {
  const env = parseClipboard(text);
  if (!env || env.nodes.length === 0) return false;
  const takenIds = new Set(get().nodes.map((n) => n.id));
  const remapped = remapPastedNodes(env.nodes, takenIds);

  // Anchor offset: original bounding-box top-left + (40, 40)
  const sourcePositions = env.nodes.map((n) => get().positions[n.id]).filter(Boolean);
  // Best-effort: clipboard does not carry positions, so fall back to current store positions for same-tab paste; cross-tab paste yields (40, 40) absolute.
  const minX = sourcePositions.length ? Math.min(...sourcePositions.map((p) => p!.x)) : 0;
  const minY = sourcePositions.length ? Math.min(...sourcePositions.map((p) => p!.y)) : 0;
  const positionPatch: Record<string, { x: number; y: number }> = {};
  remapped.forEach((rn, i) => {
    const src = env.nodes[i];
    const srcPos = get().positions[src.id];
    if (srcPos) {
      positionPatch[rn.id] = { x: srcPos.x - minX + 40, y: srcPos.y - minY + 40 };
    } else {
      positionPatch[rn.id] = { x: 40 + i * 24, y: 40 + i * 24 };
    }
  });

  withUndo(`Paste ${remapped.length} node${remapped.length === 1 ? '' : 's'}`, () => {
    set((s) => ({
      nodes: [...s.nodes, ...remapped],
      positions: { ...s.positions, ...positionPatch },
      selectedNodeIds: remapped.map((n) => n.id),
      primarySelectionId: remapped[remapped.length - 1].id,
    }));
  });
  return true;
},
```

**Note on clipboard positions:** the envelope does not carry positions in v1; this is intentional (the design says "anchored at the current viewport center if pasting cross-tab"). The test above relies on same-tab paste where `get().positions` still has the source IDs. For cross-tab, the fallback `(40 + i * 24)` cascade is used. A v2 envelope can carry positions if needed.

- [ ] **Step 6: Run — expect 6 new pass**

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/store/clipboard.ts \
        packages/studio-core/tests/store/paste.spec.ts
git commit -m "feat(clipboard): copySelection + pasteFromText with ID remap"
```

---

### Task 8.9: Cut, removeSelected, and shortcut wiring

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts` (add `cutSelection`)
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx` (mount `useHotkeys` for copy/paste/cut/delete)
- Test: `packages/studio-core/tests/store/cut.spec.ts`

- [ ] **Step 1: Write failing test for `cutSelection`**

```ts
it('cutSelection returns clipboard text AND removes selected nodes in one snapshot', () => {
  // setup: nodes a, b, c with selection [a, b]
  useBuilderStore.setState({
    nodes: [node('a'), node('b'), node('c', ['a'])],
    selectedNodeIds: ['a', 'b'],
    positions: { a: { x: 0, y: 0 }, b: { x: 50, y: 0 }, c: { x: 100, y: 0 } },
  });
  useUndoStore.setState({ past: [], future: [] });

  const text = useBuilderStore.getState().cutSelection();
  expect(text).toContain('clipboard-v1');
  expect(useBuilderStore.getState().nodes.map((n) => n.id)).toEqual(['c']);
  expect(useUndoStore.getState().past).toHaveLength(1);
  expect(useUndoStore.getState().past[0].label).toBe('Cut 2 nodes');
});
```

- [ ] **Step 2: Implement `cutSelection`**

```ts
cutSelection: () => {
  const { selectedNodeIds, nodes } = get();
  if (selectedNodeIds.length === 0) return null;
  const selected = nodes.filter((n) => selectedNodeIds.includes(n.id));
  const text = serializeClipboard(selected);
  withUndo(`Cut ${selected.length} node${selected.length === 1 ? '' : 's'}`, () => {
    // Inline deleteNodes body — must NOT re-call withUndo (would double-snapshot)
    const idSet = new Set(selectedNodeIds);
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
      selectedNodeIds: [],
      primarySelectionId: null,
    }));
  });
  return text;
},
```

**Drift risk:** `deleteNodes` was wrapped with `withUndo` in Task 8.5. Calling it inside `cutSelection`'s `withUndo` callback would push two snapshots. Two clean ways out:
1. Extract `_deleteNodesRaw` (no wrap) and call it from both `deleteNodes` (wrapped) and `cutSelection` (also wrapped at its own boundary).
2. Inline the delete body (above).

Pick option 1 if `deleteNodes` is a long body. Update this task accordingly during execution.

- [ ] **Step 3: Add `useHotkeys` bindings to `WorkflowBuilder.tsx`**

```tsx
import { useHotkeys } from 'react-hotkeys-hook';
import { SHORTCUTS } from '../shortcuts';
import { applyUndo, applyRedo } from '../store/applyUndo';

// inside WorkflowBuilder body:
const copySelection = useBuilderStore((s) => s.copySelection);
const pasteFromText = useBuilderStore((s) => s.pasteFromText);
const cutSelection = useBuilderStore((s) => s.cutSelection);
const removeSelected = useBuilderStore((s) => s.removeSelected);
const selectAll = useBuilderStore((s) => s.selectAll);
const clearSelection = useBuilderStore((s) => s.clearSelection);

useHotkeys(SHORTCUTS.undo, () => applyUndo(), { preventDefault: true });
useHotkeys(SHORTCUTS.redo, () => applyRedo(), { preventDefault: true });
useHotkeys(SHORTCUTS.copy, async () => {
  const text = copySelection();
  if (text) await navigator.clipboard.writeText(text).catch(() => {});
}, { preventDefault: true });
useHotkeys(SHORTCUTS.paste, async () => {
  try {
    const text = await navigator.clipboard.readText();
    pasteFromText(text);
  } catch {
    // fallback handled later in Task 8.9 step 5
  }
}, { preventDefault: true });
useHotkeys(SHORTCUTS.cut, async () => {
  const text = cutSelection();
  if (text) await navigator.clipboard.writeText(text).catch(() => {});
}, { preventDefault: true });
useHotkeys(SHORTCUTS.delete, () => removeSelected(), { preventDefault: true });
useHotkeys(SHORTCUTS.selectAll, () => selectAll(), { preventDefault: true });
useHotkeys(SHORTCUTS.clearSelection, () => clearSelection());
```

All hotkeys mount with `{ enableOnFormTags: false, enableOnContentEditable: false }` to avoid firing while typing in inspector fields or CodeMirror.

- [ ] **Step 4: Implement clipboard fallback to `useClipboardStore.lastCopy`**

Wrap copy/paste so when `navigator.clipboard.writeText` / `readText` rejects, the fallback slice is used:

```ts
const writeText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    useClipboardStore.getState().setLastCopy(parseClipboard(text)?.nodes ?? null);
  }
};
const readText = async (): Promise<string | null> => {
  try {
    return await navigator.clipboard.readText();
  } catch {
    const last = useClipboardStore.getState().lastCopy;
    return last ? serializeClipboard(last) : null;
  }
};
```

- [ ] **Step 5: Run — expect 1 new + ensure prior pass green**

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/tests/store/cut.spec.ts
git commit -m "feat(clipboard): cut + WorkflowBuilder hotkey bindings"
```

---

## Chunk 4: Alignment, distribution, auto-arrange

### Task 8.10: `useAlignment` kernel — pure functions

**Files:**
- Create: `packages/studio-core/src/hooks/useAlignment.ts`
- Test: `packages/studio-core/tests/hooks/useAlignment.spec.ts`

- [ ] **Step 1: Define types and write 6 failing alignment tests**

```ts
// types
export type Dims = { width: number; height: number };
export type Pos = { x: number; y: number };
export type PosMap = Record<string, Pos>;
export type DimsMap = Record<string, Dims>;
```

Test cases (one per kernel + a same-already case for one):

```ts
import { describe, it, expect } from 'bun:test';
import { alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV } from '../../src/hooks/useAlignment';

const ids = ['a', 'b', 'c'];
const pos = { a: { x: 0, y: 0 }, b: { x: 50, y: 100 }, c: { x: 30, y: 200 } };
const dims = { a: { width: 80, height: 40 }, b: { width: 80, height: 40 }, c: { width: 80, height: 40 } };

describe('alignment kernels', () => {
  it('alignLeft sets x = min(x)', () => {
    const out = alignLeft(ids, pos, dims);
    expect(out.a.x).toBe(0);
    expect(out.b.x).toBe(0);
    expect(out.c.x).toBe(0);
  });
  it('alignRight sets x + width = max(x + width)', () => {
    const out = alignRight(ids, pos, dims);
    const maxRight = Math.max(0 + 80, 50 + 80, 30 + 80); // 130
    expect(out.a.x).toBe(maxRight - 80);
    expect(out.b.x).toBe(maxRight - 80);
    expect(out.c.x).toBe(maxRight - 80);
  });
  // ... alignTop / alignBottom (mirror on y)
  it('alignCenterH centers each on the mean of selection centers', () => {
    const out = alignCenterH(ids, pos, dims);
    const centers = ids.map((i) => pos[i].x + dims[i].width / 2);
    const mean = centers.reduce((a, b) => a + b, 0) / centers.length;
    expect(out.a.x).toBe(mean - 40);
  });
  // ... alignCenterV
});
```

- [ ] **Step 2: Implement the kernels**

```ts
function each(ids: string[], pos: PosMap, dims: DimsMap, fn: (id: string) => Pos): PosMap {
  const out: PosMap = {};
  for (const id of ids) {
    const d = dims[id] ?? { width: 0, height: 0 };
    const p = pos[id] ?? { x: 0, y: 0 };
    out[id] = fn(id);
  }
  return out;
}

export function alignLeft(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  const minX = Math.min(...ids.map((i) => pos[i].x));
  return Object.fromEntries(ids.map((i) => [i, { x: minX, y: pos[i].y }]));
}

export function alignRight(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  const maxRight = Math.max(...ids.map((i) => pos[i].x + dims[i].width));
  return Object.fromEntries(ids.map((i) => [i, { x: maxRight - dims[i].width, y: pos[i].y }]));
}

export function alignTop(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  const minY = Math.min(...ids.map((i) => pos[i].y));
  return Object.fromEntries(ids.map((i) => [i, { x: pos[i].x, y: minY }]));
}

export function alignBottom(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  const maxBottom = Math.max(...ids.map((i) => pos[i].y + dims[i].height));
  return Object.fromEntries(ids.map((i) => [i, { x: pos[i].x, y: maxBottom - dims[i].height }]));
}

export function alignCenterH(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  const centers = ids.map((i) => pos[i].x + dims[i].width / 2);
  const mean = centers.reduce((a, b) => a + b, 0) / centers.length;
  return Object.fromEntries(ids.map((i) => [i, { x: mean - dims[i].width / 2, y: pos[i].y }]));
}

export function alignCenterV(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  const centers = ids.map((i) => pos[i].y + dims[i].height / 2);
  const mean = centers.reduce((a, b) => a + b, 0) / centers.length;
  return Object.fromEntries(ids.map((i) => [i, { x: pos[i].x, y: mean - dims[i].height / 2 }]));
}
```

- [ ] **Step 3: Run — expect 6 pass**

- [ ] **Step 4: Commit**

```bash
git add packages/studio-core/src/hooks/useAlignment.ts \
        packages/studio-core/tests/hooks/useAlignment.spec.ts
git commit -m "feat(alignment): pure kernel for align L/R/T/B/center"
```

---

### Task 8.11: Distribution kernels

**Files:**
- Modify: `packages/studio-core/src/hooks/useAlignment.ts` (add `distributeHorizontal`, `distributeVertical`)
- Modify: `packages/studio-core/tests/hooks/useAlignment.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('distributeHorizontal equalizes inter-node gaps; outer extents fixed', () => {
  const ids = ['a', 'b', 'c'];
  const pos = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 300, y: 0 } };
  const dims = { a: { width: 50, height: 40 }, b: { width: 50, height: 40 }, c: { width: 50, height: 40 } };
  const out = distributeHorizontal(ids, pos, dims);
  // Total span fixed: 0 → 350 (c.x + width = 350)
  // Total node width = 150; total gap = 200; 2 gaps, each = 100
  // Layout: a@0, b@(0+50+100)=150, c@(150+50+100)=300
  expect(out.a.x).toBe(0);
  expect(out.b.x).toBe(150);
  expect(out.c.x).toBe(300);
});
```

- [ ] **Step 2: Implement**

```ts
export function distributeHorizontal(ids: string[], pos: PosMap, dims: DimsMap): PosMap {
  if (ids.length < 3) return Object.fromEntries(ids.map((i) => [i, pos[i]]));
  const sorted = [...ids].sort((a, b) => pos[a].x - pos[b].x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const left = pos[first].x;
  const right = pos[last].x + dims[last].width;
  const totalNodeWidth = sorted.reduce((acc, i) => acc + dims[i].width, 0);
  const gap = (right - left - totalNodeWidth) / (sorted.length - 1);
  const out: PosMap = {};
  let cursor = left;
  for (const id of sorted) {
    out[id] = { x: cursor, y: pos[id].y };
    cursor += dims[id].width + gap;
  }
  return out;
}

// distributeVertical mirrors on y
```

- [ ] **Step 3: Run — expect 2 new pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(alignment): distribute horizontal/vertical"
```

---

### Task 8.12: Auto-arrange selection (dagre subset)

**Files:**
- Modify: `packages/studio-core/src/hooks/useDagre.ts` (extract pure `dagreLayout(nodes, edges, options) → PosMap`)
- Create: `packages/studio-core/src/hooks/useAutoArrangeSelection.ts`
- Test: `packages/studio-core/tests/hooks/useAutoArrangeSelection.spec.ts`

- [ ] **Step 1: Extract pure `dagreLayout`**

If `useDagre` currently does its work inside the hook body, refactor: pull the dagre graph construction + `dagre.layout()` + position extraction into `dagreLayout(nodes, edges, options): PosMap`. The hook becomes a thin wrapper that reads from the store and writes back.

- [ ] **Step 2: Write failing test for selection-scoped arrange**

```ts
it('arranges selected nodes; leaves others untouched; preserves bounding-box top-left', () => {
  const nodes = [node('a'), node('b', ['a']), node('c'), node('outside', ['a'])];
  const positions = {
    a: { x: 100, y: 100 },
    b: { x: 100, y: 200 },
    c: { x: 100, y: 300 },
    outside: { x: 500, y: 500 },
  };
  const dims = Object.fromEntries(['a', 'b', 'c', 'outside'].map((i) => [i, { width: 80, height: 40 }]));
  const out = autoArrangeSelection({ ids: ['a', 'b', 'c'], nodes, positions, dims });

  // outside unchanged
  expect(out.outside).toEqual(positions.outside);
  // bounding-box top-left preserved at (100, 100)
  const minX = Math.min(...['a', 'b', 'c'].map((i) => out[i].x));
  const minY = Math.min(...['a', 'b', 'c'].map((i) => out[i].y));
  expect(minX).toBe(100);
  expect(minY).toBe(100);
});
```

- [ ] **Step 3: Implement**

```ts
export function autoArrangeSelection(input: {
  ids: string[];
  nodes: BuilderNode[];
  positions: PosMap;
  dims: DimsMap;
}): PosMap {
  const idSet = new Set(input.ids);
  const subset = input.nodes.filter((n) => idSet.has(n.id));
  const edges: Array<{ source: string; target: string }> = [];
  for (const n of subset) {
    const deps = (n.base.depends_on as string[] | undefined) ?? [];
    for (const d of deps) {
      if (idSet.has(d)) edges.push({ source: d, target: n.id });
    }
  }
  const laidOut = dagreLayout(subset, edges, { /* same options as useDagre */ });

  // Translate so bounding-box top-left matches the selection's current top-left
  const currMinX = Math.min(...input.ids.map((i) => input.positions[i].x));
  const currMinY = Math.min(...input.ids.map((i) => input.positions[i].y));
  const newMinX = Math.min(...input.ids.map((i) => laidOut[i].x));
  const newMinY = Math.min(...input.ids.map((i) => laidOut[i].y));
  const dx = currMinX - newMinX;
  const dy = currMinY - newMinY;

  const result: PosMap = { ...input.positions };
  for (const id of input.ids) {
    result[id] = { x: laidOut[id].x + dx, y: laidOut[id].y + dy };
  }
  return result;
}
```

- [ ] **Step 4: Run — expect 1 new pass; ensure existing useDagre tests still green**

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/hooks/useDagre.ts \
        packages/studio-core/src/hooks/useAutoArrangeSelection.ts \
        packages/studio-core/tests/hooks/useAutoArrangeSelection.spec.ts
git commit -m "feat(alignment): autoArrangeSelection (dagre subset, top-left anchored)"
```

---

### Task 8.13: Toolbar alignment / distribute / auto-arrange buttons + store actions

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts` (add `alignSelection`, `distributeSelection`, `autoArrangeSelectedNodes`)
- Modify: `packages/studio-core/src/components/Toolbar.tsx`
- Modify: `packages/studio-core/src/components/Toolbar.module.css`
- Test: `packages/studio-core/tests/components/Toolbar.alignment.spec.tsx`

- [ ] **Step 1: Add store actions**

```ts
alignSelection: (mode: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => {
  const { selectedNodeIds, positions } = get();
  if (selectedNodeIds.length < 2) return;
  const dims = readDimsFromReactFlow();  // helper hooked to the RF instance
  const kernel = ALIGN_KERNELS[mode];
  const patch = kernel(selectedNodeIds, positions, dims);
  withUndo(`Align ${mode}`, () => {
    set((s) => ({ positions: { ...s.positions, ...patch } }));
  });
},

distributeSelection: (axis: 'horizontal' | 'vertical') => { /* parallel */ },

autoArrangeSelectedNodes: () => {
  const { selectedNodeIds, nodes, positions } = get();
  if (selectedNodeIds.length < 2) return;
  const dims = readDimsFromReactFlow();
  const patch = autoArrangeSelection({ ids: selectedNodeIds, nodes, positions, dims });
  withUndo('Auto-arrange selection', () => {
    set((s) => ({ positions: patch }));
  });
},
```

**Dims source:** Add a `useNodeDimensions` hook that subscribes to the React Flow instance (`useReactFlow().getNodes()` returns nodes with `width`/`height` after measurement). The store action takes a `dims` snapshot at call time. One pattern: hold a `_dimsRef` ref written from `WorkflowBuilder` on each RF measure callback.

- [ ] **Step 2: Add toolbar buttons**

8 icon buttons in a group: `⫷ ⫸ ⫶ ⫷ ⫷ ⫸ ⇿ ⇕` (or use SVG/lucide icons). Each calls the corresponding store action. Buttons have `disabled={selectedNodeIds.length < 2}` for align, `< 3` for distribute. Plus a separate "Auto-arrange selection" button (`mod+shift+a` tooltip).

- [ ] **Step 3: Write failing component test**

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { Toolbar } from '../../src/components/Toolbar';
import { useBuilderStore } from '../../src/store/builder-store';

describe('<Toolbar> alignment group', () => {
  beforeEach(() => useBuilderStore.setState({ nodes: [], selectedNodeIds: [] }));
  afterEach(() => cleanup());

  it('align buttons disabled when <2 selected', () => {
    const { getByLabelText } = render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
    expect(getByLabelText('Align left').hasAttribute('disabled')).toBe(true);
  });

  it('distribute buttons disabled when <3 selected', () => {
    useBuilderStore.setState({ selectedNodeIds: ['a', 'b'] });
    const { getByLabelText } = render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
    expect(getByLabelText('Align left').hasAttribute('disabled')).toBe(false);
    expect(getByLabelText('Distribute horizontally').hasAttribute('disabled')).toBe(true);
  });
});
```

- [ ] **Step 4: Run — expect 2 new pass**

- [ ] **Step 5: Wire shortcuts**

In `WorkflowBuilder.tsx`:

```ts
useHotkeys(SHORTCUTS.alignLeft, () => alignSelection('left'));
useHotkeys(SHORTCUTS.alignRight, () => alignSelection('right'));
useHotkeys(SHORTCUTS.alignTop, () => alignSelection('top'));
useHotkeys(SHORTCUTS.alignBottom, () => alignSelection('bottom'));
useHotkeys(SHORTCUTS.autoArrangeSelection, () => autoArrangeSelectedNodes());
```

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/components/Toolbar.tsx \
        packages/studio-core/src/components/Toolbar.module.css \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/tests/components/Toolbar.alignment.spec.tsx
git commit -m "feat(toolbar): alignment + distribute + auto-arrange buttons & shortcuts"
```

---

## Chunk 5: Smart guides + snap-to-grid

### Task 8.14: `computeGuides` pure function

**Files:**
- Create: `packages/studio-core/src/components/canvas/computeGuides.ts`
- Test: `packages/studio-core/tests/components/canvas/computeGuides.spec.ts`

- [ ] **Step 1: Types and tests**

```ts
export interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GuideKind =
  | 'left' | 'right' | 'centerH'
  | 'top' | 'bottom' | 'centerV'
  | 'equal-gap-h' | 'equal-gap-v';

export interface Guide {
  kind: GuideKind;
  /** flow-space coordinate of the guide line (x for vertical guides, y for horizontal) */
  coord: number;
  /** axis the guide constrains: 'x' or 'y'. equal-gap-h uses axis 'x'; equal-gap-v uses 'y' */
  axis: 'x' | 'y';
  /** if non-null, snap the dragged node to this value on this axis */
  snapTo: number | null;
  /** debug only — which other node(s) participated */
  participantIds: string[];
}
```

Test cases:

```ts
import { describe, it, expect } from 'bun:test';
import { computeGuides } from '../../../src/components/canvas/computeGuides';

const box = (id: string, x: number, y: number, w = 80, h = 40) => ({ id, x, y, width: w, height: h });

describe('computeGuides', () => {
  it('returns left-edge guide when dragged-left == other-left within threshold', () => {
    const dragged = box('drag', 102, 0);
    const others = [box('a', 100, 100)];
    const guides = computeGuides(dragged, others, 6);
    const left = guides.find((g) => g.kind === 'left');
    expect(left).toBeDefined();
    expect(left!.snapTo).toBe(100);
  });

  it('returns center-h guide when centers align within threshold', () => {
    const dragged = box('drag', 102, 0); // center = 142
    const others = [box('a', 100, 100)];  // center = 140
    const guides = computeGuides(dragged, others, 6);
    const ch = guides.find((g) => g.kind === 'centerH');
    expect(ch).toBeDefined();
  });

  it('returns no guides when nothing within threshold', () => {
    const dragged = box('drag', 500, 500);
    const others = [box('a', 0, 0)];
    expect(computeGuides(dragged, others, 6)).toEqual([]);
  });

  it('emits equal-gap-h when dragged sits between two on same y axis with matching gap', () => {
    const dragged = box('drag', 150, 0);
    const others = [box('a', 0, 0), box('c', 300, 0)]; // gapA = 150-80 = 70; gapC = 300-(150+80) = 70
    const guides = computeGuides(dragged, others, 6);
    expect(guides.some((g) => g.kind === 'equal-gap-h')).toBe(true);
  });

  // 4 more cases: right, top, bottom, centerV
});
```

- [ ] **Step 2: Implement**

```ts
const REFS = ['left', 'right', 'centerH', 'top', 'bottom', 'centerV'] as const;

function refValue(b: NodeBox, kind: typeof REFS[number]): number {
  switch (kind) {
    case 'left': return b.x;
    case 'right': return b.x + b.width;
    case 'centerH': return b.x + b.width / 2;
    case 'top': return b.y;
    case 'bottom': return b.y + b.height;
    case 'centerV': return b.y + b.height / 2;
  }
}

function axisOf(kind: typeof REFS[number]): 'x' | 'y' {
  return kind === 'left' || kind === 'right' || kind === 'centerH' ? 'x' : 'y';
}

export function computeGuides(dragged: NodeBox, others: NodeBox[], threshold: number): Guide[] {
  const guides: Guide[] = [];
  for (const ref of REFS) {
    const dragVal = refValue(dragged, ref);
    for (const other of others) {
      const otherVal = refValue(other, ref);
      if (Math.abs(dragVal - otherVal) <= threshold) {
        const axis = axisOf(ref);
        const snapTo = axis === 'x'
          ? otherVal - (dragVal - dragged.x)
          : otherVal - (dragVal - dragged.y);
        guides.push({
          kind: ref,
          coord: otherVal,
          axis,
          snapTo,
          participantIds: [other.id],
        });
      }
    }
  }
  // Equal-gap (horizontal): same y-overlap, dragged between two others
  for (let i = 0; i < others.length; i += 1) {
    for (let j = i + 1; j < others.length; j += 1) {
      const [a, b] = [others[i], others[j]].sort((x, y) => x.x - y.x);
      if (a.x + a.width <= dragged.x && dragged.x + dragged.width <= b.x) {
        const gapA = dragged.x - (a.x + a.width);
        const gapB = b.x - (dragged.x + dragged.width);
        if (Math.abs(gapA - gapB) <= threshold) {
          guides.push({
            kind: 'equal-gap-h',
            coord: (a.x + a.width + dragged.x) / 2,
            axis: 'x',
            snapTo: null,
            participantIds: [a.id, b.id],
          });
        }
      }
    }
  }
  // Equal-gap (vertical): mirror on y
  // ... same pattern
  return guides;
}
```

- [ ] **Step 3: Run — expect 8 pass**

- [ ] **Step 4: Commit**

```bash
git add packages/studio-core/src/components/canvas/computeGuides.ts \
        packages/studio-core/tests/components/canvas/computeGuides.spec.ts
git commit -m "feat(canvas): computeGuides pure function (alignment + equal-gap)"
```

---

### Task 8.15: `<SmartGuidesLayer>` component

**Files:**
- Create: `packages/studio-core/src/components/canvas/SmartGuidesLayer.tsx`
- Create: `packages/studio-core/src/components/canvas/SmartGuidesLayer.module.css`
- Test: `packages/studio-core/tests/components/canvas/SmartGuidesLayer.spec.tsx`

- [ ] **Step 1: Write structural test**

```tsx
it('renders one <line> per alignment guide and "=" pip per equal-gap', () => {
  const guides: Guide[] = [
    { kind: 'left', coord: 100, axis: 'x', snapTo: 100, participantIds: ['a'] },
    { kind: 'equal-gap-h', coord: 150, axis: 'x', snapTo: null, participantIds: ['a', 'b'] },
  ];
  const { container } = render(<SmartGuidesLayer guides={guides} />);
  expect(container.querySelectorAll('[data-guide-kind="left"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-guide-kind="equal-gap-h"]')).toHaveLength(1);
});
```

- [ ] **Step 2: Implement**

```tsx
export interface SmartGuidesLayerProps {
  guides: Guide[];
}

export function SmartGuidesLayer({ guides }: SmartGuidesLayerProps) {
  return (
    <svg className={styles.layer} aria-hidden="true">
      {guides.map((g, i) => {
        if (g.kind === 'equal-gap-h' || g.kind === 'equal-gap-v') {
          return (
            <text key={i} x={g.coord} y={g.axis === 'x' ? 8 : 8} className={styles.pip} data-guide-kind={g.kind}>=</text>
          );
        }
        // alignment line — vertical for x-axis, horizontal for y-axis
        return g.axis === 'x' ? (
          <line key={i} x1={g.coord} x2={g.coord} y1={0} y2={'100%' as any} className={styles.line} data-guide-kind={g.kind} />
        ) : (
          <line key={i} x1={0} x2={'100%' as any} y1={g.coord} y2={g.coord} className={styles.line} data-guide-kind={g.kind} />
        );
      })}
    </svg>
  );
}
```

CSS: absolutely positioned, full-viewport, `pointer-events: none`. `.line` red 1px; `.pip` red 10px sans-serif.

- [ ] **Step 3: Run — expect 1 pass**

- [ ] **Step 4: Commit**

```bash
git add packages/studio-core/src/components/canvas/SmartGuidesLayer.tsx \
        packages/studio-core/src/components/canvas/SmartGuidesLayer.module.css \
        packages/studio-core/tests/components/canvas/SmartGuidesLayer.spec.tsx
git commit -m "feat(canvas): SmartGuidesLayer SVG overlay component"
```

---

### Task 8.16: Wire smart guides into Canvas; snap precedence

**Files:**
- Modify: `packages/studio-core/src/components/Canvas.tsx`
- Modify: `packages/studio-core/src/store/builder-store.ts` (add `activeGuides: Guide[]` transient slice)

- [ ] **Step 1: Add `activeGuides` slice (transient)**

```ts
activeGuides: Guide[];
setActiveGuides: (g: Guide[]) => void;
```

Not snapshotted; reset on `clearWorkflow`.

- [ ] **Step 2: `onNodeDragStart` precomputes the "others" snapshot**

```tsx
const dragOthersRef = useRef<NodeBox[]>([]);

const onNodeDragStart = (_e, node) => {
  beginDrag('Move node');
  const all = rfInstance.getNodes();
  dragOthersRef.current = all
    .filter((n) => n.id !== node.id)
    .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 }));
};
```

- [ ] **Step 3: `onNodeDrag` computes guides + applies snap**

```tsx
const onNodeDrag = (_e, node) => {
  if (dragOthersRef.current.length > 200) {
    setActiveGuides([]);
    return;
  }
  const draggedBox = { id: node.id, x: node.position.x, y: node.position.y, width: node.width ?? 0, height: node.height ?? 0 };
  const guides = computeGuides(draggedBox, dragOthersRef.current, 6);
  setActiveGuides(guides);
  // Snap: pick the lowest-coord-delta snap per axis
  const xSnap = guides.find((g) => g.axis === 'x' && g.snapTo !== null);
  const ySnap = guides.find((g) => g.axis === 'y' && g.snapTo !== null);
  if (xSnap?.snapTo != null) node.position.x = xSnap.snapTo;
  if (ySnap?.snapTo != null) node.position.y = ySnap.snapTo;
};
```

**Precedence with grid snap (Task 8.17):** since `onNodeDrag` runs before React Flow's internal `snapGrid` adjustment, our snap-to-guide value wins when a guide is active; otherwise RF's `snapToGrid={true}` rounds the cursor position to the 16px grid.

- [ ] **Step 4: `onNodeDragStop` clears guides + commits undo**

```tsx
const onNodeDragStop = (_e, node) => {
  setNodePosition(node.id, node.position);
  setActiveGuides([]);
  dragOthersRef.current = [];
  commitDrag();
};
```

- [ ] **Step 5: Mount `<SmartGuidesLayer>` inside the React Flow viewport**

```tsx
<ReactFlow ...>
  <SmartGuidesLayer guides={activeGuides} />
  ...
</ReactFlow>
```

CSS must ensure the SVG sits in flow-space, not screen-space — use a `<Panel position="top-left">` with `transform: scale(zoom)` if the simpler full-overlay doesn't track zoom correctly. Validate during manual smoke.

- [ ] **Step 6: Manual smoke check (interim)**

```bash
bun --filter='@archon-studio/standalone' run dev
```
Open the dev URL, drag a node near another node's left edge. Guide line should appear at the moment of near-alignment; node should snap.

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/src/components/Canvas.tsx
git commit -m "feat(canvas): wire smart guides + snap precedence in onNodeDrag"
```

---

### Task 8.17: Snap-to-grid checkbox

**Files:**
- Create: `packages/studio-core/src/store/grid-snap-store.ts`
- Modify: `packages/studio-core/src/components/Toolbar.tsx`
- Modify: `packages/studio-core/src/components/Canvas.tsx` (read store; pass `snapToGrid` to `<ReactFlow>`)

- [ ] **Step 1: Implement `grid-snap-store.ts` (parallel to theme-store)**

```ts
import { create } from 'zustand';

const KEY = 'archon-studio:snap-grid';

interface GridSnapState {
  enabled: boolean;
  toggle: () => void;
  hydrate: () => void;
}

export const useGridSnapStore = create<GridSnapState>((set, get) => ({
  enabled: false,
  toggle: () => {
    const next = !get().enabled;
    try { localStorage.setItem(KEY, String(next)); } catch {}
    set({ enabled: next });
  },
  hydrate: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === 'true') set({ enabled: true });
    } catch {}
  },
}));
```

- [ ] **Step 2: Toolbar checkbox**

```tsx
const enabled = useGridSnapStore((s) => s.enabled);
const toggle = useGridSnapStore((s) => s.toggle);
<label className={styles.gridToggle}>
  <input type="checkbox" checked={enabled} onChange={toggle} />
  <span>Snap to grid</span>
</label>
```

- [ ] **Step 3: Canvas reads store**

```tsx
const snapEnabled = useGridSnapStore((s) => s.enabled);
<ReactFlow snapToGrid={snapEnabled} snapGrid={[16, 16]} ... />
```

- [ ] **Step 4: Shortcut `mod+'`**

```ts
useHotkeys(SHORTCUTS.toggleGridSnap, () => useGridSnapStore.getState().toggle());
```

- [ ] **Step 5: Hydrate on standalone boot** (`apps/standalone/src/App.tsx`):

```ts
useGridSnapStore.getState().hydrate();
```

- [ ] **Step 6: Quick store unit test**

```ts
it('toggle persists to localStorage', () => {
  useGridSnapStore.getState().toggle();
  expect(localStorage.getItem('archon-studio:snap-grid')).toBe('true');
});
```

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/store/grid-snap-store.ts \
        packages/studio-core/src/components/Toolbar.tsx \
        packages/studio-core/src/components/Canvas.tsx \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        apps/standalone/src/App.tsx \
        packages/studio-core/tests/store/grid-snap-store.spec.ts
git commit -m "feat(canvas): snap-to-grid checkbox + hotkey + localStorage"
```

---

## Chunk 6: Variant conversion UI

### Task 8.18: `<VariantPicker>` dropdown + confirm modal

**Files:**
- Create: `packages/studio-core/src/components/inspector/general/VariantPicker.tsx`
- Create: `packages/studio-core/src/components/inspector/general/VariantPicker.module.css`
- Create: `packages/studio-core/src/components/inspector/general/VariantConvertConfirmModal.tsx`
- Modify: existing General tab component to slot `<VariantPicker>` below the ID input
- Test: `packages/studio-core/tests/components/inspector/VariantPicker.spec.tsx`

- [ ] **Step 1: Find current General tab**

```bash
grep -rn "InspectorGeneral\|General tab\|defaultRegistry" packages/studio-core/src/components/inspector --include='*.tsx' | head -20
```

Record the path. Likely `packages/studio-core/src/components/inspector/general/InspectorGeneral.tsx`.

- [ ] **Step 2: Write failing test**

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { VariantPicker } from '../../../src/components/inspector/general/VariantPicker';
import { useBuilderStore } from '../../../src/store/builder-store';

describe('<VariantPicker>', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      nodes: [{ id: 'a', variant: 'bash', data: {}, base: {}, unknown: {} } as any],
      selectedNodeIds: ['a'],
      primarySelectionId: 'a',
    });
  });
  afterEach(() => cleanup());

  it('renders the current variant as the trigger label', () => {
    const { getByText } = render(<VariantPicker />);
    expect(getByText(/bash/i)).toBeTruthy();
  });

  it('selecting a different variant opens a confirm modal', () => {
    const { getByText, getByRole } = render(<VariantPicker />);
    fireEvent.click(getByText(/bash/i));      // open dropdown
    fireEvent.click(getByText(/agent/i));     // select agent
    expect(getByRole('dialog')).toBeTruthy();
  });

  it('canceling the modal is a no-op (variant unchanged)', () => {
    const { getByText, getByRole } = render(<VariantPicker />);
    fireEvent.click(getByText(/bash/i));
    fireEvent.click(getByText(/agent/i));
    fireEvent.click(getByText(/cancel/i));
    expect(useBuilderStore.getState().nodes[0].variant).toBe('bash');
  });

  it('confirming calls convertVariant', () => {
    const { getByText } = render(<VariantPicker />);
    fireEvent.click(getByText(/bash/i));
    fireEvent.click(getByText(/agent/i));
    fireEvent.click(getByText(/convert/i));
    expect(useBuilderStore.getState().nodes[0].variant).toBe('agent');
  });
});
```

- [ ] **Step 3: Implement `VariantPicker`**

```tsx
import { useState } from 'react';
import { defaultRegistry } from '../../../nodes/default-registry';
import type { VariantId } from '../../../nodes/registry';
import { useBuilderStore } from '../../../store/builder-store';
import { VariantConvertConfirmModal } from './VariantConvertConfirmModal';

export function VariantPicker() {
  const primaryId = useBuilderStore((s) => s.primarySelectionId);
  const node = useBuilderStore((s) => s.nodes.find((n) => n.id === primaryId));
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<VariantId | null>(null);

  if (!node) return null;
  const variants = Object.keys(defaultRegistry) as VariantId[];

  return (
    <div>
      <label>Variant</label>
      <select
        value={node.variant}
        onChange={(e) => {
          const v = e.target.value as VariantId;
          if (v !== node.variant) {
            setTarget(v);
            setOpen(true);
          }
        }}
      >
        {variants.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      {open && target && (
        <VariantConvertConfirmModal
          nodeId={node.id}
          fromVariant={node.variant}
          toVariant={target}
          onCancel={() => { setOpen(false); setTarget(null); }}
          onConfirm={() => {
            useBuilderStore.getState().convertVariant(node.id, target);
            setOpen(false);
            setTarget(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement modal**

```tsx
export function VariantConvertConfirmModal(props: {
  nodeId: string;
  fromVariant: string;
  toVariant: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className={styles.modal}>
      <h3>Convert variant</h3>
      <p>
        Convert <strong>{props.nodeId}</strong> from <strong>{props.fromVariant}</strong> to{' '}
        <strong>{props.toVariant}</strong>? Variant-specific fields will be migrated; unrecognized fields
        preserved in <code>_unknown</code>. This can be undone with Cmd-Z.
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={props.onCancel}>Cancel</button>
        <button type="button" onClick={props.onConfirm} autoFocus>Convert</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Slot into General tab**

Insert `<VariantPicker />` after the ID input in the General tab component.

- [ ] **Step 6: Run — expect 4 new pass**

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/components/inspector/general/VariantPicker* \
        packages/studio-core/src/components/inspector/general/VariantConvertConfirmModal* \
        packages/studio-core/tests/components/inspector/VariantPicker.spec.tsx
git commit -m "feat(inspector): variant picker dropdown + confirm modal"
```

---

## Chunk 7: Manual smoke, drift, tag

### Task 8.19: Toolbar undo/redo buttons + label tooltips

**Files:**
- Modify: `packages/studio-core/src/components/Toolbar.tsx`
- Test: `packages/studio-core/tests/components/Toolbar.undo.spec.tsx`

- [ ] **Step 1: Write failing test for tooltip**

```tsx
it('undo button tooltip surfaces the next-undo label', () => {
  useUndoStore.setState({
    past: [{ label: 'Align left', nodes: [], workflow: null, positions: {}, ts: 0 }],
    future: [],
  });
  const { getByLabelText } = render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
  expect(getByLabelText('Undo: Align left')).toBeTruthy();
});

it('undo button disabled when stack empty', () => {
  useUndoStore.setState({ past: [], future: [] });
  const { getByLabelText } = render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
  expect(getByLabelText('Undo').hasAttribute('disabled')).toBe(true);
});
```

- [ ] **Step 2: Implement**

```tsx
const undoLabel = useUndoStore((s) => s.nextUndoLabel());
const redoLabel = useUndoStore((s) => s.nextRedoLabel());

<button
  type="button"
  aria-label={undoLabel ? `Undo: ${undoLabel}` : 'Undo'}
  disabled={!undoLabel}
  onClick={applyUndo}
>↶</button>
<button
  type="button"
  aria-label={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}
  disabled={!redoLabel}
  onClick={applyRedo}
>↷</button>
```

- [ ] **Step 3: Run — expect 2 new pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(toolbar): undo/redo buttons with label tooltips"
```

---

### Task 8.20: Integration tests — full round-trips

**Files:**
- Create: `packages/studio-core/tests/integration/phase-8.spec.ts`

Six end-to-end store-level tests covering full workflows:

- [ ] **Step 1: copy → paste → undo → redo preserves identity**

```ts
it('copy → paste → undo → redo round-trip', () => {
  // setup with 2 nodes
  // copy
  // paste from text
  // assert 4 nodes
  // undo → 2 nodes
  // redo → 4 nodes
});
```

- [ ] **Step 2: multi-select shift-click sequence**
- [ ] **Step 3: auto-arrange bounding-box anchor**
- [ ] **Step 4: loadWorkflow clears undo stack**
- [ ] **Step 5: convertVariant undo/redo**
- [ ] **Step 6: align → undo restores positions**

- [ ] **Step 7: Run all tests — expect ~520+ pass**

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/tests/integration/phase-8.spec.ts
git commit -m "test(phase-8): integration round-trips"
```

---

### Task 8.21: Manual smoke gate

**Files:** None — interactive verification.

**This task is non-negotiable per Phase 7 meta-lesson.** JSDOM tests don't paint, don't measure layout, don't run a real keystroke loop.

- [ ] **Step 1: Start dev server**

```bash
bun --filter='@archon-studio/standalone' run dev
```

- [ ] **Step 2: Run all 11 smoke steps from the spec**

For each step, record pass/fail + a screenshot or note in `docs/superpowers/plans/phase-8-drift-notes.md`:

1. Drag a node — alignment guides appear when near another node's edge/center.
2. Shift-click two nodes — both highlighted; inspector shows empty/multi state.
3. Marquee-drag across three nodes — all selected.
4. `mod+c` then `mod+v` — three new nodes offset (40, 40); inter-deps preserved.
5. Paste in a fresh tab (same origin) — nodes appear.
6. Align-left button — selected nodes left-align.
7. Auto-arrange selection — selected subgraph rearranges; others untouched.
8. `mod+z` repeatedly — replays in reverse.
9. Toggle snap-to-grid — drag snaps to 16px grid.
10. Switch theme — `light` and `high-contrast` apply; reload preserves choice.
11. Variant picker on a `bash` node → convert to `agent` → confirm — node morphs; `mod+z` restores.

- [ ] **Step 3: Fix any smoke regressions**

For each failure, write a follow-up commit. Catalog the *kind* of bug (CSS missing, focus problem, store-leak across tabs, etc.) in drift notes.

---

### Task 8.22: Drift notes + tag

**Files:**
- Create: `docs/superpowers/plans/phase-8-drift-notes.md`

- [ ] **Step 1: Write drift notes**

Mirror the structure of `phase-7-drift-notes.md`. Sections:
- Header: phase summary, test delta, bundle delta, package changes.
- Per-drift entry: title, what the plan said, what reality required, why, follow-up.
- "How to apply" section feeding Phase 9.

- [ ] **Step 2: Final verification gates**

```bash
bun --filter='*' run build 2>&1 | tail -10
bun --filter='*' run test 2>&1 | tail -10
bun --filter='*' run lint 2>&1 | tail -10
bun --filter='*' run format:check 2>&1 | tail -10
bun --filter='@archon-studio/core' run typecheck 2>&1 | tail -10
```

All must be green. Expected test count: ~530.

- [ ] **Step 3: Tag locally; push pending user (per established practice)**

```bash
git tag -a phase-8 -m "Phase 8 — Editor polish: undo, multi-select, copy/paste, alignment, theme, variants"
git tag --list phase-8 -n5
# Do NOT push the tag — user manages remote pushes for tag + branch per Phases 6/7 practice.
```

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/phase-8-drift-notes.md
git commit -m "docs(phase-8): drift notes + smoke results"
```

---

## Closing notes

**Branch handoff:** Phase 8 ships on `phase-8` cut from `phase-7` tip. Tag is local; the user pushes both branch and tag manually (matches Phase 6/7 cadence).

**Memory write:** after the verify task, update `C:\Users\seanr\.claude\projects\E--Projects-Archon-Workflow-Studio\memory\MEMORY.md` and the linked `phase-8-complete.md` summarizing the final state.

**Phase 9 setup:** Phase 9 (connected mode) builds on the selection model and undo middleware. The `WorkflowApiClient.saveWorkflow` integration point now has clear undo semantics — the design's `baselineYaml` exclusion means "save" can stamp a new baseline without disturbing the undo stack.
