import {
  createSseParser,
  LLM_ERROR_CODES,
  type LlmClient,
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type LlmStreamEvent,
  parseLlmStreamEvent,
  type SseEvent,
} from '@pipeline-builder/core';
import * as z from 'zod';

/** The proxy route that streams a model's answer, on the origin the app is served from. */
export const LLM_STREAM_ENDPOINT = '/api/llm/stream';

export interface ProxyLlmClientOptions {
  /**
   * The user's API key for `provider`, or null when there is none (or the provider needs none).
   * Read on every request; the key goes to the proxy only, as an `Authorization: Bearer` header.
   */
  readonly getApiKey: (provider: LlmProvider) => string | null;
  /** Sends the request; the browser's `fetch` by default. */
  readonly fetch?: typeof fetch;
  /** Where requests go; `LLM_STREAM_ENDPOINT` by default. */
  readonly endpoint?: string;
}

/** What the proxy answers, with a 4xx or 5xx status, when a request fails before streaming. */
const ERROR_BODY_SCHEMA = z.object({
  error: z.object({ code: z.enum(LLM_ERROR_CODES), message: z.string() }),
});

// The media type of a `Content-Type` header, whatever parameters follow it.
const EVENT_STREAM_TYPE = /^\s*text\/event-stream\s*(?:;|$)/i;

/**
 * Creates the web app's `LlmClient`: it posts each request as JSON to the proxy and yields the
 * `token` texts of the event stream it answers with, until `done`. (`EventSource` cannot do this,
 * as it only sends GET requests without headers.)
 *
 * Failures are `LlmError`s: an `error` event or an error body keeps the proxy's code and message;
 * an error body the client cannot read, an answer that is not an event stream, or an event it does
 * not know is `upstream-error`; a proxy it cannot reach, or a stream that breaks off before `done`,
 * is `network`. When the signal aborts, the stream stops reading, cancels the response body and
 * ends without an error.
 */
export function createProxyLlmClient(options: ProxyLlmClientOptions): LlmClient {
  const { getApiKey, endpoint = LLM_STREAM_ENDPOINT } = options;
  // The global `fetch` is looked up on each call, so one stubbed after the client is made is used.
  const send: typeof fetch =
    options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  return {
    async *stream(request, signal) {
      if (signal.aborted) return;
      // `fetch` takes a DOM `AbortSignal`; this one follows the caller's signal.
      const controller = new AbortController();
      const abort = () => {
        controller.abort(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        const headers = requestHeaders(getApiKey(request.provider));
        const body = await post(send, endpoint, request, headers, controller.signal);
        yield* readAnswer(body, controller.signal);
      } catch (error) {
        // An abort rejects whatever was in progress (the request, a read): it is not a failure.
        if (controller.signal.aborted) return;
        throw error;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  };
}

function requestHeaders(apiKey: string | null): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  if (apiKey === null || apiKey === '') return headers;
  try {
    headers.set('Authorization', `Bearer ${apiKey}`);
  } catch {
    // A line break or a character outside Latin-1 cannot go in a header. The error is not kept as
    // the cause, because its message may quote the header value, and with it the key.
    throw new LlmError(
      'invalid-key',
      'The API key contains characters that cannot be sent. Enter the key again.',
    );
  }
  return headers;
}

/** Sends `request` and returns the body of the event stream that answers it. */
async function post(
  send: typeof fetch,
  endpoint: string,
  request: LlmRequest,
  headers: Headers,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  let response: Response;
  try {
    response = await send(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    throw new LlmError('network', 'The LLM proxy could not be reached.', { cause: error });
  }

  if (!response.ok) throw await responseError(response);
  if (!EVENT_STREAM_TYPE.test(response.headers.get('Content-Type') ?? '')) {
    cancel(response.body);
    throw new LlmError('upstream-error', 'The LLM proxy did not answer with an event stream.');
  }
  if (response.body === null) throw brokenOff();
  return response.body;
}

/** The error a failed response describes, or `upstream-error` when its body is not one. */
async function responseError(response: Response): Promise<LlmError> {
  let json: unknown;
  try {
    json = JSON.parse(await response.text());
  } catch {
    json = undefined;
  }
  const parsed = ERROR_BODY_SCHEMA.safeParse(json);
  if (parsed.success) return new LlmError(parsed.data.error.code, parsed.data.error.message);
  return new LlmError(
    'upstream-error',
    `The LLM proxy failed with HTTP status ${String(response.status)}.`,
  );
}

/**
 * Yields the texts of the `token` events in `body` until `done`, decoding it as UTF-8. Throws the
 * abort reason when `signal` aborts, and cancels the body whenever it stops before the body ends.
 */
async function* readAnswer(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  // Cancelling settles a read in progress, so an abort also stops a stream that has gone quiet.
  const stop = () => {
    cancel(reader);
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    // In streaming mode, a character whose bytes are split between chunks waits for the rest.
    const decoder = new TextDecoder();
    const parser = createSseParser();
    for (;;) {
      signal.throwIfAborted();
      const chunk = await read(reader);
      if (chunk.done) throw brokenOff();

      for (const sseEvent of parser.push(decoder.decode(chunk.value, { stream: true }))) {
        const event = toStreamEvent(sseEvent);
        switch (event.type) {
          case 'token':
            // Nothing more is yielded once the caller has aborted, even from a chunk already read.
            signal.throwIfAborted();
            if (event.text !== '') yield event.text;
            break;
          case 'done':
            return;
          case 'error':
            throw new LlmError(event.code, event.message);
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', stop);
    // Does nothing to a body that has ended; otherwise stops the download.
    stop();
  }
}

async function read(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  try {
    return await reader.read();
  } catch (error) {
    throw new LlmError('network', 'The connection to the LLM proxy was lost.', { cause: error });
  }
}

function toStreamEvent(sseEvent: SseEvent): LlmStreamEvent {
  const parsed = parseLlmStreamEvent(sseEvent);
  if (parsed.ok) return parsed.value;
  throw new LlmError('upstream-error', `The LLM proxy sent an invalid event: ${parsed.error}.`);
}

function brokenOff(): LlmError {
  return new LlmError('network', 'The LLM proxy stopped answering before the answer was complete.');
}

/** Cancels a body, or the reader of one, that may already have ended or failed. */
function cancel(stream: ReadableStream | ReadableStreamDefaultReader | null): void {
  // A body that failed rejects the cancellation, and then there is nothing left to stop.
  stream?.cancel().catch(() => undefined);
}
