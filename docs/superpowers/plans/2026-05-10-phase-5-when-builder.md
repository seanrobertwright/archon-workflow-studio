# Phase 5 — Visual `when:` Builder + Autocomplete: Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `when:` textarea in `GeneralTab` with a DNF-shaped visual builder, add `$nodeId.output.field` autocomplete inside body textareas, and lock the studio's grammar to Archon's evaluator at the pinned SHA.

**Architecture:** A pure `lib/grammar.ts` (parse / format / toDnf) is the load-bearing primitive. A new `WhenSection` owns the visual/raw mode toggle and renders either `WhenBuilder` (DNF visual) or a CodeMirror-backed raw editor. CodeMirror 6 with the autocomplete extension replaces native `<textarea>` only on body fields where `$nodeId.output[.field]` references appear. A drift CI script keeps `lib/grammar.ts` aligned with Archon's evaluator.

**Tech Stack:** TypeScript + React 19 (existing); Zustand (existing); CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/autocomplete` — added); `@testing-library/react` + `bun:test` (existing).

**Reference design doc:** `docs/superpowers/specs/2026-05-10-phase-5-when-builder-design.md`.

**Reference skills:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`.

**Drift discipline:** Phase 4 taught us that plan claims drift from codebase reality. Every task here begins by *checking* against the actual files; if the codebase deviates from what this plan describes, the deviation is recorded inline (mirror the Phase 4 cheat sheet pattern at `docs/superpowers/plans/phase-4-drift-notes.md`) and the task adapts before continuing.

---

## Chunk 1: Phase 5 — visual `when:` builder + autocomplete

### Task 5.0: Phase-4 reality check (read-only verification)

**Files:**
- None (verification only).

Mirrors the Task 52.5 / Task 41.5 reality checks. Confirm Phase 4's load-bearing surfaces still match what Phase 5 plans to extend.

- [ ] **Step 1: Confirm `GeneralTab.tsx` still renders the raw `when:` textarea**

```bash
grep -n 'when' packages/studio-core/src/nodes/shared/GeneralTab.tsx
```
Expected: `Field` with `label="When (raw)"` and a `<textarea>` writing `{ when: e.target.value || null }`. If the field has been renamed or the empty-string-to-null collapse removed, Task 5.5 must adapt.

- [ ] **Step 2: Confirm `renameNode` regex over `when:` strings is still in place**

```bash
grep -n 'when' packages/studio-core/src/store/builder-store.ts
```
Expected: a regex replacing `$<oldId>` with `$<newId>` inside `next.base.when`. Phase 5 does **not** replace this — `lib/grammar.ts` only adds parse/format paths. If the regex has already been swapped for AST rewrite, this task's "deferred" entry in the design doc is moot — note and continue.

- [ ] **Step 3: Confirm body textareas exist in the variant Inspectors that Phase 5 upgrades**

```bash
for v in prompt bash script loop approval; do
  echo "=== $v ==="
  grep -n '<textarea' packages/studio-core/src/nodes/$v/Inspector.tsx
done
```
Expected: each variant's `Inspector.tsx` renders at least one `<textarea>` for the body field. (`command` and `cancel` may have no body textarea — that's fine, they're not in the migration set.) If any expected variant lacks a body textarea, the migration list in Task 5.6 must be revised inline.

- [ ] **Step 4: Confirm the inspector primitives barrel exists**

```bash
cat packages/studio-core/src/components/inspector/shared/index.ts
```
Expected: re-exports for `Field`, `RenameField`, `DependsOnEditor`, `JsonField`. Phase 5 adds `CmEditor` to this barrel.

- [ ] **Step 5: Confirm `output_format` field on the schema is `z.record(z.unknown()).optional()`**

```bash
grep -n 'output_format' packages/studio-core/src/schemas/dag-node.ts
```
Expected: `output_format: z.record(z.unknown()).optional()`. Phase 5's autocomplete reads this field; if the shape has tightened to a JSON-Schema-typed field, the lookup helper in Task 5.4 should adapt.

- [ ] **Step 6: Run the green baseline**

```bash
bun --filter='*' run test
bun --filter='*' run build
bun run lint
bun run format:check
bun run check-schema-drift
```
Expected: all green at the post-Phase-4 baseline (267/267 tests). Phase 5 starts from green or not at all.

- [ ] **Step 7: Record reality-check findings**

If anything in Steps 1–5 deviated, write the deviation into a short reality-check note at the top of the next task you start. (No commit yet — read-only.)

---

### Task 5.1: Document Archon's `when:` evaluator at the pinned SHA

**Files:**
- Create: `packages/studio-core/src/lib/grammar.archon.md`

Phase 5's grammar is mirrored from Archon's evaluator, not invented. Before writing any parser code, fetch the upstream source at the pinned SHA, document the operator and value-type set observed, and commit the documentation. This is the contract the parser implements; it is also what the drift CI script (Task 5.7) will re-fetch to detect upstream changes.

The pinned SHA lives at `.archon-source-pin` and as of 2026-05-10 is `fd6d75e76218da8a5804bed5c1548de769c4c658`.

- [ ] **Step 1: Locate Archon's `when:` evaluator**

```bash
PIN=$(cat .archon-source-pin)
curl -s "https://api.github.com/repos/coleam00/Archon/git/trees/${PIN}?recursive=1" \
  | grep -E 'when|condition|evaluat' | head -20
```
Expected: a path like `packages/workflows/src/when_evaluator.py`, `packages/workflows/src/conditions.py`, or similar. If no obvious match, search the YAML schema for the `when:` field's evaluator reference, then trace its imports.

- [ ] **Step 2: Fetch the evaluator source**

```bash
PIN=$(cat .archon-source-pin)
curl -sL "https://raw.githubusercontent.com/coleam00/Archon/${PIN}/<EVALUATOR_PATH>" \
  > /tmp/archon-when-evaluator.py
cat /tmp/archon-when-evaluator.py
```
Replace `<EVALUATOR_PATH>` with the path discovered in Step 1.

- [ ] **Step 3: Read the file and extract the grammar**

Identify and document:
- The complete operator set (e.g., `==`, `!=`, `<`, `>`, `<=`, `>=`, `in`, `not in`, `contains`).
- The logical-connective set (`&&` vs `and`, `||` vs `or`, parens supported?).
- Value types accepted (string literals — single vs double quotes; numeric; boolean; lists?).
- Reference shape (`$nodeId.output[.field][.subfield]…` — depth limit?).
- Any built-in functions or special tokens.
- Empty-string semantics (does empty `when:` short-circuit to true?).

If the evaluator uses dynamic Python expression evaluation over a sandboxed namespace, document **what's in the namespace** (likely a dict mapping `node_id` to its output object).

- [ ] **Step 4: Write `grammar.archon.md`**

Create `packages/studio-core/src/lib/grammar.archon.md`:

````markdown
# Archon `when:` evaluator — grammar mirror

**Source:** `https://github.com/coleam00/Archon/blob/<PIN>/<EVALUATOR_PATH>`
**Pinned SHA:** `<PIN>` (matches `.archon-source-pin`)
**Last verified:** YYYY-MM-DD

This document is the canonical grammar contract that `packages/studio-core/src/lib/grammar.ts` implements. The drift CI in `scripts/check-when-grammar-drift.ts` re-fetches the upstream source and fails if the operator set, connective set, or value types diverge from what is documented here.

## Operators

| Operator | Studio v1 supports | Notes |
|----------|--------------------|-------|
| `==`     | yes                | … |
| `!=`     | yes                | … |
| <fill in from upstream> | … | … |

## Logical connectives

| Connective | Studio v1 supports | Notes |
|------------|--------------------|-------|
| `&&`       | yes                | … |
| `||`       | yes                | … |
| `(` `)`    | parser-yes / visual-no | parens parse but visual builder requires DNF; non-DNF then raw fallback |

## Value types

…

## Reference shape

```
$nodeId(.field)*
```
Depth limit (if any): …

## Empty / null semantics

…

## Notes for studio implementers

