import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { Select } from './Select';

const meta = {
  title: 'shared/ui/Select',
  component: Select,
  args: {
    'aria-label': 'Format',
    defaultValue: 'text',
    className: 'w-48',
    children: (
      <>
        <option value="text">Plain text</option>
        <option value="markdown">Markdown</option>
      </>
    ),
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const select = canvas.getByRole('combobox', { name: 'Format' });
    await expect(select).toHaveFocus();
    await userEvent.selectOptions(select, 'Markdown');
    await expect(select).toHaveValue('markdown');
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Format' })).toBeInvalid();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'Format' })).toBeDisabled();
  },
};
