import type { FC } from 'react';
import { Field } from '../../components/inspector/shared';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import { inputStyle, monoTextareaStyle, textareaStyle } from '../shared/inspectorStyles';
import type { LoopNodeData } from './data';

/**
 * Patches into the nested `loop` object emit `{ loop: { field: value } }` so
 * mergePatch deep-merges instead of replacing the whole loop config — preserves
 * sibling fields the inspector doesn't touch (until_bash, etc.).
 */
export const LoopInspector: FC<InspectorProps<LoopNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => {
  const patchLoop = (patch: Record<string, unknown>) => onChange({ loop: patch });
  const loop = data.loop;

  return (
    <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
      <Field label="Prompt" htmlFor={`loop-prompt-${id}`} hint="Body executed each iteration.">
        <textarea
          id={`loop-prompt-${id}`}
          aria-label="Prompt"
          value={loop.prompt ?? ''}
          onChange={(e) => patchLoop({ prompt: e.target.value })}
          rows={6}
          style={textareaStyle}
        />
      </Field>
      <Field
        label="Until (signal)"
        htmlFor={`loop-until-${id}`}
        hint="String emitted by the AI when complete (e.g. COMPLETE)."
      >
        <input
          id={`loop-until-${id}`}
          aria-label="Until"
          value={loop.until ?? ''}
          onChange={(e) => patchLoop({ until: e.target.value })}
          style={inputStyle}
        />
      </Field>
      <Field
        label="Max iterations"
        htmlFor={`loop-max-${id}`}
        hint="Hard cap; exceeding fails the node."
      >
        <input
          id={`loop-max-${id}`}
          aria-label="Max iterations"
          type="number"
          min={1}
          value={loop.max_iterations ?? 10}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) patchLoop({ max_iterations: v });
          }}
          style={inputStyle}
        />
      </Field>
      <Field
        label="Fresh context"
        htmlFor={`loop-fresh-${id}`}
        hint="When true, each iteration starts a fresh AI session."
      >
        <input
          id={`loop-fresh-${id}`}
          aria-label="Fresh context"
          type="checkbox"
          checked={loop.fresh_context ?? false}
          onChange={(e) => patchLoop({ fresh_context: e.target.checked })}
        />
      </Field>
      <Field
        label="Interactive"
        htmlFor={`loop-int-${id}`}
        hint="When true, pause between iterations for /workflow approve."
      >
        <input
          id={`loop-int-${id}`}
          aria-label="Interactive"
          type="checkbox"
          checked={loop.interactive ?? false}
          onChange={(e) => patchLoop({ interactive: e.target.checked || null })}
        />
      </Field>
      {loop.interactive ? (
        <Field
          label="Gate message"
          htmlFor={`loop-gate-${id}`}
          hint="Required when interactive — shown to user when paused."
        >
          <textarea
            id={`loop-gate-${id}`}
            aria-label="Gate message"
            value={loop.gate_message ?? ''}
            onChange={(e) => patchLoop({ gate_message: e.target.value || null })}
            rows={2}
            style={textareaStyle}
          />
        </Field>
      ) : null}
      <Field
        label="Until (bash)"
        htmlFor={`loop-untilbash-${id}`}
        hint="Optional bash check; exit 0 = complete."
      >
        <textarea
          id={`loop-untilbash-${id}`}
          aria-label="Until bash"
          value={loop.until_bash ?? ''}
          onChange={(e) => patchLoop({ until_bash: e.target.value || null })}
          rows={2}
          style={monoTextareaStyle}
        />
      </Field>
    </GeneralTab>
  );
};
