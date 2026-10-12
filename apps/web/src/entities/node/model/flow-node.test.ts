import { createNode } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { PIPELINE_NODE_TYPE, toFlowNode } from './flow-node';

describe('toFlowNode', () => {
  it('wraps a domain node for React Flow and names it after its label', () => {
    const node = createNode('prompt', { id: 'p-1', label: 'Prompt 1', position: { x: 4, y: 8 } });
    expect(toFlowNode(node)).toEqual({
      id: 'p-1',
      type: PIPELINE_NODE_TYPE,
      position: { x: 4, y: 8 },
      data: { node },
      ariaLabel: 'Prompt 1',
    });
  });
});
