import { addNode, createEmptyPipeline, type NodeKind, type RunEvent } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { createRunStore, RunStoreProvider } from '@/entities/run';

import { Inspector } from './Inspector';

/**
 * The inspector over unconnected nodes `nodes` (id and kind), with `selected` selected, and a run
 * that has reported `run`, if any.
 */
function InspectorPreview({
  nodes,
  selected,
  run = [],
}: {
  nodes: [string, NodeKind][];
  selected: string[];
  run?: readonly RunEvent[];
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
  const runStore = useMemo(() => {
    const created = createRunStore();
    if (run.length > 0) {
      created.getState().start();
      created.getState().applyEvents(run);
    }
    return created;
  }, [run]);
  return (
    <PipelineStoreProvider store={store}>
      <RunStoreProvider store={runStore}>
        <ReactFlowProvider>
          <aside aria-label="Inspector" className="w-80 border border-border bg-surface">
            <Inspector />
          </aside>
        </ReactFlowProvider>
      </RunStoreProvider>
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

/** The full answer of the selected LLM Call, below its properties. */
export const RunOutput: Story = {
  args: {
    selected: ['llm'],
    run: [
      { type: 'node-status', nodeId: 'llm', status: 'running' },
      {
        type: 'node-delta',
        nodeId: 'llm',
        text: 'The sky looks blue because air scatters sunlight.',
      },
      {
        type: 'node-output',
        nodeId: 'llm',
        outputs: { response: 'The sky looks blue because air scatters sunlight.' },
      },
      { type: 'node-status', nodeId: 'llm', status: 'done' },
    ],
  },
  play: async ({ canvas }) => {
    const section = canvas.getByRole('region', { name: 'Run output' });
    await expect(within(section).getByText('Done')).toBeVisible();
    await expect(within(section).getByRole('figure', { name: 'response' })).toHaveTextContent(
      'The sky looks blue because air scatters sunlight.',
    );
  },
};

/** Why the selected node failed. */
export const RunError: Story = {
  args: {
    nodes: [['parse', 'transform']],
    selected: ['parse'],
    run: [
      { type: 'node-status', nodeId: 'parse', status: 'running' },
      {
        type: 'node-status',
        nodeId: 'parse',
        status: 'error',
        error: { code: 'invalid-json', message: 'Input "value" is not valid JSON' },
      },
    ],
  },
  play: async ({ canvas }) => {
    const section = canvas.getByRole('region', { name: 'Run output' });
    await expect(within(section).getByText('Failed')).toBeVisible();
    await expect(within(section).getByText('Input "value" is not valid JSON')).toBeVisible();
  },
};
