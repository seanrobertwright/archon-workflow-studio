import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { ApprovalNodeData } from './data';

type ApprovalFlowNode = RFNode<DagNodeData<ApprovalNodeData>, VariantId>;

export function ApprovalRenderer(_: NodeProps<ApprovalFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="approval" style={{ width: 180, height: 80 }} />;
}
