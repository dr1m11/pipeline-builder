import { LlmError, type LlmRequest } from '@pipeline-builder/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANTHROPIC_MESSAGES_URL, createAnthropicProvider } from './anthropic-provider';
import {
  ANTHROPIC_ANSWER,
  ANTHROPIC_ANSWER_TEXT,
  ANTHROPIC_ERROR_BODIES,
} from './fixtures/anthropic-streams';
import {
  byteByByte,
  createFakeUpstream,
  type FakeAnswer,
  type FakeUpstream,
  TEST_API_KEY,
  type UpstreamCall,
} from './fixtures/fake-upstream';
import { OPENAI_ANSWER, OPENAI_ANSWER_TEXT, OPENAI_ERROR_BODIES } from './fixtures/openai-streams';
import { createOpenAiProvider, OPENAI_RESPONSES_URL } from './openai-provider';
import type { Provider, ProviderContext } from './provider';
import { DEFAULT_UPSTREAM_TIMEOUTS, type UpstreamProviderOptions } from './upstream';

const PROMPT = 'Why is the sky blue?';

/** What the shared tests need to know about each provider that calls a real API. */
interface ProviderCase {
  readonly title: string;
  readonly create: (options: UpstreamProviderOptions) => Provider;
  readonly request: LlmRequest;
  readonly url: string;
  /** The header that carries the key, and its value. */
  readonly keyHeader: readonly [string, string];
  /** A recorded answer, and its text. */
  readonly answer: string;
  readonly answerText: string;
  /** The part of the answer before its first text. */
  readonly beforeText: string;
  readonly errorBodies: Readonly<Record<400 | 401 | 403 | 429 | 500, string>>;
  /** The status and body of the provider's answer when it is overloaded. */
  readonly overloaded: { readonly status: number; readonly body: string };
}

const PROVIDERS: readonly ProviderCase[] = [
  {
    title: 'Anthropic',
    create: createAnthropicProvider,
    request: {
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      prompt: PROMPT,
      temperature: 0.7,
      maxTokens: 512,
    },
    url: ANTHROPIC_MESSAGES_URL,
    keyHeader: ['x-api-key', TEST_API_KEY],
    answer: ANTHROPIC_ANSWER,
    answerText: ANTHROPIC_ANSWER_TEXT,
    beforeText: ANTHROPIC_ANSWER.slice(0, ANTHROPIC_ANSWER.indexOf('event: ping')),
    errorBodies: ANTHROPIC_ERROR_BODIES,
    overloaded: { status: 529, body: ANTHROPIC_ERROR_BODIES[529] },
  },
  {
    title: 'OpenAI',
    create: createOpenAiProvider,
    request: {
      provider: 'openai',
      model: 'gpt-6-luna',
      prompt: PROMPT,
      temperature: 0.7,
      maxTokens: 512,
    },
    url: OPENAI_RESPONSES_URL,
    keyHeader: ['Authorization', `Bearer ${TEST_API_KEY}`],
    answer: OPENAI_ANSWER,
    answerText: OPENAI_ANSWER_TEXT,
    beforeText: OPENAI_ANSWER.slice(0, OPENAI_ANSWER.indexOf('event: response.output_text.delta')),
    errorBodies: OPENAI_ERROR_BODIES,
    overloaded: { status: 503, body: OPENAI_ERROR_BODIES[503] },
  },
];

/** Reads `chunks` to their end: the texts, and the error that ended them, if any. */
async function collect(chunks: AsyncIterable<string>) {
  const texts: string[] = [];
  try {
    for await (const text of chunks) texts.push(text);
  } catch (error) {
    return { texts, error };
  }
  return { texts, error: undefined };
}

function firstCall({ calls }: FakeUpstream): UpstreamCall {
  const [call] = calls;
  if (call === undefined) throw new Error('No upstream request was sent');
  return call;
}

