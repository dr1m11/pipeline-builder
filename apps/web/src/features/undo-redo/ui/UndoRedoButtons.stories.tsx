import { createEmptyPipeline, type NodeKind } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, within } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';

import { UndoRedoButtons } from './UndoRedoButtons';

/** The labels of the pipeline's nodes, so stories can see what undo and redo change. */
function NodeList() {
  const nodes = usePipelineStore((state) => state.pipeline.nodes);
  return (
    <p role="status" className="text-xs text-fg-muted">
      Nodes: {nodes.map((node) => node.label).join(', ') || 'none'}
    </p>
  );
}

/** The buttons in a toolbar over a pipeline of their own, to which `added` nodes were added. */
function UndoRedoPreview({ added }: { added: readonly NodeKind[] }) {
  const store = useMemo(() => {
    const created = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Story' }));
    added.forEach((kind, index) => created.getState().addNode(kind, { x: index * 320, y: 0 }));
    return created;
  }, [added]);
  return (
    <PipelineStoreProvider store={store}>
      <div className="flex flex-col items-start gap-2">
        <div role="toolbar" aria-label="Edit" className="flex gap-1">
          <UndoRedoButtons />
        </div>
        <NodeList />
      </div>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'features/UndoRedoButtons',
  component: UndoRedoPreview,
  args: { added: ['input', 'prompt'] },
} satisfies Meta<typeof UndoRedoPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NothingToUndo: Story = {
  args: { added: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Redo' })).toBeDisabled();
  },
};

export const UndoAndRedo: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await userEvent.click(canvas.getByRole('button', { name: 'Undo Add Prompt' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Nodes: Input 1');

    await userEvent.click(canvas.getByRole('button', { name: 'Redo Add Prompt' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Nodes: Input 1, Prompt 1');
    await expect(canvas.getByRole('button', { name: 'Redo' })).toBeDisabled();
  },
};

export const TooltipWithShortcut: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Undo Add Prompt' })).toHaveFocus();
    // The tooltip is portalled to <body>, outside the story canvas. Its modifier depends on the
    // platform: Ctrl or ⌘.
    const tooltip = await screen.findByRole('tooltip');
    await expect(tooltip).toHaveTextContent(/^Undo Add Prompt (Ctrl|⌘) Z$/);
    await expect(within(tooltip).getByText('Z').tagName).toBe('KBD');
  },
};
