import type { Meta, StoryObj } from '@storybook/react-vite';
import { Maximize, Redo2, Undo2 } from 'lucide-react';
import { expect, fn, screen } from 'storybook/test';

import { IconButton } from './IconButton';

const meta = {
  title: 'shared/ui/IconButton',
  component: IconButton,
  args: { label: 'Undo', children: <Undo2 aria-hidden />, onClick: fn() },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Secondary: Story = {
  args: { variant: 'secondary', label: 'Fit view', children: <Maximize aria-hidden /> },
};

export const Disabled: Story = {
  args: { disabled: true, label: 'Redo', children: <Redo2 aria-hidden /> },
};

export const WithShortcut: Story = {
  args: { label: 'Undo Move 3 nodes', shortcut: ['Ctrl', 'Z'] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Undo Move 3 nodes' })).toHaveFocus();
    // The tooltip is portalled to <body>, outside the story canvas.
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Undo Move 3 nodes Ctrl Z');
  },
};

export const TooltipOnFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Undo' })).toHaveFocus();
    // The tooltip is portalled to <body>, outside the story canvas.
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Undo');
  },
};
