import type { LlmErrorCode, LlmErrorResponse } from '@pipeline-builder/core';
import type { Context } from 'hono';

/** HTTP statuses of the API's error responses. */
export type ApiErrorStatus = 400 | 401 | 404 | 413 | 429 | 500;

/**
 * An API error that happens before any streaming starts, with the body every such error has: an
 * `LlmErrorResponse`, which the web client reads with `LLM_ERROR_RESPONSE_SCHEMA`. The message is
 * for the user and never repeats the request's headers or body.
 */
export function apiError(
  c: Context,
  status: ApiErrorStatus,
  code: LlmErrorCode,
  message: string,
): Response {
  const body: LlmErrorResponse = { error: { code, message } };
  return c.json(body, status);
}