function context(signal = new AbortController().signal): ProviderContext {
  return { signal, apiKey: TEST_API_KEY };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(PROVIDERS)('the $title provider', (provider) => {
  /** The provider, talking to a fake upstream that answers with `answer`. */
  function setUp(answer: FakeAnswer | 'silent', options: UpstreamProviderOptions = {}) {
    const upstream = createFakeUpstream(answer);
    const instance: Provider = provider.create({ fetch: upstream.fetch, ...options });
    return { upstream, provider: instance };
  }

  function stream(instance: Provider, signal?: AbortSignal) {
    return instance.stream(provider.request, context(signal));
  }

  describe('answers', () => {
    it('streams the text of a recorded answer in order, and ends', async () => {
      const { provider: instance } = setUp({ body: [provider.answer] });

      const { texts, error } = await collect(stream(instance));

      expect(error).toBeUndefined();
      expect(texts).toHaveLength(3);
      expect(texts.join('')).toBe(provider.answerText);
    });

    it('decodes characters whose bytes arrive in different chunks', async () => {
      const { provider: instance } = setUp({ body: byteByByte(provider.answer) });

      const { texts, error } = await collect(stream(instance));

      expect(error).toBeUndefined();
      expect(texts.join('')).toBe(provider.answerText);
    });

    it("uses the runtime's fetch by default", async () => {
      const upstream = createFakeUpstream({ body: [provider.answer] });
      vi.stubGlobal('fetch', upstream.fetch);

      const { texts } = await collect(stream(provider.create({})));

      expect(texts.join('')).toBe(provider.answerText);
      expect(upstream.calls).toHaveLength(1);
    });

    it('posts one request with the key in its header only', async () => {
      const { upstream, provider: instance } = setUp({ body: [provider.answer] });

      await collect(stream(instance));

      expect(upstream.calls).toHaveLength(1);
      const { url, init } = firstCall(upstream);
      const [header, value] = provider.keyHeader;
      expect(url).toBe(provider.url);
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get(header)).toBe(value);
      expect(init.body).not.toContain(TEST_API_KEY);
      expect(init.body).toContain(PROMPT);
    });
  });

  describe('API keys', () => {
    it.each([
      ['no key', undefined],
      ['a blank key', ' '],
    ])('refuses to call upstream with %s', async (_case, apiKey) => {
      const { upstream, provider: instance } = setUp({ body: [provider.answer] });
      const signal = new AbortController().signal;

      const { error } = await collect(
        instance.stream(provider.request, apiKey === undefined ? { signal } : { signal, apiKey }),
      );

      expect(error).toEqual(new LlmError('invalid-key', `${provider.title} needs your API key.`));
      expect(upstream.calls).toEqual([]);
    });
  });

  describe('upstream errors', () => {
    it.each([
      [401, 'invalid-key'],
      [403, 'invalid-key'],
      [429, 'rate-limited'],
      [400, 'bad-request'],
      [500, 'upstream-error'],
    ] as const)('reports the status %d as %s', async (status, code) => {
      const { provider: instance } = setUp({
        status,
        contentType: 'application/json',
        body: [provider.errorBodies[status]],
      });

      const { texts, error } = await collect(stream(instance));

      expect(texts).toEqual([]);
      expect(error).toBeInstanceOf(LlmError);
      expect(error).toHaveProperty('code', code);
      expect(error).toHaveProperty('message', expect.stringContaining(`(HTTP ${String(status)}, `));
    });

    it('reports an overloaded provider as upstream-error', async () => {
      const { status, body } = provider.overloaded;
      const { provider: instance } = setUp({ status, body: [body] });

      const { error } = await collect(stream(instance));

      expect(error).toHaveProperty('code', 'upstream-error');
      expect(error).toHaveProperty('message', expect.stringContaining(`HTTP ${String(status)}`));
    });

    it('never quotes the key or the request from an error body, only the error type', async () => {
      for (const status of [400, 401] as const) {
        const { provider: instance } = setUp({ status, body: [provider.errorBodies[status]] });

        const { error } = await collect(stream(instance));

        expect(error).toBeInstanceOf(LlmError);
        const message = error instanceof LlmError ? error.message : '';
        expect(message).not.toContain(TEST_API_KEY);
        expect(message).not.toContain(PROMPT);
        expect(error).not.toHaveProperty('cause');
      }
    });

    it('gives the status alone when the error body is not JSON', async () => {
      const { provider: instance } = setUp({
        status: 502,
        contentType: 'text/html',
        body: ['<h1>'],
      });

      const { error } = await collect(stream(instance));

      expect(error).toEqual(
        new LlmError(
          'upstream-error',
          `${provider.title} failed to answer (HTTP 502). Try again later.`,
        ),
      );
    });

    it('reports an answer that is not an event stream as upstream-error, and drops it', async () => {
      const { upstream, provider: instance } = setUp({
        contentType: 'application/json',
        body: ['{"content":[]}'],
        after: 'stay-open',
      });

      const { error } = await collect(stream(instance));

      expect(error).toEqual(
        new LlmError(
          'upstream-error',
          `${provider.title} failed to answer (HTTP 200). Try again later.`,
        ),
      );
      expect(upstream.bodyCancelled).toBe(true);
    });

    it('reports a provider it cannot reach as upstream-error, without the error', async () => {
      const instance = provider.create({
        fetch: () => Promise.reject(new TypeError(`fetch failed for ${TEST_API_KEY}`)),
      });

      const { error } = await collect(stream(instance));

      expect(error).toEqual(
        new LlmError('upstream-error', `${provider.title} failed to answer. Try again later.`),
      );
      expect(error).not.toHaveProperty('cause');
    });

    it('reports a connection lost midway as upstream-error, after the text that came', async () => {
      const cut = provider.answer.indexOf('天空');
      const { provider: instance } = setUp({
        body: [provider.answer.slice(0, cut)],
        after: 'break',
      });

      const { texts, error } = await collect(stream(instance));

      expect(texts.join('')).toBe(
        provider.answerText.slice(0, provider.answerText.indexOf('天空')),
      );
      expect(error).toEqual(
        new LlmError('upstream-error', `The connection to ${provider.title} was lost.`),
      );
    });

    it('reports an answer that ends without its last event as upstream-error', async () => {
      const lastEvent = provider.answer.lastIndexOf('event: ');
      const { provider: instance } = setUp({ body: [provider.answer.slice(0, lastEvent)] });

      const { texts, error } = await collect(stream(instance));

      expect(texts.join('')).toBe(provider.answerText);
      expect(error).toEqual(
        new LlmError('upstream-error', `${provider.title} stopped before the answer was complete.`),
      );
    });
  });

  describe('client disconnects', () => {
    it('aborts the upstream request and ends without an error', async () => {
      const { upstream, provider: instance } = setUp({
        body: [provider.beforeText, provider.answer.slice(provider.beforeText.length)],
        after: 'stay-open',
      });
      const disconnect = new AbortController();
      const chunks = stream(instance, disconnect.signal)[Symbol.asyncIterator]();

      const first = await chunks.next();
      disconnect.abort();
      const rest = await collect({ [Symbol.asyncIterator]: () => chunks });

      expect(first.done).toBe(false);
      expect(rest).toEqual({ texts: [], error: undefined });
      expect(upstream.calls[0]?.init.signal?.aborted).toBe(true);
    });

    it('aborts a request that has no answer yet', async () => {
      const { upstream, provider: instance } = setUp('silent');
      const disconnect = new AbortController();

      const result = collect(stream(instance, disconnect.signal));
      await vi.waitFor(() => {
        expect(upstream.calls).toHaveLength(1);
      });
      disconnect.abort();

      expect(await result).toEqual({ texts: [], error: undefined });
      expect(upstream.calls[0]?.init.signal?.aborted).toBe(true);
    });

    it('sends nothing for a client that is already gone', async () => {
      const { upstream, provider: instance } = setUp({ body: [provider.answer] });

      expect(await collect(stream(instance, AbortSignal.abort()))).toEqual({
        texts: [],
        error: undefined,
      });
      expect(upstream.calls).toEqual([]);
    });
  });

  describe('timeouts', () => {
    it('gives up after 30 seconds without an answer by default', async () => {
      vi.useFakeTimers();
      const { upstream, provider: instance } = setUp('silent');

      const result = collect(stream(instance));
      await vi.advanceTimersByTimeAsync(DEFAULT_UPSTREAM_TIMEOUTS.firstTokenMs - 1);
      expect(upstream.calls[0]?.init.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await result).toEqual({
        texts: [],
        error: new LlmError(
          'timeout',
          `${provider.title} did not start answering within 30 seconds.`,
        ),
      });
      expect(upstream.calls[0]?.init.signal?.aborted).toBe(true);
      expect(DEFAULT_UPSTREAM_TIMEOUTS).toEqual({ firstTokenMs: 30_000, totalMs: 300_000 });
    });

    it('gives up when the answer has started but its text does not come', async () => {
      vi.useFakeTimers();
      const { upstream, provider: instance } = setUp(
        { body: [provider.beforeText], after: 'stay-open' },
        { timeouts: { firstTokenMs: 1000, totalMs: 60_000 } },
      );

      const result = collect(stream(instance));
      await vi.advanceTimersByTimeAsync(1000);

      expect(await result).toEqual({
        texts: [],
        error: new LlmError(
          'timeout',
          `${provider.title} did not start answering within 1 second.`,
        ),
      });
      expect(upstream.calls[0]?.init.signal?.aborted).toBe(true);
    });

    it('stops waiting for the first text once it comes', async () => {
      vi.useFakeTimers();
      const { provider: instance } = setUp(
        { body: [provider.answer.slice(0, provider.answer.indexOf('天空'))], after: 'stay-open' },
        { timeouts: { firstTokenMs: 1000, totalMs: 60_000 } },
      );
      const disconnect = new AbortController();

      const result = collect(stream(instance, disconnect.signal));
      await vi.advanceTimersByTimeAsync(30_000);
      disconnect.abort();

      const { texts, error } = await result;
      expect(texts).toHaveLength(2);
      expect(error).toBeUndefined();
    });

    it('ends a slow answer at the total timeout, after the text that came', async () => {
      vi.useFakeTimers();
      const { upstream, provider: instance } = setUp(
        { body: [provider.answer.slice(0, provider.answer.indexOf('天空'))], after: 'stay-open' },
        { timeouts: { firstTokenMs: 1000, totalMs: 120_000 } },
      );

      const result = collect(stream(instance));
      await vi.advanceTimersByTimeAsync(120_000);

      const { texts, error } = await result;
      expect(texts).toHaveLength(2);
      expect(error).toEqual(
        new LlmError('timeout', `${provider.title} did not finish answering within 120 seconds.`),
      );
      expect(upstream.calls[0]?.init.signal?.aborted).toBe(true);
    });

    it('clears its timers once the answer ends', async () => {
      vi.useFakeTimers();
      const { provider: instance } = setUp({ body: [provider.answer] });

      await collect(stream(instance));

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
