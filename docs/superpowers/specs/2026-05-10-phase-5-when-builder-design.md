# Phase 5 Design — Visual `when:` Builder + Autocomplete

**Status:** Approved (2026-05-10). Captured from brainstorming session before plan
authoring.

## Goal

Eliminate the worst friction point of the existing Archon builder: hand-editing
`when:` expressions and `$nodeId.output.field` references in body fields. After
Phase 5, the studio offers (a) a visual two-level (OR-of-ANDs / DNF) builder for
`when:` expressions, with a raw textarea fallback for anything outside DNF, and
(b) reference autocomplete on `$` inside body textareas, scoped to transitive
upstream nodes and their `output_format` properties.

## Decisions captured

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope | Both halves — WhenBuilder **and** body autocomplete — in Phase 5 |
| 2 | Non-DNF behavior | Raw-only fallback + banner; no auto-rewrite |
| 3 | Grammar source of truth | Mirror Archon's evaluator at pinned SHA; add drift CI |
| 4 | Editor library | CodeMirror 6 (`@codemirror/state` + `view` + `autocomplete`) |
| 5 | `$nodeId` completion source | Transitive upstream of `depends_on` |
| 6 | CmEditor surface | Body textareas with `$` refs + raw `when:`; atom-row values stay native `<input>` |

## Architecture

```
packages/studio-core/src/
├── lib/
│   ├── grammar.ts            ← parse/format/toDnf + AST types (NEW)
│   └── grammar.archon.md     ← documented Archon grammar mirror (NEW)
├── components/
│   ├── inspector/
│   │   └── shared/
│   │       └── CmEditor.tsx  ← thin <textarea> replacement (NEW)
│   └── when/
│       ├── WhenSection.tsx   ← visual/raw toggle + section frame (NEW)
│       ├── WhenBuilder.tsx   ← DNF visual: OR-boxes wrap AND-rows (NEW)
│       ├── AtomRow.tsx       ← node / field / op / value selector (NEW)
│       └── completions.ts    ← whenAutocomplete extension factory (NEW)
└── nodes/shared/
    └── GeneralTab.tsx        ← MODIFY: drop raw textarea, mount <WhenSection>

scripts/
└── check-when-grammar-drift.ts  ← daily CI: refetch Archon SHA, compare (NEW)
```

### Data flow

- `lib/grammar.ts` is pure: `parse(string) → Result<Ast, ParseError>`,
  `format(Ast) → string`, `toDnf(Ast) → DnfAst | null`. No React imports.
- `WhenSection` owns the mode state. On mount, calls `parse(base.when)`. If
  `Ok` and `toDnf(...) !== null`, both modes are available; default to visual.
  If `Err` or non-DNF, force raw + show banner.
- `WhenBuilder` consumes a `DnfAst`, emits a new `DnfAst` on edits.
  `WhenSection` then `format`s it back to string and patches via
  `onChange({ when: newString || null })`.
- `CmEditor` is field-agnostic; the `whenAutocomplete()` extension factory
  takes `{ upstreamNodes, outputFormatLookup }` and returns a CodeMirror
  autocomplete source.

### Why a pure `lib/grammar.ts`

The regex-based rename in `builder-store.ts` (`replace(new RegExp("\\$<oldId>\\b"))`)
works for now, but Phase 6 validation will want AST-level inspection (cycle
detection, ref integrity). A pure module shared by store, validation, and UI
prevents three copies of "what does `$id.output.field` mean".

## Grammar (v1)

To be **verified against Archon source at SHA `fd6d75e76218da8a5804bed5c1548de769c4c658`**
as Task 5.1 before any other Phase 5 work; if Archon supports more, this
expands. Fixtures only show `==` / `!=` / `&&` / `||` / string literals.

```
expr     := orExpr
orExpr   := andExpr ('||' andExpr)*
andExpr  := atom ('&&' atom)*
atom     := ref op value | '(' expr ')'
ref      := '$' nodeId ( '.' field )*
op       := '==' | '!='                 // v1; expand if Archon has more
value    := stringLit | numberLit | boolLit
nodeId   := [A-Za-z_][A-Za-z0-9_-]*
field    := [A-Za-z_][A-Za-z0-9_]*
stringLit := "'" ([^'\\] | '\\' .)* "'"
```

**Hand-rolled recursive descent** (no parser-generator dep). Reasoning: 5
productions, no left-recursion, expected to evolve as Archon's evaluator does
— code is easier to update than a `.peggy` build step.

### AST shape

```ts
type WhenAst =
  | { kind: 'or'; children: WhenAst[] }
  | { kind: 'and'; children: WhenAst[] }
  | { kind: 'atom';
      ref: { nodeId: string; path: string[] };
      op: '==' | '!=';
      value: string | number | boolean };

type AtomNode = Extract<WhenAst, { kind: 'atom' }>;
type DnfAst = { kind: 'or'; children: { kind: 'and'; children: AtomNode[] }[] };
```

`toDnf` is structural: only succeeds if the AST is already
`or(and(atom...))` or a degenerate form (single atom, single AND, etc.). It
does **not** distribute or normalize — non-DNF returns `null`, hand-off to
raw banner.

## WhenBuilder UX

