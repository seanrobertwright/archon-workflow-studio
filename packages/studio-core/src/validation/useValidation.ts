/**
 * useValidation — one ValidationEngine per WorkflowBuilder mount.
 *
 * Bridges the Zustand builder store (BuilderNode[]) and the ValidationEngine
 * (DagNode[]) via useSyncExternalStore. Handles:
 *
 *  - BuilderNode → DagNode conversion via toWorkflowDefinition (drift 6.5.2).
 *  - useWorkflowApi (not useApiClient — drift 6.5.1) used as the optional
 *    server-tier client.
 *  - focusIssue: writes selectedNodeId + focusedIssue to the store so
 *    panel→inspector navigation goes through the store without creating an
 *    import cycle between the ValidationPanel and validation/types.
 *  - null-safe: when workflow === null, engine receives no nodes and no
 *    definition so both debounced and server tiers are skipped (drift 6.5.3).
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { ValidationEngine, type EngineSnapshot } from './engine';
import { useBuilderStore, type IssuePath } from '../store/builder-store';
import { useWorkflowApi } from '../api/ApiClientProvider';
import { toWorkflowDefinition } from '../exporter/toWorkflowDefinition';
import type { DagNode, WorkflowDefinition } from '../schemas';

export interface UseValidationResult extends EngineSnapshot {
  /** True if any issue has severity === 'error'. */
  hasErrors: boolean;
  /**
   * Navigate the inspector to a specific issue.
   * Sets selectedNodeId (so the canvas focuses the node) and focusedIssue
   * (so the inspector tab can scroll to the relevant field).
   */
  focusIssue: (path: IssuePath) => void;
}

export function useValidation(): UseValidationResult {
  // One engine per mount; initialised lazily inside the ref so it is created
  // exactly once per component lifetime (StrictMode-safe: dispose fires on
  // unmount, fresh engine is created on remount — drift 6.5.6).
  const engineRef = useRef<ValidationEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ValidationEngine({
      // debounceMs left at default (300 ms); the hook doesn't control it.
    });
  }
  const engine = engineRef.current;

  // Client from context — used for the optional server validation tier.
  // useWorkflowApi throws when no provider is present (drift 6.5.1/pre-impl note).
  // The hook is always called inside WorkflowBuilder which wraps ApiClientProvider,
  // so this is safe in production. In tests, wrap in <ApiClientProvider>.
  const client = useWorkflowApi();

  // Inject the client into the engine once on mount. The engine stores a ref to
  // the client; if the client identity ever changes (not expected) this won't
  // update — acceptable for Phase 6.
  useEffect(() => {
    // Accessing private field via cast is intentional: engine.client is a
    // typed private field. We use a validated cast rather than a public setter
    // to keep the engine interface minimal.
    (engine as unknown as { client: typeof client }).client = client;
  }, [engine, client]);

  // Subscribe to engine notifications via useSyncExternalStore.
  // snapshot() is referentially stable per drift 6.4.5 — safe to pass directly.
  const snapshot = useSyncExternalStore(
    (onStoreChange) => engine.subscribe(onStoreChange),
    () => engine.snapshot(),
    () => engine.snapshot(), // getServerSnapshot (same value — drift 6.5.5)
  );

  // Store selectors — use getState() to avoid creating new refs each render.
  const nodes = useBuilderStore((s) => s.nodes);
  const workflow = useBuilderStore((s) => s.workflow);

  // Re-run engine.update whenever nodes or workflow changes.
  // BuilderNode[] → DagNode[] via toWorkflowDefinition (drift 6.5.2).
  // When workflow is null the engine receives empty nodes and no definition,
  // so the server tier is never invoked.
  useEffect(() => {
    const definition = workflow ? toWorkflowDefinition({ meta: workflow, nodes }) : undefined;
    // definition.nodes is the flat DagNode-shaped array produced by toDag().
    // toWorkflowDefinition returns Record<string, unknown>, not WorkflowDefinition,
    // so we cast through unknown (drift 6.5.3 — the engine forwards it to the
    // client unchanged; type loosening is acceptable here).
    const dagNodes = (definition ? (definition.nodes as unknown[]) : []) as readonly DagNode[];
    engine.update({
      nodes: dagNodes,
      definition: definition as unknown as WorkflowDefinition,
    });
  }, [engine, nodes, workflow]);

  // Dispose the engine when this component unmounts.
  useEffect(() => {
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [engine]);

  // focusIssue: push selectedNodeId + focusedIssue into the store.
  // Wrapped in useCallback with stable deps so downstream memoisation works.
  const focusIssue = useCallback(
    (path: IssuePath) => {
      const { setSelectedNodeId, setFocusedIssue } = useBuilderStore.getState();
      if (path.nodeId !== undefined) {
        setSelectedNodeId(path.nodeId);
      }
      setFocusedIssue(path);
    },
    [], // no deps — reads from getState() which is always current
  );

  return {
    ...snapshot,
    hasErrors: snapshot.issues.some((i) => i.severity === 'error'),
    focusIssue,
  };
}
