import { addNode, createEmptyPipeline, type NodeKind } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, waitFor, within } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';

import { NewPipelineMenu } from './NewPipelineMenu';

/** The pipeline's name and node labels, so stories can see what the menu changed. */
function PipelineSummary() {
  const pipeline = usePipelineStore((state) => state.pipeline);
  return (
    <p role="status" className="text-xs text-fg-muted">
      {pipeline.name}: {pipeline.nodes.map((node) => node.label).join(', ') || 'no nodes'}
    </p>
  );
}

/** The menu in a File toolbar over a pipeline of its own, which starts with `kinds`. */
function NewPipelinePreview({ kinds }: { kinds: readonly NodeKind[] }) {
  const store = useMemo(
    () =>
      createPipelineStore(
        kinds.reduce(
          (pipeline, kind, index) =>
            addNode(pipeline, {
              kind,
              id: `${kind}-${String(index)}`,
              position: { x: index * 320, y: 0 },
            }).pipeline,
          createEmptyPipeline({ id: 'story', name: 'Story pipeline' }),
        ),
      ),
    [kinds],
  );
  return (
    <PipelineStoreProvider store={store}>
      <div className="flex flex-col items-start gap-2">
        <div role="toolbar" aria-label="File" className="flex gap-1">
          <NewPipelineMenu />
        </div>
        <PipelineSummary />
      </div>
    </PipelineStoreProvider>
  );
}

/** The toast region lives outside the story canvas, at the bottom of the page. */
function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

const meta = {
  title: 'features/NewPipelineMenu',
  component: NewPipelinePreview,
  args: { kinds: ['input', 'output'] },
} satisfies Meta<typeof NewPipelinePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A blank pipeline, then the templates, each described by what it does. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New' }));

    // The menu is portalled to <body>, outside the story canvas.
    const menu = await screen.findByRole('menu');
    await expect(menu).toBeVisible();
    await expect(within(menu).getByRole('menuitem', { name: 'Blank pipeline' })).toBeVisible();
    await expect(
      within(menu).getByRole('menuitem', { name: 'Ask a question' }),
    ).toHaveAccessibleDescription('An LLM answers a question');
    await expect(
      within(menu).getByRole('menuitem', { name: 'Route by sentiment' }),
    ).toHaveAccessibleDescription('Branches on a review’s sentiment');
    await expect(
      within(menu).getByRole('menuitem', { name: 'Extract a JSON field' }),
    ).toHaveAccessibleDescription('Reads one field from an LLM’s JSON');
  },
};

/** A template replaces the pipeline, and the toast offers to bring the old one back. */
export const LoadTemplate: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Route by sentiment' }));

    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Route by sentiment: Review, Sentiment prompt, Classifier, Is positive?, Positive, Negative',
    );
    await expect(await notifications().findByRole('listitem')).toHaveTextContent(
      'Loaded “Route by sentiment”',
    );

    await userEvent.click(notifications().getByRole('button', { name: 'Undo' }));

    await expect(canvas.getByRole('status')).toHaveTextContent('Story pipeline: Input 1, Output 1');
    await waitFor(() => expect(notifications().queryByRole('listitem')).not.toBeInTheDocument());
  },
};

/** From the keyboard: the menu opens on Enter, the arrows pick an item, focus comes back. */
export const BlankPipelineFromKeyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'New' });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const blank = await screen.findByRole('menuitem', { name: 'Blank pipeline' });
    await waitFor(() => expect(blank).toHaveFocus());

    await userEvent.keyboard('{Enter}');

    await expect(canvas.getByRole('status')).toHaveTextContent('Untitled pipeline: no nodes');
    await expect(await notifications().findByRole('listitem')).toHaveTextContent(
      'Started a blank pipeline',
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Nothing to bring back from an empty canvas, so no toast. */
export const FromEmptyCanvas: Story = {
  args: { kinds: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ask a question' }));

    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Ask a question: Question, Answer prompt, Model, Answer',
    );
    await expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  },
};
