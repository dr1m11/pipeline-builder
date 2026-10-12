import type { Position } from '../geometry';
import type { NodePorts } from '../ports';
import { CONDITION_DEFINITION, type ConditionNodeData } from './condition';
import { INPUT_DEFINITION, type InputNodeData } from './input';
import { LLM_CALL_DEFINITION, type LlmCallNodeData } from './llm-call';
import type { NodeDefinition } from './node-definition';
import { OUTPUT_DEFINITION, type OutputNodeData } from './output';
import { PROMPT_DEFINITION, type PromptNodeData } from './prompt';
import { TRANSFORM_DEFINITION, type TransformNodeData } from './transform';

/** Data carried by a node of each kind. */
export interface NodeDataMap {
  readonly input: InputNodeData;
  readonly prompt: PromptNodeData;
  readonly 'llm-call': LlmCallNodeData;
  readonly transform: TransformNodeData;
  readonly condition: ConditionNodeData;
  readonly output: OutputNodeData;
}

/** Identifier of a node kind (`'llm-call'`). */
export type NodeKind = keyof NodeDataMap;

/** Every node kind, in palette order. */
export const NODE_KINDS = [
  'input',
  'prompt',
  'llm-call',
  'transform',
  'condition',
  'output',
] as const satisfies readonly NodeKind[];

/** Title, description, default data and ports of each node kind. */
export const NODE_DEFINITIONS: { readonly [K in NodeKind]: NodeDefinition<NodeDataMap[K]> } = {
  input: INPUT_DEFINITION,
  prompt: PROMPT_DEFINITION,
  'llm-call': LLM_CALL_DEFINITION,
  transform: TRANSFORM_DEFINITION,
  condition: CONDITION_DEFINITION,
  output: OUTPUT_DEFINITION,
};

/** A node of kind `K` on the canvas. */
export interface NodeOfKind<K extends NodeKind> {
  readonly id: string;
  readonly kind: K;
  /** Human-readable name, unique by default ("Prompt 2"); used in accessible names and error lists. */
  readonly label: string;
  readonly position: Position;
  readonly data: NodeDataMap[K];
}

// `NodeOfKind` distributed over a union of kinds: `NodeOf<'input' | 'prompt'>` is
// `NodeOfKind<'input'> | NodeOfKind<'prompt'>`, while for a single kind it stays `NodeOfKind<K>`.
type NodeOf<K extends NodeKind> = { [P in K]: NodeOfKind<P> }[K];

/** A node of any kind; narrow it by `kind`. */
export type PipelineNode = NodeOf<NodeKind>;

/** Checks an untrusted value (e.g. a dragged palette item) against the known node kinds. */
export function isNodeKind(value: unknown): value is NodeKind {
  return NODE_KINDS.some((kind) => kind === value);
}

/**
 * Creates a node with the default data of its kind. The caller supplies the id and label.
 * A literal kind gives that node type; a `NodeKind` union gives a `PipelineNode`.
 */
export function createNode<K extends NodeKind>(
  kind: K,
  params: { id: string; label: string; position: Position },
): NodeOf<K> {
  return {
    id: params.id,
    kind,
    label: params.label,
    position: params.position,
    data: NODE_DEFINITIONS[kind].createData(),
  };
}

/** Current ports of a node, derived from its kind and data. */
export function getNodePorts(node: PipelineNode): NodePorts {
  return portsOf(node);
}

// Generic over the kind so the definition and the data stay correlated without a cast.
function portsOf<K extends NodeKind>(node: NodeOfKind<K>): NodePorts {
  const definition: NodeDefinition<NodeDataMap[K]> = NODE_DEFINITIONS[node.kind];
  return definition.getPorts(node.data);
}

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/** Default label for a new node: the kind's title numbered after the highest existing one ("Prompt 3"). */
export function nextNodeLabel(kind: NodeKind, nodes: readonly PipelineNode[]): string {
  const prefix = `${NODE_DEFINITIONS[kind].title} `;
  let highest = 0;
  for (const { label } of nodes) {
    const suffix = label.startsWith(prefix) ? label.slice(prefix.length) : '';
    if (POSITIVE_INTEGER.test(suffix)) highest = Math.max(highest, Number(suffix));
  }
  return `${prefix}${String(highest + 1)}`;
}
