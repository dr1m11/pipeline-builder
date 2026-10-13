import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  LLM_CALL_DATA_SCHEMA,
  LLM_CALL_DEFINITION,
  LLM_CALL_RULES_SCHEMA,
  type LlmCallNodeData,
} from './llm-call';

const DEFAULTS = LLM_CALL_DEFINITION.createData();

/** Rule messages for the default data with `changes` applied, by field. */
function ruleMessages(changes: Partial<LlmCallNodeData>) {
  const result = LLM_CALL_RULES_SCHEMA.safeParse({ ...DEFAULTS, ...changes });
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('LLM_CALL_DEFINITION', () => {
  it('starts with the mock model and moderate settings', () => {
    expect(DEFAULTS).toEqual({ model: 'mock', temperature: 0.7, maxTokens: 512 });
  });

  it('requires a text prompt, accepts an optional system prompt and outputs text', () => {
    expect(LLM_CALL_DEFINITION.getPorts(DEFAULTS)).toEqual({
      inputs: [
        { id: 'prompt', label: 'prompt', type: 'text', required: true },
        { id: 'system', label: 'system prompt', type: 'text', required: false },
      ],
      outputs: [{ id: 'response', label: 'response', type: 'text', required: false }],
    });
  });
});

describe('LLM_CALL_DATA_SCHEMA', () => {
  it('describes exactly the LLM Call data type', () => {
    expectTypeOf<LlmCallNodeData>().toExtend<z.output<typeof LLM_CALL_DATA_SCHEMA>>();
    expectTypeOf<z.output<typeof LLM_CALL_DATA_SCHEMA>>().toExtend<LlmCallNodeData>();
    expectTypeOf<z.output<typeof LLM_CALL_RULES_SCHEMA>>().toExtend<LlmCallNodeData>();
  });

  it('accepts out-of-range settings but not numbers that are not finite', () => {
    expect(LLM_CALL_DATA_SCHEMA.safeParse({ ...DEFAULTS, temperature: 5 }).success).toBe(true);
    for (const temperature of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(LLM_CALL_DATA_SCHEMA.safeParse({ ...DEFAULTS, temperature }).success).toBe(false);
    }
  });
});

describe('LLM_CALL_RULES_SCHEMA', () => {
  it('accepts the default settings', () => {
    expect(ruleMessages({})).toEqual({});
  });

  it('requires a model that is not blank', () => {
    expect(ruleMessages({ model: ' ' })).toEqual({ model: ['Required'] });
  });

  it.each([0, 2])('accepts the temperature %d', (temperature) => {
    expect(ruleMessages({ temperature })).toEqual({});
  });

  it.each([-0.1, 2.1])('rejects the temperature %d', (temperature) => {
    expect(ruleMessages({ temperature })).toEqual({ temperature: ['Must be from 0 to 2'] });
  });

  it.each([1, 32_768])('accepts %d max tokens', (maxTokens) => {
    expect(ruleMessages({ maxTokens })).toEqual({});
  });

  it.each([0, 32_769, 1.5])('rejects %d max tokens', (maxTokens) => {
    expect(ruleMessages({ maxTokens })).toEqual({
      maxTokens: ['Must be a whole number from 1 to 32768'],
    });
  });

  it('asks for a number when a field holds none', () => {
    expect(ruleMessages({ temperature: Number.NaN })).toEqual({
      temperature: ['Must be a number'],
    });
  });
});
