import type { PipelineEdge, PipelineNode, Position } from '@pipeline-builder/core';
import type { Edge } from '@xyflow/react';

import { type PipelineFlowNode, toFlowNode } from '@/entities/node';
import type { Size } from '@/entities/pipeline';

/** A pipeline edge as React Flow sees it; handles are port ids. */
export type PipelineFlowEdge = Edge;

/** The parts of the store a node on the canvas depends on. */
export interface FlowNodesSource {
  readonly nodes: readonly PipelineNode[];
  readonly selectedNodeIds: ReadonlySet<string>;
  readonly measured: ReadonlyMap<string, Size>;
  readonly dragPositions: ReadonlyMap<string, Position>;
}

interface CachedNode {
  readonly selected: boolean;
  readonly measured: Size | undefined;
  readonly dragPosition: Position | undefined;
  readonly flowNode: PipelineFlowNode;
}

interface CachedEdge {
  readonly selected: boolean;
  readonly flowEdge: PipelineFlowEdge;
}

// React Flow re-renders a node whenever it receives a new object for it. Core keeps unchanged
// domain nodes and edges identical, so caching the derived object per domain object means a store
// update re-renders only the elements it touched (see docs/adr/0006).
const nodeCache = new WeakMap<PipelineNode, CachedNode>();
const edgeCache = new WeakMap<PipelineEdge, CachedEdge>();

/** Derives React Flow nodes, reusing the object of every node whose inputs have not changed. */
export function toFlowNodes(source: FlowNodesSource): PipelineFlowNode[] {
  return source.nodes.map((node) => {
    const selected = source.selectedNodeIds.has(node.id);
    const measured = source.measured.get(node.id);
    const dragPosition = source.dragPositions.get(node.id);
    const cached = nodeCache.get(node);
    if (
      cached?.selected === selected &&
      cached.measured === measured &&
      cached.dragPosition === dragPosition
    ) {
      return cached.flowNode;
    }
    const flowNode = toFlowNode(node, { selected, measured, dragPosition });
    nodeCache.set(node, { selected, measured, dragPosition, flowNode });
    return flowNode;
  });
}

/** Derives React Flow edges, reusing the object of every edge whose inputs have not changed. */
export function toFlowEdges(
  edges: readonly PipelineEdge[],
  selectedEdgeIds: ReadonlySet<string>,
): PipelineFlowEdge[] {
  return edges.map((edge) => {
    const selected = selectedEdgeIds.has(edge.id);
    const cached = edgeCache.get(edge);
    if (cached?.selected === selected) return cached.flowEdge;
    const flowEdge: PipelineFlowEdge = {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourcePort,
      target: edge.target,
      targetHandle: edge.targetPort,
      selected,
    };
    edgeCache.set(edge, { selected, flowEdge });
    return flowEdge;
  });
}
