import {
  createSseParser,
  LlmError,
  type LlmRequest,
  type LlmStreamEvent,
  mockCompletion,
  parseLlmStreamEvent,
} from '@pipeline-builder/core';
import { describe, expect, it, vi } from 'vitest';

import { type AppOptions, createApp } from './app';
import type { Bindings } from './bindings';
import { MAX_REQUEST_BYTES } from './llm-stream';
import { createMockProvider } from './providers/mock-provider';
import type { Provider } from './providers/provider';

const REQUEST: LlmRequest = {
  provider: 'mock',
  model: 'mock',
  prompt: 'Why is the sky blue?',
  temperature: 0.7,
  maxTokens: 512,
};

const CLIENT_IP = '203.0.113.7';
const API_KEY = 'sk-test-secret';

const MOCK_ONLY: AppOptions = { providers: { mock: createMockProvider({ tokenDelayMs: 0 }) } };

/** Fake bindings: the static assets answer with the SPA shell, the rate limits with `success`. */
function createEnv({ llmLimit = true, realProviderLimit = true } = {}) {
  return {
    ASSETS: {
      fetch: vi.fn<Bindings['ASSETS']['fetch']>(() =>
        Promise.resolve(
          new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
        ),
      ),
    },
    LLM_RATE_LIMITER: {
      limit: vi.fn<RateLimit['limit']>(() => Promise.resolve({ success: llmLimit })),
    },
    REAL_PROVIDER_RATE_LIMITER: {
      limit: vi.fn<RateLimit['limit']>(() => Promise.resolve({ success: realProviderLimit })),
    },
  } satisfies Bindings;
}

interface PostOptions {
  readonly options?: AppOptions;
  readonly env?: Bindings;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Posts `body` (JSON unless it is a string) to the stream endpoint, as a browser on `CLIENT_IP`. */
function postStream(
  body: unknown,
  { options = MOCK_ONLY, env = createEnv(), headers }: PostOptions = {},
) {
  return createApp(options).request(
    '/api/llm/stream',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': CLIENT_IP,
        Authorization: `Bearer ${API_KEY}`,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );
}

/** Reads a whole SSE response back into stream events. */
async function readEvents(response: Response): Promise<LlmStreamEvent[]> {
  const parser = createSseParser();
  const events = [...parser.push(await response.text()), ...parser.end()];
  return events.map((event) => {
    const parsed = parseLlmStreamEvent(event);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  });
}

/** A provider that streams `chunks` at once, then throws `error` if there is one. */
function fakeProvider(chunks: readonly string[], error?: Error): Provider {
  return {
    real: false,
    // eslint-disable-next-line @typescript-eslint/require-await -- the fake has nothing to wait for
    async *stream() {
      yield* chunks;
      if (error !== undefined) throw error;
    },
  };
}

function bodyReader(response: Response) {
  if (response.body === null) throw new Error('The response has no body');
  return response.body.getReader();
}

describe('GET /api/health', () => {
  it('answers that the proxy is up', async () => {
    const response = await createApp(MOCK_ONLY).request('/api/health', {}, createEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('POST /api/llm/stream', () => {
  it('streams the mock answer as tokens, in order, and ends with done', async () => {
    const response = await postStream(REQUEST);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^text\/event-stream/);
    const events = await readEvents(response);
    const tokens = events.slice(0, -1);
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.every((event) => event.type === 'token')).toBe(true);
    expect(tokens.map((event) => (event.type === 'token' ? event.text : '')).join('')).toBe(
      mockCompletion(REQUEST),
    );
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('answers a provider it does not have with an error event', async () => {
    const response = await postStream(REQUEST, { options: { providers: {} } });

    expect(response.status).toBe(200);
    expect(await readEvents(response)).toEqual([
      { type: 'error', code: 'bad-request', message: 'The "mock" provider is not available yet' },
    ]);
  });

  it('ends with an error event when the provider fails midway', async () => {
    const provider = fakeProvider(['Hello'], new LlmError('timeout', 'The provider is slow'));

    const response = await postStream(REQUEST, { options: { providers: { mock: provider } } });

    expect(await readEvents(response)).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'error', code: 'timeout', message: 'The provider is slow' },
    ]);
  });

  it('reports an unexpected provider failure as upstream-error, without its message', async () => {
    const provider = fakeProvider([], new TypeError(`fetch failed with ${API_KEY}`));

    const response = await postStream(REQUEST, { options: { providers: { mock: provider } } });

    expect(await readEvents(response)).toEqual([
      { type: 'error', code: 'upstream-error', message: 'The provider failed unexpectedly' },
    ]);
  });

  it('never sends the network code, which belongs to the client', async () => {
    const provider = fakeProvider([], new LlmError('network', 'Connection reset'));

    const response = await postStream(REQUEST, { options: { providers: { mock: provider } } });

    expect(await readEvents(response)).toEqual([
      { type: 'error', code: 'upstream-error', message: 'Connection reset' },
    ]);
  });

  it('stops the provider when the client disconnects', async () => {
    let reportStop: (aborted: boolean) => void = () => undefined;
    const stopped = new Promise<boolean>((resolve) => {
      reportStop = resolve;
    });
    const endless: Provider = {
      real: false,
      async *stream(_request, { signal }) {
        try {
          while (!signal.aborted) {
            yield 'and on ';
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
        } finally {
          reportStop(signal.aborted);
        }
      },
    };

    const reader = bodyReader(
      await postStream(REQUEST, { options: { providers: { mock: endless } } }),
    );
    const first = await reader.read();
    await reader.cancel();

    expect(first.done).toBe(false);
    expect(await stopped).toBe(true);
  });

  describe('request checks', () => {
    it.each([
      ['a body that is not JSON', '{"provider":', 'The request body is not valid JSON'],
      ['a body that is not an object', [], 'The request is invalid ('],
      ['a blank prompt', { ...REQUEST, prompt: '  ' }, 'prompt: Required'],
      ['an unknown provider', { ...REQUEST, provider: 'acme' }, 'provider: '],
      ['too many tokens', { ...REQUEST, maxTokens: 1e6 }, 'maxTokens: '],
    ])('answers 400 to %s', async (_case, body, message) => {
      const response = await postStream(body);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toHaveProperty('error.code', 'bad-request');
      expect(json).toHaveProperty('error.message', expect.stringContaining(message));
    });

    it('answers 400 to a body sent as anything but JSON', async () => {
      const response = await postStream(REQUEST, { headers: { 'Content-Type': 'text/plain' } });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'bad-request',
          message: 'The request body must be JSON (Content-Type: application/json)',
        },
      });
    });

    it('accepts JSON with a charset', async () => {
      const response = await postStream(REQUEST, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });

      expect((await readEvents(response)).at(-1)).toEqual({ type: 'done' });
    });

    it('answers 413 to a body larger than the limit, before reading it', async () => {
      const prompt = 'x'.repeat(MAX_REQUEST_BYTES);

      const response = await postStream({ ...REQUEST, prompt });

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        error: { code: 'bad-request', message: 'The request body is larger than 1 MB' },
      });
    });

    it('accepts a prompt and a system prompt of 100 000 characters each in any script', async () => {
      const long = 'ж'.repeat(100_000);

      const response = await postStream(
        { ...REQUEST, prompt: long, system: long },
        { options: { providers: { mock: fakeProvider(['Read']) } } },
      );

      expect(await readEvents(response)).toEqual([
        { type: 'token', text: 'Read' },
        { type: 'done' },
      ]);
    });
  });

  describe('rate limits', () => {
    it('counts every request against the general limit, keyed by client IP', async () => {
      const env = createEnv();

      await (await postStream(REQUEST, { env })).text();

      expect(env.LLM_RATE_LIMITER.limit).toHaveBeenCalledExactlyOnceWith({ key: CLIENT_IP });
      expect(env.REAL_PROVIDER_RATE_LIMITER.limit).not.toHaveBeenCalled();
    });

    it('answers 429 with a JSON error once the general limit is reached', async () => {
      const mock = createMockProvider({ tokenDelayMs: 0 });
      const stream = vi.spyOn(mock, 'stream');

      const response = await postStream(REQUEST, {
        options: { providers: { mock } },
        env: createEnv({ llmLimit: false }),
      });

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({
        error: { code: 'rate-limited', message: 'Too many requests. Wait a minute and try again.' },
      });
      expect(stream).not.toHaveBeenCalled();
    });

    it('also counts requests to a real model against the stricter limit', async () => {
      const real: Provider = { ...createMockProvider({ tokenDelayMs: 0 }), real: true };
      const env = createEnv();

      const response = await postStream(REQUEST, { options: { providers: { mock: real } }, env });

      expect((await readEvents(response)).at(-1)).toEqual({ type: 'done' });
      expect(env.REAL_PROVIDER_RATE_LIMITER.limit).toHaveBeenCalledExactlyOnceWith({
        key: CLIENT_IP,
      });
    });

    it('answers 429 once the stricter limit for real models is reached', async () => {
      const real: Provider = { ...createMockProvider({ tokenDelayMs: 0 }), real: true };

      const response = await postStream(REQUEST, {
        options: { providers: { mock: real } },
        env: createEnv({ realProviderLimit: false }),
      });

      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ error: { code: 'rate-limited' } });
    });

    it('shares one key between requests that come without a client IP', async () => {
      const env = createEnv();

      const response = await createApp(MOCK_ONLY).request(
        '/api/llm/stream',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(REQUEST),
        },
        env,
      );
      await response.text();

      expect(env.LLM_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: 'unknown' });
    });
  });
});