- v1 visual builder restricts to DNF (OR-of-ANDs). Non-DNF expressions parse fine and are editable in raw mode.
- Atom row dropdown only exposes ops in this document's "Studio v1 supports = yes" column.
- Any operator marked "no" is round-tripped untouched in raw mode but rejected from the visual atom row.
````

Fill in every section from the Step-3 reading. Do **not** invent operators not present in upstream.

- [ ] **Step 5: Commit**

```bash
git add packages/studio-core/src/lib/grammar.archon.md
git commit -m "docs(grammar): mirror Archon when: evaluator grammar at pinned SHA"
```

---

### Task 5.2: `lib/grammar.ts` — parse / format / toDnf

**Files:**
- Create: `packages/studio-core/src/lib/grammar.ts`
- Test: `packages/studio-core/tests/lib/grammar.spec.ts`

The pure load-bearing primitive. No React imports. Hand-rolled recursive-descent parser per the design doc reasoning. AST shape per design doc Section 3.

- [ ] **Step 1: Write failing tests for `parse` (happy path)**

Create `packages/studio-core/tests/lib/grammar.spec.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { parse } from '../../src/lib/grammar';

describe('parse', () => {
  it('parses a single equality atom', () => {
    const r = parse("$classify.output.issue_type == 'bug'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toEqual({
      kind: 'and',
      children: [
        {
          kind: 'atom',
          ref: { nodeId: 'classify', path: ['output', 'issue_type'] },
          op: '==',
          value: 'bug',
        },
      ],
    });
  });

  it('parses && joining two atoms', () => {
    const r = parse("$a.output == 'x' && $b.output == 'y'");
    expect(r.ok).toBe(true);
  });

  it('parses || joining two atoms', () => {
    const r = parse("$a.output == 'x' || $b.output == 'y'");
    expect(r.ok).toBe(true);
  });

  it('parses mixed && and || left-to-right (|| has lower precedence)', () => {
    const r = parse("$a.output == 'x' && $b.output == 'y' || $c.output == 'z'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Expect: or( and(a,b), and(c) )
    expect(r.ast.kind).toBe('or');
  });

  it('parses != ', () => {
    const r = parse("$a.output.k != 'v'");
    expect(r.ok).toBe(true);
  });

  it('returns Err on truly empty input', () => {
    const r = parse('');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests; verify they fail**

```bash
bun test packages/studio-core/tests/lib/grammar.spec.ts
```
Expected: all fail with "parse not defined" or similar import error.

- [ ] **Step 3: Implement `parse` (minimal recursive-descent)**

Create `packages/studio-core/src/lib/grammar.ts`:

```ts
/**
 * Pure parser/formatter for Archon's `when:` expression grammar.
 *
 * Mirror of Archon's evaluator at the SHA in `.archon-source-pin`. The
 * authoritative grammar reference is `grammar.archon.md` in this directory.
 * Drift CI (`scripts/check-when-grammar-drift.ts`) keeps this module aligned.
 *
 * No React imports — this module is consumed by store, validation pipeline
 * (Phase 6), and Inspector UI alike.
 */

export type AtomNode = {
  kind: 'atom';
  ref: { nodeId: string; path: string[] };
  op: '==' | '!=';
  value: string | number | boolean;
};

export type WhenAst =
  | { kind: 'or'; children: WhenAst[] }
  | { kind: 'and'; children: WhenAst[] }
  | AtomNode;

export type DnfAst = {
  kind: 'or';
  children: { kind: 'and'; children: AtomNode[] }[];
};

export type ParseResult =
  | { ok: true; ast: WhenAst }
  | { ok: false; error: string; offset: number };

export function parse(input: string): ParseResult {
  const p = new Parser(input);
  try {
    const ast = p.parseExpr();
    p.expectEof();
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, error: (e as Error).message, offset: p.pos };
  }
}

class Parser {
  pos = 0;
  constructor(public src: string) {}

  parseExpr(): WhenAst {
    const left = this.parseAndExpr();
    const rest: WhenAst[] = [];
    while (this.peek('||')) {
      this.consume('||');
      rest.push(this.parseAndExpr());
    }
    if (rest.length === 0) return left;
    return { kind: 'or', children: [left, ...rest] };
  }

  parseAndExpr(): WhenAst {
    const left = this.parseAtom();
    const rest: WhenAst[] = [];
    while (this.peek('&&')) {
      this.consume('&&');
      rest.push(this.parseAtom());
    }
    if (rest.length === 0) return { kind: 'and', children: [left] };
    return { kind: 'and', children: [left, ...rest] };
  }

  parseAtom(): WhenAst {
    this.skipWs();
    if (this.peek('(')) {
      this.consume('(');
      const inner = this.parseExpr();
      this.expect(')');
      return inner;
    }
    const ref = this.parseRef();
    this.skipWs();
    const op = this.parseOp();
    this.skipWs();
    const value = this.parseValue();
    return { kind: 'atom', ref, op, value };
  }

  parseRef(): { nodeId: string; path: string[] } {
    this.skipWs();
    this.expect('$');
    const nodeId = this.consumeWhile(/[A-Za-z0-9_-]/);
    if (!nodeId) throw new Error('expected node id after $');
    const path: string[] = [];
    while (this.peek('.')) {
      this.consume('.');
      const seg = this.consumeWhile(/[A-Za-z0-9_]/);
      if (!seg) throw new Error('expected field name after .');
      path.push(seg);
    }
    return { nodeId, path };
  }

  parseOp(): '==' | '!=' {
    if (this.peek('==')) {
      this.consume('==');
      return '==';
    }
    if (this.peek('!=')) {
      this.consume('!=');
      return '!=';
    }
    throw new Error(`expected operator (== or !=) at ${this.pos}`);
  }

  parseValue(): string | number | boolean {
    this.skipWs();
    if (this.peek("'")) return this.parseStringLit();
    if (this.peek('true')) {
      this.consume('true');
      return true;
    }
    if (this.peek('false')) {
      this.consume('false');
      return false;
    }
    const num = this.consumeWhile(/[0-9.\-]/);
    if (num) {
      const n = Number(num);
      if (Number.isFinite(n)) return n;
    }
    throw new Error(`expected value at ${this.pos}`);
  }

  parseStringLit(): string {
    this.expect("'");
    let out = '';
    while (this.pos < this.src.length && this.src[this.pos] !== "'") {
      if (this.src[this.pos] === '\\' && this.pos + 1 < this.src.length) {
        out += this.src[this.pos + 1];
        this.pos += 2;
      } else {
        out += this.src[this.pos++];
      }
    }
    this.expect("'");
    return out;
  }

  // ---------- low-level ----------

  skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++;
  }

  peek(s: string): boolean {
    this.skipWs();
    return this.src.startsWith(s, this.pos);
  }

  consume(s: string): void {
    if (!this.peek(s)) throw new Error(`expected "${s}" at ${this.pos}`);
    this.pos += s.length;
  }

  expect(s: string): void {
    this.consume(s);
  }

  consumeWhile(re: RegExp): string {
    let out = '';
    while (this.pos < this.src.length && re.test(this.src[this.pos]!)) out += this.src[this.pos++];
    return out;
  }

  expectEof(): void {
    this.skipWs();
    if (this.pos < this.src.length) {
      throw new Error(`unexpected trailing input at ${this.pos}: ${JSON.stringify(this.src.slice(this.pos))}`);
    }
  }
}
```

- [ ] **Step 4: Run tests; verify happy-path passes**

```bash
bun test packages/studio-core/tests/lib/grammar.spec.ts
```
Expected: all 6 tests pass.

- [ ] **Step 5: Add tests for `format` (round-trip)**

Append to the spec:

```ts
import { format } from '../../src/lib/grammar';

