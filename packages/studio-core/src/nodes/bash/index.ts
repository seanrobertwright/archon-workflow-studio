import { bashNodeSchema } from '../../schemas/dag-node';
import { rewriteBodyRefs } from '../shared/renameBodyRefs';
import { makeTodoInspector } from '../shared/TodoInspector';
import type { VariantDefinition } from '../shared/types';
import { type BashNodeData, createBashDefault, bashCapabilities, bashLibrary } from './data';
import { bashFromDag } from './fromDag';
import { BashRenderer } from './Renderer';
import { bashToDag } from './toDag';

export type { BashNodeData };

export const bashVariant: VariantDefinition<BashNodeData> = {
  id: 'bash',
  capabilities: bashCapabilities,
  library: bashLibrary,
  schema: bashNodeSchema,
  createDefault: createBashDefault,
  fromDag: bashFromDag,
  toDag: bashToDag,
  Renderer: BashRenderer,
  Inspector: makeTodoInspector<BashNodeData>('bash'),
  renameBodyRefs: (data, oldId, newId) => ({
    ...data,
    bash: rewriteBodyRefs(data.bash, oldId, newId),
  }),
};
