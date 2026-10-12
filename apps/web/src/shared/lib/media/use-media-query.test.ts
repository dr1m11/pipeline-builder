import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './use-media-query';

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal('matchMedia', matchMedia);

  return {
    listeners,
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the current match state', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query starts or stops matching', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);

    act(() => {
      media.setMatches(true);
    });
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const media = installMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(media.listeners.size).toBe(1);

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
