import { createNode, type RunEvent } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, within } from 'storybook/test';

import { createRunStore } from '../model/run-store';
import { RunStoreProvider } from '../model/RunStoreProvider';
import { NodeRunDescription } from './NodeRunDescription';
import { NodeRunDetails } from './NodeRunDetails';
import { NodeRunPreview } from './NodeRunPreview';
import { NodeRunBadge, type ShownRunStatus } from './RunStatusBadge';

const model = createNode('llm-call', { id: 'model', label: 'Model', position: { x: 0, y: 0 } });

const ANSWER = [
  'The sky looks blue because air scatters sunlight.\n',
  'Short blue waves scatter far more than red ones,\n',
  'so blue light reaches your eyes from every part of the sky.',
];

const RUNNING: readonly RunEvent[] = [
  { type: 'node-status', nodeId: 'model', status: 'running' },
  ...ANSWER.slice(0, 2).map((text): RunEvent => ({ type: 'node-delta', nodeId: 'model', text })),
];

/**
 * What a run reports about the model to leave it in each status; for `next`, a step-by-step run
 * then pauses before it.
 */
const RUNS: Record<ShownRunStatus, readonly RunEvent[]> = {
  queued: [{ type: 'node-status', nodeId: 'model', status: 'queued' }],
  next: [{ type: 'node-status', nodeId: 'model', status: 'queued' }],
  running: RUNNING,
  done: [
    ...RUNNING,
    { type: 'node-delta', nodeId: 'model', text: ANSWER[2] ?? '' },
    { type: 'node-output', nodeId: 'model', outputs: { response: ANSWER.join('') } },
    { type: 'node-status', nodeId: 'model', status: 'done' },
  ],
  error: [
    { type: 'node-status', nodeId: 'model', status: 'running' },
    {
      type: 'node-status',
      nodeId: 'model',
      status: 'error',
      error: { code: 'invalid-key', message: 'The API key was rejected.' },
    },
  ],
  cancelled: [...RUNNING, { type: 'node-status', nodeId: 'model', status: 'cancelled' }],
  skipped: [
    { type: 'node-status', nodeId: 'model', status: 'skipped', skipReason: 'branch-not-taken' },
  ],
};

/**
 * The run UI of an LLM Call named "Model" in `status`: what its card shows (status and text), its
 * description, and the inspector's details. The canvas puts the first two into the node's card.
 */
function NodeRunViewsPreview({ status }: { status: ShownRunStatus }) {
  const store = useMemo(() => {
    const created = createRunStore();
    created.getState().start({ stepping: status === 'next' });
    created.getState().applyEvents(RUNS[status]);
    if (status === 'next') created.getState().setPausedNode('model');
    return created;
  }, [status]);
  return (
    <RunStoreProvider store={store}>
      <div className="flex items-start gap-6">
        <section
          aria-label="Card"
          className="w-60 rounded-lg border border-border bg-surface text-fg shadow-elevated"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Model</span>
            <span className="ml-auto flex">
              <NodeRunBadge nodeId="model" />
            </span>
          </div>
          <NodeRunPreview nodeId="model" port="response" label="Model response" />
          <p className="px-3 py-1.5 text-xs text-fg-muted">
            <NodeRunDescription nodeId="model" />
          </p>
        </section>
        <section aria-label="Inspector" className="w-80 border border-border bg-surface p-3">
          <NodeRunDetails node={model} />
        </section>
      </div>
    </RunStoreProvider>
  );
}

const meta = {
  title: 'entities/Run',
  component: NodeRunViewsPreview,
  args: { status: 'running' },
  argTypes: {
    status: { control: 'radio', options: Object.keys(RUNS) },
  },
} satisfies Meta<typeof NodeRunViewsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Waiting for its inputs, or for a free place among the nodes running at once. */
export const Queued: Story = {
  args: { status: 'queued' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Queued')).toBeVisible();
    await expect(card).toHaveTextContent('Run status: queued.');
  },
};

/** The node a step-by-step run is paused before: the next one to run. */
export const Next: Story = {
  args: { status: 'next' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Next')).toBeVisible();
    await expect(card).toHaveTextContent('Run status: next. The run is paused before this node.');
    const inspector = canvas.getByRole('region', { name: 'Inspector' });
    await expect(within(inspector).getByText('Next')).toBeVisible();
  },
};

/** Streaming: the card keeps the last lines in view, with a spinner beside the status. */
export const Running: Story = {
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Running')).toBeVisible();
    await expect(within(card).getByRole('textbox', { name: 'Model response' })).toHaveTextContent(
      'Short blue waves scatter far more than red ones,',
    );
    const inspector = canvas.getByRole('region', { name: 'Inspector' });
    await expect(
      within(inspector).getByRole('figure', { name: 'response (so far)' }),
    ).toBeVisible();
  },
};

export const Done: Story = {
  args: { status: 'done' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Done')).toBeVisible();
    const inspector = canvas.getByRole('region', { name: 'Inspector' });
    await expect(within(inspector).getByRole('figure', { name: 'response' })).toHaveTextContent(
      'so blue light reaches your eyes from every part of the sky.',
    );
  },
};

export const Failed: Story = {
  args: { status: 'error' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Failed')).toBeVisible();
    await expect(within(card).getByText('The API key was rejected.')).toBeVisible();
    await expect(card).toHaveTextContent('Run status: failed. The API key was rejected.');
  },
};

/** Stopped while streaming: what had arrived stays. */
export const Cancelled: Story = {
  args: { status: 'cancelled' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Cancelled')).toBeVisible();
    await expect(within(card).getByRole('textbox', { name: 'Model response' })).toBeVisible();
  },
};

/** On the branch a Condition did not take; on the canvas the card is also dimmed. */
export const Skipped: Story = {
  args: { status: 'skipped' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('region', { name: 'Card' });
    await expect(within(card).getByText('Skipped')).toBeVisible();
    await expect(card).toHaveTextContent('Run status: skipped, its branch was not taken.');
  },
};
