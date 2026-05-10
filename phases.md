| Phase                                                                                    | Planned | Reviewed | Executed |
| ---------------------------------------------------------------------------------------- | ------- | -------- | -------- |
| Phase 0 — Scaffold (workspaces, tooling, schema mirror, CI, round-trip harness, probes)  | ✅      | ✅       | ✅       |
| Phase 1 — Core data model, registry, importer/exporter, full round-trip                  | ✅      | ✅       | ✅       |
| Phase 2 — Canvas, DagNode, position persistence, WorkflowBuilder shell, standalone smoke | ✅      | ✅       | ✅       |
| Phase 3 — NodeLibrary + per-variant Renderers + snippets                                 | ✅      | ✅       | ✅       |
| Phase 4 — NodeInspector + variant inspectors + cascading rename                          | ✅      | ✅       | 🟡       |
| Phase 5 — Visual `when:` builder + autocomplete                                          | ❌      | ❌       | ❌       |
| Phase 6 — Validation pipeline + ValidationPanel                                          | ❌      | ❌       | ❌       |
| Phase 7 — YAML preview pane                                                              | ❌      | ❌       | ❌       |
| Phase 8 — Editor polish (undo/redo, multi-select, copy/paste, theme picker)              | ❌      | ❌       | ❌       |
| Phase 9 — Connected mode complete (connect, list, save)                                  | ❌      | ❌       | ❌       |
| Phase 10 — Tests + drift CI + docs + release polish                                      | ❌      | ❌       | ❌       |

## Phase 4 — partial completion notes (branch `phase-4`)

Tasks 52.5, 53, 54, 55, 56 ✅ landed (8 commits on top of `main`). Tasks 57,
58, 59, 60 deferred — see `docs/superpowers/plans/phase-4-drift-notes.md` §8
for the per-task drift findings and resolved design decisions (HooksTab uses
JsonField; capability-aware parking lands in Task 53, not Task 59; etc.).

What works on `phase-4` today:

- mergePatch + updateNodeData (unified routing across data/base/unknown)
- convertVariant with capability-aware AI-field parking
- renameNode body-ref cascade through prompt/bash/script/loop/approval
- Shared inspector primitives (Field, RenameField, DependsOnEditor, JsonField)
- NodeInspector shell with capability-driven tabs + selection state
- 7 per-variant General Inspectors with schema-correct fields

What's still stubbed:

- ExecutionTab, ProviderTab, ToolsTab, HooksTab, SkillsMcpTab, AdvancedTab
  (rendered as testid placeholders in NodeInspector — Tasks 57–59 fill them)
- NodeInspector mount point in WorkflowBuilder still says
  `{/* Phase 4 fills in NodeInspector */}` (Task 60 wires it)
- Canvas onNodeClick → setSelectedNodeId not yet wired (Task 60)

Verification: 233/233 tests pass · build green · typecheck green ·
format clean · schema-drift clean.
