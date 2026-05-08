#!/usr/bin/env bun
/**
 * Compare Bun.YAML.stringify and the `yaml` npm package output for a
 * representative workflow definition. Documents normalisation differences.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yamlPkg from 'yaml';

const ROOT = join(import.meta.dir, '..');
const FIXTURE = join(
  ROOT,
  'packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml',
);
const yamlText = readFileSync(FIXTURE, 'utf8');

const json = yamlPkg.parse(yamlText);

const bunOut = Bun.YAML.stringify(json);
const pkgOut = yamlPkg.stringify(json);

console.log('# YAML equivalence probe\n');
console.log(
  `Source: \`packages/studio-fixtures/src/round-trip-fixtures/archon-feature-development.yaml\`\n`,
);
console.log('## bun-out chars / pkg-out chars\n');
console.log(`Bun.YAML.stringify: ${bunOut.length} bytes`);
console.log(`yaml package:       ${pkgOut.length} bytes\n`);

if (bunOut === pkgOut) {
  console.log('## Result: byte-equivalent ✓\n');
} else {
  console.log('## Result: NOT byte-equivalent — diff below\n');
  console.log('### Bun output\n```yaml\n' + bunOut + '\n```\n');
  console.log('### yaml-package output\n```yaml\n' + pkgOut + '\n```');
}
