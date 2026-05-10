import type { CSSProperties, ReactNode } from 'react';
import { Field, DependsOnEditor } from '../../components/inspector/shared';
import { TRIGGER_RULES } from '../../schemas/dag-node';

interface Props {
  base: Record<string, unknown>;
  siblingIds: string[];
  onChange: (patch: Record<string, unknown>) => void;
  /** Variant-specific body fields rendered above the shared base fields. */
  children: ReactNode;
}

/**
 * Shared frame for the General tab. Variant-specific body fields render
 * first (passed via children); shared base-field controls — depends_on,
 * when (raw textarea — Phase 5 swaps in a visual builder), trigger_rule —
 * render below. All shared fields read from and write to `n.base`; the
 * store action routes them automatically via pickBaseFields.
 *
 * Per-node `description` is not part of the schema (only workflow.meta.description
 * exists), so this tab does not render one — see drift notes §3.
 */
export function GeneralTab({ base, siblingIds, onChange, children }: Props) {
  const dependsOn = (base.depends_on as string[] | undefined) ?? [];
  const when = (base.when as string | undefined) ?? '';
  const triggerRule = (base.trigger_rule as string | undefined) ?? 'all_success';

  return (
    <>
      {children}
      <DependsOnEditor
        value={dependsOn}
        siblingIds={siblingIds}
        onChange={(next) => onChange({ depends_on: next.length === 0 ? null : next })}
      />
      <Field
        label="When (raw)"
        htmlFor="gt-when"
        hint="Phase 5 replaces this with a visual builder. Grammar: $id.output.field == 'value' joined by && / ||."
      >
        <textarea
          id="gt-when"
          value={when}
          onChange={(e) => onChange({ when: e.target.value || null })}
          rows={2}
          style={{ ...textareaStyle, fontFamily: 'var(--studio-mono)', fontSize: 12 }}
        />
      </Field>
      <Field
        label="Trigger rule"
        htmlFor="gt-trigger"
        hint="all_success (default), one_success, none_failed_min_one_success, all_done."
      >
        <select
          id="gt-trigger"
          value={triggerRule}
          onChange={(e) =>
            onChange({ trigger_rule: e.target.value === 'all_success' ? null : e.target.value })
          }
          style={selectStyle}
        >
          {TRIGGER_RULES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

const textareaStyle: CSSProperties = {
  padding: 8,
  fontSize: 13,
  background: 'var(--studio-bg-elevated)',
  color: 'var(--studio-fg)',
  border: '1px solid var(--studio-border)',
  borderRadius: 'var(--radius-sm)',
  resize: 'vertical',
};
const selectStyle: CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  background: 'var(--studio-bg-elevated)',
  color: 'var(--studio-fg)',
  border: '1px solid var(--studio-border)',
  borderRadius: 'var(--radius-sm)',
};
