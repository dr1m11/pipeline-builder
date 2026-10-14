import type { LlmErrorCode } from '@pipeline-builder/core';
import type { Context } from 'hono';

/** HTTP statuses of the API's error responses. */
export type ApiErrorStatus = 400 | 404 | 413 | 429 | 500;

/**
 * An API error that happens before any streaming starts, as the JSON body every such error uses:
 * `{ "error": { "code": LlmErrorCode, "message": string } }`. The message is for the user and never
 * repeats the request's headers or body.
 */
export function apiError(
  c: Context,
  status: ApiErrorStatus,
  code: LlmErrorCode,
  message: string,
): Response {
  return c.json({ error: { code, message } }, status);
}
