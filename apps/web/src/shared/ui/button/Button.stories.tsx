import type { Meta, StoryObj } from '@storybook/react-vite';
import { Play, Trash2 } from 'lucide-react';
import { expect, fn } from 'storybook/test';

import { Button } from './Button';

const meta = {
  title: 'shared/ui/Button',
  component: Button,
  args: { children: 'Run pipeline', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'primary' },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Run pipeline' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Secondary: Story = { args: { variant: 'secondary' } };

export const Ghost: Story = { args: { variant: 'ghost' } };

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: (
      <>
        <Trash2 aria-hidden /> Delete node
      </>
    ),
  },
};

export const WithIcon: Story = {
  args: {
    variant: 'primary',
    children: (
      <>
        <Play aria-hidden /> Run
      </>
    ),
  },
};

export const Small: Story = { args: { size: 'sm' } };

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Run pipeline' })).toBeDisabled();
  },
};

export const AsLink: Story = {
  args: { asChild: true, variant: 'secondary', children: <a href="#docs">Read the docs</a> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Read the docs' })).toHaveAttribute(
      'href',
      '#docs',
    );
  },
};

export const KeyboardFocus: Story = {
  args: { variant: 'primary' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Run pipeline' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
