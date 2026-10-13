import type { NodeKind, PipelineNode, Position } from '@pipeline-builder/core';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback, useMemo } from 'react';

import { usePipelineStoreApi } from '@/entities/pipeline';

import { CARD_SIZE, findFreePosition, viewportCenter } from '../lib/placement';

/** Top left corner of a card centred on `point`. */
function centredOn(point: Position): Position {
  return { x: point.x - CARD_SIZE.width / 2, y: point.y - CARD_SIZE.height / 2 };
}

export interface AddNode {
  /** Adds a node in the middle of the visible canvas, or as near as it is free of other cards. */
  readonly atCenter: (kind: NodeKind) => PipelineNode;
  /** Adds a node centred on a point of the screen, such as a drop. */
  readonly atScreenPoint: (kind: NodeKind, point: Position) => PipelineNode;
}

/**
 * Adds nodes to the pipeline of the surrounding editor and makes the new node the selection.
 * Reads the canvas's viewport, so it needs the ReactFlowProvider the canvas renders in.
 */
export function useAddNode(): AddNode {
  const store = usePipelineStoreApi();
  const flow = useStoreApi();
  const { screenToFlowPosition } = useReactFlow();

  const add = useCallback(
    (kind: NodeKind, position: Position) => {
      const { addNode, select } = store.getState();
      const node = addNode(kind, position);
      select({ nodeIds: [node.id] });
      return node;
    },
    [store],
  );

  return useMemo(
    () => ({
      atCenter: (kind) => {
        const { pipeline, measured } = store.getState();
        const wanted = centredOn(viewportCenter(flow.getState()));
        return add(kind, findFreePosition(pipeline.nodes, measured, wanted));
      },
      atScreenPoint: (kind, point) => add(kind, centredOn(screenToFlowPosition(point))),
    }),
    [add, flow, screenToFlowPosition, store],
  );
}
