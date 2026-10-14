import { assertNever } from '../assert-never';
import { findNode } from '../graph/nodes';
import { getNodeFields } from '../nodes/node-fields';
import { NODE_DEFINITIONS } from '../nodes/registry';
import type { Pipeline } from '../pipeline';
import type {
  PipelineCommand,
  RemoveElementsCommand,
  ReplacePipelineCommand,
  UpdateNodeDataCommand,
} from './pipeline-command';

/**
 * A short English label of a command for the UI ("Undo Move 3 nodes"): "Add Prompt",
 * "Move Prompt 1", "Delete 2 nodes and 1 edge", "Connect Input 1 to Prompt 1",
 * "Edit Temperature of LLM Call 1", "Paste 3 nodes", `Import “Name”`. Nodes are named by their
 * labels in `before`, the pipeline the command applies to; an id stands in for a node it does not
 * have.
 */
export function describeCommand(command: PipelineCommand, before: Pipeline): string {
  switch (command.type) {
    case 'add-node':
      return `Add ${NODE_DEFINITIONS[command.kind].title}`;
    case 'move-nodes': {
      const ids = [...command.positions.keys()].filter((id) => findNode(before, id) !== undefined);
      const only = onlyItem(ids);
      return `Move ${only === undefined ? count(ids.length, 'node') : nodeName(before, only)}`;
    }
    case 'remove-elements':
      return `${command.reason === 'cut' ? 'Cut' : 'Delete'} ${removedElements(command, before)}`;
    case 'connect': {
      const { source, target } = command.candidate;
      return `Connect ${nodeName(before, source)} to ${nodeName(before, target)}`;
    }
    case 'update-node-data':
      return describeDataChange(command, before);
    case 'rename-node':
      return `Rename ${nodeName(before, command.nodeId)}`;
    case 'add-elements': {
      // The command holds the copies, whose labels would not tell what was copied: count them.
      const verb = command.reason === 'paste' ? 'Paste' : 'Duplicate';
      return `${verb} ${count(command.nodes.length, 'node')}`;
    }
    case 'replace-pipeline':
      return describeReplacement(command);
    default:
      return assertNever(command);
  }
}

/**
 * What a removal takes away, as the user chose it: the element itself when it is the only one,
 * otherwise counts. Edges of removed nodes go with them, so they are not counted even when listed.
 */
function removedElements(command: RemoveElementsCommand, before: Pipeline): string {
  const nodeIds = (command.nodeIds ?? []).filter((id) => findNode(before, id) !== undefined);
  const removedNodes = new Set(nodeIds);
  const edgeIds = new Set(command.edgeIds);
  const edges = before.edges.filter(
    (edge) =>
      edgeIds.has(edge.id) && !removedNodes.has(edge.source) && !removedNodes.has(edge.target),
  );
  if (edges.length === 0) {
    const onlyNode = onlyItem(nodeIds);
    return onlyNode === undefined ? count(nodeIds.length, 'node') : nodeName(before, onlyNode);
  }
  if (nodeIds.length === 0) {
    const onlyEdge = onlyItem(edges);
    if (onlyEdge === undefined) return count(edges.length, 'edge');
    return `edge from ${nodeName(before, onlyEdge.source)} to ${nodeName(before, onlyEdge.target)}`;
  }
  return `${count(nodeIds.length, 'node')} and ${count(edges.length, 'edge')}`;
}

/** "Edit Temperature of LLM Call 1" for one field, "Edit LLM Call 1" for several. */
function describeDataChange(command: UpdateNodeDataCommand, before: Pipeline): string {
  const name = nodeName(before, command.nodeId);
  const fieldName = onlyItem(Object.keys(command.changes));
  if (fieldName === undefined) return `Edit ${name}`;
  const node = findNode(before, command.nodeId);
  const field = node && getNodeFields(node).find((candidate) => candidate.name === fieldName);
  return `Edit ${field?.label ?? fieldName} of ${name}`;
}

function describeReplacement(command: ReplacePipelineCommand): string {
  switch (command.reason) {
    case 'import':
      return `Import “${command.pipeline.name}”`;
    case 'template':
      return `Load template “${command.pipeline.name}”`;
    case 'new':
      return 'New pipeline';
    default:
      return assertNever(command.reason);
  }
}

/** The item of a list that holds exactly one, otherwise undefined. */
function onlyItem<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function nodeName(pipeline: Pipeline, id: string): string {
  return findNode(pipeline, id)?.label ?? id;
}

function count(amount: number, noun: string): string {
  return `${String(amount)} ${noun}${amount === 1 ? '' : 's'}`;
}
