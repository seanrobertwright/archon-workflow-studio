# Phase 9 — Connected Mode: connect, list, save — Implementation Plan

> **For agentic workers:** REQUIRED: Use lril-superpowers:subagent-driven-development (if subagents available) or lril-superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 2 stub/smoke-fixture wiring with a real Archon connection — connect screen, workflow list, and full CRUD flows against a live localhost Archon instance.

**Architecture:** A new `useConnectionStore` (Zustand + localStorage, mirrors `theme-store.ts` pattern) holds `{archonUrl, cwd, token}` and drives a `createBrowserRouter` route tree: `/connect`, `/workflows`, `/builder/:name`. `ArchonApiClient` gains real `fetch` implementations for all 9 `WorkflowApiClient` methods behind an injected `fetchFn` (enables unit tests without a live Archon). The standalone `App.tsx` is replaced with router + provider wiring. An offline save queue (`save-queue.ts`) catches network failures and retries on reconnect. React Query v5 handles server state on the workflow list page.

**Tech Stack:** TypeScript + React 19 (existing); Zustand v5 (existing); `react-router` v7 — already in `apps/standalone/package.json`, no install needed; `@tanstack/react-query` v5 — already in `apps/standalone/package.json`, no install needed; `bun:test` — new to `@archon-studio/api-archon`; `@testing-library/react` (existing in `@archon-studio/core`).

**Probe gate:** Phase 9 cannot start until `docs/probes/2026-05-08-archon-endpoints.md` has answers for the codebase-listing and auth questions. The probe is still deferred. Run it first:

```bash
bun run probe-archon 2>&1 | tee "docs/probes/$(date +%F)-archon-endpoints.md"
```

If Archon is not running: proceed with the assumed endpoint table below and note deviations when smoke-testing in Task 9.9.

**Assumed endpoint URLs (unverified — update `EP` constant in Task 9.2 Step 5 if probe results differ):**

| `WorkflowApiClient` method | HTTP | Path |
|---|---|---|
| `ping()` | GET | `/api/openapi.json` |
| `listCodebases()` | GET | `/api/codebases` |
| `listWorkflows(cwd)` | GET | `/api/workflows?cwd=<cwd>` |
| `listCommands(cwd)` | GET | `/api/commands?cwd=<cwd>` |
| `listProviders()` | GET | `/api/providers` |
| `getWorkflow(name, cwd)` | GET | `/api/workflows/<name>?cwd=<cwd>` |
| `saveWorkflow(name, cwd, def)` | PUT | `/api/workflows/<name>?cwd=<cwd>` |
| `deleteWorkflow(name, cwd)` | DELETE | `/api/workflows/<name>?cwd=<cwd>` |
| `validateWorkflow(def)` | POST | `/api/validate` |

**Reference skills:** `@lril-superpowers:test-driven-development`, `@lril-superpowers:verification-before-completion`, `@lril-superpowers:systematic-debugging`.

**Drift discipline:** Verify file shapes before editing; capture deviations inline. After execution, write `docs/superpowers/plans/phase-9-drift-notes.md` (mirror `phase-7-drift-notes.md` format).

**Test environment quirks carried forward from Phase 7/8:**
- Workspace package name is `@archon-studio/core` (NOT `@archon-studio/studio-core`).
- `@testing-library/react` `cleanup()` is NOT auto-called by bun-test — every React spec needs `afterEach(() => cleanup())`.
- Transient store slices must be reset in `afterEach` to prevent cross-file leaks.
- JSDOM cannot make real network calls — all `ArchonApiClient` tests inject a mock `fetchFn`.
- Bun `mock.module` is process-wide and leaks across files; prefer structural injection over module-level mocks.

**Branch:** Execute on `phase-9` cut from current `phase-7` tip (Phase 8 work lives on `phase-7`, consistent with the established tagging practice). Tag `phase-9` after Task 9.9; push pending user.

**Test target:** ~25 new unit tests in `@archon-studio/api-archon` (21 explicit `it()` blocks in Task 9.2 plus any drift-driven additions). The `@archon-studio/core` suite stays at **527** (no new core components this phase). Total after phase: **527 + ~25 = ~552**.

---

## File map

| Status | Path | Responsibility |
|---|---|---|
| **Create** | `packages/studio-api-archon/src/errors.ts` | `ArchonHttpError` typed error class |
| **Modify** | `packages/studio-api-archon/src/ArchonApiClient.ts` | Replace 9 throwing stubs with real fetch |
| **Modify** | `packages/studio-api-archon/src/index.ts` | Re-export `ArchonHttpError` |
| **Modify** | `packages/studio-api-archon/package.json` | Add `"test": "bun test tests/"` |
| **Create** | `packages/studio-api-archon/tests/ArchonApiClient.spec.ts` | TDD coverage for all 9 methods |
| **Create** | `apps/standalone/src/connection-store.ts` | Zustand + localStorage for connection settings |
| **Create** | `apps/standalone/src/save-queue.ts` | Offline save queue (localStorage-backed) |
| **Modify** | `apps/standalone/src/App.tsx` | Router tree + providers (replaces smoke harness) |
| **Create** | `apps/standalone/src/routes/ConnectPage.tsx` | `/connect` — URL + cwd + Test button |
| **Create** | `apps/standalone/src/routes/WorkflowListPage.tsx` | `/workflows` — list + New / Fork / Delete |
| **Create** | `apps/standalone/src/routes/BuilderPage.tsx` | `/builder/:name` — loads workflow, wires onSave |

---

## Chunk 1: Phase 9 — Connected mode

### Task 9.0: Phase-8 reality check (read-only verification)

**Files:** None.

- [ ] **Step 1: Confirm test baseline**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -5
```
Expected: **527 pass, 0 fail**. Record the count. If fewer than 527 pass, investigate before continuing.

- [ ] **Step 2: Confirm ArchonApiClient stubs are still in place**

```bash
grep -n "not yet implemented" packages/studio-api-archon/src/ArchonApiClient.ts
```
Expected: 9 lines (one per method). If any have been partially filled, note the deviation.

- [ ] **Step 3: Confirm WorkflowBuilder onSave + toWorkflowDefinition**

```bash
grep -n "onSave" packages/studio-core/src/components/WorkflowBuilder.tsx | head -5
grep "toWorkflowDefinition" packages/studio-core/src/index.ts
```
Expected: `onSave?: () => void` in `WorkflowBuilderProps`; `toWorkflowDefinition` exported from index. Task 9.7 (BuilderPage) calls these.

- [ ] **Step 4: Confirm react-router + React Query already installed**

```bash
grep -E '"react-router"|"@tanstack/react-query"' apps/standalone/package.json
```
Expected: both present (`^7.0.0` and `^5.0.0`). No `bun add` needed.

- [ ] **Step 5: Confirm Vite proxy config**

```bash
grep -A3 "proxy" apps/standalone/vite.config.ts
```
Expected: `/api` → `http://localhost:3737` (via `VITE_ARCHON_URL` env, defaulting to that value). **This proxy is for convenience only.** `ArchonApiClient` always uses the full `baseUrl` from the connection store — it does NOT route through the Vite proxy. For localhost-to-localhost requests (browser on 5173, Archon on 3737), CORS is typically not enforced since Archon is a local dev tool. No special handling needed in Phase 9; if CORS does block a request in the smoke test, note it as a drift entry and the user can configure Archon accordingly.

