import type { FC } from 'react';
import { Field } from '../../components/inspector/shared';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import { textareaStyle } from '../shared/inspectorStyles';
import type { ApprovalNodeData } from './data';

/**
 * Patches into the nested `approval` object emit `{ approval: { field: ... } }`
 * so mergePatch deep-merges and sibling fields the inspector doesn't touch
 * survive (foreign keys preserved per §6.3 forward-compat invariant).
 */
export const ApprovalInspector: FC<InspectorProps<ApprovalNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => {
  const patchApproval = (patch: Record<string, unknown>) => onChange({ approval: patch });
  const a = data.approval;

  return (
    <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
      <Field
        label="Message"
        htmlFor={`approval-msg-${id}`}
        hint="Shown to the human reviewer when execution pauses."
      >
        <textarea
          id={`approval-msg-${id}`}
          aria-label="Message"
          value={a.message ?? ''}
          onChange={(e) => patchApproval({ message: e.target.value })}
          rows={3}
          style={textareaStyle}
        />
      </Field>
      <Field
        label="Capture response"
        htmlFor={`approval-cap-${id}`}
        hint="When true, the reviewer's text is captured into output."
      >
        <input
          id={`approval-cap-${id}`}
          aria-label="Capture response"
          type="checkbox"
          checked={a.capture_response ?? false}
          onChange={(e) => patchApproval({ capture_response: e.target.checked || null })}
        />
      </Field>
      <Field
        label="On reject — prompt"
        htmlFor={`approval-rej-${id}`}
        hint="Optional follow-up prompt shown when the reviewer rejects."
      >
        <textarea
          id={`approval-rej-${id}`}
          aria-label="On reject prompt"
          value={a.on_reject?.prompt ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            patchApproval({ on_reject: v === '' ? null : { prompt: v } });
          }}
          rows={2}
          style={textareaStyle}
        />
      </Field>
    </GeneralTab>
  );
};
