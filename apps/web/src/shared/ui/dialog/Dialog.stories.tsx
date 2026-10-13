import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, waitFor } from 'storybook/test';

import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Kbd } from '@/shared/ui/kbd';

import { Dialog, DialogContent, DialogTrigger } from './Dialog';

const meta = {
  title: 'shared/ui/Dialog',
  component: DialogContent,
  subcomponents: { Dialog, DialogTrigger },
  args: {
    title: 'Rename pipeline',
    description: 'The name is also used for exported files.',
    children: (
      <Field label="Name">
        <Input defaultValue="Untitled pipeline" />
      </Field>
    ),
  },
  render: (args) => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent {...args} />
    </Dialog>
  ),
} satisfies Meta<typeof DialogContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened from the keyboard: focus moves to the first field, and Tab stays inside. */
export const Default: Story = {
  play: async ({ userEvent }) => {
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    // The dialog is portalled to <body>, outside the story canvas.
    const dialog = await screen.findByRole('dialog', { name: 'Rename pipeline' });
    await expect(dialog).toHaveAccessibleDescription('The name is also used for exported files.');
    const name = screen.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveFocus();

    await userEvent.tab();
    await expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab();
    await expect(name).toHaveFocus();
  },
};

/** Escape and the Close button both close the dialog and return focus to the trigger. */
export const Closing: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Open dialog' });

    await userEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Rename pipeline' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

/**
 * Without a description the dialog has no accessible description. With no controls besides Close,
 * the panel itself takes focus.
 */
export const WithoutDescription: Story = {
  args: {
    title: 'Keyboard shortcuts',
    description: undefined,
    children: (
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
        <dt>Undo</dt>
        <dd>
          <Kbd>Ctrl</Kbd> <Kbd>Z</Kbd>
        </dd>
        <dt>Redo</dt>
        <dd>
          <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>Z</Kbd>
        </dd>
        <dt>Delete the selection</dt>
        <dd>
          <Kbd>Delete</Kbd>
        </dd>
      </dl>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }));

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).not.toHaveAttribute('aria-describedby');
    await expect(dialog).toHaveFocus();
    await userEvent.tab();
    await expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  },
};
