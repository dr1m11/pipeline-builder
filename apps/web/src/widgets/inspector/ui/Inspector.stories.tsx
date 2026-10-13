import { addNode, createEmptyPipeline, type NodeKind } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { Inspector } from './Inspector';

/** The inspector over unconnected nodes `nodes` (id and kind), with `selected` selected. */
function InspectorPreview({
  nodes,
  selected,
}: {
  nodes: [string, NodeKind][];
  selected: string[];
}) {
  const store = useMemo(() => {
    let pipeline = createEmptyPipeline({ id: 'draft', name: 'Story' });
    nodes.forEach(([id, kind], index) => {
      pipeline = addNode(pipeline, { kind, id, position: { x: index * 300, y: 0 } }).pipeline;
    });
    const created = createPipelineStore(pipeline);
    created.getState().select({ nodeIds: selected });
    return created;
  }, [nodes, selected]);
  return (
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <aside aria-label="Inspector" className="w-80 border border-border bg-surface">
          <Inspector />
        </aside>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'widgets/Inspector',
  component: InspectorPreview,
  args: {
    nodes: [
      ['prompt', 'prompt'],
      ['llm', 'llm-call'],
    ],
    selected: [],
  },
} satisfies Meta<typeof InspectorPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingSelected: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Select a node to edit its properties.')).toBeVisible();
  },
};

export const OneNode: Story = {
  args: { selected: ['llm'] },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'LLM Call 1' })).toBeVisible();

    const name = canvas.getByRole('textbox', { name: 'Name' });
    await userEvent.click(name);
    await userEvent.keyboard('{End} (summary)');

    await expect(
      canvas.getByRole('heading', { level: 3, name: 'LLM Call 1 (summary)' }),
    ).toBeVisible();
  },
};

export const SeveralNodes: Story = {
  args: { selected: ['prompt', 'llm'] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('2 nodes are selected. Select one to edit its properties.'),
    ).toBeVisible();
  },
};

export const NodeWithProblems: Story = {
  args: { selected: ['prompt'] },
  play: async ({ canvas }) => {
    const problems = canvas.getByRole('list', { name: 'Problems of Prompt 1' });
    await expect(problems).toBeVisible();
    await expect(problems).toHaveTextContent('Input "question" is not connected');
  },
};

export const JumpToField: Story = {
  args: {
    nodes: [
      ['input', 'input'],
      ['output', 'output'],
    ],
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Problems: 2 errors, 1 warning' }),
    ).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Error: Input 1, Value: Required' }));

    await expect(canvas.getByRole('heading', { level: 3, name: 'Input 1' })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Value' })).toHaveFocus());
  },
};

export const ProblemsCollapsed: Story = {
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole('button', { name: /^Problems:/ });

    await userEvent.click(toggle);

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('list', { name: 'Problems of the pipeline' })).toBeNull();
  },
};

export const NoProblems: Story = {
  args: { nodes: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Problems: none' })).toBeVisible();
    await expect(canvas.getByText('No problems')).toBeVisible();
  },
};
