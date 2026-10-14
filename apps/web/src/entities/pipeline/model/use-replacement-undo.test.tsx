import { addNode, createEmptyPipeline, type Pipeline } from '@pipeline-builder/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPipelineStore } from './pipeline-store';
import { PipelineStoreProvider } from './PipelineStoreProvider';
import { useReplacementUndo } from './use-replacement-undo';

const draft: Pipeline = addNode(createEmptyPipeline({ id: 'draft', name: 'Draft' }), {
  kind: 'input',
  id: 'input',
  position: { x: 0, y: 0 },
}).pipeline;

const imported = createEmptyPipeline({ id: 'imported', name: 'Imported' });

/** The store after `imported` replaced `draft`, and the hook's function for it. */
function renderUndo() {
  const store = createPipelineStore(draft);
  store.getState().replacePipeline(imported, 'import');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PipelineStoreProvider store={store}>{children}</PipelineStoreProvider>
  );
  const { result } = renderHook(() => useReplacementUndo(), { wrapper });
  return { store, undoAction: result.current };
}

describe('useReplacementUndo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes an Undo button that brings back the replaced pipeline', () => {
    const { store, undoAction } = renderUndo();

    const action = undoAction(imported, 'undo the import');
    expect(action.label).toBe('Undo');
    act(() => {
      action.onClick();
    });

    expect(store.getState().pipeline).toBe(draft);
  });

  it('undoes nothing else once the pipeline has changed again', () => {
    const { store, undoAction } = renderUndo();
    const action = undoAction(imported, 'undo the import');
    store.getState().addNode('output', { x: 0, y: 0 });
    const changed = store.getState().pipeline;

    act(() => {
      action.onClick();
    });

    expect(store.getState().pipeline).toBe(changed);
  });

  it.each([
    ['Win32', 'Press Ctrl+Z to undo the import'],
    ['MacIntel', 'Press ⌘Z to undo the import'],
  ])('tells screen readers on %s the shortcut that does the same', (platform, altText) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    const { undoAction } = renderUndo();

    expect(undoAction(imported, 'undo the import').altText).toBe(altText);
  });
});
