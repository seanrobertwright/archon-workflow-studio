import type { FC } from 'react';
import { Field } from '../../components/inspector/shared';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import { textareaStyle } from '../shared/inspectorStyles';
import type { PromptNodeData } from './data';

export const PromptInspector: FC<InspectorProps<PromptNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => (
  <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
    <Field
      label="Prompt"
      htmlFor={`prompt-${id}`}
      hint="Inline prompt body. Reference upstream output via $nodeId.output (autocomplete in Phase 5)."
    >
      <textarea
        id={`prompt-${id}`}
        aria-label="Prompt"
        value={data.prompt ?? ''}
        onChange={(e) => onChange({ prompt: e.target.value })}
        rows={8}
        style={textareaStyle}
      />
    </Field>
  </GeneralTab>
);
