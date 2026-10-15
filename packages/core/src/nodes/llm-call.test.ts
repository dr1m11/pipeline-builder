import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  isLlmProvider,
  LLM_CALL_DATA_SCHEMA,
  LLM_CALL_DEFINITION,
  LLM_CALL_RULES_SCHEMA,
  LLM_MODEL_MAX_LENGTH,
  LLM_PROVIDER_INFO,
  LLM_PROVIDERS,
  type LlmCallNodeData,
  type LlmProvider,
  llmProviderChanges,
} from './llm-call';

const DEFAULTS = LLM_CALL_DEFINITION.createData();

/** Rule messages for the default data with `changes` applied, by field. */
function ruleMessages(changes: Partial<LlmCallNodeData>) {
  const result = LLM_CALL_RULES_SCHEMA.safeParse({ ...DEFAULTS, ...changes });
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe('LLM_PROVIDERS', () => {
  it('offers the mock provider first, then Anthropic and OpenAI', () => {
    expect(LLM_PROVIDERS).toEqual(['mock', 'anthropic', 'openai']);
  });
});

describe('LLM_PROVIDER_INFO', () => {
  it('describes every provider', () => {
    expect(Object.keys(LLM_PROVIDER_INFO).sort()).toEqual([...LLM_PROVIDERS].sort());
  });

  it('runs the mock provider without an API key and its default model', () => {
    expect(LLM_PROVIDER_INFO.mock).toEqual({
      title: 'Mock',
      needsApiKey: false,
      defaultModel: DEFAULTS.model,
    });
  });

  it('needs an API key for the real providers and picks a small model of each', () => {
    expect(LLM_PROVIDER_INFO.anthropic).toEqual({
      title: 'Anthropic',
      needsApiKey: true,
      defaultModel: 'claude-haiku-5-5',
    });
    expect(LLM_PROVIDER_INFO.openai).toEqual({
      title: 'OpenAI',
      needsApiKey: true,
      defaultModel: 'gpt-6-luna',
    });
  });

  it.each(LLM_PROVIDERS)('gives "%s" a default model that passes the rules', (provider) => {
    expect(ruleMessages({ provider, model: LLM_PROVIDER_INFO[provider].defaultModel })).toEqual({});
  });
});

describe('isLlmProvider', () => {
  it('accepts every provider', () => {
    for (const provider of LLM_PROVIDERS) expect(isLlmProvider(provider)).toBe(true);
  });

  it('rejects unknown values', () => {
    for (const value of ['gemini', 'Anthropic', '', 'toString', 0, null, undefined]) {
      expect(isLlmProvider(value)).toBe(false);
    }
  });
});

describe('llmProviderChanges', () => {
  const data = (provider: LlmProvider, model: string): LlmCallNodeData => ({
    ...DEFAULTS,
    provider,
    model,
  });

  it('moves the default model of the old provider to the default of the new one', () => {
    expect(llmProviderChanges(DEFAULTS, 'anthropic')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
    expect(llmProviderChanges(data('anthropic', 'claude-haiku-5-5'), 'openai')).toEqual({
      provider: 'openai',
      model: 'gpt-6-luna',
    });
    expect(llmProviderChanges(data('openai', 'gpt-6-luna'), 'mock')).toEqual({
      provider: 'mock',
      model: 'mock',
    });
  });

  it.each(['', '  '])('fills the blank model "%s" with the new default', (model) => {
    expect(llmProviderChanges(data('mock', model), 'openai')).toEqual({
      provider: 'openai',
      model: 'gpt-6-luna',
    });
  });

  it('keeps a model the user chose', () => {
    expect(llmProviderChanges(data('anthropic', 'claude-opus-5-5'), 'openai')).toEqual({
      provider: 'openai',
    });
    // The default of another provider than the old one is a choice too.
    expect(llmProviderChanges(data('mock', 'gpt-6-luna'), 'anthropic')).toEqual({
      provider: 'anthropic',
    });
  });

  it('changes only the provider when the model is already the new default', () => {
    expect(llmProviderChanges(DEFAULTS, 'mock')).toEqual({ provider: 'mock' });
  });
});

describe('LLM_CALL_DEFINITION', () => {
  it('starts with the mock provider and model and moderate settings', () => {
    expect(DEFAULTS).toEqual({ provider: 'mock', model: 'mock', temperature: 0.7, maxTokens: 512 });
  });

  it('asks for the provider before the model', () => {
    expect(Object.keys(LLM_CALL_DATA_SCHEMA.shape)).toEqual([
      'provider',
      'model',
      'temperature',
      'maxTokens',
    ]);
  });

  it('labels each provider with whether it needs your API key and says where keys go', () => {
    expect(LLM_CALL_DEFINITION.fields.provider).toEqual({
      label: 'Provider',
      description:
        'Mock streams sample text. Your API key for Anthropic or OpenAI is sent only to this app’s own proxy.',
      optionLabels: {
        mock: 'Mock (no API key)',
        anthropic: 'Anthropic (your API key)',
        openai: 'OpenAI (your API key)',
      },
    });
  });

  it('says which models follow a provider switch', () => {
    expect(LLM_CALL_DEFINITION.fields.model).toEqual({
      label: 'Model',
      description:
        'The provider’s model id. Switching the provider replaces a blank or default model with the new provider’s default. Mock accepts any.',
    });
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
    expectTypeOf<LlmCallNodeData>().toExtend<z.output<typeof LLM_CALL_RULES_SCHEMA>>();
    expectTypeOf<z.output<typeof LLM_CALL_RULES_SCHEMA>>().toExtend<LlmCallNodeData>();
    expectTypeOf<z.output<typeof LLM_CALL_DATA_SCHEMA>['provider']>().toEqualTypeOf<LlmProvider>();
  });

  it('accepts every provider and nothing else', () => {
    for (const provider of LLM_PROVIDERS) {
      expect(LLM_CALL_DATA_SCHEMA.safeParse({ ...DEFAULTS, provider }).success).toBe(true);
    }
    expect(LLM_CALL_DATA_SCHEMA.safeParse({ ...DEFAULTS, provider: 'gemini' }).success).toBe(false);
    const withoutProvider = { model: 'mock', temperature: 0.7, maxTokens: 512 };
    expect(LLM_CALL_DATA_SCHEMA.safeParse(withoutProvider).success).toBe(false);
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

  it.each(LLM_PROVIDERS)('accepts the provider "%s"', (provider) => {
    expect(ruleMessages({ provider })).toEqual({});
  });

  it('requires a model that is not blank', () => {
    expect(ruleMessages({ model: ' ' })).toEqual({ model: ['Required'] });
  });

  it('accepts a model id of up to 200 characters and rejects a longer one', () => {
    expect(LLM_MODEL_MAX_LENGTH).toBe(200);
    expect(ruleMessages({ model: 'm'.repeat(LLM_MODEL_MAX_LENGTH) })).toEqual({});
    expect(ruleMessages({ model: 'm'.repeat(LLM_MODEL_MAX_LENGTH + 1) })).toEqual({
      model: ['Must be at most 200 characters'],
    });
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
