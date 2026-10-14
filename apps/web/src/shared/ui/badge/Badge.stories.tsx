import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { expect } from 'storybook/test';

import { Badge } from './Badge';

const meta = {
  title: 'shared/ui/Badge',
  component: Badge,
  args: { children: '3' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'info', 'success', 'danger', 'warning'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

/** Something in progress, such as a node that is running. */
export const Info: Story = {
  args: {
    tone: 'info',
    children: (
      <>
        <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        Running
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('Running');
  },
};

/** Something that went well, such as a node that is done. */
export const Success: Story = {
  args: {
    tone: 'success',
    children: (
      <>
        <CircleCheck aria-hidden />
        Done
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('Done');
  },
};

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

/** Tones side by side, as they appear in a problem summary and in run statuses. */
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
      <Badge tone="info">
        <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
        Running
      </Badge>
      <Badge tone="success">
        <CircleCheck aria-hidden />
        Done
      </Badge>
    </p>
  ),
};
