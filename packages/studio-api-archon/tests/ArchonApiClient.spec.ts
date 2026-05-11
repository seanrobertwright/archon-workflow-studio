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
    const { c } = client({
      '/api/openapi.json': { status: 200, body: { info: { version: '2.1.0' } } },
    });
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
