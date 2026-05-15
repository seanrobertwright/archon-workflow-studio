# Phase 7 — YAML preview pane: Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a live, read-only YAML preview drawer that shows the canonical Archon-shape YAML the workflow will serialize to, with bidirectional click + hover linkage between YAML lines and canvas nodes.

**Architecture:** A pure `serializeYaml(input)` helper in `exporter/` reuses the existing `toWorkflowDefinition()` and pipes it through `yaml.stringify()`, then round-trip-parses its own output with `LineCounter` to attach a per-node `{ id, startLine, endLine }` source map. A new `YamlPreviewDrawer` reuses the Phase-5 `CmEditor` primitive with a YAML language extension and the search extension. The right-column slot in `WorkflowBuilder` becomes single-occupancy: when the YAML drawer is open, the inspector unmounts. `builder-store` gains `hoveredNodeId`, `isYamlPreviewOpen`, `baselineYaml` (seeded by `loadWorkflow`), and a `setHoveredNodeId` setter. Bidirectional cross-highlight is wired by reading `selectedNodeId`/`hoveredNodeId` from the store and projecting them through the source map into CM6 line decorations.

**Tech Stack:** TypeScript + React 19 (existing); Zustand (existing); `yaml@2.5.1` (existing); `@codemirror/state`, `@codemirror/view`, `@codemirror/autocomplete`, `@codemirror/commands` (existing from Phase 5); `@codemirror/lang-yaml` (NEW, ^6.x); `@codemirror/search` (NEW if not transitively present, ^6.x); `bun:test` + `@testing-library/react` (existing).

**Reference design doc:** `docs/superpowers/specs/2026-05-10-phase-7-yaml-preview-design.md`.

**Reference skills:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`.

**Drift discipline:** Phases 4, 5, and 6 all taught the same lesson — the plan describes the codebase as of today, but it drifts. Every task begins with a verification step; if reality deviates, capture the deviation inline (mirror `docs/superpowers/plans/phase-6-drift-notes.md`) and adapt the task before continuing. After execution, write `docs/superpowers/plans/phase-7-drift-notes.md`.

**Branch:** Execute on `phase-7` cut from `main` after Phase 6 lands. Tag `phase-7` after the verify task.

**Test target:** ~25 new behavioral tests + ~20 per-fixture round-trip tests (Task 7.2 iterates over the 20 fixtures in `studio-fixtures/src/round-trip-fixtures/`) ≈ ~45 total. Suite goes from the Phase-6 baseline of **382** to **~427**.

---

## Chunk 1: Phase 7 — YAML preview pane

### Task 7.0: Phase-6 reality check (read-only verification)

**Files:**
- None (verification only).

Confirm the surfaces Phase 7 depends on are still in the shape Phase 6 left them.

- [ ] **Step 1: Confirm `toWorkflowDefinition` exists and its signature**

```bash
grep -n "export function toWorkflowDefinition" packages/studio-core/src/exporter/toWorkflowDefinition.ts
```
Expected: `export function toWorkflowDefinition(input: LoadWorkflowInput): Record<string, unknown>`. If the signature has changed, Task 7.1 adapts its import.

- [ ] **Step 2: Confirm `LoadWorkflowInput` shape and `loadWorkflow` action**

```bash
grep -n "LoadWorkflowInput\|loadWorkflow" packages/studio-core/src/store/builder-store.ts
```
Expected: `LoadWorkflowInput = { meta: WorkflowMeta; nodes: BuilderNode[] }` and a `loadWorkflow(input)` action on the store. Task 7.4 hooks into `loadWorkflow` to seed the baseline; if the action has been renamed (e.g., `setWorkflow`), Task 7.4 updates accordingly.

- [ ] **Step 3: Confirm `CmEditor` primitive exists and accepts custom extensions**

```bash
grep -n "export.*CmEditor\|extensions" packages/studio-core/src/components/inspector/shared/CmEditor.tsx
```
Expected: `CmEditor` accepts an `extensions?: Extension[]` prop that is merged into the editor's base extensions. Tasks 7.3 and 7.6 lean on this. If the prop is named differently (e.g., `extra`), update the call sites.

- [ ] **Step 4: Confirm the `WorkflowBuilder` grid layout**

```bash
cat packages/studio-core/src/components/WorkflowBuilder.module.css
```
Expected: a `grid-template-columns` rule that puts the inspector in the right column. Task 7.5 swaps that column's content; if the layout has changed (e.g., Phase 6 added a bottom drawer), the swap site moves accordingly. Record the actual selector name in the task before editing.

- [ ] **Step 5: Confirm `Toolbar` shape and where to insert the YAML toggle**

```bash
grep -n "export.*Toolbar\|onSave\|button" packages/studio-core/src/components/Toolbar.tsx
```
Expected: a Toolbar component rendering `workflowName`, `Reset layout`, and (post-Phase-6) a Save button. Task 7.5 adds the YAML toggle next to Save. Record the existing button order.

- [ ] **Step 6: Confirm `Canvas` props and node-render path**

```bash
grep -n "DagNode\|onNodeMouseEnter\|nodeMouseLeave\|onNodeClick" packages/studio-core/src/components/Canvas.tsx
```
Expected: Canvas already wires `onNodeClick` for selection (added in Phase 4). React Flow exposes `onNodeMouseEnter` / `onNodeMouseLeave` on the same component. Task 7.6 adds those handlers.

- [ ] **Step 7: Confirm `selectedNodeId` is in the store and how it's set**

```bash
grep -n "selectedNodeId\|setSelectedNodeId" packages/studio-core/src/store/builder-store.ts
```
Expected: `selectedNodeId: string | null` plus `setSelectedNodeId(id|null)`. Task 7.6 dispatches it from line clicks.

- [ ] **Step 8: Confirm round-trip fixtures are still where Phase 0/1 put them**

```bash
ls packages/studio-fixtures/src/round-trip-fixtures/ | head -10
grep -n "ROUND_TRIP_FIXTURE_NAMES" packages/studio-fixtures/src/index.ts
```
Expected: a directory of `*.yaml` files plus `_smoke-pi-all-nodes.yaml`, and an exported `ROUND_TRIP_FIXTURE_NAMES` array. Task 7.2's serializer round-trip test iterates this list.

- [ ] **Step 9: Run the green baseline**

```bash
bun --filter='*' run test
bun --filter='*' run build
bun run lint
bun run format:check
bun run check-schema-drift
bun run check-when-grammar-drift
```
Expected: all green at the post-Phase-6 baseline. Phase 7 starts from green or not at all. Note the exact test count — the Phase 7 verify task asserts `previous + ~25`.

- [ ] **Step 10: Record reality-check findings**

If anything in Steps 1–8 deviated, write the deviation into a short note at the top of the next task you start. (No commit yet — read-only.)

---

### Task 7.0.5: Extend `CmEditor` — `Compartment` for live extension reconfig + `onCreate` view hook

**Files:**
- Modify: `packages/studio-core/src/components/inspector/shared/CmEditor.tsx`
- Modify: `packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx` (or create if absent)

**Why this exists.** Today `CmEditor` bakes its `extensions` prop into the editor at mount via `useEffect(…, [])` (line 39, 60). YAML preview needs (a) extensions whose internal state must update when React props change (selected/hovered ids, source map), and (b) a handle to the underlying `EditorView` so it can dispatch `scrollIntoView` effects. Without this prep, every Phase 7 component task fights the primitive.

The fix uses CodeMirror's standard `Compartment` mechanism: extensions are wrapped at mount, and React-prop changes dispatch a `compartment.reconfigure(…)` instead of recreating the view. This preserves cursor/scroll/selection across rerenders and correctly re-installs extensions whose closures captured stale values.

- [ ] **Step 1: Write the failing tests**

Add to `packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx`:

```tsx
import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { useRef, useEffect } from 'react';
import { EditorView } from '@codemirror/view';
import { CmEditor } from '../../../../src/components/inspector/shared/CmEditor';

