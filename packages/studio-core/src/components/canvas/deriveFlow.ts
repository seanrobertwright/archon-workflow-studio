import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { BuilderNode } from '../../nodes/shared/types';
import type { VariantId } from '../../nodes/registry';

export interface DagNodeData extends Record<string, unknown> {
  variant: VariantId;
  storeId: string;
  /** Read by DagNodeComponent for label rendering. */
  label: string;
}

export interface DeriveFlowResult {
  rfNodes: RFNode<DagNodeData>[];
  rfEdges: RFEdge[];
}

export function deriveFlow(
  storeNodes: readonly BuilderNode[],
  positions: ReadonlyMap<string, { x: number; y: number }>,
): DeriveFlowResult {
  const knownIds = new Set(storeNodes.map((n) => n.id));

  const rfNodes: RFNode<DagNodeData>[] = storeNodes.map((n) => ({
    id: n.id,
    type: 'dag',
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { variant: n.variant, storeId: n.id, label: n.id },
  }));

  const rfEdges: RFEdge[] = [];
  for (const target of storeNodes) {
    const dep = target.base.depends_on as string[] | undefined;
    if (!dep) continue;
    const targetHasWhen = typeof target.base.when === 'string';
    for (const source of dep) {
      if (!knownIds.has(source)) continue; // defensive
      rfEdges.push({
        id: `${source}->${target.id}`,
        source,
        target: target.id,
        type: 'smoothstep',
        style: targetHasWhen
          ? { stroke: 'var(--studio-when)', strokeDasharray: '6 4' }
          : { stroke: 'var(--studio-muted)' },
      });
    }
  }

  return { rfNodes, rfEdges };
}
