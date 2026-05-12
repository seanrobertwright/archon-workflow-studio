# Phase 10 — Tests, CI, docs, release polish: Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the project for external use — fill the Phase 9 zero-test gap for the three standalone route components, add typecheck to CI, write consumer-facing READMEs, bump package versions to `0.9.0`, and add `publishConfig` to the two publishable packages.

**Architecture notes:**
- `apps/standalone` has no unit test infrastructure. Tests land in `apps/standalone/tests/` using the same stack as `packages/studio-core/tests/`: `bun:test` + `@testing-library/react` + `@happy-dom/global-registrator`. Need to add those devDependencies and update the `test` script.
- Route component tests require: `MemoryRouter` (react-router), `QueryClientProvider` (@tanstack/react-query), `ApiClientProvider` (@archon-studio/core). Pattern follows `WorkflowBuilder.spec.tsx`.
- BuilderPage wraps `<WorkflowBuilder>` — its test focuses on load/save status UI only; the inner canvas is covered by `@archon-studio/core` tests.
- CI `ci.yml` currently skips typecheck — add `bun --filter='*' run typecheck` after build.
- Packages `@archon-studio/core` and `@archon-studio/api-archon` are at `0.0.0` — bump to `0.9.0` + add `publishConfig: { access: 'public' }`.

**Tech stack:** same as Phases 7–9. No new packages except adding `@testing-library/react`, `@happy-dom/global-registrator`, `react-router` (for MemoryRouter in tests) to `apps/standalone` devDependencies.

**Drift discipline:** Verify file shapes before editing. After execution, write `docs/superpowers/plans/phase-10-drift-notes.md`.

**Test environment quirks carried forward:**
- `@testing-library/react` `cleanup()` is NOT auto-called by bun-test — every React spec needs `afterEach(() => cleanup())`.
- Transient store slices must be reset in `afterEach`.
- JSDOM cannot make real network calls — mock the API client via `noopClient` pattern.

**Branch:** Execute on `phase-10` cut from `phase-9` tip. Tag `phase-10` after Task 10.8; push pending user.

**Test target:** ~549 → ~575 (+~26 new unit tests for the three standalone route components).

---

## File map

| Status | Path | Responsibility |
|---|---|---|
| **Modify** | `apps/standalone/package.json` | Add test infra deps + `test` script |
| **Create** | `apps/standalone/tests/ConnectPage.spec.tsx` | Unit tests for ConnectPage |
| **Create** | `apps/standalone/tests/WorkflowListPage.spec.tsx` | Unit tests for WorkflowListPage |
| **Create** | `apps/standalone/tests/BuilderPage.spec.tsx` | Unit tests for BuilderPage load/save status |
| **Modify** | `.github/workflows/ci.yml` | Add typecheck step |
| **Create** | `README.md` | Root README — project overview + getting started |
| **Create** | `packages/studio-core/README.md` | `@archon-studio/core` API surface + usage |
| **Create** | `packages/studio-api-archon/README.md` | `@archon-studio/api-archon` usage |
| **Modify** | `packages/studio-core/package.json` | Bump `0.0.0` → `0.9.0` + publishConfig |
| **Modify** | `packages/studio-api-archon/package.json` | Bump `0.0.0` → `0.9.0` + publishConfig |
| **Create** | `CHANGELOG.md` | Initial changelog |
| **Create** | `docs/superpowers/plans/phase-10-drift-notes.md` | Drift notes |

---

## Chunk 1: Test infrastructure + route component tests

### Task 10.0: Phase-9 reality check (read-only verification)

**Files:** None.

- [ ] **Step 1: Confirm test baseline**

```bash
bun --filter='*' run test 2>&1 | tail -8
```
Expected: 527 pass (@archon-studio/core) + 22 pass (@archon-studio/api-archon) + 0 (standalone echoes) = 549 total. Record count.

- [ ] **Step 2: Confirm standalone has no tests**

```bash
cat apps/standalone/package.json | grep '"test"'
```
Expected: `echo 'no unit tests in apps/standalone (Playwright lives in e2e/)' && exit 0`

- [ ] **Step 3: Confirm route files exist**

```bash
ls apps/standalone/src/routes/
```
Expected: `ConnectPage.tsx`, `WorkflowListPage.tsx`, `BuilderPage.tsx`.

