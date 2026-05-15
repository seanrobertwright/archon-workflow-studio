# Phase 6 — Validation pipeline + ValidationPanel: Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a three-tier validation engine (instant / debounced 300ms / server) with a bottom-drawer `ValidationPanel`, click-to-focus from panel rows to the offending node/field, and a Save gate driven by the issue list.

**Architecture:** A pure `validation/` module owns rule functions grouped by tier. An `engine.ts` orchestrates the tiers, owns the 300ms debounce, and uses an AbortController + monotonic sequence number to drop stale server responses. A `useValidation` hook subscribes to `builder-store` and exposes `{ issues, hasErrors, isValidating, focusIssue }`. A new `ValidationPanel` fills the bottom drawer row added to the `WorkflowBuilder` grid. The Toolbar Save button reads `hasErrors` and gates Save.

**Tech Stack:** TypeScript + React 19 (existing); Zustand (existing); `bun:test` + `@testing-library/react` (existing). No new dependencies — `lib/grammar.ts` (Phase 5) is the `when:` parser; `transitiveUpstream` (Phase 5) is reused for the `{{var}}` scan.

**Reference design doc:** `docs/superpowers/specs/2026-05-10-phase-6-validation-design.md`.

**Reference skills:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`.

**Drift discipline:** Phase 4 and Phase 5 both taught the same lesson — the plan describes the codebase as of today, but it drifts. Every task begins with a verification step; if reality deviates, capture the deviation inline (mirror `docs/superpowers/plans/phase-5-drift-notes.md`) and adapt the task before continuing.

**Test target:** ~50 new tests, taking the suite from 318 → ~370.

---

## Chunk 1: Phase 6 — validation pipeline + ValidationPanel

### Task 6.0: Phase-5 reality check (read-only verification)

**Files:**
- None (verification only).

Confirm the surfaces Phase 6 depends on are still in the shape Phase 5 left them.

- [ ] **Step 1: Confirm `lib/grammar.ts` exports `parse` returning `ParseResult`**

```bash
grep -n "^export" packages/studio-core/src/lib/grammar.ts
```
Expected: `parse(input: string): ParseResult` plus `WhenAst`, `AtomNode`, `DnfAst`, `format`, `toDnf`. If `parse` has been renamed or its return shape changed, Task 6.3 (`content.when.parse`) must adapt.

- [ ] **Step 2: Confirm `transitiveUpstream` exists at the path Phase 6 will import**

```bash
grep -n "export function transitiveUpstream" packages/studio-core/src/components/when/transitiveUpstream.ts
```
Expected: a single `export function transitiveUpstream(id, nodes)` returning `string[]`. Phase 6 imports this from there for the `{{var}}` scan. If it has moved (e.g., into `lib/`), update Task 6.3's import line.

- [ ] **Step 3: Confirm `builder-store` shape**

```bash
grep -n "workflow:\|nodes:\|selectedNodeId:\|setSelectedNodeId" packages/studio-core/src/store/builder-store.ts
```
Expected: `workflow: WorkflowMeta | null`, `nodes: DagNode[]`, `selectedNodeId: string | null`, `setSelectedNodeId`. Phase 6 reads these; if the store has reshaped, the hook in Task 6.5 adapts.

- [ ] **Step 4: Confirm `WorkflowApiClient.validateWorkflow` signature**

```bash
grep -n "validateWorkflow\|ValidateResult" packages/studio-core/src/api/WorkflowApiClient.ts
```
Expected: `validateWorkflow(definition: WorkflowDefinition): Promise<ValidateResult>` and `ValidateResult = { valid: boolean; errors?: string[] }`. If the result has been upgraded to structured issues already, Task 6.4 simplifies (wrap is identity).

- [ ] **Step 5: Confirm `WorkflowBuilder` grid has no drawer row yet**

```bash
cat packages/studio-core/src/components/WorkflowBuilder.module.css
```
Expected: `grid-template-rows: 56px 1fr;` (two rows). Phase 6 adds a third row for the drawer. If a drawer row already exists, Task 6.6 becomes a no-op for the CSS and only mounts the panel.

- [ ] **Step 6: Confirm `Toolbar` does not have a Save button yet**

```bash
grep -n "Save\|onSave" packages/studio-core/src/components/Toolbar.tsx
```
Expected: no Save button — only `workflowName` and `Reset layout`. Phase 6 introduces Save *as a gated button* (real save wiring lands in Phase 9; Phase 6's button calls a prop-injected `onSave` that the standalone app stubs).

- [ ] **Step 7: Run the green baseline**

```bash
bun --filter='*' run test
bun --filter='*' run build
bun run lint
bun run format:check
bun run check-schema-drift
bun run check-when-grammar-drift
```
Expected: all green at the post-Phase-5 baseline (318/318 tests). Phase 6 starts from green or not at all.

- [ ] **Step 8: Record reality-check findings**

If anything in Steps 1–6 deviated, write the deviation into a short note at the top of the next task you start. (No commit yet — read-only.)

---

### Task 6.1: Issue model + structural (instant) rules

**Files:**
- Create: `packages/studio-core/src/validation/types.ts`
- Create: `packages/studio-core/src/validation/rules/structural.ts`
- Create: `packages/studio-core/tests/validation/structural.spec.ts`

The types module is the lingua franca of the rest of the phase. Structural rules are pure, synchronous, and cheap — they run on every render.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/validation/structural.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { runStructuralRules } from '../../src/validation/rules/structural';
import type { DagNode } from '../../src/schemas';

const node = (over: Partial<DagNode> = {}): DagNode =>
  ({ id: 'a', type: 'prompt', base: { prompt: 'x' }, ...over }) as DagNode;

describe('structural rules', () => {
  it('returns no issues for a valid node list', () => {
    expect(runStructuralRules([node()])).toEqual([]);
  });

  it('flags empty ids', () => {
    const issues = runStructuralRules([node({ id: '' })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rule: 'structural.id.empty',
      severity: 'error',
      source: 'client-instant',
      path: { nodeId: '' },
    });
  });

  it('flags duplicate ids on every node that shares the id', () => {
    const issues = runStructuralRules([node({ id: 'dup' }), node({ id: 'dup' })]);
    expect(issues.filter((i) => i.rule === 'structural.id.duplicate')).toHaveLength(2);
  });

  it('flags missing required fields per variant (command.name)', () => {
    const bad = node({ id: 'c', type: 'command', base: {} as never });
    const issues = runStructuralRules([bad]);
    expect(issues.some((i) => i.rule === 'structural.required.name')).toBe(true);
  });

  it('flags missing decision branches', () => {
    const bad = node({ id: 'd', type: 'decision', base: {} as never });
    const issues = runStructuralRules([bad]);
    expect(issues.some((i) => i.rule === 'structural.required.branches')).toBe(true);
  });

  it('issue ids are stable across runs', () => {
    const a = runStructuralRules([node({ id: '' })]);
    const b = runStructuralRules([node({ id: '' })]);
    expect(a[0].id).toBe(b[0].id);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun --filter='@archon-studio/core' test structural
```
Expected: red, module not found.

