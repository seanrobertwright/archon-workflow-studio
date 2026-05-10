import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LoopInspector } from '../../../src/nodes/loop/Inspector';

const baseLoop = {
  prompt: 'iterate',
  until: 'COMPLETE',
  max_iterations: 5,
  fresh_context: false,
};

describe('LoopInspector', () => {
  beforeEach(() => cleanup());

  it('renders Prompt + Until + Max iterations + Fresh context + Interactive', () => {
    render(
      <LoopInspector
        id="n1"
        data={{ loop: baseLoop }}
        base={{}}
        unknown={{}}
        onChange={() => {}}
        siblingIds={[]}
      />,
    );
    expect(screen.getByLabelText(/^prompt$/i)).toBeDefined();
    expect(screen.getByLabelText(/^until$/i)).toBeDefined();
    expect(screen.getByLabelText(/max iterations/i)).toBeDefined();
    expect(screen.getByLabelText(/fresh context/i)).toBeDefined();
    expect(screen.getByLabelText(/^interactive$/i)).toBeDefined();
  });

  it('emits a deep-merge patch on loop.prompt edit (preserves siblings)', () => {
    let captured: Record<string, unknown> | null = null;
    render(
      <LoopInspector
        id="n1"
        data={{ loop: baseLoop }}
        base={{}}
        unknown={{}}
        onChange={(p) => {
          captured = p;
        }}
        siblingIds={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^prompt$/i), { target: { value: 'new body' } });
    // Patch shape MUST be { loop: { prompt: ... } } so mergePatch deep-merges
    // and doesn't replace until / max_iterations / fresh_context.
    expect(captured).toEqual({ loop: { prompt: 'new body' } });
  });

  it('reveals the gate_message field only when interactive is on', () => {
    const { rerender } = render(
      <LoopInspector
        id="n1"
        data={{ loop: baseLoop }}
        base={{}}
        unknown={{}}
        onChange={() => {}}
        siblingIds={[]}
      />,
    );
    expect(screen.queryByLabelText(/gate message/i)).toBeNull();
    rerender(
      <LoopInspector
        id="n1"
        data={{ loop: { ...baseLoop, interactive: true } }}
        base={{}}
        unknown={{}}
        onChange={() => {}}
        siblingIds={[]}
      />,
    );
    expect(screen.getByLabelText(/gate message/i)).toBeDefined();
  });
});
