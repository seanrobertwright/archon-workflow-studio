import type { ComponentType } from 'react';
import type { Node as RFNode, NodeProps } from '@xyflow/react';
import type { z } from 'zod';
import type { VariantId } from '../registry';
import type { DagNode } from '../../schemas';

/**
 * Variant capabilities — drive Inspector tab visibility (Phase 4) and validator
 * behaviour. Mirrors the runtime semantics of dag-executor.ts at the pinned SHA.
 */
export interface VariantCapabilities {
  /** false → bash/script/cancel/approval ignore provider/model/tools at runtime. */
  honorsAiFields: boolean;
  /** true on loop — `retry` is rejected by Archon's superRefine. */
  forbidsRetry: boolean;
  /** true on approval and interactive loops — Archon pauses execution. */
  requiresInteractive?: boolean;
}

/** NodeLibrary metadata — used by Phase 3 to render the left palette. */
export interface VariantLibraryMetadata {
  label: string;
  description: string;
  /** CSS-variable-friendly token name (e.g. 'command' → `var(--node-command)`). */
  colorToken: string;
  /** Lucide icon name (the actual import happens in Phase 3). */
  iconName: string;
  /** Default id prefix when adding a fresh node ('classify', 'gate', etc.). */
  defaultIdHint: string;
}

/**
 * In-store representation of a node. Distinct from `DagNode` (the wire shape)
 * to keep the editor's data structure stable as Archon's schema evolves.
 */
export interface BuilderNode<TData = unknown> {
  /** The user-authored id; matches the YAML `id:` field and React Flow's `id`. */
  id: string;
  variant: VariantId;
  /** Variant-specific data shape (see per-variant data.ts). */
  data: TData;
  /**
   * Typed base fields (depends_on, when, trigger_rule, idle_timeout, retry, hooks, etc.).
   * Carries all recognised non-variant-specific fields on the node envelope.
   */
  base: Record<string, unknown>;
  /**
   * Top-level DagNode keys our schema doesn't recognise. Spread back on export.
   * Empty object when the source was fully recognised.
   */
  unknown: Record<string, unknown>;
}

/** Reusable types passed to per-variant fromDag/toDag. */
export type BaseFields = Record<string, unknown>;
export type VariantSpecificFields = Record<string, unknown>;

/**
 * What every per-variant Renderer receives via React Flow's `data` prop.
 * `node` is a reference to the live store BuilderNode (never deep-cloned by deriveFlow).
 */
export interface DagNodeData<TData = unknown> extends Record<string, unknown> {
  storeId: string;
  node: BuilderNode<TData>;
}

/** Shape of a per-variant module's contribution to the registry (Phase 1 data slice). */
export interface VariantDefinition<TData> {
  id: VariantId;
  capabilities: VariantCapabilities;
  library: VariantLibraryMetadata;
  schema: z.ZodTypeAny;
  /** Build a fresh TData for "Add node" actions (Phase 2 wires this up). */
  createDefault: () => TData;
  /**
   * Pure mapping: raw partitioned fields → typed TData.
   * Receives base/variantSpecific from pickBaseFields and the upstream DagNode for diagnostics.
   */
  fromDag: (input: {
    base: BaseFields;
    variantSpecific: VariantSpecificFields;
    raw: DagNode;
  }) => TData;
  /** Inverse of fromDag — produces the variant-specific subset of a DagNode. */
  toDag: (data: TData) => Partial<DagNode>;
  /**
   * Phase-3 React component that React Flow mounts for `type === id`.
   * xyflow v12's `NodeProps` is generic over the WHOLE Node type (not just data),
   * so we wrap with `RFNode<DagNodeData<TData>, VariantId>`.
   */
  Renderer: ComponentType<NodeProps<RFNode<DagNodeData<TData>, VariantId>>>;
  // Phase 4 adds: Inspector.
}
