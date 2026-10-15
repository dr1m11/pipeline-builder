import type {
  NodeRunError,
  NodeRunStatus,
  NodeValues,
  RunEvent,
  RunOutcome,
  SkipReason,
} from '@pipeline-builder/core';

/** Where the editor's run is: none yet (`idle`), in progress, or how the last one ended. */
export type RunStatus = 'idle' | 'running' | RunOutcome;

/** What the current run did to one node, as the canvas and the inspector show it. */
export interface NodeRunState {
  readonly status: NodeRunStatus;
  /** The response an LLM Call has streamed so far; empty for other kinds. */
  readonly text: string;
  /** The node's outputs by output port id, once it has computed them. */
  readonly outputs?: NodeValues;
  /** Why the node failed, with the `error` status. */
  readonly error?: NodeRunError;
  /** Why the node did not run, with the `skipped` status. */
  readonly skipReason?: SkipReason;
}

/**
 * The run of a pipeline as the editor shows it. It is view state: never saved, never undone, and
 * forgotten when the next run starts or the document is replaced.
 */
export interface RunState {
  readonly status: RunStatus;
  /**
   * The nodes the run has reported, by node id in the order it reported them first (pipeline
   * order). A node that is not here, such as one added during the run, is idle.
   */
  readonly nodes: ReadonlyMap<string, NodeRunState>;
}

/** The state of a node that no run has reported; shared, so lookups need not allocate. */
export const IDLE_NODE_RUN: NodeRunState = Object.freeze({ status: 'idle', text: '' });

/** No run yet, or a forgotten one. */
export const IDLE_RUN: RunState = Object.freeze({ status: 'idle', nodes: new Map() });

/**
 * Applies the events of a run, in order, to `state`. Only a run in progress takes events: they are
 * ignored once the run has finished or been forgotten, so late events of a cancelled run change
 * nothing. `run-finished` sets how the run ended; a node it finds still queued or running (left so
 * by a run that broke off) is `cancelled`.
 *
 * Returns `state` itself when nothing changes. Otherwise the nodes that did not change keep their
 * state objects, so a component that reads one node re-renders only when that node changes.
 */
export function applyRunEvents(state: RunState, events: readonly RunEvent[]): RunState {
  if (state.status !== 'running' || events.length === 0) return state;

  let status: RunStatus = state.status;
  // The nodes this batch changed, in the order it first changed them.
  const changed = new Map<string, NodeRunState>();
  const current = (nodeId: string): NodeRunState =>
    changed.get(nodeId) ?? state.nodes.get(nodeId) ?? IDLE_NODE_RUN;
  const update = (nodeId: string, change: (node: NodeRunState) => NodeRunState): void => {
    changed.set(nodeId, change(current(nodeId)));
  };

  for (const event of events) {
    if (status !== 'running') break;
    switch (event.type) {
      case 'node-status':
        update(event.nodeId, (node) => ({
          status: event.status,
          text: node.text,
          ...(node.outputs === undefined ? {} : { outputs: node.outputs }),
          ...(event.error === undefined ? {} : { error: event.error }),
          ...(event.skipReason === undefined ? {} : { skipReason: event.skipReason }),
        }));
        break;
      case 'node-delta':
        update(event.nodeId, (node) => ({ ...node, text: node.text + event.text }));
        break;
      case 'node-output':
        update(event.nodeId, (node) => ({ ...node, outputs: event.outputs }));
        break;
      case 'run-finished': {
        status = event.status;
        const nodeIds = new Set([...state.nodes.keys(), ...changed.keys()]);
        for (const nodeId of nodeIds) {
          const node = current(nodeId);
          if (node.status === 'queued' || node.status === 'running') {
            changed.set(nodeId, { ...node, status: 'cancelled' });
          }
        }
        break;
      }
    }
  }

  if (status === state.status && changed.size === 0) return state;
  // Nodes known before keep their place; nodes reported for the first time come after them.
  const nodes = changed.size === 0 ? state.nodes : new Map([...state.nodes, ...changed]);
  return { status, nodes };
}
