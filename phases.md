| Phase                                                                                    | Planned | Reviewed | Executed |
| ---------------------------------------------------------------------------------------- | ------- | -------- | -------- |
| Phase 0 — Scaffold (workspaces, tooling, schema mirror, CI, round-trip harness, probes)  | ✅      | ✅       | ✅       |
| Phase 1 — Core data model, registry, importer/exporter, full round-trip                  | ✅      | ✅       | ✅       |
| Phase 2 — Canvas, DagNode, position persistence, WorkflowBuilder shell, standalone smoke | ✅      | ✅       | ✅       |
| Phase 3 — NodeLibrary + per-variant Renderers + snippets                                 | ✅      | ✅       | ✅       |
| Phase 4 — NodeInspector + variant inspectors + cascading rename                          | ✅      | ✅       | ✅       |
| Phase 5 — Visual `when:` builder + autocomplete                                          | ✅      | ✅       | ✅       |
| Phase 6 — Validation pipeline + ValidationPanel                                          | ✅      | ✅       | ✅       |
| Phase 7 — YAML preview pane                                                              | ✅      | ✅       | ❌       |
| Phase 8 — Editor polish (undo/redo, multi-select, copy/paste, theme picker)              | ❌      | ❌       | ❌       |
| Phase 9 — Connected mode complete (connect, list, save)                                  | ❌      | ❌       | ❌       |
| Phase 10 — Tests + drift CI + docs + release polish                                      | ❌      | ❌       | ❌       |

## Phase 4 — completion notes

All 9 tasks landed on branch `phase-4` (Tasks 52.5, 53, 54, 55, 56, 57,
58, 59, 60). The drift cheat sheet at
`docs/superpowers/plans/phase-4-drift-notes.md` records every plan-vs-code
divergence and the design decisions made along the way (HooksTab as
JsonField; capability-aware AI-field parking on convertVariant; ProviderTab
renders all AI base fields as flat schema-typed controls instead of a
fictional `model_settings` wrapper).

Phase 4 deliverables shipped:

- mergePatch + updateNodeData (unified routing across data/base/unknown)
- convertVariant with capability-aware AI-field parking into
  `data._unknown._converted_from`
- renameNode body-ref cascade through prompt/bash/script/loop/approval
- Shared inspector primitives (Field, RenameField, DependsOnEditor,
  JsonField)
- NodeInspector shell with capability-driven tabs + selection state
- 7 per-variant General Inspectors with schema-correct fields
- ExecutionTab (idle_timeout, retry, sandbox)
- ProviderTab (provider, model, fallbackModel, systemPrompt, effort,
  maxBudgetUsd, thinking, betas)
