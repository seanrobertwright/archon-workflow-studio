import { create } from 'zustand';
import type { BuilderNode } from '../nodes/shared/types';
import { defaultRegistry } from '../nodes/default-registry';
import type { VariantId } from '../nodes/registry';
import { makeUniqueId } from '../nodes/shared/makeUniqueId';
import { pickBaseFields } from '../nodes/shared/pickBaseFields';
import { mergePatch } from './mergePatch';
import { serializeYaml } from '../exporter/serializeYaml';

/**
 * Base fields whose semantics are AI-inference-specific (provider routing,
 * sampling knobs, tool gating, structured output). When `convertVariant`
 * targets a variant with `honorsAiFields: false`, these get stripped from
 * `n.base` and stashed in `data._unknown._converted_from` so a future
 * convert-back can restore them.
 *
 * Deliberately NARROWER than "every base field": `mcp`, `skills`, `agents`,
 * and `context` are runtime-relevant on bash / script / cancel / approval
 * too (a bash node may declare which mcp servers it accesses), so they're
 * kept across conversion. `depends_on` / `when` / `retry` / `hooks` /
 * `sandbox` / `idle_timeout` / `trigger_rule` are flow-control and always
 * kept regardless.
 */
const AI_BASE_KEYS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'allowed_tools',
  'denied_tools',
  'output_format',
  'effort',
  'thinking',
  'maxBudgetUsd',
  'systemPrompt',
  'fallbackModel',
  'betas',
]);

export interface WorkflowMeta {
  name: string;
  description: string;
  base: Record<string, unknown>;
  unknown: Record<string, unknown>;
}

export interface LoadWorkflowInput {
  meta: WorkflowMeta;
  nodes: BuilderNode[];
}

/**
 * Lightweight path descriptor for the focused validation issue.
 * Intentionally NOT imported from `validation/types` to avoid a circular
 * dependency: builder-store → validation/types → (nothing) would be fine,
 * but having the UI layer depend on validation internals through the store
 * creates an undesirable coupling. This local type is structurally identical
 * to `IssuePath` in validation/types (drift 6.5 — local alias).
 */
export interface IssuePath {
  nodeId?: string;
  field?: string;
  atomIndex?: number;
}

export interface BuilderState {
  workflow: WorkflowMeta | null;
  nodes: BuilderNode[];
  /** Currently-inspected node id. Driven by Canvas selection (wired in Task 60). */
  selectedNodeId: string | null;
  /** The validation issue path currently focused in the panel. Drives inspector tab routing. */
  focusedIssue: IssuePath | null;
  /** Id of the node currently hovered on the canvas. Null when no node is hovered. */
  hoveredNodeId: string | null;
  /** Whether the YAML preview drawer is open. */
  isYamlPreviewOpen: boolean;
  /** Serialized YAML captured at last loadWorkflow call. Used to detect unsaved changes. */
  baselineYaml: string | null;

