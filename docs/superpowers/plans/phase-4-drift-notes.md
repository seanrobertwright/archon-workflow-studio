# Phase 4 — Plan vs. Actual Codebase Drift Notes

This document captures interpretation rules for executing the Phase 4 plan
(`docs/superpowers/plans/2026-05-08-archon-workflow-studio-v1.md`, "Chunk 6:
Phase 4 — NodeInspector + variant inspectors + cascading rename"). The plan was
written as a *spec of intent* — its code snippets show the shape the author
wanted, not always the literal field names of the current codebase.

**How to use this:** read this once before starting any Phase 4 task. When the
plan's snippet conflicts with what's actually in the repo, this document is the
tie-breaker. Subagents executing 57/58/59 should receive this as part of their
brief, before the task text.

---

## 1. Variant contract is `fromDag`/`toDag`, not `fromDagNode`/`toDagNode`

The plan's Task 53 Step 12 snippet shows:

```ts
fromDagNode: (raw: DagNode) => TData;
toDagNode: (data: TData) => Partial<DagNode>;
discriminator: keyof DagNode;
Renderer: React.FC<NodeProps<TData>>;
```

**Actual** (`packages/studio-core/src/nodes/shared/types.ts`):

```ts
fromDag: (input: { base; variantSpecific; raw: DagNode }) => TData;
toDag: (data: TData) => Partial<DagNode>;
// no `discriminator` field
Renderer: ComponentType<NodeProps<RFNode<DagNodeData<TData>, VariantId>>>;
```

**Rule:** keep the existing field names and Renderer typing. Phase 4 only ADDS
`Inspector` (and the optional `renameBodyRefs` slot below). Do not rename or
restructure the contract — Phase 1–3 code depends on the current shape.

---

## 2. BuilderNode storage is split three ways

```ts
// packages/studio-core/src/nodes/shared/types.ts
interface BuilderNode<TData> {
  id: string;
  variant: VariantId;
  data: TData;                          // variant-specific only (e.g. command, prompt body)
  base: Record<string, unknown>;        // typed base fields (depends_on, when, provider, etc.)
  unknown: Record<string, unknown>;     // top-level forward-compat (unrecognised top-level keys)
}
```

The plan's snippets routinely treat `n.data` as the only storage. **It isn't.**
Use `pickBaseFields(raw, variant)` (already exists at
`packages/studio-core/src/nodes/shared/pickBaseFields.ts`) to classify any
field into base / variantSpecific / unknown.

The exporter pattern at `toWorkflowDefinition.ts:12–20` shows the canonical
re-assembly: `{ id, ...n.base, ...toDag(n.data), ...n.unknown }`.

### `updateNodeData` design (per user decision: unified routing)

Signature: `updateNodeData(id: string, patch: Record<string, unknown>) => void`.
Internal flow:

1. `pickBaseFields(patch, n.variant)` → `{ base, variantSpecific, unknown }`.
2. Apply each partition to the corresponding bucket via `mergePatch`:
   - `n.base = mergePatch(n.base, basePatch)`
   - `n.data = mergePatch(n.data, variantSpecificPatch)`
   - `n.unknown = mergePatch(n.unknown, unknownPatch)`
3. Inspector tabs always call `updateNodeData(id, { whateverField: value })`.
   They do NOT need to know which bucket the field lives in.

This gives the inspector a uniform "edit a field" API regardless of storage
origin and matches the plan's intent (one action per field-edit) without the
plan's data-only assumption.

---

## 3. Field-name corrections

| Plan snippet | Actual schema/code | Where |
|---|---|---|
| `disallowed_tools` | `denied_tools` | `BASE_FIELD_KEYS`, used by ToolsTab (Task 58) |
| `model_settings` (treated as known) | NOT in `BASE_FIELD_KEYS` — lands in `_unknown` | `mergePatch` tests are pure-helper so it's OK there; ProviderTab (Task 57) cannot model_settings as a typed field |
| `idle_timeout` (plan rarely uses; refers to "timeout") | `idle_timeout` is the base field; bash + script also have variant-specific `timeout` | Be precise about which one ExecutionTab edits |

**ProviderTab note (Task 57):** the plan's `model_settings` JSON field is
unsupported by the schema. Either drop it (recommended — call it out in the
deviation) or render it as a free-form `_unknown.model_settings` editor in the
Advanced tab instead.

---

## 4. AI-relevant base fields (for capability-aware parking)

Per user decision on `convertVariant`: when target variant has
`capabilities.honorsAiFields === false`, park these from `n.base` into
`data._unknown._converted_from`:

```
provider, model, allowed_tools, denied_tools, output_format, effort, thinking,
maxBudgetUsd, systemPrompt, fallbackModel, betas, agents, mcp, skills, context
```

(All universal base fields per `BASE_FIELD_KEYS` *except* `depends_on`, `when`,
`trigger_rule`, `idle_timeout`, `retry`, `hooks`, `sandbox` — those describe
flow-control / runtime behaviour and apply to every variant.)

Variants with `honorsAiFields: false`: `bash`, `script`, `cancel`, `approval`.
(Per `*/data.ts` exports.)

---

## 5. lodash.merge has no customizer — use lodash.mergewith

The plan's Task 53 Step 1 says `bun add lodash.merge`. **Do not use it.**
`lodash.merge` (the standalone package) is just `_.merge` and accepts no
customizer hook. The mergePatch helper needs a customizer to enforce
array-replace semantics — use `lodash.mergewith` (the package wraps
`_.mergeWith`) instead. Already corrected in commit `0055122`.

---

## 6. `renameNode` body-ref cascade extension (folded in from Task 52.5)

Current `store.renameNode` (`packages/studio-core/src/store/builder-store.ts:130`)
cascades id + `depends_on` + `when:` strings, but explicitly notes (line
153–155) that body refs in prompt/bash/script/loop.prompt/approval.message are
NOT yet rewritten. Per the Task 52.5 instruction, fold this into Task 53:

1. Add an OPTIONAL slot to `VariantDefinition`:

   ```ts
   renameBodyRefs?: (data: TData, oldId: string, newId: string) => TData;
   ```

2. Implement for the 5 variants with body text:

   - `prompt` — rewrite `$<oldId>.output…` in `data.prompt`
   - `bash` — rewrite `$<oldId>.output…` in `data.bash`
   - `script` — rewrite `$<oldId>.output…` in `data.script`
   - `loop` — rewrite in `data.loop.prompt` (the inner-prompt field)
   - `approval` — rewrite in `data.approval.message`

   Skip `command` and `cancel` (no free-form body text).

3. Extend `store.renameNode`'s `renameRefs(n)` helper to call
   `variant.renameBodyRefs?.(n.data, oldId, newId)` and write the result back
   to `n.data` if the slot is present.

Use the same `\\$<oldId>\\b` regex pattern as the existing `when:` rewrite at
line 151.

---

## 7. Mental model: snippets are spec, not transcription

When in doubt: prefer the actual codebase shape, adapt the plan's snippet to
match, and note the deviation in the commit message. Specifically:

- Do NOT introduce new top-level fields the plan implies but the schema lacks
  (`model_settings`, `discriminator`, `disallowed_tools`).
- Do NOT rename existing exports to match plan-snippet names (`fromDag` →
  `fromDagNode`).
- DO add new fields the plan explicitly designs (`Inspector`,
  `renameBodyRefs`).
- DO follow the plan's commit-granularity guidance — small, scoped commits
  named per the plan.

---

## 8. Task-specific drift discovered during execution

### Task 57 (ExecutionTab + ProviderTab) — TODO when resumed

- **`model_settings` is not a real field.** Plan treats it as a known nested
  object with sub-keys. The schema has discrete fields (`model`, `provider`,
  `effort`, `thinking`, `maxBudgetUsd`, `systemPrompt`, `fallbackModel`,
  `betas`) that are individually base fields. Either render those individually
  or render `_unknown.model_settings` as a `JsonField` for forward-compat.
- **`timeout` is variant-specific** (bash + script only — already in those
  variants' General Inspector). The plan's ExecutionTab spec includes `timeout`
  as a shared base field — drop it from ExecutionTab entirely.
- **`on_failure` / `on_timeout` shapes:** verify against `dag-node.ts` before
  writing the brief. Plan-described shapes may not match.
- **`retry`** is a real base field (`stepRetryConfigSchema` from
  `schemas/retry.ts`); gate it on `!variant.capabilities.forbidsRetry`
  (loop forbids retry).
- **`sandbox`** is a base field, schema is `sandboxSettingsSchema` (passthrough
  with optional `enabled`, `network`, etc. — render as JSON or split the
  common boolean toggles).

### Task 58 (ToolsTab + HooksTab) — TODO when resumed

- **`disallowed_tools` → `denied_tools`** (per drift §3 above).
- **`output_format` is `z.unknown()` passthrough** — `JsonField` is the right
  control.
- **HooksTab: USE `JsonField`** (user decision, this session). The plan's
  `{event, match, command, blocking}[]` row UI is wrong — actual schema is
  `Record<EventName, Array<{matcher?, response, timeout?}>>` with 21 named
  events and structured JSON responses (`response` is the SDK
  `SyncHookJSONOutput`, not a shell command). A real structured editor is
  Phase 8 polish; for Phase 4 ship the raw JSON editor with the same
  forward-compat semantics as the Advanced tab.

### Task 59 (SkillsMcpTab + AdvancedTab + migration test) — TODO when resumed

- **`skills` and `mcp` are base fields** (string lists in `BASE_FIELD_KEYS`).
  Render as line-per-row textareas, same pattern as ScriptInspector's `deps`.
- **AdvancedTab** edits three things: `data._unknown` (variant-data forward
  compat), `n.unknown` (top-level forward compat), and shows the variant
  `capabilities` readout. All three flow through `updateNodeData` (which
  routes to the right bucket automatically).
- **§12.2 migration test is the load-bearing Phase-4 deliverable.** It must
  prove `convertVariant` round-trips data through a `data._unknown.
  _converted_from` stash so the user can convert command → bash → command
  without losing their `command` value. The capability-aware parking
  implementation in commit `87ff737` already supports this; the test just
  needs to assert it.

### Task 60 (wire-in) — TODO when resumed

- Replace the 6 stub references in `NodeInspector.tsx` (`StubExecution`,
  `StubProvider`, `StubTools`, `StubHooks`, `StubSkillsMcp`, `StubAdvanced`)
  with the real tab imports from Tasks 57–59.
- Wire Canvas selection into `setSelectedNodeId`. Plan said "Task 36 wired
  this" — it didn't. The store fields exist (added in commit landing
  Task 55); Canvas needs a `onNodeClick` / `onSelectionChange` handler that
  calls `setSelectedNodeId(node.id)` (and `null` on background click).
- Mount `<NodeInspector />` in `WorkflowBuilder.tsx` at the existing
  `{/* Phase 4 fills in NodeInspector */}` placeholder (line 57 at start of
  this session).

---

## 9. Resolved decisions (record so future-you doesn't re-litigate)

- **lodash.mergewith over lodash.merge** — needed for customizer hook (commit `0055122`).
- **Unified routing for updateNodeData** — patches partition via pickBaseFields and apply per-bucket. (User decision, this session.)
- **Capability-aware parking for convertVariant** — strip variant-specific incompatibles AND AI base fields when target has `honorsAiFields=false`. (User decision, this session.)
- **renameNode body-ref cascade** — folded into Task 53 as a `renameBodyRefs` optional VariantDefinition slot. (Plan instruction.)
- **`.gitattributes` LF-normalization** — required for Windows format:check baseline. (Resolved this session, commit `209437a`.)
