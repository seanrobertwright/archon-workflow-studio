#!/usr/bin/env bun
/**
 * Compare our mirrored schemas at packages/studio-core/src/ against
 * Archon's source files at the SHA in .archon-source-pin.
 *
 * Strips MIRROR-NOTE blocks and OpenAPI .openapi() chained calls before diff
 * to avoid false positives from intentional adaptations.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PIN = readFileSync(join(ROOT, '.archon-source-pin'), 'utf8').trim();

interface MirrorEntry {
  /** Path under our `packages/studio-core/src/`. */
  localPath: string;
  /** Path under Archon's `packages/workflows/src/`. */
  archonPath: string;
}

const FILES: readonly MirrorEntry[] = [
  { localPath: 'schemas/workflow.ts', archonPath: 'schemas/workflow.ts' },
  { localPath: 'schemas/dag-node.ts', archonPath: 'schemas/dag-node.ts' },
  { localPath: 'schemas/loop.ts', archonPath: 'schemas/loop.ts' },
  { localPath: 'schemas/retry.ts', archonPath: 'schemas/retry.ts' },
  { localPath: 'schemas/hooks.ts', archonPath: 'schemas/hooks.ts' },
  { localPath: 'command-validation.ts', archonPath: 'command-validation.ts' },
];

function strip(s: string): string {
  return (
    s
      // Remove MIRROR-NOTE lines (first line + any consecutive bare // continuation lines)
      .replace(/\/\/ MIRROR-NOTE:[^\n]*(?:\n\/\/[^\n]*)*\n?/g, '')
      // Remove .openapi(...) calls including leading whitespace and trailing semicolon.
      // CONSTRAINT: this regex assumes .openapi() arguments contain no
      // un-escaped closing parens. Any Archon code that passes a literal
      // `)` inside an .openapi() string/template will break this strip
      // and surface as phantom drift; fix by escaping that input upstream
      // OR by replacing this regex with a tiny paren-balance walker.
      .replace(/\s*\.openapi\([\s\S]*?\);?/g, '')
      // Normalise import paths
      .replace(/from\s+['"][^'"]*['"]/g, "from 'IMPORT'")
      // Normalise single-param arrow functions: (x) => → x =>
      // (Prettier adds parens; upstream may omit them)
      .replace(/\((\w+)\)\s*=>/g, '$1 =>')
      // Remove trailing commas before ) ] }
      // (Prettier adds trailing commas; upstream may omit them)
      .replace(/,(\s*[)\]}])/g, '$1')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      // Remove statement semicolons following ) or } — normalises the .openapi()
      // removal that shifts the ; position between local and upstream
      .replace(/([)}]);/g, '$1')
      .trim()
  );
}

let drift = false;

for (const { localPath, archonPath } of FILES) {
  const ours = strip(readFileSync(join(ROOT, 'packages/studio-core/src', localPath), 'utf8'));
  const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/packages/workflows/src/${archonPath}`;
  const upstream = strip(await (await fetch(url)).text());
  if (ours !== upstream) {
    console.error(`✗ DRIFT: packages/studio-core/src/${localPath}`);
    drift = true;
  } else {
    console.log(`✓ ${localPath}`);
  }
}

if (drift) {
  console.error(
    '\nSchema drift detected. Either update the mirror to match Archon at the pinned SHA, or move the SHA forward and review the implications.',
  );
  process.exit(1);
}
console.log(`\nAll ${FILES.length} files match Archon @ ${PIN.slice(0, 8)}.`);
