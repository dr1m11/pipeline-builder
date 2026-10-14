import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  INPUT_DATA_SCHEMA,
  INPUT_DEFINITION,
  INPUT_RULES_SCHEMA,
  INPUT_VALUE_TYPES,
  type InputNodeData,
  type InputValueType,
} from './input';

/** Rule messages for `data`, by field. */
function ruleMessages(data: InputNodeData) {
  const result = INPUT_RULES_SCHEMA.safeParse(data);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

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

describe('INPUT_DATA_SCHEMA', () => {
  it('describes exactly the Input data type', () => {
    expectTypeOf<InputNodeData>().toExtend<z.output<typeof INPUT_DATA_SCHEMA>>();
    expectTypeOf<z.output<typeof INPUT_DATA_SCHEMA>>().toExtend<InputNodeData>();
    expectTypeOf<z.output<typeof INPUT_RULES_SCHEMA>>().toExtend<InputNodeData>();
  });

  it('accepts a value that breaks the rules but rejects an unknown value type', () => {
    expect(INPUT_DATA_SCHEMA.safeParse({ valueType: 'number', value: 'abc' }).success).toBe(true);
    expect(INPUT_DATA_SCHEMA.safeParse({ valueType: 'date', value: '' }).success).toBe(false);
  });
});

describe('INPUT_RULES_SCHEMA', () => {
  it.each(INPUT_VALUE_TYPES)('requires a %s value that is not blank', (valueType) => {
    expect(ruleMessages({ valueType, value: ' \n' })).toEqual({ value: ['Required'] });
  });

  it.each<[InputValueType, string]>([
    ['text', 'anything at all'],
    ['number', '42'],
    ['number', '-1.5'],
    ['number', '1e3'],
    ['json', '{"question": "Why?"}'],
    ['json', '[1, 2]'],
    ['json', '"text"'],
  ])('accepts the %s value %j', (valueType, value) => {
    expect(ruleMessages({ valueType, value })).toEqual({});
  });

  it.each<[InputValueType, string, string]>([
    ['number', 'forty-two', 'Must be a number'],
    ['number', 'Infinity', 'Must be a number'],
    ['json', '{question: 1}', 'Must be valid JSON'],
    ['json', '[1,', 'Must be valid JSON'],
    // `JSON.parse` reads these as `Infinity`, which is not a JSON value.
    ['json', '1e999', 'Must be valid JSON'],
    ['json', '[1e999]', 'Must be valid JSON'],
  ])('rejects the %s value %j', (valueType, value, message) => {
    expect(ruleMessages({ valueType, value })).toEqual({ value: [message] });
  });
});
