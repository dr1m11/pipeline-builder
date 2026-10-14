import * as z from 'zod';

import { REQUIRED_MESSAGE } from '../nodes/field-rules';
import { NODE_LABEL_SCHEMA } from '../nodes/node-label';
import { NODE_DEFINITIONS, NODE_KINDS, type NodeKind } from '../nodes/registry';
import {
  parsePipelineName,
  type Pipeline,
  PIPELINE_NAME_MAX_LENGTH,
  type PipelineNameError,
} from '../pipeline';

const NAME_MESSAGES: Readonly<Record<PipelineNameError, string>> = {
  empty: REQUIRED_MESSAGE,
  'too-long': `Must be at most ${String(PIPELINE_NAME_MAX_LENGTH)} characters`,
};

// The rules of a name typed in the editor, so a file cannot hold a name the editor would refuse.
const NAME_SCHEMA = z.string().transform((input, ctx) => {
  const name = parsePipelineName(input);
  if (name.ok) return name.value;
  ctx.issues.push({ code: 'custom', message: NAME_MESSAGES[name.error], input });
  return z.NEVER;
});

// `z.number()` rejects Infinity, which `JSON.parse` returns for literals like 1e999.
const POSITION_SCHEMA = z.object({ x: z.number(), y: z.number() });

// Data goes through the kind's `dataSchema`, not its `rulesSchema`: an unfinished node still loads
// and validation reports it (ADR 0007).
function nodeSchema<K extends NodeKind>(kind: K) {
  return z.object({
    id: z.string(),
    kind: z.literal(kind),
    label: NODE_LABEL_SCHEMA,
    position: POSITION_SCHEMA,
    data: NODE_DEFINITIONS[kind].dataSchema,
  });
}

type NodeSchema<K extends NodeKind> = ReturnType<typeof nodeSchema<K>>;

// One schema per kind; the compiler fails while a kind is missing.
const NODE_SCHEMAS: { readonly [K in NodeKind]: NodeSchema<K> } = {
  input: nodeSchema('input'),
  prompt: nodeSchema('prompt'),
  'llm-call': nodeSchema('llm-call'),
  transform: nodeSchema('transform'),
  condition: nodeSchema('condition'),
  output: nodeSchema('output'),
};

// The union needs at least one option, so the first kind is taken apart from the rest.
const [FIRST_KIND, ...OTHER_KINDS] = NODE_KINDS;

// An unknown kind fails with "Invalid discriminator value. Expected 'input' | 'prompt' | …".
const NODE_SCHEMA = z.discriminatedUnion('kind', [
  NODE_SCHEMAS[FIRST_KIND],
  ...OTHER_KINDS.map((kind) => NODE_SCHEMAS[kind]),
]);

const EDGE_SCHEMA = z.object({
  id: z.string(),
  source: z.string(),
  sourcePort: z.string(),
  target: z.string(),
  targetPort: z.string(),
});

/**
 * Shape of a pipeline document in the current schema version. Unknown fields are dropped (the
 * file format marker among them); ids are checked for uniqueness after this schema.
 */
export const PIPELINE_SCHEMA: z.ZodType<Pipeline> = z.object({
  schemaVersion: z.int().positive(),
  id: z.string(),
  name: NAME_SCHEMA,
  nodes: z.array(NODE_SCHEMA),
  edges: z.array(EDGE_SCHEMA),
});
