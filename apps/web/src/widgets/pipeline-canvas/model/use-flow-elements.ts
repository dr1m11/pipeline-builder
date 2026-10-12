import { useMemo } from 'react';

import type { PipelineFlowNode } from '@/entities/node';
import { usePipelineStore } from '@/entities/pipeline';

import { type PipelineFlowEdge, toFlowEdges, toFlowNodes } from './flow-elements';

/** React Flow nodes and edges derived from the pipeline store. */
export function useFlowElements(): { nodes: PipelineFlowNode[]; edges: PipelineFlowEdge[] } {
  // Select each slice on its own: a selector that derives a new array on every call would loop.
  const pipeline = usePipelineStore((state) => state.pipeline);
  const selectedNodeIds = usePipelineStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = usePipelineStore((state) => state.selectedEdgeIds);
  const measured = usePipelineStore((state) => state.measured);
  const dragPositions = usePipelineStore((state) => state.dragPositions);

  const pipelineNodes = pipeline.nodes;
  const nodes = useMemo(
    () => toFlowNodes({ nodes: pipelineNodes, selectedNodeIds, measured, dragPositions }),
    [pipelineNodes, selectedNodeIds, measured, dragPositions],
  );
  // Edges name and colour themselves after their nodes' ports, so they follow the whole pipeline.
  const edges = useMemo(() => toFlowEdges(pipeline, selectedEdgeIds), [pipeline, selectedEdgeIds]);
  return { nodes, edges };
}