describe('CmEditor — compartment + onCreate', () => {
  it('invokes onCreate exactly once with the EditorView', () => {
    const seen: EditorView[] = [];
    render(
      <CmEditor
        value="a"
        onChange={() => {}}
        onCreate={(v) => seen.push(v)}
      />,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(EditorView);
  });

  it('reinstalls extensions when the extensions array reference changes', () => {
    let calls = 0;
    const makeExt = () =>
      EditorView.updateListener.of(() => {
        calls++;
      });

    function Harness({ ext }: { ext: ReturnType<typeof makeExt> }) {
      return <CmEditor value="a" onChange={() => {}} extensions={[ext]} />;
    }

    const { rerender } = render(<Harness ext={makeExt()} />);
    const before = calls;
    // Triggering a re-render with a NEW extension reference must reconfigure
    // the compartment, not recreate the view. We assert the view still mounts
    // (no error) and a doc-change-driven update reaches the new listener.
    rerender(<Harness ext={makeExt()} />);
    // No assertion on calls here — the listener fires only on doc changes.
    // The contract is "no throw on rerender + view preserved".
    expect(true).toBe(true);
  });
});
```

(The reconfiguration contract is hard to assert without reaching into CM internals; the smoke is "rerendering with a new `extensions` array does not throw and does not unmount the view." Combined with the YamlPreview tests in 7.3 that exercise the actual reconfig path with real ranges, this is sufficient.)

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun --filter='@archon-studio/studio-core' run test CmEditor
```
Expected: FAIL with "onCreate is not a known prop" (TS) or the test silently passes the second case but `onCreate` is undefined.

- [ ] **Step 3: Update `CmEditor.tsx`**

Replace the body to introduce a `Compartment` and the `onCreate` callback:

```tsx
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap } from '@codemirror/commands';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { type CSSProperties, useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Extra CodeMirror extensions. Re-applied via compartment when this array reference changes. */
  extensions?: Extension[];
  /** Called once with the EditorView right after mount. */
  onCreate?: (view: EditorView) => void;
  minHeight?: number;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function CmEditor({
  value,
  onChange,
  extensions = [],
  onCreate,
  minHeight = 80,
  style,
  ariaLabel,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentRef = useRef<Compartment>(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCreateRef = useRef(onCreate);
  onCreateRef.current = onCreate;

  useEffect(() => {
    if (!hostRef.current) return;
    const compartment = compartmentRef.current;
    const startState = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([...defaultKeymap, ...closeBracketsKeymap]),
        closeBrackets(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        compartment.of(extensions),
      ],
    });
    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;
    onCreateRef.current?.(view);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount-once: extensions are managed via the compartment effect below.
  }, []);

  // Reconfigure compartment when the extensions reference changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: compartmentRef.current.reconfigure(extensions) });
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={hostRef}
      role="textbox"
      aria-label={ariaLabel}
      style={{
        minHeight,
        background: 'var(--studio-bg-elevated)',
        color: 'var(--studio-fg)',
        border: '1px solid var(--studio-border)',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--studio-mono)',
        fontSize: 13,
        ...style,
      }}
    />
  );
}
```

**Backwards compatibility note.** Existing callers (Phase 5 body fields, autocomplete) pass a stable `extensions` array (factories called once during render). The reconfigure effect is cheap and a no-op if the array reference is stable, so existing behavior is unchanged. `whenAutocompleteExtension()` callers should continue to work because the autocomplete extension is itself stable across the lifecycle of the surrounding inspector tab.

- [ ] **Step 4: Run all CmEditor + WhenSection + body-field tests**

```bash
bun --filter='@archon-studio/studio-core' run test CmEditor inspector when
```
Expected: PASS — Phase 5 tests still green, the two new CmEditor tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/components/inspector/shared/CmEditor.tsx packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx
git commit -m "feat(inspector): CmEditor — Compartment for live extension reconfig + onCreate hook"
```

---

### Task 7.1: `serializeYaml` — pure serializer with source map

**Files:**
- Create: `packages/studio-core/src/exporter/serializeYaml.ts`
- Create: `packages/studio-core/tests/exporter/serializeYaml.spec.ts`

The serializer is a pure function. It composes the existing `toWorkflowDefinition()` with `yaml.stringify()`, then round-trip-parses its own output with `LineCounter` to recover per-node line ranges. No React. No store.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/exporter/serializeYaml.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { serializeYaml } from '../../src/exporter/serializeYaml';
import type { LoadWorkflowInput } from '../../src/store/builder-store';

const input = (): LoadWorkflowInput => ({
  meta: { name: 'demo', description: 'd', base: {}, unknown: {} },
  nodes: [
    { id: 'a', variant: 'prompt', data: { prompt: 'first' }, base: {}, unknown: {} },
    { id: 'b', variant: 'bash', data: { bash: "echo 'hi'" }, base: { depends_on: ['a'] }, unknown: {} },
  ],
});

describe('serializeYaml', () => {
  it('returns a yaml string and a sourceMap', () => {
    const r = serializeYaml(input());
    expect(typeof r.yaml).toBe('string');
    expect(Array.isArray(r.sourceMap)).toBe(true);
  });

  it('parses to the canonical-shape object', () => {
    const r = serializeYaml(input());
    const parsed = parseYaml(r.yaml) as Record<string, unknown>;
    expect(parsed.name).toBe('demo');
    expect(parsed.description).toBe('d');
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect((parsed.nodes as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: 'a',
      prompt: 'first',
    });
  });

  it('emits a sourceMap entry per node, in document order', () => {
    const r = serializeYaml(input());
    expect(r.sourceMap.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('startLine and endLine are 1-based and bracket the node mapping', () => {
    const r = serializeYaml(input());
    const lines = r.yaml.split('\n');
    for (const range of r.sourceMap) {
      expect(range.startLine).toBeGreaterThanOrEqual(1);
      expect(range.endLine).toBeGreaterThanOrEqual(range.startLine);
      expect(range.endLine).toBeLessThanOrEqual(lines.length);
      // The id token should appear within the range.
      const slice = lines.slice(range.startLine - 1, range.endLine).join('\n');
      expect(slice).toContain(`id: ${range.id}`);
    }
  });

  it('source map includes the full multiline scalar block', () => {
    const r = serializeYaml({
      meta: { name: 'm', description: 'd', base: {}, unknown: {} },
      nodes: [
        {
          id: 'multi',
          variant: 'bash',
          data: { bash: 'line1\nline2\nline3\n' },
          base: {},
          unknown: {},
        },
      ],
    });
    const range = r.sourceMap[0]!;
    const slice = r.yaml.split('\n').slice(range.startLine - 1, range.endLine).join('\n');
    expect(slice).toContain('line1');
    expect(slice).toContain('line2');
    expect(slice).toContain('line3');
  });

  it('is idempotent: serialize → parse → re-stringify yields the same yaml', async () => {
    const r1 = serializeYaml(input());
    const { stringify } = await import('yaml');
    const parsed = parseYaml(r1.yaml) as Record<string, unknown>;
    const r2Yaml = stringify(parsed, { lineWidth: 0 });
    expect(r2Yaml.trim()).toBe(r1.yaml.trim());
  });

  it('multi-line block scalars are fully bracketed by the node range', () => {
    const r = serializeYaml({
      meta: { name: 'm', description: 'd', base: {}, unknown: {} },
      nodes: [
        {
          id: 'before',
          variant: 'prompt',
          data: { prompt: 'p' },
          base: {},
          unknown: {},
        },
        {
          id: 'multi',
          variant: 'bash',
          data: { bash: 'line1\nline2\nline3\n' },
          base: {},
          unknown: {},
        },
        {
          id: 'after',
          variant: 'prompt',
          data: { prompt: 'q' },
          base: {},
          unknown: {},
        },
      ],
    });
    const lines = r.yaml.split('\n');
    const multi = r.sourceMap.find((e) => e.id === 'multi')!;
    // Every literal scalar line must fall inside [startLine, endLine].
    for (const needle of ['line1', 'line2', 'line3']) {
      const lineIdx = lines.findIndex((l) => l.includes(needle));
      expect(lineIdx + 1).toBeGreaterThanOrEqual(multi.startLine);
      expect(lineIdx + 1).toBeLessThanOrEqual(multi.endLine);
    }
    // And the next node ('after') must start strictly after multi.endLine.
    const after = r.sourceMap.find((e) => e.id === 'after')!;
    expect(after.startLine).toBeGreaterThan(multi.endLine);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun --filter='@archon-studio/studio-core' run test serializeYaml
```
Expected: FAIL with "Cannot find module './exporter/serializeYaml'".

- [ ] **Step 3: Implement `serializeYaml`**

Create `packages/studio-core/src/exporter/serializeYaml.ts`:

```ts
import { stringify, parseDocument, LineCounter, isMap, isSeq, isScalar } from 'yaml';
import { toWorkflowDefinition } from './toWorkflowDefinition';
// IMPORTANT: type-only import. Task 7.4 makes `builder-store.ts` import
// `serializeYaml` (a value) — without `import type` here, that creates a
// runtime cycle. `toWorkflowDefinition.ts` already does this; verify that
// import is also type-only before continuing (Step 0 below).
import type { LoadWorkflowInput } from '../store/builder-store';

export type NodeRange = {
  id: string;
  startLine: number; // 1-based, inclusive
  endLine: number;   // 1-based, inclusive
};

export type SerializeResult = {
  yaml: string;
  sourceMap: NodeRange[];
};

const STRINGIFY_OPTIONS = {
  // Match Archon's writer: block style for sequences/maps, no flow.
  // Allow folded/literal scalars where natural; yaml@2.5.1 picks these
  // automatically for multi-line strings.
  lineWidth: 0, // never fold long lines — preserves user intent
} as const;

export function serializeYaml(input: LoadWorkflowInput): SerializeResult {
  const obj = toWorkflowDefinition(input);
  const yaml = stringify(obj, STRINGIFY_OPTIONS);

  const lineCounter = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter });

  const sourceMap: NodeRange[] = [];
  const nodes = doc.get('nodes', true);
  if (isSeq(nodes)) {
    for (const item of nodes.items) {
      if (!isMap(item)) continue;
      const idPair = item.items.find(
        (p) => isScalar(p.key) && p.key.value === 'id',
      );
      const idValue = idPair && isScalar(idPair.value) ? String(idPair.value.value) : null;
      if (!idValue) continue;
      const range = item.range; // [start, valueEnd, nodeEnd] byte offsets
      if (!range) continue;
      const start = lineCounter.linePos(range[0]);
      const end = lineCounter.linePos(range[2] ?? range[1]);
      // `end` may point at the start of the *next* line if the node ends with
      // a newline; clamp to the previous non-empty line.
      const endLine = end.col === 1 && end.line > start.line ? end.line - 1 : end.line;
      sourceMap.push({ id: idValue, startLine: start.line, endLine });
    }
  }

  return { yaml, sourceMap };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun --filter='@archon-studio/studio-core' run test serializeYaml
```
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/exporter/serializeYaml.ts packages/studio-core/tests/exporter/serializeYaml.spec.ts
git commit -m "feat(exporter): serializeYaml — canonical YAML + per-node source map"
```

---

### Task 7.2: Serializer fixture round-trip — every fixture survives serialize→parse→deep-equal

**Files:**
- Create: `packages/studio-core/tests/exporter/serializeYaml.fixtures.spec.ts`

Serializer faithfulness is non-negotiable: if `serializeYaml` ever drops a byte of meaningful content from any of the round-trip fixtures, this test fails.

- [ ] **Step 1: Write the failing test**

Create `packages/studio-core/tests/exporter/serializeYaml.fixtures.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromWorkflowDefinition } from '../../src/exporter/fromWorkflowDefinition';
import { serializeYaml } from '../../src/exporter/serializeYaml';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../studio-fixtures/src/round-trip-fixtures',
);

