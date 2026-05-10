import { promptNodeSchema } from '../../schemas/dag-node';
import { rewriteBodyRefs } from '../shared/renameBodyRefs';
import { makeTodoInspector } from '../shared/TodoInspector';
import type { VariantDefinition } from '../shared/types';
import {
  type PromptNodeData,
  createPromptDefault,
  promptCapabilities,
  promptLibrary,
} from './data';
import { promptFromDag } from './fromDag';
import { PromptRenderer } from './Renderer';
import { promptToDag } from './toDag';

export type { PromptNodeData };

export const promptVariant: VariantDefinition<PromptNodeData> = {
  id: 'prompt',
  capabilities: promptCapabilities,
  library: promptLibrary,
  schema: promptNodeSchema,
  createDefault: createPromptDefault,
  fromDag: promptFromDag,
  toDag: promptToDag,
  Renderer: PromptRenderer,
  Inspector: makeTodoInspector<PromptNodeData>('prompt'),
  renameBodyRefs: (data, oldId, newId) => ({
    ...data,
    prompt: rewriteBodyRefs(data.prompt, oldId, newId),
  }),
};