  loadWorkflow: (input: LoadWorkflowInput) => void;
  clearWorkflow: () => void;
  setSelectedNodeId: (id: string | null) => void;
  setFocusedIssue: (path: IssuePath | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setYamlPreviewOpen: (open: boolean) => void;

  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (description: string) => void;

  addNode: (node: BuilderNode) => void;
  /**
   * Mint a new node from a variant's `createDefault()` and append it to the store.
   * Returns the id chosen via `makeUniqueId(hint, existingIds)` so callers can
   * persist a position for the new node.
   *
   * `dataPatch` is **shallow-merged** onto `createDefault()` — for nested-data
   * variants (loop, approval), patching `data.loop` replaces the whole loop
   * config object. Phase-3 callers (Commands section) only patch flat fields.
   */
  addNodeFromVariant: (
    variantId: VariantId,
    options?: { idHintOverride?: string; dataPatch?: Record<string, unknown> },
  ) => string;
  updateNode: (id: string, patch: Partial<BuilderNode>) => void;
  /**
   * Patch a node's editable fields by routing each key to its correct storage
   * bucket (data / base / unknown) via pickBaseFields, deep-merging via
   * mergePatch. Inspector tabs call this with any field regardless of origin.
   * `null` in the patch deletes the key from its bucket.
   */
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /**
   * Migrate a node to a different variant. Variant-specific fields the target
   * cannot represent are parked in `data._unknown._converted_from`. When the
   * target variant has `honorsAiFields: false` (bash, script, cancel, approval),
   * AI base fields are also parked. Flow-control base fields (depends_on,
   * when, retry, hooks, etc.) are kept regardless.
   *
   * No-op if `id`'s current variant already equals `newVariantId`. Throws on
   * unknown id or unknown variant id.
   */
  convertVariant: (id: string, newVariantId: VariantId) => void;
  deleteNodes: (ids: string[]) => void;

  connect: (source: string, target: string) => void;
  disconnect: (source: string, target: string) => void;
  renameNode: (oldId: string, newId: string) => void;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  workflow: null,
  nodes: [],
  selectedNodeId: null,
  focusedIssue: null,
  hoveredNodeId: null,
  isYamlPreviewOpen: false,
  baselineYaml: null,

  loadWorkflow: (input) => {
    const { yaml: baseline } = serializeYaml(input);
    set({ workflow: input.meta, nodes: input.nodes, baselineYaml: baseline });
  },
  clearWorkflow: () =>
    set({
      workflow: null,
      nodes: [],
      selectedNodeId: null,
      focusedIssue: null,
      baselineYaml: null,
    }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setYamlPreviewOpen: (open) => set({ isYamlPreviewOpen: open }),
  // Reference-equality guard: prevents spurious notifications when the panel
  // re-clicks the same row (the same path reference) — Zustand would otherwise
  // notify on every set() even with an identical payload.
  setFocusedIssue: (path) => set((s) => (s.focusedIssue === path ? s : { focusedIssue: path })),

  setWorkflowName: (name) => set((s) => (s.workflow ? { workflow: { ...s.workflow, name } } : s)),
  setWorkflowDescription: (description) =>
    set((s) => (s.workflow ? { workflow: { ...s.workflow, description } } : s)),

  addNode: (node) =>
    set((s) => {
      if (s.nodes.some((n) => n.id === node.id)) {
        throw new Error(`addNode: id collision '${node.id}'`);
      }
      return { nodes: [...s.nodes, node] };
    }),

  addNodeFromVariant: (variantId, options) => {
    const def = defaultRegistry[variantId];
    const hint = options?.idHintOverride ?? def.library.defaultIdHint;
    const existingIds = new Set(get().nodes.map((n) => n.id));
    const id = makeUniqueId(hint, existingIds);
    const data = {
      ...(def.createDefault() as Record<string, unknown>),
      ...(options?.dataPatch ?? {}),
    };
    set((s) => ({
      nodes: [...s.nodes, { id, variant: variantId, data, base: {}, unknown: {} }],
    }));
    return id;
  },

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),

  updateNodeData: (id, patch) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) throw new Error(`updateNodeData: '${id}' not found`);
    const partition = pickBaseFields(patch, node.variant);
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: mergePatch(n.data as Record<string, unknown>, partition.variantSpecific),
              base: mergePatch(n.base, partition.base),
              unknown: mergePatch(n.unknown, partition.unknown),
            }
          : n,
      ),
    }));
  },

  convertVariant: (id, newVariantId) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) throw new Error(`convertVariant: '${id}' not found`);
    const target = defaultRegistry[newVariantId];
    if (!target) throw new Error(`convertVariant: unknown variant '${newVariantId}'`);
    if (node.variant === newVariantId) return;

    // Re-classify the source's variant-specific data under the TARGET variant's
    // lens. pickBaseFields buckets every recognised key into variantSpecific /
    // base / unknown; anything the target can't accept ends up in `unknown`.
    const currentDagShape = (node.data as Record<string, unknown>) ?? {};
    const reclassified = pickBaseFields(currentDagShape, newVariantId);

    // The variant-data forward-compat bag (`data._unknown`) is preserved
    // verbatim below — strip it from `reclassified.unknown` so it is NOT
    // duplicated into `n.unknown` on the merge at the bottom of this action.
    delete reclassified.unknown._unknown;

    // Anything in `reclassified.unknown` at this point is a key that was
    // variant-specific to the source but isn't recognised by the target —
    // park it under `_converted_from` so a convert-back can restore it.
    const parkedFromData: Record<string, unknown> = { ...reclassified.unknown };
    reclassified.unknown = {};

    // Capability-aware base-field parking: when target ignores AI fields,
    // strip the AI-inference-specific subset (see AI_BASE_KEYS) and park.
    // Flow-control base fields (depends_on, when, retry, hooks, sandbox,
    // trigger_rule, idle_timeout) and runtime-relevant lists (mcp, skills,
    // agents, context) are kept regardless.
    const newBase: Record<string, unknown> = { ...node.base };
    const parkedFromBase: Record<string, unknown> = {};
    if (!target.capabilities.honorsAiFields) {
      for (const k of Object.keys(newBase)) {
        if (AI_BASE_KEYS.has(k)) {
          parkedFromBase[k] = newBase[k];
          delete newBase[k];
        }
      }
    }

    const previousDataUnknown = (currentDagShape._unknown as Record<string, unknown>) ?? {};
    const newData: Record<string, unknown> = {
      ...(target.createDefault() as Record<string, unknown>),
      ...reclassified.variantSpecific,
      _unknown: {
        ...previousDataUnknown,
        _converted_from: {
          variant: node.variant,
          ...parkedFromData,
          ...parkedFromBase,
        },
      },
    };

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, variant: newVariantId, data: newData, base: newBase } : n,
      ),
    }));
  },

  deleteNodes: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      nodes: s.nodes
        .filter((n) => !idSet.has(n.id))
        .map((n) => {
          const dep = (n.base.depends_on as string[] | undefined) ?? undefined;
          if (!dep) return n;
          const filtered = dep.filter((d) => !idSet.has(d));
          const newBase = { ...n.base };
          if (filtered.length === 0) delete newBase.depends_on;
          else newBase.depends_on = filtered;
          return { ...n, base: newBase };
        }),
    }));
  },

  connect: (source, target) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== target) return n;
        const dep = (n.base.depends_on as string[] | undefined) ?? [];
        if (dep.includes(source)) return n;
        return { ...n, base: { ...n.base, depends_on: [...dep, source] } };
      }),
    })),

  disconnect: (source, target) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== target) return n;
        const dep = (n.base.depends_on as string[] | undefined) ?? [];
        const filtered = dep.filter((d) => d !== source);
        const newBase = { ...n.base };
        if (filtered.length === 0) delete newBase.depends_on;
        else newBase.depends_on = filtered;
        return { ...n, base: newBase };
      }),
    })),

  renameNode: (oldId, newId) => {
    if (oldId === newId) return;
    const state = get();
    if (state.nodes.some((n) => n.id === newId)) {
      throw new Error(`renameNode: collision — '${newId}' already exists`);
    }
    if (!state.nodes.some((n) => n.id === oldId)) {
      throw new Error(`renameNode: '${oldId}' not found`);
    }

    // Cascading rename — see spec §5.2 / §7.4.
    const renameRefs = (n: BuilderNode): BuilderNode => {
      const next: BuilderNode = { ...n, base: { ...n.base } };
      // 1. id itself
      if (next.id === oldId) next.id = newId;
      // 2. depends_on
      const dep = (next.base.depends_on as string[] | undefined) ?? undefined;
      if (dep) next.base.depends_on = dep.map((d) => (d === oldId ? newId : d));
      // 3. when: strings ($oldId.* → $newId.*)
      const w = next.base.when as string | undefined;
      if (typeof w === 'string') {
        next.base.when = w.replace(new RegExp(`\\$${escapeRegExp(oldId)}\\b`, 'g'), `$${newId}`);
      }
      // 4. body-text refs ($oldId.output… in prompt/bash/script/loop.prompt/
      //    approval.message). Each variant declares its own rewriter via the
      //    optional `renameBodyRefs` slot; variants without body text omit it.
      const variantDef = defaultRegistry[next.variant];
      if (variantDef.renameBodyRefs) {
        next.data = variantDef.renameBodyRefs(next.data as never, oldId, newId);
      }
      return next;
    };
    set({ nodes: state.nodes.map(renameRefs) });
  },
}));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
