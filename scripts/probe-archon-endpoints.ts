#!/usr/bin/env bun
/**
 * Probe a running Archon to resolve the open verifications from the spec
 * (§14). Pass --url to target a non-default Archon.
 *
 * Outputs Markdown findings to stdout; redirect to docs/probes/<date>.md
 * to capture.
 */
const argv = Bun.argv.slice(2);
let url = 'http://localhost:3737';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url' && argv[i + 1]) url = argv[++i];
}

interface ProbeResult {
  endpoint: string;
  ok: boolean;
  status: number;
  notes: string;
}

async function probe(path: string, opts: RequestInit = {}): Promise<ProbeResult> {
  try {
    const res = await fetch(`${url}${path}`, opts);
    const text = await res.text();
    return {
      endpoint: path,
      ok: res.ok,
      status: res.status,
      notes: text.slice(0, 200),
    };
  } catch (err) {
    return {
      endpoint: path,
      ok: false,
      status: 0,
      notes: `fetch failed: ${String(err)}`,
    };
  }
}

const results: ProbeResult[] = [];
results.push(await probe('/api/openapi.json'));
results.push(await probe('/api/codebases'));
results.push(await probe('/api/workflows'));
results.push(await probe('/api/commands'));

console.log(`# Archon endpoint probe — ${new Date().toISOString()}\n`);
console.log(`Target: \`${url}\`\n`);
console.log(`| Endpoint | OK | Status | Notes |\n|---|---|---|---|`);
for (const r of results) {
  console.log(
    `| \`${r.endpoint}\` | ${r.ok ? '✓' : '✗'} | ${r.status} | ${r.notes.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 80)} |`,
  );
}

console.log('\n## CORS check (Origin: http://localhost:5173)\n');
const cors = await probe('/api/openapi.json', {
  headers: { Origin: 'http://localhost:5173' },
});
console.log(
  `Status: ${cors.status}. Manual follow-up: inspect \`Access-Control-Allow-Origin\` response header in browser devtools.\n`,
);

console.log('## Auth check\n');
console.log(
  'No request was sent with credentials. If any of the above returned 401/403, Archon expects auth.\n',
);
