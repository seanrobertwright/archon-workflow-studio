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

// Phase 0: just the seed. Phase 1 adds the rest.
const FIXTURE_LIST: { archonPath: string; localName: string }[] = [
  {
    archonPath: '.archon/workflows/defaults/archon-feature-development.yaml',
    localName: 'archon-feature-development.yaml',
  },
];

for (const f of FIXTURE_LIST) {
  const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/${f.archonPath}`;
  const yaml = await (await fetch(url)).text();
  writeFileSync(join(OUT, f.localName), yaml, 'utf8');
  console.log(`✓ ${f.localName} (${yaml.length} bytes)`);
}

console.log(`\nWrote ${FIXTURE_LIST.length} fixture(s) at SHA ${PIN.slice(0, 8)}.`);
