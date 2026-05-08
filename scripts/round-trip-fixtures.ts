#!/usr/bin/env bun
/**
 * Fetch Archon's bundled-default + smoke YAML files at the pinned SHA into
 * packages/studio-fixtures/src/round-trip-fixtures/.
 *
 * Phase 0 vendors ONE fixture as the seed. Phase 1 expands the FIXTURE_LIST
 * to include every file in `.archon/workflows/defaults/` plus the all-nodes
 * smoke test.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PIN = readFileSync(join(ROOT, '.archon-source-pin'), 'utf8').trim();
const OUT = join(ROOT, 'packages/studio-fixtures/src/round-trip-fixtures');

// Phase 1: all bundled defaults + the all-nodes smoke fixture.
const FIXTURE_LIST: { archonPath: string; localName: string }[] = [
  {
    archonPath: '.archon/workflows/defaults/archon-adversarial-dev.yaml',
    localName: 'archon-adversarial-dev.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-architect.yaml',
    localName: 'archon-architect.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-assist.yaml',
    localName: 'archon-assist.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-comprehensive-pr-review.yaml',
    localName: 'archon-comprehensive-pr-review.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-create-issue.yaml',
    localName: 'archon-create-issue.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-feature-development.yaml',
    localName: 'archon-feature-development.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-fix-github-issue.yaml',
    localName: 'archon-fix-github-issue.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-idea-to-pr.yaml',
    localName: 'archon-idea-to-pr.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-interactive-prd.yaml',
    localName: 'archon-interactive-prd.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-issue-review-full.yaml',
    localName: 'archon-issue-review-full.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-piv-loop.yaml',
    localName: 'archon-piv-loop.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-plan-to-pr.yaml',
    localName: 'archon-plan-to-pr.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-ralph-dag.yaml',
    localName: 'archon-ralph-dag.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-refactor-safely.yaml',
    localName: 'archon-refactor-safely.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-remotion-generate.yaml',
    localName: 'archon-remotion-generate.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-resolve-conflicts.yaml',
    localName: 'archon-resolve-conflicts.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-smart-pr-review.yaml',
    localName: 'archon-smart-pr-review.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-test-loop-dag.yaml',
    localName: 'archon-test-loop-dag.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-validate-pr.yaml',
    localName: 'archon-validate-pr.yaml',
  },
  {
    archonPath: '.archon/workflows/defaults/archon-workflow-builder.yaml',
    localName: 'archon-workflow-builder.yaml',
  },
  {
    archonPath: '.archon/workflows/test-workflows/e2e-pi-all-nodes-smoke.yaml',
    localName: '_smoke-pi-all-nodes.yaml',
  },
];

for (const f of FIXTURE_LIST) {
  const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/${f.archonPath}`;
  const yaml = await (await fetch(url)).text();
  writeFileSync(join(OUT, f.localName), yaml, 'utf8');
  console.log(`✓ ${f.localName} (${yaml.length} bytes)`);
}

console.log(`\nWrote ${FIXTURE_LIST.length} fixture(s) at SHA ${PIN.slice(0, 8)}.`);