- [ ] **Step 6: Run probe (if Archon is running)**

```bash
bun run probe-archon 2>&1 | tee "docs/probes/$(date +%F)-archon-endpoints.md"
```
If Archon is not running: skip and proceed with assumed endpoints. Document the gate status.

---

### Task 9.1: `errors.ts` + api-archon test infra

**Files:**
- Create: `packages/studio-api-archon/src/errors.ts`
- Modify: `packages/studio-api-archon/package.json`

- [ ] **Step 1: Create `errors.ts`**

Create `packages/studio-api-archon/src/errors.ts`:

```ts
export class ArchonHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
    this.name = 'ArchonHttpError';
  }
}
```

- [ ] **Step 2: Add test script to package.json**

In `packages/studio-api-archon/package.json`, replace:
```json
"test": "echo 'no tests yet — Phase 9 wires real implementations' && exit 0"
```
with:
```json
"test": "bun test tests/"
```

Also create the `tests/` directory — it will hold `ArchonApiClient.spec.ts` from Task 9.2.

- [ ] **Step 3: Confirm bun can find the package**

```bash
bun --filter='@archon-studio/api-archon' run test 2>&1 | tail -5
```
Expected: `0 pass, 0 fail` (no tests yet). If the filter fails, check the `name` field in `package.json`.

---

### Task 9.2: ArchonApiClient — real fetch + TDD

**Files:**
- Create: `packages/studio-api-archon/tests/ArchonApiClient.spec.ts`
- Modify: `packages/studio-api-archon/src/ArchonApiClient.ts`
- Modify: `packages/studio-api-archon/src/index.ts`

> **Before editing `ArchonApiClient.ts`:** confirm `ArchonApiClientOptions` still has `fetchFn?: typeof fetch` (introduced in Phase 0). If not, add it — the tests depend on it.
>
> ```bash
> grep -n "fetchFn\|authHeader" packages/studio-api-archon/src/ArchonApiClient.ts
> ```

- [ ] **Step 1: Write the failing tests**

Create `packages/studio-api-archon/tests/ArchonApiClient.spec.ts`:

