# Archon Workflows — Reference for a React Flow-Based Visual Builder

Source repo: https://github.com/coleam00/Archon (default branch: `main`)
Repo description: *"The first open-source harness builder for AI coding. Make AI coding deterministic and repeatable."*
Researched: 2026-05-08, against commit on `main` at the time of fetch.

> NOTE: This is the **current** Archon (TypeScript / Bun, "harness builder for AI coding"). It is *not* the older Python "task management + RAG" Archon, which has been moved to the [`archive/v1-task-management-rag`](https://github.com/coleam00/Archon/tree/archive/v1-task-management-rag) branch. Cited line numbers refer to files in `main` at fetch time.

---

## TL;DR

Archon is a TypeScript/Bun monorepo whose "workflows" are **YAML files** living in `.archon/workflows/` (project, `~/.archon/workflows/` global, or bundled with the binary). A workflow is a **DAG of nodes** — there is no separate edges array; every node lists its parents in `depends_on`. The canonical schema lives in `packages/workflows/src/schemas/` (Zod, exported via `@hono/zod-openapi`) and defines exactly **seven mutually-exclusive node variants**: `command`, `prompt`, `bash`, `script`, `loop`, `approval`, `cancel`. The variant is identified by which key is present (no `type` discriminant). Every node has a flat set of base fields (id, depends_on, when, trigger_rule, model, provider, context, output_format, allowed_tools, denied_tools, retry, hooks, mcp, skills, agents, effort, thinking, sandbox, idle_timeout, …). Conditional execution is via a `when:` string (`$nodeId.output[.field] == 'X' && …`); cross-node data flow is by string interpolation of `$nodeId.output` into prompts/bash. Persistence: workflows are YAML files on disk; **runs** live in a relational DB (SQLite/Postgres). The HTTP API is Hono + zod-openapi (`/api/workflows`, `/api/workflows/:name` GET/PUT/DELETE, `/api/workflows/validate` POST, `/api/workflows/:name/run` POST). The web UI (`packages/web/`, React 19 + `@xyflow/react` + `@dagrejs/dagre`) already has a builder at `/workflows/builder` — but it currently supports **only 3 of the 7 node types** (command/prompt/bash) on both import and export. Loop, approval, cancel, and script are first-class in the engine and YAML, missing in the visual builder. **That gap is the user's opportunity.**

---

## 1. Tech stack

**Languages & runtime**
- TypeScript everywhere (97.7% of repo).
- Runtime + package manager: **[Bun](https://bun.sh)** (`>=1.3.0`, see [`package.json`](https://github.com/coleam00/Archon/blob/main/package.json)).
- Repo layout: monorepo via Bun workspaces (`packages/*`).

**Backend** — `packages/server/`
- HTTP framework: **[Hono](https://hono.dev)** with `@hono/zod-openapi` for typed/openapi-documented routes ([`packages/server/package.json`](https://github.com/coleam00/Archon/blob/main/packages/server/package.json)).
- Auth, persistence, business logic split across siblings: `packages/core`, `packages/adapters`, `packages/git`, `packages/isolation`, `packages/providers`, `packages/paths`, `packages/workflows`.
- AI provider integration: `@anthropic-ai/claude-agent-sdk` is a root dependency ([`package.json`](https://github.com/coleam00/Archon/blob/main/package.json)) — the workflow engine drives Claude (and other registered providers via `@archon/providers`).

**Workflow engine** — `packages/workflows/`
- Pure-TS engine with a documented public surface (`./src/schemas/*`, `./src/loader`, `./src/executor`, `./src/dag-executor`, `./src/router`, `./src/validator`, `./src/workflow-discovery`) — see [`packages/workflows/package.json`](https://github.com/coleam00/Archon/blob/main/packages/workflows/package.json) `exports`.
- Validation: **Zod** (`zod ^3.25.28`) wrapped by `@hono/zod-openapi`.
- YAML parsing: **`Bun.YAML.parse`** (Bun's built-in YAML). See `parseYaml()` in [`packages/workflows/src/loader.ts:28-30`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/loader.ts#L28-L30).

**Frontend** — `packages/web/`
- **React 19 + Vite + TypeScript** ([`packages/web/package.json`](https://github.com/coleam00/Archon/blob/main/packages/web/package.json)).
- **React Flow** = `@xyflow/react ^12.10.1`.
- **dagre** = `@dagrejs/dagre ^2.0.4` for auto-layout.
- Routing: `react-router ^7`.
- Server state: `@tanstack/react-query ^5`.
- UI primitives: `radix-ui`, `lucide-react`, Tailwind 4, `tailwind-merge`, custom shadcn-style components.
- API types are generated from the server's OpenAPI spec via `openapi-typescript` (script: `generate:types` → `src/lib/api.generated.d.ts`).

**Persistence**
- **Workflow definitions are YAML files on disk** (NOT DB rows):
  - Bundled defaults embedded in the binary (built from `.archon/workflows/defaults/*.yaml` via [`scripts/generate-bundled-defaults.ts`](https://github.com/coleam00/Archon/blob/main/scripts/build-binaries.sh) — see `BUNDLED_WORKFLOWS` constant in `packages/workflows/src/defaults/bundled-defaults.generated.ts`).
  - `~/.archon/workflows/*.yaml` (global / "home scope").
  - `<repo>/.archon/workflows/*.yaml` (project scope).
  - Discovery walks at most 1 subfolder deep (`MAX_DISCOVERY_DEPTH = 1`); see [`packages/workflows/src/workflow-discovery.ts:81-89`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/workflow-discovery.ts#L81-L89). Precedence: `bundled < global < project` (same filename → higher scope wins).
- **Workflow runs and events** live in a relational DB. A SQL DB (SQLite locally; the repo also references Postgres) is accessed through `workflowDb` and `workflowEventDb` from `@archon/core` (see usages throughout [`packages/server/src/routes/api.ts`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/api.ts)). Tables include workflow_runs (status enum), workflow_events (per-step events), conversations, codebases, messages. Migrations live in `migrations/`.

**APIs**
- REST/JSON over Hono. OpenAPI spec served at `/api/openapi.json`.
- Workflow endpoints (full list in §7).
- No GraphQL.
- WebSockets / streaming: not in workflow API (the chat / orchestrator uses its own dispatch over the Hono adapter).

---

## 2. Workflow data model

### Top-level shape (canonical)

The canonical schema is defined in [`packages/workflows/src/schemas/workflow.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/workflow.ts). The relevant Zod schemas, verbatim:

```ts
// packages/workflows/src/schemas/workflow.ts

export const modelReasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']);
export const webSearchModeSchema = z.enum(['disabled', 'cached', 'live']);

export const workflowWorktreePolicySchema = z.object({
  enabled: z.boolean().optional(),
});

export const workflowBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  provider: z.string().trim().min(1).optional(),
  model: z.string().optional(),
  modelReasoningEffort: modelReasoningEffortSchema.optional(),
  webSearchMode: webSearchModeSchema.optional(),
  additionalDirectories: z.array(z.string()).optional(),
  interactive: z.boolean().optional(),
  effort: effortLevelSchema.optional(),
  thinking: thinkingConfigSchema.optional(),
  fallbackModel: z.string().min(1).optional(),
  betas: z.array(z.string().min(1)).nonempty(...).optional(),
  sandbox: sandboxSettingsSchema.optional(),
  worktree: workflowWorktreePolicySchema.optional(),
  mutates_checkout: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export const workflowDefinitionSchema = workflowBaseSchema.extend({
  nodes: z.array(dagNodeSchema),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema> & { prompt?: never };
```

### Top-level fields (a quick reference for the builder UI)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Used as the filename (`${name}.yaml`) and as the `/workflow run <name>` token. Must pass `isValidCommandName` (no `/`, `\`, `..`, leading `.`). |
| `description` | string | yes | Markdown-friendly. By convention starts with `Use when: … Triggers: … Does: … NOT for: …` (see any `archon-*.yaml` in `.archon/workflows/defaults/`). |
| `provider` | string | no | e.g. `claude`, `codex`, `minimax` (registered in `@archon/providers`). Workflow-level default; nodes can override. |
| `model` | string | no | e.g. `sonnet`, `haiku`, `opus[1m]`. Free-form string; SDK is source of truth. |
| `modelReasoningEffort` | `'minimal'\|'low'\|'medium'\|'high'\|'xhigh'` | no | Codex-style. |
| `webSearchMode` | `'disabled'\|'cached'\|'live'` | no | |
| `additionalDirectories` | string[] | no | Extra dirs the agent gets read access to. |
| `interactive` | boolean | no | Whether interactive loops / approvals can pause for human input. |
| `effort` | `'low'\|'medium'\|'high'\|'max'` | no | Claude SDK effort knob. |
| `thinking` | shorthand `'adaptive'\|'enabled'\|'disabled'` or `{type, budgetTokens?}` | no | Maps to Claude SDK `ThinkingConfig`. |
| `fallbackModel` | string | no | |
| `betas` | string[] | no | Beta header values forwarded to the SDK. |
| `sandbox` | object | no | Claude SDK `SandboxSettings`; FS / network restrictions. |
| `worktree.enabled` | boolean | no | Pin worktree isolation on/off for this workflow. |
| `mutates_checkout` | boolean | no | When `false`, skips path-exclusive run lock. |
| `tags` | string[] | no | UI/discovery tagging. |
| `nodes` | `DagNode[]` | yes | The DAG. **There is no separate `edges` array — edges are encoded in each node's `depends_on`.** |

### A concrete YAML example (the simplest realistic shape)

[`.archon/workflows/defaults/archon-feature-development.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-feature-development.yaml):

```yaml
name: archon-feature-development
description: |
  Use when: Implementing a feature from an existing plan.
  Input: Path to a plan file ($ARTIFACTS_DIR/plan.md) or GitHub issue containing a plan.
  Does: Implements the plan with validation loops -> creates pull request.
  NOT for: Creating plans (plans should be created separately), bug fixes, code reviews.

nodes:
  - id: implement
    command: archon-implement
    model: opus[1m]

  - id: create-pr
    command: archon-create-pr
    depends_on: [implement]
    context: fresh

  - id: verify-pr-base
    bash: |
      set -euo pipefail
      EXPECTED="$BASE_BRANCH"
      ACTUAL=$(gh pr view --json baseRefName -q '.baseRefName')
      if [ "$ACTUAL" != "$EXPECTED" ]; then
        PR_NUMBER=$(gh pr view --json number -q '.number')
        echo "Base mismatch on PR #$PR_NUMBER: expected=$EXPECTED actual=$ACTUAL — re-targeting" >&2
        gh pr edit "$PR_NUMBER" --base "$EXPECTED"
      else
        echo "PR base verified: $EXPECTED"
      fi
    depends_on: [create-pr]
```

A larger example showing **conditional `when:` branching, parallel fan-out, structured `output_format`, and `trigger_rule`** is [`archon-fix-github-issue.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-fix-github-issue.yaml) — relevant excerpts:

```yaml
- id: classify
  prompt: |
    You are an issue classifier. Analyze the GitHub issue below ...
    $fetch-issue.output
  depends_on: [fetch-issue]
  model: haiku
  allowed_tools: []
  output_format:
    type: object
    properties:
      issue_type:
        type: string
        enum: ["bug", "feature", "enhancement", "refactor", "chore", "documentation"]
      title:
        type: string
      reasoning:
        type: string
    required: [issue_type, title, reasoning]

- id: investigate
  command: archon-investigate-issue
  depends_on: [classify, web-research]
  when: "$classify.output.issue_type == 'bug'"
  context: fresh

- id: plan
  command: archon-create-plan
  depends_on: [classify, web-research]
  when: "$classify.output.issue_type != 'bug'"
  context: fresh

- id: bridge-artifacts
  bash: |
    if [ -f "$ARTIFACTS_DIR/plan.md" ] && [ ! -f "$ARTIFACTS_DIR/investigation.md" ]; then
      cp "$ARTIFACTS_DIR/plan.md" "$ARTIFACTS_DIR/investigation.md"
    fi
  depends_on: [investigate, plan]
  trigger_rule: one_success
```

A loop-node example, [`archon-test-loop-dag.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-test-loop-dag.yaml):

```yaml
name: archon-test-loop-dag
description: |
  Use when: User explicitly says "test-loop-dag" or "run test-loop-dag".

nodes:
  - id: setup
    bash: |
      echo "0" > .archon/test-loop-dag-counter.txt

  - id: loop-counter
    depends_on: [setup]
    loop:
      prompt: |
        Read the counter file, increment it, write it back. If the counter
        reaches 3 or higher, output: <promise>COMPLETE</promise>
      until: COMPLETE
      max_iterations: 5
      fresh_context: false

  - id: report
    depends_on: [loop-counter]
    prompt: |
      The loop output was: $loop-counter.output
      Read the file and confirm.
```

The README ([`README.md`](https://github.com/coleam00/Archon/blob/main/README.md)) shows an example combining loop + bash + interactive approval:

```yaml
nodes:
  - id: plan
    prompt: "Explore the codebase and create an implementation plan"

  - id: implement
    depends_on: [plan]
    loop:
      prompt: "Read the plan. Implement the next task. Run validation."
      until: ALL_TASKS_COMPLETE
      fresh_context: true

  - id: run-tests
    depends_on: [implement]
    bash: "bun run validate"

  - id: review
    depends_on: [run-tests]
    prompt: "Review all changes against the plan. Fix any issues."

  - id: approve
    depends_on: [review]
    loop:
      prompt: "Present the changes for review. Address any feedback."
      until: APPROVED
      interactive: true   # Pauses and waits for human input

  - id: create-pr
    depends_on: [approve]
    prompt: "Push changes and create a pull request"
```

---

## 3. Node types — every variant the engine supports

The engine recognizes **seven** node variants. They are mutually exclusive: a node carries exactly one of these keys (`command`, `prompt`, `bash`, `script`, `loop`, `approval`, `cancel`) — that key is also the *type discriminant*. There is **no `type:` field** in the YAML; the loader decides the variant by which key is present. Enforced in [`packages/workflows/src/schemas/dag-node.ts:418-466`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/dag-node.ts#L418-L466) (the `superRefine` step).

```ts
// packages/workflows/src/schemas/dag-node.ts:309-317

/** A single node in a DAG workflow. command, prompt, bash, loop, approval, cancel, and script are mutually exclusive. */
export type DagNode =
  | CommandNode
  | PromptNode
  | BashNode
  | LoopNode
  | ApprovalNode
  | CancelNode
  | ScriptNode;
```

### Shared base (every node has these)

```ts
// packages/workflows/src/schemas/dag-node.ts:132-167

export const dagNodeBaseSchema = z.object({
  id: z.string(),                               // required, non-empty after trim
  depends_on: z.array(z.string()).optional(),   // parent node IDs
  when: z.string().optional(),                  // conditional gating expression
  trigger_rule: triggerRuleSchema.optional(),   // 'all_success' | 'one_success' | 'none_failed_min_one_success' | 'all_done'
  model: z.string().optional(),
  provider: z.string().trim().min(1).optional(),
  context: z.enum(['fresh', 'shared']).optional(),
  output_format: z.record(z.unknown()).optional(),    // JSON Schema
  allowed_tools: z.array(z.string()).optional(),
  denied_tools: z.array(z.string()).optional(),
  idle_timeout: z.number().optional(),                // ms
  retry: stepRetryConfigSchema.optional(),
  hooks: workflowNodeHooksSchema.optional(),
  mcp: z.string().min(1).optional(),                  // path to MCP config JSON
  skills: z.array(z.string().min(1)).nonempty().optional(),
  agents: z.record(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), agentDefinitionSchema)
            .refine(map => Object.keys(map).length > 0).optional(),
  effort: effortLevelSchema.optional(),               // 'low'|'medium'|'high'|'max'
  thinking: thinkingConfigSchema.optional(),
  maxBudgetUsd: z.number().positive().optional(),
  systemPrompt: z.string().min(1).optional(),
  fallbackModel: z.string().min(1).optional(),
  betas: z.array(z.string().min(1)).nonempty().optional(),
  sandbox: sandboxSettingsSchema.optional(),
});
```

`triggerRuleSchema`:

```ts
// packages/workflows/src/schemas/dag-node.ts:23-33
export const triggerRuleSchema = z.enum([
  'all_success',                  // (default) fire only if every dep completed
  'one_success',                  // fire if at least one dep completed
  'none_failed_min_one_success',  // fire if no dep failed AND at least one completed
  'all_done',                     // fire when every dep is in a terminal state (regardless of pass/fail)
]);
```

`stepRetryConfigSchema` ([`packages/workflows/src/schemas/retry.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/retry.ts)):

```ts
export const stepRetryConfigSchema = z.object({
  max_attempts: z.number().int().min(1).max(5),  // 1–5
  delay_ms: z.number().min(1000).max(60000).optional(),  // base delay; doubled per attempt
  on_error: z.enum(['transient', 'all']).optional(),  // default 'transient'
});
```

Hooks ([`packages/workflows/src/schemas/hooks.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/hooks.ts)) are a record keyed by SDK hook event name:
`PreToolUse | PostToolUse | PostToolUseFailure | Notification | UserPromptSubmit | SessionStart | SessionEnd | Stop | SubagentStart | SubagentStop | PreCompact | PermissionRequest | Setup | TeammateIdle | TaskCompleted | Elicitation | ElicitationResult | ConfigChange | WorktreeCreate | WorktreeRemove | InstructionsLoaded`. Each maps to an array of `{ matcher?, response, timeout? }`.

`thinkingConfigSchema` accepts `'adaptive'|'enabled'|'disabled'` shorthand or an object form `{type: 'enabled', budgetTokens?: number}`.

### 3.1 CommandNode

```ts
// packages/workflows/src/schemas/dag-node.ts:173-185
export const commandNodeSchema = dagNodeBaseSchema.extend({
  command: z.string(),  // name of a markdown command file in .archon/commands/
});
```
Purpose: invoke a *named* prompt template that lives at `.archon/commands/<name>.md` (or `~/.archon/commands/<name>.md`, or bundled). The body of the markdown file becomes the AI prompt. The command name is validated via `isValidCommandName()` (no path separators, no leading `.`, no `..`).
Resolution precedence: repo `.archon/commands/` → `~/.archon/commands/` → bundled defaults. See [`packages/workflows/src/validator.ts:214-255`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/validator.ts#L214-L255).
YAML form:
```yaml
- id: implement
  command: archon-implement
  model: opus[1m]
```

### 3.2 PromptNode

```ts
// packages/workflows/src/schemas/dag-node.ts:187-199
export const promptNodeSchema = dagNodeBaseSchema.extend({
  prompt: z.string(),  // inline prompt text
});
```
Purpose: an inline, free-form AI prompt. Most common node type. Supports all AI base fields. `$nodeId.output` references in the body are interpolated (string substitution, not typed). When `output_format` is set (a JSON Schema), the AI's output is enforced to match — that JSON is what `$thisNode.output.field` accesses see.
YAML form:
```yaml
- id: classify
  prompt: |
    Classify this issue: $fetch-issue.output
  model: haiku
  allowed_tools: []
  output_format:
    type: object
    properties:
      issue_type: { type: string, enum: ["bug","feature"] }
    required: [issue_type]
```

### 3.3 BashNode

```ts
// packages/workflows/src/schemas/dag-node.ts:205-218
export const bashNodeSchema = dagNodeBaseSchema.extend({
  bash: z.string(),
  timeout: z.number().optional(),  // ms, must be > 0
});
```
Purpose: runs a shell script — **no AI involvement**. The output is captured into `$id.output`. AI-only base fields (model/provider/allowed_tools/skills/etc.) are accepted by the schema but **ignored at runtime with a warning** ([`packages/workflows/src/loader.ts:64-86`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/loader.ts#L64-L86); see also `BASH_NODE_AI_FIELDS` constant in [`dag-node.ts:324-342`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/dag-node.ts#L324-L342)).
YAML form: see `verify-pr-base` example above. Bash interpolation of upstream node outputs uses the same `$nodeId.output` syntax — Archon substitutes it before exec.

### 3.4 ScriptNode

```ts
// packages/workflows/src/schemas/dag-node.ts:225-240
export const scriptNodeSchema = dagNodeBaseSchema.extend({
  script: z.string().min(1),                   // either inline source or a NAMED script at .archon/scripts/<name>.{ts,py}
  runtime: z.enum(['bun', 'uv']),              // required
  deps: z.array(z.string().min(1)).optional(), // for uv only (bun auto-installs)
  timeout: z.number().optional(),              // ms
});
```
Purpose: like Bash but runs a TypeScript (`bun`) or Python (`uv`) script. AI-only fields ignored at runtime, same as bash. Named-script resolution uses the same scope-precedence as commands. Inline detection is in [`executor-shared.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/executor-shared.ts) (`isInlineScript`).
YAML form (named script):
```yaml
- id: gather-data
  script: maintainer-standup-gh-data
  runtime: bun
```
YAML form (inline):
```yaml
- id: gather-data
  script: |
    import { $ } from 'bun';
    console.log(await $`gh pr list --json number,title`.text());
  runtime: bun
```

### 3.5 LoopNode

```ts
// packages/workflows/src/schemas/dag-node.ts:247-249
export const loopNodeSchema = dagNodeBaseSchema.extend({
  loop: loopNodeConfigSchema,
});

// packages/workflows/src/schemas/loop.ts
export const loopNodeConfigSchema = z.object({
  prompt: z.string().min(1),                    // executed each iteration
  until: z.string().min(1),                     // completion-signal substring detected in AI output
  max_iterations: z.number().int().positive(),  // hard cap
  fresh_context: z.boolean().default(false),    // start fresh session each iteration
  until_bash: z.string().optional(),            // optional; exit 0 = treat as complete
  interactive: z.boolean().optional(),          // pause between iterations for human input
  gate_message: z.string().optional(),          // required when interactive: true
}).superRefine(/* gate_message required if interactive */);
```
Purpose: iterate an AI prompt until the model emits the `until` token, or `until_bash` exits 0, or `max_iterations` is reached. `interactive: true` turns it into a human-in-the-loop gate (state becomes `paused`; resume via `/api/workflows/runs/:runId/approve`). **`retry` is forbidden on loop nodes** — the loop manages its own iteration semantics ([`packages/workflows/src/schemas/dag-node.ts:507-514`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/dag-node.ts#L507-L514)).
Most AI-only base fields are honored on loop nodes — but per [`LOOP_NODE_AI_FIELDS`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/dag-node.ts#L347-L354) the executor explicitly only forwards `model` and `provider` to each iteration's AI call.
YAML form: see `loop-counter` and the README's `implement` / `approve` examples.

### 3.6 ApprovalNode

```ts
// packages/workflows/src/schemas/dag-node.ts:262-289
export const approvalOnRejectSchema = z.object({
  prompt: z.string().min(1),
  max_attempts: z.number().int().min(1).max(10).optional(),
});

export const approvalNodeSchema = dagNodeBaseSchema.extend({
  approval: z.object({
    message: z.string().min(1),                   // shown to the user
    capture_response: z.boolean().optional(),     // when true, user's reply becomes $thisNode.output
    on_reject: approvalOnRejectSchema.optional(), // run this prompt and re-prompt instead of cancelling
  }),
});
```
Purpose: hard pause; workflow status transitions to `paused` until `POST /api/workflows/runs/:runId/approve` or `…/reject` is called. If `on_reject` is set, rejection runs the rejection prompt and asks again (up to `max_attempts`, default 3) instead of cancelling. The pause context is stored as `metadata.approval: ApprovalContext` on the run row ([`packages/workflows/src/schemas/workflow-run.ts:111-141`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/workflow-run.ts#L111-L141)). AI-only base fields are ignored on approval nodes.
YAML form:
```yaml
- id: gate
  depends_on: [implement]
  approval:
    message: "Review the diff and approve to continue"
    capture_response: true
    on_reject:
      prompt: "Address the user's feedback and re-implement: $gate.rejection_reason"
      max_attempts: 3
```

### 3.7 CancelNode

```ts
// packages/workflows/src/schemas/dag-node.ts:295-307
export const cancelNodeSchema = dagNodeBaseSchema.extend({
  cancel: z.string().min(1),  // termination reason
});
```
Purpose: terminates the workflow with the given reason. Useful as the target of a `when:` branch (e.g., `when: "$classify.output.action == 'abort'"`). AI-only fields ignored.
YAML form:
```yaml
- id: bail
  depends_on: [classify]
  when: "$classify.output.action == 'cancel'"
  cancel: "User aborted via classifier"
```

### Variant matrix (cheat sheet for the Inspector)

| Variant | Discriminating key | Required extras | Common base fields it actually USES at runtime | AI-base fields IGNORED at runtime |
|---|---|---|---|---|
| Command | `command: <name>` | – | model, provider, context, output_format, allowed/denied_tools, hooks, mcp, skills, agents, effort, thinking, retry, idle_timeout, sandbox, ... | none |
| Prompt | `prompt: <text>` | – | same as Command | none |
| Bash | `bash: <script>` | optional `timeout` | retry, idle_timeout, depends_on, when, trigger_rule | provider, model, context, output_format, allowed_tools, denied_tools, hooks, mcp, skills, agents, effort, thinking, maxBudgetUsd, systemPrompt, fallbackModel, betas, sandbox |
| Script | `script: <code\|name>` + `runtime: bun\|uv` | optional `deps`, `timeout` | retry, idle_timeout, depends_on, when, trigger_rule | (same set as Bash) |
| Loop | `loop: { prompt, until, max_iterations, fresh_context?, until_bash?, interactive?, gate_message? }` | – | model, provider (only these AI fields are forwarded); idle_timeout; depends_on; when; trigger_rule | All AI fields except `model`/`provider`. `retry` is FORBIDDEN. |
| Approval | `approval: { message, capture_response?, on_reject? }` | – | depends_on, when, trigger_rule, retry, idle_timeout | (same set as Bash) |
| Cancel | `cancel: <reason>` | – | depends_on, when, trigger_rule, retry, idle_timeout | (same set as Bash) |

`AGENT_ID_REGEX` for inline `agents` map keys: `/^[a-z0-9]+(-[a-z0-9]+)*$/` — kebab-case, no leading/trailing/double hyphens.

---

## 4. Edge / connection model

**There is no edges array.** A workflow is `{...workflowBaseFields, nodes: DagNode[]}`. Edges are derived from each node's `depends_on: string[]`.

### Topology rules

Enforced server-side in [`validateDagStructure()`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/loader.ts#L96-L179) and client-side in [`useBuilderValidation`](https://github.com/coleam00/Archon/blob/main/packages/web/src/hooks/useBuilderValidation.ts):

1. **Unique IDs.** `Duplicate node id: '<id>'`.
2. **No dangling parents.** Every `depends_on` entry must point to a known node.
3. **No cycles.** Kahn's algorithm in both server (loader.ts:115-144) and client ([`dag-layout.ts:hasCycle()`](https://github.com/coleam00/Archon/blob/main/packages/web/src/lib/dag-layout.ts#L101-L142)).
4. **No self-loops.** Client-side check (server's Kahn's also catches these).
5. **`$nodeId.output` references in `when:` and prompt bodies must point to known nodes.** Prompt bodies have ` ``` `-fenced code blocks and inline backticks stripped before scanning, so docs-style examples don't trigger false positives.

### Conditional execution: `when:` and `trigger_rule`

- `when: "<expression>"` is evaluated AFTER the node's deps settle. If the expression is false (or unparseable — fail-closed), the node is **skipped** (state `skipped`, output `""`).
- `trigger_rule:` controls **whether the node is even considered** based on its parents' settling state — orthogonal to `when:`. Default `all_success`.

The expression grammar lives in [`packages/workflows/src/condition-evaluator.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/condition-evaluator.ts):

```
ATOM ::= '$' nodeId ('.output')? ('.' field)? OPERATOR "'" stringValue "'"
OPERATOR ::= == | != | < | > | <= | >=    (numeric ops require both sides parse as finite numbers)
EXPR ::= ATOM (('&&' | '||') ATOM)*       (no parentheses; '&&' has higher precedence)
```

Examples seen in real workflows:

```yaml
when: "$classify.output.issue_type == 'bug'"
when: "$classify.output.issue_type != 'bug'"
when: "$review-classify.output.run_test_coverage == 'true'"
```

`$nodeId.output.field` requires the upstream node to have set `output_format` and the AI to have produced JSON; the evaluator parses it on access ([`condition-evaluator.ts:46-58`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/condition-evaluator.ts#L46-L58)). On any parse error → `result: false` (fail-closed; node is skipped).

### Data flow between nodes

There is **no typed port system, no input/output schemas wired into edges**. Data passes between nodes as strings via `$nodeId.output` (and optionally `$nodeId.output.field` when the upstream produced JSON). Substitution is plain text replacement that happens just before the node executes — into:

- prompt bodies of `prompt` and `loop` nodes,
- `bash:` script bodies,
- `script:` bodies,
- the `when:` expression itself,
- `approval.message`.

The **command-args** substitution helper for `$ARGUMENTS`/`$1`..`$9`/`\$` lives separately in [`packages/workflows/src/utils/variable-substitution.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/utils/variable-substitution.ts) and is used to wire user-supplied invocation args into command prompts. (Distinct from the cross-node `$nodeId.output` flow.)

### Implication for the React Flow exporter

Each React Flow `Edge` collapses to: `target.depends_on.push(source.id)`. **There is no edge-level data, no typed handle, no port name** — just one logical "this is a parent of that". Multiple edges into a node ⇒ multiple entries in `depends_on`. Multiple edges out of a node ⇒ that source node id appears in multiple downstream `depends_on` arrays.

Archon's reference exporter does exactly this — see [`packages/web/src/components/workflows/WorkflowCanvas.tsx:reactFlowToDagNodes()`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/WorkflowCanvas.tsx#L31-L75):

```ts
export function reactFlowToDagNodes(rfNodes: DagFlowNode[], rfEdges: Edge[]): DagNode[] {
  return rfNodes.map(node => {
    const deps = rfEdges.filter(e => e.target === node.id).map(e => e.source);
    const dagBase = {
      id: node.id,
      depends_on: deps.length > 0 ? deps : undefined,
      when: node.data.when || undefined,
      trigger_rule: node.data.trigger_rule || undefined,
    };
    if (node.data.nodeType === 'bash') {
      return { ...dagBase, bash: node.data.bashScript ?? '', ...(node.data.bashTimeout ? { timeout: node.data.bashTimeout } : {}) } as DagNode;
    }
    const aiBase = {
      ...dagBase,
      model: node.data.model || undefined,
      provider: node.data.provider || undefined,
      context: node.data.context || undefined,
      output_format: node.data.output_format ?? undefined,
      allowed_tools: node.data.allowed_tools ?? undefined,
      denied_tools: node.data.denied_tools ?? undefined,
      hooks: node.data.hooks ?? undefined,
      mcp: node.data.mcp ?? undefined,
      skills: node.data.skills ?? undefined,
    };
    if (node.data.nodeType === 'command') {
      return { ...aiBase, command: node.data.label } as DagNode;
    }
    const promptText = node.data.promptText;
    return { ...aiBase, prompt: typeof promptText === 'string' ? promptText : '' } as DagNode;
  });
}
```

Note (and this is the gap the user's tool needs to close on the export side): this function only handles **command / prompt / bash**. It silently produces a default prompt node if the data has no recognized type, dropping `loop` / `approval` / `cancel` / `script` data even if the inspector were to provide it.

### React Flow ⇄ DagNode reference (the import side)

[`packages/web/src/lib/dag-layout.ts`](https://github.com/coleam00/Archon/blob/main/packages/web/src/lib/dag-layout.ts) — pasted in full because it's the canonical Archon implementation of "DagNode[] → React Flow nodes/edges + dagre layout":

```ts
import type { Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { DagNode } from '@/lib/api';
import type { DagFlowNode } from '@/components/workflows/DagNodeComponent';

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 80;

export function layoutWithDagre(nodes: DagFlowNode[], edges: Edge[]): { nodes: DagFlowNode[]; edges: Edge[] } {
  try {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
    for (const node of nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const edge of edges) g.setEdge(edge.source, edge.target);
    dagre.layout(g);
    const layoutedNodes = nodes.map(node => {
      const pos = g.node(node.id) as { x: number; y: number } | undefined;
      if (!pos) return node;
      return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
    });
    return { nodes: layoutedNodes, edges };
  } catch (err) {
    console.error('[dag-layout] Dagre layout failed, using fallback positions:', err);
    return { nodes, edges };
  }
}

export function resolveNodeDisplay(dn: DagNode): {
  label: string; nodeType: 'command' | 'prompt' | 'bash';
  promptText?: string; bashScript?: string; bashTimeout?: number;
} {
  if ('bash' in dn && dn.bash) return { label: 'Shell', nodeType: 'bash', bashScript: dn.bash, bashTimeout: dn.timeout };
  if ('command' in dn && dn.command) return { label: dn.command, nodeType: 'command' };
  return { label: 'Prompt', nodeType: 'prompt', promptText: dn.prompt };
}

export function dagNodesToReactFlow(dagNodes: readonly DagNode[]): { nodes: DagFlowNode[]; edges: Edge[] } {
  const nodes: DagFlowNode[] = dagNodes.map((dn, i) => ({
    id: dn.id,
    type: 'dagNode',
    position: { x: 0, y: i * 100 },
    data: { ...dn, ...resolveNodeDisplay(dn) },
  }));
  const edges: Edge[] = [];
  for (const dn of dagNodes) {
    for (const dep of dn.depends_on ?? []) {
      edges.push({ id: `${dep}->${dn.id}`, source: dep, target: dn.id, type: 'smoothstep' });
    }
  }
  const { nodes: layouted, edges: layoutedEdges } = layoutWithDagre(nodes, edges);
  return { nodes: layouted, edges: layoutedEdges };
}

export function hasCycle(nodeIds: Set<string>, edges: { source: string; target: string }[]): boolean {
  // ... Kahn's algorithm; full source in the file
}

export function computeTopologicalLayers(nodes: DagFlowNode[], edges: Edge[]): Map<string, number> {
  // ... topological-layer computation; full source in the file
}
```

`dagre` settings: `rankdir: 'TB'`, `ranksep: 80`, `nodesep: 40`, node size 180×80. Edges are rendered as `'smoothstep'`. Conditional edges (target node has `when:`) get a dashed purple stroke ([`WorkflowCanvas.tsx:121-135`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/WorkflowCanvas.tsx#L121-L135)).

### Single-handle topology

Each rendered node has **one target handle (top) + one source handle (bottom)** — see [`packages/web/src/components/workflows/DagNodeComponent.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/DagNodeComponent.tsx#L78-L119):

```tsx
<Handle type="target" position={Position.Top} className="!bg-accent !w-2 !h-2" />
...
<Handle type="source" position={Position.Bottom} className="!bg-accent !w-2 !h-2" />
```

So no "true/false" branches as separate handles — branching is purely via `when:` on each child. (You're free to model it differently in your own builder.)

---

## 5. Existing Web UI

### Where it lives

- Route: `/workflows/builder` ([`packages/web/src/App.tsx:76`](https://github.com/coleam00/Archon/blob/main/packages/web/src/App.tsx#L76)).
- Page: [`packages/web/src/routes/WorkflowBuilderPage.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/routes/WorkflowBuilderPage.tsx) (just renders `<WorkflowBuilder/>`).
- Main shell: [`packages/web/src/components/workflows/WorkflowBuilder.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/WorkflowBuilder.tsx).
- All sub-components: [`packages/web/src/components/workflows/`](https://github.com/coleam00/Archon/tree/main/packages/web/src/components/workflows). Notable files:
  - `WorkflowCanvas.tsx` — React Flow canvas, drag-drop from library, double-click quick-add.
  - `DagNodeComponent.tsx` — visual node renderer (single top/bottom handle, color stripe, badge, content preview, metadata pills).
  - `NodeLibrary.tsx` (left panel) — search + categorized commands; "Quick Nodes" section currently lists only **Prompt + Bash**.
  - `NodePalette.tsx` — older flat palette variant; same 3-type limitation.
  - `NodeInspector.tsx` (right panel) — tabbed editor (General / Execution / …).
  - `ValidationPanel.tsx` — "Problems" panel at the bottom.
  - `BuilderToolbar.tsx`, `StatusBar.tsx`, `YamlCodeView.tsx`, `QuickAddPicker.tsx`, `WorkflowCard.tsx`, `WorkflowList.tsx`, `WorkflowExecution.tsx`, `WorkflowDagViewer.tsx` (the run-time DAG visualizer), `StepLogs.tsx`, `ExecutionDagNode.tsx`, `DagNodeProgress.tsx`, `ArtifactSummary.tsx`, `ArtifactViewerModal.tsx`, `StatusIcon.tsx`, `WorkflowLogs.tsx`, `CommandPicker.tsx`.

### Framework / libraries

- React 19, Vite, TypeScript.
- React Flow (`@xyflow/react ^12.10.1`).
- dagre layout (`@dagrejs/dagre`).
- Tailwind 4 + shadcn-style primitives.
- TanStack Query for `/api/workflows`, `/api/commands`.

### What it can edit (the fields the Inspector exposes today)

[`packages/web/src/components/workflows/NodeInspector.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/NodeInspector.tsx) shows tabs:

- **General tab**: `id` (text), node type (`command`|`prompt`|`bash` only), command picker (for command nodes), prompt textarea, bash script + timeout, `depends_on` chip editor, `when` text input.
- **Execution tab**: provider, model, context (`fresh` | inherit), `trigger_rule`, `idle_timeout`, retry config (`max_attempts` 1–5, `delay_ms`, `on_error` enum). [Note: more fields appear later in the file — you have ~664 lines total — including hooks, MCP, skills, output_format, tools, etc., but the type discriminator only switches between `command`/`prompt`/`bash`.]

### **The gap (what this user needs to close)**

| Engine variant | Recognized at parse / executor? | Drag from `NodeLibrary`? | Editable in `NodeInspector`? | Round-trips through `reactFlowToDagNodes`? |
|---|---|---|---|---|
| `command` | yes | yes | yes | yes |
| `prompt` | yes | yes (Quick Node) | yes | yes |
| `bash` | yes | yes (Quick Node) | yes | yes |
| `script` | yes | **no** | **no** | **no** (silently coerced) |
| `loop` | yes | **no** | **no** | **no** |
| `approval` | yes | **no** | **no** | **no** |
| `cancel` | yes | **no** | **no** | **no** |

So a workflow loaded that contains a loop / approval / cancel / script node will display in the canvas but the inspector cannot edit those variants, and re-saving from the canvas will silently downgrade them to a prompt node. The new builder needs:

1. Drag/Quick-Add entries for `loop`, `approval`, `cancel`, `script`.
2. Inspector schemas for each (the fields enumerated in §3).
3. An exporter that fully covers all 7 variants — generalize `reactFlowToDagNodes` so the variant-discriminating key (`loop`, `approval`, `cancel`, `script`, …) is emitted from `node.data` instead of forcing one of `command`/`prompt`/`bash`.

### Provider list

The Inspector reads providers from `useProviders()` (hook in `packages/web/src/hooks/`); the registered providers are returned by `@archon/providers` (`getRegisteredProviders()`). Whatever the user has installed (e.g. `claude`, `codex`, `minimax`) appears in the dropdown.

---

## 6. Validation

There are **three levels** of validation, all of which the new builder should honor.

### Level 1 — Schema (Zod)
Done by `dagNodeSchema.safeParse(raw)` per node ([`packages/workflows/src/loader.ts:53`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/loader.ts#L53)). Catches:
- Empty / missing `id`.
- Node has zero or more than one of the 7 mode keys (mutual exclusivity).
- Empty mode bodies (`bash:""`, `prompt:""`, etc.).
- Invalid command names (path separators, leading dot, `..`).
- Script nodes missing `runtime`.
- Bash/script `timeout` ≤ 0 or non-finite.
- Loop nodes carrying a `retry:` (forbidden).
- `idle_timeout` ≤ 0 or non-finite.
- Interactive loop without `gate_message`.
- `agents` keys not kebab-case.
- Workflow-level: missing `name`/`description`, empty `nodes`, legacy `steps:` block (rejected with migration hint).
- Unknown providers (workflow- or node-level): hard error citing registered providers.
- `modelReasoningEffort` and `webSearchMode` outside the allowed enum: warned and ignored (not rejected).

### Level 2 — DAG structure
[`validateDagStructure()`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/loader.ts#L96-L179):
- Duplicate node IDs.
- `depends_on` pointing to unknown IDs.
- Cycles (Kahn's algorithm).
- `$nodeId.output` references in `when:` and prompt bodies (loop prompt bodies too) pointing to unknown nodes — markdown code blocks stripped first to avoid false positives.

### Level 3 — Resource resolution
[`packages/workflows/src/validator.ts: validateWorkflowResources()`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/validator.ts#L312-L534):
- Command nodes: resolves `<name>` against repo `.archon/commands/`, `~/.archon/commands/`, bundled defaults; error if missing, with Levenshtein-based "did you mean" suggestions (top 3 close matches).
- MCP nodes: file at `mcp:` path exists and is JSON; warning if the resolved provider doesn't support MCP (`getProviderCapabilities(provider).mcp`).
- Skills nodes: skill folder exists at `.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/<name>/SKILL.md` (user). Warning, not error.
- Capability warnings: `hooks`, `agents`, `allowed_tools`/`denied_tools` reported as warnings if the chosen provider doesn't support them.
- Script nodes: named-script file exists in repo or home scope with the right runtime; runtime binary (`bun` / `uv`) on PATH (warning if not).

### Where each level runs

- **Server-side** during workflow discovery / import: Levels 1 + 2 always run (loader rejects on any failure). Level 3 is run on demand by the validator (used by CLI and the explicit validate endpoint).
- **POST `/api/workflows/validate`** ([`packages/server/src/routes/api.ts:2191-2217`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/api.ts#L2191-L2217)): serializes the body to YAML via `Bun.YAML.stringify(definition)` and calls `parseWorkflow()` (Levels 1+2). Response: `{ valid: boolean, errors?: string[] }` ([schema](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/schemas/workflow.schemas.ts#L62-L68)). Note: this path runs Levels 1+2 only; Level 3 (resource resolution) is reached via the CLI `archon validate` command path or by the orchestrator at run time.
- **Client-side**, as the user types: [`packages/web/src/hooks/useBuilderValidation.ts`](https://github.com/coleam00/Archon/blob/main/packages/web/src/hooks/useBuilderValidation.ts). Two passes:
  - **Instant** (every render): name required, description required, nodes ≥ 1, bash/prompt body non-empty.
  - **Debounced** (300 ms): duplicate IDs; broken edge endpoints; self-loops; cycle detection; broken `$nodeId.output` references in `when` and prompt bodies.

The web Builder calls the server's `/api/workflows/validate` on demand (Validate button) and right before save ([`WorkflowBuilder.tsx:269-307`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/WorkflowBuilder.tsx#L269-L307)).

---

## 7. Import mechanism

Workflows enter a running Archon installation by **writing a YAML file into a directory Archon discovers**. Two supported entry points:

### 7.1 Drop a file on disk
- Project scope: `<repo>/.archon/workflows/<name>.yaml`.
- Global / home scope: `~/.archon/workflows/<name>.yaml`.
- The file's basename (sans `.yaml`) becomes the workflow's discoverable name. (Filenames inside one level of subfolders, like `defaults/foo.yaml`, are also discovered — any deeper nesting is silently ignored.)
- After dropping the file, the next call to `GET /api/workflows` (or any orchestrator dispatch) re-runs `discoverWorkflowsWithConfig()` and picks it up.

### 7.2 REST API (what the existing UI uses)

All defined in [`packages/server/src/routes/api.ts`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/api.ts) and schemas in [`packages/server/src/routes/schemas/workflow.schemas.ts`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/schemas/workflow.schemas.ts):

| Method | Path | Purpose | Body / Query | Lines |
|---|---|---|---|---|
| GET | `/api/workflows?cwd=…` | List discovered workflows + load errors. Returns `{ workflows: [{workflow, source}], errors? }`. | `cwd` validated against registered codebase paths. | api.ts:1758-1792 |
| POST | `/api/workflows/validate` | Validate a workflow definition without saving. | `{ definition: <WorkflowDefinition raw>}` | api.ts:2193-2217 |
| GET | `/api/workflows/:name?cwd=…` | Fetch a workflow by name (project → bundled fallback). Returns `{ workflow, filename, source }`. | – | api.ts:2220-2300 |
| **PUT** | **`/api/workflows/:name?cwd=…`** | **Save (create or update) — this is the import endpoint.** Stringifies the JSON definition to YAML via `Bun.YAML.stringify`, parses with `parseWorkflow` to validate, writes to `<cwd>/.archon/workflows/<name>.yaml`. Refuses bundled defaults names? No — they can be shadowed; only DELETE refuses bundled names. | `{ definition: <WorkflowDefinition>}` | api.ts:2303-2356 |
| DELETE | `/api/workflows/:name?cwd=…` | Delete a project-scoped workflow file. Refuses bundled names. | – | api.ts:2359-2397 |
| GET | `/api/commands?cwd=…` | List command names available for the palette (with source: project/global/bundled). | – | api.ts:2400-… |
| POST | `/api/workflows/:name/run` | Dispatch a run via the orchestrator (creates a run row, runs the DAG). | `{ conversationId: string, message: string }` | api.ts:1795-1835 |
| GET | `/api/workflows/runs?…` | List runs (filterable). | query: conversationId, status, codebaseId, limit | api.ts:2092-… |
| GET | `/api/workflows/runs/:runId` | Run detail with events. | – | api.ts:2143-… |
| GET | `/api/workflows/runs/by-worker/:platformId` | Look up a run by the worker's platform ID. | – | api.ts:2127-… |
| POST | `/api/workflows/runs/:runId/cancel` | Cancel running/pending/paused run. | – | api.ts:1881-1897 |
| POST | `/api/workflows/runs/:runId/resume` | Resume a `failed`/`paused` run. | – | api.ts:1900-1920 |
| POST | `/api/workflows/runs/:runId/abandon` | Abandon a non-terminal run. | – | api.ts:1923-1939 |
| POST | `/api/workflows/runs/:runId/approve` | Approve a paused run (approval node). | `{ comment?: string }` | api.ts:1941-2005 |
| POST | `/api/workflows/runs/:runId/reject` | Reject a paused run; runs `on_reject` if configured. | `{ reason?: string }` | api.ts:2007-2067 |
| DELETE | `/api/workflows/runs/:runId` | Delete a terminal run. | – | api.ts:2069-… |
| GET | `/api/dashboard/runs` | Enriched dashboard listing (joins codebases/conversations). | query: status, search, after, before, limit, offset | api.ts:1839-1878 |

**Import contract for the user's tool**: PUT `/api/workflows/<name>?cwd=<absolute-path-to-registered-codebase>` with body
```json
{ "definition": <a JSON object that matches workflowDefinitionSchema> }
```
The server runs `Bun.YAML.stringify(definition)` then `parseWorkflow()`. If valid, the YAML is written; on success the response is the parsed workflow back ([`getWorkflowResponseSchema`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/schemas/workflow.schemas.ts#L45-L51)). On failure, `400` with the validation error message.

The `name` path param must satisfy `isValidCommandName` — no `/`, `\`, `..`, no leading `.`. The `cwd` query param must match a registered codebase's `default_cwd`; if omitted the server falls back to the first codebase, and finally to `getArchonHome()` (`~/.archon`).

> **Tip for the user's tool**: avoid sending YAML directly — send the JSON that infers `WorkflowDefinition`. The server is the one that converts to YAML on disk, which means the YAML on disk gets a canonical Bun-stringified format (no comments, normalized field order). If preserving comments / author-formatted YAML matters, write to disk yourself instead of going through PUT.

### CLI

The CLI (`packages/cli/`) ships a `workflow` command set. The README's quick-install path uses `archon` CLI to validate / run workflows; under the hood it shares the same loader/validator/executor and reads the same on-disk YAML files — there is no separate CLI-only import format.

---

## 8. Execution model (brief)

Just the parts that inform validation and node design.

- **Async / queued.** A run is created (DB row in `workflow_runs`) and dispatched through the orchestrator. The CLI / web both block conceptually, but the executor is event-driven (see [`packages/workflows/src/event-emitter.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/event-emitter.ts) and per-step `workflow_events` rows).
- **DAG executor** ([`packages/workflows/src/dag-executor.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/dag-executor.ts), 2700+ lines): walks the DAG with topological scheduling; settles parents before children; respects `trigger_rule` and `when:`. Sibling nodes whose deps are all settled execute in parallel where possible. Each node emits `node_started`, `node_completed`, `node_failed`, etc. events.
- **Run status enum** (canonical, [`packages/workflows/src/schemas/workflow-run.ts:10-17`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/workflow-run.ts#L10-L17)): `pending | running | completed | failed | cancelled | paused`. Terminal: `completed | failed | cancelled`. Resumable: `failed | paused`.
- **Node state enum** (per-step): `pending | running | completed | failed | skipped`. `output: string` is captured for completed/failed/running; empty for pending/skipped.
- **Pause semantics**: an approval node — or an interactive loop — sets the run to `paused` and writes an `ApprovalContext` into `workflow_runs.metadata.approval` (`{ nodeId, message, type?: 'approval'|'interactive_loop', captureResponse?, onRejectPrompt?, onRejectMaxAttempts?, ... }`). The corresponding HTTP routes (`/approve`, `/reject`) consume that context and emit `approval_received` events; on approval the executor writes a `node_completed` event for the approval node and the DAG continues. For interactive loops, the executor (not the API) writes `node_completed` only when the loop's `until` signal actually fires.
- **Isolation / worktrees**: each run typically gets its own git worktree (`@archon/isolation`), unless `worktree.enabled: false` is set on the workflow. This is invisible to node authors; workflows operate against `cwd = <worktree path>`.
- **Provider resolution**: per-node > per-workflow > config default; loader/validator hard-error on unregistered providers. Models pass through to the SDK as opaque strings.
- **Cross-node data**: there is no shared structured state — only the `$nodeId.output` string substitution mechanism plus `workflow_run.metadata` for engine-set values (PR number, ARTIFACTS_DIR, etc.).
- **Resume on next dispatch**: when a run is `failed` and the user re-issues the workflow, the executor auto-resumes from completed nodes via `priorCompletedNodes` ([`api.ts:1899-1920`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/api.ts#L1899-L1920) + dag-executor logic).

---

## 9. Quick checklist for the React Flow exporter (synthesis)

What a "workflow studio" replacement / augmentation needs to honor:

1. **No edges array**: serialize only `nodes[]`; encode each edge as `target.depends_on.push(source)`. Sort `depends_on` for stable diffs.
2. **Variant discriminators**: `command | prompt | bash | script | loop | approval | cancel`. Pick exactly one per node. The variant key carries the body (string for `command`/`prompt`/`bash`/`script`/`cancel`, object for `loop`/`approval`).
3. **Round-trip safely**: parse a workflow → preserve unknown base fields (mcp, skills, hooks, agents, output_format, sandbox, betas, fallbackModel, systemPrompt, …) on the React Flow node so re-saving doesn't drop them. The current Archon builder drops most of these silently.
4. **Layout**: dagre `rankdir: 'TB'`, `ranksep: 80`, `nodesep: 40`, node 180×80; smoothstep edges; dashed edge when target has `when`. Mirror this for visual consistency, or pick your own — but expose a layout reset.
5. **Validate locally** (mirror `useBuilderValidation` rules + cycle detection) before any network round-trip.
6. **Use the server validator** (`POST /api/workflows/validate`) to confirm Levels 1+2 with the canonical Zod parser. Pass the JSON definition; receive `{valid, errors?[]}`.
7. **Save** via `PUT /api/workflows/<name>?cwd=<registered cwd>` body `{definition}`. Names must be `isValidCommandName`-clean. To avoid touching a registered Archon installation, you can equivalently write the YAML to `<repo>/.archon/workflows/<name>.yaml` directly (use a YAML library that respects multi-line `|`-block scalars for prompts and bash bodies — Archon's YAML is heavy on those).
8. **`when:` editor**: provide structured help (target node id picker + operator + value) — the grammar is restricted to atomic comparisons of `$id.output` or `$id.output.field` against single-quoted string literals, joined by `&&`/`||` (no parens, AND > OR).
9. **Approval / loop / cancel / script** are the high-value missing UI affordances — design dedicated inspector panels for each (fields in §3).
10. **Dependency picker UX**: existing builder uses a tag chip editor for `depends_on`. With React Flow handles you don't need that, but it's still useful as a backup for node IDs that aren't currently visible (or as a scriptable alternative when a node was renamed).
11. **Provider/model autocomplete**: hit `GET /api/providers` (and the workflow-builder's own `useProviders()` hook in `packages/web/src/hooks/useProviders.ts` for the structure) to populate the dropdowns.
12. **Commands palette**: hit `GET /api/commands?cwd=<cwd>` to list resolvable command names, partitioned by source (`project | global | bundled`).

---

## 10. File-level reference index

Schemas (server-side truth):
- [`packages/workflows/src/schemas/workflow.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/workflow.ts) — top-level `WorkflowDefinition`.
- [`packages/workflows/src/schemas/dag-node.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/dag-node.ts) — every node variant + base fields.
- [`packages/workflows/src/schemas/loop.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/loop.ts) — loop config.
- [`packages/workflows/src/schemas/retry.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/retry.ts) — `stepRetryConfigSchema`.
- [`packages/workflows/src/schemas/hooks.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/hooks.ts) — per-node hook events.
- [`packages/workflows/src/schemas/workflow-run.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/workflow-run.ts) — run status, node state, ApprovalContext.
- [`packages/workflows/src/schemas/index.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/schemas/index.ts) — re-exports (`DagWorkflow` is an alias for `WorkflowDefinition`).

Engine:
- [`packages/workflows/src/loader.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/loader.ts) — YAML→Zod parsing, structure validation.
- [`packages/workflows/src/validator.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/validator.ts) — Level-3 resource validation.
- [`packages/workflows/src/dag-executor.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/dag-executor.ts) — DAG runner.
- [`packages/workflows/src/condition-evaluator.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/condition-evaluator.ts) — `when:` grammar.
- [`packages/workflows/src/workflow-discovery.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/workflow-discovery.ts) — bundled/global/project precedence.
- [`packages/workflows/src/utils/variable-substitution.ts`](https://github.com/coleam00/Archon/blob/main/packages/workflows/src/utils/variable-substitution.ts) — `$ARGUMENTS`, `$1`..`$9` for command args.

Server / API:
- [`packages/server/src/routes/api.ts`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/api.ts) — all HTTP handlers.
- [`packages/server/src/routes/schemas/workflow.schemas.ts`](https://github.com/coleam00/Archon/blob/main/packages/server/src/routes/schemas/workflow.schemas.ts) — request/response shapes.

Web (existing builder):
- [`packages/web/src/App.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/App.tsx) — routes (`/workflows/builder`).
- [`packages/web/src/routes/WorkflowBuilderPage.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/routes/WorkflowBuilderPage.tsx).
- [`packages/web/src/components/workflows/WorkflowBuilder.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/WorkflowBuilder.tsx) — shell.
- [`packages/web/src/components/workflows/WorkflowCanvas.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/WorkflowCanvas.tsx) — React Flow + `reactFlowToDagNodes` exporter.
- [`packages/web/src/components/workflows/DagNodeComponent.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/DagNodeComponent.tsx) — node renderer.
- [`packages/web/src/components/workflows/NodeLibrary.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/NodeLibrary.tsx) and [`NodePalette.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/NodePalette.tsx) — left palettes.
- [`packages/web/src/components/workflows/NodeInspector.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/NodeInspector.tsx) — right inspector (only handles 3 variants today).
- [`packages/web/src/components/workflows/ValidationPanel.tsx`](https://github.com/coleam00/Archon/blob/main/packages/web/src/components/workflows/ValidationPanel.tsx).
- [`packages/web/src/lib/dag-layout.ts`](https://github.com/coleam00/Archon/blob/main/packages/web/src/lib/dag-layout.ts) — dagNodes ↔ React Flow + dagre + cycle detection.
- [`packages/web/src/hooks/useBuilderValidation.ts`](https://github.com/coleam00/Archon/blob/main/packages/web/src/hooks/useBuilderValidation.ts) — client-side validation (instant + debounced).
- [`packages/web/src/lib/command-categories.ts`](https://github.com/coleam00/Archon/blob/main/packages/web/src/lib/command-categories.ts) — left-palette grouping.

Real-world workflow examples to study:
- [`.archon/workflows/defaults/archon-feature-development.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-feature-development.yaml) — minimal command + bash.
- [`.archon/workflows/defaults/archon-fix-github-issue.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-fix-github-issue.yaml) — full DAG with `when:`, `output_format`, `trigger_rule: one_success`, parallel review fan-out.
- [`.archon/workflows/defaults/archon-test-loop-dag.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-test-loop-dag.yaml) — loop node demo.
- [`.archon/workflows/defaults/archon-piv-loop.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-piv-loop.yaml) — large interactive workflow (~27 KB).
- [`.archon/workflows/defaults/archon-workflow-builder.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/defaults/archon-workflow-builder.yaml) — meta: a workflow that *generates* workflows.
- [`.archon/workflows/test-workflows/e2e-pi-all-nodes-smoke.yaml`](https://github.com/coleam00/Archon/blob/main/.archon/workflows/test-workflows/e2e-pi-all-nodes-smoke.yaml) — smoke covering every node type (worth pulling for a builder fixture).
