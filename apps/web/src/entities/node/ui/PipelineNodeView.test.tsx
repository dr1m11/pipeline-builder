import {
  createEmptyPipeline,
  EMPTY_ISSUES,
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineEdge,
  type PipelineNode,
  validatePipeline,
} from '@pipeline-builder/core';
import { render, screen, within } from '@testing-library/react';
import { type NodeTypes, ReactFlow } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { PIPELINE_NODE_TYPE, toFlowNode } from '../model/flow-node';
import { PipelineNodeView } from './PipelineNodeView';

const NODE_TYPES = { [PIPELINE_NODE_TYPE]: PipelineNodeView } satisfies NodeTypes;

function node<K extends NodeKind>(
  kind: K,
  label: string,
  data: Partial<NodeDataMap[K]> = {},
): NodeOfKind<K> {
  return {
    id: label,
    kind,
    label,
    position: { x: 0, y: 0 },
    data: { ...NODE_DEFINITIONS[kind].createData(), ...data },
  };
}

/** Renders the nodes with the issues `validatePipeline` finds for them and the edges. */
function renderOnCanvas(nodes: PipelineNode[], edges: PipelineEdge[] = []) {
  const report = validatePipeline({
    ...createEmptyPipeline({ id: 'draft', name: 'Test' }),
    nodes,
    edges,
  });
  const flowNodes = nodes.map((node) =>
    toFlowNode(node, { issues: report.byNode.get(node.id) ?? EMPTY_ISSUES }),
  );
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={flowNodes} nodeTypes={NODE_TYPES} />
    </div>,
  );
}

// React Flow's own description of a node; a node with problems repeats it after them.
const KEYBOARD_HINT =
  'Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.';

// Connecting ports is covered with the canvas that guards it (widgets/pipeline-canvas).
describe('PipelineNodeView', () => {
  it('shows the label, a summary and every port with its type', async () => {
    renderOnCanvas([node('llm-call', 'LLM Call 1')]);

    const card = await screen.findByRole('group', { name: 'LLM Call 1' });
    expect(within(card).getByText('mock · temperature 0.7')).toBeInTheDocument();
    for (const name of [
      'Input prompt (text)',
      'Input system prompt (text)',
      'Output response (text)',
    ]) {
      expect(within(card).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('gives a Prompt one input per template variable', async () => {
    renderOnCanvas([
      node('prompt', 'Prompt 1', { template: 'Translate {{text}} into {{language}}' }),
    ]);

    const card = await screen.findByRole('group', { name: 'Prompt 1' });
    expect(within(card).getAllByRole('button', { name: /^Input / })).toEqual([
      within(card).getByRole('button', { name: 'Input text (text)' }),
      within(card).getByRole('button', { name: 'Input language (text)' }),
    ]);
  });

  it('shows the type of each port as text', async () => {
    renderOnCanvas([node('transform', 'Transform 1')]);

    const card = await screen.findByRole('group', { name: 'Transform 1' });
    expect(within(card).getByText('json')).toBeInTheDocument();
    expect(within(card).getByText('text')).toBeInTheDocument();
  });

  it('names the kind only when the label does not', async () => {
    renderOnCanvas([node('condition', 'Condition 1'), node('input', 'Input data')]);

    const numbered = await screen.findByRole('group', { name: 'Condition 1' });
    const renamed = screen.getByRole('group', { name: 'Input data' });
    expect(within(numbered).queryByText('Condition')).not.toBeInTheDocument();
    expect(within(renamed).getByText('Input')).toBeInTheDocument();
  });

  it('keeps the keyboard hint as the description of a node without problems', async () => {
    renderOnCanvas([node('input', 'Input 1', { value: 'Why?' })]);

    const card = await screen.findByRole('group', { name: 'Input 1' });
    expect(card).toHaveAccessibleDescription(KEYBOARD_HINT);
  });

  it('counts the problems of a node and describes it by them, keeping its name', async () => {
    renderOnCanvas([node('llm-call', 'LLM Call 1', { model: ' ' })]);

    const card = await screen.findByRole('group', { name: 'LLM Call 1' });
    expect(card).toHaveAccessibleDescription(
      `2 problems: Input "prompt" is not connected. Model: Required. ${KEYBOARD_HINT}`,
    );
    expect(within(card).getByText('2')).toBeInTheDocument();
  });

  it('marks a required input that has no edge', async () => {
    renderOnCanvas([node('prompt', 'Prompt 1')]);

    const card = await screen.findByRole('group', { name: 'Prompt 1' });
    expect(
      within(card).getByRole('button', { name: 'Input question (text)' }),
    ).toHaveAccessibleDescription('Not connected');
    expect(
      within(card).getByRole('button', { name: 'Output prompt (text)' }),
    ).not.toHaveAccessibleDescription();
  });

  it('keeps a port that an edge still uses as a placeholder after the node lost it', async () => {
    const input = node('input', 'Input 1', { value: 'Why?' });
    const prompt = node('prompt', 'Prompt 1', { template: 'Tell a joke' });
    renderOnCanvas(
      [input, prompt],
      [
        {
          id: 'e1',
          source: input.id,
          sourcePort: 'value',
          target: prompt.id,
          targetPort: 'question',
        },
      ],
    );

    const card = await screen.findByRole('group', { name: 'Prompt 1' });
    expect(within(card).getByText('question')).toBeInTheDocument();
    expect(within(card).getByText('removed')).toBeInTheDocument();
    // A placeholder cannot be connected, so it is not offered as a port.
    expect(within(card).queryByRole('button', { name: /question/ })).not.toBeInTheDocument();
    expect(card).toHaveAccessibleDescription(
      new RegExp('^1 problem: Input "question" no longer exists\\.'),
    );
  });
});
