import {
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineNode,
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

function renderOnCanvas(nodes: PipelineNode[]) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={nodes.map(toFlowNode)} nodeTypes={NODE_TYPES} />
    </div>,
  );
}

// Connecting ports needs document.elementFromPoint, which jsdom lacks: see the Storybook stories.
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
});
