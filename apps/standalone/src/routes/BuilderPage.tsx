import { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import {
  WorkflowBuilder,
  fromWorkflowDefinition,
  toWorkflowDefinition,
  useBuilderStore,
  useWorkflowApi,
} from '@archon-studio/core';
import type { LoadWorkflowInput, WorkflowDefinition } from '@archon-studio/core';
import { ArchonHttpError } from '@archon-studio/api-archon';
import { useConnectionStore } from '../connection-store';
import { enqueueSave, dequeueSave } from '../save-queue';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

function createBlankWorkflow(name: string): LoadWorkflowInput {
  return {
    meta: { name, description: '', base: {}, unknown: {} },
    nodes: [],
  };
}

export function BuilderPage() {
  const { name } = useParams<{ name: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useWorkflowApi();
  const settings = useConnectionStore((s) => s.settings)!;

  const routeState = (location.state ?? {}) as {
    isNew?: boolean;
    forkFrom?: string;
    source?: 'project' | 'global' | 'bundled';
  };

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const source = routeState.source ?? 'project';

  // ── Load workflow on mount ──
  useEffect(() => {
    if (!name) return;
    let cancelled = false;

    (async () => {
      try {
        let input: LoadWorkflowInput;

        if (routeState.isNew && routeState.forkFrom) {
          // Fork: load original, rename
          const def = await client.getWorkflow(routeState.forkFrom, settings.cwd);
          const parsed = fromWorkflowDefinition(def as Record<string, unknown>);
          input = { ...parsed, meta: { ...parsed.meta, name } };
        } else if (routeState.isNew) {
          // New blank workflow
          input = createBlankWorkflow(name);
        } else {
          // Open existing workflow
          const def = await client.getWorkflow(name, settings.cwd);
          input = fromWorkflowDefinition(def as Record<string, unknown>);
        }

        if (!cancelled) {
          useBuilderStore.getState().loadWorkflow(input);
          setLoaded(true);
          // Attempt to flush any pending offline save for this workflow
          const pending = dequeueSave(name, settings.cwd, settings.archonUrl);
          if (pending) {
            await client
              .saveWorkflow(name, settings.cwd, pending.definition as WorkflowDefinition)
              .catch(() => {
                // Still offline — re-enqueue
                enqueueSave({
                  workflowName: name,
                  cwd: settings.cwd,
                  archonUrl: settings.archonUrl,
                  definition: pending.definition,
                });
              });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ArchonHttpError
              ? `Could not load workflow (HTTP ${err.status})`
              : `Could not load workflow: ${(err as Error).message}`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      useBuilderStore.getState().clearWorkflow();
    };
  }, [name, settings.cwd, settings.archonUrl, location.key]);

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    if (!name || !loaded) return;
    setSaveStatus('saving');

    const storeState = useBuilderStore.getState();
    const definition = toWorkflowDefinition({
      meta: storeState.workflow!,
      nodes: storeState.nodes,
    }) as WorkflowDefinition;

    try {
      await client.saveWorkflow(name, settings.cwd, definition);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      const isNetworkError = !(err instanceof ArchonHttpError);
      if (isNetworkError) {
        enqueueSave({
          workflowName: name,
          cwd: settings.cwd,
          archonUrl: settings.archonUrl,
          definition,
        });
        setSaveStatus('offline');
      } else {
        setSaveStatus('error');
      }
    }
  }, [name, loaded, client, settings]);

  // ── Render ──
  if (loadError) {
    return (
      <div style={{ padding: 32, color: 'var(--studio-fg)' }}>
        <p style={{ color: 'var(--studio-error-fg, #ff6b6b)' }}>{loadError}</p>
        <button onClick={() => navigate('/workflows')}>← Back to workflows</button>
      </div>
    );
  }

  if (!loaded || !name) {
    return <div style={{ padding: 32, color: 'var(--studio-fg-muted)' }}>Loading {name}…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Bundled-default shadow banner */}
      {source === 'bundled' && (
        <div
          style={{
            padding: '8px 16px',
            background: 'var(--studio-warning-bg, #2a2200)',
            color: 'var(--studio-warning-fg, #e6b800)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span>This is a read-only bundled default.</span>
          <button
            onClick={() => {
              const newName = window.prompt('Fork as:', `${name}-copy`);
              if (!newName?.trim()) return;
              navigate(`/builder/${encodeURIComponent(newName.trim())}`, {
                state: { isNew: true, forkFrom: name },
              });
            }}
            style={{
              padding: '2px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid currentColor',
              fontSize: 12,
              color: 'inherit',
            }}
          >
            Fork it
          </button>
          <button
            onClick={() => navigate('/workflows')}
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              fontSize: 12,
              color: 'inherit',
              opacity: 0.6,
            }}
          >
            ← Back
          </button>
        </div>
      )}

      {/* Offline save indicator */}
      {saveStatus === 'offline' && (
        <div
          style={{
            padding: '6px 16px',
            background: 'var(--studio-warning-bg, #2a2200)',
            color: 'var(--studio-warning-fg, #e6b800)',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          Saved offline — will sync when Archon is reachable.
        </div>
      )}

      {/* Save error indicator */}
      {saveStatus === 'error' && (
        <div
          style={{
            padding: '6px 16px',
            background: 'var(--studio-error-bg, #3a1a1a)',
            color: 'var(--studio-error-fg, #ff6b6b)',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          Save failed — check the Archon connection and try again.
        </div>
      )}

      {/* The editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorkflowBuilder
          client={client}
          archonUrl={settings.archonUrl}
          cwd={settings.cwd}
          workflowName={name}
          onSave={
            source !== 'bundled'
              ? () => {
                  void handleSave();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
