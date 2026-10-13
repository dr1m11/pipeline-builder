import * as z from 'zod';

import type { NodePorts, PortType } from '../ports';
import { isBlank, REQUIRED_MESSAGE } from './field-rules';
import type { NodeDefinition } from './node-definition';

export const TRANSFORM_OPERATIONS = ['parse-json', 'stringify', 'trim', 'get-field'] as const;

/** Conversion a Transform node applies. */
export type TransformOperation = (typeof TRANSFORM_OPERATIONS)[number];

/** Data of a Transform node. */
export interface TransformNodeData {
  readonly operation: TransformOperation;
  /** Dot-separated field path for `get-field` (`user.name`); ignored by other operations. */
  readonly path: string;
}

export const TRANSFORM_DATA_SCHEMA = z.object({
  operation: z.enum(TRANSFORM_OPERATIONS),
  path: z.string(),
});

// Segments without dots or whitespace, joined by single dots: `user.name`, `items.0`.
const FIELD_PATH = /^[^.\s]+(?:\.[^.\s]+)*$/;

function usesPath(data: TransformNodeData): boolean {
  return data.operation === 'get-field';
}

export const TRANSFORM_RULES_SCHEMA = TRANSFORM_DATA_SCHEMA.superRefine((data, ctx) => {
  if (!usesPath(data)) return;
  if (isBlank(data.path)) {
    ctx.addIssue({ code: 'custom', message: REQUIRED_MESSAGE, path: ['path'] });
  } else if (!FIELD_PATH.test(data.path)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be field names joined by dots, like user.name',
      path: ['path'],
    });
  }
});

function portsFor(input: PortType, output: PortType): NodePorts {
  return {
    inputs: [{ id: 'value', label: 'value', type: input, required: true }],
    outputs: [{ id: 'result', label: 'result', type: output, required: false }],
  };
}

const PORTS: Readonly<Record<TransformOperation, NodePorts>> = {
  'parse-json': portsFor('text', 'json'),
  stringify: portsFor('json', 'text'),
  trim: portsFor('text', 'text'),
  'get-field': portsFor('json', 'any'),
};

/** Converts a value; its port types follow the operation. */
export const TRANSFORM_DEFINITION: NodeDefinition<TransformNodeData> = {
  title: 'Transform',
  description: 'Converts a value: parse or stringify JSON, trim text, read a field.',
  createData: () => ({ operation: 'parse-json', path: '' }),
  getPorts: ({ operation }) => PORTS[operation],
  dataSchema: TRANSFORM_DATA_SCHEMA,
  rulesSchema: TRANSFORM_RULES_SCHEMA,
  fields: {
    operation: {
      label: 'Operation',
      optionLabels: {
        'parse-json': 'Parse JSON',
        stringify: 'Stringify JSON',
        trim: 'Trim text',
        'get-field': 'Get field',
      },
    },
    path: {
      label: 'Field path',
      description: 'Field names joined by dots, like user.name.',
      appliesWhen: usesPath,
    },
  },
};
