import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../../src/components/Canvas';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUserLibraryStore } from '../../src/store/user-library-store';
import { PositionProvider } from '../../src/hooks/PositionContext';
import type { UsePositionPersistence } from '../../src/hooks/usePositionPersistence';

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  useUserLibraryStore.getState()._resetForTest();
  globalThis.localStorage?.clear();
});
afterEach(() => cleanup());

const stubPositionsHook = (): UsePositionPersistence => {
  const map = new Map<string, { x: number; y: number }>();
  return {
    positions: map,
    setPosition: (id, pos) => {
      map.set(id, pos);
    },
    setMany: (entries) => {
      for (const [id, p] of Array.from(entries)) map.set(id, p);
    },
    reset: () => map.clear(),
  } as UsePositionPersistence;
};

const seedThreeNodes = () => {
  useBuilderStore.getState().loadWorkflow({
    meta: { name: 'w', description: 'd', base: {}, unknown: {} },
    nodes: [
      { id: 'a', variant: 'command', data: { command: 'a' }, base: {}, unknown: {} },
      { id: 'b', variant: 'command', data: { command: 'b' }, base: {}, unknown: {} },
      { id: 'c', variant: 'command', data: { command: 'c' }, base: {}, unknown: {} },
    ],
  });
};

describe('CanvasContextMenu', () => {
  it('opens on right-click and aligns selected nodes along the vertical centerline (same X)', () => {
    seedThreeNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 0, y: 0 });
    positions.positions.set('b', { x: 100, y: 80 });
    positions.positions.set('c', { x: 250, y: 200 });

    const { container, queryByTestId, getByText } = render(
      <PositionProvider value={positions}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );

    act(() => {
      useBuilderStore.getState().setSelection(['a', 'b', 'c']);
    });

    // No menu yet
    expect(queryByTestId('canvas-context-menu')).toBeNull();

    // Fire contextmenu on a node — React Flow's onNodeContextMenu wires through.
    const nodeEl = container.querySelector('[data-id="a"]') as HTMLElement;
    expect(nodeEl).not.toBeNull();
    act(() => {
      fireEvent.contextMenu(nodeEl);
    });

    const menu = queryByTestId('canvas-context-menu');
    expect(menu).not.toBeNull();

    act(() => {
      fireEvent.click(getByText('Align vertically'));
    });

    // centerV equalizes X across the selection.
    const out = useBuilderStore.getState().positions;
    expect(out.a.x).toBe(out.b.x);
    expect(out.b.x).toBe(out.c.x);
    // Menu closes after action
    expect(queryByTestId('canvas-context-menu')).toBeNull();
  });

  it('disables distribute items when fewer than 3 nodes are selected', () => {
    seedThreeNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 0, y: 0 });
    positions.positions.set('b', { x: 100, y: 80 });
    positions.positions.set('c', { x: 250, y: 200 });

    const { container, getByRole } = render(
      <PositionProvider value={positions}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );

    act(() => {
      useBuilderStore.getState().setSelection(['a', 'b']);
    });
    const nodeEl = container.querySelector('[data-id="a"]') as HTMLElement;
    act(() => {
      fireEvent.contextMenu(nodeEl);
    });

    const distH = getByRole('menuitem', {
      name: /space evenly horizontally/i,
    }) as HTMLButtonElement;
    const alignV = getByRole('menuitem', { name: /align vertically/i }) as HTMLButtonElement;
    expect(distH.disabled).toBe(true);
    expect(alignV.disabled).toBe(false);
  });

  it('distributes evenly along the horizontal axis when 3+ nodes are selected', () => {
    seedThreeNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 0, y: 0 });
    positions.positions.set('b', { x: 50, y: 0 });
    positions.positions.set('c', { x: 400, y: 0 });

    const { container, getByText } = render(
      <PositionProvider value={positions}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );

    act(() => {
      useBuilderStore.getState().setSelection(['a', 'b', 'c']);
    });
    const nodeEl = container.querySelector('[data-id="a"]') as HTMLElement;
    act(() => {
      fireEvent.contextMenu(nodeEl);
    });
    act(() => {
      fireEvent.click(getByText('Space evenly horizontally'));
    });

    // After distributeH: gap between a-right and b-left == gap between b-right and c-left.
    const out = useBuilderStore.getState().positions;
    const W = 200;
    const gap1 = out.b.x - (out.a.x + W);
    const gap2 = out.c.x - (out.b.x + W);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.001);
  });

  it('closes on outside pointerdown (regression: menu used to persist)', () => {
    seedThreeNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 0, y: 0 });
    positions.positions.set('b', { x: 100, y: 80 });

    const { container, queryByTestId } = render(
      <PositionProvider value={positions}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );
    act(() => {
      useBuilderStore.getState().setSelection(['a', 'b']);
    });
    const nodeEl = container.querySelector('[data-id="a"]') as HTMLElement;
    act(() => {
      fireEvent.contextMenu(nodeEl);
    });
    expect(queryByTestId('canvas-context-menu')).not.toBeNull();

    // Click anywhere outside the menu — should dismiss.
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(queryByTestId('canvas-context-menu')).toBeNull();
  });

  it('"Save selection as snippet…" persists the selection to user-library store', () => {
    seedThreeNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 0, y: 0 });
    positions.positions.set('b', { x: 100, y: 0 });

    const { container, getByRole, getByLabelText } = render(
      <PositionProvider value={positions}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );

    act(() => {
      useBuilderStore.getState().setSelection(['a', 'b']);
    });
    const nodeEl = container.querySelector('[data-id="a"]') as HTMLElement;
    act(() => {
      fireEvent.contextMenu(nodeEl);
    });

    act(() => {
      fireEvent.click(getByRole('menuitem', { name: /save selection as snippet/i }));
    });

    const input = getByLabelText(/snippet name/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'my-saved-flow' } });
    });
    act(() => {
      fireEvent.click(getByRole('button', { name: /^save$/i }));
    });

    const snippets = useUserLibraryStore.getState().userSnippets;
    expect(snippets).toHaveLength(1);
    expect(snippets[0]!.name).toBe('my-saved-flow');
    expect(snippets[0]!.yaml).toContain('id: a');
    expect(snippets[0]!.yaml).toContain('id: b');
  });

  it('closes on Escape', () => {
    seedThreeNodes();
    const positions = stubPositionsHook();
    positions.positions.set('a', { x: 0, y: 0 });
    positions.positions.set('b', { x: 100, y: 80 });

    const { container, queryByTestId } = render(
      <PositionProvider value={positions}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );
    act(() => {
      useBuilderStore.getState().setSelection(['a', 'b']);
    });
    const nodeEl = container.querySelector('[data-id="a"]') as HTMLElement;
    act(() => {
      fireEvent.contextMenu(nodeEl);
    });
    expect(queryByTestId('canvas-context-menu')).not.toBeNull();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(queryByTestId('canvas-context-menu')).toBeNull();
  });
});
