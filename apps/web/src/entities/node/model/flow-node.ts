import {
  EMPTY_ISSUES,
  type PipelineNode,
  type Position,
  type ValidationIssue,
} from '@pipeline-builder/core';
import type { Node } from '@xyflow/react';

/** React Flow node type shared by every node kind; components narrow by `data.node.kind`. */
export const PIPELINE_NODE_TYPE = 'pipeline';

/** What a node on the canvas shows: the domain node and its validation issues. */
export interface PipelineFlowNodeData extends Record<string, unknown> {
  readonly node: PipelineNode;
  readonly issues: readonly ValidationIssue[];
}

/** A pipeline node as React Flow sees it. */
export type PipelineFlowNode = Node<PipelineFlowNodeData, typeof PIPELINE_NODE_TYPE>;

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
  /** Validation issues of the node (`ValidationReport.byNode`). */
  readonly issues?: readonly ValidationIssue[];
}

/**
 * Id of the element that describes a node with problems. Node ids may contain spaces, which would
 * split an `aria-describedby` reference, so the id is encoded.
 */
export function nodeDescriptionId(nodeId: string): string {
  return `node-description-${encodeURIComponent(nodeId)}`;
}

/**
 * Wraps a domain node for React Flow; its label becomes the accessible name. A node with problems
 * is described by its card's list of them instead of React Flow's keyboard hint, which the card
 * repeats.
 */
export function toFlowNode(node: PipelineNode, view: FlowNodeView = {}): PipelineFlowNode {
  const issues = view.issues ?? EMPTY_ISSUES;
  return {
    id: node.id,
    type: PIPELINE_NODE_TYPE,
    position: view.dragPosition ?? node.position,
    data: { node, issues },
    ariaLabel: node.label,
    ...(issues.length > 0 && {
      domAttributes: { 'aria-describedby': nodeDescriptionId(node.id) },
    }),
    selected: view.selected ?? false,
    dragging: view.dragPosition !== undefined,
    measured: view.measured,
  };
}
