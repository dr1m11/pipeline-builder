import type { PipelineNode, Position } from '@pipeline-builder/core';
import type { Node } from '@xyflow/react';

/** React Flow node type shared by every node kind; components narrow by `data.node.kind`. */
export const PIPELINE_NODE_TYPE = 'pipeline';

/** A pipeline node as React Flow sees it. */
export type PipelineFlowNode = Node<{ node: PipelineNode }, typeof PIPELINE_NODE_TYPE>;

/** How a node is shown on the canvas, beyond what the pipeline says about it. */
export interface FlowNodeView {
  readonly selected?: boolean;
  /**
   * Size the canvas measured. Without it React Flow hides the node until it measures the node
   * again, and it does so for every new node object.
   */
  readonly measured?: { readonly width: number; readonly height: number } | undefined;
  /** Where the node is while it is dragged; its pipeline position otherwise. */
  readonly dragPosition?: Position | undefined;
}

/** Wraps a domain node for React Flow; its label becomes the accessible name. */
export function toFlowNode(node: PipelineNode, view: FlowNodeView = {}): PipelineFlowNode {
  return {
    id: node.id,
    type: PIPELINE_NODE_TYPE,
    position: view.dragPosition ?? node.position,
    data: { node },
    ariaLabel: node.label,
    selected: view.selected ?? false,
    dragging: view.dragPosition !== undefined,
    measured: view.measured,
  };
}
