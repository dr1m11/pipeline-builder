import { createNode } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { nodeFormSchema, toFormValues } from './form-schema';

/** Messages of the form `values` of a `kind` node, by field path. */
function messages(kind: Parameters<typeof nodeFormSchema>[0], values: unknown) {
  const result = nodeFormSchema(kind).safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('nodeFormSchema', () => {
  it('is built once per kind', () => {
    expect(nodeFormSchema('prompt')).toBe(nodeFormSchema('prompt'));
    expect(nodeFormSchema('prompt')).not.toBe(nodeFormSchema('output'));
  });

  it('accepts a node that follows every rule', () => {
    const node = createNode('llm-call', {
      id: 'llm',
      label: 'LLM Call 1',
      position: { x: 0, y: 0 },
    });
    expect(messages('llm-call', toFormValues(node))).toEqual({});
  });

  it('reports the rules of the label and of the data by field', () => {
    expect(
      messages('llm-call', {
        label: '  ',
        data: { model: 'mock', temperature: 5, maxTokens: Number.NaN },
      }),
    ).toEqual({
      label: 'Required',
      'data.temperature': 'Must be from 0 to 2',
      'data.maxTokens': 'Must be a number',
    });
  });

  it('checks fields against the current values of the others', () => {
    expect(messages('transform', { label: 'T', data: { operation: 'trim', path: '' } })).toEqual(
      {},
    );
    expect(
      messages('transform', { label: 'T', data: { operation: 'get-field', path: '' } }),
    ).toEqual({ 'data.path': 'Required' });
  });

  it('trims the label it checks', () => {
    const parsed = nodeFormSchema('output').parse({ label: ' Result ', data: { format: 'text' } });
    expect(parsed.label).toBe('Result');
  });
});

describe('toFormValues', () => {
  it('copies the label and the data fields', () => {
    const node = createNode('prompt', { id: 'p', label: 'Prompt 1', position: { x: 0, y: 0 } });
    const values = toFormValues(node);
    expect(values).toEqual({ label: 'Prompt 1', data: { template: node.data.template } });
    expect(values.data).not.toBe(node.data);
  });
});
