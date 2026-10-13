import type { Position } from '../geometry';
import type { NodeDefinition } from '../nodes/node-definition';
import { NODE_LABEL_SCHEMA } from '../nodes/node-label';
import {
  createNode,
  nextNodeLabel,
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOf,
  type NodeOfKind,
  type PipelineNode,
} from '../nodes/registry';
import type { Pipeline } from '../pipeline';
import { err, ok, type Result } from '../result';

/** Why node data could not be changed. */
export type NodeDataError = 'unknown-node' | 'invalid-data';

/** Why a node could not be renamed. */
export type NodeLabelError = 'unknown-node' | 'invalid-label';

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

/**
 * Changes fields of a node's data. The changes are merged into the current data and must fit the
 * kind's data schema: unknown fields and wrong types are `'invalid-data'`, while values that only
 * break a rule (a blank template) are accepted and left to validation. Edges stay even when a port
 * they use disappears. Other nodes and the edges keep their identity, and the same pipeline is
 * returned when no value changes.
 */
export function updateNodeData(
  pipeline: Pipeline,
  nodeId: string,
  changes: Readonly<Record<string, unknown>>,
): Result<Pipeline, NodeDataError> {
  const node = findNode(pipeline, nodeId);
  if (node === undefined) return err('unknown-node');
  const updated = withDataChanges(node, changes);
  if (updated === 'invalid') return err('invalid-data');
  return ok(updated === 'unchanged' ? pipeline : replaceNode(pipeline, node, updated));
}

/**
 * Renames a node. The label is trimmed and must be neither blank nor too long (`NODE_LABEL_SCHEMA`).
 * Other nodes and the edges keep their identity, and the same pipeline is returned when the label
 * does not change.
 */
export function renameNode(
  pipeline: Pipeline,
  nodeId: string,
  label: string,
): Result<Pipeline, NodeLabelError> {
  const node = findNode(pipeline, nodeId);
  if (node === undefined) return err('unknown-node');
  const parsed = NODE_LABEL_SCHEMA.safeParse(label);
  if (!parsed.success) return err('invalid-label');
  if (parsed.data === node.label) return ok(pipeline);
  return ok(replaceNode(pipeline, node, { ...node, label: parsed.data }));
}

// Generic over the kind so the definition and the data stay correlated without a cast. Returns the
// changed node, or why there is none: no value changes, or the result does not fit the kind's shape.
function withDataChanges<K extends NodeKind>(
  node: NodeOfKind<K>,
  changes: Readonly<Record<string, unknown>>,
): NodeOf<K> | 'unchanged' | 'invalid' {
  const definition: NodeDefinition<NodeDataMap[K]> = NODE_DEFINITIONS[node.kind];
  const { dataSchema } = definition;
  // The schema would drop unknown fields silently; a change to a field the kind lacks is a mistake.
  if (Object.keys(changes).some((name) => !Object.hasOwn(dataSchema.shape, name))) return 'invalid';
  const parsed = dataSchema.safeParse({ ...node.data, ...changes });
  if (!parsed.success) return 'invalid';
  if (sameFields(parsed.data, node.data)) return 'unchanged';
  const { id, kind, label, position } = node;
  return { id, kind, label, position, data: parsed.data };
}

/** Whether two data objects have the same fields with identical values. */
function sameFields(a: object, b: object): boolean {
  const entries: [string, unknown][] = Object.entries(a);
  const other = new Map<string, unknown>(Object.entries(b));
  return (
    entries.length === other.size &&
    entries.every(([key, value]) => other.has(key) && Object.is(value, other.get(key)))
  );
}

function replaceNode(pipeline: Pipeline, node: PipelineNode, next: PipelineNode): Pipeline {
  return {
    ...pipeline,
    nodes: pipeline.nodes.map((candidate) => (candidate === node ? next : candidate)),
  };
}
