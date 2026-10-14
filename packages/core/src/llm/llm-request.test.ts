import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  LLM_CALL_DEFINITION,
  LLM_CALL_RULES_SCHEMA,
  LLM_PROVIDERS,
  type LlmCallNodeData,
  type LlmProvider,
} from '../nodes/llm-call';
import { LLM_REQUEST_SCHEMA, type LlmRequest } from './llm-request';

const WITHOUT_SYSTEM: LlmRequest = {
  ...LLM_CALL_DEFINITION.createData(),
  prompt: 'Why is the sky blue?',
};

const REQUEST: LlmRequest = { ...WITHOUT_SYSTEM, system: 'Answer in one sentence.' };

/** Rule messages for `REQUEST` with `changes` applied, by field. */
function ruleMessages(changes: Readonly<Record<string, unknown>>) {
  const result = LLM_REQUEST_SCHEMA.safeParse({ ...REQUEST, ...changes });
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('LLM_REQUEST_SCHEMA', () => {
  it('describes exactly the LLM request type', () => {
    expectTypeOf<LlmRequest>().toExtend<z.output<typeof LLM_REQUEST_SCHEMA>>();
    expectTypeOf<z.output<typeof LLM_REQUEST_SCHEMA>>().toExtend<LlmRequest>();
    expectTypeOf<z.output<typeof LLM_REQUEST_SCHEMA>['provider']>().toEqualTypeOf<LlmProvider>();
  });

  it('accepts a request with or without a system prompt', () => {
    expect(LLM_REQUEST_SCHEMA.parse(REQUEST)).toEqual(REQUEST);
    expect(LLM_REQUEST_SCHEMA.parse(WITHOUT_SYSTEM)).toEqual(WITHOUT_SYSTEM);
    expect(ruleMessages({ system: '' })).toEqual({});
  });

  it.each(LLM_PROVIDERS)('accepts the provider "%s"', (provider) => {
    expect(ruleMessages({ provider })).toEqual({});
  });

  it('drops fields it does not know', () => {
    expect(LLM_REQUEST_SCHEMA.parse({ ...REQUEST, apiKey: 'secret' })).toEqual(REQUEST);
  });

  it('requires a prompt that is not blank', () => {
    expect(ruleMessages({ prompt: ' \n' })).toEqual({ prompt: ['Required'] });
    expect(ruleMessages({ prompt: undefined })).toEqual({
      prompt: ['Invalid input: expected string, received undefined'],
    });
  });

  it('rejects a system prompt that is present but not text', () => {
    expect(ruleMessages({ system: undefined })).toHaveProperty('system');
    expect(ruleMessages({ system: null })).toHaveProperty('system');
  });

  it('rejects an unknown provider and settings out of range, with the messages of the node', () => {
    expect(
      ruleMessages({ provider: 'unknown', model: ' ', temperature: 2.5, maxTokens: 0 }),
    ).toEqual({
      provider: [expect.any(String)],
      model: ['Required'],
      temperature: ['Must be from 0 to 2'],
      maxTokens: ['Must be a whole number from 1 to 32768'],
    });
  });

  it.each<Partial<LlmCallNodeData>>([
    {},
    { model: '' },
    { temperature: 0 },
    { temperature: 2 },
    { temperature: -0.1 },
    { temperature: 2.1 },
    { temperature: Number.NaN },
    { maxTokens: 1 },
    { maxTokens: 32_768 },
    { maxTokens: 32_769 },
    { maxTokens: 0.5 },
  ])('agrees with the rules of the LLM Call node on %o', (changes) => {
    const settings = { ...LLM_CALL_DEFINITION.createData(), ...changes };

    expect(LLM_REQUEST_SCHEMA.safeParse({ ...REQUEST, ...settings }).success).toBe(
      LLM_CALL_RULES_SCHEMA.safeParse(settings).success,
    );
  });
});
