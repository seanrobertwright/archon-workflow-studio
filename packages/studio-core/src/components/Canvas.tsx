import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type Node as RFNode,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useBuilderStore } from '../store/builder-store';
import { deriveFlow, type DagNodeData } from './canvas/deriveFlow';
import { layoutWithDagre } from '../hooks/useDagre';
import { usePositionContext } from '../hooks/PositionContext';
import { defaultRegistry } from '../nodes/default-registry';
import { VARIANT_IDS } from '../nodes/registry';
import { LIBRARY_DRAG_MIME, decodeLibraryDrag } from './library/dragPayload';
import {
  makeOnNodesChange,
  makeOnConnect,
  makeOnEdgesDelete,
  makeOnNodesDelete,
} from './canvas/canvasHandlers';

export function Canvas() {
  const positions = usePositionContext();
  const reactFlow = useReactFlow();

  const storeNodes = useBuilderStore((s) => s.nodes);
  const connect = useBuilderStore((s) => s.connect);
  const disconnect = useBuilderStore((s) => s.disconnect);
  const deleteNodes = useBuilderStore((s) => s.deleteNodes);
  const addNodeFromVariant = useBuilderStore((s) => s.addNodeFromVariant);

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

  // Seed positions for any node id NOT already in the map.
  // Phase-3 hardening (Task 47): on first load (positions empty), run dagre on
  // the whole graph. On a subsequent partial-miss (theoretically only when a
  // caller adds without setting a position) seed at origin so we don't clobber
  // existing persisted layouts. Library drag-drop sets the position itself
  // before this effect runs, so it never enters the "missing" branch.
  useEffect(() => {
    const missing = derivedNodes.filter((n) => !positions.positions.has(n.id));
    if (missing.length === 0) return;
    if (positions.positions.size === 0) {
      // First-load: full dagre over the whole graph.
      const laid = layoutWithDagre(derivedNodes, rfEdges);
      const newEntries: [string, { x: number; y: number }][] = derivedNodes
        .map((n) => [n.id, laid.get(n.id)] as const)
        .filter((entry): entry is [string, { x: number; y: number }] => entry[1] !== undefined);
      if (newEntries.length > 0) positions.setMany(newEntries);
    } else {
      // Some positions already persisted; only seed missing ids at origin.
      positions.setMany(missing.map((n) => [n.id, { x: 0, y: 0 }]));
    }
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

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(LIBRARY_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(LIBRARY_DRAG_MIME);
      const payload = decodeLibraryDrag(raw);
      if (!payload) return;
      e.preventDefault();
      const flowPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (payload.kind === 'variant') {
        const id = addNodeFromVariant(payload.variantId, { dataPatch: payload.prefill });
        positions.setPosition(id, flowPos);
      }
      // payload.kind === 'snippet' handled in Task 51 (insertSnippet wiring).
    },
    [reactFlow, addNodeFromVariant, positions],
  );

  return (
    <div onDrop={onDrop} onDragOver={onDragOver} style={{ width: '100%', height: '100%' }}>
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
    </div>
  );
}
