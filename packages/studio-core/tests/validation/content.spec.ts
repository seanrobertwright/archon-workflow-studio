import { describe, it, expect } from 'bun:test';
import { runContentRules } from '../../src/validation/rules/content';
import type { DagNode } from '../../src/schemas';

// ---------------------------------------------------------------------------
// Helpers — flat-shape DagNode casts through `unknown`.
// Real DagNode variants have no `base` wrapper and no `type` discriminant;
// `prompt`, `depends_on`, etc. live flat on the node. See drift 6.1.1.
// ---------------------------------------------------------------------------

const prompt = (id: string, body: string, deps: string[] = []): DagNode =>
  ({ id, prompt: body, depends_on: deps }) as unknown as DagNode;

// ---------------------------------------------------------------------------

describe('content rules — when:', () => {
  it('passes a valid when: string', () => {
    const node: DagNode = {
      id: 'a',
      prompt: 'x',
      when: "$x.output.ok == 'true'",
    } as unknown as DagNode;
    expect(runContentRules([node])).toEqual([]);
  });

  it('flags an invalid when: string with the parser error', () => {
    const node: DagNode = {
      id: 'a',
      prompt: 'x',
      when: 'this is not valid',
    } as unknown as DagNode;
    const issues = runContentRules([node]);
    expect(issues.some((i) => i.rule === 'content.when.parse')).toBe(true);
  });
});

describe('content rules — {{var}} scan', () => {
  it('passes when {{ids.X.Y}} resolves to an upstream node', () => {
    const issues = runContentRules([
      prompt('a', 'first'),
      prompt('b', 'use {{ids.a.output.value}}', ['a']),
    ]);
    expect(issues).toEqual([]);
  });

  it('warns when {{ids.X.Y}} references a non-upstream node', () => {
    const issues = runContentRules([
      prompt('a', 'first'),
      prompt('b', 'use {{ids.ghost.output.value}}', ['a']),
    ]);
    expect(
      issues.some(
        (i) =>
          i.rule === 'content.var.unknown' && i.severity === 'warning' && i.path.nodeId === 'b',
      ),
    ).toBe(true);
  });

  it('ignores {{ids.X.Y}} inside fenced code blocks', () => {
    const body = 'example:\n```\n{{ids.ghost.output.value}}\n```\nreal: {{ids.a.output.value}}';
    const issues = runContentRules([prompt('a', 'first'), prompt('b', body, ['a'])]);
    expect(issues.some((i) => i.rule === 'content.var.unknown')).toBe(false);
  });
});
