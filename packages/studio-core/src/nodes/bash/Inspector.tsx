import type { FC } from 'react';
import { Field } from '../../components/inspector/shared';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import { inputStyle, monoTextareaStyle } from '../shared/inspectorStyles';
import type { BashNodeData } from './data';

export const BashInspector: FC<InspectorProps<BashNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => (
  <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
    <Field label="Bash" htmlFor={`bash-${id}`} hint="Shell script body. Runs via the bash runtime.">
      <textarea
        id={`bash-${id}`}
        aria-label="Bash"
        value={data.bash ?? ''}
        onChange={(e) => onChange({ bash: e.target.value })}
        rows={8}
        style={monoTextareaStyle}
      />
    </Field>
    <Field
      label="Timeout (ms)"
      htmlFor={`bash-timeout-${id}`}
      hint="Execution timeout. Empty = runtime default."
    >
      <input
        id={`bash-timeout-${id}`}
        aria-label="Timeout"
        type="number"
        min={0}
        value={data.timeout ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ timeout: v === '' ? null : Number(v) });
        }}
        style={inputStyle}
      />
    </Field>
  </GeneralTab>
);
