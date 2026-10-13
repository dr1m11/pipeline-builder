import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no layout engine. React Flow renders a node only after measuring it (ResizeObserver,
// offsetWidth/offsetHeight, and the zoom from DOMMatrixReadOnly), so stand in for those APIs as
// https://reactflow.dev/learn/advanced-use/testing recommends.
class ResizeObserverShim implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element): void {
    setTimeout(() => {
      const contentRect = target.getBoundingClientRect();
      // Radix reads borderBoxSize[0], so every size list carries one entry.
      const sizes = [{ inlineSize: contentRect.width, blockSize: contentRect.height }];
      const entry: ResizeObserverEntry = {
        target,
        contentRect,
        borderBoxSize: sizes,
        contentBoxSize: sizes,
        devicePixelContentBoxSize: sizes,
      };
      this.#callback([entry], this);
    }, 0);
  }

  unobserve(): void {
    // Each observation reports once, so there is nothing to stop.
  }

  disconnect(): void {
    // Each observation reports once, so there is nothing to stop.
  }
}

class DOMMatrixReadOnlyShim {
  readonly m22: number;

  constructor(transform?: string) {
    const scale = /scale\(([\d.]+)\)/.exec(transform ?? '')?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

if (!('ResizeObserver' in globalThis)) globalThis.ResizeObserver = ResizeObserverShim;
if (!('DOMMatrixReadOnly' in globalThis)) {
  Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
    configurable: true,
    value: DOMMatrixReadOnlyShim,
  });
}
// With no layout, no element is under any point. React Flow's click-to-connect asks for the handle
// under the pointer and falls back to the handle that was clicked.
if (!('elementFromPoint' in document)) {
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
}
// jsdom has no pointer capture. Radix Toast uses it on every pointer up in a toast (swipe to dismiss).
if (!('hasPointerCapture' in Element.prototype)) {
  Object.defineProperties(Element.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  });
}
// Deliberately global: React Flow skips nodes that measure 0×0, and no other component under test
// reads offset sizes.
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: {
    configurable: true,
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.width) || 1;
    },
  },
  offsetHeight: {
    configurable: true,
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.height) || 1;
    },
  },
});

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
