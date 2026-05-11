// Public surface for @archon-studio/core. Re-export only what consumers should use.
export const STUDIO_CORE_VERSION = '0.0.0';

export { ThemeProvider, type ThemePreset } from './theme/ThemeProvider';
export { ApiClientProvider, useWorkflowApi } from './api/ApiClientProvider';
export type {
  WorkflowApiClient,
  CodebaseInfo,
  WorkflowListItem,
  ValidateResult,
} from './api/WorkflowApiClient';
export type { WorkflowDefinition, DagNode } from './schemas';
export { workflowDefinitionSchema } from './schemas';
export { VARIANT_IDS, type VariantId } from './nodes/registry';

export { WorkflowBuilder, type WorkflowBuilderProps } from './components/WorkflowBuilder';
export { NodeInspector } from './components/inspector/NodeInspector';

export { fromWorkflowDefinition } from './exporter/fromWorkflowDefinition';
export { toWorkflowDefinition } from './exporter/toWorkflowDefinition';
export { useBuilderStore } from './store/builder-store';
export type {
  BuilderState,
  WorkflowMeta,
  LoadWorkflowInput,
  IssuePath,
} from './store/builder-store';

export { useValidation } from './validation/useValidation';
export type { UseValidationResult } from './validation/useValidation';
