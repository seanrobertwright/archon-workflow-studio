import { useState, type CSSProperties, type ReactNode } from 'react';
import type { InspectorTabId } from '../../nodes/shared/types';

const LABELS: Record<InspectorTabId, string> = {
  general: 'General',
  execution: 'Execution',
  provider: 'Provider',
  tools: 'Tools',
  hooks: 'Hooks',
  'skills-mcp': 'Skills+MCP',
  advanced: 'Advanced',
};

interface Props {
  tabs: InspectorTabId[];
  initial?: InspectorTabId;
  /** Render-prop called with the active tab id; returns the panel content. */
  children: (active: InspectorTabId) => ReactNode;
}

/**
 * Capability-driven tab strip + panel for the Node Inspector. The active tab
 * is local state — when the active tab id is no longer present (e.g. variant
 * switch removes the AI tabs), it falls back to the first tab so the panel
 * never goes blank.
 */
export function InspectorTabs({ tabs, initial, children }: Props) {
  const [active, setActive] = useState<InspectorTabId>(initial ?? tabs[0]);
  const current = tabs.includes(active) ? active : tabs[0];
  return (
    <div style={containerStyle}>
      <div role="tablist" aria-label="Inspector tabs" style={tabListStyle}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={current === t}
            onClick={() => setActive(t)}
            style={current === t ? activeTabStyle : tabStyle}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" data-testid={`tab-panel-${current}`} style={panelStyle}>
        {children(current)}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
};
const tabListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
  borderBottom: '1px solid var(--studio-border)',
  padding: '0 8px',
};
const tabStyle: CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 500,
  background: 'transparent',
  color: 'var(--studio-muted)',
  borderTop: 'none',
  borderRight: 'none',
  borderLeft: 'none',
  borderBottomWidth: 2,
  borderBottomStyle: 'solid',
  borderBottomColor: 'transparent',
  cursor: 'pointer',
};
const activeTabStyle: CSSProperties = {
  ...tabStyle,
  color: 'var(--studio-fg)',
  borderBottomColor: 'var(--studio-accent, #8b5cf6)',
};
const panelStyle: CSSProperties = { flex: 1, overflow: 'auto', padding: 12 };
