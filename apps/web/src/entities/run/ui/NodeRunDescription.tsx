import { describeNodeRun } from '../lib/describe-node-run';
import { useRunStore } from '../model/store-context';

/**
 * What the run did to the node `nodeId`, as text for the node's accessible description ("Run
 * status: failed. The API key was rejected."), or that a step-by-step run is paused before it;
 * nothing while no run has reported the node. It re-renders when the status changes, not while the
 * node streams.
 */
export function NodeRunDescription({ nodeId }: { nodeId: string }) {
  const description = useRunStore((state) => {
    const node = state.nodes.get(nodeId);
    return node === undefined
      ? ''
      : describeNodeRun(node, { paused: state.pausedNodeId === nodeId });
  });
  return description;
}