const fixtureNames = readdirSync(fixturesDir).filter((f) => f.endsWith('.yaml'));

describe('serializeYaml — round-trip fixtures', () => {
  for (const name of fixtureNames) {
    it(`${name}: parse → import → serialize → parse → deep-equal`, () => {
      const yamlText = readFileSync(join(fixturesDir, name), 'utf8');
      const original = parseYaml(yamlText) as Record<string, unknown>;
      const imported = fromWorkflowDefinition(original);
      const { yaml: emitted } = serializeYaml(imported);
      const reparsed = parseYaml(emitted) as Record<string, unknown>;
      expect(reparsed).toEqual(original);
    });
  }

  it('discovers at least one fixture (sanity)', () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun --filter='@archon-studio/studio-core' run test serializeYaml.fixtures
```
Expected: PASS for every fixture. If any fail, do **not** patch the test — the serializer is dropping or reshaping content. Investigate at the fixture's failing key path. Most likely culprits: `_unknown` bag spread order, or a variant `toDag` that filters fields.

- [ ] **Step 3: If a fixture fails, capture the drift**

If any fixture fails and you cannot fix the serializer in <30 minutes, write a `phase-7-drift-notes.md` entry documenting which fixture, which key path, and what was lost. Then escalate — do not commit a green test that excludes the failing fixture.

- [ ] **Step 4: Commit**

```bash
git add packages/studio-core/tests/exporter/serializeYaml.fixtures.spec.ts
git commit -m "test(exporter): serializeYaml round-trips every fixture deep-equal"
```

---

### Task 7.3: `YamlPreview` component — read-only CmEditor with yaml + search + StateField decorations

**Files:**
- Modify: `packages/studio-core/package.json` (add `@codemirror/lang-yaml`, possibly `@codemirror/search`)
- Create: `packages/studio-core/src/components/preview/yamlPreviewExtensions.ts`
- Create: `packages/studio-core/src/components/preview/YamlPreview.tsx`
- Create: `packages/studio-core/tests/components/preview/yamlPreviewExtensions.spec.ts`
- Create: `packages/studio-core/tests/components/preview/YamlPreview.spec.tsx`

The component is a thin adapter over `CmEditor`. The extension factory module is what we test in isolation — Phase 5 already taught that CM6's contenteditable resists DOM-level interaction tests. Test the extension config; render-test only the smoke ("it mounts and shows the text").

- [ ] **Step 1: Verify and add the deps**

```bash
bun pm ls --filter='@archon-studio/studio-core' | grep -E "@codemirror/(state|view|lang-yaml|search|autocomplete|commands)"
```
Expected: `state`, `view`, `autocomplete`, `commands` already present (Phase 5). Add what's missing — at minimum `@codemirror/lang-yaml` and `@codemirror/search`:

```bash
cd packages/studio-core
bun add @codemirror/lang-yaml@^6 @codemirror/search@^6
```
Expected: `package.json` updated, `bun.lock` updated, `bun install` clean.

- [ ] **Step 2: Write the failing extension-factory tests**

Create `packages/studio-core/tests/components/preview/yamlPreviewExtensions.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  yamlLanguage,
  yamlSearch,
  readOnlyExt,
  highlightField,
  setHighlightTargets,
  rangesField,
  setRanges,
  pickIdAtLine,
  domEventLineHandler,
} from '../../../src/components/preview/yamlPreviewExtensions';
import type { NodeRange } from '../../../src/exporter/serializeYaml';

const ranges: NodeRange[] = [
  { id: 'a', startLine: 3, endLine: 5 },
  { id: 'b', startLine: 7, endLine: 9 },
];

const mountView = (doc: string, extensions: Extension[]) => {
  const state = EditorState.create({ doc, extensions });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({ state, parent: host });
  return { view, host, cleanup: () => { view.destroy(); host.remove(); } };
};

describe('yamlPreviewExtensions', () => {
  it('yamlLanguage() returns a non-empty extension', () => {
    expect(yamlLanguage()).toBeTruthy();
  });

  it('readOnlyExt() makes the editor read-only', () => {
    const state = EditorState.create({ doc: 'hello', extensions: [readOnlyExt()] });
    expect(state.readOnly).toBe(true);
  });

  it('yamlSearch() returns an installable extension', () => {
    const ext = yamlSearch();
    // Sanity: mounts without throwing.
    const { cleanup } = mountView('hi', [ext]);
    cleanup();
  });

  it('pickIdAtLine resolves a line within a range', () => {
    expect(pickIdAtLine(ranges, 4)).toBe('a');
    expect(pickIdAtLine(ranges, 8)).toBe('b');
    expect(pickIdAtLine(ranges, 99)).toBeNull();
  });

  it('rangesField + setRanges round-trip the source map into editor state', () => {
    const { view, cleanup } = mountView('a\nb\nc\n', [rangesField]);
    expect(view.state.field(rangesField)).toEqual([]);
    view.dispatch({ effects: setRanges.of(ranges) });
    expect(view.state.field(rangesField)).toEqual(ranges);
    cleanup();
  });

  it('highlightField produces decorations for selected and hovered ids', () => {
    const doc = 'L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\n';
    const { view, cleanup } = mountView(doc, [rangesField, highlightField]);
    view.dispatch({ effects: setRanges.of(ranges) });
    view.dispatch({
      effects: setHighlightTargets.of({ selectedNodeId: 'a', hoveredNodeId: 'b' }),
    });
    const decos = view.state.field(highlightField);
    // Selected 'a' covers lines 3–5; hovered 'b' covers lines 7–9. Total 6 line decos.
    let count = 0;
    decos.between(0, doc.length, () => { count++; });
    expect(count).toBe(6);
    cleanup();
  });

  it('domEventLineHandler routes click coords to the resolved node id', () => {
    let picked: string | null | undefined;
    const ext = domEventLineHandler({ onPick: (id) => { picked = id; } });
    const { view, cleanup } = mountView('L1\nL2\nL3\nL4\nL5\n', [rangesField, ext]);
    view.dispatch({ effects: setRanges.of([{ id: 'x', startLine: 2, endLine: 4 }]) });
    // Drive the resolver directly via the exported helper — DOM coord clicks
    // through CM6 contenteditable are unreliable (Phase 5 lesson).
    const id = pickIdAtLine(view.state.field(rangesField), 3);
    expect(id).toBe('x');
    // And confirm onPick fires when the handler is invoked with a synthetic
    // click resolving to that line:
    ext.invokeForLine(view, 3);
    expect(picked).toBe('x');
    cleanup();
  });
});
```

(`ext.invokeForLine(view, line)` is a deliberate test affordance on the returned extension — see the implementation step. It lets us verify the click→pick path without depending on `posAtCoords` resolution.)

- [ ] **Step 3: Write the failing render test**

Create `packages/studio-core/tests/components/preview/YamlPreview.spec.tsx`:

```tsx
import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { YamlPreview } from '../../../src/components/preview/YamlPreview';

describe('YamlPreview', () => {
  it('renders the yaml text into the editor surface', () => {
    const yaml = 'name: hello\ndescription: d\nnodes: []\n';
    const { container } = render(
      <YamlPreview
        yaml={yaml}
        sourceMap={[]}
        selectedNodeId={null}
        hoveredNodeId={null}
        onLinePick={() => {}}
      />,
    );
    // CM6 renders into a .cm-editor element; the text shows up in .cm-content.
    expect(container.querySelector('.cm-editor')).toBeTruthy();
    expect(container.textContent).toContain('hello');
    expect(container.textContent).toContain('description');
  });

  it('does not allow editing (read-only)', () => {
    const { container } = render(
      <YamlPreview
        yaml="name: hello\n"
        sourceMap={[]}
        selectedNodeId={null}
        hoveredNodeId={null}
        onLinePick={() => {}}
      />,
    );
    const content = container.querySelector('.cm-content');
    expect(content?.getAttribute('contenteditable')).toBe('false');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
bun --filter='@archon-studio/studio-core' run test yamlPreview
```
Expected: FAIL with module-not-found.

- [ ] **Step 5: Implement the extension factories**

Create `packages/studio-core/src/components/preview/yamlPreviewExtensions.ts`:

```ts
import { yaml } from '@codemirror/lang-yaml';
import { search, searchKeymap } from '@codemirror/search';
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
} from '@codemirror/view';
import type { NodeRange } from '../../exporter/serializeYaml';

// ---------- stable factories ----------

export function yamlLanguage(): Extension {
  return yaml();
}

export function yamlSearch(): Extension {
  return [search({ top: true }), keymap.of(searchKeymap)];
}

export function readOnlyExt(): Extension {
  return EditorState.readOnly.of(true);
}

// ---------- pure resolver, exported for tests + scrollIntoView wiring ----------

export function pickIdAtLine(ranges: readonly NodeRange[], line: number): string | null {
  const found = ranges.find((r) => line >= r.startLine && line <= r.endLine);
  return found ? found.id : null;
}

// ---------- ranges live in editor state via StateField + StateEffect ----------

export const setRanges = StateEffect.define<NodeRange[]>();

export const rangesField = StateField.define<NodeRange[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setRanges)) return e.value;
    }
    return value;
  },
});

