import {
  createEmptyPipeline,
  createNode,
  moveNodes,
  type PipelineEdge,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { type FlowNodesSource, toFlowEdges, toFlowNodes } from './flow-elements';

const input = createNode('input', { id: 'input', label: 'Input 1', position: { x: 0, y: 0 } });
const prompt = createNode('prompt', {
  id: 'prompt',
  label: 'Prompt 1',
  position: { x: 300, y: 0 },
});
const edge: PipelineEdge = {
  id: 'edge',
  source: 'input',
  sourcePort: 'value',
  target: 'prompt',
  targetPort: 'question',
};

function source(overrides: Partial<FlowNodesSource> = {}): FlowNodesSource {
  return {
    nodes: [input, prompt],
    selectedNodeIds: new Set(),
    measured: new Map(),
    dragPositions: new Map(),
    ...overrides,
  };
}

describe('toFlowNodes', () => {
  it('shows selection, measured sizes and drag positions', () => {
    const size = { width: 240, height: 96 };
    const [inputNode, promptNode] = toFlowNodes(
      source({
        selectedNodeIds: new Set(['input']),
        measured: new Map([['input', size]]),
        dragPositions: new Map([['prompt', { x: 320, y: 40 }]]),
      }),
    );

    expect(inputNode).toMatchObject({ id: 'input', selected: true, measured: size });
    expect(promptNode).toMatchObject({
      id: 'prompt',
      selected: false,
      position: { x: 320, y: 40 },
      dragging: true,
    });
  });

  it('reuses the object of every node whose inputs have not changed', () => {
    const first = toFlowNodes(source());
    const again = toFlowNodes(source());
    expect(again[0]).toBe(first[0]);
    expect(again[1]).toBe(first[1]);

    const { nodes } = moveNodes(
      { ...createEmptyPipeline({ id: 'draft', name: 'Test' }), nodes: [input, prompt] },
      new Map([['prompt', { x: 400, y: 0 }]]),
    );
    const afterMove = toFlowNodes(source({ nodes }));
    expect(afterMove[0]).toBe(first[0]);
    expect(afterMove[1]).not.toBe(first[1]);

    const afterSelect = toFlowNodes(source({ nodes, selectedNodeIds: new Set(['input']) }));
    expect(afterSelect[0]).not.toBe(afterMove[0]);
    expect(afterSelect[1]).toBe(afterMove[1]);
  });
});

describe('toFlowEdges', () => {
  const pipeline = {
    ...createEmptyPipeline({ id: 'draft', name: 'Test' }),
    nodes: [input, prompt],
  };

  it('connects port handles, names the edge after its ports and shows selection', () => {
    expect(toFlowEdges({ ...pipeline, edges: [edge] }, new Set(['edge']))).toEqual([
      {
        id: 'edge',
        source: 'input',
        sourceHandle: 'value',
        target: 'prompt',
        targetHandle: 'question',
        selected: true,
        className: 'edge-text',
        ariaLabel: 'Input 1 value to Prompt 1 question',
      },
    ]);
  });

  it('colours an edge by the type of its source port', () => {
    const numberInput = { ...input, data: { ...input.data, valueType: 'number' as const } };
    const [flowEdge] = toFlowEdges(
      { ...pipeline, nodes: [numberInput, prompt], edges: [edge] },
      new Set(),
    );

    expect(flowEdge?.className).toBe('edge-number');
  });

  it('falls back to ids for a port the pipeline does not have', () => {
    const [flowEdge] = toFlowEdges(
      { ...pipeline, edges: [{ ...edge, target: 'gone', targetPort: 'topic' }] },
      new Set(),
    );

    expect(flowEdge?.ariaLabel).toBe('Input 1 value to gone topic');
  });

  it('reuses the object of an edge until its selection or its ports change', () => {
    const [before] = toFlowEdges({ ...pipeline, edges: [edge] }, new Set());

    const moved = moveNodes(
      { ...pipeline, edges: [edge] },
      new Map([['prompt', { x: 400, y: 0 }]]),
    );
    expect(toFlowEdges(moved, new Set())[0]).toBe(before);
    expect(toFlowEdges({ ...pipeline, edges: [edge] }, new Set(['edge']))[0]).not.toBe(before);

    const renamed = { ...prompt, label: 'Ask' };
    const [after] = toFlowEdges({ ...pipeline, nodes: [input, renamed], edges: [edge] }, new Set());
    expect(after?.ariaLabel).toBe('Input 1 value to Ask question');
  });
});
