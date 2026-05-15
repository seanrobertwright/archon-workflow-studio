import type { CSSProperties } from 'react';
import { SNIPPET_STARTERS, SNIPPET_PATTERNS, loadSnippet } from '@archon-studio/fixtures';
import { LIBRARY_DRAG_MIME, encodeLibraryDrag } from './dragPayload';
import { insertSnippet } from '../../snippets/insertSnippet';
import { usePositionContext } from '../../hooks/PositionContext';
import { useUserLibraryStore } from '../../store/user-library-store';

export function SnippetsSection() {
  const { setPosition } = usePositionContext();
  const userSnippets = useUserLibraryStore((s) => s.userSnippets);
  const removeUserSnippet = useUserLibraryStore((s) => s.removeUserSnippet);

  const insertAtOrigin = (category: 'starters' | 'patterns', name: string) => {
    insertSnippet({
      yaml: loadSnippet(category, name),
      anchorPosition: { x: 0, y: 0 },
      setPosition,
    });
  };

  const insertUserSnippet = (yaml: string) => {
    insertSnippet({
      yaml,
      anchorPosition: { x: 0, y: 0 },
      setPosition,
    });
  };

  return (
    <section style={{ padding: 12 }}>
      <h3 style={headingStyle}>Snippets</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {userSnippets.length > 0 && (
          <UserSnippetGroup
            snippets={userSnippets}
            onActivate={insertUserSnippet}
            onDelete={removeUserSnippet}
          />
        )}
        <SnippetGroup
          label="Starters"
          category="starters"
          names={SNIPPET_STARTERS}
          onActivate={insertAtOrigin}
        />
        <SnippetGroup
          label="Patterns"
          category="patterns"
          names={SNIPPET_PATTERNS}
          onActivate={insertAtOrigin}
        />
      </div>
    </section>
  );
}

function UserSnippetGroup({
  snippets,
  onActivate,
  onDelete,
}: {
  snippets: { id: string; name: string; yaml: string }[];
  onActivate: (yaml: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <div style={subheadingStyle}>Your snippets</div>
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
        {snippets.map((s) => (
          <li key={s.id} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label={`Insert user snippet ${s.name}`}
              draggable
              onDragStart={(e) => {
                // User snippets aren't in the bundled fixtures map, so we
                // embed the YAML directly in the drag payload as a one-off
                // "rawYaml" variant of the snippet drag kind.
                e.dataTransfer.setData(
                  LIBRARY_DRAG_MIME,
                  encodeLibraryDrag({ kind: 'user-snippet', name: s.name, yaml: s.yaml }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onActivate(s.yaml)}
              style={rowStyle}
            >
              {s.name}
            </button>
            <button
              type="button"
              aria-label={`Delete snippet ${s.name}`}
              onClick={() => onDelete(s.id)}
              style={deleteBtnStyle}
              title="Delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SnippetGroup({
  label,
  category,
  names,
  onActivate,
}: {
  label: string;
  category: 'starters' | 'patterns';
  names: readonly string[];
  onActivate: (category: 'starters' | 'patterns', name: string) => void;
}) {
  return (
    <div>
      <div style={subheadingStyle}>{label}</div>
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
        {names.map((name) => (
          <li key={name}>
            <button
              type="button"
              aria-label={`Insert snippet ${name}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  LIBRARY_DRAG_MIME,
                  encodeLibraryDrag({ kind: 'snippet', category, name }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onActivate(category, name)}
              style={rowStyle}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const headingStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--studio-muted)',
  margin: '0 0 8px 0',
};
const subheadingStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--studio-fg)',
  marginBottom: 4,
};
const rowStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: 13,
  background: 'transparent',
  color: 'var(--studio-fg)',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-sm)',
  cursor: 'grab',
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
