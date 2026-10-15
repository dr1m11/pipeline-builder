import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { memo } from 'react';

import { type EdgeFlow, useEdgeFlow } from '@/entities/run';

import type { PipelineFlowEdge } from '../model/flow-elements';

// A run marks the edges that carried data: thicker, with moving dashes while their target works on
// the value (still dashes with reduced motion). app/styles/tokens.css styles these classes.
const FLOW_CLASSES = {
  none: undefined,
  carried: 'edge-carried',
  flowing: 'edge-flowing',
} as const satisfies Record<EdgeFlow, string | undefined>;

/**
 * Every edge of the canvas: React Flow's default bezier curve, marked by what the current run did
 * with it. It reads the run store by its ends, so it re-renders when that changes, not on tokens.
 */
export const CanvasEdge = memo(function CanvasEdge({
  source,
  target,
  sourceHandleId,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps<PipelineFlowEdge>) {
  const flow = useEdgeFlow({ source, sourcePort: sourceHandleId ?? '', target });
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <BaseEdge
      path={path}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
      className={FLOW_CLASSES[flow]}
    />
  );
});
