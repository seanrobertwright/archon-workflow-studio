import { bashNodeSchema } from '../../schemas/dag-node';
import type { VariantDefinition } from '../shared/types';
import { type BashNodeData, createBashDefault, bashCapabilities, bashLibrary } from './data';
import { bashFromDag } from './fromDag';
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
};
