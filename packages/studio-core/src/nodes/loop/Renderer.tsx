import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { LoopNodeData } from './data';

type LoopFlowNode = RFNode<DagNodeData<LoopNodeData>, VariantId>;

export function LoopRenderer(_: NodeProps<LoopFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="loop" style={{ width: 180, height: 80 }} />;
}