describe('format', () => {
  it('round-trips a simple atom', () => {
    const src = "$classify.output.issue_type == 'bug'";
    const r = parse(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(format(r.ast)).toBe(src);
  });

  it('round-trips an && expression', () => {
    const src = "$a.output == 'x' && $b.output == 'y'";
    const r = parse(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(format(r.ast)).toBe(src);
  });

  it('round-trips a || expression', () => {
    const src = "$a.output == 'x' || $b.output == 'y'";
    const r = parse(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(format(r.ast)).toBe(src);
  });

  it('round-trips numbers and booleans', () => {
    expect(format(parseOk("$a.output.n == 5")).replace(/\s+/g, ' ')).toBe("$a.output.n == 5");
    expect(format(parseOk("$a.output.b == true")).replace(/\s+/g, ' ')).toBe("$a.output.b == true");
  });
});

function parseOk(src: string) {
  const r = parse(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.ast;
}
```

- [ ] **Step 6: Run; verify they fail**

Expected: fail — `format` not yet exported.

- [ ] **Step 7: Implement `format`**

Append to `grammar.ts`:

```ts
export function format(ast: WhenAst): string {
  if (ast.kind === 'atom') {
    const ref = '$' + ast.ref.nodeId + (ast.ref.path.length ? '.' + ast.ref.path.join('.') : '');
    const value =
      typeof ast.value === 'string'
        ? "'" + ast.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
        : String(ast.value);
    return `${ref} ${ast.op} ${value}`;
  }
  if (ast.kind === 'and') {
    if (ast.children.length === 1) return format(ast.children[0]!);
    return ast.children.map(format).join(' && ');
  }
  // or
  return ast.children.map(format).join(' || ');
}
```

- [ ] **Step 8: Run; verify all tests pass**

```bash
bun test packages/studio-core/tests/lib/grammar.spec.ts
```

- [ ] **Step 9: Add tests for `toDnf`**

```ts
import { toDnf } from '../../src/lib/grammar';

describe('toDnf', () => {
  it('returns DNF for a single atom', () => {
    const ast = parseOk("$a.output == 'x'");
    const dnf = toDnf(ast);
    expect(dnf).not.toBeNull();
    expect(dnf!.children.length).toBe(1);
    expect(dnf!.children[0]!.children.length).toBe(1);
  });

  it('returns DNF for plain AND of atoms', () => {
    const ast = parseOk("$a.output == 'x' && $b.output == 'y'");
    const dnf = toDnf(ast);
    expect(dnf).not.toBeNull();
    expect(dnf!.children.length).toBe(1);
    expect(dnf!.children[0]!.children.length).toBe(2);
  });

  it('returns DNF for OR of ANDs', () => {
    const ast = parseOk("$a.output == 'x' && $b.output == 'y' || $c.output == 'z'");
    const dnf = toDnf(ast);
    expect(dnf).not.toBeNull();
    expect(dnf!.children.length).toBe(2);
  });

  it('returns null for nested OR inside AND (non-DNF)', () => {
    const ast = parseOk("$a.output == 'x' && ($b.output == 'y' || $c.output == 'z')");
    const dnf = toDnf(ast);
    expect(dnf).toBeNull();
  });
});
```

- [ ] **Step 10: Implement `toDnf` (structural, no distribution)**

```ts
export function toDnf(ast: WhenAst): DnfAst | null {
  // Acceptable shapes:
  //   atom              -> or( and(atom) )
  //   and(atom*)        -> or( and(atom*) )
  //   or( and(atom*)+ ) -> identity
  if (ast.kind === 'atom') {
    return { kind: 'or', children: [{ kind: 'and', children: [ast] }] };
  }
  if (ast.kind === 'and') {
    if (!ast.children.every((c): c is AtomNode => c.kind === 'atom')) return null;
    return { kind: 'or', children: [{ kind: 'and', children: ast.children }] };
  }
  // or
  const groups: { kind: 'and'; children: AtomNode[] }[] = [];
  for (const child of ast.children) {
    if (child.kind === 'atom') {
      groups.push({ kind: 'and', children: [child] });
    } else if (child.kind === 'and' && child.children.every((c): c is AtomNode => c.kind === 'atom')) {
      groups.push({ kind: 'and', children: child.children as AtomNode[] });
    } else {
      return null;
    }
  }
  return { kind: 'or', children: groups };
}
```

- [ ] **Step 11: Run; all grammar tests pass**

```bash
bun test packages/studio-core/tests/lib/grammar.spec.ts
```

- [ ] **Step 12: Add fixtures-as-truth round-trip test**

Append:

```ts
import * as snippetData from '@archon-studio/fixtures/snippet-data';

describe('fixtures round-trip', () => {
  it('every when: in bundled snippets parses and re-formats identically', () => {
    const allSnippets = Object.values(snippetData) as Array<unknown>;
    let count = 0;
    for (const s of allSnippets) {
      if (typeof s !== 'object' || s === null) continue;
      const dag = (s as { dag?: { nodes?: Array<{ when?: string }> } }).dag;
      if (!dag?.nodes) continue;
      for (const n of dag.nodes) {
        if (typeof n.when !== 'string' || n.when.length === 0) continue;
        count++;
        const r = parse(n.when);
        if (!r.ok) throw new Error(`parse failed for ${JSON.stringify(n.when)}: ${r.error}`);
        const reformatted = format(r.ast);
        const r2 = parse(reformatted);
        expect(r2.ok).toBe(true);
        if (!r2.ok) return;
        expect(r2.ast).toEqual(r.ast);
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 13: Run; verify the fixtures round-trip**

```bash
bun test packages/studio-core/tests/lib/grammar.spec.ts
```
Expected: pass. If a real `when:` string in fixtures fails to parse, **stop** — Task 5.1's grammar documentation missed an operator/value-type. Update `grammar.archon.md` and `grammar.ts` together; do not skip the fixture.

- [ ] **Step 14: Commit**

```bash
git add packages/studio-core/src/lib/grammar.ts packages/studio-core/tests/lib/grammar.spec.ts
git commit -m "feat(grammar): hand-rolled when: parser/formatter + DNF detector

Implements the grammar documented in grammar.archon.md. parse/format are
round-trip stable across all bundled fixtures; toDnf returns null for
non-DNF expressions (used to gate visual-mode availability).

No React imports — Phase 6 validation can consume this directly."
```

---

### Task 5.3: CodeMirror 6 deps + `CmEditor` primitive

**Files:**
- Modify: `packages/studio-core/package.json`
- Create: `packages/studio-core/src/components/inspector/shared/CmEditor.tsx`
- Modify: `packages/studio-core/src/components/inspector/shared/index.ts` — re-export `CmEditor`
- Test: `packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx`

The CodeMirror wrapper. Field-agnostic: takes `value`, `onChange`, `extensions`, and renders a single-purpose editor that behaves like a textarea from the parent's perspective. Autocomplete, syntax modes, and other extensions are passed in by the consumer (Task 5.4 supplies `whenAutocomplete()`).

- [ ] **Step 1: Add CodeMirror deps**

```bash
bun add --filter='@archon-studio/core' @codemirror/state @codemirror/view @codemirror/autocomplete @codemirror/commands
```
Verify versions land in `packages/studio-core/package.json` under `dependencies`. Pin to the resolved minor.

- [ ] **Step 2: Write the failing test**

Create `packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx`:

```tsx
import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { CmEditor } from '../../../../src/components/inspector/shared/CmEditor';

describe('CmEditor', () => {
  it('renders the initial value', () => {
    const { container } = render(<CmEditor value="hello world" onChange={() => {}} />);
    expect(container.textContent).toContain('hello world');
  });

  it('mounts a contenteditable region (CodeMirror view)', () => {
    const { container } = render(<CmEditor value="x" onChange={() => {}} />);
    expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run; verify it fails**

```bash
bun test packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx
```
Expected: fail — `CmEditor` not defined.

- [ ] **Step 4: Implement `CmEditor`**

Create `packages/studio-core/src/components/inspector/shared/CmEditor.tsx`:

```tsx
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { type CSSProperties, useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Extra CodeMirror extensions (e.g., whenAutocomplete()). */
  extensions?: Extension[];
  /** Visual minimum height in pixels. */
  minHeight?: number;
  /** Inline style overrides (parent-controlled width/font). */
  style?: CSSProperties;
  /** ARIA label for accessibility. */
  ariaLabel?: string;
}

/**
 * Thin wrapper over CodeMirror 6 that exposes a textarea-shaped contract
 * (value/onChange/extensions). Used wherever the inspector needs $-reference
 * autocomplete inside a body field. Atom-row value inputs intentionally use
 * native `<input>` instead — short literal values don't benefit from CM6
 * and adding the editor there would be UI noise.
 */
export function CmEditor({
  value,
  onChange,
  extensions = [],
  minHeight = 80,
  style,
  ariaLabel,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount once.
  useEffect(() => {
    if (!hostRef.current) return;
    const startState = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([...defaultKeymap, ...closeBracketsKeymap]),
        closeBrackets(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        ...extensions,
      ],
    });
    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push controlled-value updates back into the editor when they originate
  // from outside (e.g., variant rename cascade).
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

- [ ] **Step 5: Re-export from the shared barrel**

Modify `packages/studio-core/src/components/inspector/shared/index.ts`:

```ts
export { Field } from './Field';
export { RenameField } from './RenameField';
export { DependsOnEditor } from './DependsOnEditor';
export { JsonField } from './JsonField';
export { CmEditor } from './CmEditor';
```

- [ ] **Step 6: Run tests; verify they pass**

```bash
bun test packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx
```
Expected: both pass.

- [ ] **Step 7: Run typecheck and full test suite**

```bash
bun --filter='*' run build
bun --filter='*' run test
```
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add packages/studio-core/package.json packages/studio-core/src/components/inspector/shared/CmEditor.tsx packages/studio-core/src/components/inspector/shared/index.ts packages/studio-core/tests/components/inspector/shared/CmEditor.spec.tsx bun.lock
git commit -m "feat(inspector): CmEditor primitive — CodeMirror 6 wrapper for body fields

Field-agnostic: takes value/onChange/extensions. Phase 5 consumers will
pass whenAutocomplete() via extensions. Atom-row value inputs intentionally
stay native <input>."
```

---

### Task 5.4: `whenAutocomplete` extension factory

**Files:**
- Create: `packages/studio-core/src/components/when/completions.ts`
- Create: `packages/studio-core/src/components/when/transitiveUpstream.ts`
- Test: `packages/studio-core/tests/components/when/completions.spec.ts`
- Test: `packages/studio-core/tests/components/when/transitiveUpstream.spec.ts`

Two pieces: (a) a pure helper that walks `depends_on` to compute a node's transitive ancestors; (b) a factory that builds a CodeMirror autocompletion source from those ancestors plus an `output_format` lookup.

- [ ] **Step 1: Test for `transitiveUpstream`**

Create `packages/studio-core/tests/components/when/transitiveUpstream.spec.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { transitiveUpstream } from '../../../src/components/when/transitiveUpstream';

describe('transitiveUpstream', () => {
  const nodes = [
    { id: 'a', base: { depends_on: [] } },
    { id: 'b', base: { depends_on: ['a'] } },
    { id: 'c', base: { depends_on: ['b'] } },
    { id: 'd', base: { depends_on: ['a', 'c'] } },
    { id: 'e', base: { depends_on: [] } },
  ];

  it('returns ancestors via depends_on', () => {
    expect(new Set(transitiveUpstream('d', nodes))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns empty for a root node', () => {
    expect(transitiveUpstream('a', nodes)).toEqual([]);
  });

  it('does not include the node itself', () => {
    expect(transitiveUpstream('c', nodes)).not.toContain('c');
  });

  it('handles missing depends_on (treats as empty)', () => {
    expect(transitiveUpstream('e', [{ id: 'e', base: {} }])).toEqual([]);
  });

  it('does not loop forever on cyclic depends_on (defensive)', () => {
    const cyclic = [
      { id: 'x', base: { depends_on: ['y'] } },
      { id: 'y', base: { depends_on: ['x'] } },
    ];
    expect(() => transitiveUpstream('x', cyclic)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run; fail**

- [ ] **Step 3: Implement**

Create `packages/studio-core/src/components/when/transitiveUpstream.ts`:

```ts
interface NodeLike {
  id: string;
  base?: { depends_on?: string[] };
}

/**
 * Returns the transitive set of ancestors reachable through `depends_on`,
 * excluding the node itself. Defensive against cycles (the importer/validator
 * rejects cycles, but we don't want a runtime crash if invariants slip).
 */
export function transitiveUpstream(id: string, nodes: readonly NodeLike[]): string[] {
  const byId = new Map<string, NodeLike>(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack: string[] = [];
  const start = byId.get(id);
  if (!start) return [];
  for (const dep of start.base?.depends_on ?? []) stack.push(dep);
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next) || next === id) continue;
    seen.add(next);
    const upstream = byId.get(next);
    for (const dep of upstream?.base?.depends_on ?? []) stack.push(dep);
  }
  return [...seen];
}
```

- [ ] **Step 4: Run; pass**

- [ ] **Step 5: Test for `whenAutocomplete`**

Create `packages/studio-core/tests/components/when/completions.spec.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { whenAutocomplete } from '../../../src/components/when/completions';

function ctx(doc: string, pos: number): CompletionContext {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, true);
}

describe('whenAutocomplete', () => {
  const upstreamNodes = [
    { id: 'classify', outputFormat: { properties: { issue_type: { type: 'string' }, title: { type: 'string' } } } },
    { id: 'fetch-issue', outputFormat: null },
  ];
  const lookup = (id: string) => upstreamNodes.find((n) => n.id === id)?.outputFormat ?? null;
  const source = whenAutocomplete({
    upstreamIds: upstreamNodes.map((n) => n.id),
    outputFormatLookup: lookup,
  });

  it('after $, completes with upstream node ids', () => {
    const c = ctx('$', 1);
    const r = source(c);
    expect(r).not.toBeNull();
    if (!r) return;
    const labels = r.options.map((o) => o.label);
    expect(labels).toContain('classify');
    expect(labels).toContain('fetch-issue');
  });

  it('after $classify., completes with "output"', () => {
    const c = ctx('$classify.', 10);
    const r = source(c);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.options.map((o) => o.label)).toContain('output');
  });

  it('after $classify.output., completes with output_format properties', () => {
    const c = ctx('$classify.output.', 17);
    const r = source(c);
    expect(r).not.toBeNull();
    if (!r) return;
    const labels = r.options.map((o) => o.label);
    expect(labels).toContain('issue_type');
    expect(labels).toContain('title');
  });

  it('returns null when output_format is missing', () => {
    const c = ctx('$fetch-issue.output.', 20);
    const r = source(c);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 6: Run; fail**

- [ ] **Step 7: Implement**

Create `packages/studio-core/src/components/when/completions.ts`:

```ts
import {
  type CompletionContext,
  type CompletionResult,
  autocompletion,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

interface Options {
  /** Upstream node ids this autocomplete will offer after `$`. */
  upstreamIds: readonly string[];
  /**
   * Returns the upstream node's `output_format` (JSON Schema-shaped object)
   * or `null` if unavailable. Used to drive `.output.` field completions.
   */
  outputFormatLookup: (nodeId: string) => Record<string, unknown> | null;
}

/**
 * CodeMirror 6 autocompletion source that fires inside body textareas
 * to suggest `$nodeId.output.field` references. Three stages:
 *   `$`              -> upstream node ids
 *   `$<id>.`         -> `output`
 *   `$<id>.output.`  -> keys of upstream node's `output_format.properties`
 *
 * Returns a *function* (not the wrapped Extension) so callers can both
 * compose it into other extensions AND test it directly.
 */
export function whenAutocomplete(opts: Options) {
  return function source(ctx: CompletionContext): CompletionResult | null {
    const before = ctx.state.doc.sliceString(0, ctx.pos);

    // Match: $ID.field.field. — the trailing . means "give me children of last segment"
    const refMatch = /\$([A-Za-z][A-Za-z0-9_-]*)((?:\.[A-Za-z][A-Za-z0-9_]*)*)\.$/.exec(before);
    if (refMatch) {
      const nodeId = refMatch[1]!;
      const path = refMatch[2]!.slice(1).split('.').filter(Boolean);
      return completeForRefPath(ctx, nodeId, path, opts);
    }

    // Match: $ alone (or $ followed by partial id — autocomplete the id list)
    const dollarMatch = /\$([A-Za-z][A-Za-z0-9_-]*)?$/.exec(before);
    if (dollarMatch) {
      const partial = dollarMatch[1] ?? '';
      const fromOffset = ctx.pos - partial.length;
      return {
        from: fromOffset,
        options: opts.upstreamIds.map((id) => ({ label: id, type: 'variable' })),
        validFor: /^[A-Za-z0-9_-]*$/,
      };
    }

    return null;
  };
}

function completeForRefPath(
  ctx: CompletionContext,
  nodeId: string,
  path: string[],
  opts: Options,
): CompletionResult | null {
  if (path.length === 0) {
    return {
      from: ctx.pos,
      options: [{ label: 'output', type: 'property' }],
      validFor: /^[A-Za-z0-9_]*$/,
    };
  }
  if (path.length === 1 && path[0] === 'output') {
    const fmt = opts.outputFormatLookup(nodeId);
    if (!fmt) return null;
    const properties = (fmt.properties as Record<string, { type?: string }> | undefined) ?? {};
    const entries = Object.entries(properties);
    if (entries.length === 0) return null;
    return {
      from: ctx.pos,
      options: entries.map(([key, schema]) => ({
        label: key,
        type: 'property',
        detail: schema.type ?? '',
      })),
      validFor: /^[A-Za-z0-9_]*$/,
    };
  }
  // Deeper paths (e.g., `$id.output.address.`) — v1 does not recurse into nested objects.
  return null;
}

/**
 * Convenience: returns the full extension (autocompletion wrapper + source).
 * Consumers that need to compose with other extensions can call
 * `whenAutocomplete(opts)` directly to get the source.
 */
export function whenAutocompleteExtension(opts: Options): Extension {
  return autocompletion({ override: [whenAutocomplete(opts)] });
}
```

- [ ] **Step 8: Run; pass**

- [ ] **Step 9: Commit**

```bash
git add packages/studio-core/src/components/when/ packages/studio-core/tests/components/when/
git commit -m "feat(when): transitiveUpstream + whenAutocomplete completion source

Pure helpers for the CodeMirror autocomplete extension. Three completion
stages: \$ -> ids; \$id. -> 'output'; \$id.output. -> output_format properties."
```

---

### Task 5.5: `WhenSection` + `WhenBuilder` + `AtomRow`

**Files:**
- Create: `packages/studio-core/src/components/when/WhenSection.tsx`
- Create: `packages/studio-core/src/components/when/WhenBuilder.tsx`
- Create: `packages/studio-core/src/components/when/AtomRow.tsx`
- Test: `packages/studio-core/tests/components/when/WhenSection.spec.tsx`
- Test: `packages/studio-core/tests/components/when/WhenBuilder.spec.tsx`

The visible Phase 5 surface. `WhenSection` owns the visual/raw toggle and parses on mount; `WhenBuilder` is the DNF UI; `AtomRow` is the node/field/op/value selector.

> **Layout reference (design doc Section 4):** OR-stacked AND-boxes; each AND-box contains AtomRows; "+ AND row" / "+ OR group" buttons inside each box.

- [ ] **Step 1: Failing test for `WhenSection` mode toggle**

Create `packages/studio-core/tests/components/when/WhenSection.spec.tsx`:

```tsx
import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { WhenSection } from '../../../src/components/when/WhenSection';

describe('WhenSection', () => {
  it('renders visual mode by default for a parseable DNF expression', () => {
    render(
      <WhenSection
        value="$classify.output.issue_type == 'bug'"
        upstreamIds={['classify']}
        outputFormatLookup={() => ({ properties: { issue_type: { type: 'string' } } })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /visual/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /raw/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('forces raw mode and shows banner for non-DNF input', () => {
    render(
      <WhenSection
        value="$a.output == 'x' && ($b.output == 'y' || $c.output == 'z')"
        upstreamIds={['a', 'b', 'c']}
        outputFormatLookup={() => null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /visual/i })).toBeDisabled();
    expect(screen.getByText(/visual builder needs flat OR-of-ANDs/i)).toBeInTheDocument();
  });

  it('forces raw mode for parse error and shows banner', () => {
    render(
      <WhenSection
        value="this is not a valid expression"
        upstreamIds={[]}
        outputFormatLookup={() => null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /visual/i })).toBeDisabled();
    expect(screen.getByText(/can't parse/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run; fail**

- [ ] **Step 3: Implement `AtomRow`**

Create `packages/studio-core/src/components/when/AtomRow.tsx`:

```tsx
import type { CSSProperties } from 'react';
import type { AtomNode } from '../../lib/grammar';

interface Props {
  atom: AtomNode;
  upstreamIds: readonly string[];
  outputFormatLookup: (nodeId: string) => Record<string, unknown> | null;
  onChange: (next: AtomNode) => void;
  onRemove: () => void;
}

const OPS: AtomNode['op'][] = ['==', '!='];

export function AtomRow({ atom, upstreamIds, outputFormatLookup, onChange, onRemove }: Props) {
  const fmt = outputFormatLookup(atom.ref.nodeId);
  const fields = Object.keys(((fmt?.properties as Record<string, unknown> | undefined) ?? {}));
  const fieldKey = atom.ref.path.length > 1 ? atom.ref.path[1] : '';

  return (
    <div style={rowStyle} data-testid="atom-row">
      <select
        aria-label="Node"
        value={atom.ref.nodeId}
        onChange={(e) => onChange({ ...atom, ref: { nodeId: e.target.value, path: ['output'] } })}
        style={selectStyle}
      >
        {upstreamIds.map((id) => (
          <option key={id} value={id}>{`$${id}`}</option>
        ))}
      </select>
      <span style={{ opacity: 0.5 }}>.</span>
      <select
        aria-label="Field"
        value={fieldKey}
        onChange={(e) =>
          onChange({
            ...atom,
            ref: {
              nodeId: atom.ref.nodeId,
              path: e.target.value ? ['output', e.target.value] : ['output'],
            },
          })
        }
        style={selectStyle}
        disabled={fields.length === 0}
      >
        <option value="">output</option>
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select
        aria-label="Operator"
        value={atom.op}
        onChange={(e) => onChange({ ...atom, op: e.target.value as AtomNode['op'] })}
        style={selectStyle}
      >
        {OPS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <input
        aria-label="Value"
        type="text"
        value={String(atom.value)}
        onChange={(e) => onChange({ ...atom, value: e.target.value })}
        style={inputStyle}
      />
      <button type="button" onClick={onRemove} aria-label="Remove atom" style={removeStyle}>
        ×
      </button>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'center',
  marginBottom: 4,
};
const selectStyle: CSSProperties = {
  padding: '4px 6px',
  fontSize: 12,
  background: 'var(--studio-bg-elevated)',
  color: 'var(--studio-fg)',
  border: '1px solid var(--studio-border)',
  borderRadius: 'var(--radius-sm)',
};
const inputStyle: CSSProperties = { ...selectStyle, flex: 1, minWidth: 80 };
const removeStyle: CSSProperties = {
  ...selectStyle,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--studio-fg-muted)',
};
```

- [ ] **Step 4: Implement `WhenBuilder` (DNF visual)**

Create `packages/studio-core/src/components/when/WhenBuilder.tsx`:

```tsx
import type { CSSProperties } from 'react';
import type { AtomNode, DnfAst } from '../../lib/grammar';
import { AtomRow } from './AtomRow';

interface Props {
  dnf: DnfAst;
  upstreamIds: readonly string[];
  outputFormatLookup: (nodeId: string) => Record<string, unknown> | null;
  onChange: (next: DnfAst) => void;
}

const EMPTY_ATOM = (firstUpstream: string | undefined): AtomNode => ({
  kind: 'atom',
  ref: { nodeId: firstUpstream ?? '', path: ['output'] },
  op: '==',
  value: '',
});

export function WhenBuilder({ dnf, upstreamIds, outputFormatLookup, onChange }: Props) {
  return (
    <div data-testid="when-builder">
      {dnf.children.map((group, gi) => (
        <div key={gi}>
          <div style={andBoxStyle}>
            <header style={andHeaderStyle}>all of</header>
            {group.children.map((atom, ai) => (
              <AtomRow
                key={ai}
                atom={atom}
                upstreamIds={upstreamIds}
                outputFormatLookup={outputFormatLookup}
                onChange={(nextAtom) => {
                  const nextGroup = { ...group, children: group.children.map((a, i) => (i === ai ? nextAtom : a)) };
                  onChange({ ...dnf, children: dnf.children.map((g, i) => (i === gi ? nextGroup : g)) });
                }}
                onRemove={() => {
                  const nextChildren = group.children.filter((_, i) => i !== ai);
                  if (nextChildren.length === 0) {
                    onChange({ ...dnf, children: dnf.children.filter((_, i) => i !== gi) });
                  } else {
                    onChange({
                      ...dnf,
                      children: dnf.children.map((g, i) => (i === gi ? { ...g, children: nextChildren } : g)),
                    });
                  }
                }}
              />
            ))}
            <button
              type="button"
              style={addRowStyle}
              onClick={() =>
                onChange({
                  ...dnf,
                  children: dnf.children.map((g, i) =>
                    i === gi ? { ...g, children: [...g.children, EMPTY_ATOM(upstreamIds[0])] } : g,
                  ),
                })
              }
            >
              + AND row
            </button>
          </div>
          {gi < dnf.children.length - 1 && <div style={orLabelStyle}>OR</div>}
        </div>
      ))}
      <button
        type="button"
        style={addGroupStyle}
        onClick={() =>
          onChange({
            ...dnf,
            children: [...dnf.children, { kind: 'and', children: [EMPTY_ATOM(upstreamIds[0])] }],
          })
        }
      >
        + OR group
      </button>
    </div>
  );
}

const andBoxStyle: CSSProperties = {
  border: '1px solid var(--studio-border)',
  borderRadius: 'var(--radius-sm)',
  padding: 8,
  background: 'var(--studio-bg)',
};
const andHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--studio-fg-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};
const orLabelStyle: CSSProperties = {
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--studio-fg-muted)',
  margin: '6px 0',
};
const addRowStyle: CSSProperties = {
  background: 'transparent',
  border: '1px dashed var(--studio-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 8px',
  fontSize: 12,
  color: 'var(--studio-fg-muted)',
  cursor: 'pointer',
  marginTop: 4,
};
const addGroupStyle: CSSProperties = { ...addRowStyle, marginTop: 8 };
```

- [ ] **Step 5: Implement `WhenSection`**

Create `packages/studio-core/src/components/when/WhenSection.tsx`:

```tsx
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { CmEditor, Field } from '../inspector/shared';
import { format, parse, toDnf, type DnfAst } from '../../lib/grammar';
import { WhenBuilder } from './WhenBuilder';
import { whenAutocompleteExtension } from './completions';

interface Props {
  /** Current `when:` string (empty / undefined -> empty). */
  value: string | undefined;
  upstreamIds: readonly string[];
  outputFormatLookup: (nodeId: string) => Record<string, unknown> | null;
  /** Patch emitter; null clears the field (matches GeneralTab semantics). */
  onChange: (next: string | null) => void;
}

type Mode = 'visual' | 'raw';

interface DerivedState {
  parsedDnf: DnfAst | null;
  parseError: string | null;
}

function deriveFromValue(value: string | undefined): DerivedState {
  if (!value || value.trim() === '') return { parsedDnf: { kind: 'or', children: [] }, parseError: null };
  const r = parse(value);
  if (!r.ok) return { parsedDnf: null, parseError: r.error };
  return { parsedDnf: toDnf(r.ast), parseError: null };
}

export function WhenSection({ value, upstreamIds, outputFormatLookup, onChange }: Props) {
  const derived = useMemo(() => deriveFromValue(value), [value]);
  const visualAvailable = derived.parsedDnf !== null && derived.parseError === null;
  const [mode, setMode] = useState<Mode>(visualAvailable ? 'visual' : 'raw');

  useEffect(() => {
    if (!visualAvailable && mode === 'visual') setMode('raw');
  }, [visualAvailable, mode]);

  const extensions = useMemo(
    () => [whenAutocompleteExtension({ upstreamIds, outputFormatLookup })],
    [upstreamIds, outputFormatLookup],
  );

  return (
    <Field label="When" htmlFor="gt-when" hint={hintFor(derived)}>
      <div style={toolbarStyle}>
        <button
          type="button"
          aria-pressed={mode === 'visual'}
          aria-label="Visual"
          disabled={!visualAvailable}
          onClick={() => setMode('visual')}
          style={toggleStyle(mode === 'visual')}
        >
          Visual
        </button>
        <button
          type="button"
          aria-pressed={mode === 'raw'}
          aria-label="Raw"
          onClick={() => setMode('raw')}
          style={toggleStyle(mode === 'raw')}
        >
          Raw
        </button>
      </div>

      {!visualAvailable && (
        <div role="status" style={bannerStyle}>
          {derived.parseError
            ? `Can't parse this expression: ${derived.parseError}. Edit raw, then re-try visual.`
            : "Visual builder needs flat OR-of-ANDs. Edit raw, or simplify the expression."}
        </div>
      )}

      {mode === 'visual' && derived.parsedDnf && (
        <WhenBuilder
          dnf={derived.parsedDnf}
          upstreamIds={upstreamIds}
          outputFormatLookup={outputFormatLookup}
          onChange={(nextDnf) => {
            const flat = nextDnf.children.length === 0
              ? null
              : format(nextDnf.children.length === 1 ? nextDnf.children[0]! : nextDnf);
            onChange(flat);
          }}
        />
      )}

      {mode === 'raw' && (
        <CmEditor
          ariaLabel="When (raw)"
          value={value ?? ''}
          onChange={(next) => onChange(next === '' ? null : next)}
          extensions={extensions}
          minHeight={48}
        />
      )}
    </Field>
  );
}

function hintFor(d: DerivedState): string {
  if (d.parseError) return 'Raw mode only — expression has a parse error.';
  if (d.parsedDnf === null) return 'Raw mode only — expression is outside DNF (visual builder cannot represent nested OR inside AND).';
  return "Switch to Raw for ops or value types the visual builder doesn't expose.";
}

const toolbarStyle: CSSProperties = { display: 'flex', gap: 4, marginBottom: 6 };
const bannerStyle: CSSProperties = {
  padding: '6px 8px',
  background: 'var(--studio-bg-elevated)',
  border: '1px dashed var(--studio-warn)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  color: 'var(--studio-fg-muted)',
  marginBottom: 6,
};

function toggleStyle(active: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 12,
    background: active ? 'var(--studio-accent)' : 'var(--studio-bg-elevated)',
    color: active ? 'var(--studio-bg)' : 'var(--studio-fg)',
    border: '1px solid var(--studio-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  };
}
```

- [ ] **Step 6: Run all when-component tests**

```bash
bun test packages/studio-core/tests/components/when/
```
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/studio-core/src/components/when/AtomRow.tsx packages/studio-core/src/components/when/WhenBuilder.tsx packages/studio-core/src/components/when/WhenSection.tsx packages/studio-core/tests/components/when/WhenSection.spec.tsx packages/studio-core/tests/components/when/WhenBuilder.spec.tsx
git commit -m "feat(when): WhenSection + WhenBuilder + AtomRow

Visual DNF builder for when:. Mode toggle (visual/raw); visual disabled
with banner for non-DNF or parse-error inputs; raw mode mounts CmEditor
with whenAutocompleteExtension."
```

---

### Task 5.6: Wire `WhenSection` into `GeneralTab`; migrate body fields to `CmEditor`

**Files:**
- Modify: `packages/studio-core/src/nodes/shared/GeneralTab.tsx`
- Modify: `packages/studio-core/src/nodes/prompt/Inspector.tsx`
- Modify: `packages/studio-core/src/nodes/bash/Inspector.tsx`
- Modify: `packages/studio-core/src/nodes/script/Inspector.tsx`
- Modify: `packages/studio-core/src/nodes/loop/Inspector.tsx`
- Modify: `packages/studio-core/src/nodes/approval/Inspector.tsx`
- Test: extend `packages/studio-core/tests/components/inspector/NodeInspector.spec.tsx` (or whichever file already tests inspector mounting) — add coverage for WhenSection presence.

`GeneralTab` swaps its raw `when:` textarea for `<WhenSection>`. Each per-variant Inspector replaces its body `<textarea>` with `<CmEditor>` carrying the autocomplete extension.

> **Drift expectation:** the design doc lists 6 body fields (prompt, bash, script, loop.prompt, loop.gate_message, approval.message). The actual Inspector files may surface them slightly differently — Task 5.0 Step 3 captured the real list. Migrate the textareas Task 5.0 actually found, even if the count differs.

- [ ] **Step 1: Plumb `upstreamIds` and `outputFormatLookup` through GeneralTab**

`GeneralTab` already receives `siblingIds: string[]`. It needs the full node list to compute transitive upstream and to look up per-node `output_format`. Source of truth is the Zustand store; reading directly from the store inside GeneralTab is the simplest plumbing (no new prop drilling).

Modify `packages/studio-core/src/nodes/shared/GeneralTab.tsx`. Replace the `Field` block for `when` with `<WhenSection>`:

```tsx
import { useBuilderStore } from '../../store/builder-store';
import { transitiveUpstream } from '../../components/when/transitiveUpstream';
import { WhenSection } from '../../components/when/WhenSection';

// Inside GeneralTab function — add:
const allNodes = useBuilderStore((s) => s.nodes);
const selectedId = useBuilderStore((s) => s.selectedNodeId) ?? '';
const upstreamIds = useMemo(
  () => transitiveUpstream(selectedId, allNodes),
  [selectedId, allNodes],
);
const outputFormatLookup = useCallback(
  (nodeId: string) => {
    const n = allNodes.find((x) => x.id === nodeId);
    const fmt = (n?.base?.output_format as Record<string, unknown> | undefined) ?? null;
    return fmt;
  },
  [allNodes],
);

// And replace the existing <Field label="When (raw)"> block with:
<WhenSection
  value={when || undefined}
  upstreamIds={upstreamIds}
  outputFormatLookup={outputFormatLookup}
  onChange={(next) => onChange({ when: next })}
/>
```

> Add `useMemo` and `useCallback` to the React import list at the top of the file.

- [ ] **Step 2: Migrate `prompt/Inspector.tsx` body to `CmEditor`**

Replace the `<textarea>` with `<CmEditor>` carrying `whenAutocompleteExtension`. Get `upstreamIds` and `outputFormatLookup` either by lifting the same store reads as GeneralTab or by exposing a small custom hook in `components/when/useWhenContext.ts` (skip if it adds files; inline reads are fine for v1). Example for prompt:

```tsx
import { useMemo, useCallback, type FC } from 'react';
import { Field, CmEditor } from '../../components/inspector/shared';
import { whenAutocompleteExtension } from '../../components/when/completions';
import { transitiveUpstream } from '../../components/when/transitiveUpstream';
import { useBuilderStore } from '../../store/builder-store';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import type { PromptNodeData } from './data';

export const PromptInspector: FC<InspectorProps<PromptNodeData>> = ({ id, data, base, onChange, siblingIds }) => {
  const allNodes = useBuilderStore((s) => s.nodes);
  const upstreamIds = useMemo(() => transitiveUpstream(id, allNodes), [id, allNodes]);
  const outputFormatLookup = useCallback(
    (nodeId: string) => (allNodes.find((n) => n.id === nodeId)?.base?.output_format as Record<string, unknown> | undefined) ?? null,
    [allNodes],
  );
  const extensions = useMemo(
    () => [whenAutocompleteExtension({ upstreamIds, outputFormatLookup })],
    [upstreamIds, outputFormatLookup],
  );
  return (
    <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
      <Field
        label="Prompt"
        htmlFor={`prompt-${id}`}
        hint="Inline prompt body. Type $ for upstream node references."
      >
        <CmEditor
          ariaLabel="Prompt"
          value={data.prompt ?? ''}
          onChange={(next) => onChange({ prompt: next })}
          extensions={extensions}
          minHeight={140}
        />
      </Field>
    </GeneralTab>
  );
};
```

- [ ] **Step 3: Migrate `bash/Inspector.tsx` body to `CmEditor`**

Apply the same pattern. The body field name on `BashNodeData` is `bash` (a string). `env` stays a JsonField — only the `bash` body is upgraded.

- [ ] **Step 4: Migrate `script/Inspector.tsx` body to `CmEditor`**

If `script` body is a string (per data.ts), upgrade it. If it is a path/name only (no inline body), confirm with Task 5.0's findings and skip. (Spec describes it as "string — name or path" — likely no upgrade needed; document the skip in this step's commit message.)

- [ ] **Step 5: Migrate `loop/Inspector.tsx` body fields to `CmEditor`**

Loop has two textareas: `loop.gate_message` and `loop.prompt`. Both upgrade. `loop.iteration_limit` (number) and `loop.interactive` (checkbox) stay native.

- [ ] **Step 6: Migrate `approval/Inspector.tsx` body to `CmEditor`**

`approval.message` upgrades. `approval.approvers` (string list) stays native.

- [ ] **Step 7: Run all tests**

```bash
bun --filter='*' run test
```
Expected: green. If a test in `tests/components/inspector/` asserts on `<textarea>` for an upgraded body field, update the assertion to look for `[contenteditable="true"]` (the CodeMirror DOM signature). Add at least one new assertion per upgraded variant that the autocomplete *fires on `$`* — re-use the helper from Task 5.4's tests.

- [ ] **Step 8: Run build + lint + format + typecheck**

```bash
bun --filter='*' run build
bun run lint
bun run format:check
```
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add packages/studio-core/src/nodes/shared/GeneralTab.tsx packages/studio-core/src/nodes/prompt/Inspector.tsx packages/studio-core/src/nodes/bash/Inspector.tsx packages/studio-core/src/nodes/script/Inspector.tsx packages/studio-core/src/nodes/loop/Inspector.tsx packages/studio-core/src/nodes/approval/Inspector.tsx packages/studio-core/tests/components/inspector/
git commit -m "feat(inspector): WhenSection in GeneralTab + CmEditor in body fields

GeneralTab raw when: textarea -> WhenSection (visual/raw toggle, DNF builder).
Body textareas in prompt/bash/loop/approval inspectors -> CmEditor with
whenAutocompleteExtension. script body skipped (no inline body field).
Atom-row value inputs intentionally remain native <input>."
```

---

### Task 5.7: Drift CI for `lib/grammar.ts`

**Files:**
- Create: `scripts/check-when-grammar-drift.ts`
- Modify: `package.json` — add `check-when-grammar-drift` script
- Modify: `.github/workflows/schema-drift.yml` — run the new check alongside the existing schema drift

The drift check fetches Archon's evaluator at the pinned SHA, normalises operator/connective tokens, and compares against the studio's `grammar.ts` token set. Fails CI if upstream adds an operator the studio hasn't modelled.

- [ ] **Step 1: Implement the drift script**

Create `scripts/check-when-grammar-drift.ts`:

```ts
#!/usr/bin/env bun
/**
 * Compares Archon's `when:` evaluator at the pinned SHA against the studio's
 * documented operator/connective set in lib/grammar.ts. Designed to FAIL when
 * Archon adds a new operator that the studio's parser would silently reject.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PIN = readFileSync(join(ROOT, '.archon-source-pin'), 'utf8').trim();

// Archon's evaluator path discovered in Task 5.1 — UPDATE if the upstream layout changes.
const ARCHON_EVALUATOR_PATH = 'packages/workflows/src/<EVALUATOR_PATH>'; // FILL IN

const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/${ARCHON_EVALUATOR_PATH}`;
const upstream = await (await fetch(url)).text();

// The studio's known operator set — must match parseOp() / parseValue() in lib/grammar.ts.
const STUDIO_OPS = new Set(['==', '!=']);
const STUDIO_CONNECTIVES = new Set(['&&', '||']);

const tokens = new Set<string>();
for (const m of upstream.matchAll(/['"](==|!=|<=|>=|<|>|in|not in|contains|&&|\|\||and|or|not)['"]/g)) {
  tokens.add(m[1]!);
}

let drift = false;
for (const t of tokens) {
  const isOp = ['==', '!=', '<=', '>=', '<', '>', 'in', 'not in', 'contains'].includes(t);
  const isConn = ['&&', '||', 'and', 'or', 'not'].includes(t);
  if (isOp && !STUDIO_OPS.has(t)) {
    console.error(`✗ DRIFT: Archon evaluator references operator "${t}" — studio does not model it.`);
    drift = true;
  }
  if (isConn && !STUDIO_CONNECTIVES.has(t)) {
    console.error(`✗ DRIFT: Archon evaluator references connective "${t}" — studio does not model it.`);
    drift = true;
  }
}

if (drift) {
  console.error(
    `\nGrammar drift detected against Archon @ ${PIN.slice(0, 8)}.\n` +
      `Update lib/grammar.ts AND grammar.archon.md together, then bump the pin.`,
  );
  process.exit(1);
}
console.log(`✓ when: grammar in sync with Archon @ ${PIN.slice(0, 8)}.`);
```

> The detection regex is intentionally loose. Task 5.1's reading should reveal a much sharper pattern (e.g., a token table inside the evaluator); refine the regex against that table.

- [ ] **Step 2: Add a root npm script**

In root `package.json`:

```json
"check-when-grammar-drift": "bun run scripts/check-when-grammar-drift.ts"
```

- [ ] **Step 3: Smoke-run locally**

```bash
bun run check-when-grammar-drift
```
Expected: `✓ when: grammar in sync with Archon @ fd6d75e7.` If the script reports drift on first run, that means Task 5.1 missed an operator — update `lib/grammar.ts` + `grammar.archon.md` to match, then re-run.

- [ ] **Step 4: Add to CI workflow**

Modify `.github/workflows/schema-drift.yml` to invoke the new script alongside `check-schema-drift`. Keep both checks gated by the same daily/PR triggers.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-when-grammar-drift.ts package.json .github/workflows/schema-drift.yml
git commit -m "ci(grammar): drift check for when: grammar against Archon at pinned SHA

Mirrors the schema-drift pattern. Fails when Archon's evaluator surfaces
an operator or connective the studio's grammar.ts does not model."
```

---

### Task 5.8: Manual visual smoke + Phase 5 verification + push + tag

**Files:**
- None (verification only).

The parity-with-spec gate.

- [ ] **Step 1: Run all tests + lint + format + build**

```bash
bun run lint
bun run format:check
bun --filter='*' run test
bun --filter='*' run build
```
Expected: all green. If anything fails, fix and re-run before proceeding.

- [ ] **Step 2: Run schema-drift + grammar-drift + round-trip**

```bash
bun run check-schema-drift
bun run check-when-grammar-drift
bun --filter='@archon-studio/core' test round-trip
```
Expected: green. Phase 5 should NOT have touched the schema mirror or the importer/exporter.

- [ ] **Step 3: Manual visual smoke — standalone shell**

Run: `bun --filter='@archon-studio/standalone' run dev`
Open `http://localhost:5173`. Walk through, in this exact sequence:

1. Open `archon-fix-github-issue` (has nodes with `when:` like `$classify.output.issue_type == 'bug'`). Click the `investigate-bug` node.
2. The General tab shows a "When" section with **Visual** mode active. The DNF builder shows one AND-box containing one AtomRow: `[$classify ▾]` `.` `[issue_type ▾]` `[== ▾]` `[ 'bug' ]`.
3. Open the `Field ▾` dropdown — `issue_type`, `title`, `reasoning` are listed (matches `classify.output_format.properties`).
4. Add a second AtomRow via "+ AND row". Pick `$classify`, `title`, `==`, `'something'`. Confirm the underlying `when:` (peek via `useBuilderStore.getState().nodes.find(n => n.id === 'investigate-bug')?.base?.when` in devtools) reads: `$classify.output.issue_type == 'bug' && $classify.output.title == 'something'`.
5. Add a second OR group via "+ OR group". Confirm raw form serialises with `||`.
6. Switch to **Raw** mode. Paste: `$classify.output == 'bug' && ($a.output == 'x' || $b.output == 'y')`. Switch back to Visual: button should be **disabled** with banner "Visual builder needs flat OR-of-ANDs."
7. Clear the field entirely in Raw mode. Confirm the underlying `when:` is `null` (not `''`).
8. Click a `prompt` node. In the body textarea, type `$cl` — autocomplete popup appears with `classify` (an ancestor of this node). Select it; cursor is at `$classify`.
9. Type `.` — autocomplete shows `output`. Select it.
10. Type `.` — autocomplete shows `issue_type`, `title`, `reasoning`.
11. Rename the `classify` node to `categorize` via the General header's RenameField. Confirm: the body text in the prompt node now reads `$categorize.output…`; the WhenSection on `investigate-bug` now shows `$categorize` in the node dropdown; the underlying `when:` string reads `$categorize.output.issue_type == 'bug'`.
12. (Loop variant) Open `archon-test-loop-dag` if it exists, or create a `loop` node from the library. Body fields `loop.gate_message` and `loop.prompt` are CodeMirror editors with autocomplete.

If anything fails, file the bug against the relevant Phase 5 task and fix before tagging.

- [ ] **Step 4: Capture a screenshot**

Save a screenshot of the standalone showing the WhenBuilder populated (Visual mode, multiple atoms, autocomplete popup if possible) to `docs/superpowers/screenshots/phase-5-smoke.png`. Reference it in the deliverables checklist below.

- [ ] **Step 5: Update `phases.md`**

Mark Phase 5 as **Planned ✅ Reviewed (after this chunk passes review) ✅ Executed (after Step 6) ✅** in `phases.md`.

- [ ] **Step 6: Push + tag**

```bash
git push origin main
git tag -a phase-5 -m "Phase 5: visual when: builder + body autocomplete"
git push origin phase-5
```

- [ ] **Step 7: Update Phase 5 deliverables checklist below**

---

## Phase 5 deliverables checklist

- [ ] Phase-4 reality check passes — GeneralTab raw when: textarea present, renameNode regex still in place, body textareas exist in prompt/bash/script/loop/approval, output_format schema unchanged (Task 5.0)
- [ ] `lib/grammar.archon.md` documents Archon evaluator's operator/connective/value-type set at the pinned SHA (Task 5.1)
- [ ] `lib/grammar.ts` — pure parse/format/toDnf with hand-rolled recursive descent; round-trips every bundled-fixture `when:` string AST-equal (Task 5.2)
- [ ] `CmEditor` primitive — CodeMirror 6 wrapper exposing value/onChange/extensions; re-exported from inspector primitives barrel (Task 5.3)
- [ ] `transitiveUpstream` + `whenAutocomplete` — pure helpers with fixture-driven test coverage (Task 5.4)
- [ ] `WhenSection` + `WhenBuilder` + `AtomRow` — DNF visual surface with mode toggle, parse-error/non-DNF banners forcing raw fallback (Task 5.5)
- [ ] GeneralTab swaps raw textarea for WhenSection; body textareas in prompt/bash/loop/approval upgraded to CmEditor with whenAutocompleteExtension (Task 5.6)
- [ ] `scripts/check-when-grammar-drift.ts` + CI integration (Task 5.7)
- [ ] Manual visual smoke green; screenshot captured at `docs/superpowers/screenshots/phase-5-smoke.png`; phases.md updated; tag `phase-5` pushed (Task 5.8)

---

## Open questions / future work

- **AST-rewrite rename cascade.** Today `renameNode` uses a regex over `when:` strings. After Phase 5, the AST is available and an AST-rewrite path would be trivially correct (no edge cases around `$dispatch_v2` collisions with `$dispatch`). Track as a separate refactor task; not blocking.
- **Atom-row value autocomplete for `enum` constraints.** When `output_format` has `enum: [...]` on a property, the value `<input>` could become a `<select>`. Phase 8 polish.
- **Nested `output_format` paths** (`$id.output.address.city`). Phase 5 stops at top-level. Revisit when fixtures show the need.
- **Operator expansion.** If Task 5.1's reading reveals operators beyond `==` / `!=`, expand `parseOp()` and the `OPS` array in `AtomRow`. Add tests; document in `grammar.archon.md`. The drift CI will surface upstream additions automatically.
