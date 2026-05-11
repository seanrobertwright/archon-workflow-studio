export interface ToolbarProps {
  workflowName: string;
  onResetLayout: () => void;
  /** When provided, renders a Save button in the toolbar. */
  onSave?: () => void;
  /** When true, the Save button is disabled (there are validation errors). */
  hasErrors?: boolean;
  /** Up to 3 error messages shown in the Save button's title tooltip. */
  topErrors?: readonly string[];
}

export function Toolbar({
  workflowName,
  onResetLayout,
  onSave,
  hasErrors,
  topErrors = [],
}: ToolbarProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 16px',
        background: 'var(--studio-surface)',
        borderBottom: '1px solid var(--studio-muted)',
      }}
    >
      <strong style={{ flex: 1 }}>{workflowName}</strong>
      <button
        type="button"
        onClick={onResetLayout}
        style={{
          background: 'transparent',
          color: 'var(--studio-fg)',
          border: '1px solid var(--studio-muted)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 8px',
          cursor: 'pointer',
        }}
      >
        Reset layout
      </button>
      {onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={!!hasErrors}
          title={hasErrors ? topErrors.slice(0, 3).join('\n') : undefined}
          style={{
            background: 'var(--studio-accent, #7c3aed)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 12px',
            cursor: hasErrors ? 'not-allowed' : 'pointer',
            opacity: hasErrors ? 0.6 : 1,
          }}
        >
          Save
        </button>
      ) : null}
    </header>
  );
}