```ts
import { describe, it, expect, mock } from 'bun:test';
import { ArchonApiClient } from '../src/ArchonApiClient';
import { ArchonHttpError } from '../src/errors';

const BASE = 'http://localhost:3737';

type MockResponse = { status: number; body: unknown };

function makeFetchFn(table: Record<string, MockResponse>) {
  return mock(async (url: string, init?: RequestInit) => {
    const urlObj = new URL(url, 'http://x');
    const pathOnly = urlObj.pathname;
    const method = init?.method ?? 'GET';
    // Try "METHOD /path" key first, then just "/path"
    const methodKey = `${method} ${pathOnly}`;
    const entry = table[methodKey] ?? table[pathOnly];
    if (!entry) throw new Error(`[mock] unhandled ${methodKey}`);
    const { status, body } = entry;
    const text = body == null ? '' : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text,
    } as Response;
  });
}

function client(table: Record<string, MockResponse>, opts: { authHeader?: string } = {}) {
  const fetchFn = makeFetchFn(table);
  return {
    c: new ArchonApiClient({ baseUrl: BASE, fetchFn, ...opts }),
    fetchFn,
  };
}

describe('ping()', () => {
  it('returns ok:true and serverVersion from openapi info.version', async () => {
    const { c } = client({ '/api/openapi.json': { status: 200, body: { info: { version: '2.1.0' } } } });
    const res = await c.ping();
    expect(res.ok).toBe(true);
    expect(res.serverVersion).toBe('2.1.0');
  });

  it('returns ok:true with undefined serverVersion when info is absent', async () => {
    const { c } = client({ '/api/openapi.json': { status: 200, body: {} } });
    const res = await c.ping();
    expect(res.ok).toBe(true);
    expect(res.serverVersion).toBeUndefined();
  });

  it('throws ArchonHttpError on 5xx', async () => {
    const { c } = client({ '/api/openapi.json': { status: 500, body: null } });
    await expect(c.ping()).rejects.toBeInstanceOf(ArchonHttpError);
  });
});

describe('listCodebases()', () => {
  it('returns the array on 200', async () => {
    const list = [{ id: 'c1', name: 'MyRepo', default_cwd: '/home/user/repo' }];
    const { c } = client({ '/api/codebases': { status: 200, body: list } });
    expect(await c.listCodebases()).toEqual(list);
  });

  it('returns null on 404 (endpoint not exposed by this Archon build)', async () => {
    const { c } = client({ '/api/codebases': { status: 404, body: 'Not Found' } });
    expect(await c.listCodebases()).toBeNull();
  });

  it('throws ArchonHttpError on 401', async () => {
    const { c } = client({ '/api/codebases': { status: 401, body: 'Unauthorized' } });
    await expect(c.listCodebases()).rejects.toBeInstanceOf(ArchonHttpError);
  });
});

describe('listWorkflows()', () => {
  it('passes cwd as query param and returns items', async () => {
    const items = [{ workflow: { name: 'w1', description: '', nodes: [] }, source: 'project' }];
    const { c } = client({ '/api/workflows': { status: 200, body: items } });
    expect(await c.listWorkflows('/home/user')).toEqual(items);
  });
});

describe('listCommands()', () => {
  it('returns command list with source', async () => {
    const cmds = [{ name: 'classify', source: 'project' }];
    const { c } = client({ '/api/commands': { status: 200, body: cmds } });
    expect(await c.listCommands('/home/user')).toEqual(cmds);
  });
});

describe('listProviders()', () => {
  it('returns provider list', async () => {
    const providers = [{ id: 'openai', capabilities: { chat: true } }];
    const { c } = client({ '/api/providers': { status: 200, body: providers } });
    expect(await c.listProviders()).toEqual(providers);
  });
});

describe('getWorkflow()', () => {
  it('fetches by name+cwd and returns the definition', async () => {
    const def = { name: 'classify', description: 'desc', nodes: [] };
    const { c } = client({ '/api/workflows/classify': { status: 200, body: def } });
    expect(await c.getWorkflow('classify', '/home/user')).toEqual(def);
  });

  it('throws ArchonHttpError on 404', async () => {
    const { c } = client({ '/api/workflows/missing': { status: 404, body: 'not found' } });
    await expect(c.getWorkflow('missing', '/home')).rejects.toBeInstanceOf(ArchonHttpError);
  });
});

describe('saveWorkflow()', () => {
  it('sends PUT with JSON body and returns saved definition', async () => {
    const def = { name: 'w1', description: '', nodes: [] };
    const { c, fetchFn } = client({ 'PUT /api/workflows/w1': { status: 200, body: def } });
    const result = await c.saveWorkflow('w1', '/home', def as any);
    expect(result).toEqual(def);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(def);
  });

  it('throws ArchonHttpError on 409 conflict', async () => {
    const { c } = client({ 'PUT /api/workflows/w1': { status: 409, body: 'conflict' } });
    await expect(c.saveWorkflow('w1', '/home', {} as any)).rejects.toBeInstanceOf(ArchonHttpError);
  });
});

describe('deleteWorkflow()', () => {
  it('sends DELETE and resolves without a value', async () => {
    const { c, fetchFn } = client({ 'DELETE /api/workflows/w1': { status: 204, body: null } });
    await expect(c.deleteWorkflow('w1', '/home')).resolves.toBeUndefined();
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });
});

describe('validateWorkflow()', () => {
  it('returns valid:true on success', async () => {
    const { c } = client({ 'POST /api/validate': { status: 200, body: { valid: true } } });
    expect(await c.validateWorkflow({} as any)).toEqual({ valid: true });
  });

  it('returns valid:false with errors array', async () => {
    const body = { valid: false, errors: ['node id missing'] };
    const { c } = client({ 'POST /api/validate': { status: 200, body } });
    expect(await c.validateWorkflow({} as any)).toEqual(body);
  });
});

describe('auth header injection', () => {
  it('attaches Authorization header on every request when token is provided', async () => {
    const { c, fetchFn } = client(
      { '/api/openapi.json': { status: 200, body: { info: {} } } },
      { authHeader: 'Bearer tok123' },
    );
    await c.ping();
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok123');
  });

  it('omits Authorization header when no token', async () => {
    const { c, fetchFn } = client({ '/api/openapi.json': { status: 200, body: {} } });
    await c.ping();
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)?.['Authorization']).toBeUndefined();
  });
});

describe('edge cases', () => {
  it('strips trailing slash from baseUrl so paths are not doubled', async () => {
    const fetchFn = makeFetchFn({
      '/api/openapi.json': { status: 200, body: {} },
    });
    const c = new ArchonApiClient({ baseUrl: 'http://localhost:3737/', fetchFn });
    await c.ping();
    const [url] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3737/api/openapi.json');
  });

  it('Content-Type: application/json is set on PUT requests', async () => {
    const def = { name: 'w', description: '', nodes: [] };
    const { c, fetchFn } = client({ 'PUT /api/workflows/w': { status: 200, body: def } });
    await c.saveWorkflow('w', '/home', def as any);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('encodes spaces in workflow name and cwd in URL', async () => {
    const def = { name: 'my workflow', description: '', nodes: [] };
    const { c, fetchFn } = client({ '/api/workflows/my%20workflow': { status: 200, body: def } });
    await c.getWorkflow('my workflow', '/home/my projects');
    const [url] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('my%20workflow');
    expect(url).toContain(encodeURIComponent('/home/my projects'));
  });

  it('ArchonHttpError carries status code and endpoint path', async () => {
    const { c } = client({ '/api/workflows/bad': { status: 403, body: 'Forbidden' } });
    try {
      await c.getWorkflow('bad', '/home');
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(ArchonHttpError);
      expect((err as ArchonHttpError).status).toBe(403);
      expect((err as ArchonHttpError).endpoint).toContain('/api/workflows/bad');
    }
  });
});
```

- [ ] **Step 2: Run the tests — expect fail**

```bash
bun --filter='@archon-studio/api-archon' run test 2>&1 | tail -15
```
Expected: all 20 tests fail with "not yet implemented" errors.

- [ ] **Step 3: Verify probe-gate — update endpoint table if needed**

If the probe ran in Task 9.0 Step 6 and showed different paths (e.g., `/api/workflow` instead of `/api/workflows`), update the `EP` constant you are about to write accordingly before proceeding.

- [ ] **Step 4: Implement `ArchonApiClient`**

Replace `packages/studio-api-archon/src/ArchonApiClient.ts` entirely:

```ts
import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
  WorkflowDefinition,
} from '@archon-studio/core';
import { ArchonHttpError } from './errors';

export interface ArchonApiClientOptions {
  baseUrl: string; // e.g., 'http://localhost:3737'
  fetchFn?: typeof fetch;
  authHeader?: string;
}

/**
 * Assumed endpoint paths — update if probe results (docs/probes/) differ.
 * All paths are appended to baseUrl after stripping a trailing slash.
 */
const EP = {
  openapi: '/api/openapi.json',
  codebases: '/api/codebases',
  workflows: '/api/workflows',
  commands: '/api/commands',
  providers: '/api/providers',
  validate: '/api/validate',
} as const;

export class ArchonApiClient implements WorkflowApiClient {
  private readonly _fetch: typeof fetch;
  private readonly base: string;
  private readonly authHeader?: string;

  constructor(opts: ArchonApiClientOptions) {
    this._fetch = opts.fetchFn ?? globalThis.fetch;
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.authHeader = opts.authHeader;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.authHeader ? { Authorization: this.authHeader } : {}),
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: this.headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await this._fetch(`${this.base}${path}`, init);
    if (!res.ok) {
      throw new ArchonHttpError(res.status, path, `${method} ${path} → ${res.status}`);
    }
    // 204 No Content — return undefined cast to T (caller doesn't use return value)
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async ping(): Promise<{ ok: true; serverVersion?: string }> {
    const doc = await this.request<{ info?: { version?: string } }>('GET', EP.openapi);
    return { ok: true, serverVersion: doc?.info?.version };
  }

  async listCodebases(): Promise<CodebaseInfo[] | null> {
    try {
      return await this.request<CodebaseInfo[]>('GET', EP.codebases);
    } catch (err) {
      if (err instanceof ArchonHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async listWorkflows(cwd: string): Promise<WorkflowListItem[]> {
    return this.request('GET', `${EP.workflows}?cwd=${encodeURIComponent(cwd)}`);
  }

  async listCommands(
    cwd: string,
  ): Promise<{ name: string; source: 'project' | 'global' | 'bundled' }[]> {
    return this.request('GET', `${EP.commands}?cwd=${encodeURIComponent(cwd)}`);
  }

  async listProviders(): Promise<{ id: string; capabilities: Record<string, boolean> }[]> {
    return this.request('GET', EP.providers);
  }

  async getWorkflow(name: string, cwd: string): Promise<WorkflowDefinition> {
    return this.request(
      'GET',
      `${EP.workflows}/${encodeURIComponent(name)}?cwd=${encodeURIComponent(cwd)}`,
    );
  }

  async saveWorkflow(
    name: string,
    cwd: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    return this.request(
      'PUT',
      `${EP.workflows}/${encodeURIComponent(name)}?cwd=${encodeURIComponent(cwd)}`,
      definition,
    );
  }

  async deleteWorkflow(name: string, cwd: string): Promise<void> {
    return this.request(
      'DELETE',
      `${EP.workflows}/${encodeURIComponent(name)}?cwd=${encodeURIComponent(cwd)}`,
    );
  }

  async validateWorkflow(definition: WorkflowDefinition): Promise<ValidateResult> {
    return this.request('POST', EP.validate, definition);
  }
}
```

