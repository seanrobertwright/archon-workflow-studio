import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { VariantId } from '../registry';
import type { DagNodeData } from '../shared/types';
import type { ScriptNodeData } from './data';

type ScriptFlowNode = RFNode<DagNodeData<ScriptNodeData>, VariantId>;

export function ScriptRenderer(_: NodeProps<ScriptFlowNode>) {
  // Real implementation lands in Task 44.
  return <div data-placeholder-variant="script" style={{ width: 180, height: 80 }} />;
}
