import {
  addNode,
  createEmptyPipeline,
  type NodeKind,
  type Pipeline,
  type ValidationIssue,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { problemLocation, problemName } from './describe-problem';

/** Input "input" → Prompt "prompt" (question), plus an edge from a node that is gone. */
function pipeline(): Pipeline {
  let result = createEmptyPipeline({ id: 'p', name: 'Test' });
  const kinds: [string, NodeKind][] = [
    ['input', 'input'],
    ['prompt', 'prompt'],
  ];
  for (const [id, kind] of kinds) {
    result = addNode(result, { kind, id, position: { x: 0, y: 0 } }).pipeline;
  }
  return {
    ...result,
    edges: [
      { id: 'e1', source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      { id: 'e2', source: 'gone', sourcePort: 'out', target: 'prompt', targetPort: 'old' },
    ],
  };
}

const BASE = { id: 'issue', message: 'Something is wrong' } as const;

const NODE_ISSUES: ValidationIssue[] = [
  { ...BASE, code: 'missing-input', severity: 'error', nodeId: 'prompt', portId: 'question' },
  { ...BASE, code: 'unreachable', severity: 'warning', nodeId: 'prompt' },
];

describe('problemName', () => {
  it('names a node problem after the node', () => {
    for (const issue of NODE_ISSUES) expect(problemName(issue, pipeline())).toBe('Prompt 1');
  });

  it('names an edge problem after both ports it joins', () => {
    const issue: ValidationIssue = {
      ...BASE,
      code: 'incompatible-edge',
      severity: 'error',
      edgeId: 'e1',
      sourceType: 'json',
      targetType: 'text',
    };
    expect(problemName(issue, pipeline())).toBe('Input 1 value → Prompt 1 question');
  });

  it('falls back to ids for a node and a port that are gone', () => {
    const issue: ValidationIssue = {
      ...BASE,
      code: 'dangling-edge',
      severity: 'error',
      edgeId: 'e2',
      end: 'source',
      nodeId: 'gone',
      portId: 'out',
      missing: 'node',
    };
    expect(problemName(issue, pipeline())).toBe('gone out → Prompt 1 old');
    expect(problemName({ ...issue, edgeId: 'deleted' }, pipeline())).toBe('deleted');
  });

  it('names a cycle after its nodes', () => {
    const issue: ValidationIssue = {
      ...BASE,
      code: 'cycle',
      severity: 'error',
      nodeIds: ['input', 'prompt', 'gone'],
      edgeIds: [],
    };
    expect(problemName(issue, pipeline())).toBe('Cycle: Input 1, Prompt 1, gone');
  });

  it('names a problem of the whole pipeline "Pipeline"', () => {
    const issue: ValidationIssue = { ...BASE, code: 'no-output', severity: 'warning' };
    expect(problemName(issue, pipeline())).toBe('Pipeline');
  });
});

describe('problemLocation', () => {
  it('selects, shows and focuses the node of a node problem', () => {
    for (const issue of NODE_ISSUES) {
      expect(problemLocation(issue, pipeline())).toEqual({
        nodeIds: ['prompt'],
        edgeIds: [],
        visibleNodeIds: ['prompt'],
        focus: { kind: 'node', nodeId: 'prompt' },
      });
    }
  });

  it('focuses the field of a field problem', () => {
    const issue: ValidationIssue = {
      ...BASE,
      code: 'invalid-field',
      severity: 'error',
      nodeId: 'prompt',
      field: 'template',
    };
    expect(problemLocation(issue, pipeline())).toEqual({
      nodeIds: ['prompt'],
      edgeIds: [],
      visibleNodeIds: ['prompt'],
      focus: { kind: 'field', nodeId: 'prompt', field: 'template' },
    });
  });

  it('selects an edge and shows the nodes it joins that still exist', () => {
    const issue: ValidationIssue = {
      ...BASE,
      code: 'dangling-edge',
      severity: 'error',
      edgeId: 'e2',
      end: 'source',
      nodeId: 'gone',
      portId: 'out',
      missing: 'node',
    };
    expect(problemLocation(issue, pipeline())).toEqual({
      nodeIds: [],
      edgeIds: ['e2'],
      visibleNodeIds: ['prompt'],
      focus: { kind: 'edge', edgeId: 'e2' },
    });
    expect(problemLocation({ ...issue, edgeId: 'deleted' }, pipeline())?.visibleNodeIds).toEqual(
      [],
    );
  });

  it('selects every node of a cycle and focuses the first', () => {
    const issue: ValidationIssue = {
      ...BASE,
      code: 'cycle',
      severity: 'error',
      nodeIds: ['input', 'prompt'],
      edgeIds: ['e1'],
    };
    expect(problemLocation(issue, pipeline())).toEqual({
      nodeIds: ['input', 'prompt'],
      edgeIds: [],
      visibleNodeIds: ['input', 'prompt'],
      focus: { kind: 'node', nodeId: 'input' },
    });
    expect(problemLocation({ ...issue, nodeIds: [] }, pipeline())).toBeNull();
  });

  it('has no location for a problem of the whole pipeline', () => {
    const issue: ValidationIssue = { ...BASE, code: 'no-output', severity: 'warning' };
    expect(problemLocation(issue, pipeline())).toBeNull();
  });
});