- [ ] **Step 5: Run the tests — expect green**

```bash
bun --filter='@archon-studio/api-archon' run test 2>&1 | tail -10
```
Expected: ~20 pass, 0 fail. If any test fails due to URL construction (query string handling), trace the mock's URL matching — the mock strips query params for path matching.

- [ ] **Step 6: Export `ArchonHttpError` from the package index**

In `packages/studio-api-archon/src/index.ts`, add:
```ts
export { ArchonHttpError } from './errors';
```

- [ ] **Step 7: Commit**

```bash
git add packages/studio-api-archon/
git commit -m "feat(api-archon): real fetch for all 9 WorkflowApiClient methods + TDD coverage"
```

---

### Task 9.3: `connection-store.ts`

**Files:**
- Create: `apps/standalone/src/connection-store.ts`

Mirrors `packages/studio-core/src/store/theme-store.ts` — Zustand + localStorage, no frills.

- [ ] **Step 1: Create the store**

Create `apps/standalone/src/connection-store.ts`:

```ts
import { create } from 'zustand';

const STORAGE_KEY = 'archon-studio:connection';

export interface ConnectionSettings {
  archonUrl: string;
  cwd: string;
  /** Empty string means no auth header. */
  token: string;
}

interface ConnectionState {
  settings: ConnectionSettings | null;
  /** null = never tested; 'ok' = last ping succeeded; 'error' = last ping failed. */
  pingStatus: 'ok' | 'error' | null;
  save: (s: ConnectionSettings) => void;
  clear: () => void;
  setPingStatus: (s: 'ok' | 'error') => void;
  hydrate: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  settings: null,
  pingStatus: null,

  save: (s) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // private mode / quota exceeded — non-fatal
    }
    set({ settings: s, pingStatus: null });
  },

  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // non-fatal
    }
    set({ settings: null, pingStatus: null });
  },

  setPingStatus: (s) => set({ pingStatus: s }),

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
      if (parsed.archonUrl && typeof parsed.cwd === 'string') {
        set({ settings: { archonUrl: parsed.archonUrl, cwd: parsed.cwd, token: parsed.token ?? '' } });
      }
    } catch {
      // corrupt storage — ignore
    }
  },
}));
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter='@archon-studio/standalone' run build 2>&1 | grep -E "^.*error" | head -10
```
Expected: no TypeScript errors.

---

### Task 9.4: `save-queue.ts`

**Files:**
- Create: `apps/standalone/src/save-queue.ts`

Offline save queue — persisted to localStorage. `BuilderPage` calls `enqueueSave` when a network error occurs, and flushes via `flushSave` when online.

- [ ] **Step 1: Create `save-queue.ts`**

Create `apps/standalone/src/save-queue.ts`:

```ts
const STORAGE_KEY = 'archon-studio:save-queue';

export interface PendingSave {
  workflowName: string;
  cwd: string;
  archonUrl: string;
  /** `toWorkflowDefinition(...)` output — plain JSON object. */
  definition: Record<string, unknown>;
  /** Unix ms — most recent wins for same workflow. */
  timestamp: number;
}

function load(): PendingSave[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingSave[]) : [];
  } catch {
    return [];
  }
}

function persist(queue: PendingSave[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // quota exceeded — non-fatal, pending save is lost
  }
}

/**
 * Add or replace the pending save for this (workflowName, cwd, archonUrl) combination.
 * Keeps only the latest version — earlier offline drafts are superseded.
 */
export function enqueueSave(item: Omit<PendingSave, 'timestamp'>): void {
  const queue = load().filter(
    (q) =>
      !(q.workflowName === item.workflowName &&
        q.cwd === item.cwd &&
        q.archonUrl === item.archonUrl),
  );
  queue.push({ ...item, timestamp: Date.now() });
  persist(queue);
}

/**
 * Return and remove the pending save for (workflowName, cwd, archonUrl), or null if none.
 */
export function dequeueSave(
  workflowName: string,
  cwd: string,
  archonUrl: string,
): PendingSave | null {
  const queue = load();
  const idx = queue.findIndex(
    (q) => q.workflowName === workflowName && q.cwd === cwd && q.archonUrl === archonUrl,
  );
  if (idx === -1) return null;
  const [item] = queue.splice(idx, 1);
  persist(queue);
  return item ?? null;
}

/** All pending saves — used by BuilderPage to show a warning banner. */
export function listPendingSaves(): PendingSave[] {
  return load();
}
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter='@archon-studio/standalone' run build 2>&1 | grep -E "^.*error" | head -10
```
Expected: no errors.

---

### Task 9.5: `App.tsx` — router tree

**Files:**
- Modify: `apps/standalone/src/App.tsx`

Replace the Phase 2 smoke harness with a router + provider shell. Uses React Router v7 `createBrowserRouter` + `Outlet` nested layout pattern.

**Read the current file first:**
```bash
cat apps/standalone/src/App.tsx
```
Confirm the current imports; the replace below is total.

- [ ] **Step 1: Write the new `App.tsx`**

Replace `apps/standalone/src/App.tsx` entirely:

