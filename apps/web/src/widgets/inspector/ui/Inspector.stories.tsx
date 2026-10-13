import { addNode, createEmptyPipeline } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { Inspector } from './Inspector';

/** The inspector over a Prompt "prompt" and an LLM Call "llm", with `selected` selected. */
function InspectorPreview({ selected }: { selected: string[] }) {
  const store = useMemo(() => {
    let pipeline = createEmptyPipeline({ id: 'draft', name: 'Story' });
    pipeline = addNode(pipeline, {
      kind: 'prompt',
      id: 'prompt',
      position: { x: 0, y: 0 },
    }).pipeline;
    pipeline = addNode(pipeline, {
      kind: 'llm-call',
      id: 'llm',
      position: { x: 300, y: 0 },
    }).pipeline;
    const created = createPipelineStore(pipeline);
    created.getState().select({ nodeIds: selected });
    return created;
  }, [selected]);
  return (
    <PipelineStoreProvider store={store}>
      <aside aria-label="Inspector" className="w-80 border border-border bg-surface">
        <Inspector />
      </aside>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'widgets/Inspector',
  component: InspectorPreview,
  args: { selected: [] },
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
