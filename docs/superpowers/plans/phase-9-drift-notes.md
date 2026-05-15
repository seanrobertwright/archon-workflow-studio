# Phase 9 drift notes

## Drift 9.1: Phase 8 was on its own branch, not phase-7

**What the plan assumed:** "Execute on `phase-9` cut from current `phase-7` tip (Phase 8 work lives on `phase-7`)"
**What reality was:** Phase 8 had been completed on its own `phase-8` branch by the time Phase 9 began. The `phase-9` branch was cut from `phase-8` instead.
**How it was resolved:** Cut `phase-9` from `phase-8` tip — no functional impact.
**Takeaway for Phase 10:** Cut from the current phase branch (phase-9).

## Drift 9.2: Probe gate was deferred — Archon not available

**What the plan assumed:** "Phase 9 cannot start until docs/probes/2026-05-08-archon-endpoints.md has answers"
**What reality was:** The probe file existed but documented a deferred status — Archon was not running at probe time. The assumed endpoint table was used unchanged.
**How it was resolved:** Proceeded with assumed endpoints per plan fallback: "If Archon is not running: proceed with the assumed endpoint table below and note deviations when smoke-testing."
**Takeaway for Phase 10:** Live smoke against a real Archon instance is still pending. The assumed endpoint table (`/api/openapi.json`, `/api/workflows`, etc.) should be validated before Phase 10 adds new API calls.

## Drift 9.3: `toWorkflowDefinition` return type is `Record<string, unknown>`, not `WorkflowDefinition`

**What the plan assumed:** `toWorkflowDefinition(...)` output could be cast as `any` for `saveWorkflow`.
**What reality was:** `toWorkflowDefinition` returns `Record<string, unknown>` (under-typed). `saveWorkflow` expects `WorkflowDefinition`. The `as any` casts in the plan were replaced with `as WorkflowDefinition` for better type safety, which is structurally correct since the data round-trips through the builder store.
**How it was resolved:** Used `as WorkflowDefinition` cast. No runtime impact.
**Takeaway for Phase 10:** If `toWorkflowDefinition` gets a stronger return type in future, the cast can be removed cleanly.

## Drift 9.4: `source` stale state bug caught in code review

**What the plan assumed:** `const [source] = useState(routeState.source ?? 'project')` — plan used useState.
**What reality was:** React Router v7 reuses the component instance across same-path navigations. `useState` would have frozen `source` at first render, causing the wrong UI branch (e.g., bundled banner not showing after in-app navigation).
**How it was resolved:** Changed to a plain derived value: `const source = routeState.source ?? 'project'` — derived from `location.state` on every render.
**Takeaway for Phase 10:** Never use `useState` to capture `location.state` values — always derive them directly or add `location.key` to effect deps.

## Drift 9.5: Missing `location.key` in useEffect dependency array

**What the plan assumed:** `[name, settings.cwd, settings.archonUrl]` as the useEffect dep array.
**What reality was:** `routeState` (from `location.state`) was read inside the effect but not in deps. Without `location.key`, navigating to the same workflow name with different state would not re-trigger the load.
**How it was resolved:** Added `location.key` to the dep array. This ensures the load effect re-fires on every navigation entry, even to the same path.
**Takeaway for Phase 10:** Any useEffect that reads `location.state` (or route-derived state) needs `location.key` in its dep array.

## Drift 9.6: `saveStatus === 'error'` was set but not rendered

**What the plan assumed:** No explicit render for the `'error'` save status (plan only showed offline banner).
**What reality was:** The save handler correctly set `saveStatus('error')` on ArchonHttpError, but no JSX branch rendered anything for that state — silent failure.
**How it was resolved:** Added an error banner (red, using `--studio-error-bg`/`--studio-error-fg` CSS vars) for the `'error'` save status case.
**Takeaway for Phase 10:** Always trace every state value to a render path — missing render branches cause silent failures.

## Drift 9.7: Live smoke deferred — Archon unavailable

**What the plan assumed:** Task 9.9 Steps 3–9 require Archon running on localhost:3737.
**What reality was:** Archon was not available during Phase 9 development.
**How it was resolved:** Per plan: "stub-smoke against the existing StubArchonApiClient to verify the UI flow and note the live-smoke as a TODO." Dev server starts clean. Full connect/list/save flows are pending live Archon smoke.
**Takeaway for Phase 10:** Before starting Phase 10, run live smoke against a real Archon instance to validate the assumed endpoint table and confirm all flows end-to-end.
