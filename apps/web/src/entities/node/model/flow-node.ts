import type { PipelineNode } from '@pipeline-builder/core';
import type { Node } from '@xyflow/react';

/** React Flow node type shared by every node kind; components narrow by `data.node.kind`. */
export const PIPELINE_NODE_TYPE = 'pipeline';

/** A pipeline node as React Flow sees it. */
export type PipelineFlowNode = Node<{ node: PipelineNode }, typeof PIPELINE_NODE_TYPE>;

/** Wraps a domain node for React Flow; its label becomes the accessible name. */
export function toFlowNode(node: PipelineNode): PipelineFlowNode {
  return {
    id: node.id,
    type: PIPELINE_NODE_TYPE,
    position: node.position,
    data: { node },
    ariaLabel: node.label,
  };
}
