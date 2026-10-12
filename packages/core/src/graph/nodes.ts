import type { Position } from '../geometry';
import { createNode, nextNodeLabel, type NodeKind, type PipelineNode } from '../nodes/registry';
import type { Pipeline } from '../pipeline';

// Lookups run on every pointer move while a connection is dragged, so index each pipeline once.
const nodeIndexes = new WeakMap<Pipeline, ReadonlyMap<string, PipelineNode>>();

/** Finds a node by id. Lookups are indexed per pipeline object, so repeated calls are cheap. */
export function findNode(pipeline: Pipeline, id: string): PipelineNode | undefined {
  let index = nodeIndexes.get(pipeline);
  if (index === undefined) {
    index = new Map(pipeline.nodes.map((node) => [node.id, node]));
    nodeIndexes.set(pipeline, index);
  }
  return index.get(id);
}

/**
 * Adds a node with the default data of its kind and the next free label ("Prompt 3").
 * The caller supplies a unique id; reusing one is a programming error and throws.
 */
export function addNode(
  pipeline: Pipeline,
  params: { kind: NodeKind; id: string; position: Position },
): { pipeline: Pipeline; node: PipelineNode } {
  if (findNode(pipeline, params.id) !== undefined) {
    throw new Error(`Node id "${params.id}" is already used`);
  }
  const node = createNode(params.kind, {
    id: params.id,
    label: nextNodeLabel(params.kind, pipeline.nodes),
    position: params.position,
  });
  return { pipeline: { ...pipeline, nodes: [...pipeline.nodes, node] }, node };
}

/**
 * Moves nodes to new positions. Unknown ids are ignored; nodes that do not move keep their identity,
 * and the same pipeline is returned when nothing moves.
 */
export function moveNodes(pipeline: Pipeline, positions: ReadonlyMap<string, Position>): Pipeline {
  const nodes = pipeline.nodes.map((node) => {
    const position = positions.get(node.id);
    if (
      position === undefined ||
      (position.x === node.position.x && position.y === node.position.y)
    ) {
      return node;
    }
    return { ...node, position };
  });
  const moved = nodes.some((node, index) => node !== pipeline.nodes[index]);
  return moved ? { ...pipeline, nodes } : pipeline;
}

/**
 * Removes nodes and edges by id, together with every edge attached to a removed node.
 * Unknown ids are ignored; the same pipeline is returned when nothing is removed.
 */
export function removeElements(
  pipeline: Pipeline,
  ids: { nodeIds?: readonly string[]; edgeIds?: readonly string[] },
): Pipeline {
  const nodeIds = new Set(ids.nodeIds);
  const edgeIds = new Set(ids.edgeIds);
  const nodes = pipeline.nodes.filter((node) => !nodeIds.has(node.id));
  const edges = pipeline.edges.filter(
    (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target),
  );
  if (nodes.length === pipeline.nodes.length && edges.length === pipeline.edges.length) {
    return pipeline;
  }
  return { ...pipeline, nodes, edges };
}
