import {
  Background,
  Controls,
  type EdgeChange,
  MiniMap,
  type NodeChange,
  type NodeTypes,
  type OnDelete,
  ReactFlow,
} from '@xyflow/react';
import { useCallback } from 'react';

import { PIPELINE_NODE_TYPE, type PipelineFlowNode, PipelineNodeView } from '@/entities/node';
import { usePipelineStoreApi } from '@/entities/pipeline';

import { translateEdgeChanges, translateNodeChanges } from '../model/flow-changes';
import type { PipelineFlowEdge } from '../model/flow-elements';
import { useFlowElements } from '../model/use-flow-elements';

// Module-level so React Flow does not see new node types, or new keys, on every render.
const NODE_TYPES = { [PIPELINE_NODE_TYPE]: PipelineNodeView } satisfies NodeTypes;
const DELETE_KEYS = ['Backspace', 'Delete'];

/**
 * The pipeline from the surrounding store on a React Flow canvas. React Flow is a controlled view:
 * it reports changes, the store applies them through core operations, and the canvas re-renders
 * from the store (see docs/adr/0006).
 */
export function PipelineCanvas() {
  const store = usePipelineStoreApi();
  const { nodes, edges } = useFlowElements();

  const onNodesChange = useCallback(
    (changes: NodeChange<PipelineFlowNode>[]) => {
      translateNodeChanges(changes, store.getState());
    },
    [store],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<PipelineFlowEdge>[]) => {
      translateEdgeChanges(changes, store.getState());
    },
    [store],
  );
  // React Flow also reports deleted elements as `remove` changes; the store takes them from here,
  // in one operation.
  const onDelete = useCallback<OnDelete<PipelineFlowNode, PipelineFlowEdge>>(
    ({ nodes: deletedNodes, edges: deletedEdges }) => {
      store.getState().removeElements({
        nodeIds: deletedNodes.map((node) => node.id),
        edgeIds: deletedEdges.map((edge) => edge.id),
      });
    },
    [store],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onDelete={onDelete}
      deleteKeyCode={DELETE_KEYS}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap ariaLabel="Pipeline overview" />
    </ReactFlow>
  );
}
