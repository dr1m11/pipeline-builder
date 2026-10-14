import { describe, expect, it } from 'vitest';

import { executeCommand } from '../commands/pipeline-command';
import { NODE_LABEL_MAX_LENGTH } from '../nodes/node-label';
import { createNode, type NodeKind, type PipelineNode } from '../nodes/registry';
import { createEmptyPipeline, type Pipeline } from '../pipeline';
import { extractFragment, instantiateFragment, type PipelineElements } from './fragments';

const NO_OFFSET = { x: 0, y: 0 };

/** Input 1 → Prompt 1 → LLM Call 1 → Output 1, laid out left to right. */
function samplePipeline(): Pipeline {
  return {
    ...createEmptyPipeline({ id: 'p', name: 'Sample' }),
    nodes: [
      createNode('input', { id: 'in', label: 'Input 1', position: { x: 0, y: 0 } }),
      createNode('prompt', { id: 'prompt', label: 'Prompt 1', position: { x: 200, y: 0 } }),
      createNode('llm-call', { id: 'llm', label: 'LLM Call 1', position: { x: 400, y: 0 } }),
      createNode('output', { id: 'out', label: 'Output 1', position: { x: 600, y: 0 } }),
    ],
    edges: [
      { id: 'e1', source: 'in', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      { id: 'e2', source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'prompt' },
      { id: 'e3', source: 'llm', sourcePort: 'response', target: 'out', targetPort: 'value' },
    ],
  };
}

/** A pipeline of nodes of one kind with the given labels, for label tests. */
function pipelineWithLabels(kind: NodeKind, labels: readonly string[]): Pipeline {
  return {
    ...createEmptyPipeline({ id: 'p', name: 'Labels' }),
    nodes: labels.map((label, index) =>
      createNode(kind, { id: `${kind}-${String(index)}`, label, position: NO_OFFSET }),
    ),
  };
}

/** An id generator that counts: "new-1", "new-2"… */
function counter(prefix = 'new'): () => string {
  let last = 0;
  return () => `${prefix}-${String(++last)}`;
}

function labelsOf(nodes: readonly PipelineNode[]): string[] {
  return nodes.map((node) => node.label);
}

/** The labels the copies of `labels` get when they are pasted into a pipeline with `existing`. */
function pastedLabels(
  kind: NodeKind,
  labels: readonly string[],
  existing: readonly string[],
): string[] {
  const { nodes } = instantiateFragment(
    pipelineWithLabels(kind, labels),
    pipelineWithLabels(kind, existing),
    { createId: counter(), offset: NO_OFFSET },
  );
  return labelsOf(nodes);
}

/** The pipeline after pasting `elements`; fails the test on an error. */
function pasted(pipeline: Pipeline, elements: PipelineElements): Pipeline {
  const result = executeCommand(pipeline, { type: 'add-elements', ...elements, reason: 'paste' });
  if (!result.ok) throw new Error(`Unexpected error: ${result.error}`);
  return result.value;
}

function expectUniqueIdsAndLabels(pipeline: Pipeline): void {
  const nodeIds = pipeline.nodes.map((node) => node.id);
  const edgeIds = pipeline.edges.map((edge) => edge.id);
  const labels = labelsOf(pipeline.nodes);
  expect(new Set(nodeIds).size).toBe(nodeIds.length);
  expect(new Set(edgeIds).size).toBe(edgeIds.length);
  expect(new Set(labels).size).toBe(labels.length);
}

describe('extractFragment', () => {
  it('keeps the selected nodes in document order and the edges between them', () => {
    const pipeline = samplePipeline();
    const fragment = extractFragment(pipeline, ['llm', 'prompt']);
    expect(fragment.nodes).toEqual([pipeline.nodes[1], pipeline.nodes[2]]);
    expect(fragment.edges).toEqual([pipeline.edges[1]]);
  });

  it('reuses the node and edge objects of the source', () => {
    const pipeline = samplePipeline();
    const fragment = extractFragment(pipeline, new Set(['in', 'prompt']));
    expect(fragment.nodes[0]).toBe(pipeline.nodes[0]);
    expect(fragment.nodes[1]).toBe(pipeline.nodes[1]);
    expect(fragment.edges[0]).toBe(pipeline.edges[0]);
  });

  it('keeps the schema version, id and name of the source', () => {
    const pipeline = samplePipeline();
    const fragment = extractFragment(pipeline, ['in']);
    expect(fragment).toMatchObject({
      schemaVersion: pipeline.schemaVersion,
      id: pipeline.id,
      name: pipeline.name,
    });
  });

  it('leaves out edges with only one end in the selection', () => {
    const fragment = extractFragment(samplePipeline(), ['in', 'llm']);
    expect(labelsOf(fragment.nodes)).toEqual(['Input 1', 'LLM Call 1']);
    expect(fragment.edges).toEqual([]);
  });

  it('ignores unknown ids, also when an edge points to one', () => {
    const pipeline: Pipeline = {
      ...samplePipeline(),
      edges: [
        { id: 'dangling', source: 'in', sourcePort: 'value', target: 'gone', targetPort: 'x' },
      ],
    };
    const fragment = extractFragment(pipeline, ['in', 'gone']);
    expect(labelsOf(fragment.nodes)).toEqual(['Input 1']);
    expect(fragment.edges).toEqual([]);
  });

  it('is empty when nothing is selected', () => {
    const fragment = extractFragment(samplePipeline(), []);
    expect(fragment.nodes).toEqual([]);
    expect(fragment.edges).toEqual([]);
  });

  it('leaves the source pipeline untouched', () => {
    const pipeline = samplePipeline();
    const { nodes, edges } = pipeline;
    extractFragment(pipeline, ['in', 'prompt']);
    expect(pipeline.nodes).toBe(nodes);
    expect(pipeline.edges).toBe(edges);
  });
});

describe('instantiateFragment', () => {
  it('gives every node and then every edge a fresh id and reconnects the edges', () => {
    const source = samplePipeline();
    const fragment = extractFragment(source, ['in', 'prompt', 'llm']);
    const { nodes, edges } = instantiateFragment(fragment, createEmptyPipeline(source), {
      createId: counter(),
      offset: NO_OFFSET,
    });
    expect(nodes.map((node) => node.id)).toEqual(['new-1', 'new-2', 'new-3']);
    expect(edges).toEqual([
      {
        id: 'new-4',
        source: 'new-1',
        sourcePort: 'value',
        target: 'new-2',
        targetPort: 'question',
      },
      { id: 'new-5', source: 'new-2', sourcePort: 'prompt', target: 'new-3', targetPort: 'prompt' },
    ]);
  });

  it('moves the copies by the offset', () => {
    const source = samplePipeline();
    const { nodes } = instantiateFragment(source, source, {
      createId: counter(),
      offset: { x: 24, y: -16 },
    });
    expect(nodes.map((node) => node.position)).toEqual([
      { x: 24, y: -16 },
      { x: 224, y: -16 },
      { x: 424, y: -16 },
      { x: 624, y: -16 },
    ]);
  });

  it('keeps the kind and shares the data of the copied nodes', () => {
    const source = samplePipeline();
    const { nodes } = instantiateFragment(source, source, {
      createId: counter(),
      offset: NO_OFFSET,
    });
    expect(nodes).toHaveLength(source.nodes.length);
    nodes.forEach((copy, index) => {
      const original = source.nodes[index];
      expect(copy.kind).toBe(original?.kind);
      expect(copy.data).toBe(original?.data);
    });
  });

  it('drops edges with an end outside the fragment', () => {
    const fragment: Pipeline = {
      ...extractFragment(samplePipeline(), ['in', 'prompt']),
      edges: [
        { id: 'e1', source: 'in', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
        { id: 'e2', source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'prompt' },
        { id: 'e0', source: 'gone', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      ],
    };
    const { edges } = instantiateFragment(fragment, createEmptyPipeline(fragment), {
      createId: counter(),
      offset: NO_OFFSET,
    });
    expect(edges).toEqual([
      {
        id: 'new-3',
        source: 'new-1',
        sourcePort: 'value',
        target: 'new-2',
        targetPort: 'question',
      },
    ]);
  });

  it('gives nothing for an empty fragment', () => {
    const source = samplePipeline();
    const elements = instantiateFragment(extractFragment(source, []), source, {
      createId: counter(),
      offset: NO_OFFSET,
    });
    expect(elements).toEqual({ nodes: [], edges: [] });
  });

  it('leaves the fragment and the target pipeline untouched', () => {
    const source = samplePipeline();
    const fragment = extractFragment(source, ['in', 'prompt']);
    const { nodes, edges } = fragment;
    instantiateFragment(fragment, source, { createId: counter(), offset: { x: 10, y: 10 } });
    expect(fragment.nodes).toBe(nodes);
    expect(fragment.edges).toBe(edges);
    expect(source).toEqual(samplePipeline());
  });

  describe('labels', () => {
    it('keeps a label that is free in the target pipeline', () => {
      expect(pastedLabels('prompt', ['Prompt 1', 'Summarize'], ['Prompt 2'])).toEqual([
        'Prompt 1',
        'Summarize',
      ]);
    });

    it('numbers a taken default label after the highest of its kind', () => {
      expect(pastedLabels('prompt', ['Prompt 1'], ['Prompt 1', 'Prompt 4'])).toEqual(['Prompt 5']);
    });

    it('numbers taken default labels one after another', () => {
      expect(pastedLabels('prompt', ['Prompt 1', 'Prompt 2'], ['Prompt 1', 'Prompt 2'])).toEqual([
        'Prompt 3',
        'Prompt 4',
      ]);
    });

    it('takes the labels of earlier copies into account', () => {
      // "Prompt 2" is free in the target, but the copy of "Prompt 1" takes it first.
      expect(pastedLabels('prompt', ['Prompt 1', 'Prompt 2'], ['Prompt 1'])).toEqual([
        'Prompt 2',
        'Prompt 3',
      ]);
      expect(pastedLabels('prompt', ['Summarize', 'Summarize'], [])).toEqual([
        'Summarize',
        'Summarize (copy)',
      ]);
    });

    it('numbers a default label of the node kind only', () => {
      const { nodes } = instantiateFragment(
        pipelineWithLabels('llm-call', ['Prompt 1', 'LLM Call 1']),
        pipelineWithLabels('prompt', ['Prompt 1', 'LLM Call 1']),
        { createId: counter(), offset: NO_OFFSET },
      );
      expect(labelsOf(nodes)).toEqual(['Prompt 1 (copy)', 'LLM Call 2']);
    });

    it('treats a label numbered unlike the defaults as custom', () => {
      expect(pastedLabels('prompt', ['Prompt 0', 'Prompt 07'], ['Prompt 0', 'Prompt 07'])).toEqual([
        'Prompt 0 (copy)',
        'Prompt 07 (copy)',
      ]);
    });

    it('adds " (copy)" to a taken custom label, then numbers the copies', () => {
      expect(pastedLabels('prompt', ['Summarize'], ['Summarize'])).toEqual(['Summarize (copy)']);
      expect(
        pastedLabels(
          'prompt',
          ['Summarize'],
          ['Summarize', 'Summarize (copy)', 'Summarize (copy 2)'],
        ),
      ).toEqual(['Summarize (copy 3)']);
      expect(pastedLabels('prompt', ['Summarize', 'Summarize'], ['Summarize'])).toEqual([
        'Summarize (copy)',
        'Summarize (copy 2)',
      ]);
    });

    it('shortens a long custom label to fit the length limit', () => {
      const long = 'a'.repeat(NODE_LABEL_MAX_LENGTH);
      const [first, second] = pastedLabels('prompt', [long, long], [long]);
      expect(first).toBe(`${'a'.repeat(NODE_LABEL_MAX_LENGTH - 7)} (copy)`);
      expect(second).toBe(`${'a'.repeat(NODE_LABEL_MAX_LENGTH - 9)} (copy 2)`);
    });

    it('drops the spaces left at the end of a shortened label', () => {
      const words = `${'a'.repeat(52)} ${'b'.repeat(7)}`;
      expect(words).toHaveLength(NODE_LABEL_MAX_LENGTH);
      expect(pastedLabels('prompt', [words], [words])).toEqual([`${'a'.repeat(52)} (copy)`]);
    });
  });
});

describe('pasting with the add-elements command', () => {
  it('adds a fragment to the pipeline it was copied from', () => {
    const source = samplePipeline();
    const fragment = extractFragment(source, ['in', 'prompt', 'llm']);
    const after = pasted(
      source,
      instantiateFragment(fragment, source, { createId: counter(), offset: { x: 20, y: 20 } }),
    );
    expect(after.nodes).toHaveLength(7);
    expect(after.edges).toHaveLength(5);
    expect(labelsOf(after.nodes.slice(4))).toEqual(['Input 2', 'Prompt 2', 'LLM Call 2']);
    expectUniqueIdsAndLabels(after);
  });

  it('adds the same fragment twice', () => {
    const source = samplePipeline();
    const fragment = extractFragment(source, ['prompt', 'llm']);
    const createId = counter();
    const once = pasted(
      source,
      instantiateFragment(fragment, source, { createId, offset: { x: 20, y: 20 } }),
    );
    const twice = pasted(
      once,
      instantiateFragment(fragment, once, { createId, offset: { x: 40, y: 40 } }),
    );
    expect(twice.nodes).toHaveLength(8);
    expect(twice.edges).toHaveLength(5);
    expect(labelsOf(twice.nodes.slice(4))).toEqual([
      'Prompt 2',
      'LLM Call 2',
      'Prompt 3',
      'LLM Call 3',
    ]);
    expectUniqueIdsAndLabels(twice);
  });

  it('adds a fragment to another pipeline that uses the same ids', () => {
    const fragment = extractFragment(samplePipeline(), ['in', 'prompt']);
    // Another document whose elements have the ids of the copied ones, e.g. an imported copy.
    const into: Pipeline = {
      ...createEmptyPipeline({ id: 'other', name: 'Other' }),
      nodes: [
        createNode('input', { id: 'in', label: 'Question', position: NO_OFFSET }),
        createNode('prompt', { id: 'prompt', label: 'Prompt 1', position: NO_OFFSET }),
      ],
      edges: [
        { id: 'e1', source: 'in', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      ],
    };
    const after = pasted(
      into,
      instantiateFragment(fragment, into, { createId: counter('copy'), offset: NO_OFFSET }),
    );
    expect(after.nodes.map((node) => node.id)).toEqual(['in', 'prompt', 'copy-1', 'copy-2']);
    expect(labelsOf(after.nodes)).toEqual(['Question', 'Prompt 1', 'Input 1', 'Prompt 2']);
    expect(after.edges).toEqual([
      into.edges[0],
      {
        id: 'copy-3',
        source: 'copy-1',
        sourcePort: 'value',
        target: 'copy-2',
        targetPort: 'question',
      },
    ]);
  });
});
