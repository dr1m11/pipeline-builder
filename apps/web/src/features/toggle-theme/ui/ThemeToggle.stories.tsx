import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { ThemeToggle } from './ThemeToggle';

const meta = {
  title: 'features/ThemeToggle',
  component: ThemeToggle,
  beforeEach: () => {
    // Each story starts from the default preference and restores the page theme afterwards.
    const stored = window.localStorage.getItem('pb:theme');
    const theme = document.documentElement.dataset.theme;
    window.localStorage.removeItem('pb:theme');
    return () => {
      if (stored === null) window.localStorage.removeItem('pb:theme');
      else window.localStorage.setItem('pb:theme', stored);
      if (theme) document.documentElement.dataset.theme = theme;
    };
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SwitchToDark: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Dark' }));
    await expect(canvas.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(document.documentElement.dataset.theme).toBe('dark');
  },
};

export const KeyboardNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('radio', { name: 'System' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', { name: 'Light' })).toBeChecked();
    await expect(document.documentElement.dataset.theme).toBe('light');
  },
};
