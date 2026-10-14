import { assertNever, LlmError, type LlmErrorCode } from '@pipeline-builder/core';

/** What a provider's failure means for the user (a timeout is the proxy's own finding). */
export type UpstreamFailureCode = Extract<
  LlmErrorCode,
  'invalid-key' | 'rate-limited' | 'bad-request' | 'upstream-error'
>;

/**
 * What the proxy may say about an upstream failure: the HTTP status, and the provider's error type
 * or code (such as `overloaded_error` or `insufficient_quota`) when it has one.
 */
export interface UpstreamFailure {
  readonly status?: number;
  readonly type?: string | undefined;
}

/**
 * The error code of an upstream HTTP status: 401 and 403 mean the key was refused, 429 that the
 * provider asks to slow down, any other 4xx that it refused the request; 5xx (with Anthropic's 529
 * "overloaded") and anything else are its own failure.
 */
export function errorCodeForStatus(status: number): UpstreamFailureCode {
  if (status === 401 || status === 403) return 'invalid-key';
  if (status === 429) return 'rate-limited';
  if (status >= 400 && status < 500) return 'bad-request';
  return 'upstream-error';
}

// An error type is quoted only when it looks like one: lowercase words joined by underscores.
// Nothing else from an upstream error goes into a message, as its text can echo the request.
const ERROR_TYPE = /^[a-z]+(?:_[a-z]+)*$/;
const ERROR_TYPE_MAX_LENGTH = 64;

/**
 * An `LlmError` for an upstream failure, with a fixed message for its code that names the provider
 * and, in parentheses, the HTTP status and the provider's error type. The provider's own message
 * is never quoted: it can repeat parts of the request, or of the key.
 */
export function upstreamError(
  title: string,
  code: UpstreamFailureCode,
  { status, type }: UpstreamFailure = {},
): LlmError {
  const facts = [
    ...(status === undefined ? [] : [`HTTP ${String(status)}`]),
    ...(type !== undefined && type.length <= ERROR_TYPE_MAX_LENGTH && ERROR_TYPE.test(type)
      ? [type]
      : []),
  ];
  const said = facts.length === 0 ? '' : ` (${facts.join(', ')})`;
  return new LlmError(code, upstreamMessage(title, code, said));
}

/** The provider declined to answer: a refusal, or its content filter stopped the answer. */
export function refusalError(title: string): LlmError {
  return new LlmError('bad-request', `${title} declined to answer this prompt.`);
}

/**
 * The answer reached the token limit before any text: thinking used up the tokens, or the limit is
 * very small.
 */
export function tokenLimitError(title: string): LlmError {
  return new LlmError(
    'bad-request',
    `${title} used up Max tokens before writing an answer. Raise Max tokens and try again.`,
  );
}

function upstreamMessage(title: string, code: UpstreamFailureCode, said: string): string {
  switch (code) {
    case 'invalid-key':
      return `${title} rejected the API key${said}. Check the key and try again.`;
    case 'rate-limited':
      return `${title} is limiting requests with this API key${said}. Wait a minute and try again.`;
    case 'bad-request':
      return `${title} rejected the request${said}. Check the model and Max tokens.`;
    case 'upstream-error':
      return `${title} failed to answer${said}. Try again later.`;
    default:
      return assertNever(code);
  }
}
