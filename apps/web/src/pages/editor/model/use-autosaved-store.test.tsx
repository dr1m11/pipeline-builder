import { addNode, createEmptyPipeline, serializePipeline } from '@pipeline-builder/core';
import { act, renderHook, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAFT_STORAGE_KEY, UNREADABLE_DRAFT_STORAGE_KEY } from '@/entities/pipeline';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { useAutosavedStore } from './use-autosaved-store';

function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}

function renderStore() {
  // StrictMode at the root, as in the app: effects run twice on mount, and nothing may be reported
  // or saved twice. (Inside the wrapper, StrictMode would not run them twice.)
  const { result, unmount } = renderHook(() => useAutosavedStore(), {
    wrapper: Providers,
    reactStrictMode: true,
  });
  const store = result.current;
  return {
    store,
    unmount,
    addInput: () => {
      act(() => {
        store.getState().addNode('input', { x: 0, y: 0 });
      });
    },
  };
}

function toasts() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' })).queryAllByRole(
    'listitem',
  );
}

/** "Ask a question" with one Input node. */
function questionPipeline() {
  return addNode(createEmptyPipeline({ id: 'saved', name: 'Ask a question' }), {
    kind: 'input',
    id: 'question',
    position: { x: 40, y: 80 },
  }).pipeline;
}

/** An edge from a node that is not in the pipeline, which loading drops. */
function danglingEdge(id: string) {
  return { id, source: 'gone', sourcePort: 'value', target: 'question', targetPort: 'value' };
}

function failSaves(name: string) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage refused the operation', name);
  });
}

describe('useAutosavedStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with an untitled pipeline when nothing is saved', () => {
    const { store } = renderStore();

    expect(store.getState().pipeline).toMatchObject({ name: 'Untitled pipeline', nodes: [] });
    expect(toasts()).toEqual([]);
  });

  it('starts from the saved pipeline', () => {
    const saved = questionPipeline();
    window.localStorage.setItem(DRAFT_STORAGE_KEY, serializePipeline(saved));

    const { store } = renderStore();

    expect(store.getState().pipeline).toEqual(saved);
    expect(toasts()).toEqual([]);
  });

  it('tells once that a connection of the saved pipeline was removed, and keeps a copy', () => {
    const text = serializePipeline({ ...questionPipeline(), edges: [danglingEdge('lost')] });
    window.localStorage.setItem(DRAFT_STORAGE_KEY, text);

    const { store } = renderStore();

    expect(store.getState().pipeline).toEqual(questionPipeline());
    const [toast, ...others] = toasts();
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent('A connection was removed');
    expect(toast).toHaveTextContent(
      '1 connection in your last pipeline pointed at a missing node or an occupied input. A copy of the saved data was kept in this browser.',
    );
    expect(window.localStorage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe(text);
  });

  it('counts the connections of the saved pipeline that were removed', () => {
    const edges = [danglingEdge('lost'), danglingEdge('also-lost')];
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      serializePipeline({ ...questionPipeline(), edges }),
    );
    failSaves('QuotaExceededError');

    renderStore();

    const [toast, ...others] = toasts();
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent('Some connections were removed');
    expect(toast).toHaveTextContent(
      '2 connections in your last pipeline pointed at missing nodes or occupied inputs.',
    );
    // Without room for a copy, the toast does not promise one.
    expect(toast).not.toHaveTextContent('A copy of the saved data was kept');
  });

  it('saves each change once', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { store, addInput } = renderStore();

    addInput();
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(setItem).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(
      serializePipeline(store.getState().pipeline),
    );
  });

  it('stops saving when it unmounts', () => {
    const { unmount, addInput } = renderStore();
    addInput();

    unmount();
    act(() => {
      vi.runAllTimers();
    });

    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('tells once that an unreadable draft was kept aside', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, 'not a pipeline');

    const { store } = renderStore();

    expect(store.getState().pipeline.nodes).toEqual([]);
    const [toast, ...others] = toasts();
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent('Couldn’t restore your last pipeline');
    expect(toast).toHaveTextContent('A copy of the saved data was kept in this browser.');
    expect(window.localStorage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe('not a pipeline');
  });

  it('tells when an unreadable draft could not be kept', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, 'not a pipeline');
    failSaves('QuotaExceededError');

    renderStore();

    const [toast, ...others] = toasts();
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent('Couldn’t restore your last pipeline');
    expect(toast).toHaveTextContent('Your next change will replace the saved data.');
  });

  it('tells once that changes are not saved when storage is full', () => {
    const setItem = failSaves('QuotaExceededError');
    const { addInput } = renderStore();

    addInput();
    act(() => {
      vi.runAllTimers();
    });
    addInput();
    act(() => {
      vi.runAllTimers();
    });

    expect(setItem).toHaveBeenCalledTimes(2);
    const [toast, ...others] = toasts();
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent('Couldn’t save your changes');
    expect(toast).toHaveTextContent(
      'Browser storage is full, so changes are no longer saved in this browser.',
    );
  });

  it('tells that changes are not saved when the browser blocks storage', () => {
    failSaves('SecurityError');
    const { addInput } = renderStore();

    addInput();
    act(() => {
      vi.runAllTimers();
    });

    const [toast, ...others] = toasts();
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent('Couldn’t save your changes');
    expect(toast).toHaveTextContent(
      'This browser blocks storage, so changes are lost when the page closes.',
    );
  });
});
