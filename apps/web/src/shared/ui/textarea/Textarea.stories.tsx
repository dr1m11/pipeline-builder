import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { Textarea } from './Textarea';

const meta = {
  title: 'shared/ui/Textarea',
  component: Textarea,
  args: { 'aria-label': 'Template', className: 'w-72' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const textarea = canvas.getByRole('textbox', { name: 'Template' });
    await expect(textarea).toHaveFocus();
    await userEvent.keyboard('Summarize:{Enter}the text');
    await expect(textarea).toHaveValue('Summarize:\nthe text');
  },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Template' })).toBeInvalid();
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Answer the question: {{question}}' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Template' })).toBeDisabled();
  },
};