```tsx
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import { ApiClientProvider, ThemeProvider, useThemeStore } from '@archon-studio/core';
import { ArchonApiClient } from '@archon-studio/api-archon';
import { useConnectionStore } from './connection-store';
import { ConnectPage } from './routes/ConnectPage';
import { WorkflowListPage } from './routes/WorkflowListPage';
import { BuilderPage } from './routes/BuilderPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Hydrates stores once; wraps all routes in ThemeProvider. */
function AppShell() {
  useEffect(() => {
    useThemeStore.getState().hydrate();
    useConnectionStore.getState().hydrate();
  }, []);
  const preset = useThemeStore((s) => s.preset);
  return (
    <ThemeProvider preset={preset}>
      <Outlet />
    </ThemeProvider>
  );
}

/**
 * Guards routes that require a valid connection.
 * Redirects to /connect if connection settings are absent.
 * Provides ApiClientProvider with a memoised ArchonApiClient.
 */
function RequireConnection() {
  const settings = useConnectionStore((s) => s.settings);

  const client = useMemo(() => {
    if (!settings) return null;
    return new ArchonApiClient({
      baseUrl: settings.archonUrl,
      authHeader: settings.token || undefined,
    });
  }, [settings?.archonUrl, settings?.token]);

  if (!settings || !client) return <Navigate to="/connect" replace />;

  return (
    <ApiClientProvider client={client}>
      <Outlet />
    </ApiClientProvider>
  );
}

/**
 * Root route: smart redirect based on whether connection settings exist.
 * Navigates to /workflows if connected, /connect if not.
 */
function HomeRedirect() {
  const settings = useConnectionStore((s) => s.settings);
  return <Navigate to={settings ? '/workflows' : '/connect'} replace />;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/connect', element: <ConnectPage /> },
      {
        element: <RequireConnection />,
        children: [
          { path: '/workflows', element: <WorkflowListPage /> },
          { path: '/builder/:name', element: <BuilderPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Create placeholder route stubs so the build doesn't fail**

Before the real pages exist, create three stub files. Create `apps/standalone/src/routes/ConnectPage.tsx`:

```tsx
export function ConnectPage() {
  return <div style={{ padding: 24 }}>Connect page (stub)</div>;
}
```

Create `apps/standalone/src/routes/WorkflowListPage.tsx`:

```tsx
export function WorkflowListPage() {
  return <div style={{ padding: 24 }}>Workflow list (stub)</div>;
}
```

Create `apps/standalone/src/routes/BuilderPage.tsx`:

```tsx
export function BuilderPage() {
  return <div style={{ padding: 24 }}>Builder (stub)</div>;
}
```

- [ ] **Step 3: Build the standalone**

```bash
bun --filter='@archon-studio/standalone' run build 2>&1 | grep -E "error|Error" | head -20
```
Expected: clean build. If you see errors about missing `HomeRedirect` or undefined `Outlet`, check that `react-router` v7 exports these names:

```bash
grep -r "from 'react-router'" apps/standalone/src/
node -e "const r = require('./node_modules/react-router'); console.log(Object.keys(r).filter(k => ['Outlet','Navigate','createBrowserRouter','RouterProvider'].includes(k)))" 2>/dev/null || echo "use bun"
```

If `Outlet` / `Navigate` are not exported at v7's top level, they may live under `react-router/dom`. Check the installed version's changelog — update the imports in `App.tsx` if needed and note it as a drift entry.

- [ ] **Step 4: Commit**

```bash
git add apps/standalone/src/
git commit -m "feat(standalone): router tree + connection + save-queue stubs"
```

---

### Task 9.6: `ConnectPage.tsx`

**Files:**
- Modify: `apps/standalone/src/routes/ConnectPage.tsx`

The connect screen. Collects Archon URL + cwd (+ optional token). "Test Connection" button pings Archon via `ArchonApiClient`. On success, saves to `useConnectionStore` and navigates to `/workflows`.

**Progressive enhancement for cwd:** after a successful ping, try `listCodebases()`. If the result is a non-null array, show a `<select>` dropdown of codebases; `onChange` writes the selected `default_cwd` to the cwd field. If result is null (404), show a plain text input for cwd.

- [ ] **Step 1: Replace the stub with the real component**

Replace `apps/standalone/src/routes/ConnectPage.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArchonApiClient } from '@archon-studio/api-archon';
import { ArchonHttpError } from '@archon-studio/api-archon';
import type { CodebaseInfo } from '@archon-studio/core';
import { useConnectionStore } from '../connection-store';

type Step = 'form' | 'testing' | 'cwd' | 'done';

