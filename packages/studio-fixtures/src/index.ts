import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export function loadRoundTripFixture(name: string): string {
  return readFileSync(join(dirname, 'round-trip-fixtures', `${name}.yaml`), 'utf8');
}

export function loadSnippet(category: 'starters' | 'patterns', name: string): string {
  return readFileSync(join(dirname, 'snippets', category, `${name}.yaml`), 'utf8');
}

export const ROUND_TRIP_FIXTURE_NAMES: readonly string[] = [
  // Filled in by scripts/round-trip-fixtures.ts (Task 13). Phase 0 ships ONE.
  'archon-feature-development',
];