```
┌─ When ─────────────────────────────────────  ( Visual / Raw ) ┐
│  ┌─ all of ─────────────────────────────────┐                 │
│  │  [$classify ▾] . [issue_type ▾] [== ▾] [ 'bug'        ] × │
│  │  [$fetch    ▾] . [status     ▾] [== ▾] [ 'open'       ] × │
│  │  [+ AND row]                                              │
│  └───────────────────────────────────────────────────────────┘ │
│                          OR                                    │
│  ┌─ all of ─────────────────────────────────┐                 │
│  │  [$classify ▾] . [issue_type ▾] [!= ▾] [ 'bug'        ] × │
│  │  [+ AND row]                                              │
│  └───────────────────────────────────────────────────────────┘ │
│  [+ OR group]                                                  │
└────────────────────────────────────────────────────────────────┘
```

- **Node `▾`**: lists transitive upstream nodes (Decision 5).
- **Field `▾`**: top-level `output_format.properties` keys of the selected
  node, with type chips. If `output_format` missing, dropdown contains only
  `output` (the whole object as string).
- **Op `▾`**: dropdown of grammar's op set (v1: `==`, `!=`).
- **Value**: native `<input>` — auto-quoted on string types in the formatter;
  numeric/bool inputs detect type. Decision 6: no CmEditor noise here.
- **Empty state**: clicking `+ OR group` on an empty WhenBuilder creates one
  AND-box with one empty AtomRow; saving with empty atoms emits `when: null`
  (matches current "delete on empty" behavior in `GeneralTab.tsx`).

## Autocomplete (body textareas)

`whenAutocomplete()` extension fires on `$`. Three completion stages:

| Trigger | Completions |
|---------|-------------|
| `$` | Transitive upstream node IDs |
| `$<id>.` | `output` (always) |
| `$<id>.output.` | Top-level keys of upstream's `output_format.properties`, with type as secondary text. If no `output_format`, popup closes. |

**Nesting depth:** v1 stops at top-level properties. Nested objects
(`address.city`) defer to a later phase — fixtures don't show that depth.

**Where it mounts:** `prompt.prompt`, `bash.bash`, `script.script` body,
`loop.prompt`, `loop.gate_message`, `approval.message`, and the raw `when:`
CmEditor in `WhenSection`.

## Testing strategy

| Layer | Files | Coverage |
|-------|-------|----------|
| Unit (grammar) | `tests/lib/grammar.spec.ts` | parse/format round-trip every `when:` string in bundled defaults; DNF detection; bad inputs return `Err` not throw |
| Unit (rename) | extend `tests/store/builder-store.spec.ts` | confirm rename cascade still works after `grammar.ts` is introduced; AST-level equality before/after |
| Component | `tests/components/when/WhenBuilder.spec.tsx` | DNF render; toggle node/field/op/value; add/remove rows + groups; non-DNF → raw fallback banner |
| Component | `tests/components/inspector/shared/CmEditor.spec.tsx` | autocomplete fires on `$`; arrow-key nav; selection inserts; empty `output_format` shows no field completions |
| Round-trip | extend round-trip harness | every bundled-default `when:` string survives parse → format unchanged |
| Drift | `scripts/check-when-grammar-drift.ts` | re-fetch Archon source at pinned SHA, compare grammar token sets; fails if Archon adds an op |

## Preliminary task outline

The Phase 5 plan will follow the Phase 4 pattern: reality-check first, then
load-bearing primitive, then UI consumers, then verification. Preliminary
count: **~8 tasks**. The full plan comes from `lril-superpowers:writing-plans`.

```
Task 5.0  Phase-4 reality check — read-only verification
Task 5.1  Fetch Archon when-evaluator at SHA fd6d75e7…; document grammar.archon.md
Task 5.2  lib/grammar.ts — parse/format/toDnf + AST types + tests
Task 5.3  Add @codemirror/{state,view,autocomplete} deps; CmEditor primitive + tests
Task 5.4  whenAutocomplete extension factory (transitive upstream + output_format lookup)
Task 5.5  WhenBuilder + AtomRow + WhenSection (visual/raw toggle, DNF fallback banner)
Task 5.6  Migrate body fields to CmEditor in 6 variant Inspectors; raw when: in GeneralTab
Task 5.7  scripts/check-when-grammar-drift.ts + CI workflow integration
Task 5.8  Manual visual smoke + Phase 5 verification + push + tag
```

## Deferred / explicitly out of scope

Keeping scope tight (Phase 4 drift lessons):

- Auto-distribution of non-DNF expressions (Decision 2).
- Nested `output_format` field paths; defer until fixtures show the need.
- Atom-row value autocomplete (e.g., for `enum` constraints in
  `output_format`). Polish, not critical path; revisit in Phase 8.
- Multi-cursor / advanced CodeMirror features. Phase 5 enables only the
  autocomplete extension.
- YAML syntax highlighting in CmEditor (that's Phase 7).
- Drag-to-reorder atom rows or groups. v1 uses up/down arrow buttons or
  delete-and-re-add.
- Replacing the regex-based `renameNode` cascade with AST rewrite. The
  regex still works post-Phase-5 because `grammar.ts` only adds a *parsing*
  path; mutating the cascade is a separate refactor task that earns nothing
  today. Future work.

## Cross-references

- v1 plan summary: `docs/superpowers/plans/2026-05-08-archon-workflow-studio-v1.md` line 145.
- Phase 4 drift cheat sheet (pattern for plan-vs-code reconciliation):
  `docs/superpowers/plans/phase-4-drift-notes.md`.
- Current `when:` raw textarea this design replaces:
  `packages/studio-core/src/nodes/shared/GeneralTab.tsx`.
- Existing regex-based rename cascade (kept for now):
  `packages/studio-core/src/store/builder-store.ts` (rewrites `$<oldId>` → `$<newId>`).
- Pinned Archon SHA: `.archon-source-pin` (`fd6d75e76218da8a5804bed5c1548de769c4c658`).
