import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { Toolbar } from '../../src/components/Toolbar';
import { useBuilderStore } from '../../src/store/builder-store';
import { useUndoStore, resetCoalesceState } from '../../src/store/undo-store';

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
});

afterEach(() => cleanup());

describe('Toolbar Save gate', () => {
  it('disables Save and shows topErrors in title when hasErrors is true', () => {
    render(
      <Toolbar
        workflowName="test"
        onResetLayout={() => {}}
        onSave={() => {}}
        hasErrors={true}
        topErrors={['Error A', 'Error B']}
      />,
    );
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn.hasAttribute('disabled')).toBe(true);
    expect(saveBtn.getAttribute('title')).toContain('Error A');
  });

  it('enables Save when only warnings remain (hasErrors false)', () => {
    render(
      <Toolbar
        workflowName="test"
        onResetLayout={() => {}}
        onSave={() => {}}
        hasErrors={false}
        topErrors={[]}
      />,
    );
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn.hasAttribute('disabled')).toBe(false);
  });

  it('invokes onSave when Save is clicked', () => {
    let called = false;
    render(
      <Toolbar
        workflowName="test"
        onResetLayout={() => {}}
        onSave={() => {
          called = true;
        }}
        hasErrors={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(called).toBe(true);
  });

  it('omits the Save button entirely when onSave is undefined', () => {
    render(<Toolbar workflowName="test" onResetLayout={() => {}} />);
    const saveBtn = screen.queryByRole('button', { name: /save/i });
    expect(saveBtn).toBeNull();
  });
});

describe('Toolbar — YAML toggle', () => {
  it('does not render the YAML button when onToggleYamlPreview is omitted', () => {
    render(<Toolbar workflowName="w" onResetLayout={() => {}} />);
    expect(screen.queryByRole('button', { name: /yaml/i })).toBeNull();
  });

  it('renders a pressed YAML button when isYamlPreviewOpen is true', () => {
    render(
      <Toolbar
        workflowName="w"
        onResetLayout={() => {}}
        isYamlPreviewOpen={true}
        onToggleYamlPreview={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /yaml/i });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the YAML button calls onToggleYamlPreview', () => {
    let count = 0;
    render(
      <Toolbar
        workflowName="w"
        onResetLayout={() => {}}
        isYamlPreviewOpen={false}
        onToggleYamlPreview={() => {
          count++;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /yaml/i }));
    expect(count).toBe(1);
  });
});

describe('<Toolbar> alignment buttons', () => {
  const makeNode = (id: string) => ({
    id,
    variant: 'bash' as const,
    data: {},
    base: {},
    unknown: {},
  });

  beforeEach(() => {
    resetCoalesceState();
    useBuilderStore.setState({
      nodes: [makeNode('a'), makeNode('b')],
      selectedNodeIds: ['a', 'b'],
      primarySelectionId: 'b',
      positions: { a: { x: 10, y: 30 }, b: { x: 50, y: 10 } },
    });
    useUndoStore.setState({ past: [], future: [] });
  });
  afterEach(() => {
    useBuilderStore.setState({
      nodes: [],
      selectedNodeIds: [],
      primarySelectionId: null,
      positions: {},
    });
    useUndoStore.setState({ past: [], future: [] });
  });

  it('align left button triggers alignLeft on selection', () => {
    render(<Toolbar workflowName="test" onResetLayout={() => {}} />);
    const btn = screen.getByLabelText('Align left');
    fireEvent.click(btn);
    const { positions } = useBuilderStore.getState();
    // both nodes should now be at x=10 (leftmost)
    expect(positions['a'].x).toBe(10);
    expect(positions['b'].x).toBe(10);
  });
});
