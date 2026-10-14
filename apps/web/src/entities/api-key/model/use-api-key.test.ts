import type { LlmProvider } from '@pipeline-builder/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { clearApiKey, saveApiKey } from '../api/api-key-storage';
import { useApiKey } from './use-api-key';

afterEach(() => {
  clearApiKey('anthropic');
  clearApiKey('openai');
});

describe('useApiKey', () => {
  it('starts with the key already saved', () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: true });

    const { result } = renderHook(() => useApiKey('anthropic'));

    expect(result.current).toBe('sk-ant-1');
  });

  it('follows the key as it is saved, replaced and cleared in this tab', () => {
    const { result } = renderHook(() => useApiKey('anthropic'));
    expect(result.current).toBeNull();

    act(() => {
      saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    });
    expect(result.current).toBe('sk-ant-1');

    act(() => {
      saveApiKey('anthropic', 'sk-ant-2', { remember: true });
    });
    expect(result.current).toBe('sk-ant-2');

    act(() => {
      clearApiKey('anthropic');
    });
    expect(result.current).toBeNull();
  });

  it('follows a key that another tab remembers or clears', () => {
    const { result } = renderHook(() => useApiKey('anthropic'));
    // What the other tab did, as this tab learns of it: storage first, then a `storage` event.
    const otherTabSets = (value: string | null) => {
      if (value === null) window.localStorage.removeItem('pb:api-key:anthropic');
      else window.localStorage.setItem('pb:api-key:anthropic', value);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'pb:api-key:anthropic',
          newValue: value,
          storageArea: window.localStorage,
        }),
      );
    };

    act(() => {
      otherTabSets('sk-ant-1');
    });
    expect(result.current).toBe('sk-ant-1');

    act(() => {
      otherTabSets(null);
    });
    expect(result.current).toBeNull();
  });

  it('renders again only for changes to its own provider', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useApiKey('anthropic');
    });
    const before = renders;

    act(() => {
      saveApiKey('openai', 'sk-oai-1', { remember: false });
    });

    expect(result.current).toBeNull();
    expect(renders).toBe(before);
  });

  it('follows the provider it is given', () => {
    saveApiKey('openai', 'sk-oai-1', { remember: false });
    const { result, rerender } = renderHook(
      ({ provider }: { provider: LlmProvider }) => useApiKey(provider),
      { initialProps: { provider: 'anthropic' } },
    );
    expect(result.current).toBeNull();

    rerender({ provider: 'openai' });

    expect(result.current).toBe('sk-oai-1');
  });
});
