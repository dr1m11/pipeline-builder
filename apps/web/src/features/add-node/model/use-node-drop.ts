import { type DragEvent, useCallback } from 'react';

import { carriesNodeKind, readNodeKind } from '../lib/node-kind-transfer';
import { useAddNode } from './use-add-node';

export interface NodeDropHandlers {
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}

/** Handlers for the element around the canvas: a node kind dropped from the palette adds a node. */
export function useNodeDrop(): NodeDropHandlers {
  const add = useAddNode();

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!carriesNodeKind(event.dataTransfer)) return;
    // Cancelling dragover is how an element accepts the drop.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const kind = readNodeKind(event.dataTransfer);
      if (kind === null) return;
      event.preventDefault();
      add.atScreenPoint(kind, { x: event.clientX, y: event.clientY });
    },
    [add],
  );

  return { onDragOver, onDrop };
}
