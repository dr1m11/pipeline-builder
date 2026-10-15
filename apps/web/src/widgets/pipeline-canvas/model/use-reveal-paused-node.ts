import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useEffect, useEffectEvent } from 'react';

import { useRunStore } from '@/entities/run';
import { useMediaQuery } from '@/shared/lib/media';

import { REDUCED_MOTION_QUERY, VIEWPORT_MOVE_MS } from '../config/viewport';
import { isInsideRect, visibleFlowRect } from '../lib/flow-viewport';

// Room kept between a node brought into view and the sides of the canvas, in screen pixels.
const REVEAL_MARGIN_PX = 24;

/**
 * Brings the node a step-by-step run is paused before into view. When it is not wholly on screen,
 * the view centres on it at the same zoom, without animation when the user prefers reduced motion;
 * a node in view stays where it is, so stepping through a pipeline that fits the canvas does not
 * move it. Call it inside React Flow's provider.
 */
export function useRevealPausedNode(): void {
  const pausedNodeId = useRunStore((state) => state.pausedNodeId);
  const flowStore = useStoreApi();
  const { getInternalNode, getNodesBounds, setCenter } = useReactFlow();
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  const reveal = useEffectEvent((nodeId: string) => {
    // The run works on a snapshot of the pipeline: the user may have deleted the node meanwhile.
    if (getInternalNode(nodeId) === undefined) return;
    const { width, height, transform } = flowStore.getState();
    const [, , zoom] = transform;
    const node = getNodesBounds([nodeId]);
    const inView = visibleFlowRect(width, height, transform);
    if (isInsideRect(node, inView, REVEAL_MARGIN_PX / zoom)) return;
    void setCenter(node.x + node.width / 2, node.y + node.height / 2, {
      zoom,
      duration: reducedMotion ? 0 : VIEWPORT_MOVE_MS,
      // A plain pan: the default ("smooth") zooms out and back in on the way.
      interpolate: 'linear',
    });
  });

  useEffect(() => {
    if (pausedNodeId !== null) reveal(pausedNodeId);
  }, [pausedNodeId]);
}
