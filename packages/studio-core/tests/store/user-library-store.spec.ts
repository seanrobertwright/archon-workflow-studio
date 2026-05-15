import { describe, it, expect, beforeEach } from 'bun:test';
import { useUserLibraryStore } from '../../src/store/user-library-store';

beforeEach(() => {
  useUserLibraryStore.getState()._resetForTest();
});

describe('user-library-store', () => {
  it('addUserCommand appends and persists', () => {
    const entry = useUserLibraryStore.getState().addUserCommand({ name: 'investigate' });
    expect(entry.id).toMatch(/^cmd-/);
    expect(entry.name).toBe('investigate');
    expect(useUserLibraryStore.getState().userCommands).toHaveLength(1);

    // Reset in-memory state, then hydrate — should re-read what we persisted.
    useUserLibraryStore.setState({ userCommands: [], userSnippets: [], hydrated: false });
    useUserLibraryStore.getState().hydrate();
    expect(useUserLibraryStore.getState().userCommands[0]?.name).toBe('investigate');
  });

  it('trims whitespace and rejects empty names', () => {
    expect(() => useUserLibraryStore.getState().addUserCommand({ name: '   ' })).toThrow();
    const e = useUserLibraryStore.getState().addUserCommand({ name: '  hello  ' });
    expect(e.name).toBe('hello');
  });

  it('removeUserCommand drops by id and persists', () => {
    const a = useUserLibraryStore.getState().addUserCommand({ name: 'a' });
    useUserLibraryStore.getState().addUserCommand({ name: 'b' });
    useUserLibraryStore.getState().removeUserCommand(a.id);
    expect(useUserLibraryStore.getState().userCommands.map((c) => c.name)).toEqual(['b']);
  });

  it('addUserSnippet stores yaml verbatim', () => {
    const yaml = 'name: test\nnodes:\n  - id: a\n    command: foo\n';
    const s = useUserLibraryStore.getState().addUserSnippet({ name: 'my-snip', yaml });
    expect(s.yaml).toBe(yaml);
    expect(useUserLibraryStore.getState().userSnippets).toHaveLength(1);
  });

  it('removeUserSnippet drops by id', () => {
    const a = useUserLibraryStore.getState().addUserSnippet({ name: 'a', yaml: 'name: a' });
    useUserLibraryStore.getState().addUserSnippet({ name: 'b', yaml: 'name: b' });
    useUserLibraryStore.getState().removeUserSnippet(a.id);
    expect(useUserLibraryStore.getState().userSnippets.map((c) => c.name)).toEqual(['b']);
  });

  it('hydrate tolerates corrupt persisted JSON', () => {
    localStorage.setItem('archon-studio:user-library', '{ this is not json');
    useUserLibraryStore.getState().hydrate();
    expect(useUserLibraryStore.getState().userCommands).toEqual([]);
    expect(useUserLibraryStore.getState().hydrated).toBe(true);
  });

  it('hydrate ignores wrong version', () => {
    localStorage.setItem(
      'archon-studio:user-library',
      JSON.stringify({
        v: 999,
        userCommands: [{ id: 'x', name: 'x', createdAt: 1 }],
        userSnippets: [],
      }),
    );
    useUserLibraryStore.getState().hydrate();
    expect(useUserLibraryStore.getState().userCommands).toEqual([]);
  });
});
