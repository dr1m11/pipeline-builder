import * as z from 'zod';

import { parseJson } from '../persistence/json';
import type { NodePorts } from '../ports';
import { isBlank, NUMBER_MESSAGE, REQUIRED_MESSAGE } from './field-rules';
import type { NodeDefinition } from './node-definition';

export const INPUT_VALUE_TYPES = ['text', 'number', 'json'] as const;

/** Type of the value an Input node provides. */
export type InputValueType = (typeof INPUT_VALUE_TYPES)[number];

/** Data of an Input node. */
export interface InputNodeData {
  readonly valueType: InputValueType;
  /** The value as entered; parsed according to `valueType` when the pipeline runs. */
  readonly value: string;
}

export const INPUT_DATA_SCHEMA = z.object({
  valueType: z.enum(INPUT_VALUE_TYPES),
  value: z.string(),
});

// The message for a value that cannot be read as its type, or null for a valid one.
const VALUE_CHECKS: Readonly<Record<InputValueType, (value: string) => string | null>> = {
  text: () => null,
  number: (value) => (Number.isFinite(Number(value)) ? null : NUMBER_MESSAGE),
  // The run reads the value with the same parser, so whatever passes here also parses there.
  json: (value) => (parseJson(value) === undefined ? 'Must be valid JSON' : null),
};

export const INPUT_RULES_SCHEMA = INPUT_DATA_SCHEMA.superRefine(({ valueType, value }, ctx) => {
  const message = isBlank(value) ? REQUIRED_MESSAGE : VALUE_CHECKS[valueType](value);
  if (message !== null) ctx.addIssue({ code: 'custom', message, path: ['value'] });
});

function portsFor(valueType: InputValueType): NodePorts {
  return {
    inputs: [],
    outputs: [{ id: 'value', label: 'value', type: valueType, required: false }],
  };
}

const PORTS: Readonly<Record<InputValueType, NodePorts>> = {
  text: portsFor('text'),
  number: portsFor('number'),
  json: portsFor('json'),
};

/** A value supplied to the pipeline; its output type follows `valueType`. */
export const INPUT_DEFINITION: NodeDefinition<InputNodeData> = {
  title: 'Input',
  description: 'A value the pipeline starts from: text, a number or JSON.',
  createData: () => ({ valueType: 'text', value: '' }),
  getPorts: ({ valueType }) => PORTS[valueType],
  dataSchema: INPUT_DATA_SCHEMA,
  rulesSchema: INPUT_RULES_SCHEMA,
  fields: {
    valueType: {
      label: 'Value type',
      optionLabels: { text: 'Text', number: 'Number', json: 'JSON' },
    },
    value: {
      label: 'Value',
      description: 'Read as the value type when the pipeline runs.',
      multiline: true,
    },
  },
};
