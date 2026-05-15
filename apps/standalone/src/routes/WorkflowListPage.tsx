import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkflowApi } from '@archon-studio/core';
import type { WorkflowListItem } from '@archon-studio/core';
import { useConnectionStore } from '../connection-store';

type Source = 'project' | 'global' | 'bundled';

const SOURCE_LABELS: Record<Source, string> = {
  project: 'Project',
  global: 'Global',
  bundled: 'Bundled defaults',
};

export function WorkflowListPage() {
  const navigate = useNavigate();
  const client = useWorkflowApi();
  const qc = useQueryClient();
  const settings = useConnectionStore((s) => s.settings)!;

  const { data, isLoading, error } = useQuery({
    queryKey: ['workflows', settings.archonUrl, settings.cwd],
    queryFn: () => client.listWorkflows(settings.cwd),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ name }: { name: string }) => client.deleteWorkflow(name, settings.cwd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows', settings.archonUrl, settings.cwd] });
    },
  });

  const handleNew = useCallback(() => {
    const name = window.prompt('New workflow name (e.g. my-workflow):');
    if (!name?.trim()) return;
    navigate(`/builder/${encodeURIComponent(name.trim())}`, {
      state: { isNew: true },
    });
  }, [navigate]);

  const handleFork = useCallback(
    (item: WorkflowListItem) => {
      const original = item.workflow.name;
      const newName = window.prompt('Fork as:', `${original}-copy`);
      if (!newName?.trim()) return;
      navigate(`/builder/${encodeURIComponent(newName.trim())}`, {
        state: { isNew: true, forkFrom: original },
      });
    },
    [navigate],
  );

  const handleDelete = useCallback(
    (item: WorkflowListItem) => {
      if (!window.confirm(`Delete "${item.workflow.name}"? This cannot be undone.`)) return;
      deleteMutation.mutate({ name: item.workflow.name });
    },
    [deleteMutation],
  );

  const handleOpen = useCallback(
    (item: WorkflowListItem) => {
      navigate(`/builder/${encodeURIComponent(item.workflow.name)}`, {
        state: { source: item.source },
      });
    },
    [navigate],
  );

  const grouped = (data ?? []).reduce<Record<Source, WorkflowListItem[]>>(
    (acc, item) => {
      const src = item.source as Source;
      acc[src] = [...(acc[src] ?? []), item];
      return acc;
    },
    { project: [], global: [], bundled: [] },
  );

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        background: 'var(--studio-bg)',
        color: 'var(--studio-fg)',
        padding: '32px 48px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Workflows</h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--studio-fg-muted)',
              opacity: 0.7,
            }}
          >
            Standalone mode — workflows stored in browser
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleNew}
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'var(--studio-accent)',
              color: '#fff',
              border: 'none',
              fontSize: 14,
            }}
          >
            + New workflow
          </button>
        </div>
      </div>

      {/* Loading / error states */}
      {isLoading && <p style={{ color: 'var(--studio-fg-muted)' }}>Loading workflows…</p>}
      {error && (
        <p style={{ color: 'var(--studio-error-fg, #ff6b6b)' }}>
          Failed to load workflows. {(error as Error).message}
        </p>
      )}

      {/* Grouped sections */}
      {(['project', 'global', 'bundled'] as Source[]).map((src) => {
        const items = grouped[src];
        if (items.length === 0) return null;
        return (
          <section key={src} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--studio-fg-muted)',
                opacity: 0.6,
                margin: '0 0 12px',
              }}
            >
              {SOURCE_LABELS[src]}
            </h2>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {items.map((item) => (
                <li
                  key={item.workflow.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 16px',
                    background: 'var(--studio-surface)',
                    borderRadius: 6,
                    border: '1px solid var(--studio-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleOpen(item)}
                >
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{item.workflow.name}</span>
                    {item.workflow.description && (
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: 12,
                          color: 'var(--studio-fg-muted)',
                          opacity: 0.7,
                          maxWidth: 480,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.workflow.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    {src === 'bundled' ? (
                      <button
                        onClick={() => handleFork(item)}
                        style={{
                          padding: '4px 10px',
                          fontSize: 12,
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: 'transparent',
                          border: '1px solid var(--studio-border)',
                          color: 'var(--studio-fg)',
                        }}
                      >
                        Fork
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleteMutation.isPending}
                        style={{
                          padding: '4px 10px',
                          fontSize: 12,
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: 'transparent',
                          border: '1px solid var(--studio-border)',
                          color: 'var(--studio-error-fg, #ff6b6b)',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
