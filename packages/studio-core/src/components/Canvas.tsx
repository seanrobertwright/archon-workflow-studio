import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  type NodeChange,
  type Node as RFNode,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useBuilderStore } from '../store/builder-store';
import { deriveFlow, type DagNodeData } from './canvas/deriveFlow';
import { layoutWithDagre } from '../hooks/useDagre';
import type { UsePositionPersistence } from '../hooks/usePositionPersistence';
import { defaultRegistry } from '../nodes/default-registry';
import { VARIANT_IDS } from '../nodes/registry';
import {
  makeOnNodesChange,
  makeOnConnect,
  makeOnEdgesDelete,
  makeOnNodesDelete,
} from './canvas/canvasHandlers';

export interface CanvasProps {
  /** Position-persistence handle. WorkflowBuilder constructs the real one; tests pass a stub. */
  positions: UsePositionPersistence;
}

export function Canvas({ positions }: CanvasProps) {
  const storeNodes = useBuilderStore((s) => s.nodes);
  const connect = useBuilderStore((s) => s.connect);
  const disconnect = useBuilderStore((s) => s.disconnect);
  const deleteNodes = useBuilderStore((s) => s.deleteNodes);

  // Build the React Flow nodeTypes map from the variant registry. Each per-variant
  // Renderer is registered under its own variant id; deriveFlow emits `type: variant`,
  // so React Flow dispatches to the correct component. The cast is justified at the
  // dispatcher boundary — typed `TData` is reclaimed inside each Renderer.
  const nodeTypes = useMemo(
    () =>
      Object.fromEntries(VARIANT_IDS.map((id) => [id, defaultRegistry[id].Renderer])) as Record<
        string,
        ComponentType<NodeProps>
      >,
    [],
  );

  // Derive RF nodes/edges from the store. `deriveFlow` returns {x:0,y:0} for
  // any node missing from the persistence map; we overlay seeded/persisted
  // positions when rendering below.
  const { rfNodes: derivedNodes, rfEdges } = useMemo(
    () => deriveFlow(storeNodes, positions.positions),
    [storeNodes, positions.positions],
  );

  // Local in-flight node array for React Flow. We hydrate it from `derivedNodes`
  // whenever the *set* of node ids changes (load, add, delete) but otherwise let
  // applyNodeChanges drive it during drag/select so the canvas stays smooth.
  const [rfNodes, setRfNodes] = useState<RFNode<DagNodeData>[]>(derivedNodes);

  const idsKey = useMemo(() => storeNodes.map((n) => n.id).join(' '), [storeNodes]);

  useEffect(() => {
    setRfNodes(
      derivedNodes.map((n) => ({
        ...n,
        position: positions.positions.get(n.id) ?? n.position,
      })),
    );
    // We only re-hydrate when the set of ids changes; updates to an existing
    // node's position go through applyNodeChanges instead.
  }, [idsKey]);

  // Seed dagre-computed positions for any node id NOT already in the map.
  // setMany is debounced inside the persistence hook so this writes once.
  // FRAGILITY (Phase 3+): when a node is added mid-session, dagre re-lays out
  // every node assuming UNMAPPED ones sit at {0,0}. For Phase 2 (single load,
  // no add) this is fine; Phase 3's NodeLibrary will need to feed dagre the
  // currently-persisted positions as fixed anchors (or only lay out the new
  // subgraph). Track this as a Phase-3 prerequisite.
  useEffect(() => {
    const missing = derivedNodes.filter((n) => !positions.positions.has(n.id));
    if (missing.length === 0) return;
    const laid = layoutWithDagre(derivedNodes, rfEdges);
    const newEntries: [string, { x: number; y: number }][] = missing
      .map((n) => [n.id, laid.get(n.id)] as const)
      .filter((entry): entry is [string, { x: number; y: number }] => entry[1] !== undefined);
    if (newEntries.length > 0) positions.setMany(newEntries);
  }, [idsKey]);

  // Persistence hook — drag-end only. Pure factory tested in canvasHandlers.spec.ts.
  const persistOnNodesChange = useMemo(() => makeOnNodesChange(positions), [positions]);

  // Forward every change to React Flow's internal state AND record drag-end persistence.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((prev) => applyNodeChanges(changes, prev) as RFNode<DagNodeData>[]);
      persistOnNodesChange(changes);
    },
    [persistOnNodesChange],
  );

  const onConnect = useMemo(() => makeOnConnect(connect), [connect]);
  const onEdgesDelete = useMemo(() => makeOnEdgesDelete(disconnect), [disconnect]);
  const onNodesDelete = useMemo(() => makeOnNodesDelete(deleteNodes), [deleteNodes]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onEdgesDelete={onEdgesDelete}
      onNodesDelete={onNodesDelete}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
