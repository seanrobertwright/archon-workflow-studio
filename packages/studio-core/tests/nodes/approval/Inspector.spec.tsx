import { describe, it, expect, beforeEach } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ApprovalInspector } from '../../../src/nodes/approval/Inspector';

describe('ApprovalInspector', () => {
  beforeEach(() => cleanup());

  it('renders Message + Capture response + On reject prompt fields', () => {
    render(
      <ApprovalInspector
        id="n1"
        data={{ approval: { message: 'Approve?' } }}
        base={{}}
        unknown={{}}
        onChange={() => {}}
        siblingIds={[]}
      />,
    );
    expect(screen.getByLabelText(/^message$/i)).toBeDefined();
    expect(screen.getByLabelText(/capture response/i)).toBeDefined();
    expect(screen.getByLabelText(/on reject prompt/i)).toBeDefined();
  });

  it('emits a deep-merge patch on approval.message edit', () => {
    let captured: Record<string, unknown> | null = null;
    render(
      <ApprovalInspector
        id="n1"
        data={{ approval: { message: 'old' } }}
        base={{}}
        unknown={{}}
        onChange={(p) => {
          captured = p;
        }}
        siblingIds={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'new copy' } });
    expect(captured).toEqual({ approval: { message: 'new copy' } });
  });
});
