import { scriptNodeSchema } from '../../schemas/dag-node';
import type { VariantDefinition } from '../shared/types';
import {
  type ScriptNodeData,
  createScriptDefault,
  scriptCapabilities,
  scriptLibrary,
} from './data';
import { scriptFromDag } from './fromDag';
import { scriptToDag } from './toDag';

export type { ScriptNodeData };

export const scriptVariant: VariantDefinition<ScriptNodeData> = {
  id: 'script',
  capabilities: scriptCapabilities,
  library: scriptLibrary,
  schema: scriptNodeSchema,
  createDefault: createScriptDefault,
  fromDag: scriptFromDag,
  toDag: scriptToDag,
};
