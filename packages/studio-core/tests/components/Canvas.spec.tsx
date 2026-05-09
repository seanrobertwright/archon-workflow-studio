import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../../src/components/Canvas';
import { useBuilderStore } from '../../src/store/builder-store';
import type { UsePositionPersistence } from '../../src/hooks/usePositionPersistence';

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  globalThis.localStorage?.clear();
});

const stubPositionsHook = (): UsePositionPersistence & { _calls: unknown[][] } => {
  const map = new Map<string, { x: number; y: number }>();
  const calls: unknown[][] = [];
  return {
    positions: map,
    setPosition: (id, pos) => {
      calls.push(['setPosition', id, pos]);
      map.set(id, pos);
    },
    setMany: (entries) => {
      const arr = Array.from(entries);
      calls.push(['setMany', arr]);
      for (const [id, p] of arr) map.set(id, p);
    },
    reset: () => {
      calls.push(['reset']);
      map.clear();
    },
    _calls: calls,
  } as UsePositionPersistence & { _calls: unknown[][] };
};

const seedTwoNodes = () => {
  useBuilderStore.getState().loadWorkflow({
    meta: { name: 'w', description: 'd', base: {}, unknown: {} },
    nodes: [
      { id: 'a', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} },
      {
        id: 'b',
        variant: 'command',
        data: { command: 'bar' },
        base: { depends_on: ['a'] },
        unknown: {},
      },
    ],
  });
};

describe('Canvas', () => {
  it('renders one DagNodeComponent per store node', () => {
    seedTwoNodes();
    const positions = stubPositionsHook();
    render(
      <ReactFlowProvider>
        <Canvas positions={positions} />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('a')).toBeDefined();
    expect(screen.getByText('b')).toBeDefined();
  });

  it('seeds dagre positions for nodes missing from the persistence map', () => {
    seedTwoNodes();
    const positions = stubPositionsHook();
    render(
      <ReactFlowProvider>
        <Canvas positions={positions} />
      </ReactFlowProvider>,
    );
    const setManyCall = positions._calls.find((c) => c[0] === 'setMany');
    expect(setManyCall).toBeDefined();
    const entries = setManyCall![1] as [string, { x: number; y: number }][];
    expect(entries.map(([id]) => id).sort()).toEqual(['a', 'b']);
  });

  it('does not re-seed nodes that already have a persisted position', () => {
    seedTwoNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 999, y: 999 });
    render(
      <ReactFlowProvider>
        <Canvas positions={positions} />
      </ReactFlowProvider>,
    );
    const setManyCall = positions._calls.find((c) => c[0] === 'setMany');
    if (setManyCall) {
      const entries = setManyCall[1] as [string, { x: number; y: number }][];
      const ids = entries.map(([id]) => id);
      expect(ids).not.toContain('a');
      expect(ids).toContain('b');
    }
  });
});
