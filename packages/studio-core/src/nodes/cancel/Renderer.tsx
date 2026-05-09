import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { CancelNodeData } from './data';

type CancelFlowNode = RFNode<DagNodeData<CancelNodeData>, VariantId>;

export function CancelRenderer(_: NodeProps<CancelFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="cancel" style={{ width: 180, height: 80 }} />;
}
