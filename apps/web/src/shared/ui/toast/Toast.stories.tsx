import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, waitFor, within } from 'storybook/test';

import { Button } from '@/shared/ui/button';

import { type ToastOptions, useToast } from './use-toast';

/**
 * Calls `toast()` with the story's args. `ToastProvider` comes from the global decorator in
 * `.storybook/preview.tsx`, as it comes from `App` in the app.
 */
function ShowToast(options: ToastOptions) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() => {
        toast(options);
      }}
    >
      Show notification
    </Button>
  );
}

const meta = {
  title: 'shared/ui/Toast',
  component: ShowToast,
  args: { title: 'Copied 2 nodes' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['neutral', 'success', 'danger'] },
  },
} satisfies Meta<typeof ShowToast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The toast region lives outside the story canvas, at the bottom of the page. */
function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

export const Neutral: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show notification' }));
    await expect(await notifications().findByRole('listitem')).toHaveTextContent('Copied 2 nodes');
  },
};

export const Success: Story = {
  args: {
    title: 'Pipeline exported',
    description: 'Saved as untitled-pipeline.pipeline.json.',
    tone: 'success',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show notification' }));
    await expect(await notifications().findByRole('listitem')).toHaveTextContent(
      'Saved as untitled-pipeline.pipeline.json.',
    );
  },
};

export const Danger: Story = {
  args: {
    title: 'Import failed',
    description: 'The file is not a pipeline: it has no "format" field.',
    tone: 'danger',
    duration: 10_000,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show notification' }));
    await expect(await notifications().findByRole('listitem')).toHaveTextContent('Import failed');
  },
};

export const WithAction: Story = {
  args: {
    title: 'Loaded “Route by sentiment”',
    action: { label: 'Undo', altText: 'Press Ctrl+Z to undo', onClick: fn() },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show notification' }));
    await expect(await notifications().findByRole('button', { name: 'Undo' })).toBeVisible();
  },
};

/** F8 jumps to the notifications; Tab reaches the action; Enter runs it and closes the toast. */
export const ActionFromKeyboard: Story = {
  args: WithAction.args,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show notification' }));
    const undo = await notifications().findByRole('button', { name: 'Undo' });

    await userEvent.keyboard('{F8}');
    await userEvent.tab();
    await userEvent.tab();
    await expect(undo).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await expect(args.action?.onClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(notifications().queryByRole('listitem')).not.toBeInTheDocument());
  },
};

export const Dismiss: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Show notification' }));
    await userEvent.click(await notifications().findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(notifications().queryByRole('listitem')).not.toBeInTheDocument());
  },
};
