import type { VariantDefinition } from './shared/types';

export type VariantId = 'command' | 'prompt' | 'bash' | 'script' | 'loop' | 'approval' | 'cancel';

export const VARIANT_IDS: readonly VariantId[] = [
  'command',
  'prompt',
  'bash',
  'script',
  'loop',
  'approval',
  'cancel',
] as const;

export type VariantRegistry = {
  readonly [K in VariantId]: VariantDefinition<unknown>;
};

/**
 * Build a typed registry from a per-variant lookup. Throws if any variant is missing
 * or declares a mismatching id. Per-variant modules are the only registrants;
 * consumer code reads via `getVariant` (in `default-registry.ts`).
 */
export function buildRegistry(entries: {
  [K in VariantId]: VariantDefinition<unknown>;
}): VariantRegistry {
  for (const id of VARIANT_IDS) {
    if (!entries[id]) throw new Error(`Variant registry missing: ${id}`);
    if (entries[id].id !== id) {
      throw new Error(
        `Variant registry mismatch: entry under '${id}' declares id '${entries[id].id}'`,
      );
    }
  }
  return entries;
}
