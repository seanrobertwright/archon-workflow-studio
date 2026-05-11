import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUndoStore, resetCoalesceState } from '../../src/store/undo-store';
import type { UndoSnapshot } from '../../src/store/undo-store';

const makeNode = (id: string) => ({
  id,
  variant: 'bash' as const,
  data: {},
  base: {},
  unknown: {},
});

describe('applySnapshot / revertSnapshot', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      nodes: [],
      positions: {},
      selectedNodeIds: [],
      primarySelectionId: null,
    });
    useUndoStore.setState({ past: [], future: [] });
    resetCoalesceState();
  });
  afterEach(() => {
    useBuilderStore.setState({
      nodes: [],
      positions: {},
      selectedNodeIds: [],
      primarySelectionId: null,
    });
    useUndoStore.setState({ past: [], future: [] });
    resetCoalesceState();
  });

  it('applySnapshot restores nodes + positions from snapshot', () => {
    const snap: UndoSnapshot = {
      label: 'restore',
      workflow: null,
      nodes: [makeNode('a')],
      positions: { a: { x: 10, y: 20 } },
    };
    useBuilderStore.getState().applySnapshot(snap);
    expect(useBuilderStore.getState().nodes).toHaveLength(1);
    expect(useBuilderStore.getState().positions['a']).toEqual({ x: 10, y: 20 });
  });

  it('revertSnapshot = applySnapshot (same semantics)', () => {
    const snap: UndoSnapshot = {
      label: 'revert',
      workflow: null,
      nodes: [makeNode('b')],
      positions: { b: { x: 5, y: 15 } },
    };
    useBuilderStore.getState().revertSnapshot(snap);
    expect(useBuilderStore.getState().nodes).toHaveLength(1);
    expect(useBuilderStore.getState().positions['b']).toEqual({ x: 5, y: 15 });
  });

  it('undo then applySnapshot restores the previous state', () => {
    // Setup: two nodes, push snapshot, delete one, undo
    useBuilderStore.setState({
      nodes: [makeNode('a'), makeNode('b')] as any,
      positions: { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } },
    });
    useUndoStore.getState().push({
      label: 'delete nodes',
      workflow: null,
      nodes: [makeNode('a'), makeNode('b')],
      positions: { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } },
    });
    useBuilderStore.setState({ nodes: [makeNode('a')] as any, positions: { a: { x: 0, y: 0 } } });
    const snap = useUndoStore.getState().undo();
    if (snap) useBuilderStore.getState().applySnapshot(snap);
    expect(useBuilderStore.getState().nodes).toHaveLength(2);
  });
});
