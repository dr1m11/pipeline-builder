import type { ConnectionCandidate } from '@pipeline-builder/core';
import type { Connection } from '@xyflow/react';

import type { PipelineFlowEdge } from './flow-elements';

/**
 * The core connection for a React Flow one. Every port handle has an id, so a connection that
 * misses a handle id joins no port and gives `null`.
 */
export function toConnectionCandidate(
  connection: Connection | PipelineFlowEdge,
): ConnectionCandidate | null {
  const { source, sourceHandle, target, targetHandle } = connection;
  if (sourceHandle == null || targetHandle == null) return null;
  return { source, sourcePort: sourceHandle, target, targetPort: targetHandle };
}
