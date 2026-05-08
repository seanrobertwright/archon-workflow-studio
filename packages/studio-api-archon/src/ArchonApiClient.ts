import type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
} from '@archon-studio/core';
import type { WorkflowDefinition } from '@archon-studio/core';

export interface ArchonApiClientOptions {
  baseUrl: string; // e.g., 'http://localhost:3737'
  fetchFn?: typeof fetch;
  authHeader?: string;
}

/**
 * Phase 9 fills in real implementations. Phase 0 ships throwing stubs so the
 * type-check passes and consumers can wire the client without runtime calls.
 */
export class ArchonApiClient implements WorkflowApiClient {
  constructor(_options: ArchonApiClientOptions) {}

  ping(): Promise<{ ok: true; serverVersion?: string }> {
    throw new Error('ArchonApiClient.ping not yet implemented (Phase 9)');
  }
  listCodebases(): Promise<CodebaseInfo[] | null> {
    throw new Error('ArchonApiClient.listCodebases not yet implemented (Phase 9)');
  }
  listWorkflows(_cwd: string): Promise<WorkflowListItem[]> {
    throw new Error('ArchonApiClient.listWorkflows not yet implemented (Phase 9)');
  }
  listCommands(
    _cwd: string,
  ): Promise<{ name: string; source: 'project' | 'global' | 'bundled' }[]> {
    throw new Error('ArchonApiClient.listCommands not yet implemented (Phase 9)');
  }
  listProviders(): Promise<{ id: string; capabilities: Record<string, boolean> }[]> {
    throw new Error('ArchonApiClient.listProviders not yet implemented (Phase 9)');
  }
  getWorkflow(_name: string, _cwd: string): Promise<WorkflowDefinition> {
    throw new Error('ArchonApiClient.getWorkflow not yet implemented (Phase 9)');
  }
  saveWorkflow(
    _name: string,
    _cwd: string,
    _definition: WorkflowDefinition,
  ): Promise<WorkflowDefinition> {
    throw new Error('ArchonApiClient.saveWorkflow not yet implemented (Phase 9)');
  }
  deleteWorkflow(_name: string, _cwd: string): Promise<void> {
    throw new Error('ArchonApiClient.deleteWorkflow not yet implemented (Phase 9)');
  }
  validateWorkflow(_definition: WorkflowDefinition): Promise<ValidateResult> {
    throw new Error('ArchonApiClient.validateWorkflow not yet implemented (Phase 9)');
  }
}
