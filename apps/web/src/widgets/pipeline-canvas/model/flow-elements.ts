import {
  findNode,
  getNodePorts,
  type Pipeline,
  type PipelineEdge,
  type PipelineNode,
  type PortDefinition,
  type PortType,
  type Position,
} from '@pipeline-builder/core';
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
  readonly className: string;
  readonly ariaLabel: string;
  readonly flowEdge: PipelineFlowEdge;
}

// Edges are coloured like the ports they leave; app/styles/tokens.css styles these classes.
const EDGE_CLASSES: Record<PortType, string> = {
  text: 'edge-text',
  number: 'edge-number',
  json: 'edge-json',
  any: 'edge-any',
};

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

/**
 * Derives React Flow edges, coloured by the type of their source port and named after the ports
 * they join ("Input 1 value to Prompt 1 question"). The object of every edge whose inputs have not
 * changed is reused.
 */
export function toFlowEdges(
  pipeline: Pipeline,
  selectedEdgeIds: ReadonlySet<string>,
): PipelineFlowEdge[] {
  return pipeline.edges.map((edge) => {
    const source = findNode(pipeline, edge.source);
    const target = findNode(pipeline, edge.target);
    const sourcePort = source && getNodePorts(source).outputs.find((p) => p.id === edge.sourcePort);
    const targetPort = target && getNodePorts(target).inputs.find((p) => p.id === edge.targetPort);

    const selected = selectedEdgeIds.has(edge.id);
    const className = EDGE_CLASSES[sourcePort?.type ?? 'any'];
    const ariaLabel = `${endpointName(source, sourcePort, edge.source, edge.sourcePort)} to ${endpointName(target, targetPort, edge.target, edge.targetPort)}`;
    const cached = edgeCache.get(edge);
    if (
      cached?.selected === selected &&
      cached.className === className &&
      cached.ariaLabel === ariaLabel
    ) {
      return cached.flowEdge;
    }
    const flowEdge: PipelineFlowEdge = {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourcePort,
      target: edge.target,
      targetHandle: edge.targetPort,
      selected,
      className,
      ariaLabel,
    };
    edgeCache.set(edge, { selected, className, ariaLabel, flowEdge });
    return flowEdge;
  });
}

/** "Prompt 1 question"; ids stand in for a node or port the pipeline no longer has. */
function endpointName(
  node: PipelineNode | undefined,
  port: PortDefinition | undefined,
  nodeId: string,
  portId: string,
): string {
  return `${node?.label ?? nodeId} ${port?.label ?? portId}`;
}
