import type { Position } from '@pipeline-builder/core';
import type { EdgeChange, NodeChange } from '@xyflow/react';

import type { PipelineFlowNode } from '@/entities/node';
import type { PipelineActions, Size } from '@/entities/pipeline';

import type { PipelineFlowEdge } from './flow-elements';

/** Store actions that React Flow node changes turn into. */
export type NodeChangeActions = Pick<
  PipelineActions,
  'dragNodes' | 'moveNodes' | 'updateSelection' | 'setMeasured'
>;

/**
 * Translates React Flow node changes into store actions. While a drag is in progress only the drag
 * positions change; its final change (`dragging: false`, also sent for arrow-key moves) moves the
 * nodes in the pipeline, once. Removals arrive through `onDelete` and additions through the store,
 * so `remove`, `add` and `replace` changes are ignored.
 */
export function translateNodeChanges(
  changes: readonly NodeChange<PipelineFlowNode>[],
  actions: NodeChangeActions,
): void {
  const dragged = new Map<string, Position>();
  const moved = new Map<string, Position>();
  const selection = new Map<string, boolean>();
  const measured = new Map<string, Size>();

  for (const change of changes) {
    switch (change.type) {
      case 'position':
        // React Flow 12 sends a position with every drag and arrow-key change, the drop included.
        if (change.position === undefined) break;
        if (change.dragging === true) dragged.set(change.id, change.position);
        else moved.set(change.id, change.position);
        break;
      case 'select':
        selection.set(change.id, change.selected);
        break;
      case 'dimensions':
        if (change.dimensions !== undefined) measured.set(change.id, change.dimensions);
        break;
      case 'remove':
      case 'add':
      case 'replace':
        break;
    }
  }

  actions.setMeasured(measured);
  actions.updateSelection({ nodes: selection });
  actions.dragNodes(dragged);
  actions.moveNodes(moved);
}

/**
 * Translates React Flow edge changes into store actions. Only selection is taken: removals arrive
 * through `onDelete`, and edges are added by connecting ports.
 */
export function translateEdgeChanges(
  changes: readonly EdgeChange<PipelineFlowEdge>[],
  actions: Pick<PipelineActions, 'updateSelection'>,
): void {
  const selection = new Map<string, boolean>();
  for (const change of changes) {
    if (change.type === 'select') selection.set(change.id, change.selected);
  }
  actions.updateSelection({ edges: selection });
}
