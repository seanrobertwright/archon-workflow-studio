import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../../src/components/Canvas';
import { useBuilderStore } from '../../src/store/builder-store';
import { PositionProvider } from '../../src/hooks/PositionContext';
import type { UsePositionPersistence } from '../../src/hooks/usePositionPersistence';

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  useBuilderStore.getState().setCanvasMode('select');
  useBuilderStore.setState({ interactive: true, gridSnap: false });
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

describe('Canvas hotkeys', () => {
  function mountCanvas() {
    return render(
      <PositionProvider value={stubPositionsHook()}>
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </PositionProvider>,
    );
  }

  it('"p" switches canvas mode to pan', () => {
    mountCanvas();
    expect(useBuilderStore.getState().canvasMode).toBe('select');
    act(() => {
      fireEvent.keyDown(document.body, { key: 'p' });
    });
    expect(useBuilderStore.getState().canvasMode).toBe('pan');
  });

  it('"s" switches canvas mode to select', () => {
    useBuilderStore.getState().setCanvasMode('pan');
    mountCanvas();
    act(() => {
      fireEvent.keyDown(document.body, { key: 's' });
    });
    expect(useBuilderStore.getState().canvasMode).toBe('select');
  });

  it('"t" toggles interactivity', () => {
    mountCanvas();
    expect(useBuilderStore.getState().interactive).toBe(true);
    act(() => {
      fireEvent.keyDown(document.body, { key: 't' });
    });
    expect(useBuilderStore.getState().interactive).toBe(false);
    act(() => {
      fireEvent.keyDown(document.body, { key: 't' });
    });
    expect(useBuilderStore.getState().interactive).toBe(true);
  });

  it('"g" toggles grid snap', () => {
    mountCanvas();
    expect(useBuilderStore.getState().gridSnap).toBe(false);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'g' });
    });
    expect(useBuilderStore.getState().gridSnap).toBe(true);
  });

  it('sets data-canvas-mode on the container for CSS cursor wiring', () => {
    const { container } = mountCanvas();
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-canvas-mode')).toBe('select');
    act(() => {
      useBuilderStore.getState().setCanvasMode('pan');
    });
    expect(root.getAttribute('data-canvas-mode')).toBe('pan');
  });
});
