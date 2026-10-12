import { describe, expect, it } from 'vitest';

import { createEmptyPipeline, type Pipeline } from '../pipeline';
import {
  connect,
  type ConnectionCandidate,
  type ConnectResult,
  validateConnection,
} from './connections';
import { addNode } from './nodes';

const ORIGIN = { x: 0, y: 0 };

/** One node of each kind, without edges. Ids are the kinds. */
function nodesOfEveryKind(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'p', name: 'Sample' });
  for (const kind of ['input', 'prompt', 'llm-call', 'transform', 'condition', 'output'] as const) {
    pipeline = addNode(pipeline, { kind, id: kind, position: ORIGIN }).pipeline;
  }
  return pipeline;
}

/** `connect` for steps that are expected to succeed. */
function connected(
  pipeline: Pipeline,
  candidate: ConnectionCandidate,
  edgeId: string,
): ConnectResult {
  const result = connect(pipeline, candidate, edgeId);
  if (!result.ok) throw new Error(`Expected a connection, got "${result.error}"`);
  return result.value;
}

const INPUT_TO_PROMPT: ConnectionCandidate = {
  source: 'input',
  sourcePort: 'value',
  target: 'prompt',
  targetPort: 'question',
};

const INPUT_TO_OUTPUT: ConnectionCandidate = {
  source: 'input',
  sourcePort: 'value',
  target: 'output',
  targetPort: 'value',
};

describe('validateConnection', () => {
  it('accepts compatible ports and returns them', () => {
    const result = validateConnection(nodesOfEveryKind(), INPUT_TO_PROMPT);
    expect(result).toEqual({
      ok: true,
      value: {
        sourcePort: { id: 'value', label: 'value', type: 'text', required: false },
        targetPort: { id: 'question', label: 'question', type: 'text', required: true },
      },
    });
  });

  it('accepts "any" on either side', () => {
    const pipeline = nodesOfEveryKind();
    const conditionToLlm = {
      source: 'condition',
      sourcePort: 'true',
      target: 'llm-call',
      targetPort: 'prompt',
    };
    const transformToOutput = {
      source: 'transform',
      sourcePort: 'result',
      target: 'output',
      targetPort: 'value',
    };
    expect(validateConnection(pipeline, conditionToLlm).ok).toBe(true);
    expect(validateConnection(pipeline, transformToOutput).ok).toBe(true);
  });

  it('rejects incompatible port types', () => {
    const jsonToText = {
      source: 'transform',
      sourcePort: 'result',
      target: 'llm-call',
      targetPort: 'prompt',
    };
    expect(validateConnection(nodesOfEveryKind(), jsonToText)).toEqual({
      ok: false,
      error: 'incompatible-types',
    });
  });

  it('rejects a connection from a node to itself', () => {
    const loop = {
      source: 'transform',
      sourcePort: 'result',
      target: 'transform',
      targetPort: 'value',
    };
    expect(validateConnection(nodesOfEveryKind(), loop)).toEqual({ ok: false, error: 'self-loop' });
  });

  it('rejects unknown nodes on either end', () => {
    const pipeline = nodesOfEveryKind();
    expect(validateConnection(pipeline, { ...INPUT_TO_PROMPT, source: 'missing' })).toEqual({
      ok: false,
      error: 'unknown-node',
    });
    expect(validateConnection(pipeline, { ...INPUT_TO_PROMPT, target: 'missing' })).toEqual({
      ok: false,
      error: 'unknown-node',
    });
  });

  it('rejects ports that do not exist, or exist on the wrong side', () => {
    const pipeline = nodesOfEveryKind();
    const cases: ConnectionCandidate[] = [
      { ...INPUT_TO_PROMPT, sourcePort: 'missing' },
      { ...INPUT_TO_PROMPT, targetPort: 'topic' },
      // `prompt` is an output of the Prompt node, not an input.
      { ...INPUT_TO_PROMPT, targetPort: 'prompt' },
      // `prompt` is an input of the LLM Call node, not an output.
      { source: 'llm-call', sourcePort: 'prompt', target: 'output', targetPort: 'value' },
    ];
    for (const candidate of cases) {
      expect(validateConnection(pipeline, candidate)).toEqual({ ok: false, error: 'unknown-port' });
    }
  });
});

describe('connect', () => {
  it('adds an edge between compatible ports', () => {
    const before = nodesOfEveryKind();
    const edge = { id: 'e1', ...INPUT_TO_PROMPT };

    const result = connected(before, INPUT_TO_PROMPT, 'e1');

    expect(result).toEqual({ pipeline: { ...before, edges: [edge] }, edge, replacedEdge: null });
    expect(result.pipeline.nodes).toBe(before.nodes);
    expect(before.edges).toEqual([]);
  });

  it('returns the validation error', () => {
    const jsonToText = { ...INPUT_TO_PROMPT, source: 'transform', sourcePort: 'result' };
    expect(connect(nodesOfEveryKind(), jsonToText, 'e1')).toEqual({
      ok: false,
      error: 'incompatible-types',
    });
  });

  it('lets one output feed several inputs', () => {
    const first = connected(nodesOfEveryKind(), INPUT_TO_PROMPT, 'e1');
    const second = connected(first.pipeline, INPUT_TO_OUTPUT, 'e2');

    expect(second.replacedEdge).toBeNull();
    expect(second.pipeline.edges.map((edge) => edge.id)).toEqual(['e1', 'e2']);
  });

  it('replaces the edge already attached to the input', () => {
    const before = connected(nodesOfEveryKind(), INPUT_TO_OUTPUT, 'e1').pipeline;
    const transformToOutput = { ...INPUT_TO_OUTPUT, source: 'transform', sourcePort: 'result' };

    const result = connected(before, transformToOutput, 'e2');

    expect(result.replacedEdge).toBe(before.edges[0]);
    expect(result.pipeline.edges).toEqual([{ id: 'e2', ...transformToOutput }]);
    expect(before.edges.map((edge) => edge.id)).toEqual(['e1']);
  });

  it('puts the new edge where the replaced one was and keeps the other edges as they are', () => {
    const first = connected(nodesOfEveryKind(), INPUT_TO_PROMPT, 'e1');
    const before = connected(first.pipeline, INPUT_TO_OUTPUT, 'e2').pipeline;
    const conditionToPrompt = { ...INPUT_TO_PROMPT, source: 'condition', sourcePort: 'false' };

    const result = connected(before, conditionToPrompt, 'e3');

    expect(result.pipeline.edges.map((edge) => edge.id)).toEqual(['e3', 'e2']);
    expect(result.pipeline.edges[1]).toBe(before.edges[1]);
  });

  it('returns the same pipeline and the existing edge when the ports are already connected', () => {
    const before = connected(nodesOfEveryKind(), INPUT_TO_PROMPT, 'e1').pipeline;

    const result = connected(before, INPUT_TO_PROMPT, 'e2');

    expect(result.pipeline).toBe(before);
    expect(result.edge).toBe(before.edges[0]);
    expect(result.replacedEdge).toBeNull();
  });

  it('throws when the edge id is already used', () => {
    const before = connected(nodesOfEveryKind(), INPUT_TO_PROMPT, 'e1').pipeline;
    expect(() => connect(before, INPUT_TO_OUTPUT, 'e1')).toThrow('Edge id "e1" is already used');
  });
});
