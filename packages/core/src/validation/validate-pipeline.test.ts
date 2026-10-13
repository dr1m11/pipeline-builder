import { describe, expect, it } from 'vitest';

import type { NodeDataMap, NodeKind, NodeOfKind, PipelineNode } from '../nodes/registry';
import { createEmptyPipeline, type Pipeline, type PipelineEdge } from '../pipeline';
import { EMPTY_ISSUES } from './issues';
import { validatePipeline } from './validate-pipeline';

const ORIGIN = { x: 0, y: 0 };

/** A node whose label is its id. */
function nodeOf<K extends NodeKind>(kind: K, id: string, data: NodeDataMap[K]): NodeOfKind<K> {
  return { id, kind, label: id, position: ORIGIN, data };
}

function edge(id: string, from: string, to: string): PipelineEdge {
  const [source = '', sourcePort = ''] = from.split('.');
  const [target = '', targetPort = ''] = to.split('.');
  return { id, source, sourcePort, target, targetPort };
}

function pipelineOf(nodes: readonly PipelineNode[], edges: readonly PipelineEdge[] = []): Pipeline {
  return { ...createEmptyPipeline({ id: 'p', name: 'Test' }), nodes, edges };
}

const INPUT = nodeOf('input', 'in', { valueType: 'text', value: 'Why?' });
const PROMPT = nodeOf('prompt', 'prompt', { template: 'Answer: {{question}}' });
const LLM = nodeOf('llm-call', 'llm', { model: 'mock', temperature: 0.7, maxTokens: 512 });
const OUTPUT = nodeOf('output', 'out', { format: 'text' });
const E1 = edge('e1', 'in.value', 'prompt.question');
const E2 = edge('e2', 'prompt.prompt', 'llm.prompt');
const E3 = edge('e3', 'llm.response', 'out.value');
const CHAIN_EDGES = [E1, E2, E3];

/** Input → Prompt → LLM Call → Output, all valid. */
function validChain(): Pipeline {
  return pipelineOf([INPUT, PROMPT, LLM, OUTPUT], CHAIN_EDGES);
}

/** Ids of the issues of `pipeline`, in report order. */
function issueIds(pipeline: Pipeline): string[] {
  return validatePipeline(pipeline).issues.map((issue) => issue.id);
}

