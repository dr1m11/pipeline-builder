import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen } from 'storybook/test';

import { Button } from '@/shared/ui/button';

import { Tooltip } from './Tooltip';

const meta = {
  title: 'shared/ui/Tooltip',
  component: Tooltip,
  args: {
    content: 'Arrange nodes automatically',
    children: <Button>Auto-layout</Button>,
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'right', 'bottom', 'left'] },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button', { name: 'Auto-layout' }));
    await expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Arrange nodes automatically',
    );
  },
};

export const Bottom: Story = { args: { side: 'bottom' } };

export const KeyboardFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const trigger = canvas.getByRole('button', { name: 'Auto-layout' });
    await expect(trigger).toHaveFocus();
    await expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    await expect(trigger).toHaveAccessibleDescription('Arrange nodes automatically');
  },
};
