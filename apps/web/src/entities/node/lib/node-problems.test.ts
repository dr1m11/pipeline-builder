import type { NodePorts, ValidationIssue } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { handlesKey, summarizeNodeProblems } from './node-problems';

const MISSING_QUESTION: ValidationIssue = {
  code: 'missing-input',
  severity: 'error',
  id: 'missing-input:prompt:question',
  message: 'Input "question" is not connected',
  nodeId: 'prompt',
  portId: 'question',
};

const UNREACHABLE: ValidationIssue = {
  code: 'unreachable',
  severity: 'warning',
  id: 'unreachable:prompt',
  message: 'Its result does not reach any Output',
  nodeId: 'prompt',
};

/** A `dangling-edge` issue for a port of `nodeId` that no longer exists. */
function removedPort(nodeId: string, end: 'source' | 'target', portId: string): ValidationIssue {
  return {
    code: 'dangling-edge',
    severity: 'error',
    id: `dangling-edge:${nodeId}-${portId}:${end}`,
    message: `${end === 'target' ? 'Input' : 'Output'} "${portId}" no longer exists`,
    edgeId: `${nodeId}-${portId}`,
    end,
    nodeId,
    portId,
    missing: 'port',
  };
}

describe('summarizeNodeProblems', () => {
  it('reports nothing for a node without issues', () => {
    expect(summarizeNodeProblems('prompt', [])).toMatchObject({
      severity: null,
      count: 0,
      summary: '',
      removedInputs: [],
      removedOutputs: [],
    });
  });

  it('counts the issues, rates them by the worst one and lists them', () => {
    expect(summarizeNodeProblems('prompt', [UNREACHABLE])).toMatchObject({
      severity: 'warning',
      count: 1,
      summary: '1 problem: Its result does not reach any Output.',
    });
    expect(summarizeNodeProblems('prompt', [MISSING_QUESTION, UNREACHABLE])).toMatchObject({
      severity: 'error',
      count: 2,
      summary:
        '2 problems: Input "question" is not connected. Its result does not reach any Output.',
    });
  });

  it('finds unconnected inputs and the ports that edges still use but the node lost', () => {
    const problems = summarizeNodeProblems('prompt', [
      MISSING_QUESTION,
      removedPort('prompt', 'target', 'topic'),
      removedPort('prompt', 'target', 'topic'),
      removedPort('prompt', 'source', 'answer'),
      removedPort('other', 'source', 'value'),
    ]);

    expect([...problems.unconnectedInputs]).toEqual(['question']);
    expect(problems.removedInputs).toEqual(['topic']);
    expect(problems.removedOutputs).toEqual(['answer']);
  });
});

describe('handlesKey', () => {
  const ports: NodePorts = {
    inputs: [{ id: 'question', label: 'question', type: 'text', required: true }],
    outputs: [{ id: 'prompt', label: 'prompt', type: 'text', required: false }],
  };

  it('changes when a handle is added, removed or renamed, and only then', () => {
    const none = summarizeNodeProblems('prompt', []);
    const key = handlesKey(ports, none);

    expect(handlesKey({ ...ports }, summarizeNodeProblems('prompt', [MISSING_QUESTION]))).toBe(key);
    expect(
      handlesKey(ports, summarizeNodeProblems('prompt', [removedPort('prompt', 'target', 'x')])),
    ).not.toBe(key);
    expect(
      handlesKey(
        { ...ports, inputs: [{ id: 'topic', label: 'topic', type: 'text', required: true }] },
        none,
      ),
    ).not.toBe(key);
  });
});
