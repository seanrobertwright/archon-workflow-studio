# Phase 6 — Validation pipeline + ValidationPanel

**Date:** 2026-05-10
**Status:** Approved (brainstorm)
**Predecessor:** Phase 5 (visual `when:` builder + autocomplete) — branch + tag `phase-5`, 318/318 tests.

## Goal

Land the validation engine and bottom-drawer panel for Archon Workflow Studio. The studio gates Save on a green panel; users always know what is wrong and where. Three-tier latency (instant / debounced 300ms / server), single issue store, click-to-focus from panel rows.

## Scope cut

Core validation only. Deferred to Phase 9 (real API client + connect screen):
- Offline yellow state
- Queued saves
- "Resolve resources" button cross-checking `/api/commands`

Cross-workflow reference checks are not in the master plan and stay out.

## Architecture

```
builder-store snapshot (workflow + nodes)
        │
        ├─► instant rules ─── every render (cheap selector)
        ├─► debounced rules ─ 300ms after settle (graph + content)
        └─► server validate ─ after debounced settles & no client errors
                                       │
                                       ▼
                              validation-store
                       { issuesByTier, status, isValidating }
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
        ValidationPanel         Canvas node badges      Toolbar Save gate
```

Tiers own disjoint slices of the issue list. A slow server response cannot clobber a fresh client run; a fresh client run does not erase the last server result until the new server pass returns.

## Module layout

```
packages/studio-core/src/validation/
  types.ts            Issue, Severity, RuleSource
  rules/
    structural.ts     instant: empty/dup IDs, missing required fields
    graph.ts          debounced: cycles (DFS), ref integrity
    content.ts        debounced: when: via lib/grammar.parse, {{var}} scan
  engine.ts           orchestrates tiers, debounce + AbortController
  useValidation.ts    React hook → { issues, hasErrors, isValidating, focusIssue }
packages/studio-core/src/components/
  ValidationPanel.tsx bottom-drawer UI (fills the slot reserved since Phase 2)
```

## Issue model

```ts
type Severity = 'error' | 'warning' | 'info';
type RuleSource = 'client-instant' | 'client-debounced' | 'server';

interface Issue {
  id: string;          // stable hash(rule + path + message) for scroll/selection persistence
  rule: string;        // e.g. 'graph.cycle', 'content.when.parse'
  severity: Severity;
  source: RuleSource;
  message: string;
  path: { nodeId?: string; field?: string; atomIndex?: number };
}
```

Stable IDs let the panel preserve scroll position and selected row across re-runs.

## Rule catalog

| Rule | Tier | Severity | Description |
|---|---|---|---|
| `structural.id.empty` | instant | error | Empty node id. |
| `structural.id.duplicate` | instant | error | Two nodes share an id. |
| `structural.required.<field>` | instant | error | Per node-type required fields (e.g., `decision.branches`, `command.name`). |
| `graph.cycle` | debounced | error | DFS over `depends_on`; one issue per cycle, attached to every member node. |
| `graph.ref.unknown` | debounced | error | `depends_on`, `on:success`, `on:failure` referencing a non-existent node id. |
| `content.when.parse` | debounced | error | `lib/grammar.parse` (from Phase 5) on each `when:` string; reports per-atom errors. |
| `content.var.unknown` | debounced | warning | Markdown-stripped scan of prompt/body for `{{ids.X.Y}}` where `X ∉ transitiveUpstream(node)` (reuses Phase 5 helper). |
| `server.*` | async | error | Whatever the server returns; tagged `source: 'server'`. |

## Engine timing & race-safety

- **Instant tier** — runs inside the hook's `useMemo`, keyed on workflow identity. Pure functions over the store snapshot.
- **Debounced tier** — `useEffect` with 300ms timer; resets on every workflow change. Graph and content rules run together so the panel paints once.
- **Server tier** — fires only when the debounced tier has settled AND there are no client errors (warnings allowed). Each call carries an AbortController. A monotonic sequence number on the engine guards against stale responses from a backgrounded tab: a response from sequence N is dropped if the engine is on N+1, even if the AbortController missed.

## ValidationPanel UI

- Lives in the bottom drawer slot already reserved in `WorkflowBuilder.tsx` (0px until Phase 6).
- **Collapsed bar:** `● 3 errors • 2 warnings • 1 info` — color-coded pills. Click expands.
- **Expanded list:** grouped by severity → row = icon, rule code, message, `→ node-id.field`.
- **Row click:** selects the node on canvas, opens the inspector on the relevant tab, scrolls to the field. For `when:` atom issues, opens WhenSection and highlights the atom by `atomIndex`.
- **Filters:** severity chips (error / warning / info) + source chip (client / server).
- **A11y:** keyboard-navigable list, ARIA live region announces issue-count changes on debounced settle.

## Save gating

- Toolbar Save button reads `useValidation().hasErrors`.
- Disabled state shows a tooltip listing the top 3 error messages so the block is never mysterious.
- Save is enabled when only warnings/info remain. Warnings do not block.

## Tests (~50 new, taking total to ~370)

- **Unit per rule module:** table-driven good/bad fixtures for each rule.
- **Engine:** debounce coalesces bursts into one run; AbortController + sequence number discard stale server responses; tier isolation (slow server does not drop fresh client issues).
- **Component:** ValidationPanel renders, collapsed pill counts match issue list, row click dispatches focus.
- **Integration:** load a fixture with a planted cycle → panel red, Save disabled → fix the cycle → panel green, Save enabled.

## Drift considerations

- The `content.when.parse` rule depends on Phase 5's `lib/grammar.ts` being a faithful mirror of Archon's `condition-evaluator.ts`. The grammar-drift CI (`scripts/check-when-grammar-drift.ts`) already guards this; no new CI needed.
- Server validation errors come back as plain strings today (`ValidateResult.errors?: string[]`). Phase 6 wraps each into an `Issue` with `rule: 'server.unknown'` and `path: {}`. When Phase 9's real client lands and the server starts returning structured errors, the wrapping layer is the only place to upgrade.

## Out of scope

- Offline detection, save queue, Resolve-resources button — Phase 9.
- Cross-workflow ref checks — not planned.
- Auto-fix suggestions — possible future phase.
