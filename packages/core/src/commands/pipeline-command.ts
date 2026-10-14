import { assertNever } from '../assert-never';
import type { Position } from '../geometry';
import { connect, type ConnectionCandidate, type ConnectionError } from '../graph/connections';
import {
  addElements,
  addNode,
  moveNodes,
  type NodeDataError,
  type NodeLabelError,
  removeElements,
  renameNode,
  updateNodeData,
} from '../graph/nodes';
import type { NodeKind, PipelineNode } from '../nodes/registry';
import type { Pipeline, PipelineEdge } from '../pipeline';
import { ok, type Result } from '../result';

/** Adds a node of `kind` with default data and the next free label. */
export interface AddNodeCommand {
  readonly type: 'add-node';
  /** Id of the new node, chosen by the caller; it must not be in use. */
  readonly id: string;
  readonly kind: NodeKind;
  readonly position: Position;
}

/** Moves nodes to new positions (the end of a drag, an arrow-key nudge). */
export interface MoveNodesCommand {
  readonly type: 'move-nodes';
  readonly positions: ReadonlyMap<string, Position>;
}

/** Removes nodes and edges, together with every edge attached to a removed node. */
export interface RemoveElementsCommand {
  readonly type: 'remove-elements';
  readonly nodeIds?: readonly string[];
  readonly edgeIds?: readonly string[];
  /** Set when the elements were cut to the clipboard; it changes only the label ("Cut 2 nodes"). */
  readonly reason?: 'cut';
}

/** Connects an output to an input, replacing the edge that occupied the input. */
export interface ConnectCommand {
  readonly type: 'connect';
  readonly candidate: ConnectionCandidate;
  /** Id of the new edge, chosen by the caller; it must not be in use. */
  readonly edgeId: string;
}

/** Changes fields of a node's data. */
export interface UpdateNodeDataCommand {
  readonly type: 'update-node-data';
  readonly nodeId: string;
  readonly changes: Readonly<Record<string, unknown>>;
}

/** Renames a node. */
export interface RenameNodeCommand {
  readonly type: 'rename-node';
  readonly nodeId: string;
  readonly label: string;
}

/** Adds ready-made nodes and edges whose ids the caller has already chosen (paste, duplicate). */
export interface AddElementsCommand {
  readonly type: 'add-elements';
  readonly nodes: readonly PipelineNode[];
  readonly edges: readonly PipelineEdge[];
  readonly reason: 'paste' | 'duplicate';
}

/** Replaces the whole document: an imported file, a template or a new blank pipeline. */
export interface ReplacePipelineCommand {
  readonly type: 'replace-pipeline';
  readonly pipeline: Pipeline;
  readonly reason: 'import' | 'template' | 'new';
}

/**
 * A change to the document, as plain data: what the user did, not how to undo it. Ids of new
 * elements come from the caller, so executing a command is deterministic.
 */
export type PipelineCommand =
  | AddNodeCommand
  | MoveNodesCommand
  | RemoveElementsCommand
  | ConnectCommand
  | UpdateNodeDataCommand
  | RenameNodeCommand
  | AddElementsCommand
  | ReplacePipelineCommand;

/** Why a command could not be applied. */
export type CommandError = ConnectionError | NodeDataError | NodeLabelError;

/**
 * Applies a command through the graph operations. Unchanged nodes and edges keep their identity,
 * and the same pipeline is returned when the command changes nothing (a move to the same place, a
 * connection that exists). Expected failures (an incompatible connection, invalid data or label)
 * are errors; reusing an id that is already in use throws, as in `addNode`, `connect` and
 * `addElements`.
 */
export function executeCommand(
  pipeline: Pipeline,
  command: PipelineCommand,
): Result<Pipeline, CommandError> {
  switch (command.type) {
    case 'add-node':
      return ok(addNode(pipeline, command).pipeline);
    case 'move-nodes':
      return ok(moveNodes(pipeline, command.positions));
    case 'remove-elements':
      return ok(removeElements(pipeline, command));
    case 'connect': {
      const result = connect(pipeline, command.candidate, command.edgeId);
      return result.ok ? ok(result.value.pipeline) : result;
    }
    case 'update-node-data':
      return updateNodeData(pipeline, command.nodeId, command.changes);
    case 'rename-node':
      return renameNode(pipeline, command.nodeId, command.label);
    case 'add-elements':
      return ok(addElements(pipeline, command));
    case 'replace-pipeline':
      return ok(command.pipeline);
    default:
      return assertNever(command);
  }
}

/**
 * Commands with the same key continue one another, so the history can merge them into one step:
 * typing in a field (`data:<node id>:<field names>`), renaming (`label:<node id>`) and nudging the
 * same nodes (`move:<node ids>`). Other commands return null and are never merged.
 */
export function commandMergeKey(command: PipelineCommand): string | null {
  switch (command.type) {
    case 'update-node-data':
      return `data:${command.nodeId}:${sortedJoin(Object.keys(command.changes))}`;
    case 'rename-node':
      return `label:${command.nodeId}`;
    case 'move-nodes':
      return `move:${sortedJoin(command.positions.keys())}`;
    case 'add-node':
    case 'remove-elements':
    case 'connect':
    case 'add-elements':
    case 'replace-pipeline':
      return null;
    default:
      return assertNever(command);
  }
}

function sortedJoin(values: Iterable<string>): string {
  return [...values].sort().join(',');
}
