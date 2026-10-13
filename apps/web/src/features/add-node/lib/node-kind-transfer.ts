import { isNodeKind, type NodeKind } from '@pipeline-builder/core';

/** Media type of a node kind dragged from the palette, so other drags (files, text) are ignored. */
export const NODE_KIND_MEDIA_TYPE = 'application/x-pipeline-node-kind';

/** Puts a node kind on a drag that starts in the palette. */
export function writeNodeKind(
  dataTransfer: Pick<DataTransfer, 'setData' | 'effectAllowed'>,
  kind: NodeKind,
): void {
  dataTransfer.setData(NODE_KIND_MEDIA_TYPE, kind);
  dataTransfer.effectAllowed = 'copy';
}

/** Whether a drag carries a node kind. Browsers reveal only the types until the drop. */
export function carriesNodeKind(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  return dataTransfer.types.includes(NODE_KIND_MEDIA_TYPE);
}

/** The node kind a drop carries, or `null` when it carries none or an unknown one. */
export function readNodeKind(dataTransfer: Pick<DataTransfer, 'getData'>): NodeKind | null {
  const kind = dataTransfer.getData(NODE_KIND_MEDIA_TYPE);
  return isNodeKind(kind) ? kind : null;
}
