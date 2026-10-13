import { createEmptyPipeline } from '@pipeline-builder/core';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createPipelineStore } from './pipeline-store';
import { PipelineStoreProvider } from './PipelineStoreProvider';
import { useValidationReport } from './use-validation-report';

function renderReport() {
  const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Test' }));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PipelineStoreProvider store={store}>{children}</PipelineStoreProvider>
  );
  return { store, ...renderHook(() => useValidationReport(), { wrapper }) };
}

describe('useValidationReport', () => {
  it('reports the problems of the pipeline and follows its changes', () => {
    const { store, result } = renderReport();
    expect(result.current.issues).toEqual([]);

    act(() => {
      store.getState().addNode('prompt', { x: 0, y: 0 });
    });

    expect(result.current.issues.map((issue) => issue.code)).toEqual([
      'missing-input',
      'no-output',
    ]);
  });

  it('keeps the same report while the pipeline does not change', () => {
    const { store, result, rerender } = renderReport();
    act(() => {
      store.getState().addNode('output', { x: 0, y: 0 });
    });
    const report = result.current;

    act(() => {
      store.getState().select({ nodeIds: [store.getState().pipeline.nodes[0]?.id ?? ''] });
    });
    rerender();

    expect(result.current).toBe(report);
  });
});
