import { LLM_PROVIDER_INFO, LLM_PROVIDERS, type LlmProvider } from '@pipeline-builder/core';

/** Providers that run with the user's own API key, in the order the app lists providers. */
export const API_KEY_PROVIDERS: readonly LlmProvider[] = LLM_PROVIDERS.filter(
  (provider) => LLM_PROVIDER_INFO[provider].needsApiKey,
);
