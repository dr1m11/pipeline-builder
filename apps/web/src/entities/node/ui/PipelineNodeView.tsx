import { getNodePorts } from '@pipeline-builder/core';
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react';
import { memo, useLayoutEffect, useRef } from 'react';

import { handlesKey, summarizeNodeProblems } from '../lib/node-problems';
import type { PipelineFlowNode } from '../model/flow-node';
import { NodeCard } from './NodeCard';

/** React Flow node component for every pipeline node kind. */
export const PipelineNodeView = memo(function PipelineNodeView({
  id,
  data,
  selected,
}: NodeProps<PipelineFlowNode>) {
  const { node, issues } = data;
  useHandlesRefresh(id, handlesKey(getNodePorts(node), summarizeNodeProblems(node.id, issues)));
  return <NodeCard node={node} selected={selected} issues={issues} />;
});

/**
 * React Flow measures a node's handles when it mounts and when its size changes. A Prompt whose
 * `{{variable}}` is renamed keeps its size but swaps a handle, so edges would point at stale
 * positions: measure the handles again whenever the set of handles changes (see docs/adr/0006).
 */
function useHandlesRefresh(nodeId: string, key: string) {
  const updateNodeInternals = useUpdateNodeInternals();
  const measuredKeyRef = useRef(key);
  useLayoutEffect(() => {
    if (measuredKeyRef.current === key) return;
    measuredKeyRef.current = key;
    updateNodeInternals(nodeId);
  }, [nodeId, key, updateNodeInternals]);
}
