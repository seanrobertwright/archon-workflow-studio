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
| `approval.message` | ApprovalNode | yes (nested) |
| `loop.prompt` | LoopNode | yes (nested) |
| `when` | all variants | **no** — condition expression |
| `loop.until` | LoopNode | **no** — condition expression |
| `loop.max_iterations` | LoopNode | **no** — numeric config |
| `cancel` | CancelNode | **no** — free-form prose (see below) |

**On `cancel` (post-review, Task 6.3 follow-up):** Initially scoped in, then
removed after reviewing Archon executor behavior. `cancel: string` on
`CancelNode` is a termination reason shown when the workflow aborts (see
`.research/archon-workflows.md` §3.7). There is no evidence the Archon
executor interpolates `{{ids...}}` references inside cancel reasons — it's
free-form prose, not a templated body. Including it risked spurious warnings
on cancel messages that legitimately mention node ids in prose
(e.g., `"User aborted: classify said no"`). Under-scanning is preferred to
over-warning; the rule (codified in `bodyText`'s maintainer comment) is to
add a field only when there's evidence the executor interpolates it.

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

---

## Drift 6.4.1 — `WorkflowApiClient.validateWorkflow` does not accept `AbortSignal`

**Plan assumed (stub signature):**
```ts
(def: unknown, signal?: AbortSignal) => Promise<{ valid: boolean; errors?: string[] }>
```
The stub in the spec has an optional `signal` parameter, implying the real client
might accept one for HTTP cancellation.

**Reality (`packages/studio-core/src/api/WorkflowApiClient.ts`):**
```ts
validateWorkflow(definition: WorkflowDefinition): Promise<ValidateResult>;
```
No `AbortSignal` parameter. The client interface is a pure data-in / data-out call
with no cancellation surface.

**What shipped:**
- `runServer()` creates an `AbortController` for local state tracking (`inflightAbort`)
  but does NOT pass `ac.signal` to `client.validateWorkflow`.
- The `AbortController.abort()` call in `scheduleDebounced` / the else-branch of
  `runDebounced` serves as a semantic marker ("a new run has superseded this one")
  rather than a real HTTP cancel.
- The monotonic sequence number (`mySeq !== this.seq`) is the effective stale-response
  guard. It handles the case where a backgrounded tab's promise resolves after abort()
  has been called and ignored.

**Test spec adaptation:** The stub client signature was narrowed to
`(def: unknown) => Promise<...>` (no `signal` parameter) to match reality.

---

## Drift 6.4.2 — Hardened `runDebounced` else-branch against stale server overwrites

**Plan code (else-branch when `hasClientErrors` is true):**
```ts
} else {
  this.isValidating = false;
  if (hasClientErrors) this.serverIssues = []; // drop stale server claims
  this.notify();
}
```

**Gap:** If a prior `runServer` is still in-flight when new client errors appear,
`this.seq` has not been bumped (seq only increments inside `runServer`). When the
stale promise resolves, `mySeq === this.seq` is true, so it overwrites the freshly-
cleared `serverIssues` with stale server data.

**What shipped:** The else-branch now aborts and bumps seq before clearing:
```ts
if (hasClientErrors) {
  this.inflightAbort?.abort();
  this.seq++;
  this.serverIssues = [];
}
this.isValidating = false;
this.notify();
```
This ensures any pending `runServer` sees `mySeq !== this.seq` and exits without
writing. **Test-covered as of post-review:** the
`clears serverIssues when client errors appear mid-server-call` test in
`engine.spec.ts` exercises this race directly — clean update → server call in
flight at t≈10ms → client error introduced at t≈25ms → second debounce at
t≈35ms aborts + bumps seq + clears `serverIssues` → stale resolve at t≈70ms is
dropped via the seq guard. Assertion: no server issue survives.

---

## Drift 6.4.3 — Server-tier issue construction: inline vs mkIssue

**Plan used inline object construction** for server issues:
```ts
{ id: issueId('server.unknown', {}, msg), rule: 'server.unknown', severity: 'error', source: 'server', ... }
```

**What shipped:** Same inline construction, for two reasons:
1. The `mk()` helper in `validation/rules/helpers.ts` is typed as accepting
   `RuleSource` (`'client-instant' | 'client-debounced' | 'server'`). Using it
   for server issues would work, but the helper lives in `./rules/helpers` and is
   primarily for rule modules — importing it into the engine would blur the
   module boundary.
2. Server issues are structurally simpler (always `source: 'server'`, always
   `path: {}`, always `severity: 'error'`) — the inline form is readable and
   doesn't benefit from the helper's abstraction.

`as const` casts were added to `severity` and `source` to satisfy the `Issue`
interface's string literal types without the helper.

---

## Drift 6.4.4 — Test helper uses `Partial<Record<string, unknown>>` for `over`

**Plan used:** `Partial<DagNode>` as the `over` parameter type in the `node()`
helper, which causes TypeScript errors when callers pass `depends_on` (not
present on all union members).

**What shipped:** `Partial<Record<string, unknown>>` matches the established
pattern from `structural.spec.ts` and avoids the union member type mismatch.
The cast `as unknown as DagNode` handles the type bridge.

---

## Drift 6.4.5 — Snapshot memoization contract (post-review C1)

**Background:** Code review (post-Task-6.4) flagged that `snapshot()` allocated
a fresh array+object on every call. Task 6.5 will pass `engine.snapshot` to
React's `useSyncExternalStore`, which requires the same reference between
unchanged states. A new object per call would trigger
`Warning: The result of getSnapshot should be cached to avoid an infinite
loop` and, in prod, can actually loop.

**What shipped:**
- Added `private cachedSnapshot: EngineSnapshot | null = null` and
  `private notifying = false` fields.
- `snapshot()` returns `cachedSnapshot` if set, else composes a new object and
  caches it.
- `notify()` invalidates `cachedSnapshot = null` BEFORE iterating listeners
  (so a listener that re-reads `snapshot()` sees the fresh value), and uses
  a `notifying` flag to prevent synchronous re-entrant notification storms
  (M2).
- Test `returns a stable snapshot reference between mutations` asserts
  `a === b` for back-to-back `snapshot()` calls with no intervening state
  change.

**Contract for Task 6.5:** `useSyncExternalStore(engine.subscribe, engine.snapshot)`
is safe — `snapshot()` returns a stable reference until the engine notifies,
at which point it returns a fresh reference once and caches it.

**Bonus hardening included in this round:**
- `dispose()` bumps `seq` (M1) so post-dispose server resolves no-op cleanly.
- `runServer`'s `finally` only clears `isValidating` when `!this.debounceTimer`
  (I2) — avoids flicker between server resolve and a queued debounce.
- Comment near server-issue construction notes the `|`-separator issueId
  caveat for unconstrained server messages (M3).

---

## Drift 6.5.1 — API client export is named `useWorkflowApi`, not `useApiClient`

**Plan assumed:** `useApiClient()` hook from `ApiClientProvider.tsx`.

**Reality:** The export is `useWorkflowApi(): WorkflowApiClient`. It throws
(`'useWorkflowApi must be used inside <ApiClientProvider>'`) when called
outside a provider. The plan's `useApiClient` does not exist.

**What shipped:** All references to `useApiClient` were replaced with
`useWorkflowApi`. Every render in the test spec is wrapped in
`<ApiClientProvider client={stubClient}>` since the hook is non-optional.

**Anticipated by dispatch:** Yes.

---

## Drift 6.5.2 — BuilderNode → DagNode conversion via `toWorkflowDefinition`

**Plan assumed:** `engine.update({ nodes })` where `nodes` is the raw
`BuilderNode[]` from the store. This fails — the engine expects `DagNode[]`
(flat shape), not `BuilderNode[]` (with `variant`, `data`, `base`, `unknown`
wrappers).

**Reality:** `toWorkflowDefinition({ meta, nodes })` returns
`Record<string, unknown>` where `result.nodes` is an array of flat DagNode-
shaped objects produced by each variant's `toDag()` method. This is the
correct conversion path.

**What shipped in `useValidation.ts`:**
```ts
const definition = workflow ? toWorkflowDefinition({ meta: workflow, nodes }) : undefined;
const dagNodes = (definition ? (definition.nodes as unknown[]) : []) as readonly DagNode[];
engine.update({ nodes: dagNodes, definition: definition as unknown as WorkflowDefinition });
```

When `workflow === null` (empty store), `definition` is `undefined`, `dagNodes`
is `[]`, and the server tier is never invoked (correct behavior for a clean slate).

**Anticipated by dispatch:** Yes.

---

## Drift 6.5.3 — `toWorkflowDefinition` return type is `Record<string, unknown>`, not `WorkflowDefinition`

**Plan:** passed `definition` typed as `WorkflowDefinition` to `engine.update`.

**Reality:** `toWorkflowDefinition` returns `Record<string, unknown>`. The engine
does not introspect `definition` — it only forwards it to
`client.validateWorkflow`. The type loosening is acceptable; a cast through
`unknown` is used at the call site.

**What shipped:** `definition as unknown as WorkflowDefinition` at the
`engine.update` call site. Documented at the call site in a comment.

**Anticipated by dispatch:** Yes.

---

## Drift 6.5.4 — Test fixtures required BuilderNode shape, not DagNode raw shape

**Plan's test fixture:**
```ts
nodes: [{ id: '', type: 'prompt', base: { prompt: 'x' } } as never]
```
This is the DagNode/wrong shape. `loadWorkflow` stores it verbatim, then
`toWorkflowDefinition` calls `getVariant(n.variant).toDag(n.data)` — `n.variant`
is `undefined`, which throws or produces garbage.

**What shipped:**
```ts
nodes: [{ id: '', variant: 'prompt', data: { prompt: 'x' }, base: {}, unknown: {} }]
```
This is the correct `BuilderNode` shape. It flows through `toWorkflowDefinition`
cleanly: `getVariant('prompt').toDag({ prompt: 'x' })` → `{ prompt: 'x' }`, and the
empty `id` is preserved through the `{ id: n.id, ...variantPart, ... }` spread,
triggering `structural.id.empty` correctly.

**Anticipated by dispatch:** Yes.

---

## Drift 6.5.5 — Snapshot stability confirmed; `getServerSnapshot` added

**`engine.snapshot()` returns the same reference between notifications** (drift
6.4.5). Passing `() => engine.snapshot()` directly to `useSyncExternalStore`
is safe.

**Additional:** A `getServerSnapshot` argument was added (same as `getSnapshot`)
to avoid React SSR typing issues. This matches the `useSyncExternalStore` API's
three-argument form: `subscribe, getSnapshot, getServerSnapshot`.

**Anticipated by dispatch:** Yes.

---

## Drift 6.5.6 — Engine lifecycle: one per mount, StrictMode-safe

**What shipped:** `useRef` lazy initializer pattern:
```ts
const engineRef = useRef<ValidationEngine | null>(null);
if (!engineRef.current) engineRef.current = new ValidationEngine({});
```
A separate `useEffect(() => () => { engine.dispose(); engineRef.current = null; }, [engine])`
disposes on unmount. In StrictMode (mount → unmount → remount), dispose fires
on the first unmount; the remount creates a fresh engine via the `if (!engineRef.current)`
guard. No zombie engines are possible.

The `engineRef.current = null` assignment in the cleanup ensures the ref is
cleared so the guard re-runs on the StrictMode remount.

**Anticipated by dispatch:** Yes.

---

## Drift 6.5.7 — Engine construction order: client passed at construction, not via setter

**Plan pattern (correct):** `new ValidationEngine({ client })` inside the
`useRef` lazy initializer.

**Initial implementation (incorrect — corrected in a follow-up commit):** the
hook constructed the engine with no client, then a `useEffect(() => { (engine
as unknown as { client }).client = client; }, [engine, client])` injected the
client after mount via a private-field cast. The stated rationale —
"`useWorkflowApi` is a hook that can't run before render" — was wrong: React
hooks run synchronously at the top of the render function, BEFORE any
`useEffect` fires. So `client` IS available during the `useRef` lazy-init on
the very first render. Calling `useWorkflowApi` first makes this explicit.

**Why this was a real bug:** React fires `useEffect` callbacks in declaration
order. The `[nodes, workflow]` effect was declared BEFORE the `[engine,
client]` injection effect, so on first render, `engine.update()` was called
with `this.client === undefined`. Result: the server validation tier was
silently skipped on first render until the next state change re-triggered the
`[nodes, workflow]` effect (by which time the injection effect had run). The
3 unit tests didn't catch this because they never asserted on server-tier
behavior — they only checked the instant tier.

**What shipped (after spec review fix):**
```ts
const client = useWorkflowApi();              // hook, runs synchronously first
const engineRef = useRef<ValidationEngine | null>(null);
if (!engineRef.current) {
  engineRef.current = new ValidationEngine({ client });   // client available here
}
```
The post-mount client-injection `useEffect` was deleted. Client identity is
stable across renders (the `WorkflowApiClient` is passed once into the
provider's value prop and held there for the lifetime of the
`ApiClientProvider` tree), so a single construction-time assignment is
sufficient.

**Anticipated by dispatch:** No — the dispatch documentation suggested the
plan's pattern would work; the initial implementation introduced this race
unnecessarily. Caught by spec review.

---

## Drift 6.5.8 — `IssuePath` local alias in builder-store (not-anticipated)

**Plan stated:** add `focusedIssue: IssuePath | null` to `BuilderState` where
`IssuePath` is imported from `validation/types`.

**Reality:** Importing `validation/types` from `builder-store` creates a
coupling from the store (which is used everywhere) to the validation layer. The
plan noted "DON'T import from `validation/types`" in the store slice description
but omitted the local alias in the interface.

**What shipped:** A local `IssuePath` type alias was added to `builder-store.ts`
with a doc comment explaining the intentional non-import:
```ts
export interface IssuePath {
  nodeId?: string;
  field?: string;
  atomIndex?: number;
}
```
This is structurally identical to `validation/types.IssuePath`. The store
exports `IssuePath` so `useValidation.ts` can import it from the store (not
from `validation/types`), avoiding the circular dependency
`validation/useValidation → validation/types → (fine)` vs. the reverse
`builder-store → validation/types → (tight coupling)`.

**Anticipated by dispatch:** Partially (the "don't import" part was noted but the
local alias solution wasn't spelled out).