describe('validatePipeline', () => {
  it('finds nothing wrong with a complete pipeline', () => {
    expect(validatePipeline(validChain())).toEqual({
      issues: [],
      errorCount: 0,
      warningCount: 0,
      hasErrors: false,
      byNode: new Map(),
      byEdge: new Map(),
    });
  });

  it('finds nothing wrong with an empty pipeline', () => {
    expect(validatePipeline(pipelineOf([])).issues).toEqual([]);
  });

  it('returns the same report for the same pipeline', () => {
    const pipeline = validChain();
    expect(validatePipeline(pipeline)).toBe(validatePipeline(pipeline));
    expect(validatePipeline({ ...pipeline })).not.toBe(validatePipeline(pipeline));
  });

  it('reports a required input without an edge, but not an optional one', () => {
    const report = validatePipeline(pipelineOf([INPUT, PROMPT, LLM, OUTPUT], [E1, E3]));
    expect(report.issues).toEqual([
      {
        code: 'missing-input',
        severity: 'error',
        id: 'missing-input:llm:prompt',
        message: 'Input "prompt" is not connected',
        nodeId: 'llm',
        portId: 'prompt',
      },
      {
        code: 'unreachable',
        severity: 'warning',
        id: 'unreachable:in',
        message: 'Its result does not reach any Output',
        nodeId: 'in',
      },
      {
        code: 'unreachable',
        severity: 'warning',
        id: 'unreachable:prompt',
        message: 'Its result does not reach any Output',
        nodeId: 'prompt',
      },
    ]);
    expect(report.byNode.get('llm')?.map((issue) => issue.code)).toEqual(['missing-input']);
  });

  it('reports fields that break the rules, named by their label', () => {
    const input = nodeOf('input', 'in', { valueType: 'text', value: ' ' });
    const report = validatePipeline(pipelineOf([input, PROMPT, LLM, OUTPUT], CHAIN_EDGES));
    expect(report.issues).toEqual([
      {
        code: 'invalid-field',
        severity: 'error',
        id: 'invalid-field:in:value',
        message: 'Value: Required',
        nodeId: 'in',
        field: 'value',
      },
    ]);
    expect(report.byNode.get('in')).toEqual(report.issues);
  });

  it('keeps an edge whose input left the template and reports it on the edge and the node', () => {
    const prompt = nodeOf('prompt', 'prompt', { template: 'Tell a joke' });
    const report = validatePipeline(pipelineOf([INPUT, prompt, LLM, OUTPUT], CHAIN_EDGES));
    const dangling = {
      code: 'dangling-edge',
      severity: 'error',
      id: 'dangling-edge:e1:target',
      message: 'Input "question" no longer exists',
      edgeId: 'e1',
      end: 'target',
      nodeId: 'prompt',
      portId: 'question',
      missing: 'port',
    };
    expect(report.issues).toEqual([dangling]);
    expect(report.byEdge.get('e1')).toEqual([dangling]);
    expect(report.byNode.get('prompt')).toEqual([dangling]);
  });

  it('reports a missing output port on the source node', () => {
    const edges = [edge('e1', 'in.answer', 'prompt.question'), E2, E3];
    const [issue] = validatePipeline(pipelineOf([INPUT, PROMPT, LLM, OUTPUT], edges)).issues;
    expect(issue).toMatchObject({
      code: 'dangling-edge',
      end: 'source',
      nodeId: 'in',
      portId: 'answer',
      missing: 'port',
      message: 'Output "answer" no longer exists',
    });
  });

  it('reports edges to and from nodes that no longer exist, only on the edge', () => {
    const edges = [
      edge('e0', 'ghost.value', 'prompt.question'),
      edge('e1', 'in.value', 'void.value'),
      E2,
      E3,
    ];
    const report = validatePipeline(pipelineOf([INPUT, PROMPT, LLM, OUTPUT], edges));
    expect(report.issues.map((issue) => [issue.id, issue.message])).toEqual([
      ['dangling-edge:e0:source', 'Comes from a node that no longer exists'],
      ['dangling-edge:e1:target', 'Goes to a node that no longer exists'],
      ['unreachable:in', 'Its result does not reach any Output'],
    ]);
    expect(report.byNode.has('ghost')).toBe(false);
    expect(report.byNode.has('void')).toBe(false);
    expect(report.byEdge.get('e0')?.map((issue) => issue.code)).toEqual(['dangling-edge']);
  });

  it('reports an edge whose port types no longer match', () => {
    const input = nodeOf('input', 'in', { valueType: 'number', value: '42' });
    const report = validatePipeline(pipelineOf([input, PROMPT, LLM, OUTPUT], CHAIN_EDGES));
    const incompatible = {
      code: 'incompatible-edge',
      severity: 'error',
      id: 'incompatible-edge:e1',
      message: 'Connects number to text; convert it with a Transform node',
      edgeId: 'e1',
      sourceType: 'number',
      targetType: 'text',
    };
    expect(report.issues).toEqual([incompatible]);
    expect(report.byEdge.get('e1')).toEqual([incompatible]);
    expect(report.byNode.size).toBe(0);
  });

  it('reports a cycle with its nodes and edges', () => {
    const edges = [
      edge('e2', 'prompt.prompt', 'llm.prompt'),
      edge('e3', 'llm.response', 'out.value'),
      edge('loop', 'llm.response', 'prompt.question'),
    ];
    const report = validatePipeline(pipelineOf([PROMPT, LLM, OUTPUT], edges));
    const cycle = {
      code: 'cycle',
      severity: 'error',
      id: 'cycle:prompt,llm',
      message: 'Part of a cycle, so the pipeline could never finish',
      nodeIds: ['prompt', 'llm'],
      edgeIds: ['e2', 'loop'],
    };
    expect(report.issues).toEqual([cycle]);
    expect(report.byNode.get('prompt')).toEqual([cycle]);
    expect(report.byNode.get('llm')).toEqual([cycle]);
    expect(report.byEdge.get('loop')).toEqual([cycle]);
    expect(report.byEdge.has('e3')).toBe(false);
  });

  it('reports a node whose output feeds its own input as a cycle', () => {
    const trim = nodeOf('transform', 't', { operation: 'trim', path: '' });
    const edges = [edge('self', 't.result', 't.value'), edge('out', 't.result', 'out.value')];
    expect(issueIds(pipelineOf([trim, OUTPUT], edges))).toEqual(['cycle:t']);
  });

  it('warns about nodes whose result reaches no Output, but not about Outputs', () => {
    const spare = nodeOf('output', 'spare', { format: 'markdown' });
    expect(issueIds(pipelineOf([INPUT, PROMPT, LLM, OUTPUT, spare], [E1, E2]))).toEqual([
      'missing-input:out:value',
      'missing-input:spare:value',
      'unreachable:in',
      'unreachable:prompt',
      'unreachable:llm',
    ]);
  });

  it('warns once about a pipeline without an Output instead of about every node', () => {
    const report = validatePipeline(pipelineOf([INPUT, PROMPT], [E1]));
    expect(report.issues).toEqual([
      {
        code: 'no-output',
        severity: 'warning',
        id: 'no-output',
        message: 'The pipeline has no Output node, so a run would show nothing',
      },
    ]);
    expect(report).toMatchObject({ errorCount: 0, warningCount: 1, hasErrors: false });
    expect(report.byNode.size).toBe(0);
  });

  it('orders errors before warnings: cycles, then nodes, then edges', () => {
    const input = nodeOf('input', 'in', { valueType: 'number', value: '' });
    const edges = [
      edge('e1', 'in.value', 'prompt.question'),
      edge('e2', 'prompt.prompt', 'llm.prompt'),
      edge('loop', 'llm.response', 'prompt.question'),
    ];
    const report = validatePipeline(pipelineOf([input, PROMPT, LLM, OUTPUT], edges));
    expect(report.issues.map((issue) => issue.id)).toEqual([
      'cycle:prompt,llm',
      'invalid-field:in:value',
      'missing-input:out:value',
      'incompatible-edge:e1',
      'unreachable:in',
      'unreachable:prompt',
      'unreachable:llm',
    ]);
    expect(report).toMatchObject({ errorCount: 4, warningCount: 3, hasErrors: true });
  });

  it('offers a shared empty list for elements without issues', () => {
    const report = validatePipeline(validChain());
    expect(report.byNode.get('in') ?? EMPTY_ISSUES).toBe(EMPTY_ISSUES);
    expect(Object.isFrozen(EMPTY_ISSUES)).toBe(true);
  });

  it('validates a chain of 10 000 nodes', () => {
    const ids = Array.from({ length: 10_000 }, (_, index) => `t${String(index)}`);
    const nodes = ids.map((id) => nodeOf('transform', id, { operation: 'trim', path: '' }));
    const edges = ids
      .slice(1)
      .map((id, index) => edge(`e${String(index)}`, `${ids[index] ?? ''}.result`, `${id}.value`));
    const first = ids[0] ?? '';
    const last = ids.at(-1) ?? '';
    const pipeline = pipelineOf(
      [nodeOf('input', 'in', { valueType: 'text', value: ' x ' }), ...nodes, OUTPUT],
      [
        edge('start', 'in.value', `${first}.value`),
        ...edges,
        edge('end', `${last}.result`, 'out.value'),
      ],
    );
    expect(validatePipeline(pipeline).issues).toEqual([]);
  });
});
