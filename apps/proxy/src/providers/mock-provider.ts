import { mockCompletion, splitIntoTokens } from '@pipeline-builder/core';

import type { Provider } from './provider';

export interface MockProviderOptions {
  /** Pause before each token, in milliseconds; 0 sends the whole answer at once. */
  readonly tokenDelayMs: number;
}

/**
 * The mock provider: streams `mockCompletion` word by word, with a pause before each word, so the
 * answer arrives like a model's. It needs no key and stops as soon as the client disconnects.
 */
export function createMockProvider({ tokenDelayMs }: MockProviderOptions): Provider {
  return {
    real: false,
    async *stream(request, { signal }) {
      for (const token of splitIntoTokens(mockCompletion(request))) {
        await pause(tokenDelayMs, signal);
        if (signal.aborted) return;
        yield token;
      }
    },
  };
}

// Resolves after `ms`, or as soon as `signal` aborts.
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
