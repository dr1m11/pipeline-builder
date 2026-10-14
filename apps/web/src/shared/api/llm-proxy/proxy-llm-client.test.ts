import {
  type AbortSignalLike,
  formatLlmStreamEvent,
  LLM_ERROR_CODES,
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type LlmStreamEvent,
} from '@pipeline-builder/core';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  createProxyLlmClient,
  LLM_STREAM_ENDPOINT,
  type ProxyLlmClientOptions,
} from './proxy-llm-client';

const REQUEST: LlmRequest = {
  provider: 'mock',
  model: 'mock',
  prompt: 'Why is the sky blue?',
  system: 'Answer in one sentence.',
  temperature: 0.7,
  maxTokens: 256,
};

const encoder = new TextEncoder();

/** Stream events as the proxy writes them on the wire. */
function wire(...events: readonly LlmStreamEvent[]): string {
  return events
    .map((streamEvent) => {
      const { event, data } = formatLlmStreamEvent(streamEvent);
      return `event: ${event}\ndata: ${data}\n\n`;
    })
    .join('');
}

function token(text: string): LlmStreamEvent {
  return { type: 'token', text };
}

const DONE: LlmStreamEvent = { type: 'done' };

/** A response body that the test writes piece by piece; it records whether it was cancelled. */
function createBody() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    stream,
    get cancelled() {
      return cancelled;
    },
    /** Sends each piece as a chunk of its own; text is sent as UTF-8. */
    send(...pieces: readonly (string | Uint8Array)[]) {
      for (const piece of pieces) {
        controller?.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece);
      }
    },
    end() {
      controller?.close();
    },
    fail(reason: unknown) {
      controller?.error(reason);
    },
  };
}

type FakeBody = ReturnType<typeof createBody>;

/** A body that sends `text` and ends. */
function bodyOf(text: string): FakeBody {
  const body = createBody();
  body.send(text);
  body.end();
  return body;
}

function eventStream(body: FakeBody, contentType = 'text/event-stream'): Response {
  return new Response(body.stream, { headers: { 'Content-Type': contentType } });
}

/** A client whose `fetch` answers with `response`, like the proxy would. */
function setUp(
  response: Response | Promise<Response>,
  options: Partial<ProxyLlmClientOptions> = {},
) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
  const client = createProxyLlmClient({ getApiKey: () => null, fetch: fetchMock, ...options });
  return { client, fetchMock };
}

/** What `fetch` was called with, for the request at `index`. */
function sent(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [input, init = {}] = fetchMock.mock.calls[index] ?? [];
  return { input, init, headers: new Headers(init.headers) };
}

/** Reads `stream` to its end: the texts it yielded, and the error it threw, if any. */
async function readAll(stream: AsyncIterable<string>) {
  const texts: string[] = [];
  try {
    for await (const text of stream) texts.push(text);
  } catch (error) {
    return { texts, error };
  }
  return { texts, error: undefined };
}

