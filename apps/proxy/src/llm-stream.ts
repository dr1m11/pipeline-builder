import {
  err,
  formatLlmStreamEvent,
  LLM_PROMPT_MAX_LENGTH,
  LLM_PROVIDER_INFO,
  LLM_REQUEST_SCHEMA,
  LlmError,
  type LlmRequest,
  type LlmStreamEvent,
  ok,
  type Result,
} from '@pipeline-builder/core';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';

import { apiError } from './api-error';
import type { Bindings } from './bindings';
import type { Provider, Providers } from './providers/provider';

type AppContext = Context<{ Bindings: Bindings }>;

/**
 * Largest request body the stream endpoint reads, in bytes: a prompt and a system prompt of
 * `LLM_PROMPT_MAX_LENGTH` characters each at 4 bytes per character (UTF-8 takes at most 3 for a
 * character of the Basic Multilingual Plane), and room for the other fields.
 */
export const MAX_REQUEST_BYTES = 2 * LLM_PROMPT_MAX_LENGTH * 4 + 64 * 1024;

/** Answers 413 to a body larger than `MAX_REQUEST_BYTES`, before anything parses it. */
export const limitRequestBody = bodyLimit({
  maxSize: MAX_REQUEST_BYTES,
  onError: (c) =>
    apiError(
      c,
      413,
      'bad-request',
      `The request body is larger than ${String(Math.floor(MAX_REQUEST_BYTES / 1024))} KB`,
    ),
});

/**
 * Handles `POST /api/llm/stream`. It checks the rate limits and the body, an `LlmRequest` as JSON,
 * and answers a failed check with a JSON error (400 or 429). Then it streams the provider's answer
 * as SSE `LlmStreamEvent`s (`Content-Type: text/event-stream`), which always end with `done` or
 * `error` unless the client disconnects; a disconnect stops the provider.
 */
export function createLlmStreamHandler(providers: Providers) {
  return async (c: AppContext): Promise<Response> => {
    const client = clientAddress(c);
    if (!(await c.env.LLM_RATE_LIMITER.limit({ key: client })).success) return rateLimited(c);

    const request = await readLlmRequest(c);
    if (!request.ok) return apiError(c, 400, 'bad-request', request.error);

    // A provider that needs the user's key calls a real model: it gets the stricter limit too.
    const { needsApiKey } = LLM_PROVIDER_INFO[request.value.provider];
    if (needsApiKey && !(await c.env.REAL_PROVIDER_RATE_LIMITER.limit({ key: client })).success) {
      return rateLimited(c);
    }

    const provider = providers[request.value.provider];
    return streamSSE(c, async (stream) => {
      const disconnect = new AbortController();
      stream.onAbort(() => {
        disconnect.abort();
      });
      for await (const event of answerEvents(provider, request.value, disconnect.signal)) {
        await stream.writeSSE(formatLlmStreamEvent(event));
      }
    });
  };
}

// The key of both rate limits. Cloudflare sets the header on every request it forwards.
function clientAddress(c: AppContext): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

function rateLimited(c: AppContext): Response {
  return apiError(c, 429, 'rate-limited', 'Too many requests. Wait a minute and try again.');
}

async function readLlmRequest(c: AppContext): Promise<Result<LlmRequest, string>> {
  // Only JSON: a cross-site form or a no-cors fetch cannot send it without a CORS preflight,
  // which this API never allows.
  const mediaType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return err('The request body must be JSON (Content-Type: application/json)');
  }

  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    return err('The request body is not valid JSON');
  }

  const parsed = LLM_REQUEST_SCHEMA.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(({ path, message }) =>
      path.length === 0 ? message : `${path.map(String).join('.')}: ${message}`,
    );
    return err(`The request is invalid (${issues.join('; ')})`);
  }
  return ok(parsed.data);
}

/**
 * The events of a provider's answer: its chunks as `token`s, then `done`, or an `error` when the
 * provider is not available or fails. Nothing more once `signal` aborts: the client is gone.
 */
async function* answerEvents(
  provider: Provider | undefined,
  request: LlmRequest,
  signal: AbortSignal,
): AsyncGenerator<LlmStreamEvent, void, undefined> {
  if (provider === undefined) {
    const { title } = LLM_PROVIDER_INFO[request.provider];
    yield { type: 'error', code: 'bad-request', message: `${title} is not available yet` };
    return;
  }

  try {
    for await (const text of provider.stream(request, { signal })) {
      if (signal.aborted) return;
      yield { type: 'token', text };
    }
  } catch (error) {
    if (!signal.aborted) yield providerError(error);
    return;
  }
  if (!signal.aborted) yield { type: 'done' };
}

// An `LlmError` keeps its code and message (`network` is the client's code, never the proxy's);
// anything else is reported without its message, which may hold details of the upstream request.
function providerError(error: unknown): LlmStreamEvent {
  if (!(error instanceof LlmError)) {
    return { type: 'error', code: 'upstream-error', message: 'The provider failed unexpectedly' };
  }
  const code = error.code === 'network' ? 'upstream-error' : error.code;
  return { type: 'error', code, message: error.message };
}
