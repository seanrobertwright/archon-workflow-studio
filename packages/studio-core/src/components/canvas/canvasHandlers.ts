import type { Connection, NodeChange, Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { UsePositionPersistence } from '../../hooks/usePositionPersistence';

/**
 * Pure factory returning an `onNodesChange` callback that persists drag-end positions.
 * Note: this handler ONLY tracks persistence — Canvas separately forwards every change
 * to React Flow's internal state via `applyNodeChanges` so the in-flight drag renders.
 */
export function makeOnNodesChange(positions: UsePositionPersistence) {
  return (changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type !== 'position') continue;
      if (c.dragging !== false) continue; // ignore mid-drag frames
      if (!c.position) continue;
      positions.setPosition(c.id, c.position);
    }
  };
}

export function makeOnConnect(connect: (source: string, target: string) => void) {
  return (conn: Connection) => {
    if (!conn.source || !conn.target) return;
    if (conn.source === conn.target) return;
    connect(conn.source, conn.target);
  };
}

export function makeOnEdgesDelete(disconnect: (source: string, target: string) => void) {
  return (edges: RFEdge[]) => {
    for (const e of edges) disconnect(e.source, e.target);
  };
}

export function makeOnNodesDelete(deleteNodes: (ids: string[]) => void) {
  return (nodes: RFNode[]) => {
    deleteNodes(nodes.map((n) => n.id));
  };
}
