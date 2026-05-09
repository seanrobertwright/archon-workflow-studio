import { memo } from 'react';
import { Handle, Position, type Node as RFNode, type NodeProps } from '@xyflow/react';
import type { DagNodeData } from './canvas/deriveFlow';
import styles from './DagNodeComponent.module.css';

// xyflow v12: NodeProps is generic over the WHOLE Node type, not just data.
type DagFlowNode = RFNode<DagNodeData, 'dag'>;

function DagNodeComponentInner({ data, selected }: NodeProps<DagFlowNode>) {
  return (
    <div
      className={styles.node}
      data-selected={selected ? 'true' : 'false'}
      data-variant={data.variant}
      style={{ width: 180, height: 80 }}
    >
      <div
        className={styles.stripe}
        data-stripe="true"
        style={{ background: `var(--node-${data.variant})` }}
      />
      <div className={styles.body}>
        <div className={styles.label}>{data.label}</div>
        <div className={styles.tag}>{data.variant}</div>
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const DagNodeComponent = memo(DagNodeComponentInner);
