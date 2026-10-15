import type { LlmProvider, LlmRequest } from '@pipeline-builder/core';

/** What the proxy gives a provider besides the request. */
export interface ProviderContext {
  /** Aborts when the client disconnects: the provider stops streaming and lets go of upstream. */
  readonly signal: AbortSignal;
  /**
   * The user's API key, from the `Authorization: Bearer` header of the proxy request. Only a
   * provider that needs one (`LLM_PROVIDER_INFO`) gets it, and the proxy has checked that it is
   * not blank. It goes to that provider's API and nowhere else: never into a log, an error message
   * or an error's cause.
   */
  readonly apiKey?: string;
}

/** A source of model answers the stream endpoint can use. */
export interface Provider {
  /**
   * Streams the answer to `request` as text chunks, in order. Throws `LlmError` when the provider
   * fails; any other error is reported as `upstream-error`. Stops early, by ending or by throwing,
   * once `context.signal` aborts.
   */
  stream(request: LlmRequest, context: ProviderContext): AsyncIterable<string>;
}

/** Providers by id. A request to a provider missing here gets an `error` event. */
export type Providers = Readonly<Partial<Record<LlmProvider, Provider>>>;
