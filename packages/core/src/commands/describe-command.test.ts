import { describe, expect, it } from 'vitest';

import { addNode } from '../graph/nodes';
import { createNode } from '../nodes/registry';
import { createEmptyPipeline, type Pipeline } from '../pipeline';
import { describeCommand } from './describe-command';
import type { PipelineCommand, RemoveElementsCommand } from './pipeline-command';

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

function describeOnSample(command: PipelineCommand): string {
  return describeCommand(command, samplePipeline());
}

describe('describeCommand', () => {
  it('names the kind of an added node', () => {
    expect(
      describeOnSample({ type: 'add-node', id: 'n', kind: 'llm-call', position: ORIGIN }),
    ).toBe('Add LLM Call');
  });

  describe('moves', () => {
    const move = (...ids: string[]) =>
      describeOnSample({ type: 'move-nodes', positions: new Map(ids.map((id) => [id, ORIGIN])) });

    it('names a single node', () => {
      expect(move('prompt')).toBe('Move Prompt 1');
    });

    it('counts several nodes', () => {
      expect(move('in', 'prompt', 'llm')).toBe('Move 3 nodes');
    });

    it('ignores nodes the pipeline does not have', () => {
      expect(move('prompt', 'missing')).toBe('Move Prompt 1');
      expect(move('missing')).toBe('Move 0 nodes');
    });
  });

  describe('removals', () => {
    const remove = (command: Omit<RemoveElementsCommand, 'type'>) =>
      describeOnSample({ type: 'remove-elements', ...command });

    it('names a single node', () => {
      expect(remove({ nodeIds: ['prompt'] })).toBe('Delete Prompt 1');
    });

    it('does not count the edges of removed nodes, even when they are listed', () => {
      expect(remove({ nodeIds: ['prompt'], edgeIds: ['e1', 'e2'] })).toBe('Delete Prompt 1');
    });

    it('names the ends of a single edge', () => {
      expect(remove({ edgeIds: ['e2'] })).toBe('Delete edge from Prompt 1 to LLM Call 1');
    });

    it('counts several nodes or edges', () => {
      expect(remove({ nodeIds: ['in', 'out'] })).toBe('Delete 2 nodes');
      expect(remove({ edgeIds: ['e1', 'e2'] })).toBe('Delete 2 edges');
    });

    it('counts nodes and edges together', () => {
      expect(remove({ nodeIds: ['in', 'out'], edgeIds: ['e2'] })).toBe('Delete 2 nodes and 1 edge');
      expect(remove({ nodeIds: ['out'], edgeIds: ['e1', 'e2'] })).toBe('Delete 1 node and 2 edges');
    });

    it('ignores elements the pipeline does not have', () => {
      expect(remove({ nodeIds: ['missing', 'out'], edgeIds: ['missing'] })).toBe('Delete Output 1');
      expect(remove({})).toBe('Delete 0 nodes');
    });

    it('says "Cut" for a cut', () => {
      expect(remove({ nodeIds: ['in', 'prompt'], reason: 'cut' })).toBe('Cut 2 nodes');
      expect(remove({ nodeIds: ['llm'], reason: 'cut' })).toBe('Cut LLM Call 1');
    });
  });

  it('names the nodes of a connection', () => {
    expect(
      describeOnSample({
        type: 'connect',
        candidate: { source: 'llm', sourcePort: 'response', target: 'out', targetPort: 'value' },
        edgeId: 'e3',
      }),
    ).toBe('Connect LLM Call 1 to Output 1');
  });

  describe('data changes', () => {
    const edit = (nodeId: string, changes: Record<string, unknown>) =>
      describeOnSample({ type: 'update-node-data', nodeId, changes });

    it('names the label of a single field and the node', () => {
      expect(edit('llm', { temperature: 1 })).toBe('Edit Temperature of LLM Call 1');
      expect(edit('llm', { maxTokens: 64 })).toBe('Edit Max tokens of LLM Call 1');
    });

    it('names only the node when several fields change', () => {
      expect(edit('llm', { temperature: 1, maxTokens: 64 })).toBe('Edit LLM Call 1');
      expect(edit('llm', {})).toBe('Edit LLM Call 1');
    });

    it('falls back to the field name and the node id when they are unknown', () => {
      expect(edit('llm', { colour: 'red' })).toBe('Edit colour of LLM Call 1');
      expect(edit('missing', { temperature: 1 })).toBe('Edit temperature of missing');
    });
  });

  it('names a renamed node by its label before the change', () => {
    expect(describeOnSample({ type: 'rename-node', nodeId: 'llm', label: 'Answer' })).toBe(
      'Rename LLM Call 1',
    );
  });

  it('counts pasted and duplicated nodes', () => {
    const nodes = ['a', 'b', 'c'].map((id) =>
      createNode('prompt', { id, label: `Prompt ${id}`, position: ORIGIN }),
    );
    expect(describeOnSample({ type: 'add-elements', nodes, edges: [], reason: 'paste' })).toBe(
      'Paste 3 nodes',
    );
    expect(
      describeOnSample({
        type: 'add-elements',
        nodes: nodes.slice(0, 1),
        edges: [],
        reason: 'duplicate',
      }),
    ).toBe('Duplicate 1 node');
  });

  it('names an imported pipeline and a template', () => {
    const pipeline = createEmptyPipeline({ id: 'q', name: 'Route by sentiment' });
    expect(describeOnSample({ type: 'replace-pipeline', pipeline, reason: 'import' })).toBe(
      'Import “Route by sentiment”',
    );
    expect(describeOnSample({ type: 'replace-pipeline', pipeline, reason: 'template' })).toBe(
      'Load template “Route by sentiment”',
    );
  });

  it('throws on a command type or a replacement reason it does not know', () => {
    // @ts-expect-error -- a command type that does not exist, as only a type error would allow.
    expect(() => describeOnSample({ type: 'group-nodes' })).toThrow('Unhandled variant');
    const pipeline = createEmptyPipeline({ id: 'q', name: 'Copy' });
    expect(() =>
      // @ts-expect-error -- a reason that does not exist, as only a type error would allow.
      describeOnSample({ type: 'replace-pipeline', pipeline, reason: 'duplicate' }),
    ).toThrow('Unhandled variant');
  });

  it('describes a new blank pipeline', () => {
    const pipeline = createEmptyPipeline({ id: 'q', name: 'Untitled pipeline' });
    expect(describeOnSample({ type: 'replace-pipeline', pipeline, reason: 'new' })).toBe(
      'New pipeline',
    );
  });
});
