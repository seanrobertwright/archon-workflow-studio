const STORAGE_KEY = 'archon-studio:save-queue';

export interface PendingSave {
  workflowName: string;
  cwd: string;
  archonUrl: string;
  /** `toWorkflowDefinition(...)` output — plain JSON object. */
  definition: Record<string, unknown>;
  /** Unix ms — most recent wins for same workflow. */
  timestamp: number;
}

function load(): PendingSave[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingSave[]) : [];
  } catch {
    return [];
  }
}

function persist(queue: PendingSave[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // quota exceeded — non-fatal, pending save is lost
  }
}

/**
 * Add or replace the pending save for this (workflowName, cwd, archonUrl) combination.
 * Keeps only the latest version — earlier offline drafts are superseded.
 */
export function enqueueSave(item: Omit<PendingSave, 'timestamp'>): void {
  const queue = load().filter(
    (q) =>
      !(
        q.workflowName === item.workflowName &&
        q.cwd === item.cwd &&
        q.archonUrl === item.archonUrl
      ),
  );
  queue.push({ ...item, timestamp: Date.now() });
  persist(queue);
}

/**
 * Return and remove the pending save for (workflowName, cwd, archonUrl), or null if none.
 */
export function dequeueSave(
  workflowName: string,
  cwd: string,
  archonUrl: string,
): PendingSave | null {
  const queue = load();
  const idx = queue.findIndex(
    (q) => q.workflowName === workflowName && q.cwd === cwd && q.archonUrl === archonUrl,
  );
  if (idx === -1) return null;
  const [item] = queue.splice(idx, 1);
  persist(queue);
  return item ?? null;
}

/** All pending saves — used by BuilderPage to show a warning banner. */
export function listPendingSaves(): PendingSave[] {
  return load();
}
