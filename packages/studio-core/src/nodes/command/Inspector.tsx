import type { FC } from 'react';
import { Field } from '../../components/inspector/shared';
import type { InspectorProps } from '../shared/types';
import { GeneralTab } from '../shared/GeneralTab';
import { inputStyle } from '../shared/inspectorStyles';
import type { CommandNodeData } from './data';

export const CommandInspector: FC<InspectorProps<CommandNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => (
  <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
    <div data-field="command">
      <Field label="Command" htmlFor={`cmd-${id}`} hint="Name of a command in .archon/commands/.">
        <input
          id={`cmd-${id}`}
          aria-label="Command"
          value={data.command ?? ''}
          onChange={(e) => onChange({ command: e.target.value })}
          style={inputStyle}
        />
      </Field>
    </div>
  </GeneralTab>
);
