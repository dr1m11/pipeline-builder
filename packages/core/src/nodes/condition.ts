import * as z from 'zod';

import type { NodePorts } from '../ports';
import { isBlank, REQUIRED_MESSAGE } from './field-rules';
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

export const CONDITION_DATA_SCHEMA = z.object({
  operator: z.enum(CONDITION_OPERATORS),
  operand: z.string(),
});

function usesOperand(data: ConditionNodeData): boolean {
  return data.operator !== 'is-empty';
}

export const CONDITION_RULES_SCHEMA = CONDITION_DATA_SCHEMA.superRefine((data, ctx) => {
  if (usesOperand(data) && isBlank(data.operand)) {
    ctx.addIssue({ code: 'custom', message: REQUIRED_MESSAGE, path: ['operand'] });
  }
});

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
  dataSchema: CONDITION_DATA_SCHEMA,
  rulesSchema: CONDITION_RULES_SCHEMA,
  fields: {
    operator: {
      label: 'Operator',
      optionLabels: { contains: 'Contains', equals: 'Equals', 'is-empty': 'Is empty' },
    },
    operand: {
      label: 'Compare with',
      appliesWhen: usesOperand,
    },
  },
};
