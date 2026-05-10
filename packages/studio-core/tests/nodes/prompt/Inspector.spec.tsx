import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PromptInspector } from '../../../src/nodes/prompt/Inspector';

describe('PromptInspector', () => {
  beforeEach(() => cleanup());

  it('renders the Prompt body textarea', () => {
    render(
      <PromptInspector
        id="n1"
        data={{ prompt: 'classify the input' }}
        base={{}}
        unknown={{}}
        onChange={() => {}}
        siblingIds={[]}
      />,
    );
    expect((screen.getByLabelText(/^prompt$/i) as HTMLTextAreaElement).value).toBe(
      'classify the input',
    );
  });

  it('emits patch on Prompt edit', () => {
    let captured: Record<string, unknown> | null = null;
    render(
      <PromptInspector
        id="n1"
        data={{ prompt: '' }}
        base={{}}
        unknown={{}}
        onChange={(p) => {
          captured = p;
        }}
        siblingIds={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^prompt$/i), { target: { value: 'new body' } });
    expect(captured).toEqual({ prompt: 'new body' });
  });
});