- [ ] **Step 4: Confirm CI has no typecheck**

```bash
cat .github/workflows/ci.yml | grep typecheck
```
Expected: no output (typecheck is missing).

---

### Task 10.1: Standalone test infrastructure

**Files:**
- Modify: `apps/standalone/package.json`

- [ ] **Step 1: Add devDependencies**

Add to `devDependencies` in `apps/standalone/package.json`:
```json
"@testing-library/react": "^16.0.0",
"@happy-dom/global-registrator": "^15.0.0"
```

(react-router is already in `dependencies`; `bun:test` is built-in.)

- [ ] **Step 2: Update test script**

Replace:
```json
"test": "echo 'no unit tests in apps/standalone (Playwright lives in e2e/)' && exit 0"
```
with:
```json
"test": "bun test tests/"
```

- [ ] **Step 3: Install and verify**

```bash
bun install
bun --filter='@archon-studio/standalone' run test 2>&1 | tail -5
```
Expected: `0 pass, 0 fail` (no test files yet).

---

### Task 10.2: ConnectPage unit tests

**Files:**
- Create: `apps/standalone/tests/ConnectPage.spec.tsx`

> Before writing: skim `apps/standalone/src/routes/ConnectPage.tsx` to confirm the form fields, button labels, error message, and step machine.

```
grep -n "step\|error\|archonUrl\|cwd\|Test Connection\|Open workflows" apps/standalone/src/routes/ConnectPage.tsx | head -20
```

Create `apps/standalone/tests/ConnectPage.spec.tsx`:

```tsx
import { describe, it, expect, beforeAll, afterEach, mock } from 'bun:test';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ConnectPage } from '../src/routes/ConnectPage';
import { useConnectionStore } from '../src/connection-store';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ settings: null, pingStatus: null });
  globalThis.localStorage?.clear();
});

function renderConnect(initialUrl = '/connect') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/workflows" element={<div data-testid="workflows-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConnectPage', () => {
  it('renders the form with default Archon URL', () => {
    renderConnect();
    expect(screen.getByPlaceholderText(/localhost/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /test connection/i })).toBeTruthy();
  });

  it('shows error when fetch rejects (Archon not running)', async () => {
    // mock global fetch to reject
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => { throw new TypeError('Failed to fetch'); });
    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/could not reach archon/i)).toBeTruthy();
    });
    globalThis.fetch = origFetch;
  });

  it('shows error when Archon returns 5xx', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: false, status: 500,
      json: async () => ({}),
      text: async () => '',
    } as Response));
    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/archon returned 500/i)).toBeTruthy();
    });
    globalThis.fetch = origFetch;
  });

  it('shows cwd input after successful ping when listCodebases returns null (404)', async () => {
    const origFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = mock(async (url: string) => {
      callCount++;
      if (url.includes('/api/openapi.json')) {
        return { ok: true, status: 200, json: async () => ({ info: { version: '2.0.0' } }) } as Response;
      }
      // listCodebases → 404
      return { ok: false, status: 404, json: async () => 'Not Found', text: async () => '' } as Response;
    });
    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeTruthy();
    });
    expect(screen.getByPlaceholderText(/home\/user\/my-project/i)).toBeTruthy();
    globalThis.fetch = origFetch;
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
bun --filter='@archon-studio/standalone' run test 2>&1 | tail -8
```
Expected: 4 pass, 0 fail.

---

### Task 10.3: WorkflowListPage unit tests

**Files:**
- Create: `apps/standalone/tests/WorkflowListPage.spec.tsx`

> Before writing: skim `WorkflowListPage.tsx` to confirm the query key, loading/error UI text, and list item rendering.

```bash
grep -n "isLoading\|error\|data\|No workflows\|workflow\.name\|handleNew\|handleDelete" apps/standalone/src/routes/WorkflowListPage.tsx | head -20
```

The component uses `useWorkflowApi()` (from `ApiClientProvider`) and `useConnectionStore`. Wrap with `MemoryRouter + ApiClientProvider + QueryClientProvider`.

