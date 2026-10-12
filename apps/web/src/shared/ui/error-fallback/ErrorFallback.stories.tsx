import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { ErrorFallback } from './ErrorFallback';

const meta = {
  title: 'shared/ui/ErrorFallback',
  component: ErrorFallback,
  parameters: { layout: 'fullscreen' },
  args: {
    error: new Error('Cannot read properties of undefined (reading "ports")'),
    onRetry: fn(),
  },
} satisfies Meta<typeof ErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithErrorMessage: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('reading "ports"');
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const UnknownError: Story = {
  args: { error: 'not an Error instance' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Unknown error');
  },
};
