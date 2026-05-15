import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
} from '@archon-studio/core';
import type { WorkflowDefinition } from '@archon-studio/core';
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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
