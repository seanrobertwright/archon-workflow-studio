import { create } from 'zustand';
import type { BuilderNode } from '../nodes/shared/types';
import { defaultRegistry } from '../nodes/default-registry';
import type { VariantId } from '../nodes/registry';
import { makeUniqueId } from '../nodes/shared/makeUniqueId';

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
  addNodeFromVariant: (
    variantId: VariantId,
    options?: { idHintOverride?: string; dataPatch?: Record<string, unknown> },
  ) => string;
  updateNode: (id: string, patch: Partial<BuilderNode>) => void;
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
      // Phase 4 will extend with: $nodeId.output body refs in prompt/bash/script/
      // loop.prompt/approval.message via per-variant `renameBodyRefs(data, oldId, newId)`.
      // No Phase 1 UI exposes renameNode, so the gap is dead-code-only today.
      return next;
    };
    set({ nodes: state.nodes.map(renameRefs) });
  },
}));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
