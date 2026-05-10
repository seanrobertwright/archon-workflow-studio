import { create } from 'zustand';
import type { BuilderNode } from '../nodes/shared/types';
import { defaultRegistry } from '../nodes/default-registry';
import type { VariantId } from '../nodes/registry';
import { makeUniqueId } from '../nodes/shared/makeUniqueId';
import { pickBaseFields } from '../nodes/shared/pickBaseFields';
import { mergePatch } from './mergePatch';

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

export interface BuilderState {
  workflow: WorkflowMeta | null;
  nodes: BuilderNode[];

  loadWorkflow: (input: LoadWorkflowInput) => void;
  clearWorkflow: () => void;

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

  loadWorkflow: ({ meta, nodes }) => set({ workflow: meta, nodes }),
  clearWorkflow: () => set({ workflow: null, nodes: [] }),

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

    // Re-classify CURRENT variant-specific data under the TARGET variant's lens.
    // Anything the target variant cannot accept lands in `parkedFromData`.
    const currentDagShape = (node.data as Record<string, unknown>) ?? {};
    const reclassified = pickBaseFields(currentDagShape, newVariantId);
    const parkedFromData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(currentDagShape)) {
      if (k === '_unknown') continue;
      if (
        !(k in reclassified.variantSpecific) &&
        !(k in reclassified.base) &&
        !(k in reclassified.unknown)
      ) {
        parkedFromData[k] = v;
      }
    }
    // pickBaseFields routes "stranger" keys into `unknown`. For convertVariant,
    // anything that was variant-specific to the source but not to the target
    // should be PARKED, not silently demoted to unknown. Move them.
    const sourceVariant = defaultRegistry[node.variant];
    const sourceVarSpecificKeys = new Set(
      Object.keys((sourceVariant.toDag(node.data as never) as Record<string, unknown>) ?? {}),
    );
    for (const k of Object.keys(reclassified.unknown)) {
      if (sourceVarSpecificKeys.has(k)) {
        parkedFromData[k] = reclassified.unknown[k];
        delete reclassified.unknown[k];
      }
    }

    // Capability-aware base-field parking: when target ignores AI fields, strip
    // and park them. Flow-control base fields stay.
    const AI_BASE_KEYS = new Set([
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
      'agents',
      'mcp',
      'skills',
      'context',
    ]);
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

    const previousUnknown =
      ((node.data as Record<string, unknown>)?._unknown as Record<string, unknown>) ?? {};
    const newData: Record<string, unknown> = {
      ...(target.createDefault() as Record<string, unknown>),
      ...reclassified.variantSpecific,
      _unknown: {
        ...previousUnknown,
        _converted_from: {
          variant: node.variant,
          ...parkedFromData,
          ...parkedFromBase,
        },
      },
    };

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              variant: newVariantId,
              data: newData,
              base: newBase,
              unknown: mergePatch(n.unknown, reclassified.unknown),
            }
          : n,
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
