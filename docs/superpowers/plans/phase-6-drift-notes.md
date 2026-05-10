# Phase 6 drift notes — plan vs. codebase reality

Mirror of `phase-5-drift-notes.md`. Each entry records where the executed
code diverges from the written plan and why.

---

## Drift 6.1.1 — DagNode has no `type` discriminant or `base` wrapper

**Plan assumed:**
```ts
const node = (over: Partial<DagNode> = {}): DagNode =>
  ({ id: 'a', type: 'prompt', base: { prompt: 'x' }, ...over }) as DagNode;
```
The plan described `DagNode` as having a `type: 'prompt' | 'command' | 'decision' | ...`
discriminator field and a `base: { ...fields }` wrapper object.

**Reality (`packages/studio-core/src/schemas/dag-node.ts`):**
`DagNode` is a flat discriminated union with no `type` field and no `base`
wrapper. Each variant is discriminated by the presence of its own field:

| Variant | Discriminating field |
|---|---|
| `CommandNode` | `command: string` |
| `PromptNode` | `prompt: string` |
| `BashNode` | `bash: string` |
| `ScriptNode` | `script: string` |
| `LoopNode` | `loop: LoopNodeConfig` (object) |
| `ApprovalNode` | `approval: { message, ... }` (object) |
| `CancelNode` | `cancel: string` |

All these fields live flat on the node, not nested under `base`.

**What shipped:**
- Test helpers build variant-specific minimal objects cast through `unknown`
  (e.g., `{ id: 'a', prompt: 'hello' } as unknown as DagNode`).
- `runStructuralRules` uses `'field' in n` checks and the existing type
  guards (`isBashNode`, etc.) to dispatch per variant. No `switch (n.type)`.

---

## Drift 6.1.2 — `decision` variant does not exist

**Plan assumed:** a `'decision'` variant with `base.branches: []`.

**Reality:** There is no `decision` variant in `DagNode`. The discriminating
union members are: command, prompt, bash, script, loop, approval, cancel.

**What shipped:** The `decision` test and rule were dropped entirely. The
loop-config check (`structural.required.loop`, `structural.required.loop.prompt`,
`structural.required.loop.until`, `structural.required.loop.max_iterations`)
was added in its place — this is the closest analog: a structured required-field
check on a non-trivial sub-object.

---

## Drift 6.1.3 — Structural rules are nearly tautological over real DagNode

**Design intent (plan):** required-field rules guard against missing fields
per node variant.

**Reality:** Because `DagNode` is produced by Zod validation (which enforces
all required fields), a valid `DagNode` will never have an empty `command`,
`prompt`, etc. The structural rules only fire on inputs that bypassed Zod
(e.g., BuilderNode-derived partial objects before the Task 6.5 DagNode
conversion is applied).

**Impact:** none — the rules are defense-in-depth at the
`BuilderNode → DagNode` boundary that Task 6.5 will manage. The rule set
is correct and complete; the `as unknown as DagNode` casts in the tests are
explicitly signaling this bypass. Future tasks should note this when wiring
the validation engine (Task 6.4) to avoid double-validating already-parsed
`DagNode` objects.

---

## Drift 6.1.4 — Command required field is `command`, not `name`

**Plan assumed:** `structural.required.name` flagging `base.name` missing on a
command node.

**Reality:** The field holding the command identifier is `command: string`
(the same field that discriminates the variant). There is no separate `name`
field on `CommandNode`.

**What shipped:** rule renamed to `structural.required.command`, checking
that `n.command` is a non-empty string.

---

## Drift 6.1.5 — Approval and cancel require their discriminating fields

**Plan stated:** "approval + cancel: no required body field beyond id."

**Reality:** Both variants require their discriminating field to be non-empty:
- `ApprovalNode` requires `approval.message: string` (non-empty).
- `CancelNode` requires `cancel: string` (non-empty reason).

**What shipped:** rules `structural.required.approval`,
`structural.required.approval.message`, and `structural.required.cancel`
added. These are true required fields the Zod schema enforces; their presence
in structural rules makes sense for defense-in-depth.

**Update (post-review):** the approval check was split into two distinct
rules (`structural.required.approval` for a missing object,
`structural.required.approval.message` for an empty `.message`) to mirror
the `loop` pattern and avoid `issueId` collisions between the two failure
modes. See drift 6.1.7 for the related dedup-behavior note.

---

## Drift 6.1.6 — Test invocation method

**Plan's Step 5:** `bun --filter='@archon-studio/core' test structural`

**Reality:** This invocation bypasses the `--preload ./tests/setup.ts` that
initialises happy-dom, causing 96 DOM-component tests to fail with
`document is not defined`. The correct full-suite invocation is:

```sh
cd packages/studio-core && bun test --preload ./tests/setup.ts
```

or equivalently via the workspace script:
```sh
bun --filter='@archon-studio/core' run test
```

The structural tests themselves have no DOM dependency and pass with either
invocation. All 341 tests (318 baseline + 23 new structural) pass green with
the proper preload.

---

## Drift 6.1.7 — Duplicate-id issues intentionally share one `issueId`

**Observation (post-review):** when two nodes share a duplicate id, both
emitted `structural.id.duplicate` issues have the same `issueId` (because
`issueId(rule, path, message)` is given identical inputs for both —
`rule = 'structural.id.duplicate'`, `path.nodeId = '<the duplicate id>'`,
`message = 'Duplicate node id: "<id>".'`). The same applies to multiple
empty-id nodes, which all hash to the same `issueId` (rule + empty nodeId +
identical message).