export function ConnectPage() {
  const navigate = useNavigate();
  const saveConnection = useConnectionStore((s) => s.save);

  const [archonUrl, setArchonUrl] = useState('http://localhost:3737');
  const [cwd, setCwd] = useState('');
  const [token, setToken] = useState('');
  const [codebases, setCodebases] = useState<CodebaseInfo[] | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [serverVersion, setServerVersion] = useState<string | undefined>();

  const handleTest = useCallback(async () => {
    setError(null);
    setStep('testing');
    try {
      const tempClient = new ArchonApiClient({
        baseUrl: archonUrl,
        authHeader: token || undefined,
      });
      const pingResult = await tempClient.ping();
      setServerVersion(pingResult.serverVersion);
      // Progressive enhancement: probe for codebase dropdown
      const cb = await tempClient.listCodebases();
      setCodebases(cb);
      setStep('cwd');
    } catch (err) {
      const msg =
        err instanceof ArchonHttpError
          ? `Archon returned ${err.status}. Check the URL and auth token.`
          : `Could not reach Archon at ${archonUrl}. Is it running?`;
      setError(msg);
      setStep('form');
    }
  }, [archonUrl, token]);

  const handleConnect = useCallback(() => {
    saveConnection({ archonUrl, cwd, token });
    navigate('/workflows');
  }, [archonUrl, cwd, token, saveConnection, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--studio-bg)',
      }}
    >
      <div
        style={{
          width: 400,
          padding: 32,
          background: 'var(--studio-surface)',
          borderRadius: 8,
          border: '1px solid var(--studio-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, color: 'var(--studio-fg)' }}>
          Connect to Archon
        </h1>

        {/* Archon URL */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--studio-fg-muted)' }}>Archon URL</span>
          <input
            type="url"
            value={archonUrl}
            onChange={(e) => setArchonUrl(e.target.value)}
            disabled={step !== 'form'}
            placeholder="http://localhost:3737"
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--studio-border)', background: 'var(--studio-input-bg)', color: 'var(--studio-fg)', fontSize: 14 }}
          />
        </label>

        {/* Auth token (optional) */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--studio-fg-muted)' }}>
            Auth token <span style={{ opacity: 0.6 }}>(optional)</span>
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={step !== 'form'}
            placeholder="Bearer ..."
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--studio-border)', background: 'var(--studio-input-bg)', color: 'var(--studio-fg)', fontSize: 14 }}
          />
        </label>

        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--studio-error-bg, #3a1a1a)',
              color: 'var(--studio-error-fg, #ff6b6b)',
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Test Connection button */}
        {step === 'form' && (
          <button
            onClick={handleTest}
            style={{ padding: '8px 16px', borderRadius: 4, cursor: 'pointer', background: 'var(--studio-accent)', color: '#fff', border: 'none', fontSize: 14 }}
          >
            Test Connection
          </button>
        )}

        {step === 'testing' && (
          <p style={{ fontSize: 13, color: 'var(--studio-fg-muted)', margin: 0 }}>
            Connecting…
          </p>
        )}

        {/* Step 2: cwd input / dropdown */}
        {(step === 'cwd' || step === 'done') && (
          <>
            <p style={{ fontSize: 13, color: 'var(--studio-fg-muted)', margin: 0 }}>
              ✓ Connected{serverVersion ? ` to Archon ${serverVersion}` : ''}
            </p>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--studio-fg-muted)' }}>
                Working directory
              </span>
              {codebases && codebases.length > 0 ? (
                /* Progressive enhancement: dropdown */
                <select
                  value={cwd}
                  onChange={(e) => {
                    const selected = codebases.find((cb) => cb.default_cwd === e.target.value);
                    setCwd(selected?.default_cwd ?? e.target.value);
                  }}
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--studio-border)', background: 'var(--studio-input-bg)', color: 'var(--studio-fg)', fontSize: 14 }}
                >
                  <option value="">Select a project…</option>
                  {codebases.map((cb) => (
                    <option key={cb.id} value={cb.default_cwd}>
                      {cb.name} ({cb.default_cwd})
                    </option>
                  ))}
                </select>
              ) : (
                /* Fallback: manual text input */
                <input
                  type="text"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="/home/user/my-project"
                  style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--studio-border)', background: 'var(--studio-input-bg)', color: 'var(--studio-fg)', fontSize: 14 }}
                />
              )}
            </label>

            <button
              onClick={handleConnect}
              disabled={!cwd.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                cursor: cwd.trim() ? 'pointer' : 'not-allowed',
                background: cwd.trim() ? 'var(--studio-accent)' : 'var(--studio-border)',
                color: '#fff',
                border: 'none',
                fontSize: 14,
              }}
            >
              Open workflows
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
bun --filter='@archon-studio/standalone' run build 2>&1 | grep -E "^.*error" | head -10
```
Expected: clean.

- [ ] **Step 3: Start dev server, navigate to `/connect`, verify render**

```bash
bun --filter='@archon-studio/standalone' run dev &
```
Open `http://localhost:5173/connect`. Verify:
- The connect form renders with URL + token fields
- "Test Connection" button is present
- Layout is centred on the screen

**Smoke note:** Full connect flow requires Archon running. Document for Task 9.9 manual smoke.

- [ ] **Step 4: Commit**

```bash
git add apps/standalone/src/routes/ConnectPage.tsx
git commit -m "feat(standalone): ConnectPage with progressive cwd enhancement"
```

---

### Task 9.7: `WorkflowListPage.tsx`

**Files:**
- Modify: `apps/standalone/src/routes/WorkflowListPage.tsx`

Workflow list grouped by source (`project`, `global`, `bundled`). New / Fork / Delete flows. Uses React Query `useQuery` for data fetching; `useMutation` for delete.

- [ ] **Step 1: Replace the stub**

Replace `apps/standalone/src/routes/WorkflowListPage.tsx`:

```tsx
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkflowApi } from '@archon-studio/core';
import type { WorkflowListItem } from '@archon-studio/core';
import { useConnectionStore } from '../connection-store';

type Source = 'project' | 'global' | 'bundled';

const SOURCE_LABELS: Record<Source, string> = {
  project: 'Project',
  global: 'Global',
  bundled: 'Bundled defaults',
};

export function WorkflowListPage() {
  const navigate = useNavigate();
  const client = useWorkflowApi();
  const qc = useQueryClient();
  const settings = useConnectionStore((s) => s.settings)!;
  const clearConnection = useConnectionStore((s) => s.clear);

  const { data, isLoading, error } = useQuery({
    queryKey: ['workflows', settings.archonUrl, settings.cwd],
    queryFn: () => client.listWorkflows(settings.cwd),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ name }: { name: string }) =>
      client.deleteWorkflow(name, settings.cwd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows', settings.archonUrl, settings.cwd] });
    },
  });

  const handleNew = useCallback(() => {
    const name = window.prompt('New workflow name (e.g. my-workflow):');
    if (!name?.trim()) return;
    navigate(`/builder/${encodeURIComponent(name.trim())}`, {
      state: { isNew: true },
    });
  }, [navigate]);

  const handleFork = useCallback(
    (item: WorkflowListItem) => {
      const original = item.workflow.name;
      const newName = window.prompt('Fork as:', `${original}-copy`);
      if (!newName?.trim()) return;
      navigate(`/builder/${encodeURIComponent(newName.trim())}`, {
        state: { isNew: true, forkFrom: original },
      });
    },
    [navigate],
  );

  const handleDelete = useCallback(
    (item: WorkflowListItem) => {
      if (!window.confirm(`Delete "${item.workflow.name}"? This cannot be undone.`)) return;
      deleteMutation.mutate({ name: item.workflow.name });
    },
    [deleteMutation],
  );

  const handleOpen = useCallback(
    (item: WorkflowListItem) => {
      navigate(`/builder/${encodeURIComponent(item.workflow.name)}`, {
        state: { source: item.source },
      });
    },
    [navigate],
  );

  const grouped = (data ?? []).reduce<Record<Source, WorkflowListItem[]>>(
    (acc, item) => {
      const src = item.source as Source;
      acc[src] = [...(acc[src] ?? []), item];
      return acc;
    },
    { project: [], global: [], bundled: [] },
  );

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        background: 'var(--studio-bg)',
        color: 'var(--studio-fg)',
        padding: '32px 48px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Workflows</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--studio-fg-muted)', opacity: 0.7 }}>
            {settings.archonUrl} · {settings.cwd}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleNew}
            style={{ padding: '8px 16px', borderRadius: 4, cursor: 'pointer', background: 'var(--studio-accent)', color: '#fff', border: 'none', fontSize: 14 }}
          >
            + New workflow
          </button>
          <button
            onClick={() => { clearConnection(); navigate('/connect'); }}
            style={{ padding: '8px 16px', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--studio-fg-muted)', border: '1px solid var(--studio-border)', fontSize: 14 }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Loading / error states */}
      {isLoading && <p style={{ color: 'var(--studio-fg-muted)' }}>Loading workflows…</p>}
      {error && (
        <p style={{ color: 'var(--studio-error-fg, #ff6b6b)' }}>
          Failed to load workflows. {(error as Error).message}
        </p>
      )}

      {/* Grouped sections */}
      {(['project', 'global', 'bundled'] as Source[]).map((src) => {
        const items = grouped[src];
        if (items.length === 0) return null;
        return (
          <section key={src} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--studio-fg-muted)', opacity: 0.6, margin: '0 0 12px' }}>
              {SOURCE_LABELS[src]}
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((item) => (
                <li
                  key={item.workflow.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 16px',
                    background: 'var(--studio-surface)',
                    borderRadius: 6,
                    border: '1px solid var(--studio-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleOpen(item)}
                >
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{item.workflow.name}</span>
                    {item.workflow.description && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--studio-fg-muted)', opacity: 0.7, maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.workflow.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    {src === 'bundled' ? (
                      <button
                        onClick={() => handleFork(item)}
                        style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid var(--studio-border)', color: 'var(--studio-fg)' }}
                      >
                        Fork
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleteMutation.isPending}
                        style={{ padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid var(--studio-border)', color: 'var(--studio-error-fg, #ff6b6b)' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
bun --filter='@archon-studio/standalone' run build 2>&1 | grep -E "^.*error" | head -10
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/standalone/src/routes/WorkflowListPage.tsx
git commit -m "feat(standalone): WorkflowListPage with React Query + New/Fork/Delete"
```