- [ ] **Step 3: Write `types.ts`**

Create `packages/studio-core/src/validation/types.ts`:

```ts
export type Severity = 'error' | 'warning' | 'info';
export type RuleSource = 'client-instant' | 'client-debounced' | 'server';

export interface IssuePath {
  nodeId?: string;
  field?: string;
  atomIndex?: number;
}

export interface Issue {
  /** Stable hash(rule + path + message). Lets the panel preserve scroll/selection. */
  id: string;
  rule: string;
  severity: Severity;
  source: RuleSource;
  message: string;
  path: IssuePath;
}

/** Cheap, deterministic hash (djb2). No cryptographic strength required. */
export function issueId(rule: string, path: IssuePath, message: string): string {
  const key = `${rule}|${path.nodeId ?? ''}|${path.field ?? ''}|${path.atomIndex ?? ''}|${message}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `i_${(h >>> 0).toString(36)}`;
}
```

- [ ] **Step 4: Write `rules/structural.ts`**

Create `packages/studio-core/src/validation/rules/structural.ts`:

```ts
import type { DagNode } from '../../schemas';
import { type Issue, issueId } from '../types';

/** Pure: runs on every render. Cheap. Errors only. */
export function runStructuralRules(nodes: readonly DagNode[]): Issue[] {
  const out: Issue[] = [];
  const seen = new Map<string, number>();

  for (const n of nodes) {
    if (!n.id || n.id.trim() === '') {
      out.push(mk('structural.id.empty', n.id ?? '', undefined, 'Node id is empty.'));
      continue;
    }
    seen.set(n.id, (seen.get(n.id) ?? 0) + 1);
  }

  for (const n of nodes) {
    if ((seen.get(n.id) ?? 0) > 1) {
      out.push(mk('structural.id.duplicate', n.id, undefined, `Duplicate node id: "${n.id}".`));
    }
    out.push(...requiredFieldRules(n));
  }

  return out;
}

function requiredFieldRules(n: DagNode): Issue[] {
  const out: Issue[] = [];
  const base = (n.base ?? {}) as Record<string, unknown>;

  switch (n.type) {
    case 'command':
      if (!base.name || typeof base.name !== 'string' || !base.name.trim()) {
        out.push(mk('structural.required.name', n.id, 'name', 'Command node requires a `name` field.'));
      }
      break;
    case 'decision':
      if (!Array.isArray(base.branches) || base.branches.length === 0) {
        out.push(mk('structural.required.branches', n.id, 'branches', 'Decision node requires at least one branch.'));
      }
      break;
    case 'prompt':
      if (!base.prompt || typeof base.prompt !== 'string' || !base.prompt.trim()) {
        out.push(mk('structural.required.prompt', n.id, 'prompt', 'Prompt node requires a `prompt` field.'));
      }
      break;
    case 'bash':
    case 'script':
      if (!base.script || typeof base.script !== 'string' || !base.script.trim()) {
        out.push(mk('structural.required.script', n.id, 'script', `${n.type} node requires a \`script\` field.`));
      }
      break;
    case 'loop':
      if (!Array.isArray(base.body) || base.body.length === 0) {
        out.push(mk('structural.required.body', n.id, 'body', 'Loop node requires a non-empty `body`.'));
      }
      break;
    // approval + cancel: no required body field beyond id.
  }
  return out;
}

function mk(rule: string, nodeId: string, field: string | undefined, message: string): Issue {
  const path = { nodeId, field };
  return {
    id: issueId(rule, path, message),
    rule,
    severity: 'error',
    source: 'client-instant',
    message,
    path,
  };
}
```

> **Drift caveat:** Required-field list is derived from the variant Inspectors. If a variant's required-field set has changed since Phase 5, update both `requiredFieldRules` and its test, and note the deviation in the drift file.

- [ ] **Step 5: Run tests — expect PASS**

```bash
bun --filter='@archon-studio/core' test structural
```
Expected: green, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/validation/types.ts \
        packages/studio-core/src/validation/rules/structural.ts \
        packages/studio-core/tests/validation/structural.spec.ts
git commit -m "feat(validation): Issue model + structural rules (instant tier)"
```

---

### Task 6.2: Graph rules — cycles + ref integrity (debounced)

**Files:**
- Create: `packages/studio-core/src/validation/rules/graph.ts`
- Create: `packages/studio-core/tests/validation/graph.spec.ts`

Cycle detection uses three-color DFS (WHITE/GRAY/BLACK). Ref integrity walks `depends_on` plus decision branch `goto` targets.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/validation/graph.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { runGraphRules } from '../../src/validation/rules/graph';
import type { DagNode } from '../../src/schemas';

const n = (id: string, depends_on: string[] = [], extra: Partial<DagNode> = {}): DagNode =>
  ({ id, type: 'prompt', base: { prompt: 'x' }, depends_on, ...extra }) as DagNode;

