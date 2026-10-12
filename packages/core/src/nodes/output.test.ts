import { describe, expect, it } from 'vitest';

import { OUTPUT_DEFINITION } from './output';

describe('OUTPUT_DEFINITION', () => {
  it('shows results as plain text by default', () => {
    expect(OUTPUT_DEFINITION.createData()).toEqual({ format: 'text' });
  });

  it('takes one required value of any type and has no outputs', () => {
    expect(OUTPUT_DEFINITION.getPorts(OUTPUT_DEFINITION.createData())).toEqual({
      inputs: [{ id: 'value', label: 'value', type: 'any', required: true }],
      outputs: [],
    });
  });
});