```tsx
import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider } from '@archon-studio/core';
import type { WorkflowApiClient } from '@archon-studio/core';
import { WorkflowListPage } from '../src/routes/WorkflowListPage';
import { useConnectionStore } from '../src/connection-store';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ settings: null, pingStatus: null });
});

const SETTINGS = { archonUrl: 'http://localhost:3737', cwd: '/home/test', token: '' };

function makeClient(overrides: Partial<WorkflowApiClient> = {}): WorkflowApiClient {
  return {
    ping: async () => ({ ok: true }),
    listCodebases: async () => null,
    listWorkflows: async () => [],
    listCommands: async () => [],
    listProviders: async () => [],
    getWorkflow: async () => ({ name: 'w', description: '', nodes: [] }) as never,
    saveWorkflow: async (_n, _c, d) => d,
    deleteWorkflow: async () => undefined,
    validateWorkflow: async () => ({ valid: true }),
    ...overrides,
  };
}

function renderList(client: WorkflowApiClient) {
  useConnectionStore.setState({ settings: SETTINGS, pingStatus: 'ok' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApiClientProvider client={client}>
        <MemoryRouter initialEntries={['/workflows']}>
          <Routes>
            <Route path="/workflows" element={<WorkflowListPage />} />
            <Route path="/builder/:name" element={<div data-testid="builder" />} />
            <Route path="/connect" element={<div data-testid="connect" />} />
          </Routes>
        </MemoryRouter>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('WorkflowListPage', () => {
  it('shows loading state initially', () => {
    const client = makeClient({
      listWorkflows: () => new Promise(() => {}), // never resolves
    });
    renderList(client);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('renders workflow names after load', async () => {
    const items = [
      { workflow: { name: 'classify', description: '', nodes: [] }, source: 'project' },
      { workflow: { name: 'summarise', description: '', nodes: [] }, source: 'global' },
    ] as never;
    const client = makeClient({ listWorkflows: async () => items });
    renderList(client);
    await waitFor(() => {
      expect(screen.getByText('classify')).toBeTruthy();
      expect(screen.getByText('summarise')).toBeTruthy();
    });
  });

  it('shows error message when listWorkflows rejects', async () => {
    const client = makeClient({
      listWorkflows: async () => { throw new Error('Network error'); },
    });
    renderList(client);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });
});
```

> **Drift note:** if `WorkflowListPage` shows different text for loading or error states, adjust the assertions to match the actual strings.

- [ ] **Step 3: Run**

```bash
bun --filter='@archon-studio/standalone' run test 2>&1 | tail -8
```
Expected: 7 pass, 0 fail.

---

### Task 10.4: BuilderPage unit tests

**Files:**
- Create: `apps/standalone/tests/BuilderPage.spec.tsx`

BuilderPage is heavy (loads WorkflowBuilder + React Flow). Focus on the **load/error/save-status UI** only — not the inner canvas (already covered by core tests).

> Before writing: skim `BuilderPage.tsx` for: the error banner selector, the save status text values (`saved`, `offline`, `error`), and the `data-testid` if any.

```bash
grep -n "loadError\|saveStatus\|data-testid\|SaveStatus\|banner\|saved\|offline" apps/standalone/src/routes/BuilderPage.tsx | head -20
```

Tests:
1. Shows "Loading…" while `getWorkflow` is pending
2. Shows error banner when `getWorkflow` rejects  
3. Renders without crashing for a valid loaded workflow (smoke)

Wrap with `MemoryRouter + ReactFlowProvider + QueryClientProvider + ApiClientProvider`. Import `ReactFlowProvider` from `@xyflow/react`.

- [ ] **Step 2: Run all standalone tests**

```bash
bun --filter='@archon-studio/standalone' run test 2>&1 | tail -8
```
Expected: ~10–12 pass, 0 fail.

---

## Chunk 2: CI + docs + release polish

### Task 10.5: CI typecheck

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add typecheck step**

In `ci.yml`, after the `build` step and before `test`, add:
```yaml
      - run: bun --filter='@archon-studio/core' run typecheck
      - run: bun --filter='@archon-studio/api-archon' run typecheck 2>/dev/null || true
```

The `|| true` on api-archon handles the case where it has no typecheck script yet. If it does have one, remove the `|| true`.

> Verify first:
```bash
cat packages/studio-api-archon/package.json | grep typecheck
```

