import { parse as parseYaml } from 'yaml';
import { workflowDefinitionSchema } from '@archon-studio/core';
import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
  WorkflowDefinition,
} from '@archon-studio/core';

export interface StubArchonApiClientOptions {
  /**
   * Caller-provided YAML loader. Decoupled from `@archon-studio/fixtures` so the Stub
   * can be bundled in a browser context — fixtures uses `node:fs`/`node:url` at module
   * top level which breaks Vite's resolution. Node callers can pass
   * `loadRoundTripFixture` from `@archon-studio/fixtures`; browser callers can pass a
   * function that resolves a Vite `?raw` import.
   */
  loadFixture: (name: string) => string;
}

/**
 * Phase-2 stub. Resolves `getWorkflow` from a caller-provided fixture loader.
 * The real `ArchonApiClient` lands in Phase 9.
 */
export class StubArchonApiClient implements WorkflowApiClient {
  constructor(private readonly options: StubArchonApiClientOptions) {}

  async ping(): Promise<{ ok: true; serverVersion?: string }> {
    return { ok: true, serverVersion: 'stub' };
  }
  async listCodebases(): Promise<CodebaseInfo[] | null> {
    return null; // simulates an Archon that doesn't expose the endpoint
  }
  async listWorkflows(_cwd: string): Promise<WorkflowListItem[]> {
    return [];
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
    const yamlText = this.options.loadFixture(name);
    const parsed: unknown = parseYaml(yamlText);
    const result = workflowDefinitionSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `StubArchonApiClient.getWorkflow('${name}'): fixture failed schema validation — ${result.error.message}`,
      );
    }
    return result.data;
  }
  async saveWorkflow(
    _name: string,
    _cwd: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    return definition;
  }
  async deleteWorkflow(_name: string, _cwd: string): Promise<void> {
    return undefined;
  }
  async validateWorkflow(_definition: WorkflowDefinition): Promise<ValidateResult> {
    return { valid: true };
  }
}
