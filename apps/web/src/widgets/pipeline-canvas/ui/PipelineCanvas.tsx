import {
  Background,
  Controls,
  type EdgeChange,
  type EdgeTypes,
  type IsValidConnection,
  MiniMap,
  type NodeChange,
  type NodeTypes,
  type OnConnect,
  type OnDelete,
  ReactFlow,
} from '@xyflow/react';
import { useCallback, useState } from 'react';

import { PIPELINE_NODE_TYPE, type PipelineFlowNode } from '@/entities/node';
import { usePipelineStoreApi } from '@/entities/pipeline';

import { DELETE_KEYS } from '../config/shortcuts';
import { translateEdgeChanges, translateNodeChanges } from '../model/flow-changes';
import { toConnectionCandidate } from '../model/flow-connections';
import type { PipelineFlowEdge } from '../model/flow-elements';
import { useFitReplacedDocument } from '../model/use-fit-replaced-document';
import { useFlowElements } from '../model/use-flow-elements';
import { CanvasEdge } from './CanvasEdge';
import { CanvasNode } from './CanvasNode';

// Module-level so React Flow does not see new node and edge types on every render; the delete keys
// are module-level in config for the same reason. Edges have no type of their own: the default one
// is replaced.
const NODE_TYPES = { [PIPELINE_NODE_TYPE]: CanvasNode } satisfies NodeTypes;
const EDGE_TYPES = { default: CanvasEdge } satisfies EdgeTypes;
// React Flow's default of 0.5 is too close for a fit to show the widest template (six cards in a
// row) on the narrowest supported canvas.
const MIN_ZOOM = 0.2;

/**
 * Ends a text selection elsewhere on the page, as pressing any other content does. Nothing on the
 * canvas can be selected as text, and Chrome keeps the old selection when such an element is
 * pressed; Ctrl+C would then copy that text instead of the nodes just selected.
 */
function clearTextSelection(): void {
  const selection = document.getSelection();
  if (selection !== null && !selection.isCollapsed) selection.removeAllRanges();
}

/**
 * The pipeline from the surrounding store on a React Flow canvas. React Flow is a controlled view:
 * it reports changes, the store applies them through core operations, and the canvas re-renders
 * from the store (see docs/adr/0006). Nodes and edges also show what the run in the surrounding
 * run store does: statuses, streamed text, and the edges that carry data.
 */
export function PipelineCanvas() {
  const store = usePipelineStoreApi();
  const { nodes, edges } = useFlowElements();
  // Fits a pipeline that opens with nodes. Decided once: on an empty canvas React Flow would keep
  // the fit pending and spring it on the first node added, zooming in on it.
  const [fitView] = useState(() => store.getState().pipeline.nodes.length > 0);

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

  // React Flow asks while a connection is dragged over a port and before it connects; the port
  // highlight asks too, so one rule decides what is offered and what is accepted.
  const isValidConnection = useCallback<IsValidConnection<PipelineFlowEdge>>(
    (connection) => {
      const candidate = toConnectionCandidate(connection);
      return candidate !== null && store.getState().canConnect(candidate);
    },
    [store],
  );
  const onConnect = useCallback<OnConnect>(
    (connection) => {
      const candidate = toConnectionCandidate(connection);
      if (candidate !== null) store.getState().connect(candidate);
    },
    [store],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onDelete={onDelete}
      isValidConnection={isValidConnection}
      onConnect={onConnect}
      deleteKeyCode={DELETE_KEYS}
      minZoom={MIN_ZOOM}
      fitView={fitView}
      onPointerDownCapture={clearTextSelection}
    >
      <Background />
      <Controls />
      <MiniMap ariaLabel="Pipeline overview" />
      <FitReplacedDocument />
    </ReactFlow>
  );
}

/**
 * Fits the view to each document that replaces the pipeline. A child of `<ReactFlow>`, so it has
 * React Flow's provider even where the page does not wrap the canvas in one. The canvas is never
 * remounted for a new document instead: that would reset the page's `ReactFlowProvider`.
 */
function FitReplacedDocument() {
  useFitReplacedDocument();
  return null;
}
