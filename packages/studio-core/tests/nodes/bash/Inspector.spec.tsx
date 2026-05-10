import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BashInspector } from '../../../src/nodes/bash/Inspector';

describe('BashInspector', () => {
  beforeEach(() => cleanup());

  it('renders the Bash body textarea + timeout input', () => {
    render(
      <BashInspector
        id="n1"
        data={{ bash: 'echo hi' }}
        base={{}}
        unknown={{}}
        onChange={() => {}}
        siblingIds={[]}
      />,
    );
    expect(screen.getByLabelText(/^bash$/i)).toBeDefined();
    expect(screen.getByLabelText(/^timeout$/i)).toBeDefined();
  });

  it('emits a patch on bash body edit', () => {
    let captured: Record<string, unknown> | null = null;
    render(
      <BashInspector
        id="n1"
        data={{ bash: '' }}
        base={{}}
        unknown={{}}
        onChange={(p) => {
          captured = p;
        }}
        siblingIds={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^bash$/i), { target: { value: 'ls -la' } });
    expect(captured).toEqual({ bash: 'ls -la' });
  });

  it('emits null timeout when the input is cleared', () => {
    let captured: Record<string, unknown> | null = null;
    render(
      <BashInspector
        id="n1"
        data={{ bash: '', timeout: 5000 }}
        base={{}}
        unknown={{}}
        onChange={(p) => {
          captured = p;
        }}
        siblingIds={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^timeout$/i), { target: { value: '' } });
    expect(captured).toEqual({ timeout: null });
  });
});
