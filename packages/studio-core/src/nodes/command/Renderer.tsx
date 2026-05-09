import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { CommandNodeData } from './data';

type CommandFlowNode = RFNode<DagNodeData<CommandNodeData>, VariantId>;

export function CommandRenderer(_: NodeProps<CommandFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="command" style={{ width: 180, height: 80 }} />;
}