---

### Task 9.8: `BuilderPage.tsx`

**Files:**
- Modify: `apps/standalone/src/routes/BuilderPage.tsx`

Loads a workflow from Archon (or creates blank if `isNew`), renders `WorkflowBuilder`, wires `onSave`, shows bundled-default banner, and integrates offline save queue.

**Key data flow:**
1. Read `name` from `useParams()`, `source` + `isNew` + `forkFrom` from `useLocation().state`
2. If `isNew` and `forkFrom`: load original → change name → `loadWorkflow`
3. If `isNew` (no fork): create blank workflow → `loadWorkflow`
4. Otherwise: load from Archon → `fromWorkflowDefinition` → `loadWorkflow`
5. `onSave`: serialize store → `client.saveWorkflow` → on network error: `enqueueSave`
6. On mount: check `dequeueSave` for a pending save → retry if found

- [ ] **Step 1: Write the BuilderPage**

Replace `apps/standalone/src/routes/BuilderPage.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import {
  WorkflowBuilder,
  fromWorkflowDefinition,
  toWorkflowDefinition,
  useBuilderStore,
  useWorkflowApi,
} from '@archon-studio/core';
import type { LoadWorkflowInput } from '@archon-studio/core';
import { ArchonHttpError } from '@archon-studio/api-archon';
import { useConnectionStore } from '../connection-store';
import { enqueueSave, dequeueSave } from '../save-queue';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

function createBlankWorkflow(name: string): LoadWorkflowInput {
  return {
    meta: { name, description: '', base: {}, unknown: {} },
    nodes: [],
  };
}

export function BuilderPage() {
  const { name } = useParams<{ name: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useWorkflowApi();
  const settings = useConnectionStore((s) => s.settings)!;

  const routeState = (location.state ?? {}) as {
    isNew?: boolean;
    forkFrom?: string;
    source?: 'project' | 'global' | 'bundled';
  };

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [source] = useState(routeState.source ?? 'project');

  // ── Load workflow on mount ──
  useEffect(() => {
    if (!name) return;
    let cancelled = false;

    (async () => {
      try {
        let input: LoadWorkflowInput;

        if (routeState.isNew && routeState.forkFrom) {
          // Fork: load original, rename
          const def = await client.getWorkflow(routeState.forkFrom, settings.cwd);
          const parsed = fromWorkflowDefinition(def as Record<string, unknown>);
          input = { ...parsed, meta: { ...parsed.meta, name } };
        } else if (routeState.isNew) {
          // New blank workflow
          input = createBlankWorkflow(name);
        } else {
          // Open existing workflow
          const def = await client.getWorkflow(name, settings.cwd);
          input = fromWorkflowDefinition(def as Record<string, unknown>);
        }

        if (!cancelled) {
          useBuilderStore.getState().loadWorkflow(input);
          setLoaded(true);
          // Attempt to flush any pending offline save for this workflow
          const pending = dequeueSave(name, settings.cwd, settings.archonUrl);
          if (pending) {
            await client
              .saveWorkflow(name, settings.cwd, pending.definition as any)
              .catch(() => {
                // Still offline — re-enqueue
                enqueueSave({
                  workflowName: name,
                  cwd: settings.cwd,
                  archonUrl: settings.archonUrl,
                  definition: pending.definition,
                });
              });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ArchonHttpError
              ? `Could not load workflow (HTTP ${err.status})`
              : `Could not load workflow: ${(err as Error).message}`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      useBuilderStore.getState().clearWorkflow();
    };
  }, [name, settings.cwd, settings.archonUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    if (!name || !loaded) return;
    setSaveStatus('saving');

    const storeState = useBuilderStore.getState();
    const definition = toWorkflowDefinition({
      meta: storeState.workflow!,
      nodes: storeState.nodes,
    }) as any;

    try {
      await client.saveWorkflow(name, settings.cwd, definition);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      const isNetworkError = !(err instanceof ArchonHttpError);
      if (isNetworkError) {
        enqueueSave({
          workflowName: name,
          cwd: settings.cwd,
          archonUrl: settings.archonUrl,
          definition,
        });
        setSaveStatus('offline');
      } else {
        setSaveStatus('error');
      }
    }
  }, [name, loaded, client, settings]);

  // ── Render ──
  if (loadError) {
    return (
      <div style={{ padding: 32, color: 'var(--studio-fg)' }}>
        <p style={{ color: 'var(--studio-error-fg, #ff6b6b)' }}>{loadError}</p>
        <button onClick={() => navigate('/workflows')}>← Back to workflows</button>
      </div>
    );
  }

  if (!loaded || !name) {
    return (
      <div style={{ padding: 32, color: 'var(--studio-fg-muted)' }}>
        Loading {name}…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Bundled-default shadow banner */}
      {source === 'bundled' && (
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--studio-warning-bg, #2a2200)',
            color: 'var(--studio-warning-fg, #e6b800)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span>This is a read-only bundled default.</span>
          <button
            onClick={() => {
              const newName = window.prompt('Fork as:', `${name}-copy`);
              if (!newName?.trim()) return;
              navigate(`/builder/${encodeURIComponent(newName.trim())}`, {
                state: { isNew: true, forkFrom: name },
              });
            }}
            style={{ padding: '2px 10px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid currentColor', fontSize: 12, color: 'inherit' }}
          >
            Fork it
          </button>
          <button
            onClick={() => navigate('/workflows')}
            style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: 'none', fontSize: 12, color: 'inherit', opacity: 0.6 }}
          >
            ← Back
          </button>
        </div>
      )}

      {/* Offline save indicator */}
      {saveStatus === 'offline' && (
        <div
          style={{
            padding: '6px 16px',
            background: 'var(--studio-warning-bg, #2a2200)',
            color: 'var(--studio-warning-fg, #e6b800)',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          Saved offline — will sync when Archon is reachable.
        </div>
      )}

      {/* The editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorkflowBuilder
          client={client}
          archonUrl={settings.archonUrl}
          cwd={settings.cwd}
          workflowName={name}
          onSave={source !== 'bundled' ? () => { void handleSave(); } : undefined}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
bun --filter='@archon-studio/standalone' run build 2>&1 | grep -E "^.*error" | head -10
```
Expected: clean. `LoadWorkflowInput` is already exported from `@archon-studio/core` — no action needed. If you see a TypeScript error about it anyway, verify with:

