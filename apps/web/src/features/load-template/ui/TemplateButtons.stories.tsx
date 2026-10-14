import { createEmptyPipeline } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';

import { TemplateButtons } from './TemplateButtons';

/** The pipeline's name and node labels, so stories can see what a button changed. */
function PipelineSummary() {
  const pipeline = usePipelineStore((state) => state.pipeline);
  return (
    <p role="status" className="text-xs text-fg-muted">
      {pipeline.name}: {pipeline.nodes.map((node) => node.label).join(', ') || 'no nodes'}
    </p>
  );
}

/** The buttons over an empty pipeline of their own, as the empty canvas shows them. */
function TemplateButtonsPreview() {
  const store = useMemo(
    () => createPipelineStore(createEmptyPipeline({ id: 'story', name: 'Untitled pipeline' })),
    [],
  );
  return (
    <PipelineStoreProvider store={store}>
      <div className="flex max-w-xl flex-col items-center gap-3 text-sm text-fg-muted">
        <TemplateButtons />
        <PipelineSummary />
      </div>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'features/TemplateButtons',
  component: TemplateButtonsPreview,
} satisfies Meta<typeof TemplateButtonsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const group = canvas.getByRole('group', { name: 'Start from a template:' });
    await expect(group).toBeVisible();
    for (const name of ['Ask a question', 'Route by sentiment', 'Extract a JSON field']) {
      await expect(canvas.getByRole('button', { name })).toBeEnabled();
    }
  },
};

export const StartFromTemplate: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Extract a JSON field' }));

    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Extract a JSON field: Text, Extraction prompt, Extractor, Parse JSON, Get email, Email',
    );
  },
};
