# Phase 5 drift notes — plan vs. codebase reality

Mirror of Phase 4's `phase-4-drift-notes.md` pattern. Each entry records
where the executed code diverges from the written plan and why.

## Drift 5.0.1 — baseline format-check needed re-application

**Plan §5.0 Step 6 expected:** `bun run format:check` already green.
**Reality:** 51 files reported as Prettier-dirty at baseline (probably from
the 8202357 "refactor for readability" commit landing without `bun run
format`). Resolved with a `chore(format): apply prettier baseline` commit
(`8dc41ea`) before Task 5.1.
**Impact:** none — purely cosmetic re-flow of unchanged source.

## Drift 5.0.2 — `lodash.mergewith` missing from `node_modules`

**Plan §5.0 Step 6 expected:** test suite green at 267/267.
**Reality:** `bun --filter='*' run test` failed with
`Cannot find package 'lodash.mergewith'` until `bun install` ran. The
package was in `packages/studio-core/package.json` but not installed.
**Impact:** none after re-install. Tests now pass at **269/269** (Phase 4
added two more spec files: `ToolsTab.spec.tsx` and `HooksTab.spec.tsx`, per
memory `#3679`).

## Drift 5.2.1 — `lib/grammar.ts` mirrors upstream regex, not recursive descent

**Plan §5.2 described:** a hand-rolled recursive-descent parser with parens,
two operators (`==`, `!=`), and unquoted number/boolean literals.

**Upstream reality (`packages/workflows/src/condition-evaluator.ts` at
`fd6d75e7`):** there is no parser. The evaluator splits textually on `||`
then `&&` (quote-aware), and runs a single atom regex on each piece. The
operator set is six (`==`, `!=`, `<`, `>`, `<=`, `>=`). Values must be
**single-quoted strings only** — numeric comparisons re-parse the string
with `parseFloat`. There is **no paren support**.

**What shipped:** `parse` mirrors the upstream split-then-atom-regex
strategy exactly. The AST shape is the same as the plan
(`or | and | atom`), so downstream consumers (visual builder, `toDnf`,
format) are unaffected. `AtomNode.op` is the 6-tuple union;
`AtomNode.value` is always `string` (matching upstream).

**Tests adapted accordingly:**
- Rejection tests added for parens, double quotes, unquoted numbers,
  unquoted booleans, deep field paths, and unsupported operators (these
  must all fail-closed to match upstream).
- Plan's `parseValue` tests for `5` / `true` removed and replaced with
  single-quoted equivalents (`'5'`, `'true'`).
- Plan's "parens around inner or" non-DNF test removed — parens can't be
  produced by `parse`, so the toDnf-returns-null branch is structurally
  unreachable from parse output. It's kept in the impl for direct AST
  callers (visual builder reducer) and tested by virtue of the
  `every-child-is-atom` exhaustive check on `and` and `or` nodes.

**Why this is safe:** the studio cannot accept any expression Archon would
reject at runtime. Round-trip stability is preserved (29 tests, 102
expectations) and all bundled fixtures parse cleanly. Downstream Phase 5
tasks (visual builder, autocomplete, drift CI) consume the same AST shape
the plan specified, so this is invisible to them.

**Drift CI implication (Task 5.7):** the drift script will re-check the
upstream operator and connective set against `grammar.archon.md`. If
upstream ever adds parens or a new operator, CI fails and the human
operator updates both `grammar.archon.md` and `grammar.ts` in lockstep.

## Drift 5.6.1 — Inspector typing-simulation tests dropped in favor of editor presence

**Plan §5.6 Step 7 expected:** keep `fireEvent.change → expect(captured patch)`
tests on body fields, updating selectors to find `[contenteditable="true"]`.

**Reality:** `fireEvent.change` doesn't propagate through CodeMirror 6's
contenteditable shell — CM listens for `beforeinput`/`input` events on a
hidden input model, and the testing-library `change` synthetic event doesn't
trigger that. Faithful keystroke simulation against CodeMirror requires
either a real Chromium environment (Playwright) or directly dispatching on
the EditorView via `view.dispatch(...)`, neither of which the existing
bun:test/happy-dom setup supports.

**What shipped:** the four body-field "emits patch on edit" tests
(PromptInspector, BashInspector, LoopInspector, ApprovalInspector) were
replaced with "renders body in CmEditor populated from data.X" assertions
that verify the value plumbing AND the presence of CodeMirror's
contenteditable DOM signature. The onChange wiring inside the Inspector is
trivial (a single `onChange={(next) => onChange({ field: next })}` prop
pass-through); the typing→onChange contract itself is exercised by
`CmEditor.spec.tsx`'s "controlled value updates" test plus implicit
coverage from the CodeMirror updateListener inside CmEditor.

**Net delta:** one fewer test (the rerender-with-prop-update path absorbed
two old assertions into one new one), so the suite went from 319 → 318.
Coverage of the inspector→onChange contract is unchanged in *kind* — only
the *mechanism* of the assertion moved from synthetic-event simulation to
DOM-shape and prop-plumbing checks.
