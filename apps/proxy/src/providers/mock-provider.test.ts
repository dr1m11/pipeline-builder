import { type LlmRequest, mockCompletion, splitIntoTokens } from '@pipeline-builder/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockProvider } from './mock-provider';

const REQUEST: LlmRequest = {
  provider: 'mock',
  model: 'mock',
  prompt: 'Why is the sky blue?',
  temperature: 0.7,
  maxTokens: 512,
};

const TOKENS = splitIntoTokens(mockCompletion(REQUEST));

async function collect(chunks: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = [];
  for await (const chunk of chunks) collected.push(chunk);
  return collected;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createMockProvider', () => {
  it('streams the mock completion word by word', async () => {
    const provider = createMockProvider({ tokenDelayMs: 0 });

    const tokens = await collect(
      provider.stream(REQUEST, { signal: new AbortController().signal }),
    );

    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens).toEqual(TOKENS);
  });

  it('pauses before each token', async () => {
    vi.useFakeTimers();
    const provider = createMockProvider({ tokenDelayMs: 40 });
    const tokens = provider
      .stream(REQUEST, { signal: new AbortController().signal })
      [Symbol.asyncIterator]();

    let arrived = false;
    const first = tokens.next().then((result) => {
      arrived = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(39);
    expect(arrived).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toEqual({ done: false, value: TOKENS[0] });

    const second = tokens.next();
    await vi.advanceTimersByTimeAsync(40);
    expect(await second).toEqual({ done: false, value: TOKENS[1] });
  });

  it('stops as soon as the signal aborts, without waiting out the pause', async () => {
    vi.useFakeTimers();
    const disconnect = new AbortController();
    const tokens = createMockProvider({ tokenDelayMs: 1000 })
      .stream(REQUEST, { signal: disconnect.signal })
      [Symbol.asyncIterator]();

    const first = tokens.next();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toEqual({ done: false, value: TOKENS[0] });

    const next = tokens.next();
    disconnect.abort();
    expect(await next).toEqual({ done: true, value: undefined });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('streams nothing once the signal has aborted', async () => {
    const provider = createMockProvider({ tokenDelayMs: 0 });

    const tokens = await collect(provider.stream(REQUEST, { signal: AbortSignal.abort() }));

    expect(tokens).toEqual([]);
  });
});
