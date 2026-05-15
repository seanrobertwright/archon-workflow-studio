#!/usr/bin/env bun
/**
 * Compares Archon's `when:` evaluator at the pinned SHA against the studio's
 * documented operator/connective set. Designed to FAIL when Archon adds a
 * grammar feature the studio's parser does not model.
 *
 * Strategy: fetch upstream `condition-evaluator.ts`, extract the atom regex
 * literal (the authoritative source of operators), and confirm its operator
 * alternation matches what `grammar.archon.md` documents. Also extracts the
 * connective splits (`||`, `&&`) and confirms they're the only ones the
 * upstream evaluator drives.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const PIN = readFileSync(join(ROOT, '.archon-source-pin'), 'utf8').trim();

const ARCHON_EVALUATOR_PATH = 'packages/workflows/src/condition-evaluator.ts';
const url = `https://raw.githubusercontent.com/coleam00/Archon/${PIN}/${ARCHON_EVALUATOR_PATH}`;

const STUDIO_OPS = new Set(['==', '!=', '<', '>', '<=', '>=']);
const STUDIO_CONNECTIVES = new Set(['&&', '||']);

const response = await fetch(url);
if (!response.ok) {
  console.error(`✗ Failed to fetch ${url}: HTTP ${response.status}`);
  process.exit(2);
}
const upstream = await response.text();

let drift = false;

// 1. Extract the atom regex literal and parse its operator alternation.
//    The mirrored regex in grammar.archon.md is the contract; if upstream's
//    regex changes, that's a grammar drift regardless of which side
//    "wins" — the human operator must reconcile both docs.
const atomRegexLine = upstream.match(/atomPattern\s*=\s*\/([^\n]+?)\/[a-z]*;?/);
if (!atomRegexLine) {
  console.error(
    '✗ DRIFT: could not locate `atomPattern = /.../` in upstream — file layout changed.',
  );
  drift = true;
} else {
  // Find the operator alternation group: `(==|!=|<=|>=|<|>)` or similar.
  const opGroup = atomRegexLine[1]!.match(/\(([=!<>]{1,2}(?:\|[=!<>]{1,2})*)\)/);
  if (!opGroup) {
    console.error('✗ DRIFT: could not locate operator alternation in upstream regex.');
    drift = true;
  } else {
    const upstreamOps = new Set(opGroup[1]!.split('|'));
    for (const op of upstreamOps) {
      if (!STUDIO_OPS.has(op)) {
        console.error(`✗ DRIFT: upstream operator "${op}" not modeled by studio.`);
        drift = true;
      }
    }
    for (const op of STUDIO_OPS) {
      if (!upstreamOps.has(op)) {
        console.error(`✗ DRIFT: studio operator "${op}" no longer in upstream.`);
        drift = true;
      }
    }
  }
}

// 2. Confirm the connective set matches what the upstream splitter uses.
//    Upstream's splitOutsideQuotes is called once per connective in the
//    evaluator entrypoint; look for the literal separators.
const splitterCalls = [
  ...upstream.matchAll(/splitOutsideQuotes\([^,]+,\s*['"]([^'"]+)['"]\)/g),
].map((m) => m[1]!);
const upstreamConnectives = new Set(splitterCalls);
if (upstreamConnectives.size === 0) {
  console.error('✗ DRIFT: no splitOutsideQuotes calls found upstream — entrypoint refactored.');
  drift = true;
} else {
  for (const c of upstreamConnectives) {
    if (!STUDIO_CONNECTIVES.has(c)) {
      console.error(`✗ DRIFT: upstream connective "${c}" not modeled by studio.`);
      drift = true;
    }
  }
  for (const c of STUDIO_CONNECTIVES) {
    if (!upstreamConnectives.has(c)) {
      console.error(`✗ DRIFT: studio connective "${c}" no longer in upstream.`);
      drift = true;
    }
  }
}

if (drift) {
  console.error(
    `\nGrammar drift detected against Archon @ ${PIN.slice(0, 8)}.\n` +
      `Update lib/grammar.ts AND grammar.archon.md together, then bump the pin.`,
  );
  process.exit(1);
}
console.log(`✓ when: grammar in sync with Archon @ ${PIN.slice(0, 8)}.`);
