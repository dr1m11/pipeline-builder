import type { NodePorts } from '../ports';
import type { NodeDefinition } from './node-definition';

export const CONDITION_OPERATORS = ['contains', 'equals', 'is-empty'] as const;

/** Check a Condition node applies to its input. */
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Data of a Condition node. */
export interface ConditionNodeData {
  readonly operator: ConditionOperator;
  /** Value the input is compared with; ignored by `is-empty`. */
  readonly operand: string;
}

const PORTS: NodePorts = {
  inputs: [{ id: 'value', label: 'value', type: 'any', required: true }],
  outputs: [
    { id: 'true', label: 'true', type: 'any', required: false },
    { id: 'false', label: 'false', type: 'any', required: false },
  ],
};

/** Routes its input to the `true` or `false` output. */
export const CONDITION_DEFINITION: NodeDefinition<ConditionNodeData> = {
  title: 'Condition',
  description: 'Sends the value down the "true" or "false" branch.',
  createData: () => ({ operator: 'contains', operand: '' }),
  getPorts: () => PORTS,
};
