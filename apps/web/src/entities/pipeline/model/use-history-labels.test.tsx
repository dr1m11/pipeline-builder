import { createEmptyPipeline } from '@pipeline-builder/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createPipelineStore } from './pipeline-store';
import { PipelineStoreProvider } from './PipelineStoreProvider';
import { useHistoryLabels } from './use-history-labels';

function renderLabels() {
  const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Test' }));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PipelineStoreProvider store={store}>{children}</PipelineStoreProvider>
  );
  return { store, ...renderHook(() => useHistoryLabels(), { wrapper }) };
}

describe('useHistoryLabels', () => {
  it('has no labels while there is nothing to undo or redo', () => {
    const { result } = renderLabels();

    expect(result.current).toEqual({ undo: null, redo: null });
  });

  it('names the change that undo and redo would make', () => {
    const { store, result } = renderLabels();

    act(() => {
      store.getState().addNode('input', { x: 0, y: 0 });
      store.getState().addNode('prompt', { x: 300, y: 0 });
    });
    expect(result.current).toEqual({ undo: 'Add Prompt', redo: null });

    act(() => {
      store.getState().undo();
    });
    expect(result.current).toEqual({ undo: 'Add Input', redo: 'Add Prompt' });
  });

  it('keeps the same labels object while the labels do not change', () => {
    const { store, result, rerender } = renderLabels();
    act(() => {
      store.getState().addNode('input', { x: 0, y: 0 });
    });
    const labels = result.current;

    act(() => {
      store.getState().select({ nodeIds: [store.getState().pipeline.nodes[0]?.id ?? ''] });
    });
    rerender();

    expect(result.current).toBe(labels);
  });
});
