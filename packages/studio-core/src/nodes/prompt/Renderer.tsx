import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { PromptNodeData } from './data';

type PromptFlowNode = RFNode<DagNodeData<PromptNodeData>, VariantId>;

export function PromptRenderer(_: NodeProps<PromptFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="prompt" style={{ width: 180, height: 80 }} />;
}
