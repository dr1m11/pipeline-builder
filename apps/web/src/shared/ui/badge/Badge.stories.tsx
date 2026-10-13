import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { expect } from 'storybook/test';

import { Badge } from './Badge';

const meta = {
  title: 'shared/ui/Badge',
  component: Badge,
  args: { children: '3' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['neutral', 'danger', 'warning'] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

export const Danger: Story = {
  args: {
    tone: 'danger',
    children: (
      <>
        <CircleAlert aria-hidden />2<span className="sr-only"> errors</span>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('2 errors');
  },
};

export const Warning: Story = {
  args: {
    tone: 'warning',
    children: (
      <>
        <TriangleAlert aria-hidden />1<span className="sr-only"> warning</span>
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('1 warning');
  },
};

/** Tones side by side, as they appear in a problem summary. */
export const InContext: Story = {
  render: () => (
    <p className="flex items-center gap-2 text-sm text-fg">
      Problems
      <Badge tone="danger">
        <CircleAlert aria-hidden />2<span className="sr-only"> errors</span>
      </Badge>
      <Badge tone="warning">
        <TriangleAlert aria-hidden />1<span className="sr-only"> warning</span>
      </Badge>
    </p>
  ),
};
