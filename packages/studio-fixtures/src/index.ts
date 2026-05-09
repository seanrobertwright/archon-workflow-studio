import { SNIPPET_DATA } from './snippet-data.generated';

/**
 * Snippets are read from an inlined map (browser-safe). Source YAML lives
 * under `snippets/{starters,patterns}/*.yaml`; regenerate the map via
 * `bun run build-snippet-data` after editing.
 *
 * Round-trip fixtures (`round-trip-fixtures/*.yaml`) are loaded directly via
 * `import.meta.dir` + `readFileSync` inside the round-trip test (Bun runtime
 * only). Keeping that path out of this index leaves the package browser-safe.
 */
export function loadSnippet(category: 'starters' | 'patterns', name: string): string {
  const bucket = SNIPPET_DATA[category] as Record<string, string>;
  const yaml = bucket[name];
  if (yaml === undefined) {
    throw new Error(`loadSnippet: unknown snippet '${category}/${name}'`);
  }
  return yaml;
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
