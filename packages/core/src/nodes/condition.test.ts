import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  type CONDITION_DATA_SCHEMA,
  CONDITION_DEFINITION,
  CONDITION_RULES_SCHEMA,
  type ConditionNodeData,
} from './condition';

/** Rule messages for `data`, by field. */
function ruleMessages(data: ConditionNodeData) {
  const result = CONDITION_RULES_SCHEMA.safeParse(data);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('CONDITION_DEFINITION', () => {
  it('starts with a "contains" check against an empty operand', () => {
    expect(CONDITION_DEFINITION.createData()).toEqual({ operator: 'contains', operand: '' });
  });

  it('takes a value of any type and routes it to a "true" or "false" output', () => {
    expect(CONDITION_DEFINITION.getPorts(CONDITION_DEFINITION.createData())).toEqual({
      inputs: [{ id: 'value', label: 'value', type: 'any', required: true }],
      outputs: [
        { id: 'true', label: 'true', type: 'any', required: false },
        { id: 'false', label: 'false', type: 'any', required: false },
      ],
    });
  });
});

describe('CONDITION_DATA_SCHEMA', () => {
  it('describes exactly the Condition data type', () => {
    expectTypeOf<ConditionNodeData>().toExtend<z.output<typeof CONDITION_DATA_SCHEMA>>();
    expectTypeOf<z.output<typeof CONDITION_DATA_SCHEMA>>().toExtend<ConditionNodeData>();
    expectTypeOf<z.output<typeof CONDITION_RULES_SCHEMA>>().toExtend<ConditionNodeData>();
  });
});

describe('CONDITION_RULES_SCHEMA', () => {
  it.each(['contains', 'equals'] as const)('requires an operand to check "%s"', (operator) => {
    expect(ruleMessages({ operator, operand: '' })).toEqual({ operand: ['Required'] });
    expect(ruleMessages({ operator, operand: 'yes' })).toEqual({});
  });

  it('needs no operand to check "is-empty"', () => {
    expect(ruleMessages({ operator: 'is-empty', operand: '' })).toEqual({});
  });
});
