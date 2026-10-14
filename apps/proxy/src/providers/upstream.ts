import {
  createSseParser,
  LLM_PROVIDER_INFO,
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type SseEvent,
} from '@pipeline-builder/core';

import type { Provider } from './provider';
import { errorCodeForStatus, upstreamError } from './upstream-errors';
import { objectField, parseJsonObject, stringField } from './upstream-json';

/** How long the proxy waits for a provider, in milliseconds, counted from sending the request. */
export interface UpstreamTimeouts {
  /** For the first text of the answer: the provider may be stuck, or think for too long. */
  readonly firstTokenMs: number;
  /** For the whole answer. */
  readonly totalMs: number;
}

/** 30 seconds for the first text, 5 minutes for the whole answer (docs/adr/0012). */
export const DEFAULT_UPSTREAM_TIMEOUTS: UpstreamTimeouts = {
  firstTokenMs: 30_000,
  totalMs: 5 * 60_000,
};

/** Options of the providers that call a real model's API. */
export interface UpstreamProviderOptions {
  /** Sends the upstream request; the runtime's `fetch` by default. Tests pass a fake. */
  readonly fetch?: typeof fetch;
  /** `DEFAULT_UPSTREAM_TIMEOUTS` by default. */
  readonly timeouts?: UpstreamTimeouts;
}

/** What one event of the upstream stream means for the answer. */
export type UpstreamStep =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly error: LlmError };

/** Reads the events of one answer, in order; it may keep state from one event to the next. */
export type UpstreamEventReader = (event: SseEvent) => UpstreamStep | null;

/** How to stream an answer from one provider's API. */
export interface UpstreamApi {
  readonly provider: Exclude<LlmProvider, 'mock'>;
  /** The streaming endpoint, which takes a POST with a JSON body. */
  readonly url: string;
  /** The request headers, which carry the user's key. */
  readonly headers: (apiKey: string) => Readonly<Record<string, string>>;
  /** The JSON body of the streaming request for `request`. */
  readonly body: (request: LlmRequest) => object;
  /**
   * A reader for the server-sent events of one answer. An event that adds nothing to the answer
   * (a ping, the model's thinking, metadata, an event it does not know) gives null.
   */
  readonly createEventReader: () => UpstreamEventReader;
}

// The abort reasons of the two timeouts, to tell them from a client disconnect.
const FIRST_TOKEN_TIMEOUT = Symbol('first token timeout');
const TOTAL_TIMEOUT = Symbol('total timeout');

// The media type of a `Content-Type` header, whatever parameters follow it.
const EVENT_STREAM_TYPE = /^\s*text\/event-stream\s*(?:;|$)/i;

/**
 * A provider that streams answers from a model's API with the user's key: it posts the request,
 * reads the response body as server-sent events (UTF-8, with `createSseParser`) and yields the
 * text the event reader finds, until the reader reports the end of the answer.
 *
 * Failures are `LlmError`s with messages the proxy writes itself: an HTTP error status by
 * `errorCodeForStatus`; a provider that cannot be reached, a connection that breaks off, an
 * answer that is not an event stream or that ends early is `upstream-error`; no text within
 * `timeouts.firstTokenMs` of the request, or no end of the answer within `timeouts.totalMs`, is
 * `timeout`. A client disconnect aborts the upstream request and ends the stream without an error.
 * The key goes only into the request headers.
 */
