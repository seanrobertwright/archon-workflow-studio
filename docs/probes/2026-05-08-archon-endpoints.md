# Archon endpoint probe — 2026-05-08 (deferred)

**Status:** Deferred. Archon was not running at probe time. Re-run with `bun run probe-archon > docs/probes/<today>-archon-endpoints.md` once Archon is reachable on `localhost:3737`. The probe script is at `scripts/probe-archon-endpoints.ts`.

The probe must capture, at minimum, results for these endpoints (all `GET`):

- `/api/openapi.json` — confirms server running + provides full API surface for Phase 9
- `/api/codebases` — branch point: 200/array unlocks dropdown UX, 404 means manual cwd field is primary, 401/403 means auth-required
- `/api/workflows` — confirms workflow CRUD endpoints exist
- `/api/commands` — confirms command listing for the NodeLibrary in Phase 3

Plus a CORS check with Origin `http://localhost:5173` and an auth note.

## Branching table (Phase 9 implications, captured here so future-me has it)

| `/api/codebases` returned | Phase 9 implication                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `200` with a JSON array   | Implement dropdown picker as primary cwd UX.                                                                                             |
| `404`                     | Manual-cwd field is primary; dropdown deferred to v1.5 upstream contribution.                                                            |
| `401` or `403`            | Phase 9 settings UI must collect a token (e.g., bearer header); connect screen surfaces auth-required state distinctly from "wrong URL." |
| `5xx` or fetch failed     | Defer interpretation; re-run probe under healthier conditions.                                                                           |

The same branching applies to other endpoints that return 401/403 — Archon may have a single auth posture covering all routes.

## Gate

Phase 0 closes regardless of this step (round-trip test is independent). Phase 9 cannot start until this file has positive answers for at least the codebase + auth questions.

---

## YAML equivalence probe (ran successfully — Archon not required)

# YAML equivalence probe

Source: `packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml`

## bun-out chars / pkg-out chars

Bun.YAML.stringify: 961 bytes
yaml package: 1050 bytes

## Result: NOT byte-equivalent — diff below

### Bun output

```yaml
{
  name: archon-feature-development,
  description: "Use when: Implementing a feature from an existing plan.\nInput: Path to a plan file ($ARTIFACTS_DIR/plan.md) or GitHub issue containing a plan.\nDoes: Implements the plan with validation loops -> creates pull request.\nNOT for: Creating plans (plans should be created separately), bug fixes, code reviews.\n",
  nodes:
    [
      { id: implement, command: archon-implement, model: 'opus[1m]' },
      { id: create-pr, command: archon-create-pr, depends_on: [implement], context: fresh },
      {
        id: verify-pr-base,
        bash: "set -euo pipefail\nEXPECTED=\"$BASE_BRANCH\"\nACTUAL=$(gh pr view --json baseRefName -q '.baseRefName')\nif [ \"$ACTUAL\" != \"$EXPECTED\" ]; then\n  PR_NUMBER=$(gh pr view --json number -q '.number')\n  echo \"Base mismatch on PR #$PR_NUMBER: expected=$EXPECTED actual=$ACTUAL — re-targeting\" >&2\n  gh pr edit \"$PR_NUMBER\" --base \"$EXPECTED\"\nelse\n  echo \"PR base verified: $EXPECTED\"\nfi\n",
        depends_on: [create-pr],
      },
    ],
}
```

### yaml-package output

```yaml
name: archon-feature-development
description: >
  Use when: Implementing a feature from an existing plan.

  Input: Path to a plan file ($ARTIFACTS_DIR/plan.md) or GitHub issue containing
  a plan.

  Does: Implements the plan with validation loops -> creates pull request.

  NOT for: Creating plans (plans should be created separately), bug fixes, code
  reviews.
nodes:
  - id: implement
    command: archon-implement
    model: opus[1m]
  - id: create-pr
    command: archon-create-pr
    depends_on:
      - implement
    context: fresh
  - id: verify-pr-base
    bash: >
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
    depends_on:
      - create-pr
```

**Interpretation:** `Bun.YAML.stringify` emits JSON-style flow format (single-line, no indentation) while the `yaml` package emits block format (multi-line, human-readable). The `yaml` package output is round-trip-safe and matches Archon's own YAML style. **Use the `yaml` npm package (`yamlPkg.stringify`) for all serialisation in `studio-core`; avoid `Bun.YAML.stringify` for workflow YAML output.**
