import { describe, it, expect } from 'bun:test';
import { VARIANT_IDS } from '../../src/nodes/registry';

// Imports re-enabled in Task 26 along with default-registry.ts.
// import { defaultRegistry, getVariant } from '../../src/nodes/default-registry';
const defaultRegistry = {} as Record<string, never>;
const getVariant = (_id: string) => ({}) as never;

describe.skip('default variant registry', () => {
  // Un-skipped in Task 26 once all 7 per-variant modules ship.
  it('contains all 7 variant ids', () => {
    for (const id of VARIANT_IDS) {
      expect(defaultRegistry[id]).toBeDefined();
      expect(defaultRegistry[id].id).toBe(id);
    }
  });

  it('exposes a variant by id', () => {
    expect(getVariant('command').id).toBe('command');
    expect(getVariant('cancel').id).toBe('cancel');
  });

  it('every variant has capabilities + library metadata + schema + createDefault + fromDag + toDag', () => {
    for (const id of VARIANT_IDS) {
      const v = getVariant(id);
      expect(v.capabilities).toBeDefined();
      expect(v.library.label).toBeTruthy();
      expect(v.library.colorToken).toBeTruthy();
      expect(typeof v.createDefault).toBe('function');
      expect(typeof v.fromDag).toBe('function');
      expect(typeof v.toDag).toBe('function');
    }
  });
});
