import * as z from 'zod';

import type { NodePorts } from '../ports';
import { isBlank, NUMBER_MESSAGE, REQUIRED_MESSAGE } from './field-rules';
import type { NodeDefinition } from './node-definition';

/** Data of an LLM Call node. */
export interface LlmCallNodeData {
  /** Model id passed to the provider; the built-in mock provider accepts any value. */
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
}

/** Largest `maxTokens` an LLM Call node accepts. */
export const LLM_MAX_TOKENS_LIMIT = 32_768;

export const LLM_CALL_DATA_SCHEMA = z.object({
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

/** Sends a prompt to a language model and returns its response. */
export const LLM_CALL_DEFINITION: NodeDefinition<LlmCallNodeData> = {
  title: 'LLM Call',
  description: 'Sends the prompt to a language model and streams back its response.',
  createData: () => ({ model: 'mock', temperature: 0.7, maxTokens: 512 }),
  getPorts: () => PORTS,
  dataSchema: LLM_CALL_DATA_SCHEMA,
  rulesSchema: LLM_CALL_RULES_SCHEMA,
  fields: {
    model: { label: 'Model', description: 'The mock provider answers for any model.' },
    temperature: {
      label: 'Temperature',
      description: 'From 0 (focused) to 2 (varied).',
      step: 0.1,
    },
    maxTokens: { label: 'Max tokens', description: 'Longest response, in tokens.', step: 1 },
  },
};
