import type { PortDefinition, PortType } from '@pipeline-builder/core';
import {
  type Connection,
  Handle,
  type HandleType,
  Position,
  type ReactFlowState,
  useNodeId,
  useStore,
} from '@xyflow/react';
import { type KeyboardEvent, useId, useMemo } from 'react';

import { cn } from '@/shared/lib/cn';

// `any` is drawn as a ring, so it differs from the typed ports by shape as well as colour.
const DOT_CLASSES: Record<PortType, string> = {
  text: 'border-port-text bg-port-text',
  number: 'border-port-number bg-port-number',
  json: 'border-port-json bg-port-json',
  any: 'border-port-any bg-surface',
};

/** What a port is to the connection being made: its start, a possible end, or neither. */
type ConnectionRole = 'none' | 'origin' | 'compatible' | 'incompatible';

const ROLE_CLASSES: Record<ConnectionRole, string> = {
  none: '',
  origin: 'ring-2 ring-accent',
  compatible: 'bg-accent/25',
  incompatible: 'opacity-30',
};

/**
 * Selects the port's role in the connection being made. A connection dragged from a port is in
 * `connection`, one started by a click (or Enter) only in `connectionClickStartHandle`, so
 * `useConnection` alone would miss the keyboard. The answer is a string, so a handle re-renders
 * only when its role changes, not on every pointer move.
 */
function selectConnectionRole(nodeId: string | null, portId: string, type: HandleType) {
  return (state: ReactFlowState): ConnectionRole => {
    const from = state.connection.fromHandle ?? state.connectionClickStartHandle;
    if (from === null || nodeId === null) return 'none';
    if (from.nodeId === nodeId && from.id === portId && from.type === type) return 'origin';
    if (from.type === type) return 'incompatible';
    const connection: Connection =
      from.type === 'source'
        ? {
            source: from.nodeId,
            sourceHandle: from.id ?? null,
            target: nodeId,
            targetHandle: portId,
          }
        : {
            source: nodeId,
            sourceHandle: portId,
            target: from.nodeId,
            targetHandle: from.id ?? null,
          };
    // The canvas's own guard, so what is highlighted is exactly what it accepts.
    return (state.isValidConnection?.(connection) ?? true) ? 'compatible' : 'incompatible';
  };
}

/** What is wrong with a port: a required input without an edge, or a port the node lost. */
export type PortProblem = 'unconnected' | 'removed';

export interface PortHandleProps {
  port: PortDefinition;
  direction: 'input' | 'output';
  problem?: PortProblem | undefined;
}

const HANDLE_CLASSES =
  'nokey flex size-6 items-center justify-center rounded-full border-0 bg-transparent transition-opacity';

/**
 * Connection point of a port: a coloured dot inside a 24px hit area. Enter or Space works like a
 * click, so a connection can be started and completed from the keyboard. While a connection is
 * being made, the ports it can end on are highlighted and the others dimmed and marked disabled.
 * An unconnected required input is ringed and described as "Not connected". A removed port is a
 * placeholder that only keeps its edges drawn: it cannot be connected or focused, and the node's
 * description reports it.
 */
export function PortHandle({ port, direction, problem }: PortHandleProps) {
  const isInput = direction === 'input';
  const type: HandleType = isInput ? 'target' : 'source';
  const nodeId = useNodeId();
  const selectRole = useMemo(
    () => selectConnectionRole(nodeId, port.id, type),
    [nodeId, port.id, type],
  );
  const role = useStore(selectRole);
  const descriptionId = useId();

  if (problem === 'removed') {
    return (
      <Handle
        id={port.id}
        type={type}
        position={isInput ? Position.Left : Position.Right}
        isConnectable={false}
        aria-hidden
        className={cn(HANDLE_CLASSES, 'cursor-default')}
      >
        <span className="pointer-events-none size-2.5 rounded-full border-2 border-dashed border-danger bg-surface" />
      </Handle>
    );
  }

  const unconnected = problem === 'unconnected';
  return (
    <Handle
      id={port.id}
      type={type}
      position={isInput ? Position.Left : Position.Right}
      role="button"
      tabIndex={0}
      aria-label={`${isInput ? 'Input' : 'Output'} ${port.label} (${port.type})`}
      aria-describedby={unconnected ? descriptionId : undefined}
      aria-disabled={role === 'incompatible' ? true : undefined}
      onKeyDown={activateOnEnterOrSpace}
      // `nokey` stops React Flow from treating these keys as node shortcuts (select, move, delete).
      className={cn(
        HANDLE_CLASSES,
        'focus-visible:outline-2 focus-visible:outline-focus',
        ROLE_CLASSES[role],
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none size-2.5 rounded-full border-2',
          DOT_CLASSES[port.type],
          unconnected && 'ring-2 ring-danger ring-offset-1 ring-offset-surface',
        )}
      />
      {unconnected && (
        <span id={descriptionId} className="sr-only">
          Not connected
        </span>
      )}
    </Handle>
  );
}

function activateOnEnterOrSpace(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  // React Flow's click-to-connect: the first activation starts a connection, the second ends it.
  event.currentTarget.click();
}
