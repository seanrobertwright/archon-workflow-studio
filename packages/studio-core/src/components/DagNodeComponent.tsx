import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DagNodeData } from './canvas/deriveFlow';
import styles from './DagNodeComponent.module.css';

function DagNodeComponentInner({ data, selected }: NodeProps<DagNodeData>) {
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
