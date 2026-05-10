import type { FC } from 'react';
import { Field } from '../../components/inspector/shared';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import {
  inputStyle,
  monoTextareaStyle,
  selectStyle,
  textareaStyle,
} from '../shared/inspectorStyles';
import type { ScriptNodeData } from './data';

export const ScriptInspector: FC<InspectorProps<ScriptNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => (
  <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
    <Field
      label="Script"
      htmlFor={`script-${id}`}
      hint="Inline source. TypeScript runs via Bun, Python via uv."
    >
      <textarea
        id={`script-${id}`}
        aria-label="Script"
        value={data.script ?? ''}
        onChange={(e) => onChange({ script: e.target.value })}
        rows={8}
        style={monoTextareaStyle}
      />
    </Field>
    <Field label="Runtime" htmlFor={`script-runtime-${id}`}>
      <select
        id={`script-runtime-${id}`}
        aria-label="Runtime"
        value={data.runtime ?? 'bun'}
        onChange={(e) => onChange({ runtime: e.target.value })}
        style={selectStyle}
      >
        <option value="bun">bun (TypeScript)</option>
        <option value="uv">uv (Python)</option>
      </select>
    </Field>
    <Field label="Deps" hint="One per line. Passed to the runtime's dependency installer.">
      <textarea
        aria-label="Deps"
        value={(data.deps ?? []).join('\n')}
        onChange={(e) => {
          const lines = e.target.value
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          onChange({ deps: lines.length === 0 ? null : lines });
        }}
        rows={3}
        style={textareaStyle}
      />
    </Field>
    <Field
      label="Timeout (ms)"
      htmlFor={`script-timeout-${id}`}
      hint="Execution timeout. Empty = runtime default."
    >
      <input
        id={`script-timeout-${id}`}
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
