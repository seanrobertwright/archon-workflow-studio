import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { Toolbar } from '../../src/components/Toolbar';
import { useBuilderStore } from '../../src/store/builder-store';
import { PositionProvider } from '../../src/hooks/PositionContext';
import type { UsePositionPersistence } from '../../src/hooks/usePositionPersistence';
import type { ReactNode } from 'react';

const mockPositions: UsePositionPersistence = {
  positions: new Map(),
  setPosition: () => {},
  setMany: () => {},
  reset: () => {},
};

function WithPositions({ children }: { children: ReactNode }) {
  return <PositionProvider value={mockPositions}>{children}</PositionProvider>;
}

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

beforeEach(() => {
  useBuilderStore.getState().clearWorkflow();
  useBuilderStore.getState().setCanvasMode('select');
});

afterEach(() => cleanup());

describe('Toolbar — canvas mode buttons', () => {
  it('renders Select and Pan mode buttons with Select pressed by default', () => {
    render(<Toolbar workflowName="t" onResetLayout={() => {}} />, { wrapper: WithPositions });
    const selectBtn = screen.getByRole('button', { name: /select mode/i });
    const panBtn = screen.getByRole('button', { name: /pan mode/i });
    expect(selectBtn.getAttribute('aria-pressed')).toBe('true');
    expect(panBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking Pan switches the store mode and toggles aria-pressed', () => {
    render(<Toolbar workflowName="t" onResetLayout={() => {}} />, { wrapper: WithPositions });
    const selectBtn = screen.getByRole('button', { name: /select mode/i });
    const panBtn = screen.getByRole('button', { name: /pan mode/i });
    fireEvent.click(panBtn);
    expect(useBuilderStore.getState().canvasMode).toBe('pan');
    expect(panBtn.getAttribute('aria-pressed')).toBe('true');
    expect(selectBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking Select after Pan returns to select mode', () => {
    useBuilderStore.getState().setCanvasMode('pan');
    render(<Toolbar workflowName="t" onResetLayout={() => {}} />, { wrapper: WithPositions });
    const selectBtn = screen.getByRole('button', { name: /select mode/i });
    fireEvent.click(selectBtn);
    expect(useBuilderStore.getState().canvasMode).toBe('select');
  });
});