describe('API responses', () => {
  it.each([
    ['the health check', () => createApp(MOCK_ONLY).request('/api/health', {}, createEnv())],
    ['an event stream', () => postStream(REQUEST)],
    ['a request error', () => postStream('not json')],
    ['an unknown endpoint', () => createApp(MOCK_ONLY).request('/api/nope', {}, createEnv())],
  ])('set security headers and forbid caching on %s', async (_case, send) => {
    const { headers } = await send();

    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it.each([
    ['an unknown path', 'GET', '/api/nope'],
    ['the stream endpoint with GET', 'GET', '/api/llm/stream'],
    ['a CORS preflight', 'OPTIONS', '/api/llm/stream'],
  ])('answer 404 with a JSON error to %s', async (_case, method, path) => {
    const response = await createApp(MOCK_ONLY).request(path, { method }, createEnv());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'bad-request', message: 'There is no such API endpoint' },
    });
  });

  it('answer 500 with a JSON error when something unexpected fails, and log no request data', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = createEnv();
    env.LLM_RATE_LIMITER.limit.mockRejectedValue(new Error(`Binding failed for ${API_KEY}`));

    const response = await postStream(REQUEST, { env });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'upstream-error', message: 'The proxy failed to handle the request' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('Unhandled Error in POST /api/llm/stream');
    consoleError.mockRestore();
  });
});

describe('other requests', () => {
  it('go to the static assets unchanged', async () => {
    const env = createEnv();

    const response = await createApp(MOCK_ONLY).request('/editor/deep-link', {}, env);

    expect(await response.text()).toBe('<!doctype html>');
    expect(response.headers.has('Cache-Control')).toBe(false);
    expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: 'http://localhost/editor/deep-link' }),
    );
  });
});
