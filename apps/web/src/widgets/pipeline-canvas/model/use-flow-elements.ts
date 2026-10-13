import { useMemo } from 'react';

import type { PipelineFlowNode } from '@/entities/node';
import { usePipelineStore, useValidationReport } from '@/entities/pipeline';

import { type PipelineFlowEdge, toFlowEdges, toFlowNodes } from './flow-elements';

/** React Flow nodes and edges derived from the pipeline store and its validation report. */
export function useFlowElements(): { nodes: PipelineFlowNode[]; edges: PipelineFlowEdge[] } {
  // Select each slice on its own: a selector that derives a new array on every call would loop.
  const pipeline = usePipelineStore((state) => state.pipeline);
  const selectedNodeIds = usePipelineStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = usePipelineStore((state) => state.selectedEdgeIds);
  const measured = usePipelineStore((state) => state.measured);
  const dragPositions = usePipelineStore((state) => state.dragPositions);
  const { byNode, byEdge } = useValidationReport();

  const pipelineNodes = pipeline.nodes;
  const nodes = useMemo(
    () =>
      toFlowNodes({
        nodes: pipelineNodes,
        selectedNodeIds,
        measured,
        dragPositions,
        issuesByNode: byNode,
      }),
    [pipelineNodes, selectedNodeIds, measured, dragPositions, byNode],
  );
  // Edges name and colour themselves after their nodes' ports, so they follow the whole pipeline.
  const edges = useMemo(
    () => toFlowEdges(pipeline, selectedEdgeIds, byEdge),
    [pipeline, selectedEdgeIds, byEdge],
  );
  return { nodes, edges };
}
