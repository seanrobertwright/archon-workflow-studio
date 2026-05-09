import { VARIANT_IDS } from '../nodes/registry';
import { defaultRegistry } from '../nodes/default-registry';
import { useBuilderStore } from '../store/builder-store';
import { VariantTile } from './library/VariantTile';
import styles from './NodeLibrary.module.css';

export function NodeLibrary() {
  const addNodeFromVariant = useBuilderStore((s) => s.addNodeFromVariant);
  return (
    <aside aria-label="Node library" className={styles.library}>
      <section className={styles.section}>
        <h3 className={styles.heading}>Variants</h3>
        <ul className={styles.tileList}>
          {VARIANT_IDS.map((id) => (
            <li key={id}>
              <VariantTile
                id={id}
                meta={defaultRegistry[id].library}
                onActivate={() => addNodeFromVariant(id)}
              />
            </li>
          ))}
        </ul>
      </section>
      {/* Commands section — Task 48 introduces a `cwd` prop and renders <CommandsSection cwd={cwd} /> */}
      {/* Snippets section — Task 51 */}
    </aside>
  );
}
