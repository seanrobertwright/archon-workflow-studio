import type { DagNode, WorkflowDefinition } from '../schemas';
import type { WorkflowApiClient } from '../api/WorkflowApiClient';
import { runStructuralRules } from './rules/structural';
import { runGraphRules } from './rules/graph';
import { runContentRules } from './rules/content';
import { type Issue, issueId } from './types';

export interface EngineSnapshot {
  issues: Issue[];
  isValidating: boolean;
  lastRunAt: number;
}

export interface EngineInput {
  nodes: readonly DagNode[];
  /** Full WorkflowDefinition required to run the server tier. If absent, server tier is skipped. */
  definition?: WorkflowDefinition;
}

export interface EngineOptions {
  debounceMs?: number;
  client?: Pick<WorkflowApiClient, 'validateWorkflow'>;
  /** Test hook: fires every time the debounced tier completes. */
  onDebouncedRun?: () => void;
}

type Listener = () => void;

/**
 * Three-tier engine. Tiers own disjoint slices of the issue list so a slow
 * server response cannot clobber a fresh client run.
 *
 * Tier ordering:
 *   1. Instant   — structural rules; runs synchronously on every update().
 *   2. Debounced — graph + content rules; coalesces bursts via setTimeout.
 *   3. Server    — validateWorkflow RPC; only runs when no client errors exist.
 *
 * Stale-response defence:
 *   - AbortController: signals the outer call that a new server run has started
 *     (the real WorkflowApiClient.validateWorkflow does NOT accept AbortSignal —
 *     see drift 6.4.1 — so abort() only closes local state).
 *   - Monotonic sequence number: `mySeq !== this.seq` drops any response that
 *     resolves after a newer run has started. This is the effective stale guard.
 */
export class ValidationEngine {
  private debounceMs: number;
  private client?: Pick<WorkflowApiClient, 'validateWorkflow'>;
  private onDebouncedRun?: () => void;

  private input: EngineInput | null = null;
  private instantIssues: Issue[] = [];
  private debouncedIssues: Issue[] = [];
  private serverIssues: Issue[] = [];
  private isValidating = false;
  private lastRunAt = 0;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private inflightAbort: AbortController | null = null;

  private listeners = new Set<Listener>();

  constructor(opts: EngineOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 300;
    this.client = opts.client;
    this.onDebouncedRun = opts.onDebouncedRun;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): EngineSnapshot {
    return {
      issues: [...this.instantIssues, ...this.debouncedIssues, ...this.serverIssues],
      isValidating: this.isValidating,
      lastRunAt: this.lastRunAt,
    };
  }

  update(input: EngineInput): void {
    this.input = input;
    this.instantIssues = runStructuralRules(input.nodes);
    this.scheduleDebounced();
    this.notify();
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.inflightAbort?.abort();
    this.listeners.clear();
  }

  private scheduleDebounced(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.isValidating = true;
    this.debounceTimer = setTimeout(() => this.runDebounced(), this.debounceMs);
  }

  private runDebounced(): void {
    this.debounceTimer = null;
    if (!this.input) return;
    const { nodes } = this.input;
    this.debouncedIssues = [...runGraphRules(nodes), ...runContentRules(nodes)];
    this.onDebouncedRun?.();
    this.lastRunAt = Date.now();

    const hasClientErrors =
      this.instantIssues.some((i) => i.severity === 'error') ||
      this.debouncedIssues.some((i) => i.severity === 'error');

    if (this.client && this.input.definition && !hasClientErrors) {
      void this.runServer();
    } else {
      // Harden against stale server responses: abort in-flight call and bump
      // seq so any pending runServer resolves with mySeq !== this.seq and
      // does not overwrite the freshly-cleared serverIssues (drift 6.4.2).
      if (hasClientErrors) {
        this.inflightAbort?.abort();
        this.seq++;
        this.serverIssues = [];
      }
      this.isValidating = false;
      this.notify();
    }
  }

  private async runServer(): Promise<void> {
    if (!this.client || !this.input?.definition) return;
    this.inflightAbort?.abort();
    const ac = new AbortController();
    this.inflightAbort = ac;
    const mySeq = ++this.seq;
    try {
      const res = await this.client.validateWorkflow(this.input.definition);
      if (mySeq !== this.seq) return; // superseded by a newer run
      this.serverIssues = (res.errors ?? []).map((msg) => ({
        id: issueId('server.unknown', {}, msg),
        rule: 'server.unknown',
        severity: 'error' as const,
        source: 'server' as const,
        message: msg,
        path: {},
      }));
      this.lastRunAt = Date.now();
    } catch (e) {
      if (mySeq !== this.seq) return;
      const message = `Server validation failed: ${e instanceof Error ? e.message : String(e)}`;
      this.serverIssues = [
        {
          id: issueId('server.error', {}, message),
          rule: 'server.error',
          severity: 'error' as const,
          source: 'server' as const,
          message,
          path: {},
        },
      ];
    } finally {
      if (mySeq === this.seq) {
        this.isValidating = false;
        this.notify();
      }
    }
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