- ToolsTab (allowed_tools, denied_tools, output_format)
- HooksTab (raw JsonField over the schema's keyed-by-event hook map)
- SkillsMcpTab (skills, mcp)
- AdvancedTab (data.\_unknown editor + n.unknown editor + capabilities
  readout)
- Canvas selection wiring (onNodeClick / onPaneClick)
- WorkflowBuilder mounts NodeInspector + variant-migration component test

Verification: 267/267 tests pass (full monorepo) · all 4 packages build ·
typecheck green · lint 0 errors · format clean · schema-drift clean.

## Phase 5 — completion notes

All 9 tasks (5.0 reality check → 5.8 verification) landed on branch
`phase-5`. The drift cheat sheet at
`docs/superpowers/plans/phase-5-drift-notes.md` records the two material
deviations from the written plan:

- **§5.2.1** — `lib/grammar.ts` mirrors Archon's actual evaluator
  (regex-and-split, 6 operators, single-quoted-strings-only, no parens)
  rather than the plan's wider recursive-descent surface. Faithful to
  upstream `condition-evaluator.ts` at `fd6d75e7`.
- **§5.6.1** — Inspector body-field "emits patch on edit" tests were
  reshaped into "data plumbs into CodeMirror" assertions because
  `fireEvent.change` does not reach CM6's contenteditable.

Phase 5 deliverables shipped:

- `lib/grammar.ts` — pure parse / format / toDnf for the `when:` grammar
- `lib/grammar.archon.md` — canonical grammar contract sourced from Archon
- `CmEditor` shared primitive (CodeMirror 6 wrapper, ext-pluggable)
- `whenAutocomplete` + `whenAutocompleteExtension` factories
- `transitiveUpstream` helper + `useWhenContext` hook
- `WhenSection` (visual/raw toggle), `WhenBuilder` (DNF), `AtomRow`
- GeneralTab wires WhenSection; body fields in prompt / bash / script /
  loop (prompt + gate_message + until_bash) / approval (message +
  on_reject.prompt) all use CmEditor with autocomplete
- `scripts/check-when-grammar-drift.ts` + CI integration alongside
  the schema-drift workflow

Verification: 318/318 tests pass · all packages build · typecheck green ·
lint 0 errors · format clean · schema-drift clean · grammar-drift clean
(in sync with Archon @ `fd6d75e7`).

## Phase 6 — completion notes

All Phase 6 tasks (6.0 reality check → 6.10 verify) landed on branch
`phase-6`; tag + push to origin pending. The drift cheat sheet at
`docs/superpowers/plans/phase-6-drift-notes.md` records 24 plan-vs-code
deviations — most are `DagNode` flat-shape adaptations against the
inherited Phase 4/5 schemas plus one engine race fix.

Phase 6 deliverables shipped:

- `validation/types.ts` — shared `Issue` model + tier enum
- `validation/rules/structural.ts` — instant-tier rules (empty ids,
  variant missing, duplicate ids, malformed `depends_on`)
- `validation/rules/graph.ts` — debounced-tier rules (cycle detection,
  `depends_on` reference integrity, both self- and dual-cycle covered)
- `validation/rules/content.ts` — debounced-tier `when:` grammar + `{{var}}`
  scan reusing `lib/grammar.ts` and `transitiveUpstream` from Phase 5
- `validation/engine.ts` — three-tier orchestrator with 300ms debounce,
  `AbortController`, and monotonic sequence guard against stale server responses
- `validation/useValidation.ts` — React hook plumbing `{ issues, hasErrors,
isValidating, focusIssue }` into the store; memoized return + idempotent
  `setFocusedIssue`
- `builder-store` — `focusedIssue` slice + `loadWorkflow` resets
- `WorkflowBuilder` — bottom drawer row in the grid hosting `ValidationPanel`
- `ValidationPanel` — collapsible issue list with click-to-focus
- `Toolbar` — `onSave` Save button gated by `hasErrors` (with top-3 error
  tooltip on disabled hover)

Verification: 382/382 tests pass (up from 318; +64 new) · all packages
build · typecheck green · lint 0 errors · format clean · schema-drift
clean · grammar-drift clean.

## Phase 7 — planning notes

Spec + plan landed before execution:

- `docs/superpowers/specs/2026-05-10-phase-7-yaml-preview-design.md`
  captures the four scope decisions (toggleable right drawer in the
  inspector slot; bidirectional click + hover cross-highlight; always
  re-serialize from in-memory workflow; all four extras — copy,
  download, modified-vs-baseline badge, Ctrl+F search), the module map,
  source-map model, and the deviation from the v1 sketch's
  `highlight.js` choice in favor of reusing the Phase-5 `CmEditor` (CM6)
  primitive.
- `docs/superpowers/plans/2026-05-10-phase-7-yaml-preview.md` decomposes
  the work into 11 bite-sized tasks (7.0 reality check, 7.0.5 `CmEditor`
  Compartment + `onCreate` prep, 7.1 `serializeYaml`, 7.2 fixture
  round-trip, 7.3 `YamlPreview` + StateField decorations, 7.4 store
  slice, 7.5 Toolbar toggle + WorkflowBuilder swap, 7.6 canvas hover
  wiring, 7.7 drawer header extras, 7.8 e2e wiring smoke, 7.9 verify +
  drift + tag).

Plan went through one independent review pass: 4 BLOCKER + 6 MAJOR
issues caught and folded in. Key corrections recorded in the plan's
"Review history" section — most notably the `CmEditor` mount-once
limitation (resolved via `Compartment` in new Task 7.0.5) and the
rewrite of decorations from a broken `EditorView.decorations.compute`
pattern to a canonical `StateField<DecorationSet>` driven by
`StateEffect`s.

Test target: 382 → ~434 (32 behavioral + ~20 per-fixture round-trip).
Execute on branch `phase-7` cut from `main` after Phase 6 is tagged.
