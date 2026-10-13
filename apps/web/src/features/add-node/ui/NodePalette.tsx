import { NODE_DEFINITIONS, NODE_KINDS, type NodeKind } from '@pipeline-builder/core';
import { useId, useState } from 'react';

import { NodeKindIcon } from '@/entities/node';

import { writeNodeKind } from '../lib/node-kind-transfer';
import { useAddNode } from '../model/use-add-node';

/**
 * The node kinds, to drag onto the canvas or to add in the middle of it with a click (Enter or
 * Space from the keyboard). A node added that way is selected and announced to screen readers.
 */
export function NodePalette() {
  const add = useAddNode();
  const [announcement, setAnnouncement] = useState('');
  const headingId = useId();

  const addAtCenter = (kind: NodeKind) => {
    const message = `Added ${add.atCenter(kind).label}`;
    // A label can come back after its node is deleted, and an unchanged message is not read again:
    // a full stop, which screen readers do not speak, makes it new.
    setAnnouncement((previous) => (previous === message ? `${message}.` : message));
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <h2
        id={headingId}
        className="px-2 text-xs font-semibold tracking-wide text-fg-muted uppercase"
      >
        Nodes
      </h2>
      <ul aria-labelledby={headingId} className="flex flex-col gap-1">
        {NODE_KINDS.map((kind) => (
          <li key={kind}>
            <PaletteItem kind={kind} onAdd={addAtCenter} />
          </li>
        ))}
      </ul>
      <p className="px-2 text-xs text-fg-muted">
        Drag a node onto the canvas, or click it to add it in the middle.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

interface PaletteItemProps {
  kind: NodeKind;
  onAdd: (kind: NodeKind) => void;
}

function PaletteItem({ kind, onAdd }: PaletteItemProps) {
  const { title, description } = NODE_DEFINITIONS[kind];
  const descriptionId = useId();

  return (
    <button
      type="button"
      draggable
      // The visible title is part of the name, and the description is read after it.
      aria-label={`Add ${title}`}
      aria-describedby={descriptionId}
      onClick={() => {
        onAdd(kind);
      }}
      onDragStart={(event) => {
        writeNodeKind(event.dataTransfer, kind);
      }}
      className="flex w-full cursor-grab items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing"
    >
      <NodeKindIcon kind={kind} className="mt-0.5 size-4 shrink-0 text-fg-muted" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span id={descriptionId} className="text-xs text-fg-muted">
          {description}
        </span>
      </span>
    </button>
  );
}
