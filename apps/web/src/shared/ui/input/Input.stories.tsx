import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { Input } from './Input';

const meta = {
  title: 'shared/ui/Input',
  component: Input,
  args: { 'aria-label': 'Model', placeholder: 'Model id' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const input = canvas.getByRole('textbox', { name: 'Model' });
    await expect(input).toHaveFocus();
    await userEvent.keyboard('mock');
    await expect(input).toHaveValue('mock');
  },
};

export const Numeric: Story = {
  args: { 'aria-label': 'Max tokens', type: 'number', step: 1, defaultValue: 512 },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('spinbutton', { name: 'Max tokens' });
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.keyboard('1024');
    await expect(input).toHaveValue(1024);
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: ' ' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Model' })).toBeInvalid();
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'mock' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Model' })).toBeDisabled();
  },
};