If `@archon-studio/api-archon` has a `typecheck` script: add it without `|| true`.

- [ ] **Step 2: Verify the updated ci.yml is valid YAML**

```bash
cat .github/workflows/ci.yml
```

---

### Task 10.6: READMEs

**Files:**
- Create: `README.md`
- Create: `packages/studio-core/README.md`
- Create: `packages/studio-api-archon/README.md`

- [ ] **Step 1: Root README**

Create `README.md` at repo root. Include:
- Project name + one-sentence description
- Screenshot placeholder (note: real screenshot TBD after smoke with live Archon)
- Quick start: `bun install && bun --filter='@archon-studio/standalone' run dev` → open `localhost:5173`
- Package overview table (studio-core, studio-api-archon, standalone)
- Link to phase plans in `docs/superpowers/plans/`
- Test + build badges (GitHub Actions)

- [ ] **Step 2: `@archon-studio/core` README**

Create `packages/studio-core/README.md`. Include:
- What it exports (WorkflowBuilder, NodeInspector, useBuilderStore, useUndoStore, ThemePicker, etc.)
- Minimal usage example showing `<WorkflowBuilder client={...} archonUrl="..." cwd="..." workflowName="..." />`
- Note about peer deps (React 19, @xyflow/react)

- [ ] **Step 3: `@archon-studio/api-archon` README**

Create `packages/studio-api-archon/README.md`. Include:
- What it exports (`ArchonApiClient`, `StubArchonApiClient`, `ArchonHttpError`)
- Construction: `new ArchonApiClient({ baseUrl, authHeader? })`
- Note about injecting `fetchFn` for testing

---

### Task 10.7: Release polish

**Files:**
- Modify: `packages/studio-core/package.json`
- Modify: `packages/studio-api-archon/package.json`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Bump versions + publishConfig**

In both `packages/studio-core/package.json` and `packages/studio-api-archon/package.json`:
- Change `"version": "0.0.0"` → `"version": "0.9.0"`
- Add after `"version"`:
```json
"publishConfig": {
  "access": "public"
},
```

- [ ] **Step 2: Create CHANGELOG.md**

At repo root, create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.9.0] — 2026-05-12

### Added
- WorkflowBuilder shell with dagre layout, node library, canvas, inspector (Phases 2–4)
- Visual `when:` condition builder with autocomplete (Phase 5)
- Validation pipeline with live error panel (Phase 6)
- YAML preview pane with CodeMirror 6, cross-highlight, search (Phase 7)
- Editor polish: undo/redo, multi-select, copy/paste, alignment, smart guides, theme picker, variant picker (Phase 8)
- Connected mode: connect screen, workflow list, BuilderPage CRUD, offline save queue (Phase 9)

### Packages
- `@archon-studio/core` — 0.9.0
- `@archon-studio/api-archon` — 0.9.0
```

- [ ] **Step 3: Verify build still passes**

```bash
bun --filter='*' run build 2>&1 | tail -5
```

---

### Task 10.8: Final verification + drift notes + tag

**Files:**
- Create: `docs/superpowers/plans/phase-10-drift-notes.md`

- [ ] **Step 1: Run full verification gates**

```bash
bun --filter='*' run test 2>&1 | tail -8
bun --filter='*' run build 2>&1 | tail -5
bun run format:check 2>&1 | tail -3
bun --filter='@archon-studio/core' run typecheck 2>&1 | tail -3
```

All must be green. Expected test count: ~575.

- [ ] **Step 2: Write drift notes**

Create `docs/superpowers/plans/phase-10-drift-notes.md`. Mirror `phase-9-drift-notes.md` format. Document any deviations from this plan.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(phase-10): route tests, CI typecheck, READMEs, version 0.9.0"
```

- [ ] **Step 4: Tag locally**

```bash
git tag -a phase-10 -m "Phase 10 — Tests, CI, docs, release polish: v0.9.0"
```

---

## Closing notes

**Smoke gate:** Live smoke against a real Archon instance is deferred (same as Phase 9). Once the correct Archon URL/port is known, run the Phase 9 smoke steps plus the new route component flows (connect → list → builder round-trip).

**Memory write:** after tagging, update `MEMORY.md` with `phase-10-complete.md`.
