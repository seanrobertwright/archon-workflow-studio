export type Severity = 'error' | 'warning' | 'info';
export type RuleSource = 'client-instant' | 'client-debounced' | 'server';

export interface IssuePath {
  nodeId?: string;
  field?: string;
  atomIndex?: number;
}

export interface Issue {
  /** Stable hash(rule + path + message). Lets the panel preserve scroll/selection. */
  id: string;
  rule: string;
  severity: Severity;
  source: RuleSource;
  message: string;
  path: IssuePath;
}

/** Cheap, deterministic hash (djb2). No cryptographic strength required. */
export function issueId(rule: string, path: IssuePath, message: string): string {
  const key = `${rule}|${path.nodeId ?? ''}|${path.field ?? ''}|${path.atomIndex ?? ''}|${message}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `i_${(h >>> 0).toString(36)}`;
}
