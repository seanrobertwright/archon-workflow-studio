import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { workflowDefinitionSchema } from '../src/schemas';

const FIXTURE_DIR = join(import.meta.dir, '../../studio-fixtures/src/round-trip-fixtures');

const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.yaml'));

describe('round-trip: every Archon bundled default', () => {
  it('has at least one fixture vendored', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
  });

  for (const fixture of fixtures) {
    it(`${fixture} parses against our mirrored schema`, async () => {
      const yamlText = readFileSync(join(FIXTURE_DIR, fixture), 'utf8');

      // Phase 0 doesn't have an importer/exporter yet — just verify the YAML
      // parses to JSON and the JSON satisfies workflowDefinitionSchema.
      // Phase 1 replaces this body with: parse → import → export → diff.
      const yaml = await import('yaml');
      const json = yaml.parse(yamlText);
      const result = workflowDefinitionSchema.safeParse(json);
      if (!result.success) {
        console.error(`Schema parse failed for ${fixture}:`);
        console.error(JSON.stringify(result.error.format(), null, 2));
      }
      expect(result.success).toBe(true);
    });
  }
});
