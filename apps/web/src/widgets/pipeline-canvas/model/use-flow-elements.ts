import { useMemo } from 'react';

import type { PipelineFlowNode } from '@/entities/node';
import { usePipelineStore } from '@/entities/pipeline';

import { type PipelineFlowEdge, toFlowEdges, toFlowNodes } from './flow-elements';

/** React Flow nodes and edges derived from the pipeline store. */
export function useFlowElements(): { nodes: PipelineFlowNode[]; edges: PipelineFlowEdge[] } {
  // Select each slice on its own: a selector that derives a new array on every call would loop.
  const pipelineNodes = usePipelineStore((state) => state.pipeline.nodes);
  const pipelineEdges = usePipelineStore((state) => state.pipeline.edges);
  const selectedNodeIds = usePipelineStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = usePipelineStore((state) => state.selectedEdgeIds);
  const measured = usePipelineStore((state) => state.measured);
  const dragPositions = usePipelineStore((state) => state.dragPositions);

  const nodes = useMemo(
    () => toFlowNodes({ nodes: pipelineNodes, selectedNodeIds, measured, dragPositions }),
    [pipelineNodes, selectedNodeIds, measured, dragPositions],
  );
  const edges = useMemo(
    () => toFlowEdges(pipelineEdges, selectedEdgeIds),
    [pipelineEdges, selectedEdgeIds],
  );
  return { nodes, edges };
}
