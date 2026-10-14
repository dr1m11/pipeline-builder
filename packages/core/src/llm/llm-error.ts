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
