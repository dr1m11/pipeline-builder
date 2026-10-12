import { describe, expect, it } from 'vitest';

import { createEmptyPipeline, type Pipeline } from '../pipeline';
import { addNode, findNode, moveNodes, removeElements } from './nodes';

const ORIGIN = { x: 0, y: 0 };

/** Input 1 → Prompt 1 → LLM Call 1, plus a disconnected Output 1. */
function samplePipeline(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'p', name: 'Sample' });
  for (const [kind, id] of [
    ['input', 'in'],
    ['prompt', 'prompt'],
    ['llm-call', 'llm'],
    ['output', 'out'],
  ] as const) {
    pipeline = addNode(pipeline, { kind, id, position: ORIGIN }).pipeline;
  }
  return {
    ...pipeline,
    edges: [
      { id: 'e1', source: 'in', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      { id: 'e2', source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'prompt' },
    ],
  };
}

describe('findNode', () => {
  it('finds a node by id', () => {
    const pipeline = samplePipeline();
    expect(findNode(pipeline, 'llm')).toBe(pipeline.nodes[2]);
  });

  it('returns undefined for an unknown id', () => {
    expect(findNode(samplePipeline(), 'missing')).toBeUndefined();
  });

  it('reflects the nodes of each pipeline object, not an earlier one', () => {
    const before = samplePipeline();
    expect(findNode(before, 'extra')).toBeUndefined();
    const after = addNode(before, { kind: 'output', id: 'extra', position: ORIGIN }).pipeline;
    expect(findNode(after, 'extra')?.label).toBe('Output 2');
    expect(findNode(before, 'extra')).toBeUndefined();
  });
});

describe('addNode', () => {
  it('appends a node with default data and the next free label', () => {
    const before = samplePipeline();
    const { pipeline, node } = addNode(before, {
      kind: 'prompt',
      id: 'prompt-2',
      position: { x: 40, y: 80 },
    });
    expect(node).toEqual({
      id: 'prompt-2',
      kind: 'prompt',
      label: 'Prompt 2',
      position: { x: 40, y: 80 },
      data: { template: 'Answer the question: {{question}}' },
    });
    expect(pipeline.nodes).toEqual([...before.nodes, node]);
  });

  it('leaves the original pipeline and its nodes untouched', () => {
    const before = samplePipeline();
    const nodes = before.nodes;
    const { pipeline } = addNode(before, { kind: 'input', id: 'in-2', position: ORIGIN });
    expect(before.nodes).toBe(nodes);
    expect(before.nodes).toHaveLength(4);
    pipeline.nodes.slice(0, 4).forEach((node, index) => {
      expect(node).toBe(nodes[index]);
    });
    expect(pipeline.edges).toBe(before.edges);
  });

  it('throws when the id is already used', () => {
    expect(() => addNode(samplePipeline(), { kind: 'input', id: 'llm', position: ORIGIN })).toThrow(
      'Node id "llm" is already used',
    );
  });
});

describe('moveNodes', () => {
  it('moves the listed nodes and keeps the others as they are', () => {
    const before = samplePipeline();
    const after = moveNodes(before, new Map([['prompt', { x: 10, y: 20 }]]));
    expect(findNode(after, 'prompt')?.position).toEqual({ x: 10, y: 20 });
    expect(findNode(after, 'in')).toBe(findNode(before, 'in'));
    expect(after.edges).toBe(before.edges);
    expect(findNode(before, 'prompt')?.position).toEqual(ORIGIN);
  });

  it('returns the same pipeline when nothing moves', () => {
    const pipeline = samplePipeline();
    expect(moveNodes(pipeline, new Map())).toBe(pipeline);
    expect(moveNodes(pipeline, new Map([['in', { x: 0, y: 0 }]]))).toBe(pipeline);
    expect(moveNodes(pipeline, new Map([['missing', { x: 5, y: 5 }]]))).toBe(pipeline);
  });

  it('treats a move along one axis as a move', () => {
    const pipeline = samplePipeline();
    expect(
      findNode(moveNodes(pipeline, new Map([['in', { x: 0, y: 1 }]])), 'in')?.position,
    ).toEqual({ x: 0, y: 1 });
  });
});

describe('removeElements', () => {
  it('removes nodes together with their edges', () => {
    const after = removeElements(samplePipeline(), { nodeIds: ['prompt'] });
    expect(after.nodes.map((node) => node.id)).toEqual(['in', 'llm', 'out']);
    expect(after.edges).toEqual([]);
  });

  it('removes edges without touching nodes', () => {
    const before = samplePipeline();
    const after = removeElements(before, { edgeIds: ['e1'] });
    expect(after.edges.map((edge) => edge.id)).toEqual(['e2']);
    expect(after.edges[0]).toBe(before.edges[1]);
    expect(after.nodes).toEqual(before.nodes);
  });

  it('removes nodes and edges in one step', () => {
    const after = removeElements(samplePipeline(), { nodeIds: ['out'], edgeIds: ['e2'] });
    expect(after.nodes.map((node) => node.id)).toEqual(['in', 'prompt', 'llm']);
    expect(after.edges.map((edge) => edge.id)).toEqual(['e1']);
  });

  it('returns the same pipeline when nothing matches', () => {
    const pipeline = samplePipeline();
    expect(removeElements(pipeline, {})).toBe(pipeline);
    expect(removeElements(pipeline, { nodeIds: ['missing'], edgeIds: ['missing'] })).toBe(pipeline);
  });
});
