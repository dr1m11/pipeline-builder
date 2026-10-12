import type { PortDefinition, PortType } from '@pipeline-builder/core';
import { Handle, Position } from '@xyflow/react';
import type { KeyboardEvent } from 'react';

import { cn } from '@/shared/lib/cn';

// `any` is drawn as a ring, so it differs from the typed ports by shape as well as colour.
const DOT_CLASSES: Record<PortType, string> = {
  text: 'border-port-text bg-port-text',
  number: 'border-port-number bg-port-number',
  json: 'border-port-json bg-port-json',
  any: 'border-port-any bg-surface',
};

export interface PortHandleProps {
  port: PortDefinition;
  direction: 'input' | 'output';
}

/**
 * Connection point of a port: a coloured dot inside a 24px hit area. Enter or Space works like a
 * click, so a connection can be started and completed from the keyboard.
 */
export function PortHandle({ port, direction }: PortHandleProps) {
  const isInput = direction === 'input';
  return (
    <Handle
      id={port.id}
      type={isInput ? 'target' : 'source'}
      position={isInput ? Position.Left : Position.Right}
      role="button"
      tabIndex={0}
      aria-label={`${isInput ? 'Input' : 'Output'} ${port.label} (${port.type})`}
      onKeyDown={activateOnEnterOrSpace}
      // `nokey` stops React Flow from treating these keys as node shortcuts (select, move, delete).
      className="nokey flex size-6 items-center justify-center rounded-full border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span
        aria-hidden
        className={cn('pointer-events-none size-2.5 rounded-full border-2', DOT_CLASSES[port.type])}
      />
    </Handle>
  );
}

function activateOnEnterOrSpace(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  // React Flow's click-to-connect: the first activation starts a connection, the second ends it.
  event.currentTarget.click();
}
