import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorkflowBuilder } from '../../src/components/WorkflowBuilder';
import { useBuilderStore } from '../../src/store/builder-store';
import type { WorkflowApiClient } from '../../src/api/WorkflowApiClient';

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  globalThis.localStorage?.clear();
});

// Auto-cleanup rendered React trees so multiple render() calls within this file
// don't leak DOM into later tests (bun:test has no implicit cleanup).
afterEach(() => {
  cleanup();
});

const noopClient: WorkflowApiClient = {
  ping: async () => ({ ok: true }),
  listCodebases: async () => null,
  listWorkflows: async () => [],
  listCommands: async () => [],
  listProviders: async () => [],
  getWorkflow: async () => ({ name: 'noop', description: '', nodes: [] }) as unknown as never,
  saveWorkflow: async (_n, _c, d) => d,
  deleteWorkflow: async () => undefined,
  validateWorkflow: async () => ({ valid: true }),
};

describe('WorkflowBuilder', () => {
  it('renders the layout shell with toolbar / canvas / library + inspector slots', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'demo', description: '', base: {}, unknown: {} },
      nodes: [{ id: 'only', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} }],
    });
    render(
      <WorkflowBuilder
        client={noopClient}
        theme="archon-dark"
        archonUrl="__dev__"
        cwd="__dev__"
        workflowName="demo"
      />,
    );
    expect(screen.getByText('demo')).toBeDefined(); // toolbar shows name
    expect(screen.getByText('only')).toBeDefined(); // canvas renders the node
    expect(screen.getByLabelText('Node library')).toBeDefined();
    expect(screen.getByLabelText('Node inspector')).toBeDefined();
  });

  it('Reset layout button drops persisted positions and re-runs dagre', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'demo', description: '', base: {}, unknown: {} },
      nodes: [{ id: 'only', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} }],
    });
    // Pre-seed a hand-tweaked position via localStorage
    globalThis.localStorage.setItem(
      'studio:positions:__dev__::__dev__::demo',
      JSON.stringify({ only: { x: 999, y: 999 } }),
    );
    render(
      <WorkflowBuilder
        client={noopClient}
        theme="archon-dark"
        archonUrl="__dev__"
        cwd="__dev__"
        workflowName="demo"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reset layout/i }));
    expect(globalThis.localStorage.getItem('studio:positions:__dev__::__dev__::demo')).toBeNull();
  });
});
