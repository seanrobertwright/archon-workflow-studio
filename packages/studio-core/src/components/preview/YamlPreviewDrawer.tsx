import { useMemo } from 'react';
import { useBuilderStore } from '../../store/builder-store';
import { serializeYaml } from '../../exporter/serializeYaml';
import { YamlPreview } from './YamlPreview';

export function YamlPreviewDrawer() {
  const meta = useBuilderStore((s) => s.workflow);
  const nodes = useBuilderStore((s) => s.nodes);
  const selectedNodeId = useBuilderStore((s) => s.selectedNodeId);
  const hoveredNodeId = useBuilderStore((s) => s.hoveredNodeId);
  const setSelected = useBuilderStore((s) => s.setSelectedNodeId);
  const setHoveredNodeId = useBuilderStore((s) => s.setHoveredNodeId);

  const result = useMemo(() => {
    if (!meta) return { yaml: '', sourceMap: [] };
    return serializeYaml({ meta, nodes });
  }, [meta, nodes]);

  return (
    <div className="yaml-preview-drawer">
      <header className="yaml-preview-drawer__header">
        <h2>YAML preview</h2>
        <p className="yaml-preview-drawer__note">Preview formatting may differ from saved file.</p>
      </header>
      <YamlPreview
        yaml={result.yaml}
        sourceMap={result.sourceMap}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onLinePick={(id) => setSelected(id)}
        onLineHover={(id) => setHoveredNodeId(id)}
      />
    </div>
  );
}
