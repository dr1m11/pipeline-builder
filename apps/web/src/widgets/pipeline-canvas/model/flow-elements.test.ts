import {
  createEmptyPipeline,
  createNode,
  EMPTY_ISSUES,
  moveNodes,
  type PipelineEdge,
  type ValidationIssue,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { type FlowNodesSource, type IssuesById, toFlowEdges, toFlowNodes } from './flow-elements';

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
const NO_ISSUES: IssuesById = new Map();

/** An `invalid-field` issue of the Input, as `validatePipeline` would report it. */
function valueIssue(message = 'Value: Required'): ValidationIssue {
  return {
    code: 'invalid-field',
    severity: 'error',
    id: 'invalid-field:input:value',
    message,
    nodeId: 'input',
    field: 'value',
  };
}

function source(overrides: Partial<FlowNodesSource> = {}): FlowNodesSource {
  return {
    nodes: [input, prompt],
    selectedNodeIds: new Set(),
    measured: new Map(),
    dragPositions: new Map(),
    issuesByNode: NO_ISSUES,
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

  it('gives each node its issues and its description', () => {
    const issue = valueIssue();
    const [inputNode, promptNode] = toFlowNodes(
      source({ issuesByNode: new Map([['input', [issue]]]) }),
    );

    expect(inputNode?.data.issues).toEqual([issue]);
    expect(inputNode?.domAttributes).toEqual({ 'aria-describedby': 'node-description-input' });
    expect(promptNode?.data.issues).toBe(EMPTY_ISSUES);
    expect(promptNode?.domAttributes).toEqual({ 'aria-describedby': 'node-description-prompt' });
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

  it('re-creates only the nodes whose problems changed', () => {
    const before = toFlowNodes(source({ issuesByNode: new Map([['input', [valueIssue()]]]) }));
    // Every validation builds new issue objects; equal content must not re-render the node.
    const sameProblems = toFlowNodes(
      source({ issuesByNode: new Map([['input', [valueIssue()]]]) }),
    );
    expect(sameProblems[0]).toBe(before[0]);
    expect(sameProblems[1]).toBe(before[1]);

    const newMessage = toFlowNodes(
      source({ issuesByNode: new Map([['input', [valueIssue('Value: Must be a number')]]]) }),
    );
    expect(newMessage[0]).not.toBe(before[0]);
    expect(newMessage[1]).toBe(before[1]);

    const fixed = toFlowNodes(source());
    expect(fixed[0]).not.toBe(newMessage[0]);
    expect(fixed[1]).toBe(before[1]);
  });
});

describe('toFlowEdges', () => {
  const pipeline = {
    ...createEmptyPipeline({ id: 'draft', name: 'Test' }),
    nodes: [input, prompt],
  };

  it('connects port handles, names the edge after its ports and shows selection', () => {
    expect(toFlowEdges({ ...pipeline, edges: [edge] }, new Set(['edge']), NO_ISSUES)).toEqual([
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
      NO_ISSUES,
    );

    expect(flowEdge?.className).toBe('edge-number');
  });

  it('falls back to ids for a port the pipeline does not have', () => {
    const [flowEdge] = toFlowEdges(
      { ...pipeline, edges: [{ ...edge, target: 'gone', targetPort: 'topic' }] },
      new Set(),
      NO_ISSUES,
    );

    expect(flowEdge?.ariaLabel).toBe('Input 1 value to gone topic');
  });

  it('draws an edge with problems as an error and says why in its name', () => {
    const issues: ValidationIssue[] = [
      {
        code: 'incompatible-edge',
        severity: 'error',
        id: 'incompatible-edge:edge',
        message: 'Connects json to text; convert it with a Transform node',
        edgeId: 'edge',
        sourceType: 'json',
        targetType: 'text',
      },
    ];
    const [flowEdge] = toFlowEdges(
      { ...pipeline, edges: [edge] },
      new Set(),
      new Map([['edge', issues]]),
    );

    expect(flowEdge).toMatchObject({
      className: 'edge-text edge-invalid',
      ariaLabel:
        'Input 1 value to Prompt 1 question, error: Connects json to text; convert it with a Transform node',
    });
  });

  it('reuses the object of an edge until its selection, ports or problems change', () => {
    const [before] = toFlowEdges({ ...pipeline, edges: [edge] }, new Set(), NO_ISSUES);

    const moved = moveNodes(
      { ...pipeline, edges: [edge] },
      new Map([['prompt', { x: 400, y: 0 }]]),
    );
    expect(toFlowEdges(moved, new Set(), NO_ISSUES)[0]).toBe(before);
    expect(toFlowEdges({ ...pipeline, edges: [edge] }, new Set(['edge']), NO_ISSUES)[0]).not.toBe(
      before,
    );

    const renamed = { ...prompt, label: 'Ask' };
    const [after] = toFlowEdges(
      { ...pipeline, nodes: [input, renamed], edges: [edge] },
      new Set(),
      NO_ISSUES,
    );
    expect(after?.ariaLabel).toBe('Input 1 value to Ask question');
  });
});
