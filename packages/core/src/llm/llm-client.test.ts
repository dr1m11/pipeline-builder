import { describe, expectTypeOf, it } from 'vitest';

import type { AbortSignalLike, LlmClient } from './llm-client';
import type { LlmRequest } from './llm-request';

// Core has no DOM types, so the web app checks that a DOM `AbortSignal` is assignable to
// `AbortSignalLike`; here the interface is held to the members it may take from it.

describe('AbortSignalLike', () => {
  it('asks only for the members of AbortSignal that core reads', () => {
    expectTypeOf<keyof AbortSignalLike>().toEqualTypeOf<
      'aborted' | 'reason' | 'addEventListener' | 'removeEventListener'
    >();
    expectTypeOf<AbortSignalLike['aborted']>().toEqualTypeOf<boolean>();
    expectTypeOf<AbortSignalLike['reason']>().toBeUnknown();
    expectTypeOf<AbortSignalLike['addEventListener']>().toEqualTypeOf<
      (type: 'abort', listener: () => void, options?: { readonly once?: boolean }) => void
    >();
    expectTypeOf<AbortSignalLike['removeEventListener']>().toEqualTypeOf<
      (type: 'abort', listener: () => void) => void
    >();
  });

  it('is met by a plain object, so tests need no AbortController', () => {
    const signal = {
      aborted: true,
      reason: 'Stopped by the user',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };

    expectTypeOf(signal).toExtend<AbortSignalLike>();
  });
});

describe('LlmClient', () => {
  it('streams text for a request and a signal', () => {
    expectTypeOf<LlmClient['stream']>().parameters.toEqualTypeOf<
      [request: LlmRequest, signal: AbortSignalLike]
    >();
    expectTypeOf<LlmClient['stream']>().returns.toEqualTypeOf<AsyncIterable<string>>();
  });

  it('is met by an async generator of strings', () => {
    const client = {
      async *stream(request: LlmRequest, signal: AbortSignalLike) {
        if (!signal.aborted) yield await Promise.resolve(request.prompt);
      },
    };

    expectTypeOf(client).toExtend<LlmClient>();
  });
});
