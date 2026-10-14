import { findNode, type PipelineNode } from '@pipeline-builder/core';

import { usePipelineStore } from '@/entities/pipeline';

/**
 * The selected node when exactly one is selected. The node object is stable while it is unchanged,
 * so the component re-renders only when it changes.
 */
export function useSelectedNode(): PipelineNode | undefined {
  return usePipelineStore((state) => {
    if (state.selectedNodeIds.size !== 1) return undefined;
    const [id] = state.selectedNodeIds;
    return id === undefined ? undefined : findNode(state.pipeline, id);
  });
}
