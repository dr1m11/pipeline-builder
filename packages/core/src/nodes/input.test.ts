import { describe, expect, it } from 'vitest';

import { INPUT_DEFINITION, INPUT_VALUE_TYPES } from './input';

describe('INPUT_DEFINITION', () => {
  it('starts as an empty text value', () => {
    expect(INPUT_DEFINITION.createData()).toEqual({ valueType: 'text', value: '' });
  });

  it('has no inputs and one output typed by the value type', () => {
    for (const valueType of INPUT_VALUE_TYPES) {
      expect(INPUT_DEFINITION.getPorts({ valueType, value: '' })).toEqual({
        inputs: [],
        outputs: [{ id: 'value', label: 'value', type: valueType, required: false }],
      });
    }
  });
});
