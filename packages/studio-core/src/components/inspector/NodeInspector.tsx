import { useMemo, type CSSProperties } from 'react';
import { useBuilderStore } from '../../store/builder-store';
import { defaultRegistry } from '../../nodes/default-registry';
import { tabsForVariant, type InspectorProps } from '../../nodes/shared/types';
import { useInspectorPatch } from '../../hooks/useInspectorPatch';
import { RenameField } from './shared';
import { InspectorTabs } from './InspectorTabs';
import { ExecutionTab } from './tabs/ExecutionTab';
import { ProviderTab } from './tabs/ProviderTab';
import { ToolsTab } from './tabs/ToolsTab';
import { HooksTab } from './tabs/HooksTab';
import { SkillsMcpTab } from './tabs/SkillsMcpTab';
import { AdvancedTab } from './tabs/AdvancedTab';

/**
 * Right-rail editor for the currently-selected node. Reads selection from the
 * store, looks up the variant in the registry, derives the tab list via
 * tabsForVariant (capability-gated), and renders the per-variant General
 * Inspector + shared base-field tab stubs. Width matches spec §5.1 (320px).
 */
export function NodeInspector() {
  const selectedId = useBuilderStore((s) => s.selectedNodeId);
  const nodes = useBuilderStore((s) => s.nodes);
  const node = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) : undefined),
    [nodes, selectedId],
  );
  const siblingIds = useMemo(
    () => nodes.map((n) => n.id).filter((id) => id !== selectedId),
    [nodes, selectedId],
  );
  const onChange = useInspectorPatch(selectedId ?? '');

  if (!selectedId || !node) {
    return (
      <aside style={shellStyle} aria-label="Node inspector" data-testid="inspector-empty">
        <div style={emptyStyle}>Select a node to edit.</div>
      </aside>
    );
  }

  const variant = defaultRegistry[node.variant];
  if (!variant) {
    return (
      <aside style={shellStyle} aria-label="Node inspector">
        <div style={emptyStyle}>Unknown variant &lsquo;{node.variant}&rsquo;.</div>
      </aside>
    );
  }
  const tabs = tabsForVariant(variant);
  const General = variant.Inspector;

  return (
    <aside style={shellStyle} aria-label="Node inspector">
      <header style={headerStyle}>
        <div style={{ flex: 1 }}>
          <RenameField id={selectedId} />
        </div>
        <span style={typePillStyle} title="Variant">
          {node.variant}
        </span>
      </header>
      <InspectorTabs tabs={tabs}>
        {(active) => {
          const generalProps: InspectorProps<unknown> = {
            id: selectedId,
            data: node.data,
            base: node.base,
            unknown: node.unknown,
            onChange,
            siblingIds,
          };
          switch (active) {
            case 'general':
              return <General {...(generalProps as InspectorProps<never>)} />;
            case 'execution':
              return (
                <ExecutionTab
                  {...(generalProps as InspectorProps<unknown>)}
                  forbidsRetry={variant.capabilities.forbidsRetry}
                />
              );
            case 'provider':
              return <ProviderTab {...(generalProps as InspectorProps<unknown>)} />;
            case 'tools':
              return <ToolsTab {...(generalProps as InspectorProps<unknown>)} />;
            case 'hooks':
              return <HooksTab {...(generalProps as InspectorProps<unknown>)} />;
            case 'skills-mcp':
              return <SkillsMcpTab {...(generalProps as InspectorProps<unknown>)} />;
            case 'advanced':
              return <AdvancedTab {...(generalProps as InspectorProps<unknown>)} />;
          }
        }}
      </InspectorTabs>
    </aside>
  );
}

const shellStyle: CSSProperties = {
  width: 320,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--studio-bg)',
  color: 'var(--studio-fg)',
  borderLeft: '1px solid var(--studio-border)',
};
const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  padding: 12,
  borderBottom: '1px solid var(--studio-border)',
};
const typePillStyle: CSSProperties = {
  fontSize: 11,
  padding: '2px 6px',
  background: 'var(--studio-bg-elevated)',
  color: 'var(--studio-muted)',
  border: '1px solid var(--studio-border)',
  borderRadius: 'var(--radius-sm)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  flexShrink: 0,
  marginTop: 18,
};
const emptyStyle: CSSProperties = {
  padding: 24,
  fontSize: 13,
  color: 'var(--studio-muted)',
  textAlign: 'center',
};