describe('graph rules', () => {
  it('passes a linear DAG', () => {
    expect(runGraphRules([n('a'), n('b', ['a']), n('c', ['b'])])).toEqual([]);
  });

  it('flags a self-cycle', () => {
    const issues = runGraphRules([n('a', ['a'])]);
    expect(issues.some((i) => i.rule === 'graph.cycle')).toBe(true);
  });

  it('flags a 3-node cycle and attaches an issue to every member', () => {
    const issues = runGraphRules([n('a', ['c']), n('b', ['a']), n('c', ['b'])]);
    const cyc = issues.filter((i) => i.rule === 'graph.cycle');
    expect(cyc.length).toBe(3);
    expect(new Set(cyc.map((i) => i.path.nodeId))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('flags unknown depends_on references', () => {
    const issues = runGraphRules([n('a', ['ghost'])]);
    const refs = issues.filter((i) => i.rule === 'graph.ref.unknown');
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toMatchObject({ nodeId: 'a', field: 'depends_on' });
    expect(refs[0].message).toContain('ghost');
  });

  it('flags unknown decision branch targets', () => {
    const dec: DagNode = {
      id: 'd',
      type: 'decision',
      base: { branches: [{ on: 'success', goto: 'real' }, { on: 'failure', goto: 'ghost' }] },
    } as DagNode;
    const issues = runGraphRules([dec, n('real')]);
    const refs = issues.filter((i) => i.rule === 'graph.ref.unknown');
    expect(refs).toHaveLength(1);
    expect(refs[0].path.field).toContain('branch');
  });

  it('issue ids are stable across runs', () => {
    const a = runGraphRules([n('a', ['ghost'])]);
    const b = runGraphRules([n('a', ['ghost'])]);
    expect(a[0].id).toBe(b[0].id);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun --filter='@archon-studio/core' test graph
```

- [ ] **Step 3: Write `rules/graph.ts`**

Create `packages/studio-core/src/validation/rules/graph.ts`:

```ts
import type { DagNode } from '../../schemas';
import { type Issue, issueId } from '../types';

type Color = 0 | 1 | 2; // 0 = WHITE, 1 = GRAY, 2 = BLACK

export function runGraphRules(nodes: readonly DagNode[]): Issue[] {
  const out: Issue[] = [];
  const ids = new Set(nodes.map((n) => n.id));

  // Ref integrity (depends_on)
  for (const node of nodes) {
    for (const dep of node.depends_on ?? []) {
      if (!ids.has(dep)) {
        out.push(err('graph.ref.unknown', { nodeId: node.id, field: 'depends_on' },
          `depends_on references unknown node "${dep}".`));
      }
    }
  }

  // Ref integrity (decision branch gotos)
  for (const node of nodes) {
    if (node.type !== 'decision') continue;
    const branches = ((node.base ?? {}) as { branches?: Array<{ on: string; goto: string }> }).branches ?? [];
    branches.forEach((b, idx) => {
      if (b.goto && !ids.has(b.goto)) {
        out.push(err('graph.ref.unknown', { nodeId: node.id, field: `branches[${idx}].goto` },
          `Branch ${idx} (${b.on}) goes to unknown node "${b.goto}".`));
      }
    });
  }

  // Cycle detection — three-color DFS over depends_on.
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.id, (node.depends_on ?? []).filter((d) => ids.has(d)));
  }
  const color = new Map<string, Color>();
  for (const node of nodes) color.set(node.id, 0);
  const cycleMembers = new Set<string>();

  const stack: string[] = [];
  function dfs(u: string): void {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === 1) {
        const startIdx = stack.indexOf(v);
        for (let i = startIdx; i < stack.length; i++) cycleMembers.add(stack[i]);
      } else if (color.get(v) === 0) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, 2);
  }
  for (const node of nodes) if (color.get(node.id) === 0) dfs(node.id);

  for (const id of cycleMembers) {
    out.push(err('graph.cycle', { nodeId: id }, `Node "${id}" is part of a cycle in depends_on.`));
  }

  return out;
}

function err(rule: string, path: Issue['path'], message: string): Issue {
  return {
    id: issueId(rule, path, message),
    rule,
    severity: 'error',
    source: 'client-debounced',
    message,
    path,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun --filter='@archon-studio/core' test graph
```
Expected: green, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/validation/rules/graph.ts \
        packages/studio-core/tests/validation/graph.spec.ts
git commit -m "feat(validation): graph rules — cycles + ref integrity"
```

---

### Task 6.3: Content rules — `when:` grammar + `{{var}}` scan (debounced)

**Files:**
- Create: `packages/studio-core/src/validation/rules/content.ts`
- Create: `packages/studio-core/tests/validation/content.spec.ts`

`when:` calls `lib/grammar.parse` (Phase 5). The `{{var}}` scan strips fenced markdown so example snippets don't trip the rule, then matches `{{ids.X.Y}}` and flags `X` not in `transitiveUpstream(node)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/validation/content.spec.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { runContentRules } from '../../src/validation/rules/content';
import type { DagNode } from '../../src/schemas';

const prompt = (id: string, body: string, deps: string[] = []): DagNode =>
  ({ id, type: 'prompt', base: { prompt: body }, depends_on: deps }) as DagNode;

describe('content rules — when:', () => {
  it('passes a valid when: string', () => {
    const node: DagNode = {
      id: 'a', type: 'prompt', base: { prompt: 'x', when: "$x.output.ok == 'true'" },
    } as DagNode;
    expect(runContentRules([node])).toEqual([]);
  });

  it('flags an invalid when: string with the parser error', () => {
    const node: DagNode = {
      id: 'a', type: 'prompt', base: { prompt: 'x', when: 'this is not valid' },
    } as DagNode;
    const issues = runContentRules([node]);
    expect(issues.some((i) => i.rule === 'content.when.parse')).toBe(true);
  });
});

describe('content rules — {{var}} scan', () => {
  it('passes when {{ids.X.Y}} resolves to an upstream node', () => {
    const issues = runContentRules([
      prompt('a', 'first'),
      prompt('b', 'use {{ids.a.output.value}}', ['a']),
    ]);
    expect(issues).toEqual([]);
  });

  it('warns when {{ids.X.Y}} references a non-upstream node', () => {
    const issues = runContentRules([
      prompt('a', 'first'),
      prompt('b', 'use {{ids.ghost.output.value}}', ['a']),
    ]);
    expect(issues.some((i) =>
      i.rule === 'content.var.unknown' && i.severity === 'warning' && i.path.nodeId === 'b',
    )).toBe(true);
  });

  it('ignores {{ids.X.Y}} inside fenced code blocks', () => {
    const body = 'example:\n```\n{{ids.ghost.output.value}}\n```\nreal: {{ids.a.output.value}}';
    const issues = runContentRules([prompt('a', 'first'), prompt('b', body, ['a'])]);
    expect(issues.some((i) => i.rule === 'content.var.unknown')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun --filter='@archon-studio/core' test content
```

- [ ] **Step 3: Write `rules/content.ts`**

Create `packages/studio-core/src/validation/rules/content.ts`:

```ts
import type { DagNode } from '../../schemas';
import { parse } from '../../lib/grammar';
import { transitiveUpstream } from '../../components/when/transitiveUpstream';
import { type Issue, issueId, type Severity } from '../types';

export function runContentRules(nodes: readonly DagNode[]): Issue[] {
  const out: Issue[] = [];
  for (const node of nodes) {
    out.push(...whenRules(node));
    out.push(...varScanRules(node, nodes));
  }
  return out;
}

function whenRules(node: DagNode): Issue[] {
  const when = (node.base as { when?: string | null } | undefined)?.when;
  if (!when || typeof when !== 'string' || when.trim() === '') return [];
  const r = parse(when);
  if (r.ok) return [];
  return [mk('content.when.parse', 'error', { nodeId: node.id, field: 'when' }, `Invalid when: ${r.error}`)];
}

/** Strip fenced and inline code spans so example snippets don't trip the scan. */
function stripFences(s: string): string {
  return s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

const VAR_RE = /\{\{\s*ids\.([A-Za-z_][\w-]*)\.[^}]+\}\}/g;

function bodyText(node: DagNode): string {
  const base = (node.base ?? {}) as Record<string, unknown>;
  return Object.values(base)
    .filter((v): v is string => typeof v === 'string')
    .join('\n');
}

function varScanRules(node: DagNode, all: readonly DagNode[]): Issue[] {
  const text = stripFences(bodyText(node));
  if (!text.includes('{{')) return [];

  const upstream = new Set(transitiveUpstream(node.id, all));
  const out: Issue[] = [];
  const seen = new Set<string>();
  VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(text)) !== null) {
    const ref = m[1];
    if (upstream.has(ref) || ref === node.id) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(mk(
      'content.var.unknown',
      'warning',
      { nodeId: node.id, field: 'body' },
      `Reference to "${ref}" is not a transitive upstream node (or not declared in depends_on).`,
    ));
  }
  return out;
}

function mk(rule: string, severity: Severity, path: Issue['path'], message: string): Issue {
  return {
    id: issueId(rule, path, message),
    rule,
    severity,
    source: 'client-debounced',
    message,
    path,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun --filter='@archon-studio/core' test content
```
Expected: green, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/validation/rules/content.ts \
        packages/studio-core/tests/validation/content.spec.ts
git commit -m "feat(validation): content rules — when:/var scan"
```

---

### Task 6.4: Engine — tier orchestration, debounce, abort + sequence

**Files:**
- Create: `packages/studio-core/src/validation/engine.ts`
- Create: `packages/studio-core/tests/validation/engine.spec.ts`

The engine owns timing and tier composition. Tier isolation is the rule: a slow server response cannot clobber a fresh client run; a fresh client run does not erase the last server result until the new server pass returns. The sequence number is the safety net the AbortController can miss when a tab was backgrounded.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/validation/engine.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { ValidationEngine } from '../../src/validation/engine';
import type { DagNode } from '../../src/schemas';
import type { WorkflowApiClient } from '../../src/api/WorkflowApiClient';

const node = (id: string, over: Partial<DagNode> = {}): DagNode =>
  ({ id, type: 'prompt', base: { prompt: 'x' }, ...over }) as DagNode;

const stubClient = (
  impl: (def: unknown, signal?: AbortSignal) => Promise<{ valid: boolean; errors?: string[] }>,
): WorkflowApiClient =>
  ({ validateWorkflow: impl }) as unknown as WorkflowApiClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ValidationEngine', () => {
  let engine: ValidationEngine;
  beforeEach(() => {
    engine = new ValidationEngine({ debounceMs: 50 });
  });

  it('runs instant tier synchronously', () => {
    engine.update({ nodes: [node('')] });
    expect(engine.snapshot().issues.some((i) => i.rule === 'structural.id.empty')).toBe(true);
  });

  it('coalesces a burst of updates into one debounced run', async () => {
    let runs = 0;
    const e = new ValidationEngine({ debounceMs: 30, onDebouncedRun: () => runs++ });
    for (let i = 0; i < 10; i++) e.update({ nodes: [node('a', { depends_on: ['ghost'] })] });
    await sleep(80);
    expect(runs).toBe(1);
    expect(e.snapshot().issues.some((i) => i.rule === 'graph.ref.unknown')).toBe(true);
  });

  it('clears debounced issues when the workflow becomes clean', async () => {
    const e = new ValidationEngine({ debounceMs: 30 });
    e.update({ nodes: [node('a', { depends_on: ['ghost'] })] });
    await sleep(60);
    expect(e.snapshot().issues.some((i) => i.rule === 'graph.ref.unknown')).toBe(true);
    e.update({ nodes: [node('a')] });
    await sleep(60);
    expect(e.snapshot().issues.some((i) => i.rule === 'graph.ref.unknown')).toBe(false);
  });

  it('does not call server validate while client errors exist', async () => {
    let calls = 0;
    const client = stubClient(async () => { calls++; return { valid: true }; });
    const e = new ValidationEngine({ debounceMs: 20, client });
    e.update({ nodes: [node('')] });
    await sleep(80);
    expect(calls).toBe(0);
  });

  it('calls server validate after debounced settles with no client errors', async () => {
    let calls = 0;
    const client = stubClient(async () => { calls++; return { valid: false, errors: ['boom'] }; });
    const e = new ValidationEngine({ debounceMs: 20, client });
    e.update({ nodes: [node('a')], definition: { name: 'w', nodes: [] } as never });
    await sleep(80);
    expect(calls).toBe(1);
    expect(e.snapshot().issues.some((i) => i.rule.startsWith('server.'))).toBe(true);
  });

  it('drops stale server responses by sequence number', async () => {
    let idx = 0;
    const responses = [
      async () => { await sleep(60); return { valid: false, errors: ['stale'] }; },
      async () => { await sleep(5); return { valid: false, errors: ['fresh'] }; },
    ];
    const client = stubClient(() => responses[idx++]());
    const e = new ValidationEngine({ debounceMs: 10, client });
    e.update({ nodes: [node('a')], definition: { name: 'w' } as never });
    await sleep(25);
    e.update({ nodes: [node('a'), node('b')], definition: { name: 'w' } as never });
    await sleep(120);
    const msgs = e.snapshot().issues.filter((i) => i.source === 'server').map((i) => i.message);
    expect(msgs).toContain('fresh');
    expect(msgs).not.toContain('stale');
  });

  it('notifies subscribers on snapshot change', async () => {
    const seen: number[] = [];
    const e = new ValidationEngine({ debounceMs: 20 });
    const off = e.subscribe(() => seen.push(e.snapshot().issues.length));
    e.update({ nodes: [node('')] });
    await sleep(60);
    e.update({ nodes: [node('a')] });
    await sleep(60);
    off();
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun --filter='@archon-studio/core' test engine
```

- [ ] **Step 3: Write `engine.ts`**

Create `packages/studio-core/src/validation/engine.ts`:

```ts
import type { DagNode, WorkflowDefinition } from '../schemas';
import type { WorkflowApiClient } from '../api/WorkflowApiClient';
import { runStructuralRules } from './rules/structural';
import { runGraphRules } from './rules/graph';
import { runContentRules } from './rules/content';
import { type Issue, issueId } from './types';

export interface EngineSnapshot {
  issues: Issue[];
  isValidating: boolean;
  lastRunAt: number;
}

export interface EngineInput {
  nodes: readonly DagNode[];
  /** Full WorkflowDefinition required to run the server tier. If absent, server tier is skipped. */
  definition?: WorkflowDefinition;
}

export interface EngineOptions {
  debounceMs?: number;
  client?: Pick<WorkflowApiClient, 'validateWorkflow'>;
  /** Test hook: fires every time the debounced tier completes. */
  onDebouncedRun?: () => void;
}

type Listener = () => void;

/**
 * Three-tier engine. Tiers own disjoint slices of the issue list so a slow
 * server response cannot clobber a fresh client run.
 */
export class ValidationEngine {
  private debounceMs: number;
  private client?: Pick<WorkflowApiClient, 'validateWorkflow'>;
  private onDebouncedRun?: () => void;

  private input: EngineInput | null = null;
  private instantIssues: Issue[] = [];
  private debouncedIssues: Issue[] = [];
  private serverIssues: Issue[] = [];
  private isValidating = false;
  private lastRunAt = 0;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private inflightAbort: AbortController | null = null;

  private listeners = new Set<Listener>();

  constructor(opts: EngineOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 300;
    this.client = opts.client;
    this.onDebouncedRun = opts.onDebouncedRun;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): EngineSnapshot {
    return {
      issues: [...this.instantIssues, ...this.debouncedIssues, ...this.serverIssues],
      isValidating: this.isValidating,
      lastRunAt: this.lastRunAt,
    };
  }

  update(input: EngineInput): void {
    this.input = input;
    this.instantIssues = runStructuralRules(input.nodes);
    this.scheduleDebounced();
    this.notify();
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.inflightAbort?.abort();
    this.listeners.clear();
  }

  private scheduleDebounced(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.isValidating = true;
    this.debounceTimer = setTimeout(() => this.runDebounced(), this.debounceMs);
  }

  private runDebounced(): void {
    this.debounceTimer = null;
    if (!this.input) return;
    const { nodes } = this.input;
    this.debouncedIssues = [...runGraphRules(nodes), ...runContentRules(nodes)];
    this.onDebouncedRun?.();
    this.lastRunAt = Date.now();

    const hasClientErrors =
      this.instantIssues.some((i) => i.severity === 'error') ||
      this.debouncedIssues.some((i) => i.severity === 'error');

    if (this.client && this.input.definition && !hasClientErrors) {
      void this.runServer();
    } else {
      this.isValidating = false;
      if (hasClientErrors) this.serverIssues = []; // drop stale server claims
      this.notify();
    }
  }

  private async runServer(): Promise<void> {
    if (!this.client || !this.input?.definition) return;
    this.inflightAbort?.abort();
    const ac = new AbortController();
    this.inflightAbort = ac;
    const mySeq = ++this.seq;
    try {
      const res = await this.client.validateWorkflow(this.input.definition);
      if (mySeq !== this.seq) return; // superseded
      this.serverIssues = (res.errors ?? []).map((msg) => ({
        id: issueId('server.unknown', {}, msg),
        rule: 'server.unknown',
        severity: 'error',
        source: 'server',
        message: msg,
        path: {},
      }));
      this.lastRunAt = Date.now();
    } catch (e) {
      if (mySeq !== this.seq) return;
      this.serverIssues = [{
        id: issueId('server.error', {}, String(e)),
        rule: 'server.error',
        severity: 'error',
        source: 'server',
        message: `Server validation failed: ${e instanceof Error ? e.message : String(e)}`,
        path: {},
      }];
    } finally {
      if (mySeq === this.seq) {
        this.isValidating = false;
        this.notify();
      }
    }
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun --filter='@archon-studio/core' test engine
```
Expected: green, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/validation/engine.ts \
        packages/studio-core/tests/validation/engine.spec.ts
git commit -m "feat(validation): three-tier engine with debounce + sequence-guarded server"
```

---

### Task 6.5: `useValidation` React hook + `focusedIssue` store slice

**Files:**
- Create: `packages/studio-core/src/validation/useValidation.ts`
- Create: `packages/studio-core/tests/validation/useValidation.spec.tsx`
- Modify: `packages/studio-core/src/store/builder-store.ts`

One engine per WorkflowBuilder mount, subscribed via `useSyncExternalStore`. The store gains a small `focusedIssue` slice so the inspector can react to row clicks without importing `validation/types` (avoids a cycle).

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/validation/useValidation.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { render, act } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { useValidation } from '../../src/validation/useValidation';
import { useBuilderStore } from '../../src/store/builder-store';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});
beforeEach(() => useBuilderStore.getState().clearWorkflow());

function Probe({ onState }: { onState: (s: ReturnType<typeof useValidation>) => void }) {
  const state = useValidation();
  onState(state);
  return null;
}

describe('useValidation', () => {
  it('returns no issues on a clean store', () => {
    let last: ReturnType<typeof useValidation> | null = null;
    render(<Probe onState={(s) => (last = s)} />);
    expect(last!.issues).toEqual([]);
    expect(last!.hasErrors).toBe(false);
  });

  it('reports an instant issue when a node has an empty id', () => {
    let last: ReturnType<typeof useValidation> | null = null;
    act(() => {
      useBuilderStore.getState().loadWorkflow({
        meta: { name: 'w', description: '' },
        nodes: [{ id: '', type: 'prompt', base: { prompt: 'x' } } as never],
      });
    });
    render(<Probe onState={(s) => (last = s)} />);
    expect(last!.hasErrors).toBe(true);
    expect(last!.issues.some((i) => i.rule === 'structural.id.empty')).toBe(true);
  });

  it('focusIssue sets selectedNodeId and focusedIssue in the store', () => {
    let last: ReturnType<typeof useValidation> | null = null;
    act(() => {
      useBuilderStore.getState().loadWorkflow({
        meta: { name: 'w', description: '' },
        nodes: [{ id: 'a', type: 'prompt', base: { prompt: 'x' } } as never],
      });
    });
    render(<Probe onState={(s) => (last = s)} />);
    act(() => {
      last!.focusIssue({
        id: 'i_x', rule: 'structural.required.prompt', severity: 'error',
        source: 'client-instant', message: '', path: { nodeId: 'a', field: 'prompt' },
      });
    });
    expect(useBuilderStore.getState().selectedNodeId).toBe('a');
    expect(useBuilderStore.getState().focusedIssue?.field).toBe('prompt');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun --filter='@archon-studio/core' test useValidation
```

- [ ] **Step 3: Add `focusedIssue` slice to `builder-store.ts`**

In `BuilderState` interface (next to `selectedNodeId`):

```ts
focusedIssue: { nodeId?: string; field?: string; atomIndex?: number } | null;
setFocusedIssue: (path: { nodeId?: string; field?: string; atomIndex?: number } | null) => void;
```

In the initial state object:

```ts
focusedIssue: null,
setFocusedIssue: (path) => set({ focusedIssue: path }),
```

In `clearWorkflow`, also clear `focusedIssue: null`.

> Keep the slice's payload to `path` only — we don't want a circular import between the store and `validation/types`.

- [ ] **Step 4: Write `useValidation.ts`**

Create `packages/studio-core/src/validation/useValidation.ts`:

```ts
import { useEffect, useMemo, useRef, useSyncExternalStore, useCallback } from 'react';
import { useBuilderStore } from '../store/builder-store';
import { useApiClient } from '../api/ApiClientProvider';
import { ValidationEngine, type EngineSnapshot } from './engine';
import type { Issue } from './types';
import { toWorkflowDefinition } from '../exporter';

export interface UseValidationView {
  issues: Issue[];
  hasErrors: boolean;
  hasWarnings: boolean;
  isValidating: boolean;
  focusIssue(issue: Issue): void;
}

export function useValidation(): UseValidationView {
  const client = useApiClient();
  const engineRef = useRef<ValidationEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ValidationEngine({ debounceMs: 300, client });
  }
  const engine = engineRef.current;

  const snap: EngineSnapshot = useSyncExternalStore(
    useCallback((cb) => engine.subscribe(cb), [engine]),
    () => engine.snapshot(),
    () => engine.snapshot(),
  );

  const nodes = useBuilderStore((s) => s.nodes);
  const workflow = useBuilderStore((s) => s.workflow);

  useEffect(() => {
    const definition = workflow ? toWorkflowDefinition({ meta: workflow, nodes }) : undefined;
    engine.update({ nodes, definition });
  }, [engine, nodes, workflow]);

  useEffect(() => () => engine.dispose(), [engine]);

  const focusIssue = useCallback((issue: Issue) => {
    if (issue.path.nodeId) useBuilderStore.getState().setSelectedNodeId(issue.path.nodeId);
    useBuilderStore.getState().setFocusedIssue(issue.path);
  }, []);

  return useMemo(
    () => ({
      issues: snap.issues,
      hasErrors: snap.issues.some((i) => i.severity === 'error'),
      hasWarnings: snap.issues.some((i) => i.severity === 'warning'),
      isValidating: snap.isValidating,
      focusIssue,
    }),
    [snap, focusIssue],
  );
}
```

> **Drift caveat:** (a) `useApiClient` is the assumed export from `ApiClientProvider`. (b) `toWorkflowDefinition` is the assumed serializer in `exporter/`. If either name differs, update imports and note the deviation.

- [ ] **Step 5: Run tests — expect PASS**

```bash
bun --filter='@archon-studio/core' test useValidation
```
Expected: green, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/validation/useValidation.ts \
        packages/studio-core/src/store/builder-store.ts \
        packages/studio-core/tests/validation/useValidation.spec.tsx
git commit -m "feat(validation): useValidation hook + focusedIssue store slice"
```

---

### Task 6.6: Add drawer row to `WorkflowBuilder` grid

**Files:**
- Modify: `packages/studio-core/src/components/WorkflowBuilder.module.css`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx`
- Modify: `packages/studio-core/tests/components/WorkflowBuilder.spec.tsx`

The master plan reserved a bottom drawer row, but the CSS still has only two rows. This task widens the grid; Task 6.7 mounts the panel into it.

- [ ] **Step 1: Add a failing structural test**

Add to `WorkflowBuilder.spec.tsx`:

```ts
it('renders a bottom drawer slot', () => {
  // use existing render helper / props
  const { container } = render(<WorkflowBuilder {...props} />);
  expect(container.querySelector('[data-testid="validation-drawer"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun --filter='@archon-studio/core' test WorkflowBuilder
```

- [ ] **Step 3: Extend the grid CSS**

Update `WorkflowBuilder.module.css`:

```css
.shell {
  display: grid;
  grid-template-rows: 56px 1fr var(--studio-drawer-h, 36px);
  grid-template-columns: 240px 1fr 320px;
  grid-template-areas:
    'toolbar  toolbar  toolbar'
    'library  canvas   inspector'
    'drawer   drawer   drawer';
  /* unchanged below */
}
.drawer {
  grid-area: drawer;
  border-top: 1px solid var(--studio-muted);
  min-height: 0;
  overflow: hidden;
  background: var(--studio-surface);
}
.shell[data-drawer='expanded'] {
  --studio-drawer-h: 240px;
}
```

- [ ] **Step 4: Mount the slot in `WorkflowBuilder.tsx`**

Add `<section className={styles.drawer} data-testid="validation-drawer" />` inside the shell. Add a `data-drawer` attribute on the shell driven by local state (`'collapsed'` initially). Task 6.7 mounts the panel here and flips the attribute via the toggle callback.

- [ ] **Step 5: Run — expect PASS**

```bash
bun --filter='@archon-studio/core' test WorkflowBuilder
```

- [ ] **Step 6: Commit**

```bash
git add packages/studio-core/src/components/WorkflowBuilder.module.css \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/tests/components/WorkflowBuilder.spec.tsx
git commit -m "feat(layout): add bottom drawer row to WorkflowBuilder grid"
```

---

### Task 6.7: `ValidationPanel` UI

**Files:**
- Create: `packages/studio-core/src/components/ValidationPanel.tsx`
- Create: `packages/studio-core/src/components/ValidationPanel.module.css`
- Create: `packages/studio-core/tests/components/ValidationPanel.spec.tsx`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx`

Collapsed: 36px bar with severity pills (`● 3 errors • 2 warnings`). Click bar to expand. Expanded: filter chips + grouped list with click-to-focus.

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-core/tests/components/ValidationPanel.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { ValidationPanel } from '../../src/components/ValidationPanel';
import type { Issue } from '../../src/validation/types';

beforeAll(() => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register(); });

const mkIssue = (over: Partial<Issue> = {}): Issue => ({
  id: 'i', rule: 'r', severity: 'error', source: 'client-instant',
  message: 'oops', path: {}, ...over,
});

describe('ValidationPanel', () => {
  it('renders the collapsed pill summary with severity counts', () => {
    render(
      <ValidationPanel
        issues={[mkIssue({ id: '1' }), mkIssue({ id: '2', severity: 'warning' })]}
        expanded={false}
        onToggle={() => {}}
        onFocusIssue={() => {}}
      />,
    );
    expect(screen.getByText(/1 error/i)).toBeTruthy();
    expect(screen.getByText(/1 warning/i)).toBeTruthy();
  });

  it('reports the new expanded state when the bar is clicked', () => {
    let toggled: boolean | null = null;
    render(
      <ValidationPanel
        issues={[mkIssue()]}
        expanded={false}
        onToggle={(n) => (toggled = n)}
        onFocusIssue={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /expand validation panel/i }));
    expect(toggled).toBe(true);
  });

  it('dispatches focusIssue on row click', () => {
    let focused: string | undefined;
    render(
      <ValidationPanel
        issues={[mkIssue({ message: 'oops', path: { nodeId: 'a' } })]}
        expanded={true}
        onToggle={() => {}}
        onFocusIssue={(i) => (focused = i.path.nodeId)}
      />,
    );
    fireEvent.click(screen.getByText(/oops/));
    expect(focused).toBe('a');
  });

  it('filters by severity when a chip is active', () => {
    render(
      <ValidationPanel
        issues={[
          mkIssue({ id: '1', message: 'big' }),
          mkIssue({ id: '2', severity: 'warning', message: 'small' }),
        ]}
        expanded={true}
        onToggle={() => {}}
        onFocusIssue={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /errors only/i }));
    expect(screen.queryByText('small')).toBeNull();
    expect(screen.queryByText('big')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `ValidationPanel.tsx`**

Create `packages/studio-core/src/components/ValidationPanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { Issue, Severity } from '../validation/types';
import styles from './ValidationPanel.module.css';

export interface ValidationPanelProps {
  issues: readonly Issue[];
  expanded: boolean;
  onToggle: (next: boolean) => void;
  onFocusIssue: (issue: Issue) => void;
  isValidating?: boolean;
}

type SeverityFilter = 'all' | Severity;
type SourceFilter = 'all' | 'client' | 'server';

export function ValidationPanel({
  issues, expanded, onToggle, onFocusIssue, isValidating,
}: ValidationPanelProps) {
  const [sev, setSev] = useState<SeverityFilter>('all');
  const [src, setSrc] = useState<SourceFilter>('all');

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const i of issues) c[i.severity] += 1;
    return c;
  }, [issues]);

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (sev !== 'all' && i.severity !== sev) return false;
      if (src === 'client' && i.source === 'server') return false;
      if (src === 'server' && i.source !== 'server') return false;
      return true;
    });
  }, [issues, sev, src]);

  return (
    <div className={styles.root} aria-live="polite">
      <button
        type="button"
        className={styles.bar}
        onClick={() => onToggle(!expanded)}
        aria-label={expanded ? 'collapse validation panel' : 'expand validation panel'}
      >
        <Pill severity="error" count={counts.error} />
        <Pill severity="warning" count={counts.warning} />
        <Pill severity="info" count={counts.info} />
        {isValidating ? <span className={styles.spinner} aria-hidden /> : null}
        <span className={styles.chev}>{expanded ? '▾' : '▴'}</span>
      </button>
      {expanded ? (
        <div className={styles.body}>
          <div className={styles.filters}>
            <Chip active={sev === 'all'} onClick={() => setSev('all')}>All</Chip>
            <Chip active={sev === 'error'} onClick={() => setSev('error')}>Errors only</Chip>
            <Chip active={sev === 'warning'} onClick={() => setSev('warning')}>Warnings</Chip>
            <Chip active={sev === 'info'} onClick={() => setSev('info')}>Info</Chip>
            <span className={styles.spacer} />
            <Chip active={src === 'all'} onClick={() => setSrc('all')}>Any source</Chip>
            <Chip active={src === 'client'} onClick={() => setSrc('client')}>Client</Chip>
            <Chip active={src === 'server'} onClick={() => setSrc('server')}>Server</Chip>
          </div>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No issues match the current filter.</div>
          ) : (
            <ul className={styles.list}>
              {filtered.map((i) => (
                <li key={i.id} className={styles[`row_${i.severity}`]}>
                  <button type="button" className={styles.row} onClick={() => onFocusIssue(i)}>
                    <span className={styles.sev}>{i.severity}</span>
                    <span className={styles.rule}>{i.rule}</span>
                    <span className={styles.msg}>{i.message}</span>
                    {i.path.nodeId ? (
                      <span className={styles.target}>
                        → {i.path.nodeId}
                        {i.path.field ? `.${i.path.field}` : ''}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ severity, count }: { severity: Severity; count: number }) {
  if (count === 0) return null;
  const label = `${count} ${severity}${count === 1 ? '' : 's'}`;
  return <span className={`${styles.pill} ${styles[`pill_${severity}`]}`}>● {label}</span>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.chip} ${active ? styles.chip_active : ''}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Write `ValidationPanel.module.css`**

Use studio CSS tokens (`--studio-surface`, `--studio-muted`, `--studio-fg`, and red/yellow/blue analogues for severity pills). Keep the file under ~80 lines; mirror NodeLibrary's pattern. The collapsed bar is `height: 36px`; the body lays out filters in a row above a scrollable list.

- [ ] **Step 5: Mount the panel in `WorkflowBuilder.tsx`**

Replace the empty drawer slot with:

```tsx
const { issues, hasErrors, hasWarnings, isValidating, focusIssue } = useValidation();
const [drawerExpanded, setDrawerExpanded] = useState(false);
// ...
<div className={styles.shell} data-drawer={drawerExpanded ? 'expanded' : 'collapsed'}>
  {/* ... other slots ... */}
  <section className={styles.drawer} data-testid="validation-drawer">
    <ValidationPanel
      issues={issues}
      expanded={drawerExpanded}
      onToggle={setDrawerExpanded}
      onFocusIssue={focusIssue}
      isValidating={isValidating}
    />
  </section>
</div>
```

- [ ] **Step 6: Run — expect PASS**

```bash
bun --filter='@archon-studio/core' test ValidationPanel
```
Expected: 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/components/ValidationPanel.tsx \
        packages/studio-core/src/components/ValidationPanel.module.css \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/tests/components/ValidationPanel.spec.tsx
git commit -m "feat(validation): ValidationPanel UI mounted in drawer slot"
```

---

### Task 6.8: Inspector focus reaction + Toolbar Save gate

**Files:**
- Modify: the inspector composition file (look up via `grep "selectedNodeId" packages/studio-core/src/components/inspector/`)
- Modify: `packages/studio-core/src/components/Toolbar.tsx`
- Modify: `packages/studio-core/src/components/WorkflowBuilder.tsx`
- Create: `packages/studio-core/tests/components/Toolbar.spec.tsx`

Inspector subscribes to `focusedIssue`. When set, it switches to the appropriate tab (general for `when`/atomIndex, body for `prompt`/`script`/`body`), scrolls the field into view, and applies a brief flash highlight. Toolbar gains a Save button gated on `hasErrors` with a tooltip listing the top 3 error messages.

- [ ] **Step 1: Find the inspector composition file**

```bash
grep -rln "selectedNodeId" packages/studio-core/src/components/inspector/
```
Use the file that already reads `selectedNodeId` as the place to add the focus reaction effect.

- [ ] **Step 2: Wire the focus reaction**

Inside that inspector component:

```tsx
const focused = useBuilderStore((s) => s.focusedIssue);
useEffect(() => {
  if (!focused) return;
  if (focused.field === 'when' || focused.atomIndex !== undefined) {
    setActiveTab('general');
  } else if (focused.field === 'prompt' || focused.field === 'script' || focused.field === 'body') {
    setActiveTab('body');
  }
  // Wait for the tab to mount, then scroll + flash.
  const t = setTimeout(() => {
    const el = document.querySelector(`[data-field="${focused.field}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.classList.add('flash');
    setTimeout(() => el?.classList.remove('flash'), 1200);
  }, 0);
  return () => clearTimeout(t);
}, [focused]);
```

Add `.flash { outline: 2px solid var(--studio-warn, gold); transition: outline-color 1s ease; }` to a shared CSS file.

> **Drift caveat:** Tab names (`general`, `body`) and the `setActiveTab` API depend on the existing inspector. Verify and rename to match.

- [ ] **Step 3: Add `data-field` markers**

Where each tab renders editable surfaces, add `data-field="when"`, `data-field="prompt"`, `data-field="script"`, `data-field="body"`. This is what the focus reaction queries. If the elements already have stable selectors, use those instead and update the focus effect.

- [ ] **Step 4: Tests for Toolbar Save gate**

Create `packages/studio-core/tests/components/Toolbar.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { Toolbar } from '../../src/components/Toolbar';

beforeAll(() => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register(); });

describe('Toolbar Save button', () => {
  it('disables Save when hasErrors is true', () => {
    render(<Toolbar workflowName="w" onResetLayout={() => {}} hasErrors={true} onSave={() => {}} topErrors={['empty id']} />);
    const btn = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toContain('empty id');
  });

  it('enables Save when only warnings remain', () => {
    render(<Toolbar workflowName="w" onResetLayout={() => {}} hasErrors={false} onSave={() => {}} topErrors={[]} />);
    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('invokes onSave when clicked', () => {
    let saved = false;
    render(<Toolbar workflowName="w" onResetLayout={() => {}} hasErrors={false} onSave={() => (saved = true)} topErrors={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(saved).toBe(true);
  });

  it('omits the Save button when onSave is undefined', () => {
    render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});
```

- [ ] **Step 5: Extend `Toolbar.tsx`**

```tsx
export interface ToolbarProps {
  workflowName: string;
  onResetLayout: () => void;
  onSave?: () => void;
  hasErrors?: boolean;
  topErrors?: readonly string[];
}

export function Toolbar({ workflowName, onResetLayout, onSave, hasErrors, topErrors = [] }: ToolbarProps) {
  return (
    <header /* unchanged styling */>
      <strong style={{ flex: 1 }}>{workflowName}</strong>
      <button type="button" onClick={onResetLayout} /* unchanged */>Reset layout</button>
      {onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={!!hasErrors}
          title={hasErrors ? topErrors.slice(0, 3).join('\n') : undefined}
          style={{ /* same as Reset */ }}
        >
          Save
        </button>
      ) : null}
    </header>
  );
}
```

- [ ] **Step 6: Wire from `WorkflowBuilder.tsx`**

```tsx
const topErrors = useMemo(
  () => issues.filter((i) => i.severity === 'error').slice(0, 3).map((i) => i.message),
  [issues],
);
// pass onSave (caller-injected; standalone provides a noop for now), hasErrors, topErrors
```

- [ ] **Step 7: Run — expect PASS**

```bash
bun --filter='@archon-studio/core' test
```

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/src/components/inspector \
        packages/studio-core/src/components/Toolbar.tsx \
        packages/studio-core/src/components/WorkflowBuilder.tsx \
        packages/studio-core/tests/components/Toolbar.spec.tsx
git commit -m "feat(validation): inspector focus reaction + Toolbar Save gate"
```

---

### Task 6.9: End-to-end integration test — cycle blocks save, fix unblocks

**Files:**
- Create: `packages/studio-core/tests/integration/validation-flow.spec.tsx`

Anchors the whole pipeline.

- [ ] **Step 1: Write the integration test**

```tsx
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { render, screen, act, waitFor } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { WorkflowBuilder } from '../../src/components/WorkflowBuilder';
import { useBuilderStore } from '../../src/store/builder-store';
import { StubArchonApiClient } from '@archon-studio/api-archon';

beforeAll(() => { if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register(); });
beforeEach(() => useBuilderStore.getState().clearWorkflow());

describe('validation flow integration', () => {
  it('cycle blocks save; fixing the cycle unblocks it', async () => {
    const client = new StubArchonApiClient();
    render(
      <WorkflowBuilder
        client={client}
        theme="archon-dark"
        workflowName="w"
        archonUrl=""
        cwd=""
        onSave={() => {}}
      />,
    );

    act(() => {
      useBuilderStore.getState().loadWorkflow({
        meta: { name: 'w', description: '' },
        nodes: [
          { id: 'a', type: 'prompt', base: { prompt: 'x' }, depends_on: ['b'] } as never,
          { id: 'b', type: 'prompt', base: { prompt: 'x' }, depends_on: ['a'] } as never,
        ],
      });
    });

    await waitFor(() => expect(screen.getByText(/cycle/i)).toBeTruthy(), { timeout: 1000 });
    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true);

    act(() => {
      useBuilderStore.setState((s) => ({
        nodes: s.nodes.map((n) => (n.id === 'b' ? { ...n, depends_on: [] } : n)),
      }));
    });

    await waitFor(
      () => expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(false),
      { timeout: 1000 },
    );
  });
});
```

> **Drift caveat:** `WorkflowBuilder`'s prop names (`client`, `theme`, `workflowName`, `archonUrl`, `cwd`) come from the Phase 2 plan. Verify against the file before the test will compile; align prop names if they've drifted.

- [ ] **Step 2: Run — expect PASS (iterate any wiring gaps)**

```bash
bun --filter='@archon-studio/core' test validation-flow
```

- [ ] **Step 3: Commit**

```bash
git add packages/studio-core/tests/integration/validation-flow.spec.tsx
git commit -m "test(validation): integration — cycle blocks save, fix unblocks"
```

---

### Task 6.10: Manual smoke + verify + tag

**Files:**
- None (verification).

- [ ] **Step 1: Run the full suite**

```bash
bun --filter='*' run test
bun --filter='*' run build
bun run lint
bun run format:check
bun run check-schema-drift
bun run check-when-grammar-drift
```
Expected: green, ~370 tests.

- [ ] **Step 2: Manual smoke (standalone)**

```bash
bun --filter='@archon-studio/standalone' run dev
```

Walk:
1. Smoke fixture loads — panel shows zero issues, Save enabled.
2. Empty a node id → instant error appears, Save disabled with tooltip listing the error.
3. Restore id; set `depends_on: ['ghost']` via the JSON tab → 300ms later, ref error.
4. Type a garbage `when:` value → 300ms later, `content.when.parse` error.
5. Click a panel row → canvas selects the node, inspector switches to the right tab, target field flashes.

Fix any misbehavior before tagging.

- [ ] **Step 3: Update phase status memory**

Write `C:\Users\seanr\.claude\projects\E--Projects-Archon-Workflow-Studio\memory\phase-6-complete.md` mirroring the Phase 5 entry (test count, key files, drift notes if any). Add the index line to `MEMORY.md`.

- [ ] **Step 4: If drift was recorded, write `docs/superpowers/plans/phase-6-drift-notes.md`**

Mirror the Phase 5 drift file pattern. Each entry: section, deviation, why, what was done.

- [ ] **Step 5: Tag and push**

```bash
git tag -a phase-6 -m "Phase 6 — validation pipeline + ValidationPanel"
git push origin phase-5
git push origin phase-6
```

> If you have been working on a `phase-6` branch instead of `phase-5`, push that branch.

---

## Summary

This plan delivers:

- A pure, tier-segmented validation engine (`validation/engine.ts`) with debounce + sequence-guarded server tier.
- Eight rule predicates across three modules (`rules/structural.ts`, `rules/graph.ts`, `rules/content.ts`), reusing Phase 5's `lib/grammar.ts` and `transitiveUpstream`.
- A React hook (`useValidation`) that subscribes to `builder-store`, exposes a stable view, and dispatches focus intents through a new `focusedIssue` store slice.
- A bottom-drawer `ValidationPanel` with collapsed/expanded states, severity/source filters, and click-to-focus.
- A Save gate on the Toolbar driven by `hasErrors`, with a tooltip listing the top 3 errors.
- An integration test anchoring the load-cycle-fix-save flow.

Deferred to Phase 9 per the design doc's scope cut: offline yellow state, queued saves, Resolve-resources button.