export function createUpstreamProvider(
  api: UpstreamApi,
  {
    fetch: send = defaultFetch,
    timeouts = DEFAULT_UPSTREAM_TIMEOUTS,
  }: UpstreamProviderOptions = {},
): Provider {
  const { title } = LLM_PROVIDER_INFO[api.provider];

  return {
    async *stream(request, { signal, apiKey }) {
      if (signal.aborted) return;
      // The stream endpoint checks the key first; this is for a caller that did not.
      if (apiKey === undefined || apiKey.trim() === '') {
        throw new LlmError('invalid-key', `${title} needs your API key.`);
      }

      const upstream = new AbortController();
      const disconnect = () => {
        upstream.abort();
      };
      signal.addEventListener('abort', disconnect, { once: true });
      const firstToken = setTimeout(() => {
        upstream.abort(FIRST_TOKEN_TIMEOUT);
      }, timeouts.firstTokenMs);
      const total = setTimeout(() => {
        upstream.abort(TOTAL_TIMEOUT);
      }, timeouts.totalMs);

      try {
        const body = await post(send, title, upstream.signal, {
          url: api.url,
          headers: api.headers(apiKey),
          body: JSON.stringify(api.body(request)),
        });
        for await (const text of readAnswer(
          body,
          api.createEventReader(),
          title,
          upstream.signal,
        )) {
          clearTimeout(firstToken);
          yield text;
        }
      } catch (error) {
        // An abort rejects whatever was in progress (the request, a read); its reason tells why.
        const reason: unknown = upstream.signal.reason;
        if (reason === FIRST_TOKEN_TIMEOUT) {
          throw new LlmError(
            'timeout',
            `${title} did not start answering within ${seconds(timeouts.firstTokenMs)}.`,
          );
        }
        if (reason === TOTAL_TIMEOUT) {
          throw new LlmError(
            'timeout',
            `${title} did not finish answering within ${seconds(timeouts.totalMs)}.`,
          );
        }
        // Otherwise only a client disconnect aborts the upstream request.
        if (upstream.signal.aborted) return;
        throw error;
      } finally {
        clearTimeout(firstToken);
        clearTimeout(total);
        signal.removeEventListener('abort', disconnect);
      }
    },
  };
}

// Called as a plain function: the Workers runtime rejects `fetch` called as a method of another
// object ("Illegal invocation").
function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

interface UpstreamRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** Sends the request and returns the body of the event stream that answers it. */
async function post(
  send: typeof fetch,
  title: string,
  signal: AbortSignal,
  { url, headers, body }: UpstreamRequest,
): Promise<ReadableStream<Uint8Array>> {
  let response: Response;
  try {
    response = await send(url, { method: 'POST', headers, body, signal });
  } catch {
    // The error is not kept: its message may describe the request.
    throw upstreamError(title, 'upstream-error');
  }

  if (!response.ok) throw await statusError(response, title);
  if (!EVENT_STREAM_TYPE.test(response.headers.get('Content-Type') ?? '')) {
    cancel(response.body);
    throw upstreamError(title, 'upstream-error', { status: response.status });
  }
  if (response.body === null) throw endedEarly(title);
  return response.body;
}

/**
 * The error of a response with an error status. Anthropic and OpenAI both describe the failure in
 * `{ "error": { "type", "message" } }` (OpenAI adds a `code`); only the type or code is kept.
 */
async function statusError(response: Response, title: string): Promise<LlmError> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    // The body broke off: the status says enough.
  }
  const error = objectField(parseJsonObject(text), 'error');
  return upstreamError(title, errorCodeForStatus(response.status), {
    status: response.status,
    type: stringField(error, 'code') ?? stringField(error, 'type'),
  });
}

/**
 * Yields the text the reader finds in the server-sent events of `body`, until it reports the end
 * of the answer, and throws the error it reports. Cancels the body when it stops before the end,
 * and as soon as `signal` aborts.
 */
async function* readAnswer(
  body: ReadableStream<Uint8Array>,
  readEvent: UpstreamEventReader,
  title: string,
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
      const chunk = await read(reader, title);
      if (chunk.done) throw endedEarly(title);

      for (const event of parser.push(decoder.decode(chunk.value, { stream: true }))) {
        const step = readEvent(event);
        if (step === null) continue;
        switch (step.type) {
          case 'text':
            signal.throwIfAborted();
            if (step.text !== '') yield step.text;
            break;
          case 'done':
            return;
          case 'error':
            throw step.error;
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
  title: string,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  try {
    return await reader.read();
  } catch {
    throw new LlmError('upstream-error', `The connection to ${title} was lost.`);
  }
}

function endedEarly(title: string): LlmError {
  return new LlmError('upstream-error', `${title} stopped before the answer was complete.`);
}

function seconds(ms: number): string {
  const count = Math.ceil(ms / 1000);
  return `${String(count)} second${count === 1 ? '' : 's'}`;
}

/** Cancels a body, or the reader of one, that may already have ended or failed. */
function cancel(stream: ReadableStream | ReadableStreamDefaultReader | null): void {
  // A body that failed rejects the cancellation, and then there is nothing left to stop.
  stream?.cancel().catch(() => undefined);
}
