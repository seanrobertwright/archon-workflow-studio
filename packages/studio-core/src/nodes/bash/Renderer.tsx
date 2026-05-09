import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { BashNodeData } from './data';

type BashFlowNode = RFNode<DagNodeData<BashNodeData>, VariantId>;

export function BashRenderer(_: NodeProps<BashFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="bash" style={{ width: 180, height: 80 }} />;
}