```bash
grep "LoadWorkflowInput" packages/studio-core/src/index.ts
```

- [ ] **Step 3: Verify full suite still green**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -5
bun --filter='@archon-studio/api-archon' run test 2>&1 | tail -5
```
Expected: **527 pass** (core) + **~20 pass** (api-archon), 0 fail total.

- [ ] **Step 4: Commit**

```bash
git add apps/standalone/src/routes/BuilderPage.tsx packages/studio-core/src/index.ts
git commit -m "feat(standalone): BuilderPage — load/save/offline-queue + bundled banner"
```

---

### Task 9.9: End-to-end smoke + tag

**Files:** `docs/superpowers/plans/phase-9-drift-notes.md` (create).

This task requires Archon running on `localhost:3737`. If it is not available, stub-smoke against the existing `StubArchonApiClient` to verify the UI flow and note the live-smoke as a TODO.

**Manual smoke steps:**

- [ ] **Step 1: Start the dev server**

```bash
bun --filter='@archon-studio/standalone' run dev
```
Navigate to `http://localhost:5173/`.

- [ ] **Step 2: Root redirect**
Expected: redirected to `/connect` (no saved connection in localStorage yet).

- [ ] **Step 3: Connect flow (with Archon running)**
1. URL field pre-filled with `http://localhost:3737`.
2. Click "Test Connection" → spinning "Connecting…" state.
3. On success: shows "✓ Connected to Archon x.y.z" (or just "✓ Connected" if no version).
4. cwd field appears — as dropdown if `/api/codebases` returned items, as text input if 404.
5. Select/enter a cwd, click "Open workflows" → navigated to `/workflows`.

- [ ] **Step 4: Workflow list**
1. `/workflows` shows workflow groups: Project, Global, Bundled (whichever have items).
2. Connection pill in header shows URL + cwd.
3. "Disconnect" button clears connection and returns to `/connect`.
4. "+ New workflow" → prompts for a name → navigates to `/builder/<name>` with blank canvas.
5. Bundled item has "Fork" button; project/global items have "Delete" button.

- [ ] **Step 5: Open a workflow**
1. Click a project workflow → `/builder/<name>` loads.
2. No bundled banner (source is 'project').
3. Save button visible in toolbar.
4. Edit a field → click Save → toolbar shows saved feedback for ~2s.

- [ ] **Step 6: Open a bundled workflow**
1. Click a bundled workflow → `/builder/<name>` loads.
2. Yellow/amber banner at top: "This is a read-only bundled default. Fork it."
3. No Save button in the toolbar (`onSave` is undefined → Toolbar hides it).
4. Click "Fork it" → prompts for new name → navigates to fresh builder with the forked content.

- [ ] **Step 7: Offline save queue**
1. Stop Archon (or disconnect network).
2. Make a change in the editor.
3. Click Save → toolbar shows error state; orange "Saved offline — will sync when Archon is reachable." banner appears.
4. Restart Archon.
5. Close and reopen the same workflow → pending save is detected on mount and retried → confirmation in browser network tab.

- [ ] **Step 8: New workflow**
1. `/workflows` → "+ New workflow" → enter `test-smoke-phase9`.
2. BuilderPage opens with blank canvas + no banner + Save enabled.
3. Add one node, save → workflow appears in the list on return.

- [ ] **Step 9: Delete a workflow**
1. On list page, click Delete on a project workflow → confirm modal → row disappears.

- [ ] **Step 10: Confirm test counts**

```bash
bun --filter='@archon-studio/core' run test 2>&1 | tail -5
bun --filter='@archon-studio/api-archon' run test 2>&1 | tail -5
```
Expected: **527 + ~20–35 pass**, 0 fail.

- [ ] **Step 11: Write drift notes**

Create `docs/superpowers/plans/phase-9-drift-notes.md`. For each deviation from this plan (wrong endpoint URL, missing Archon endpoint, changed API shape, router API differences, etc.) add an entry:

```markdown
# Phase 9 drift notes

## Drift 9.N: <title>

**What the plan assumed:** …
**What reality was:** …
**How it was resolved:** …
**Takeaway for Phase 10:** …
```

- [ ] **Step 12: Tag the phase**

```bash
git add docs/superpowers/plans/phase-9-drift-notes.md
git commit -m "docs(drift): Phase 9 smoke notes"
git tag phase-9
```
Push pending user (consistent with Phase 7/8 practice).

---

## Phase 9 definition of done

- [ ] `bun --filter='@archon-studio/core' run test` → **527 pass, 0 fail** (unchanged)
- [ ] `bun --filter='@archon-studio/api-archon' run test` → **≥21 pass, 0 fail**
- [ ] `bun --filter='*' run build` → clean (tsc + vite)
- [ ] `bun run lint && bun run format:check` → green
- [ ] All 12 smoke steps pass (or Step 3–9 marked "deferred — Archon unavailable" with written note)
- [ ] `docs/superpowers/plans/phase-9-drift-notes.md` exists
- [ ] Tag `phase-9` created (push pending user)
