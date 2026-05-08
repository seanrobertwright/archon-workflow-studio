export type VariantId = 'command' | 'prompt' | 'bash' | 'script' | 'loop' | 'approval' | 'cancel';

// Phase 1 fills in VariantDefinition + a working register() / get() API.
// This file exists in Phase 0 as the placeholder anchor.
export const VARIANT_IDS: readonly VariantId[] = [
  'command',
  'prompt',
  'bash',
  'script',
  'loop',
  'approval',
  'cancel',
] as const;
