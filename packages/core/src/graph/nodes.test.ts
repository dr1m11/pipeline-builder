import { describe, expect, it } from 'vitest';

import { createNode } from '../nodes/registry';
import { createEmptyPipeline, type Pipeline, type PipelineEdge } from '../pipeline';
import type { Result } from '../result';
import {
  addElements,
  addNode,
  findNode,
  moveNodes,
  removeElements,
  renameNode,
  updateNodeData,
} from './nodes';

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

describe('addElements', () => {
  const prompt = createNode('prompt', { id: 'prompt-2', label: 'Prompt 1', position: ORIGIN });
  const llm = createNode('llm-call', { id: 'llm-2', label: 'LLM Call 1', position: ORIGIN });
  const edge: PipelineEdge = {
    id: 'e3',
    source: 'prompt-2',
    sourcePort: 'prompt',
    target: 'llm-2',
    targetPort: 'prompt',
  };

  it('appends the nodes and edges as they are', () => {
    const before = samplePipeline();
    const after = addElements(before, { nodes: [prompt, llm], edges: [edge] });
    expect(after.nodes).toEqual([...before.nodes, prompt, llm]);
    expect(after.edges).toEqual([...before.edges, edge]);
    expect(findNode(after, 'prompt-2')).toBe(prompt);
  });

  it('keeps the identity of the existing nodes and edges', () => {
    const before = samplePipeline();
    const after = addElements(before, { nodes: [prompt, llm], edges: [edge] });
    before.nodes.forEach((node, index) => {
      expect(after.nodes[index]).toBe(node);
    });
    before.edges.forEach((existing, index) => {
      expect(after.edges[index]).toBe(existing);
    });
    expect(before.nodes).toHaveLength(4);
  });

  it('keeps the edge list when only nodes are added, and the node list when only edges are', () => {
    const before = samplePipeline();
    expect(addElements(before, { nodes: [prompt], edges: [] }).edges).toBe(before.edges);
    const link = {
      id: 'e3',
      source: 'llm',
      sourcePort: 'response',
      target: 'out',
      targetPort: 'value',
    };
    const after = addElements(before, { nodes: [], edges: [link] });
    expect(after.nodes).toBe(before.nodes);
    expect(after.edges).toEqual([...before.edges, link]);
  });

  it('returns the same pipeline when there is nothing to add', () => {
    const pipeline = samplePipeline();
    expect(addElements(pipeline, { nodes: [], edges: [] })).toBe(pipeline);
  });

  it('throws when a node id is already used', () => {
    const output = createNode('output', { id: 'out', label: 'Output 2', position: ORIGIN });
    expect(() => addElements(samplePipeline(), { nodes: [output], edges: [] })).toThrow(
      'Node id "out" is already used',
    );
  });

  it('throws when an edge id is already used', () => {
    expect(() =>
      addElements(samplePipeline(), { nodes: [prompt, llm], edges: [{ ...edge, id: 'e1' }] }),
    ).toThrow('Edge id "e1" is already used');
  });

  it('throws when two added elements share an id', () => {
    expect(() => addElements(samplePipeline(), { nodes: [prompt, prompt], edges: [] })).toThrow(
      'Node id "prompt-2" is already used',
    );
    expect(() =>
      addElements(samplePipeline(), { nodes: [prompt, llm], edges: [edge, edge] }),
    ).toThrow('Edge id "e3" is already used');
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

/** The pipeline of a successful edit; fails the test on an error. */
function edited<E>(result: Result<Pipeline, E>): Pipeline {
  if (!result.ok) throw new Error(`Unexpected error: ${String(result.error)}`);
  return result.value;
}

describe('updateNodeData', () => {
  it('changes the listed fields and keeps the rest of the data', () => {
    const before = samplePipeline();
    const after = edited(updateNodeData(before, 'llm', { temperature: 1.2, maxTokens: 64 }));
    expect(findNode(after, 'llm')?.data).toEqual({
      provider: 'mock',
      model: 'mock',
      temperature: 1.2,
      maxTokens: 64,
    });
    expect(findNode(before, 'llm')?.data).toEqual({
      provider: 'mock',
      model: 'mock',
      temperature: 0.7,
      maxTokens: 512,
    });
  });

  it('keeps the identity of other nodes and of the edges', () => {
    const before = samplePipeline();
    const after = edited(updateNodeData(before, 'llm', { model: 'large' }));
    expect(findNode(after, 'in')).toBe(findNode(before, 'in'));
    expect(findNode(after, 'out')).toBe(findNode(before, 'out'));
    expect(after.edges).toBe(before.edges);
    expect(after.nodes.map((node) => node.id)).toEqual(['in', 'prompt', 'llm', 'out']);
  });

  it('accepts values that only break a rule', () => {
    const after = edited(updateNodeData(samplePipeline(), 'prompt', { template: '' }));
    expect(findNode(after, 'prompt')?.data).toEqual({ template: '' });
  });

  it('keeps the edge of a template variable that was removed', () => {
    const before = samplePipeline();
    const after = edited(updateNodeData(before, 'prompt', { template: 'Tell a joke' }));
    expect(after.edges).toBe(before.edges);
    expect(after.edges.map((edge) => edge.targetPort)).toContain('question');
  });

  it('returns the same pipeline when no value changes', () => {
    const pipeline = samplePipeline();
    expect(edited(updateNodeData(pipeline, 'llm', {}))).toBe(pipeline);
    expect(edited(updateNodeData(pipeline, 'llm', { temperature: 0.7, model: 'mock' }))).toBe(
      pipeline,
    );
  });

  it('rejects an unknown node', () => {
    expect(updateNodeData(samplePipeline(), 'missing', { model: 'mock' })).toEqual({
      ok: false,
      error: 'unknown-node',
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ['a field the kind does not have', { template: 'Hi' }],
    ['a value of the wrong type', { temperature: 'hot' }],
    ['a number that is not finite', { maxTokens: Number.NaN }],
    ['a value outside an enum', { valueType: 'date' }],
  ])('rejects %s', (_, changes) => {
    const node = 'valueType' in changes ? 'in' : 'llm';
    expect(updateNodeData(samplePipeline(), node, changes)).toEqual({
      ok: false,
      error: 'invalid-data',
    });
  });
});

describe('renameNode', () => {
  it('trims the new label and keeps the other nodes and the edges', () => {
    const before = samplePipeline();
    const after = edited(renameNode(before, 'prompt', '  Ask the user  '));
    expect(findNode(after, 'prompt')?.label).toBe('Ask the user');
    expect(findNode(after, 'prompt')?.data).toBe(findNode(before, 'prompt')?.data);
    expect(findNode(after, 'in')).toBe(findNode(before, 'in'));
    expect(after.edges).toBe(before.edges);
  });

  it('returns the same pipeline when the label does not change', () => {
    const pipeline = samplePipeline();
    expect(edited(renameNode(pipeline, 'prompt', ' Prompt 1 '))).toBe(pipeline);
  });

  it('rejects an unknown node', () => {
    expect(renameNode(samplePipeline(), 'missing', 'Name')).toEqual({
      ok: false,
      error: 'unknown-node',
    });
  });

  it.each(['', '   ', 'a'.repeat(61)])('rejects the label %j', (label) => {
    expect(renameNode(samplePipeline(), 'prompt', label)).toEqual({
      ok: false,
      error: 'invalid-label',
    });
  });
});
