import { describe, it, expect, beforeAll } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { DagNodeComponent } from '../../src/components/DagNodeComponent';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

const baseProps = {
  id: 'classify',
  type: 'dag',
  selected: false,
  dragging: false,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  zIndex: 0,
};

describe('DagNodeComponent', () => {
  it('renders the id label', () => {
    render(
      <ReactFlowProvider>
        <DagNodeComponent
          {...(baseProps as any)}
          data={{ variant: 'command', storeId: 'classify', label: 'classify' }}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('classify')).toBeDefined();
  });

  it('shows the variant tag', () => {
    render(
      <ReactFlowProvider>
        <DagNodeComponent
          {...(baseProps as any)}
          data={{ variant: 'loop', storeId: 'l', label: 'l' }}
        />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('loop')).toBeDefined();
  });

  it('applies the variant color stripe via CSS variable', () => {
    const { container } = render(
      <ReactFlowProvider>
        <DagNodeComponent
          {...(baseProps as any)}
          data={{ variant: 'approval', storeId: 'gate', label: 'gate' }}
        />
      </ReactFlowProvider>,
    );
    const stripe = container.querySelector('[data-stripe="true"]') as HTMLElement;
    expect(stripe).toBeTruthy();
    expect(stripe.style.background).toContain('--node-approval');
  });
});
