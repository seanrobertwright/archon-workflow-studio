import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { NodeLibrary } from '../../src/components/NodeLibrary';
import { useBuilderStore } from '../../src/store/builder-store';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

beforeEach(() => useBuilderStore.getState().clearWorkflow());
afterEach(() => cleanup());

describe('NodeLibrary', () => {
  it('renders one tile per variant under the Variants heading', () => {
    render(
      <ReactFlowProvider>
        <NodeLibrary />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole('heading', { name: /variants/i })).toBeDefined();
    for (const v of ['command', 'prompt', 'bash', 'script', 'loop', 'approval', 'cancel']) {
      expect(screen.getByLabelText(`Add ${v} node`)).toBeDefined();
    }
  });

  it('click-to-add appends a node via addNodeFromVariant', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: '', base: {}, unknown: {} },
      nodes: [],
    });
    render(
      <ReactFlowProvider>
        <NodeLibrary />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByLabelText('Add loop node'));
    const nodes = useBuilderStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].variant).toBe('loop');
  });
});
