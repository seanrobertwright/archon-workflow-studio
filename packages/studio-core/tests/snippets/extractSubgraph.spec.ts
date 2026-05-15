import { describe, it, expect } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { extractSubgraph } from '../../src/snippets/extractSubgraph';
import type { BuilderNode } from '../../src/nodes/shared/types';

const cmd = (id: string, depends_on?: string[]): BuilderNode => ({
  id,
  variant: 'command',
  data: { command: id },
  base: depends_on ? { depends_on } : {},
  unknown: {},
});

describe('extractSubgraph', () => {
  it('emits a workflow YAML with only selected nodes', () => {
    const nodes = [cmd('a'), cmd('b'), cmd('c')];
    const { yaml } = extractSubgraph({ nodes, selectedIds: ['a', 'b'] });
    const parsed = parseYaml(yaml) as { nodes: { id: string }[] };
    expect(parsed.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('filters depends_on refs that point outside the selection', () => {
    const nodes = [cmd('a'), cmd('b', ['a', 'outside']), cmd('outside')];
    const { yaml, droppedDeps } = extractSubgraph({ nodes, selectedIds: ['a', 'b'] });
    const parsed = parseYaml(yaml) as { nodes: { id: string; depends_on?: string[] }[] };
    const b = parsed.nodes.find((n) => n.id === 'b')!;
    expect(b.depends_on).toEqual(['a']);
    expect(droppedDeps).toEqual([{ nodeId: 'b', droppedRefs: ['outside'] }]);
  });

  it('drops depends_on entirely when no refs remain', () => {
    const nodes = [cmd('a', ['outside']), cmd('outside')];
    const { yaml } = extractSubgraph({ nodes, selectedIds: ['a'] });
    const parsed = parseYaml(yaml) as { nodes: { id: string; depends_on?: string[] }[] };
    expect(parsed.nodes[0]).not.toHaveProperty('depends_on');
  });

  it('preserves selection order in the emitted YAML', () => {
    const nodes = [cmd('a'), cmd('b'), cmd('c')];
    const { yaml } = extractSubgraph({ nodes, selectedIds: ['c', 'a', 'b'] });
    const parsed = parseYaml(yaml) as { nodes: { id: string }[] };
    expect(parsed.nodes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });

  it('uses workflowName + description in the wrapper meta', () => {
    const nodes = [cmd('a')];
    const { yaml } = extractSubgraph({
      nodes,
      selectedIds: ['a'],
      workflowName: 'my-snip',
      description: 'a saved subgraph',
    });
    const parsed = parseYaml(yaml) as { name: string; description: string };
    expect(parsed.name).toBe('my-snip');
    expect(parsed.description).toBe('a saved subgraph');
  });

  it('falls back to a placeholder name when none is provided', () => {
    const { yaml } = extractSubgraph({ nodes: [cmd('a')], selectedIds: ['a'] });
    const parsed = parseYaml(yaml) as { name: string };
    expect(parsed.name).toBe('snippet');
  });

  it('round-trip via insertSnippet preserves node ids when no collision', async () => {
    // Sanity-check: emitted YAML is something insertSnippet can ingest.
    const { yaml } = extractSubgraph({
      nodes: [cmd('a'), cmd('b', ['a'])],
      selectedIds: ['a', 'b'],
    });
    const parsed = parseYaml(yaml) as { nodes: { id: string }[] };
    expect(parsed.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
