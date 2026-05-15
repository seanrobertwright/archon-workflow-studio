import type { FC } from 'react';
import { CmEditor, Field } from '../../components/inspector/shared';
import { useWhenContext } from '../../components/when/useWhenContext';
import { GeneralTab } from '../shared/GeneralTab';
import type { InspectorProps } from '../shared/types';
import type { PromptNodeData } from './data';

export const PromptInspector: FC<InspectorProps<PromptNodeData>> = ({
  id,
  data,
  base,
  onChange,
  siblingIds,
}) => {
  const { extensions } = useWhenContext(id);
  return (
    <GeneralTab base={base} siblingIds={siblingIds} onChange={onChange}>
      <div data-field="prompt">
        <Field label="Prompt" hint="Inline prompt body. Type $ for upstream node references.">
          <CmEditor
            ariaLabel="Prompt"
            value={data.prompt ?? ''}
            onChange={(next) => onChange({ prompt: next })}
            extensions={extensions}
            minHeight={140}
          />
        </Field>
      </div>
    </GeneralTab>
  );
};
