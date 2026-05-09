export interface ToolbarProps {
  workflowName: string;
  onResetLayout: () => void;
}

export function Toolbar({ workflowName, onResetLayout }: ToolbarProps) {
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
    </header>
  );
}
