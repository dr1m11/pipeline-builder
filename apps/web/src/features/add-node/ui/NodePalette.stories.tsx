import { createEmptyPipeline } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { expect } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { NodePalette } from './NodePalette';

/** The palette over an empty pipeline of its own, in a sidebar-wide column. */
function PalettePreview() {
  const store = useMemo(
    () => createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Story' })),
    [],
  );
  return (
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <div className="w-64 rounded-lg border border-border bg-surface">
          <NodePalette />
        </div>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'features/NodePalette',
  component: PalettePreview,
} satisfies Meta<typeof PalettePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('button', { name: /^Add / })).toHaveLength(6);
    await expect(
      canvas.getByRole('button', {
        name: 'Add Transform',
        description: 'Converts a value: parse or stringify JSON, trim text, read a field.',
      }),
    ).toBeVisible();
  },
};

export const AddWithKeyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'Add Prompt' }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Enter}');

    await expect(canvas.getByRole('status')).toHaveTextContent('Added Prompt 2');
  },
};
