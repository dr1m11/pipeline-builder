import { createNode, EMPTY_ISSUES, type ValidationIssue } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { nodeDescriptionId, PIPELINE_NODE_TYPE, toFlowNode } from './flow-node';

const node = createNode('prompt', { id: 'p-1', label: 'Prompt 1', position: { x: 4, y: 8 } });

const MISSING_QUESTION: ValidationIssue = {
  code: 'missing-input',
  severity: 'error',
  id: 'missing-input:p-1:question',
  message: 'Input "question" is not connected',
  nodeId: 'p-1',
  portId: 'question',
};

describe('toFlowNode', () => {
  it('wraps a domain node for React Flow, named after its label and described by its card', () => {
    expect(toFlowNode(node)).toEqual({
      id: 'p-1',
      type: PIPELINE_NODE_TYPE,
      position: { x: 4, y: 8 },
      data: { node, issues: EMPTY_ISSUES },
      ariaLabel: 'Prompt 1',
      domAttributes: { 'aria-describedby': 'node-description-p-1' },
      selected: false,
      dragging: false,
      measured: undefined,
    });
  });

  it('shows the selection and the measured size', () => {
    expect(
      toFlowNode(node, { selected: true, measured: { width: 240, height: 120 } }),
    ).toMatchObject({ selected: true, measured: { width: 240, height: 120 } });
  });

  it('places a dragged node at its drag position', () => {
    expect(toFlowNode(node, { dragPosition: { x: 50, y: 60 } })).toMatchObject({
      position: { x: 50, y: 60 },
      dragging: true,
      data: { node },
    });
  });

  it('carries the issues of a node', () => {
    expect(toFlowNode(node, { issues: [MISSING_QUESTION] })).toMatchObject({
      data: { node, issues: [MISSING_QUESTION] },
      domAttributes: { 'aria-describedby': 'node-description-p-1' },
    });
  });
});

describe('nodeDescriptionId', () => {
  it('keeps an id usable in an id reference list', () => {
    expect(nodeDescriptionId('Prompt 1')).toBe('node-description-Prompt%201');
  });
});
