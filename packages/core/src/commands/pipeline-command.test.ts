import { describe, expect, it } from 'vitest';

import { addNode, findNode } from '../graph/nodes';
import { createNode } from '../nodes/registry';
import { createEmptyPipeline, type Pipeline } from '../pipeline';
import { commandMergeKey, executeCommand, type PipelineCommand } from './pipeline-command';

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

/** The pipeline a command produces; fails the test on an error. */
function executed(pipeline: Pipeline, command: PipelineCommand): Pipeline {
  const result = executeCommand(pipeline, command);
  if (!result.ok) throw new Error(`Unexpected error: ${result.error}`);
  return result.value;
}

describe('executeCommand', () => {
  it('adds a node with the id from the command', () => {
    const before = samplePipeline();
    const after = executed(before, {
      type: 'add-node',
      id: 'prompt-2',
      kind: 'prompt',
      position: { x: 10, y: 20 },
    });
    expect(findNode(after, 'prompt-2')).toMatchObject({
      kind: 'prompt',
      label: 'Prompt 2',
      position: { x: 10, y: 20 },
    });
    expect(after.nodes.slice(0, 4)).toEqual(before.nodes);
  });

  it('moves nodes', () => {
    const after = executed(samplePipeline(), {
      type: 'move-nodes',
      positions: new Map([['llm', { x: 300, y: 40 }]]),
    });
    expect(findNode(after, 'llm')?.position).toEqual({ x: 300, y: 40 });
  });

  it('removes nodes with their edges, and edges', () => {
    const after = executed(samplePipeline(), {
      type: 'remove-elements',
      nodeIds: ['llm'],
      edgeIds: ['e1'],
    });
    expect(after.nodes.map((node) => node.id)).toEqual(['in', 'prompt', 'out']);
    expect(after.edges).toEqual([]);
  });

  it('removes cut elements like deleted ones', () => {
    const before = samplePipeline();
    const cut = executed(before, { type: 'remove-elements', nodeIds: ['out'], reason: 'cut' });
    expect(cut).toEqual(executed(before, { type: 'remove-elements', nodeIds: ['out'] }));
  });

  it('connects ports with the edge id from the command', () => {
    const after = executed(samplePipeline(), {
      type: 'connect',
      candidate: { source: 'llm', sourcePort: 'response', target: 'out', targetPort: 'value' },
      edgeId: 'e3',
    });
    expect(after.edges.at(-1)).toEqual({
      id: 'e3',
      source: 'llm',
      sourcePort: 'response',
      target: 'out',
      targetPort: 'value',
    });
  });

  it('updates node data', () => {
    const after = executed(samplePipeline(), {
      type: 'update-node-data',
      nodeId: 'llm',
      changes: { temperature: 1 },
    });
    expect(findNode(after, 'llm')?.data).toMatchObject({ temperature: 1 });
  });

  it('renames a node', () => {
    const after = executed(samplePipeline(), {
      type: 'rename-node',
      nodeId: 'llm',
      label: ' Answer ',
    });
    expect(findNode(after, 'llm')?.label).toBe('Answer');
  });

  it('adds ready-made elements', () => {
    const copy = createNode('output', { id: 'out-2', label: 'Output 2', position: ORIGIN });
    const edge = {
      id: 'e3',
      source: 'llm',
      sourcePort: 'response',
      target: 'out-2',
      targetPort: 'value',
    };
    const after = executed(samplePipeline(), {
      type: 'add-elements',
      nodes: [copy],
      edges: [edge],
      reason: 'paste',
    });
    expect(after.nodes.at(-1)).toBe(copy);
    expect(after.edges.at(-1)).toBe(edge);
  });

  it('replaces the whole pipeline', () => {
    const next = createEmptyPipeline({ id: 'q', name: 'Blank' });
    expect(
      executed(samplePipeline(), { type: 'replace-pipeline', pipeline: next, reason: 'new' }),
    ).toBe(next);
  });

  it.each<[string, PipelineCommand]>([
    ['a move to the same place', { type: 'move-nodes', positions: new Map([['in', ORIGIN]]) }],
    ['a removal of unknown elements', { type: 'remove-elements', nodeIds: ['missing'] }],
    [
      'a connection that exists',
      {
        type: 'connect',
        candidate: { source: 'in', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
        edgeId: 'e3',
      },
    ],
    ['data that does not change', { type: 'update-node-data', nodeId: 'llm', changes: {} }],
    ['the same label', { type: 'rename-node', nodeId: 'llm', label: 'LLM Call 1' }],
    ['no elements to add', { type: 'add-elements', nodes: [], edges: [], reason: 'duplicate' }],
  ])('returns the same pipeline for %s', (_, command) => {
    const pipeline = samplePipeline();
    expect(executed(pipeline, command)).toBe(pipeline);
  });

  it('returns the same pipeline when it replaces the pipeline with itself', () => {
    const pipeline = samplePipeline();
    expect(executed(pipeline, { type: 'replace-pipeline', pipeline, reason: 'import' })).toBe(
      pipeline,
    );
  });

  it.each<[string, PipelineCommand, string]>([
    [
      'a connection of a node to itself',
      {
        type: 'connect',
        candidate: { source: 'in', sourcePort: 'value', target: 'in', targetPort: 'value' },
        edgeId: 'e3',
      },
      'self-loop',
    ],
    [
      'data of an unknown node',
      { type: 'update-node-data', nodeId: 'missing', changes: { model: 'large' } },
      'unknown-node',
    ],
    [
      'data that does not fit the kind',
      { type: 'update-node-data', nodeId: 'llm', changes: { temperature: 'hot' } },
      'invalid-data',
    ],
    ['a blank label', { type: 'rename-node', nodeId: 'llm', label: ' ' }, 'invalid-label'],
  ])('rejects %s', (_, command, error) => {
    expect(executeCommand(samplePipeline(), command)).toEqual({ ok: false, error });
  });

  it('throws when the command reuses an id', () => {
    expect(() =>
      executeCommand(samplePipeline(), {
        type: 'add-node',
        id: 'llm',
        kind: 'prompt',
        position: ORIGIN,
      }),
    ).toThrow('Node id "llm" is already used');
  });
});

describe('commandMergeKey', () => {
  it('keys data changes by node and sorted field names', () => {
    expect(
      commandMergeKey({
        type: 'update-node-data',
        nodeId: 'llm',
        changes: { temperature: 1, maxTokens: 64 },
      }),
    ).toBe('data:llm:maxTokens,temperature');
  });

  it('gives changes to other fields of the same node another key', () => {
    const key = (changes: Record<string, unknown>) =>
      commandMergeKey({ type: 'update-node-data', nodeId: 'llm', changes });
    expect(key({ temperature: 1 })).not.toBe(key({ model: 'large' }));
    expect(key({ temperature: 1 })).toBe(key({ temperature: 2 }));
  });

  it('keys renames by node', () => {
    expect(commandMergeKey({ type: 'rename-node', nodeId: 'llm', label: 'Answer' })).toBe(
      'label:llm',
    );
  });

  it('keys moves by the sorted ids of the moved nodes', () => {
    expect(
      commandMergeKey({
        type: 'move-nodes',
        positions: new Map([
          ['prompt', ORIGIN],
          ['in', { x: 5, y: 5 }],
        ]),
      }),
    ).toBe('move:in,prompt');
  });

  it.each<PipelineCommand>([
    { type: 'add-node', id: 'n', kind: 'input', position: ORIGIN },
    { type: 'remove-elements', nodeIds: ['in'] },
    {
      type: 'connect',
      candidate: { source: 'in', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      edgeId: 'e3',
    },
    { type: 'add-elements', nodes: [], edges: [], reason: 'paste' },
    {
      type: 'replace-pipeline',
      pipeline: createEmptyPipeline({ id: 'q', name: 'Blank' }),
      reason: 'template',
    },
  ])('never merges a $type command', (command) => {
    expect(commandMergeKey(command)).toBeNull();
  });
});