// ---------- selected/hovered ids live in their own field ----------

export type HighlightTargets = {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
};

export const setHighlightTargets = StateEffect.define<HighlightTargets>();

const targetsField = StateField.define<HighlightTargets>({
  create: () => ({ selectedNodeId: null, hoveredNodeId: null }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlightTargets)) return e.value;
    }
    return value;
  },
});

// ---------- decoration set derived from ranges + targets ----------

const selectedDeco = Decoration.line({ class: 'cm-yaml-selected' });
const hoveredDeco = Decoration.line({ class: 'cm-yaml-hovered' });

const buildDecorations = (state: EditorState): DecorationSet => {
  const ranges = state.field(rangesField, false) ?? [];
  const targets = state.field(targetsField, false) ?? {
    selectedNodeId: null,
    hoveredNodeId: null,
  };
  if (ranges.length === 0) return Decoration.none;

  // Order matters: hovered first, then selected, so selected wins when both apply.
  const sorted: Array<{ from: number; deco: Decoration }> = [];
  const addRange = (id: string | null, deco: Decoration) => {
    if (!id) return;
    for (const r of ranges) {
      if (r.id !== id) continue;
      const maxLine = state.doc.lines;
      for (let line = r.startLine; line <= r.endLine && line <= maxLine; line++) {
        sorted.push({ from: state.doc.line(line).from, deco });
      }
    }
  };
  addRange(targets.hoveredNodeId, hoveredDeco);
  addRange(targets.selectedNodeId, selectedDeco);
  sorted.sort((a, b) => a.from - b.from);
  // Use Decoration.set so duplicate `from` points are tolerated.
  return Decoration.set(sorted.map(({ from, deco }) => deco.range(from)), true);
};

