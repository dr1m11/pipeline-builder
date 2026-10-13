import type { NodeDefinition } from '../nodes/node-definition';
import { describeFields } from '../nodes/node-fields';
import {
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineNode,
} from '../nodes/registry';

/** A data field that breaks the rules of its node kind. */
export interface FieldProblem {
  readonly field: string;
  /** "Template: Required" — the field label, then the rule message. */
  readonly message: string;
}

const NO_PROBLEMS: readonly FieldProblem[] = [];

// Node data objects are immutable and kept by unchanged nodes, so each is checked once.
const problemsByData = new WeakMap<object, readonly FieldProblem[]>();

/** Fields of a node's data that break the rules of its kind, in field order; one problem each. */
export function fieldProblems(node: PipelineNode): readonly FieldProblem[] {
  let problems = problemsByData.get(node.data);
  if (problems === undefined) {
    problems = checkFields(node);
    problemsByData.set(node.data, problems);
  }
  return problems;
}

// Generic over the kind so the definition and the data stay correlated without a cast.
function checkFields<K extends NodeKind>(node: NodeOfKind<K>): readonly FieldProblem[] {
  const definition: NodeDefinition<NodeDataMap[K]> = NODE_DEFINITIONS[node.kind];
  const result = definition.rulesSchema.safeParse(node.data);
  if (result.success) return NO_PROBLEMS;

  // The first message of each field (set last, so it wins); rules attach issues to their field.
  const messages = new Map<PropertyKey | undefined, string>();
  for (const issue of result.error.issues.toReversed()) messages.set(issue.path[0], issue.message);
  return describeFields(definition, node.data).flatMap((field) => {
    const message = messages.get(field.name);
    return message === undefined
      ? []
      : [{ field: field.name, message: `${field.label}: ${message}` }];
  });
}
