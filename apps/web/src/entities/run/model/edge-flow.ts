import type { RunState } from './run-state';

/**
 * What a run did with an edge:
 *
 * - `none` — no data went along it (yet);
 * - `carried` — its source sent a value out of the edge's port;
 * - `flowing` — that value is being worked on: the edge's target is running.
 */
export type EdgeFlow = 'none' | 'carried' | 'flowing';

/** The ends of an edge: the node and output port it leaves, and the node it enters. */
export interface EdgeEnds {
  readonly source: string;
  readonly sourcePort: string;
  readonly target: string;
}

/**
 * What the run in `state` did with the edge `ends`. A Condition sends a value out of the branch it
 * takes only, so the edges of the other branch carry nothing.
 */
export function edgeFlow(state: RunState, { source, sourcePort, target }: EdgeEnds): EdgeFlow {
  const outputs = state.nodes.get(source)?.outputs;
  if (outputs === undefined || !Object.hasOwn(outputs, sourcePort)) return 'none';
  return state.nodes.get(target)?.status === 'running' ? 'flowing' : 'carried';
}
