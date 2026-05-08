import { describe, it, expect, beforeEach } from 'bun:test';
import { useBuilderStore } from '../../src/store/builder-store';

describe('builder-store', () => {
  beforeEach(() => useBuilderStore.getState().clearWorkflow());

  it('starts empty', () => {
    expect(useBuilderStore.getState().workflow).toBeNull();
    expect(useBuilderStore.getState().nodes).toEqual([]);
  });

  it('loadWorkflow seeds workflow + nodes', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [{ id: 'a', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} }],
    });
    expect(useBuilderStore.getState().workflow?.name).toBe('w');
    expect(useBuilderStore.getState().nodes).toHaveLength(1);
  });

  it('updateNode patches data.command', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [{ id: 'a', variant: 'command', data: { command: 'foo' }, base: {}, unknown: {} }],
    });
    useBuilderStore.getState().updateNode('a', { data: { command: 'bar' } });
    const a = useBuilderStore.getState().nodes.find((n) => n.id === 'a')!;
    expect((a.data as { command: string }).command).toBe('bar');
  });

  it('renameNode cascades through depends_on', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'classify', variant: 'command', data: { command: 'c' }, base: {}, unknown: {} },
        {
          id: 'act',
          variant: 'command',
          data: { command: 'a' },
          base: { depends_on: ['classify'] },
          unknown: {},
        },
      ],
    });
    useBuilderStore.getState().renameNode('classify', 'sort');
    const act = useBuilderStore.getState().nodes.find((n) => n.id === 'act')!;
    expect(act.base.depends_on).toEqual(['sort']);
  });

  it('renameNode cascades through when: strings', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'classify', variant: 'command', data: { command: 'c' }, base: {}, unknown: {} },
        {
          id: 'act',
          variant: 'command',
          data: { command: 'a' },
          base: { when: "$classify.output == 'ok'" },
          unknown: {},
        },
      ],
    });
    useBuilderStore.getState().renameNode('classify', 'sort');
    const act = useBuilderStore.getState().nodes.find((n) => n.id === 'act')!;
    expect(act.base.when).toBe("$sort.output == 'ok'");
  });

  it('renameNode rejects collisions', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'command', data: { command: 'a' }, base: {}, unknown: {} },
        { id: 'b', variant: 'command', data: { command: 'b' }, base: {}, unknown: {} },
      ],
    });
    expect(() => useBuilderStore.getState().renameNode('a', 'b')).toThrow();
  });

  it('deleteNodes removes target + clears references in others depends_on', () => {
    useBuilderStore.getState().loadWorkflow({
      meta: { name: 'w', description: 'd', base: {}, unknown: {} },
      nodes: [
        { id: 'a', variant: 'command', data: { command: 'a' }, base: {}, unknown: {} },
        {
          id: 'b',
          variant: 'command',
          data: { command: 'b' },
          base: { depends_on: ['a'] },
          unknown: {},
        },
      ],
    });
    useBuilderStore.getState().deleteNodes(['a']);
    const nodes = useBuilderStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.base.depends_on).toBeUndefined();
  });
});
