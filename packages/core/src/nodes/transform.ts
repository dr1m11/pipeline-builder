import type { NodePorts, PortType } from '../ports';
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
};
