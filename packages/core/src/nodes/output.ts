import type { NodePorts } from '../ports';
import type { NodeDefinition } from './node-definition';

export const OUTPUT_FORMATS = ['text', 'markdown'] as const;

/** How an Output node displays its result. */
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Data of an Output node. */
export interface OutputNodeData {
  /** How the result is displayed. */
  readonly format: OutputFormat;
}

const PORTS: NodePorts = {
  inputs: [{ id: 'value', label: 'value', type: 'any', required: true }],
  outputs: [],
};

/** Shows a result of the pipeline. */
export const OUTPUT_DEFINITION: NodeDefinition<OutputNodeData> = {
  title: 'Output',
  description: 'Shows a result of the pipeline.',
  createData: () => ({ format: 'text' }),
  getPorts: () => PORTS,
};
