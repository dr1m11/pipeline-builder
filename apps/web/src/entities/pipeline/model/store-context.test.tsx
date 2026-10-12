import { createEmptyPipeline } from '@pipeline-builder/core';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createPipelineStore } from './pipeline-store';
import { PipelineStoreProvider } from './PipelineStoreProvider';
import { usePipelineStore } from './store-context';

function NodeCount() {
  const count = usePipelineStore((state) => state.pipeline.nodes.length);
  return <p>{count} nodes</p>;
}

describe('usePipelineStore', () => {
  it('reads the store of the provider and follows its changes', () => {
    const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Test' }));
    render(
      <PipelineStoreProvider store={store}>
        <NodeCount />
      </PipelineStoreProvider>,
    );
    expect(screen.getByText('0 nodes')).toBeInTheDocument();

    act(() => {
      store.getState().addNode('input', { x: 0, y: 0 });
    });

    expect(screen.getByText('1 nodes')).toBeInTheDocument();
  });

  it('fails outside a provider', () => {
    expect(() => renderHook(() => usePipelineStore((state) => state.pipeline))).toThrow(
      'The pipeline store is used outside PipelineStoreProvider',
    );
  });
});
