import * as z from 'zod';

import type { NodePorts } from '../ports';
import { isBlank, NUMBER_MESSAGE, REQUIRED_MESSAGE } from './field-rules';
import type { NodeDefinition } from './node-definition';

/** Providers an LLM Call node can send its prompt to, in the order the form lists them. */
export const LLM_PROVIDERS = ['mock', 'anthropic', 'openai'] as const;

/**
 * Provider an LLM Call node sends its prompt to: `mock` streams sample text without an API key,
 * `anthropic` and `openai` call the real APIs with the user's key.
 */
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Data of an LLM Call node. */
export interface LlmCallNodeData {
  readonly provider: LlmProvider;
  /** Model id passed to the provider; the built-in mock provider accepts any value. */
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
}

/** What the app knows about a provider. */
export interface LlmProviderInfo {
  /** Name shown to the user ("Anthropic"). */
  readonly title: string;
  /** Whether a request needs the user's API key. */
  readonly needsApiKey: boolean;
  /** Model an LLM Call gets when it switches to the provider: a small, inexpensive chat model. */
  readonly defaultModel: string;
}

/** Title, API key need and default model of every provider. */
export const LLM_PROVIDER_INFO: Readonly<Record<LlmProvider, LlmProviderInfo>> = {
  mock: { title: 'Mock', needsApiKey: false, defaultModel: 'mock' },
  anthropic: { title: 'Anthropic', needsApiKey: true, defaultModel: 'claude-haiku-5-5' },
  openai: { title: 'OpenAI', needsApiKey: true, defaultModel: 'gpt-6-luna' },
};

/** Whether `value` is the id of a provider. */
export function isLlmProvider(value: unknown): value is LlmProvider {
  return LLM_PROVIDERS.some((provider) => provider === value);
}

/**
 * The data changes that switch an LLM Call to `provider`. A blank model, or the old provider's
 * default, becomes the new provider's default; a model the user chose is kept. Apply them as one
 * change, so that one undo restores both fields.
 */
export function llmProviderChanges(
  data: LlmCallNodeData,
  provider: LlmProvider,
): Partial<LlmCallNodeData> {
  const followsProvider =
    isBlank(data.model) || data.model === LLM_PROVIDER_INFO[data.provider].defaultModel;
  const model = LLM_PROVIDER_INFO[provider].defaultModel;
  return followsProvider && model !== data.model ? { provider, model } : { provider };
}

/** Largest `maxTokens` an LLM Call node accepts. */
export const LLM_MAX_TOKENS_LIMIT = 32_768;

export const LLM_CALL_DATA_SCHEMA = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
});

const TEMPERATURE_MESSAGE = 'Must be from 0 to 2';
const MAX_TOKENS_MESSAGE = `Must be a whole number from 1 to ${String(LLM_MAX_TOKENS_LIMIT)}`;

export const LLM_CALL_RULES_SCHEMA = LLM_CALL_DATA_SCHEMA.extend({
  model: z.string().refine((model) => !isBlank(model), REQUIRED_MESSAGE),
  temperature: z.number(NUMBER_MESSAGE).min(0, TEMPERATURE_MESSAGE).max(2, TEMPERATURE_MESSAGE),
  maxTokens: z
    .number(NUMBER_MESSAGE)
    .int(MAX_TOKENS_MESSAGE)
    .min(1, MAX_TOKENS_MESSAGE)
    .max(LLM_MAX_TOKENS_LIMIT, MAX_TOKENS_MESSAGE),
});

const PORTS: NodePorts = {
  inputs: [
    { id: 'prompt', label: 'prompt', type: 'text', required: true },
    { id: 'system', label: 'system prompt', type: 'text', required: false },
  ],
  outputs: [{ id: 'response', label: 'response', type: 'text', required: false }],
};

/** Titles of the providers that need the user's API key, as a list ("Anthropic or OpenAI"). */
const KEYED_PROVIDERS = orList(
  LLM_PROVIDERS.filter((provider) => LLM_PROVIDER_INFO[provider].needsApiKey).map(
    (provider) => LLM_PROVIDER_INFO[provider].title,
  ),
);

/** "A", "A or B", "A, B or C". */
function orList(items: readonly string[]): string {
  return [items.slice(0, -1).join(', '), ...items.slice(-1)]
    .filter((part) => part !== '')
    .join(' or ');
}

/** Sends a prompt to a language model and returns its response. */
export const LLM_CALL_DEFINITION: NodeDefinition<LlmCallNodeData> = {
  title: 'LLM Call',
  description: 'Sends the prompt to a language model and streams back its response.',
  createData: () => ({ provider: 'mock', model: 'mock', temperature: 0.7, maxTokens: 512 }),
  getPorts: () => PORTS,
  dataSchema: LLM_CALL_DATA_SCHEMA,
  rulesSchema: LLM_CALL_RULES_SCHEMA,
  fields: {
    provider: {
      label: 'Provider',
      description: `Mock streams sample text. Your API key for ${KEYED_PROVIDERS} is sent only to this app’s own proxy.`,
      optionLabels: Object.fromEntries(
        LLM_PROVIDERS.map((provider) => {
          const { title, needsApiKey } = LLM_PROVIDER_INFO[provider];
          return [provider, `${title} (${needsApiKey ? 'your API key' : 'no API key'})`];
        }),
      ),
    },
    model: {
      label: 'Model',
      description:
        'The provider’s model id. Switching the provider replaces a blank or default model with the new provider’s default. Mock accepts any.',
    },
    temperature: {
      label: 'Temperature',
      description: 'From 0 (focused) to 2 (varied).',
      step: 0.1,
    },
    maxTokens: { label: 'Max tokens', description: 'Longest response, in tokens.', step: 1 },
  },
};
