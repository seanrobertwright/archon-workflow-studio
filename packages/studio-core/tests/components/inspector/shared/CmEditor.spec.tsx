import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { CmEditor } from '../../../../src/components/inspector/shared/CmEditor';

afterEach(cleanup);

describe('CmEditor', () => {
  it('renders the initial value into the editor view', () => {
    const { container } = render(<CmEditor value="hello world" onChange={() => {}} />);
    expect(container.textContent).toContain('hello world');
  });

  it('mounts a contenteditable region (CodeMirror view)', () => {
    const { container } = render(<CmEditor value="x" onChange={() => {}} />);
    expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  });

  it('updates the displayed text when the controlled value prop changes', () => {
    const { container, rerender } = render(<CmEditor value="first" onChange={() => {}} />);
    expect(container.textContent).toContain('first');
    rerender(<CmEditor value="second" onChange={() => {}} />);
    expect(container.textContent).toContain('second');
    expect(container.textContent).not.toContain('first');
  });
});
