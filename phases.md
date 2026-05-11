| Phase                                                                                    | Planned | Reviewed | Executed |
| ---------------------------------------------------------------------------------------- | ------- | -------- | -------- |
| Phase 0 — Scaffold (workspaces, tooling, schema mirror, CI, round-trip harness, probes)  | ✅      | ✅       | ✅       |
| Phase 1 — Core data model, registry, importer/exporter, full round-trip                  | ✅      | ✅       | ✅       |
| Phase 2 — Canvas, DagNode, position persistence, WorkflowBuilder shell, standalone smoke | ✅      | ✅       | ✅       |
| Phase 3 — NodeLibrary + per-variant Renderers + snippets                                 | ✅      | ✅       | ✅       |
| Phase 4 — NodeInspector + variant inspectors + cascading rename                          | ✅      | ✅       | ✅       |
| Phase 5 — Visual `when:` builder + autocomplete                                          | ✅      | ✅       | ✅       |
| Phase 6 — Validation pipeline + ValidationPanel                                          | ✅      | ❌       | ❌       |
| Phase 7 — YAML preview pane                                                              | ❌      | ❌       | ❌       |
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
