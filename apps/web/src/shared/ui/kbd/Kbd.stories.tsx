import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { Kbd } from './Kbd';

const meta = {
  title: 'shared/ui/Kbd',
  component: Kbd,
  args: { children: 'Esc' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleKey: Story = {};

export const Shortcut: Story = {
  render: () => (
    <p className="flex items-center gap-1 text-sm text-fg-muted">
      Undo: <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd>
    </p>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Ctrl').tagName).toBe('KBD');
  },
};
