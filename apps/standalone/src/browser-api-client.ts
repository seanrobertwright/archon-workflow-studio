import { parse as parseYaml } from 'yaml';
import { workflowDefinitionSchema } from '@archon-studio/core';
import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
  WorkflowDefinition,
} from '@archon-studio/core';

const STORAGE_KEY = 'archon-studio:workflows';

interface StoredWorkflow {
  definition: WorkflowDefinition;
  source: 'project' | 'global';
  savedAt: number;
}

type WorkflowStore = Record<string, StoredWorkflow>;

const FIXTURE_MODULES = import.meta.glob<string>(
  '../../../packages/studio-fixtures/src/round-trip-fixtures/*.yaml',
  { query: '?raw', import: 'default', eager: true },
);

const BUNDLED_FIXTURES: Record<string, WorkflowDefinition> = (() => {
  const out: Record<string, WorkflowDefinition> = {};
  for (const [path, yaml] of Object.entries(FIXTURE_MODULES)) {
    const match = path.match(/([^/]+)\.yaml$/);
    if (!match) continue;
    const basename = match[1]!;
    if (basename.startsWith('_')) continue; // skip _smoke-*
    try {
      const parsed = parseYaml(yaml) as unknown;
      const result = workflowDefinitionSchema.safeParse(parsed);
      if (result.success) out[result.data.name] = result.data;
    } catch {
      // skip malformed fixtures
    }
  }
  return out;
})();

export class BrowserApiClient implements WorkflowApiClient {
  private loadStore(): WorkflowStore {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as WorkflowStore) : {};
    } catch {
      return {};
    }
  }

  private persistStore(store: WorkflowStore): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // quota / private mode — silent
    }
  }

  async ping(): Promise<{ ok: true; serverVersion?: string }> {
    return { ok: true, serverVersion: 'browser' };
  }

  async listCodebases(): Promise<CodebaseInfo[] | null> {
    return null;
  }

  async listWorkflows(_cwd: string): Promise<WorkflowListItem[]> {
    const store = this.loadStore();
    const userNames = new Set(Object.keys(store));
    const userItems: WorkflowListItem[] = Object.values(store).map((w) => ({
      workflow: w.definition,
      source: w.source,
    }));
    const bundledItems: WorkflowListItem[] = Object.entries(BUNDLED_FIXTURES)
      .filter(([name]) => !userNames.has(name))
      .map(([, def]) => ({ workflow: def, source: 'bundled' as const }));
    return [...userItems, ...bundledItems];
  }

  async listCommands(
    _cwd: string,
  ): Promise<{ name: string; source: 'project' | 'global' | 'bundled' }[]> {
    return [];
  }

  async listProviders(): Promise<{ id: string; capabilities: Record<string, boolean> }[]> {
    return [];
  }

  async getWorkflow(name: string, _cwd: string): Promise<WorkflowDefinition> {
    const store = this.loadStore();
    const stored = store[name];
    if (stored) return stored.definition;
    const bundled = BUNDLED_FIXTURES[name];
    if (bundled) return bundled;
    throw new Error(`Workflow '${name}' not found`);
  }

  async saveWorkflow(
    name: string,
    _cwd: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    const store = this.loadStore();
    store[name] = { definition, source: 'project', savedAt: Date.now() };
    this.persistStore(store);
    return definition;
  }

  async deleteWorkflow(name: string, _cwd: string): Promise<void> {
    const store = this.loadStore();
    delete store[name];
    this.persistStore(store);
  }

  async validateWorkflow(definition: WorkflowDefinition): Promise<ValidateResult> {
    const result = workflowDefinitionSchema.safeParse(definition);
    if (result.success) return { valid: true };
    return {
      valid: false,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
}
