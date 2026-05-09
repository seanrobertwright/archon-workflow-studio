import { useEffect, useState } from 'react';
import { WorkflowBuilder, fromWorkflowDefinition, useBuilderStore } from '@archon-studio/core';
import { StubArchonApiClient } from '@archon-studio/api-archon';
// Vite bundles YAML files as raw strings via `?raw`. The fixtures package's
// own loader uses `node:fs` and can't be imported in the browser; we resolve
// the asset path directly through Vite's module graph instead.
import smokeYaml from '@archon-studio/fixtures/round-trip-fixtures/_smoke-pi-all-nodes.yaml?raw';

const FIXTURE_NAME = '_smoke-pi-all-nodes';
const FIXTURE_TEXT: Record<string, string> = {
  [FIXTURE_NAME]: smokeYaml,
};

const client = new StubArchonApiClient({
  loadFixture: (name) => {
    const text = FIXTURE_TEXT[name];
    if (text == null) {
      throw new Error(`[standalone] no bundled fixture named '${name}'`);
    }
    return text;
  },
});

export function App() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const def = await client.getWorkflow(FIXTURE_NAME, '/dev');
      if (cancelled) return;
      // The cast is a structural no-op: WorkflowDefinition is shaped as
      // Record<string, unknown> at runtime (Zod-validated, but not branded).
      // Phase 1's `fromWorkflowDefinition` accepts the loose type so the same
      // importer handles untrusted parsed JSON. Phase 9 may tighten by giving
      // the importer an overload that accepts WorkflowDefinition directly.
      const input = fromWorkflowDefinition(def as Record<string, unknown>);
      useBuilderStore.getState().loadWorkflow(input);
      setLoaded(true);
    })().catch((err) => {
      console.error('[standalone] fixture load failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <div style={{ padding: 24, color: 'var(--studio-fg)' }}>Loading {FIXTURE_NAME}…</div>;
  }

  return (
    <WorkflowBuilder
      client={client}
      theme="archon-dark"
      archonUrl="__dev__"
      cwd="__dev__"
      workflowName={FIXTURE_NAME}
    />
  );
}
