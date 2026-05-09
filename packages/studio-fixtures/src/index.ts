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
  // Filled in by scripts/round-trip-fixtures.ts (Task 16). Phase 1 expands to all 21 bundled defaults + smoke.
  '_smoke-pi-all-nodes',
  'archon-adversarial-dev',
  'archon-architect',
  'archon-assist',
  'archon-comprehensive-pr-review',
  'archon-create-issue',
  'archon-feature-development',
  'archon-fix-github-issue',
  'archon-idea-to-pr',
  'archon-interactive-prd',
  'archon-issue-review-full',
  'archon-piv-loop',
  'archon-plan-to-pr',
  'archon-ralph-dag',
  'archon-refactor-safely',
  'archon-remotion-generate',
  'archon-resolve-conflicts',
  'archon-smart-pr-review',
  'archon-test-loop-dag',
  'archon-validate-pr',
  'archon-workflow-builder',
];

export const SNIPPET_STARTERS = [
  'archon-feature-development',
  'archon-fix-github-issue',
  'archon-test-loop-dag',
] as const;

export const SNIPPET_PATTERNS = [
  'classify-then-branch',
  'fan-out-collect',
  'loop-until-signal',
] as const;

export type SnippetStarter = (typeof SNIPPET_STARTERS)[number];
export type SnippetPattern = (typeof SNIPPET_PATTERNS)[number];
