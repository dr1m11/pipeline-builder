import * as z from 'zod';

import { isBlank, REQUIRED_MESSAGE } from '../nodes/field-rules';
import { LLM_CALL_RULES_SCHEMA, type LlmProvider } from '../nodes/llm-call';

/** What an LLM Call node asks a language model: its settings and the prompts it received. */
export interface LlmRequest {
  readonly provider: LlmProvider;
  readonly model: string;
  /** The user's message. */
  readonly prompt: string;
  /** Instructions for the model; absent when the node's system prompt input gets no value. */
  readonly system?: string;
  readonly temperature: number;
  readonly maxTokens: number;
}

/** Longest prompt or system prompt, in characters, that an `LlmRequest` may carry. */
export const LLM_PROMPT_MAX_LENGTH = 100_000;

// The settings follow the rules of the LLM Call node field by field, with the same messages, so
// settings that pass the node's validation always pass here too.
const { provider, model, temperature, maxTokens } = LLM_CALL_RULES_SCHEMA.shape;

// Keeps the proxy's work bounded: the request body comes from anyone who can reach it.
const promptText = z
  .string()
  .max(LLM_PROMPT_MAX_LENGTH, `Must be at most ${String(LLM_PROMPT_MAX_LENGTH)} characters`);

/**
 * Checks an `LlmRequest`, such as the body the proxy receives. Provider, model, temperature and
 * max tokens follow the rules of the LLM Call node; the prompt must not be blank; the system prompt
 * is optional, but not `undefined` when present; neither is longer than `LLM_PROMPT_MAX_LENGTH`.
 * Unknown fields are dropped.
 */
export const LLM_REQUEST_SCHEMA = z.object({
  provider,
  model,
  prompt: promptText.refine((prompt) => !isBlank(prompt), REQUIRED_MESSAGE),
  system: promptText.exactOptional(),
  temperature,
  maxTokens,
});
