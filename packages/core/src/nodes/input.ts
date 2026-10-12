import type { NodePorts } from '../ports';
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
};
