import type { Position } from '../geometry';
import { NODE_LABEL_MAX_LENGTH } from '../nodes/node-label';
import { nextNodeLabel, NODE_DEFINITIONS, type PipelineNode } from '../nodes/registry';
import type { Pipeline, PipelineEdge } from '../pipeline';

/** Nodes and edges ready to be added to a pipeline, e.g. with the `add-elements` command. */
export interface PipelineElements {
  readonly nodes: readonly PipelineNode[];
  readonly edges: readonly PipelineEdge[];
}

/** How `instantiateFragment` places the copies. */
export interface InstantiateFragmentOptions {
  /** Returns a fresh id for each new node and edge; it must not be in use in the target pipeline. */
  readonly createId: () => string;
  /** Added to the position of every copied node. */
  readonly offset: Position;
}

/**
 * The part of a pipeline made of the given nodes, in document order, and the edges between them;
 * edges to a node outside the selection are left out. The result is a pipeline with the source's
 * version, id and name, so it can be stored like a document (the clipboard). Unknown ids are
 * ignored, and nodes and edges are the source's own objects.
 */
export function extractFragment(pipeline: Pipeline, nodeIds: Iterable<string>): Pipeline {
  const selected = new Set(nodeIds);
  const nodes = pipeline.nodes.filter((node) => selected.has(node.id));
  const included = new Set(nodes.map((node) => node.id));
  const edges = pipeline.edges.filter(
    (edge) => included.has(edge.source) && included.has(edge.target),
  );
  return { ...pipeline, nodes, edges };
}

/**
 * Copies of a fragment's nodes and edges to add to `into` (paste, duplicate). Every copy gets a
 * fresh id from `createId` (nodes first, then edges), edges are reconnected to the copied nodes
 * (an edge with an end outside the fragment is dropped), and positions move by `offset`. Labels
 * stay unique: a label that is free in `into` is kept, a numbered default ("Prompt 1") becomes the
 * next free number of its kind, and a custom one gets " (copy)", " (copy 2)"… shortened to fit
 * the label length limit. Node data is shared with the fragment.
 */
export function instantiateFragment(
  fragment: Pipeline,
  into: Pipeline,
  { createId, offset }: InstantiateFragmentOptions,
): PipelineElements {
  const newIds = new Map<string, string>();
  const labelled: PipelineNode[] = [...into.nodes];
  const usedLabels = new Set(labelled.map((node) => node.label));
  const nodes: PipelineNode[] = [];
  for (const node of fragment.nodes) {
    const id = createId();
    newIds.set(node.id, id);
    const label = freeLabel(node, labelled, usedLabels);
    const position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
    const copy = { ...node, id, label, position };
    nodes.push(copy);
    labelled.push(copy);
    usedLabels.add(label);
  }
  const edges: PipelineEdge[] = [];
  for (const edge of fragment.edges) {
    const source = newIds.get(edge.source);
    const target = newIds.get(edge.target);
    if (source === undefined || target === undefined) continue;
    edges.push({ ...edge, id: createId(), source, target });
  }
  return { nodes, edges };
}

// Matches the numbering of `nextNodeLabel`: "Prompt 3", but not "Prompt 0" or "Prompt 03".
const LABEL_NUMBER = /^[1-9][0-9]*$/;

/** A label for the copy of `node` that none of `nodes` uses (`used` holds their labels). */
function freeLabel(
  node: PipelineNode,
  nodes: readonly PipelineNode[],
  used: ReadonlySet<string>,
): string {
  if (!used.has(node.label)) return node.label;
  const prefix = `${NODE_DEFINITIONS[node.kind].title} `;
  if (node.label.startsWith(prefix) && LABEL_NUMBER.test(node.label.slice(prefix.length))) {
    // `nextNodeLabel` counts in floating point, so past the safe integers it can repeat a label.
    const next = nextNodeLabel(node.kind, nodes);
    if (!used.has(next)) return next;
  }
  for (let copy = 1; ; copy++) {
    const label = copyLabel(node.label, copy);
    if (!used.has(label)) return label;
  }
}

// The high half of a surrogate pair at the end of a string: a character cut in two.
const SPLIT_SURROGATE_PAIR = /[\uD800-\uDBFF]$/;

/** "Name (copy)" for the first copy and "Name (copy N)" after it, cut to the label length limit. */
function copyLabel(label: string, copy: number): string {
  const suffix = copy === 1 ? ' (copy)' : ` (copy ${String(copy)})`;
  const cut = label.slice(0, NODE_LABEL_MAX_LENGTH - suffix.length);
  const base = cut.replace(SPLIT_SURROGATE_PAIR, '').trimEnd();
  return `${base}${suffix}`;
}
