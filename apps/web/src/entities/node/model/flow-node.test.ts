import { createNode } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { PIPELINE_NODE_TYPE, toFlowNode } from './flow-node';

const node = createNode('prompt', { id: 'p-1', label: 'Prompt 1', position: { x: 4, y: 8 } });

describe('toFlowNode', () => {
  it('wraps a domain node for React Flow and names it after its label', () => {
    expect(toFlowNode(node)).toEqual({
      id: 'p-1',
      type: PIPELINE_NODE_TYPE,
      position: { x: 4, y: 8 },
      data: { node },
      ariaLabel: 'Prompt 1',
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
});
