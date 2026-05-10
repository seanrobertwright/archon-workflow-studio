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
