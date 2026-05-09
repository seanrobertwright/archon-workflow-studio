import { parse as parseYaml } from 'yaml';
import { loadRoundTripFixture } from '@archon-studio/fixtures';
import { workflowDefinitionSchema } from '@archon-studio/core';
import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
  WorkflowDefinition,
} from '@archon-studio/core';

/**
 * Phase-2 stub. Resolves `getWorkflow` from the bundled round-trip fixtures.
 * The real `ArchonApiClient` lands in Phase 9.
 */
export class StubArchonApiClient implements WorkflowApiClient {
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
    const yamlText = loadRoundTripFixture(name);
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