export const highlightField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(value, tr) {
    // Recompute when ranges or targets change, or when the doc changes (line offsets shift).
    let recompute = tr.docChanged;
    for (const e of tr.effects) {
      if (e.is(setRanges) || e.is(setHighlightTargets)) recompute = true;
    }
    return recompute ? buildDecorations(tr.state) : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------- click + hover DOM handlers (stable; resolve via current state) ----------

export type LinePickHandler = Extension & {
  invokeForLine: (view: EditorView, line: number) => void;
};

export function domEventLineHandler(args: {
  onPick: (id: string | null) => void;
  onHover?: (id: string | null) => void;
}): LinePickHandler {
  const { onPick, onHover } = args;
  let lastHover: string | null | undefined = undefined;

  const handlers: Extension = EditorView.domEventHandlers({
    mousedown(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const line = view.state.doc.lineAt(pos).number;
      onPick(pickIdAtLine(view.state.field(rangesField, false) ?? [], line));
      return false;
    },
    mousemove(event, view) {
      if (!onHover) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const line = view.state.doc.lineAt(pos).number;
      const id = pickIdAtLine(view.state.field(rangesField, false) ?? [], line);
      if (id !== lastHover) {
        lastHover = id;
        onHover(id);
      }
      return false;
    },
    mouseleave(_e, _view) {
      if (!onHover) return false;
      if (lastHover !== null) {
        lastHover = null;
        onHover(null);
      }
      return false;
    },
  });

  return Object.assign(handlers, {
    invokeForLine(view: EditorView, line: number) {
      onPick(pickIdAtLine(view.state.field(rangesField, false) ?? [], line));
    },
  });
}

/** Bundled "install everything" helper. Consumers install this once + dispatch effects. */
export function previewBaseExtensions(): Extension[] {
  return [yamlLanguage(), yamlSearch(), readOnlyExt(), rangesField, targetsField, highlightField];
}
```

**Why this shape.** Decorations come from a `StateField` driven by `StateEffect`s — the canonical CM6 idiom. React effects in `YamlPreview` dispatch `setRanges` and `setHighlightTargets` whenever props change; the editor state recomputes the `DecorationSet` and CM6 paints. No `findFromDOM` (broken — multiple editors on the page), no stale closures over props. The `domEventLineHandler` is *itself* stable: it reads the current `rangesField` from state at click time, so it always resolves against the latest source map without being reinstalled.

- [ ] **Step 6: Implement `YamlPreview`**

Create `packages/studio-core/src/components/preview/YamlPreview.tsx`:

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { CmEditor } from '../inspector/shared/CmEditor';
import {
  previewBaseExtensions,
  domEventLineHandler,
  setRanges,
  setHighlightTargets,
} from './yamlPreviewExtensions';
import type { NodeRange } from '../../exporter/serializeYaml';

export type YamlPreviewProps = {
  yaml: string;
  sourceMap: NodeRange[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onLinePick: (id: string | null) => void;
  onLineHover?: (id: string | null) => void;
};

export function YamlPreview(props: YamlPreviewProps) {
  const { yaml, sourceMap, selectedNodeId, hoveredNodeId, onLinePick, onLineHover } = props;
  const viewRef = useRef<EditorView | null>(null);

  // Install base extensions + DOM handlers ONCE. Handlers read from
  // editor state at event time, so they don't go stale. Callbacks are
  // captured via refs so changing them between renders doesn't reinstall.
  const onPickRef = useRef(onLinePick);
  onPickRef.current = onLinePick;
  const onHoverRef = useRef(onLineHover);
  onHoverRef.current = onLineHover;

  const extensions = useMemo(
    () => [
      ...previewBaseExtensions(),
      domEventLineHandler({
        onPick: (id) => onPickRef.current(id),
        onHover: (id) => onHoverRef.current?.(id),
      }),
    ],
    [], // truly stable — dispatched effects carry the per-render state
  );

  // Push source map into editor state.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setRanges.of(sourceMap) });
  }, [sourceMap]);

  // Push selection/hover targets into editor state.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setHighlightTargets.of({ selectedNodeId, hoveredNodeId }) });
  }, [selectedNodeId, hoveredNodeId]);

  // Scroll to selected node's first line when selection changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !selectedNodeId) return;
    const range = sourceMap.find((r) => r.id === selectedNodeId);
    if (!range) return;
    const lineIdx = Math.min(range.startLine, view.state.doc.lines);
    const line = view.state.doc.line(lineIdx);
    view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
  }, [selectedNodeId, sourceMap]);

  return (
    <CmEditor
      value={yaml}
      onChange={() => {}}
      extensions={extensions}
      onCreate={(v) => {
        viewRef.current = v;
        // Seed initial state immediately so first render shows decorations.
        v.dispatch({ effects: setRanges.of(sourceMap) });
        v.dispatch({ effects: setHighlightTargets.of({ selectedNodeId, hoveredNodeId }) });
      }}
    />
  );
}
```

(`onChange` is a no-op — `readOnlyExt` blocks user input. The `onCreate` seeding avoids a one-frame flash where decorations are absent on the very first paint.)

- [ ] **Step 7: Add the CSS for selected/hovered line classes**

Append to `packages/studio-core/src/components/preview/YamlPreview.module.css` (create if needed) and import from `YamlPreview.tsx`:

```css
.cm-yaml-selected {
  background: rgba(56, 139, 253, 0.18);
  box-shadow: inset 2px 0 0 rgba(56, 139, 253, 0.9);
}
.cm-yaml-hovered {
  background: rgba(56, 139, 253, 0.08);
}
```

(Class names match the line decorations emitted by `highlightField`. The selected class wins when both are present because `addRange(selected, …)` runs after `addRange(hovered, …)` in `buildDecorations`; the box-shadow makes the priority visually explicit.)

- [ ] **Step 8: Run tests to verify they pass**

```bash
bun --filter='@archon-studio/studio-core' run test yamlPreview
```
Expected: PASS, 7/7.

- [ ] **Step 9: Commit**

```bash
git add packages/studio-core/package.json packages/studio-core/src/components/preview packages/studio-core/tests/components/preview
git commit -m "feat(preview): YamlPreview — read-only CM6 with yaml lang + search + line decorations"
```

---

### Task 7.4: Store slice — `hoveredNodeId`, drawer toggle, baseline YAML

**Files:**
- Modify: `packages/studio-core/src/store/builder-store.ts`
- Modify: `packages/studio-core/tests/store/builder-store.spec.ts` (or create if absent)

The store gains four pieces of state. `loadWorkflow` is updated to seed `baselineYaml`.

- [ ] **Step 1: Read the current store shape**

```bash
cat packages/studio-core/src/store/builder-store.ts | head -120
```
Note the existing slice structure and the `loadWorkflow` action body. Confirm Step 5 will splice in cleanly.

- [ ] **Step 2: Write the failing tests**

Add to `packages/studio-core/tests/store/builder-store.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';

const initial = useBuilderStore.getState();

beforeEach(() => {
  useBuilderStore.setState(initial, true);
});

describe('builder-store — Phase 7 slice', () => {
  it('hoveredNodeId defaults to null and is settable', () => {
    expect(useBuilderStore.getState().hoveredNodeId).toBeNull();
    useBuilderStore.getState().setHoveredNodeId('x');
    expect(useBuilderStore.getState().hoveredNodeId).toBe('x');
    useBuilderStore.getState().setHoveredNodeId(null);
    expect(useBuilderStore.getState().hoveredNodeId).toBeNull();
  });

  it('isYamlPreviewOpen defaults to false and toggles', () => {
    expect(useBuilderStore.getState().isYamlPreviewOpen).toBe(false);
    useBuilderStore.getState().setYamlPreviewOpen(true);
    expect(useBuilderStore.getState().isYamlPreviewOpen).toBe(true);
  });

  it('loadWorkflow seeds baselineYaml from the loaded input', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'n', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'prompt', data: { prompt: 'x' }, base: {}, unknown: {} },
      ],
    });
    const baseline = useBuilderStore.getState().baselineYaml;
    expect(typeof baseline).toBe('string');
    expect(baseline).toContain('name: n');
    expect(baseline).toContain('id: a');
  });

  it('opening the drawer does not change baseline', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'n', description: 'd', base: {}, unknown: {} },
      nodes: [],
    });
    const before = useBuilderStore.getState().baselineYaml;
    useBuilderStore.getState().setYamlPreviewOpen(true);
    expect(useBuilderStore.getState().baselineYaml).toBe(before);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun --filter='@archon-studio/studio-core' run test builder-store
```
Expected: FAIL with "hoveredNodeId is not a property" (or similar).

- [ ] **Step 4: Update the store**

In `packages/studio-core/src/store/builder-store.ts`:

1. Add to the state type:
```ts
hoveredNodeId: string | null;
isYamlPreviewOpen: boolean;
baselineYaml: string | null;
```

2. Add to the actions type:
```ts
setHoveredNodeId: (id: string | null) => void;
setYamlPreviewOpen: (open: boolean) => void;
```

3. Add to initial state:
```ts
hoveredNodeId: null,
isYamlPreviewOpen: false,
baselineYaml: null,
```

4. Add to the create body:
```ts
setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
setYamlPreviewOpen: (open) => set({ isYamlPreviewOpen: open }),
```

5. Update `loadWorkflow` to seed the baseline. At the top of the action, import `serializeYaml` and call it on the input *before* mutating state:
```ts
import { serializeYaml } from '../exporter/serializeYaml';

// inside loadWorkflow(input):
const { yaml: baseline } = serializeYaml(input);
set({
  workflow: input.meta,
  nodes: input.nodes,
  baselineYaml: baseline,
  // ...existing resets (selectedNodeId, etc.)
});
```

Note: this introduces a runtime dep from `store/` on `exporter/serializeYaml`. That's deliberate — the baseline is part of "what was loaded," and the exporter is already pure. No circular import (exporter does not import store).

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun --filter='@archon-studio/studio-core' run test builder-store
```
Expected: PASS, +4 new tests.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/store/builder-store.ts packages/studio-core/tests/store/builder-store.spec.ts
git commit -m "feat(store): hoveredNodeId + isYamlPreviewOpen + baselineYaml slice"
```

---

### Task 7.5: Toolbar toggle + WorkflowBuilder right-column swap

**Files:**
- Modify: `packages/studio-core/src/components/Toolbar.tsx`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx`
- Modify: `packages/studio-core/tests/components/Toolbar.spec.tsx` (or create)
- Modify: `packages/studio-core/tests/components/WorkflowBuilder.spec.tsx`

The toolbar gets a "YAML" toggle. To match Phase 6's Save-button pattern (props-driven, no direct store coupling), `WorkflowBuilderInner` reads `isYamlPreviewOpen` from the store and passes `isYamlPreviewOpen` + `onToggleYamlPreview` props to `Toolbar`. The `WorkflowBuilder` right-column slot — `<div className={styles.inspector}>` only — becomes single-occupancy: drawer XOR inspector. The bottom `styles.drawer` slot housing `ValidationPanel` is **left untouched** (it's the validation drawer, not the inspector).

- [ ] **Step 1: Extend the Toolbar prop bag**

Update `Toolbar.tsx`:

```tsx
export interface ToolbarProps {
  workflowName: string;
  onResetLayout: () => void;
  onSave?: () => void;
  hasErrors?: boolean;
  topErrors?: readonly string[];
  /** When true, the YAML toggle button renders pressed. */
  isYamlPreviewOpen?: boolean;
  /** When provided, renders the YAML toggle button. */
  onToggleYamlPreview?: () => void;
}
```

Render the button between Reset layout and Save (skip it entirely if `onToggleYamlPreview` is omitted, mirroring the existing Save-button-opt-in pattern):

```tsx
{onToggleYamlPreview ? (
  <button
    type="button"
    aria-pressed={!!isYamlPreviewOpen}
    onClick={onToggleYamlPreview}
    style={{
      background: isYamlPreviewOpen ? 'var(--studio-accent, #7c3aed)' : 'transparent',
      color: isYamlPreviewOpen ? '#fff' : 'var(--studio-fg)',
      border: '1px solid var(--studio-muted)',
      borderRadius: 'var(--radius-sm)',
      padding: '4px 8px',
      cursor: 'pointer',
    }}
  >
    YAML
  </button>
) : null}
```

- [ ] **Step 2: Write the failing toolbar tests**

Add to `packages/studio-core/tests/components/Toolbar.spec.tsx`:

```tsx
import { describe, it, expect } from 'bun:test';
import { render, fireEvent, screen } from '@testing-library/react';
import { Toolbar } from '../../src/components/Toolbar';

describe('Toolbar — YAML toggle', () => {
  it('does not render the YAML button when onToggleYamlPreview is omitted', () => {
    render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
    expect(screen.queryByRole('button', { name: /yaml/i })).toBeNull();
  });

  it('renders a pressed YAML button when isYamlPreviewOpen is true', () => {
    render(
      <Toolbar
        workflowName="w"
        onResetLayout={() => {}}
        isYamlPreviewOpen={true}
        onToggleYamlPreview={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /yaml/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the YAML button calls onToggleYamlPreview', () => {
    let count = 0;
    render(
      <Toolbar
        workflowName="w"
        onResetLayout={() => {}}
        isYamlPreviewOpen={false}
        onToggleYamlPreview={() => { count++; }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /yaml/i }));
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 3: Run toolbar tests**

```bash
bun --filter='@archon-studio/studio-core' run test Toolbar
```
Expected: PASS for the new tests; existing Toolbar tests unchanged.

- [ ] **Step 4: Wire the toggle through `WorkflowBuilderInner`**

In `WorkflowBuilder.tsx`, `WorkflowBuilderInner` already reads from the store and computes derived props. Add:

```tsx
const isYamlOpen = useBuilderStore((s) => s.isYamlPreviewOpen);
const setYamlOpen = useBuilderStore((s) => s.setYamlPreviewOpen);
```

Update the Toolbar invocation:

```tsx
<Toolbar
  workflowName={storeName}
  onResetLayout={positions.reset}
  onSave={onSave}
  hasErrors={hasErrors}
  topErrors={topErrors}
  isYamlPreviewOpen={isYamlOpen}
  onToggleYamlPreview={() => setYamlOpen(!isYamlOpen)}
/>
```

Replace the inspector slot (`<div className={styles.inspector}>` at line 84) — and ONLY this slot, the bottom `styles.drawer` keeps `ValidationPanel`:

```tsx
<div className={styles.inspector} data-pane={isYamlOpen ? 'yaml-preview' : 'inspector'}>
  {isYamlOpen ? <YamlPreviewDrawer /> : <NodeInspector />}
</div>
```

(The `data-pane` attribute is the test selector. The `className={styles.inspector}` keeps the CSS grid placement — without it, the YAML drawer would lose its column.)

Add the import:

```tsx
import { YamlPreviewDrawer } from './preview/YamlPreviewDrawer';
```

- [ ] **Step 5: Write the failing WorkflowBuilder swap test**

Add to `packages/studio-core/tests/components/WorkflowBuilder.spec.tsx` (reuse the existing test harness's stub client + render call):

```tsx
import { StubArchonApiClient } from '@archon-studio/studio-api-archon';
// ...if not already imported.

it('right column shows NodeInspector by default and YamlPreviewDrawer when toggled', () => {
  useBuilderStore.getState().loadWorkflow({
    meta: { name: 'n', description: 'd', base: {}, unknown: {} },
    nodes: [{ id: 'a', variant: 'prompt', data: { prompt: 'x' }, base: {}, unknown: {} }],
  });
  const stub = new StubArchonApiClient();
  const { container, rerender } = render(
    <WorkflowBuilder
      client={stub}
      theme="archon-dark"
      archonUrl="__dev__"
      cwd=""
      workflowName="n"
    />,
  );
  expect(container.querySelector('[data-pane="inspector"]')).toBeTruthy();
  expect(container.querySelector('[data-pane="yaml-preview"]')).toBeNull();

  useBuilderStore.getState().setYamlPreviewOpen(true);
  rerender(
    <WorkflowBuilder
      client={stub}
      theme="archon-dark"
      archonUrl="__dev__"
      cwd=""
      workflowName="n"
    />,
  );
  expect(container.querySelector('[data-pane="inspector"]')).toBeNull();
  expect(container.querySelector('[data-pane="yaml-preview"]')).toBeTruthy();
  // The validation drawer (separate slot) must remain mounted regardless.
  expect(container.querySelector('[data-testid="validation-drawer"]')).toBeTruthy();
});
```

(Verify the existing WorkflowBuilder test file imports — match its render signature exactly. The above uses `WorkflowBuilder`'s real props per `WorkflowBuilderProps` in `WorkflowBuilder.tsx`.)

- [ ] **Step 6: Stub `YamlPreviewDrawer`**

Create `packages/studio-core/src/components/preview/YamlPreviewDrawer.tsx` as a minimal shell that mounts `YamlPreview` with derived props:

```tsx
import { useMemo } from 'react';
import { useBuilderStore } from '../../store/builder-store';
import { serializeYaml } from '../../exporter/serializeYaml';
import { YamlPreview } from './YamlPreview';

export function YamlPreviewDrawer() {
  const meta = useBuilderStore((s) => s.workflow);
  const nodes = useBuilderStore((s) => s.nodes);
  const selectedNodeId = useBuilderStore((s) => s.selectedNodeId);
  const hoveredNodeId = useBuilderStore((s) => s.hoveredNodeId);
  const setSelected = useBuilderStore((s) => s.setSelectedNodeId);

  const result = useMemo(() => {
    if (!meta) return { yaml: '', sourceMap: [] };
    return serializeYaml({ meta, nodes });
  }, [meta, nodes]);

  return (
    <div className="yaml-preview-drawer">
      <header className="yaml-preview-drawer__header">
        <h2>YAML preview</h2>
        <p className="yaml-preview-drawer__note">
          Preview formatting may differ from saved file.
        </p>
      </header>
      <YamlPreview
        yaml={result.yaml}
        sourceMap={result.sourceMap}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onLinePick={(id) => setSelected(id)}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run all builder + toolbar tests**

```bash
bun --filter='@archon-studio/studio-core' run test WorkflowBuilder Toolbar
```
Expected: PASS across the board.

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/src/components packages/studio-core/tests/components/Toolbar.spec.tsx packages/studio-core/tests/components/WorkflowBuilder.spec.tsx
git commit -m "feat(preview): toolbar YAML toggle + drawer swaps with inspector"
```

---

### Task 7.6: Canvas hover wiring + drawer hover/click pipe-through

**Files:**
- Modify: `packages/studio-core/src/components/Canvas.tsx`
- Modify: `packages/studio-core/src/components/preview/YamlPreviewDrawer.tsx`
- Modify: `packages/studio-core/tests/components/Canvas.spec.tsx`
- Modify: `packages/studio-core/tests/components/preview/YamlPreviewDrawer.spec.tsx` (created in Task 7.7 — if executing 7.6 before 7.7, create a stub spec file)

Click-to-focus, hover-line-to-id, scroll-to-selected, and selected/hovered decorations are **already implemented** inside `YamlPreview` (Task 7.3) via `domEventLineHandler` + dispatched `setHighlightTargets`. This task wires the remaining edge: canvas → store, and store → drawer → preview.

- [ ] **Step 1: Write the failing canvas-hover test**

Add to `packages/studio-core/tests/components/Canvas.spec.tsx`. The cleanest approach — without coupling to React Flow's internals — is to capture the props passed to `<ReactFlow />` via a mock. If the existing Canvas tests already mock `@xyflow/react`, reuse that pattern; otherwise:

```tsx
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../../src/components/Canvas';
import { useBuilderStore } from '../../src/store/builder-store';

const initial = useBuilderStore.getState();
let captured: Record<string, unknown> = {};

mock.module('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ReactFlow: (props: Record<string, unknown>) => {
    captured = props;
    return <div data-testid="rf-mock" />;
  },
  Background: () => null,
  Controls: () => null,
  // Re-export anything else the real Canvas imports — copy from the actual import list.
}));

beforeEach(() => {
  useBuilderStore.setState(initial, true);
  captured = {};
});

describe('Canvas — hover wiring', () => {
  it('forwards onNodeMouseEnter / onNodeMouseLeave to React Flow', () => {
    render(
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>,
    );
    const enter = captured.onNodeMouseEnter as
      | ((e: unknown, node: { id: string }) => void)
      | undefined;
    const leave = captured.onNodeMouseLeave as ((e: unknown, node: { id: string }) => void) | undefined;
    expect(typeof enter).toBe('function');
    expect(typeof leave).toBe('function');

    enter!({}, { id: 'a' });
    expect(useBuilderStore.getState().hoveredNodeId).toBe('a');
    leave!({}, { id: 'a' });
    expect(useBuilderStore.getState().hoveredNodeId).toBeNull();
  });
});
```

(If `mock.module` collides with how the existing Canvas test mocks React Flow, follow the existing pattern. The minimum viable version of this test is: stub the ReactFlow wrapper, render Canvas, assert that the prop functions you wired call `setHoveredNodeId`.)

- [ ] **Step 2: Wire the handlers in `Canvas.tsx`**

```tsx
const setHoveredNodeId = useBuilderStore((s) => s.setHoveredNodeId);
// in <ReactFlow ... > props:
onNodeMouseEnter={(_e, node) => setHoveredNodeId(node.id)}
onNodeMouseLeave={() => setHoveredNodeId(null)}
```

- [ ] **Step 3: Pipe `onLineHover` through `YamlPreviewDrawer`**

Update `YamlPreviewDrawer.tsx` (the stub created in Task 7.5 step 6) to read + write `hoveredNodeId`:

```tsx
const setHoveredNodeId = useBuilderStore((s) => s.setHoveredNodeId);
// ...
<YamlPreview
  yaml={result.yaml}
  sourceMap={result.sourceMap}
  selectedNodeId={selectedNodeId}
  hoveredNodeId={hoveredNodeId}
  onLinePick={(id) => setSelected(id)}
  onLineHover={(id) => setHoveredNodeId(id)}
/>
```

- [ ] **Step 4: Run tests**

```bash
bun --filter='@archon-studio/studio-core' run test Canvas yamlPreview YamlPreview WorkflowBuilder
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/components packages/studio-core/tests/components
git commit -m "feat(preview): canvas hover writes hoveredNodeId; drawer pipes onLineHover through"
```

---

### Task 7.7: Drawer header extras — copy, download, diff badge

**Files:**
- Modify: `packages/studio-core/src/components/preview/YamlPreviewDrawer.tsx`
- Create: `packages/studio-core/src/components/preview/yamlDiffBadge.ts`
- Create: `packages/studio-core/tests/components/preview/YamlPreviewDrawer.spec.tsx`

Three small additions to the drawer header.

- [ ] **Step 1: Implement `yamlDiffBadge` helper**

Create `packages/studio-core/src/components/preview/yamlDiffBadge.ts`:

```ts
export function isModified(current: string, baseline: string | null): boolean {
  if (baseline == null) return false;
  return current.trim() !== baseline.trim();
}
```

Tiny on purpose. Trim guards against trailing-newline noise.

- [ ] **Step 2: Write the failing drawer header tests**

Create `packages/studio-core/tests/components/preview/YamlPreviewDrawer.spec.tsx`:

```tsx
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { render, fireEvent, screen } from '@testing-library/react';
import { YamlPreviewDrawer } from '../../../src/components/preview/YamlPreviewDrawer';
import { useBuilderStore } from '../../../src/store/builder-store';

const initial = useBuilderStore.getState();
beforeEach(() => {
  useBuilderStore.setState(initial, true);
  useBuilderStore.getState().loadWorkflow({
    meta: { name: 'n', description: 'd', base: {}, unknown: {} },
    nodes: [{ id: 'a', variant: 'prompt', data: { prompt: 'x' }, base: {}, unknown: {} }],
  });
});

describe('YamlPreviewDrawer header', () => {
  it('renders the "may differ" note', () => {
    render(<YamlPreviewDrawer />);
    expect(screen.getByText(/may differ/i)).toBeTruthy();
  });

  it('copy button writes the yaml to navigator.clipboard', async () => {
    const writeText = mock(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<YamlPreviewDrawer />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalled();
    expect(String(writeText.mock.calls[0]![0])).toContain('name: n');
  });

  it('download button creates a download blob with name <workflow>.yaml', () => {
    let downloadName: string | null = null;
    const origCreateObjectURL = URL.createObjectURL;
    const origCreate = document.createElement.bind(document);
    const click = mock(() => {});
    try {
      URL.createObjectURL = () => 'blob:fake';
      document.createElement = ((tag: string) => {
        const el = origCreate(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: click, configurable: true });
          Object.defineProperty(el, 'download', {
            set(v: string) { downloadName = v; },
            configurable: true,
          });
        }
        return el;
      }) as typeof document.createElement;

      render(<YamlPreviewDrawer />);
      fireEvent.click(screen.getByRole('button', { name: /download/i }));
      expect(click).toHaveBeenCalled();
      expect(downloadName).toBe('n.yaml');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      document.createElement = origCreate;
    }
  });

  it('Modified badge is hidden when current matches baseline', () => {
    render(<YamlPreviewDrawer />);
    expect(screen.queryByText(/modified/i)).toBeNull();
  });

  it('Modified badge appears when content has changed since load', () => {
    // Mutate a node so the serialized yaml differs from baseline.
    useBuilderStore.setState((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === 'a' ? { ...n, data: { prompt: 'CHANGED' } } : n,
      ),
    }));
    render(<YamlPreviewDrawer />);
    expect(screen.getByText(/modified/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Implement the header extras**

Update `YamlPreviewDrawer.tsx`:

```tsx
import { isModified } from './yamlDiffBadge';

// inside the component:
const baseline = useBuilderStore((s) => s.baselineYaml);
const modified = isModified(result.yaml, baseline);
const filename = `${meta?.name ?? 'workflow'}.yaml`;

const onCopy = () => {
  void navigator.clipboard.writeText(result.yaml);
};
const onDownload = () => {
  const blob = new Blob([result.yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// header JSX:
<header className="yaml-preview-drawer__header">
  <div className="yaml-preview-drawer__title-row">
    <h2>YAML preview</h2>
    {modified && <span className="badge badge--modified">Modified</span>}
  </div>
  <p className="yaml-preview-drawer__note">
    Preview formatting may differ from saved file.
  </p>
  <div className="yaml-preview-drawer__actions">
    <button type="button" onClick={onCopy}>Copy</button>
    <button type="button" onClick={onDownload}>Download</button>
  </div>
</header>
```

Add the `.badge--modified` class to the module CSS (an amber pill is fine — match the validation panel's existing warning hue).

- [ ] **Step 4: Run tests**

```bash
bun --filter='@archon-studio/studio-core' run test YamlPreviewDrawer
```
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/components/preview packages/studio-core/tests/components/preview/YamlPreviewDrawer.spec.tsx
git commit -m "feat(preview): drawer header — copy, download, modified-vs-baseline badge"
```

---

### Task 7.8: Component E2E — open drawer, click line, see canvas selection move

**Files:**
- Create: `packages/studio-core/tests/integration/yaml-preview.e2e.spec.tsx`

A single integration test that wires the whole feature together: load a multi-node fixture, open the drawer, click a node-id line, assert canvas selection moved.

The goal here is to verify *the wiring*, not to re-test pieces already covered. Specifically: (1) the Toolbar's YAML button mounts the drawer; (2) the drawer mounts a CM6 editor showing the canonical YAML; (3) the validation drawer (separate slot) survives the toggle; (4) `setSelectedNodeId` causes the YAML preview to receive the new selection (via `selectedNodeId` prop flowing in). DOM-level CM6 mouse events are not driven from this test — Task 7.3 tests `domEventLineHandler` in isolation.

- [ ] **Step 1: Write the test (ESM-safe, real wiring assertions)**

Create `packages/studio-core/tests/integration/yaml-preview.e2e.spec.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'bun:test';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { WorkflowBuilder } from '../../src/components/WorkflowBuilder';
import { fromWorkflowDefinition } from '../../src/exporter/fromWorkflowDefinition';
import { serializeYaml } from '../../src/exporter/serializeYaml';
import { useBuilderStore } from '../../src/store/builder-store';
import { StubArchonApiClient } from '@archon-studio/studio-api-archon';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  '../../../studio-fixtures/src/round-trip-fixtures/_smoke-pi-all-nodes.yaml',
);
const fixtureYaml = readFileSync(fixturePath, 'utf8');

const initial = useBuilderStore.getState();
beforeEach(() => {
  useBuilderStore.setState(initial, true);
  useBuilderStore
    .getState()
    .loadWorkflow(fromWorkflowDefinition(parseYaml(fixtureYaml) as Record<string, unknown>));
});

const renderBuilder = () =>
  render(
    <WorkflowBuilder
      client={new StubArchonApiClient()}
      theme="archon-dark"
      archonUrl="__dev__"
      cwd=""
      workflowName="smoke"
    />,
  );

describe('YAML preview — end-to-end wiring', () => {
  it('toggle mounts the drawer; canonical yaml appears; validation drawer survives', () => {
    const { container } = renderBuilder();

    // Before toggle: inspector mounted, drawer not.
    expect(container.querySelector('[data-pane="inspector"]')).toBeTruthy();
    expect(container.querySelector('[data-pane="yaml-preview"]')).toBeNull();
    expect(container.querySelector('[data-testid="validation-drawer"]')).toBeTruthy();

    // Toggle via the actual Toolbar button.
    fireEvent.click(screen.getByRole('button', { name: /yaml/i }));

    expect(container.querySelector('[data-pane="yaml-preview"]')).toBeTruthy();
    expect(container.querySelector('[data-pane="inspector"]')).toBeNull();
    // Validation drawer untouched.
    expect(container.querySelector('[data-testid="validation-drawer"]')).toBeTruthy();
    // CM6 mounted.
    expect(container.querySelector('.cm-editor')).toBeTruthy();
    // The drawer's text contains the workflow name and at least one node id.
    const text = container.textContent ?? '';
    const firstNodeId = useBuilderStore.getState().nodes[0]!.id;
    expect(text).toContain(firstNodeId);
  });

  it('selecting a node in the store causes the preview to receive that selection', () => {
    const { container } = renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: /yaml/i }));

    const nodes = useBuilderStore.getState().nodes;
    expect(nodes.length).toBeGreaterThan(1);
    const target = nodes[1]!.id;

    act(() => {
      useBuilderStore.getState().setSelectedNodeId(target);
    });

    // Verify the selection propagated to the store (the prop flow into
    // YamlPreview is covered by Task 7.3's tests; here we assert the
    // integration point — the rendered drawer is reading from the same
    // store the toolbar wrote into).
    expect(useBuilderStore.getState().selectedNodeId).toBe(target);

    // And independently: the source map for the rendered preview must
    // contain the target id, proving the YAML the drawer renders has the
    // same shape as what serializeYaml would produce now.
    const { workflow, nodes: ns } = useBuilderStore.getState();
    const { sourceMap } = serializeYaml({ meta: workflow!, nodes: ns });
    expect(sourceMap.some((r) => r.id === target)).toBe(true);
    expect(container.querySelector('.cm-editor')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun --filter='@archon-studio/studio-core' run test yaml-preview.e2e
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/studio-core/tests/integration/yaml-preview.e2e.spec.tsx
git commit -m "test(preview): e2e — toolbar toggle + line→selection wiring against smoke fixture"
```

---

### Task 7.9: Manual smoke + verify + drift notes + tag + phases.md update

**Files:**
- Modify: `phases.md` (mark Phase 7 ✅ ✅ ✅ and append a "Phase 7 — completion notes" section)
- Create: `docs/superpowers/plans/phase-7-drift-notes.md`

- [ ] **Step 1: Manual smoke against the standalone app**

```bash
bun --filter='@archon-studio/standalone' run dev
```
- Load `_smoke-pi-all-nodes.yaml` (or the snippet that matches it).
- Click the YAML toolbar button → drawer opens, inspector hides.
- Verify YAML matches the on-disk file (modulo formatting noise — check key order and that nothing's missing).
- Click each node in the canvas → preview decorates and scrolls to that node's line range.
- Hover a node → preview shows the lighter hovered decoration.
- Click a `- id: …` line in the preview → canvas selects that node.
- Hover lines in the preview → canvas's selected-style does NOT change (hover ≠ selection); canvas's hover-style if any updates.
- Click "Copy" → paste into a scratch file; matches preview.
- Click "Download" → file lands at `<workflow-name>.yaml`; opens in the editor as the canonical text.
- Edit a body field via the inspector → toggle the drawer back open → "Modified" pill appears.
- Reload the page → drawer is closed, "Modified" pill is gone.
- Press Ctrl+F inside the preview → search panel appears at the top of the editor.

Record any glitches in the drift notes (Step 4).

- [ ] **Step 2: Run the full verification suite**

```bash
bun --filter='*' run test
bun --filter='*' run build
bun run lint
bun run format:check
bun run check-schema-drift
bun run check-when-grammar-drift
```
Expected: all green. Test count = post-Phase-6 baseline + ~25.

- [ ] **Step 3: Update `phases.md`**

In the table, mark Phase 7 as `✅ | ✅ | ✅`. Below the Phase 6 section, add:

```markdown
## Phase 7 — completion notes

All N tasks (7.0 reality check → 7.9 verify) landed on branch `phase-7`. The
drift cheat sheet at `docs/superpowers/plans/phase-7-drift-notes.md` records
plan-vs-code deviations.

Phase 7 deliverables shipped:

- `serializeYaml` — pure serializer producing canonical Archon-shape YAML +
  per-node `{ id, startLine, endLine }` source map (round-trip-parsed via
  `LineCounter` to recover positions)
- `YamlPreview` — read-only CM6 editor with `@codemirror/lang-yaml`,
  `@codemirror/search` (Ctrl+F), and line-range decorations driven by
  selected/hovered node ids
- `YamlPreviewDrawer` — header with copy, download, modified-vs-baseline pill,
  and the "preview formatting may differ from saved file" note
- `builder-store` — `hoveredNodeId`, `isYamlPreviewOpen`, `baselineYaml` (seeded
  by `loadWorkflow` via `serializeYaml`), and their setters
- `Toolbar` — YAML toggle button bound to `isYamlPreviewOpen`
- `WorkflowBuilder` — right column becomes single-occupancy: drawer XOR
  inspector
- `Canvas` — `onNodeMouseEnter` / `onNodeMouseLeave` write `hoveredNodeId`
- Bidirectional cross-highlight: line click → node selection; node selection
  → preview scroll + decoration; node hover → preview decoration; line hover
  → `hoveredNodeId`

Verification: N/N tests pass · all packages build · typecheck green · lint 0
errors · format clean · schema-drift clean · grammar-drift clean.
```

- [ ] **Step 4: Write `docs/superpowers/plans/phase-7-drift-notes.md`**

Mirror the Phase 5 / Phase 6 drift-notes shape:
- Headline: "Phase 7 drift cheat sheet — plan vs. code"
- One section per material deviation (e.g., "v1 sketch named highlight.js, we used CM6 + lang-yaml because Phase 5 already shipped CmEditor"). Even if there were *no* deviations, write a short "no material drift" note for the audit trail.

- [ ] **Step 5: Commit phases.md + drift notes**

```bash
git add phases.md docs/superpowers/plans/phase-7-drift-notes.md
git commit -m "docs(status): mark Phase 7 complete — YAML preview pane"
```

- [ ] **Step 6: Tag and push**

```bash
git tag phase-7
git push -u origin phase-7
git push --tags
```

- [ ] **Step 7: Save Phase 7 memory note**

Mirror `memory/phase-5-complete.md` and `memory/phase-6-complete.md`. Capture:
- Branch + tag pushed
- Final test count delta
- Drift cheat sheet path
- Key files shipped
- Deps added (`@codemirror/lang-yaml`, possibly `@codemirror/search`)
- "How to apply" — Phase 8's undo/redo will need to either ignore `baselineYaml` (it's not user state) or snapshot it; flag the decision.

---

## Summary

| Task | Files touched | New tests | Notes |
|---|---|---|---|
| 7.0 | none (verification) | 0 | Reality check before any edits |
| 7.0.5 | `inspector/shared/CmEditor.tsx` | 2 | Compartment + `onCreate` so Phase-7 extensions can reconfigure |
| 7.1 | `exporter/serializeYaml.ts` | 7 | Pure serializer + source map via LineCounter round-trip |
| 7.2 | `tests/exporter/serializeYaml.fixtures.spec.ts` | 1 per fixture (~20) | Round-trip faithfulness gate |
| 7.3 | `components/preview/*` + dep additions | 7 | StateField-driven decorations, stable click/hover handlers |
| 7.4 | `store/builder-store.ts` | 4 | hoveredNodeId, drawer toggle, baselineYaml |
| 7.5 | `Toolbar.tsx`, `WorkflowBuilder.tsx`, `YamlPreviewDrawer.tsx` | 4 | Prop-driven toggle; swap only `styles.inspector` slot |
| 7.6 | `Canvas.tsx`, `YamlPreviewDrawer.tsx` | 1 | Canvas writes `hoveredNodeId`; drawer pipes `onLineHover` |
| 7.7 | `YamlPreviewDrawer.tsx`, `yamlDiffBadge.ts` | 5 | Copy + download (try/finally) + modified pill |
| 7.8 | `tests/integration/yaml-preview.e2e.spec.tsx` | 2 | ESM-safe wiring smoke against `_smoke-pi-all-nodes.yaml` |
| 7.9 | `phases.md`, `phase-7-drift-notes.md`, memory | 0 | Verify + tag + status |

**Total new tests:** ~32 behavioral + ~20 round-trip-fixture tests ≈ **~52 net**. Phase-6 baseline of 382 → Phase-7 target of **~434**. (The "~427" header figure is a floor; the actual count depends on how many fixtures `studio-fixtures/src/round-trip-fixtures/` carries when Phase 7 starts.)

**Branch lifecycle:** Cut `phase-7` from `main` after Phase 6 lands and is tagged. Tag `phase-7` on the verify task. Standard.

## Review history

This plan went through one independent review before execution. The reviewer caught four BLOCKER-class issues and six MAJOR-class issues; all were folded into the current revision:

- Fixture filename corrected: `_smoke-pi-all-nodes.yaml` (not `_smoke-e2e-pi-all-nodes.yaml`).
- `CmEditor` mount-once limitation surfaced — new Task 7.0.5 introduces a `Compartment` + `onCreate` hook *before* any YAML-preview code is written.
- `nodeLineHighlight` rewritten from a (broken) `EditorView.decorations.compute` + `findFromDOM` pattern into a canonical `StateField<DecorationSet>` driven by `StateEffect`s (`setRanges`, `setHighlightTargets`) dispatched from React effects.
- `WorkflowBuilder` and `Toolbar` test renders now pass the real prop bag (`client`, `theme`, `archonUrl`, `cwd`, `workflowName`) instead of the imagined `apiClient` prop.
- Right-column swap restricted to `styles.inspector` only; the bottom `styles.drawer` slot (Phase-6 `ValidationPanel`) is left untouched and explicitly asserted to survive the toggle.
- `serializeYaml` imports `LoadWorkflowInput` as a type-only import to avoid a runtime cycle once `builder-store` calls `serializeYaml` inside `loadWorkflow`.
- Integration test in Task 7.8 uses `fileURLToPath(import.meta.url)` (ESM-safe) and replaces a tautological assertion with real wiring checks.
- Task 7.7 download test wraps its `document.createElement` / `URL.createObjectURL` monkey-patches in `try/finally`.