**Intent:** this is by design. The ValidationPanel (Task 6.6) will show
**one row per unique issue**, and that row navigates to the first occurrence
of the offending id in the node list. A duplicate-id problem is conceptually
one issue ("ids `dup` is used by 2 nodes"), not N — so collapsing them via
shared `issueId` produces the desired UX:

- React key stability across re-renders (the panel row's identity persists).
- No "two identical rows pointing to the same problem" noise.
- Set-based dedup downstream (Task 6.4 engine) is a no-op for these.

The rule function still emits N raw `Issue` objects (one per duplicate-id
node), preserving their distinct `path.nodeId` references for any consumer
that wants to highlight every offending node in the canvas. Dedup at the
panel layer is opt-in via the shared `issueId`.

**If this UX choice is ever reversed** (e.g., "show one row per offending
node"), update `mk()` to include something node-disambiguating (an array
index or React Flow `internalId`) in the path, so each duplicate produces a
distinct `issueId`. Don't add it to the rule string — that would break the
"one rule = one user-facing problem class" invariant.

---

## Drift 6.2.1 — Decision-branch ref-integrity rule dropped (no routing edges in schema)

**Plan assumed:** A `decision` variant on `DagNode` with
`base.branches: Array<{ on: string; goto: string }>`. The plan's
`runGraphRules` walked these branch targets for ref-integrity
(lines 387–397 of the plan), and the spec included a
"flags unknown decision branch targets" test.

**Reality:** The `decision` variant does not exist in the current
`DagNode` schema. The discriminated union members are:
command, prompt, bash, script, loop, approval, cancel.
There are no routing edges (`on_success`, `on_failure`, `goto`)
at the schema level — `hooks` are SDK-style event handlers
(PreToolUse, PostToolUse, etc.), not flow-routing edges.

**What shipped:**
- The "flags unknown decision branch targets" test was dropped (5 tests
  instead of 6).
- The decision-branch loop in `graph.ts` was dropped (~10 lines shorter).
- Ref-integrity in `runGraphRules` is currently limited to `depends_on`
  — the only node-to-node reference field in the real schema.

**Follow-up:** If/when the schema gains decision-routing (e.g., a
`DecisionNode` with branch targets), add a new `graph.ref.branch.unknown`
rule and restore the dropped test. The `err()` helper and three-color DFS
in `graph.ts` are already in place; the branch loop is a straightforward
addition.

---

## Drift 6.3.1 — `when` and `depends_on` are flat on DagNode (plan assumed `base`)

**Plan assumed:**
```ts
const node = { id: 'a', type: 'prompt', base: { prompt: 'x', when: "..." } } as DagNode;
```
The plan's `whenRules()` read `(node.base as { when? }).when`.

**Reality:** Both `when` and `depends_on` are flat on the node (as established in
drift 6.1.1). `dagNodeBaseSchema` is a Zod schema name, not a runtime wrapper object.

**What shipped:** `whenRules()` reads `(node as unknown as Record<string, unknown>).when`.
Test helpers use flat shape: `{ id, prompt: body, depends_on: deps } as unknown as DagNode`.

---

## Drift 6.3.2 — `transitiveUpstream` adapter at call site

**Plan assumed:** `transitiveUpstream(node.id, nodes)` where `nodes` is `readonly DagNode[]`.

**Reality:** `transitiveUpstream` (written for Phase 5 BuilderNode) expects
`NodeLike { id: string; base?: { depends_on?: string[] } }`. Since DagNode has flat
`depends_on`, calling directly would return empty sets for every node.

**What shipped:** An adapter array is built once per `runContentRules` call:
```ts
const adapted = nodes.map(n => ({ id: n.id, base: { depends_on: n.depends_on } }));
```
`transitiveUpstream` is NOT refactored — keeping Phase 5 blast radius at zero.

---

## Drift 6.3.3 — `bodyText` reads explicit flat fields, not `Object.values(base)`

**Plan assumed:**
```ts
const base = (node.base ?? {}) as Record<string, unknown>;
return Object.values(base).filter((v): v is string => typeof v === 'string').join('\n');
```
This would also catch non-templated fields (e.g., `runtime`, `model`, `id`).

**Reality:** DagNode has no `base` wrapper, and iterating all string values would
capture condition strings (`when`, `loop.until`) and config identifiers that are not
user-authored template bodies.

**What shipped:** `bodyText()` reads only the fields that are genuinely templated
user content:

| Field | Node variant | Included |
|---|---|---|
| `prompt` | PromptNode | yes |
| `command` | CommandNode | yes |
| `bash` | BashNode | yes |
| `script` | ScriptNode | yes |
| `cancel` | CancelNode | yes |
| `approval.message` | ApprovalNode | yes (nested) |
| `loop.prompt` | LoopNode | yes (nested) |
| `when` | all variants | **no** — condition expression |
| `loop.until` | LoopNode | **no** — condition expression |
| `loop.max_iterations` | LoopNode | **no** — numeric config |

---

## Drift 6.3.4 — Shared `mk()` helper extracted to `validation/rules/helpers.ts`

**Background:** Task 6.2 code review flagged that `structural.ts` and `graph.ts`
each had a private `mk()`/`err()` issue factory with incompatible signatures,
making it hard to maintain consistent issue shape.

**What shipped:** A single shared factory in `packages/studio-core/src/validation/rules/helpers.ts`:
```ts
export function mk(rule, severity, source, path, message): Issue
```

Both `structural.ts` and `graph.ts` now delegate to this helper. Their local
wrappers remain (`mk()` in structural, `err()` in graph) to preserve call-site
signature compatibility — they now just forward to the shared helper.

The `issueId` hash inputs are `(rule, path, message)` only — severity and source
are NOT part of the hash. Refactoring these call sites does not perturb any
existing issue IDs. All 354 tests pass unchanged after the refactor.
