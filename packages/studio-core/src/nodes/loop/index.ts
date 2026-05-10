import { loopNodeSchema } from '../../schemas/dag-node';
import { rewriteBodyRefs } from '../shared/renameBodyRefs';
import { makeTodoInspector } from '../shared/TodoInspector';
import type { VariantDefinition } from '../shared/types';
import { type LoopNodeData, createLoopDefault, loopCapabilities, loopLibrary } from './data';
import { loopFromDag } from './fromDag';
import { LoopRenderer } from './Renderer';
import { loopToDag } from './toDag';

export type { LoopNodeData };

export const loopVariant: VariantDefinition<LoopNodeData> = {
  id: 'loop',
  capabilities: loopCapabilities,
  library: loopLibrary,
  schema: loopNodeSchema,
  createDefault: createLoopDefault,
  fromDag: loopFromDag,
  toDag: loopToDag,
  Renderer: LoopRenderer,
  Inspector: makeTodoInspector<LoopNodeData>('loop'),
  renameBodyRefs: (data, oldId, newId) => ({
    ...data,
    loop: {
      ...data.loop,
      prompt: rewriteBodyRefs(data.loop.prompt, oldId, newId),
    },
  }),
};
