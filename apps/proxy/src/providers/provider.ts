import type { LlmProvider, LlmRequest } from '@pipeline-builder/core';

/** What the proxy gives a provider besides the request. */
export interface ProviderContext {
  /** Aborts when the client disconnects: the provider stops streaming and lets go of upstream. */
  readonly signal: AbortSignal;
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
