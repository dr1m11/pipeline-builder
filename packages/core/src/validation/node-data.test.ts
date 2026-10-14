import { describe, expect, it } from 'vitest';

import { createNode, type PipelineNode } from '../nodes/registry';
import { fieldProblems } from './node-data';

const ORIGIN = { x: 0, y: 0 };

describe('fieldProblems', () => {
  it('finds nothing in data that follows the rules', () => {
    expect(
      fieldProblems(createNode('llm-call', { id: 'l', label: 'L', position: ORIGIN })),
    ).toEqual([]);
  });

  it('names the field before the rule message, one problem per field', () => {
    const llm: PipelineNode = {
      ...createNode('llm-call', { id: 'l', label: 'L', position: ORIGIN }),
      data: { provider: 'mock', model: '', temperature: 3, maxTokens: -1.5 },
    };
    expect(fieldProblems(llm)).toEqual([
      { field: 'model', message: 'Model: Required' },
      { field: 'temperature', message: 'Temperature: Must be from 0 to 2' },
      { field: 'maxTokens', message: 'Max tokens: Must be a whole number from 1 to 32768' },
    ]);
  });

  it('checks each data object once', () => {
    const input = createNode('input', { id: 'i', label: 'I', position: ORIGIN });
    const moved = { ...input, position: { x: 5, y: 5 } };
    expect(fieldProblems(moved)).toBe(fieldProblems(input));
    expect(fieldProblems({ ...input, data: { ...input.data } })).not.toBe(fieldProblems(input));
  });
});
