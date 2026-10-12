import { describe, expect, it } from 'vitest';

import { CONDITION_DEFINITION } from './condition';

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
