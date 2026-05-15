import { useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { useWorkflowApi } from '../../api/ApiClientProvider';
import { useBuilderStore } from '../../store/builder-store';
import { useUserLibraryStore } from '../../store/user-library-store';
import { LIBRARY_DRAG_MIME, encodeLibraryDrag } from './dragPayload';

export interface CommandsSectionProps {
  /** Working directory passed in from WorkflowBuilder via NodeLibrary. */
  cwd: string;
}

type CmdRow = {
  /** display name */
  name: string;
  /** source label (bundled / project / global / user) */
  source: 'project' | 'global' | 'bundled' | 'user';
  /** for user rows only — for the × delete affordance */
  userId?: string;
  /** for user rows only — for the subtitle */
  description?: string;
};

// Slug-safe id hint: Archon command names follow a slug convention by file
// path (.archon/commands/<name>.md), but we don't enforce it here. Strip
// anything that would break BuilderNode.id-as-string-key invariants used by
// depends_on / when refs / renameSubgraph. Keeps the literal name in
// data.command for execution.
const slugify = (name: string): string => name.replace(/[^A-Za-z0-9_-]+/g, '-');

export function CommandsSection({ cwd }: CommandsSectionProps) {
  const client = useWorkflowApi();
  const addNodeFromVariant = useBuilderStore((s) => s.addNodeFromVariant);
  const userCommands = useUserLibraryStore((s) => s.userCommands);
  const addUserCommand = useUserLibraryStore((s) => s.addUserCommand);
  const removeUserCommand = useUserLibraryStore((s) => s.removeUserCommand);

  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['commands', cwd],
    queryFn: () => client.listCommands(cwd),
  });

  const rows: CmdRow[] = [
    ...userCommands.map((c) => ({
      name: c.name,
      source: 'user' as const,
      userId: c.id,
      description: c.description,
    })),
    ...(data ?? []).map((c) => ({ name: c.name, source: c.source })),
  ];

  function submitAdd() {
    const name = draftName.trim();
    if (!name) return;
    addUserCommand({ name, description: draftDesc.trim() || undefined });
    setDraftName('');
    setDraftDesc('');
    setAdding(false);
  }

  return (
    <section style={{ padding: 12, borderBottom: '1px solid var(--studio-muted)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <h3 style={headingStyle}>Commands</h3>
        <button
          type="button"
          aria-label={adding ? 'Cancel add command' : 'Add command'}
          onClick={() => {
            setAdding((v) => !v);
            setDraftName('');
            setDraftDesc('');
          }}
          style={addBtnStyle}
        >
          {adding ? '×' : '+'}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}
        >
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Command name"
            aria-label="New command name"
            style={inputStyle}
          />
          <input
            type="text"
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            placeholder="Description (optional)"
            aria-label="New command description"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="submit" style={submitBtnStyle} disabled={!draftName.trim()}>
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraftName('');
                setDraftDesc('');
              }}
              style={cancelBtnStyle}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <div style={emptyStyle}>Loading…</div>}
      {isError && <div style={emptyStyle}>Couldn't load commands.</div>}
      {!isLoading && !isError && rows.length === 0 && (
        <div style={emptyStyle}>No commands. Click + to add one.</div>
      )}

      {rows.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {rows.map((cmd) => (
            <li key={`${cmd.source}:${cmd.userId ?? cmd.name}`} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label={`Add command running ${cmd.name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    LIBRARY_DRAG_MIME,
                    encodeLibraryDrag({
                      kind: 'variant',
                      variantId: 'command',
                      idHintOverride: `run-${slugify(cmd.name)}`,
                      prefill: { command: cmd.name },
                    }),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() =>
                  addNodeFromVariant('command', {
                    idHintOverride: `run-${slugify(cmd.name)}`,
                    dataPatch: { command: cmd.name },
                  })
                }
                style={rowStyle}
              >
                <span
                  style={{
                    width: 4,
                    height: 16,
                    borderRadius: 2,
                    background: 'var(--node-command)',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{cmd.name}</span>
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--studio-muted)',
                    }}
                  >
                    {cmd.description ?? cmd.source}
                  </span>
                </span>
              </button>
              {cmd.userId && (
                <button
                  type="button"
                  aria-label={`Delete user command ${cmd.name}`}
                  onClick={() => removeUserCommand(cmd.userId!)}
                  style={deleteBtnStyle}
                  title="Delete"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const headingStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--studio-muted)',
  margin: 0,
};
const emptyStyle: CSSProperties = { fontSize: 12, color: 'var(--studio-muted)' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 8px',
  textAlign: 'left',
  background: 'transparent',
  color: 'var(--studio-fg)',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-sm)',
  cursor: 'grab',
};
const addBtnStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--studio-fg)',
  border: '1px solid var(--studio-muted)',
  borderRadius: 'var(--radius-sm)',
  width: 22,
  height: 22,
  padding: 0,
  cursor: 'pointer',
  lineHeight: 1,
};
const inputStyle: CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 12,
  background: 'var(--studio-surface)',
  color: 'var(--studio-fg)',
  border: '1px solid var(--studio-muted)',
  borderRadius: 'var(--radius-sm)',
  boxSizing: 'border-box',
};
const submitBtnStyle: CSSProperties = {
  flex: 1,
  background: 'var(--studio-accent, #7c3aed)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
};
const cancelBtnStyle: CSSProperties = {
  flex: 1,
  background: 'transparent',
  color: 'var(--studio-fg)',
  border: '1px solid var(--studio-muted)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
};
const deleteBtnStyle: CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  background: 'transparent',
  color: 'var(--studio-muted)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  width: 18,
  height: 18,
  padding: 0,
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
};
