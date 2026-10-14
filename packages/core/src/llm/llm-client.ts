import type { LlmRequest } from './llm-request';

/**
 * The part of `AbortSignal` that core needs: core has no DOM types, but a DOM `AbortSignal` is
 * assignable to this interface, so callers pass `AbortController.signal` as it is.
 */
export interface AbortSignalLike {
  /** Whether the signal has aborted. */
  readonly aborted: boolean;
  /** Why it aborted; `undefined` until it does. */
  readonly reason: unknown;
  /** Calls `listener` when the signal aborts; never for a signal that has already aborted. */
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** Sends requests to a language model; the web app's client goes through the proxy. */
export interface LlmClient {
  /**
   * Streams the model's answer to `request` as text chunks, in order: joined, they are the whole
   * answer. Throws `LlmError` when the request fails, before or during the stream. When `signal`
   * aborts, the stream stops early, by ending or by throwing, so callers check `signal.aborted` to
   * tell a cancellation from a failure.
   */
  stream(request: LlmRequest, signal: AbortSignalLike): AsyncIterable<string>;
}
