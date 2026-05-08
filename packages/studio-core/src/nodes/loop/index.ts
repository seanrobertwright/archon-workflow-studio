import { loopNodeSchema } from '../../schemas/dag-node';
import type { VariantDefinition } from '../shared/types';
import { type LoopNodeData, createLoopDefault, loopCapabilities, loopLibrary } from './data';
import { loopFromDag } from './fromDag';
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
};