function newSignal(): AbortSignal {
  return new AbortController().signal;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createProxyLlmClient', () => {
  describe('sending', () => {
    it('posts the request as JSON to the stream endpoint and asks for an event stream', async () => {
      const { client, fetchMock } = setUp(eventStream(bodyOf(wire(DONE))));

      await readAll(client.stream(REQUEST, newSignal()));

      const { input, init, headers } = sent(fetchMock);
      expect(LLM_STREAM_ENDPOINT).toBe('/api/llm/stream');
      expect(input).toBe(LLM_STREAM_ENDPOINT);
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(REQUEST));
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Accept')).toBe('text/event-stream');
      expect(init.signal?.aborted).toBe(false);
    });

    it('sends the API key for the provider as a bearer token, and only in that header', async () => {
      const getApiKey = vi.fn<(provider: LlmProvider) => string | null>(() => 'sk-test-123');
      const { client, fetchMock } = setUp(eventStream(bodyOf(wire(DONE))), { getApiKey });

      await readAll(client.stream(REQUEST, newSignal()));

      const { input, init, headers } = sent(fetchMock);
      expect(getApiKey).toHaveBeenCalledExactlyOnceWith('mock');
      expect(headers.get('Authorization')).toBe('Bearer sk-test-123');
      expect(input).not.toContain('sk-test-123');
      expect(init.body).not.toContain('sk-test-123');
    });

    it.each([null, ''])('sends no Authorization header when the key is %o', async (key) => {
      const { client, fetchMock } = setUp(eventStream(bodyOf(wire(DONE))), {
        getApiKey: () => key,
      });

      await readAll(client.stream(REQUEST, newSignal()));

      expect(sent(fetchMock).headers.has('Authorization')).toBe(false);
    });

    it('reads the API key again for every request', async () => {
      const keys = [null, 'sk-entered-later'];
      const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(eventStream(bodyOf(wire(DONE)))));
      const client = createProxyLlmClient({
        getApiKey: () => keys.shift() ?? null,
        fetch: fetchMock,
      });

      await readAll(client.stream(REQUEST, newSignal()));
      await readAll(client.stream(REQUEST, newSignal()));

      expect(sent(fetchMock, 0).headers.get('Authorization')).toBeNull();
      expect(sent(fetchMock, 1).headers.get('Authorization')).toBe('Bearer sk-entered-later');
    });

    it.each([
      ['a line break', 'sk-test\n123'],
      ['a character outside Latin-1', 'sk-ключ'],
    ])('reports a key with %s as invalid-key without sending it or quoting it', async (_, key) => {
      const { client, fetchMock } = setUp(eventStream(bodyOf(wire(DONE))), {
        getApiKey: () => key,
      });

      const { error } = await readAll(client.stream(REQUEST, newSignal()));

      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({
        code: 'invalid-key',
        message: 'The API key contains characters that cannot be sent. Enter the key again.',
      });
      // The error of `Headers` may quote the header value, so it is not kept as the cause.
      expect(error).not.toHaveProperty('cause');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('posts to the endpoint it is given', async () => {
      const { client, fetchMock } = setUp(eventStream(bodyOf(wire(DONE))), {
        endpoint: '/proxy/llm/stream',
      });

      await readAll(client.stream(REQUEST, newSignal()));

      expect(sent(fetchMock).input).toBe('/proxy/llm/stream');
    });

    it('uses the global fetch by default, looked up when it sends', async () => {
      const client = createProxyLlmClient({ getApiKey: () => null });
      const fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(eventStream(bodyOf(wire(token('Hi'), DONE)))),
      );
      vi.stubGlobal('fetch', fetchMock);

      expect(await readAll(client.stream(REQUEST, newSignal()))).toEqual({
        texts: ['Hi'],
        error: undefined,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  describe('streaming', () => {
    it('yields the texts of the token events in order and ends at done', async () => {
      const { client } = setUp(
        eventStream(bodyOf(wire(token('The sky'), token(' is'), token(' blue.'), DONE))),
      );

      expect(await readAll(client.stream(REQUEST, newSignal()))).toEqual({
        texts: ['The sky', ' is', ' blue.'],
        error: undefined,
      });
    });

    it.each([1, 2, 3, 5, 8])(
      'reads events and UTF-8 characters split across chunks of %i bytes',
      async (size) => {
        const tokens = ['Небо', ' голубое', ' 🌍', ' — €5', '\n\n文字'];
        const bytes = encoder.encode(wire(...tokens.map(token), DONE));
        const body = createBody();
        for (let start = 0; start < bytes.length; start += size) {
          body.send(bytes.slice(start, start + size));
        }
        body.end();
        const { client } = setUp(eventStream(body));

        const { texts, error } = await readAll(client.stream(REQUEST, newSignal()));

        expect(error).toBeUndefined();
        expect(texts.join('')).toBe(tokens.join(''));
      },
    );

    it('skips tokens without text', async () => {
      const { client } = setUp(eventStream(bodyOf(wire(token(''), token('Hi'), token(''), DONE))));

      expect(await readAll(client.stream(REQUEST, newSignal()))).toEqual({
        texts: ['Hi'],
        error: undefined,
      });
    });

    it('accepts an event stream whose Content-Type has parameters', async () => {
      const { client } = setUp(
        eventStream(bodyOf(wire(token('Hi'), DONE)), 'Text/Event-Stream; charset=utf-8'),
      );

      expect(await readAll(client.stream(REQUEST, newSignal()))).toEqual({
        texts: ['Hi'],
        error: undefined,
      });
    });

    it('ends at done without waiting for the body to close, and cancels the rest', async () => {
      const body = createBody();
      body.send(wire(token('Hi'), DONE, token(' there')));
      const { client } = setUp(eventStream(body));

      expect(await readAll(client.stream(REQUEST, newSignal()))).toEqual({
        texts: ['Hi'],
        error: undefined,
      });
      expect(body.cancelled).toBe(true);
    });

    it('cancels the body when the caller stops reading early', async () => {
      const body = createBody();
      body.send(wire(token('Hi'), token(' there')));
      const { client } = setUp(eventStream(body));

      for await (const text of client.stream(REQUEST, newSignal())) {
        expect(text).toBe('Hi');
        break;
      }

      expect(body.cancelled).toBe(true);
    });
  });

  describe('errors', () => {
    it.each(LLM_ERROR_CODES)(
      'throws an error event with the code "%s" after the tokens before it',
      async (code) => {
        const body = createBody();
        body.send(wire(token('Hi'), { type: 'error', code, message: 'It failed.' }));
        const { client } = setUp(eventStream(body));

        const { texts, error } = await readAll(client.stream(REQUEST, newSignal()));

        expect(texts).toEqual(['Hi']);
        expect(error).toBeInstanceOf(LlmError);
        expect(error).toMatchObject({ code, message: 'It failed.' });
        expect(body.cancelled).toBe(true);
      },
    );

    it.each([
      [400, 'bad-request', 'prompt: Required'],
      [401, 'invalid-key', 'The API key was rejected.'],
      [429, 'rate-limited', 'Too many requests. Try again in a minute.'],
      [502, 'upstream-error', 'The provider failed.'],
    ] as const)(
      'throws a JSON error body with the status %i as its code "%s"',
      async (status, code, message) => {
        const { client } = setUp(Response.json({ error: { code, message } }, { status }));

        const { texts, error } = await readAll(client.stream(REQUEST, newSignal()));

        expect(texts).toEqual([]);
        expect(error).toBeInstanceOf(LlmError);
        expect(error).toMatchObject({ code, message });
      },
    );

    it.each([
      ['an HTML page', () => new Response('<h1>Bad gateway</h1>', { status: 502 }), 502],
      ['no body', () => new Response(null, { status: 500 }), 500],
      ['JSON of another shape', () => Response.json({ message: 'Oops' }, { status: 500 }), 500],
      [
        'an unknown error code',
        () =>
          Response.json({ error: { code: 'teapot', message: 'Short and stout' } }, { status: 418 }),
        418,
      ],
    ])('reports an error response with %s as upstream-error', async (_, response, status) => {
      const { client } = setUp(response());

      const { error } = await readAll(client.stream(REQUEST, newSignal()));

      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({
        code: 'upstream-error',
        message: `The LLM proxy failed with HTTP status ${String(status)}.`,
      });
    });

    it('reports a successful answer that is not an event stream as upstream-error', async () => {
      const body = createBody();
      body.send('<!doctype html><title>Pipeline Builder</title>');
      const { client } = setUp(eventStream(body, 'text/html'));

      const { error } = await readAll(client.stream(REQUEST, newSignal()));

      expect(error).toMatchObject({
        name: 'LlmError',
        code: 'upstream-error',
        message: 'The LLM proxy did not answer with an event stream.',
      });
      expect(body.cancelled).toBe(true);
    });

    it.each([
      ['event: message\ndata: {}\n\n', 'Unknown stream event "message"'],
      ['event: token\ndata: {"text":\n\n', 'The data of the "token" event is not JSON'],
    ])('reports the invalid event %j as upstream-error', async (text, problem) => {
      const body = createBody();
      body.send(wire(token('Hi')), text, wire(token(' there'), DONE));
      const { client } = setUp(eventStream(body));

      const { texts, error } = await readAll(client.stream(REQUEST, newSignal()));

      expect(texts).toEqual(['Hi']);
      expect(error).toMatchObject({
        name: 'LlmError',
        code: 'upstream-error',
        message: `The LLM proxy sent an invalid event: ${problem}.`,
      });
      expect(body.cancelled).toBe(true);
    });

    it('reports a proxy it cannot reach as network', async () => {
      const cause = new TypeError('Failed to fetch');
      const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(cause));
      const client = createProxyLlmClient({ getApiKey: () => null, fetch: fetchMock });

      const { error } = await readAll(client.stream(REQUEST, newSignal()));

      expect(error).toBeInstanceOf(LlmError);
      expect(error).toMatchObject({
        code: 'network',
        message: 'The LLM proxy could not be reached.',
        cause,
      });
    });

    it.each([
      ['after some tokens', wire(token('The sky'), token(' is')), ['The sky', ' is']],
      ['before any event', '', []],
      ['inside the done event', 'event: done\ndata: {}\n', []],
    ])('reports a stream that ends %s, without done, as network', async (_, text, tokens) => {
      const { client } = setUp(eventStream(bodyOf(text)));

      const { texts, error } = await readAll(client.stream(REQUEST, newSignal()));

      expect(texts).toEqual(tokens);
      expect(error).toMatchObject({
        name: 'LlmError',
        code: 'network',
        message: 'The LLM proxy stopped answering before the answer was complete.',
      });
    });

    it('reports a connection lost while streaming as network', async () => {
      const body = createBody();
      body.send(wire(token('Hi')));
      const { client } = setUp(eventStream(body));
      const stream = client.stream(REQUEST, newSignal())[Symbol.asyncIterator]();

      expect(await stream.next()).toEqual({ done: false, value: 'Hi' });
      const cause = new TypeError('terminated');
      body.fail(cause);

      await expect(stream.next()).rejects.toMatchObject({
        name: 'LlmError',
        code: 'network',
        message: 'The connection to the LLM proxy was lost.',
        cause,
      });
    });
  });

  describe('aborting', () => {
    it('sends nothing when the signal has already aborted', async () => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createProxyLlmClient({ getApiKey: () => null, fetch: fetchMock });

      expect(await readAll(client.stream(REQUEST, AbortSignal.abort()))).toEqual({
        texts: [],
        error: undefined,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('aborts the request while it waits for the answer, and ends without an error', async () => {
      // Like the browser's `fetch`, it rejects with an `AbortError` when its signal aborts.
      const fetchMock = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );
      const client = createProxyLlmClient({ getApiKey: () => null, fetch: fetchMock });
      const controller = new AbortController();

      const result = readAll(client.stream(REQUEST, controller.signal));
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledOnce();
      });
      controller.abort();

      expect(await result).toEqual({ texts: [], error: undefined });
      expect(sent(fetchMock).init.signal?.aborted).toBe(true);
    });

    it('stops between two tokens of one chunk and cancels the body', async () => {
      const body = createBody();
      body.send(wire(token('The sky'), token(' is')));
      const { client, fetchMock } = setUp(eventStream(body));
      const controller = new AbortController();
      const stream = client.stream(REQUEST, controller.signal)[Symbol.asyncIterator]();

      expect(await stream.next()).toEqual({ done: false, value: 'The sky' });
      controller.abort();

      expect(await stream.next()).toEqual({ done: true, value: undefined });
      expect(body.cancelled).toBe(true);
      expect(sent(fetchMock).init.signal?.aborted).toBe(true);
    });

    it('stops while it waits for the next chunk and cancels the body', async () => {
      const body = createBody();
      body.send(wire(token('The sky')));
      const { client } = setUp(eventStream(body));
      const controller = new AbortController();
      const stream = client.stream(REQUEST, controller.signal)[Symbol.asyncIterator]();

      expect(await stream.next()).toEqual({ done: false, value: 'The sky' });
      const next = stream.next();
      controller.abort();

      expect(await next).toEqual({ done: true, value: undefined });
      expect(body.cancelled).toBe(true);
    });

    it('ends without an error when the abort breaks the body, as the browser does', async () => {
      const body = createBody();
      body.send(wire(token('The sky')));
      const fetchMock = vi.fn<typeof fetch>((_input, init) => {
        init?.signal?.addEventListener('abort', () => {
          body.fail(init.signal?.reason);
        });
        return Promise.resolve(eventStream(body));
      });
      const client = createProxyLlmClient({ getApiKey: () => null, fetch: fetchMock });
      const controller = new AbortController();
      const stream = client.stream(REQUEST, controller.signal)[Symbol.asyncIterator]();

      expect(await stream.next()).toEqual({ done: false, value: 'The sky' });
      const next = stream.next();
      controller.abort();

      expect(await next).toEqual({ done: true, value: undefined });
    });

    it('takes any AbortSignalLike and stops listening to it when the stream ends', async () => {
      const signal = {
        aborted: false,
        reason: undefined,
        addEventListener: vi.fn<AbortSignalLike['addEventListener']>(),
        removeEventListener: vi.fn<AbortSignalLike['removeEventListener']>(),
      } satisfies AbortSignalLike;
      const { client } = setUp(eventStream(bodyOf(wire(token('Hi'), DONE))));

      expect(await readAll(client.stream(REQUEST, signal))).toEqual({
        texts: ['Hi'],
        error: undefined,
      });
      const listener = signal.addEventListener.mock.calls[0]?.[1];
      expect(listener).toBeTypeOf('function');
      expect(signal.removeEventListener).toHaveBeenCalledExactlyOnceWith('abort', listener);
    });
  });
});

describe('AbortSignalLike', () => {
  it('is met by the DOM AbortSignal, so callers pass AbortController.signal as it is', () => {
    expectTypeOf<AbortSignal>().toExtend<AbortSignalLike>();
  });
});
