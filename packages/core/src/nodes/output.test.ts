import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as z from 'zod';

import {
  type OUTPUT_DATA_SCHEMA,
  OUTPUT_DEFINITION,
  OUTPUT_FORMATS,
  type OutputNodeData,
} from './output';

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

  it('accepts every format and nothing else', () => {
    for (const format of OUTPUT_FORMATS) {
      expect(OUTPUT_DEFINITION.rulesSchema.safeParse({ format }).success).toBe(true);
    }
    expect(OUTPUT_DEFINITION.rulesSchema.safeParse({ format: 'html' }).success).toBe(false);
  });
});

describe('OUTPUT_DATA_SCHEMA', () => {
  it('describes exactly the Output data type', () => {
    expectTypeOf<OutputNodeData>().toExtend<z.output<typeof OUTPUT_DATA_SCHEMA>>();
    expectTypeOf<z.output<typeof OUTPUT_DATA_SCHEMA>>().toExtend<OutputNodeData>();
  });
});
