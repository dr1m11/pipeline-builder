import * as z from 'zod';

/** Reasons an LLM request can fail, in the order `LlmErrorCode` describes them. */
export const LLM_ERROR_CODES = [
  'bad-request',
  'invalid-key',
  'rate-limited',
  'upstream-error',
  'timeout',
  'network',
] as const;

/**
 * Why an LLM request failed:
 *
 * - `bad-request` — the request breaks the rules of `LLM_REQUEST_SCHEMA`, or the provider refused it;
 * - `invalid-key` — the provider needs an API key and got none, or rejected it;
 * - `rate-limited` — the proxy or the provider asks to slow down;
 * - `upstream-error` — the provider failed or answered something unexpected;
 * - `timeout` — the provider took too long to answer;
 * - `network` — the proxy could not be reached or the stream broke off. Only the client raises it;
 *   the proxy never sends it.
 */
export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

/**
 * Body of the JSON error response the proxy sends when it refuses a request before the stream
 * starts (a request that breaks the rules, too many requests); errors during the stream arrive as
 * `error` stream events instead.
 */
export interface LlmErrorResponse {
  readonly error: { readonly code: LlmErrorCode; readonly message: string };
}

/**
 * Checks an `LlmErrorResponse`: the proxy writes its error bodies with it and the client reads them
 * with it. Unknown fields are dropped.
 */
export const LLM_ERROR_RESPONSE_SCHEMA = z.object({
  error: z.object({ code: z.enum(LLM_ERROR_CODES), message: z.string() }),
});

/**
 * Failure of an LLM request, thrown by an `LlmClient`. The message is meant for the user and never
 * contains the API key.
 */
export class LlmError extends Error {
  override readonly name = 'LlmError';
  readonly code: LlmErrorCode;

  constructor(code: LlmErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
