import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no layout engine; React Flow only needs ResizeObserver to exist.
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverMock;
}

// jsdom does not implement matchMedia: default to "no media query matches"; tests can stub it.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }),
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});
