import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { DesktopOnlyNotice } from './DesktopOnlyNotice';

const meta = {
  title: 'shared/ui/DesktopOnlyNotice',
  component: DesktopOnlyNotice,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DesktopOnlyNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Pipeline Builder needs a larger screen' }),
    ).toBeVisible();
  },
};
