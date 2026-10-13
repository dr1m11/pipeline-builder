import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import type { PortType } from '../ports';
import {
  TRANSFORM_DATA_SCHEMA,
  TRANSFORM_DEFINITION,
  TRANSFORM_OPERATIONS,
  TRANSFORM_RULES_SCHEMA,
  type TransformNodeData,
  type TransformOperation,
} from './transform';

/** Rule messages for `data`, by field. */
function ruleMessages(data: TransformNodeData) {
  const result = TRANSFORM_RULES_SCHEMA.safeParse(data);
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

const PATH_MESSAGE = 'Must be field names joined by dots, like user.name';

describe('TRANSFORM_DEFINITION', () => {
  it('starts by parsing JSON', () => {
    expect(TRANSFORM_DEFINITION.createData()).toEqual({ operation: 'parse-json', path: '' });
  });

  it.each<[TransformOperation, PortType, PortType]>([
    ['parse-json', 'text', 'json'],
    ['stringify', 'json', 'text'],
    ['trim', 'text', 'text'],
    ['get-field', 'json', 'any'],
  ])('types the ports of "%s" as %s to %s', (operation, input, output) => {
    expect(TRANSFORM_DEFINITION.getPorts({ operation, path: '' })).toEqual({
      inputs: [{ id: 'value', label: 'value', type: input, required: true }],
      outputs: [{ id: 'result', label: 'result', type: output, required: false }],
    });
  });
});

describe('TRANSFORM_DATA_SCHEMA', () => {
  it('describes exactly the Transform data type', () => {
    expectTypeOf<TransformNodeData>().toExtend<z.output<typeof TRANSFORM_DATA_SCHEMA>>();
    expectTypeOf<z.output<typeof TRANSFORM_DATA_SCHEMA>>().toExtend<TransformNodeData>();
    expectTypeOf<z.output<typeof TRANSFORM_RULES_SCHEMA>>().toExtend<TransformNodeData>();
  });

  it('rejects an unknown operation', () => {
    expect(TRANSFORM_DATA_SCHEMA.safeParse({ operation: 'upper', path: '' }).success).toBe(false);
  });
});

describe('TRANSFORM_RULES_SCHEMA', () => {
  it.each(TRANSFORM_OPERATIONS.filter((operation) => operation !== 'get-field'))(
    'ignores the path of "%s"',
    (operation) => {
      expect(ruleMessages({ operation, path: '..' })).toEqual({});
    },
  );

  it('requires a path to get a field', () => {
    expect(ruleMessages({ operation: 'get-field', path: ' ' })).toEqual({ path: ['Required'] });
  });

  it.each(['answer', 'user.name', 'items.0.title'])('accepts the path %j', (path) => {
    expect(ruleMessages({ operation: 'get-field', path })).toEqual({});
  });

  it.each(['user..name', '.user', 'user.', 'user name'])('rejects the path %j', (path) => {
    expect(ruleMessages({ operation: 'get-field', path })).toEqual({ path: [PATH_MESSAGE] });
  });
});
