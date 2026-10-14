import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import type { NodeDataSchema, NodeDefinition, NodeFields } from './node-definition';
import { describeFields, getNodeFields } from './node-fields';
import { createNode, NODE_KINDS, type NodeKind, type PipelineNode } from './registry';

const ORIGIN = { x: 0, y: 0 };

function nodeOf(kind: NodeKind): PipelineNode {
  return createNode(kind, { id: kind, label: kind, position: ORIGIN });
}

/** A made-up kind "Test" whose data `schema` describes. */
function testDefinition<Data>(
  schema: NodeDataSchema<Data>,
  fields: NodeFields<Data>,
  data: Data,
): NodeDefinition<Data> {
  return {
    title: 'Test',
    description: 'A kind for tests.',
    createData: () => data,
    getPorts: () => ({ inputs: [], outputs: [] }),
    dataSchema: schema,
    rulesSchema: schema,
    fields,
  };
}

describe('getNodeFields', () => {
  it('lists the fields of the data in schema order with their controls', () => {
    expect(getNodeFields(nodeOf('input'))).toEqual([
      {
        name: 'valueType',
        label: 'Value type',
        description: undefined,
        control: {
          kind: 'choice',
          options: [
            { value: 'text', label: 'Text' },
            { value: 'number', label: 'Number' },
            { value: 'json', label: 'JSON' },
          ],
        },
        applies: true,
      },
      {
        name: 'value',
        label: 'Value',
        description: 'Read as the value type when the pipeline runs.',
        control: { kind: 'text', multiline: true },
        applies: true,
      },
    ]);
  });

  it('gives number fields a number control with their step', () => {
    expect(getNodeFields(nodeOf('llm-call')).map((field) => field.control)).toEqual([
      { kind: 'choice', options: [{ value: 'mock', label: 'Mock (no API key)' }] },
      { kind: 'text', multiline: false },
      { kind: 'number', step: 0.1 },
      { kind: 'number', step: 1 },
    ]);
  });

  it('marks a field that does not apply to the current data', () => {
    const transform = createNode('transform', { id: 't', label: 'T', position: ORIGIN });
    const applies = (node: PipelineNode) =>
      Object.fromEntries(getNodeFields(node).map((field) => [field.name, field.applies]));

    expect(applies(transform)).toEqual({ operation: true, path: false });
    expect(applies({ ...transform, data: { operation: 'get-field', path: '' } })).toEqual({
      operation: true,
      path: true,
    });
  });

  it.each(NODE_KINDS)('labels every field and option of "%s"', (kind) => {
    for (const field of getNodeFields(nodeOf(kind))) {
      expect(field.label).not.toBe('');
      if (field.control.kind !== 'choice') continue;
      for (const option of field.control.options) expect(option.label).not.toBe(option.value);
    }
  });
});

describe('describeFields', () => {
  it('labels an option by its value when the presentation has none for it', () => {
    const schema = z.object({ speed: z.enum(['fast', 'slow']) });
    const fields = { speed: { label: 'Speed', optionLabels: { fast: 'Fast' } } };
    const [speed] = describeFields(testDefinition(schema, fields, { speed: 'fast' }), {
      speed: 'fast',
    });
    expect(speed?.control).toEqual({
      kind: 'choice',
      options: [
        { value: 'fast', label: 'Fast' },
        { value: 'slow', label: 'slow' },
      ],
    });
  });

  it('rejects a field schema that no control can edit', () => {
    const schema = z.object({ flag: z.boolean() });
    const definition = testDefinition(schema, { flag: { label: 'Flag' } }, { flag: true });
    expect(() => describeFields(definition, { flag: true })).toThrow(
      'Field "flag" has a schema the properties form cannot edit',
    );
  });

  it('rejects a field without a presentation', () => {
    const schema = z.object({ flag: z.boolean() });
    // @ts-expect-error -- a definition that misses a field, as only a type error would allow.
    const definition = testDefinition(schema, {}, { flag: true });
    expect(() => describeFields(definition, { flag: true })).toThrow(
      'Field "flag" of Test has no presentation',
    );
  });
});
