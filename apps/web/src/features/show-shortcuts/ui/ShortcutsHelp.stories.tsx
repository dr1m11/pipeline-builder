import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, waitFor, within } from 'storybook/test';

import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

import { SHOW_SHORTCUTS_SHORTCUTS } from '../config/shortcuts';
import { useShowShortcutsShortcut } from '../model/use-show-shortcuts-shortcut';
import { ShortcutsHelp } from './ShortcutsHelp';

// The editor lists the shortcuts of its features and of the canvas. A feature cannot import them,
// so the stories list a sample written out here.
const SHORTCUTS: readonly ShortcutDescriptor[] = [
  { id: 'undo', keys: ['Mod+Z'], label: 'Undo', group: 'Edit' },
  {
    id: 'redo',
    keys: ['Mod+Shift+Z', 'Ctrl+Y'],
    appleKeys: ['Mod+Shift+Z'],
    label: 'Redo',
    group: 'Edit',
  },
  { id: 'copy', keys: ['Mod+C'], label: 'Copy', group: 'Edit' },
  { id: 'paste', keys: ['Mod+V'], label: 'Paste', group: 'Edit' },
  { id: 'clear-selection', keys: ['Escape'], label: 'Clear selection', group: 'Edit' },
  {
    id: 'delete-selection',
    keys: ['Delete', 'Backspace'],
    label: 'Delete the selection',
    group: 'Canvas',
  },
  { id: 'move-nodes', keys: ['Arrow keys'], label: 'Move the selected nodes', group: 'Canvas' },
  {
    id: 'select-area',
    keys: ['Shift+Drag'],
    label: 'Select the nodes in an area',
    group: 'Canvas',
  },
  {
    id: 'toggle-selection',
    keys: ['Mod+Click'],
    label: 'Add to or remove from the selection',
    group: 'Canvas',
  },
  ...SHOW_SHORTCUTS_SHORTCUTS,
];

/** The help as the editor wires it: its button, and `?` from anywhere but a text field. */
function ShortcutsHelpPreview({ shortcuts }: { shortcuts: readonly ShortcutDescriptor[] }) {
  const [open, setOpen] = useState(false);
  useShowShortcutsShortcut(() => {
    setOpen(true);
  });
  return <ShortcutsHelp shortcuts={shortcuts} open={open} onOpenChange={setOpen} />;
}

const meta = {
  title: 'features/ShortcutsHelp',
  component: ShortcutsHelpPreview,
  args: { shortcuts: SHORTCUTS },
} satisfies Meta<typeof ShortcutsHelpPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The button opens the help, which lists the shortcuts by group with this platform's keys. */
export const OpenWithButton: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Keyboard shortcuts' }));

    // The dialog is portalled to <body>, outside the story canvas. It has no controls besides
    // Close, so the panel itself takes focus.
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toHaveFocus();
    await expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Edit', 'Canvas', 'Help']);
    // The modifier depends on the platform: Ctrl or ⌘.
    const edit = within(dialog).getByRole('table', { name: 'Edit' });
    await expect(within(edit).getByRole('row', { name: /^Undo (Ctrl|⌘) Z$/ })).toBeVisible();
    const canvasTable = within(dialog).getByRole('table', { name: 'Canvas' });
    await expect(
      within(canvasTable).getByRole('row', { name: 'Delete the selection Delete or Backspace' }),
    ).toBeVisible();
  },
};

/** `?` opens the help; Escape closes it and puts focus on the button. */
export const OpenWithQuestionMark: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.keyboard('?');
    await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: 'Keyboard shortcuts' })).toHaveFocus();
  },
};

/**
 * The open help in the dark theme, so that its accessibility is checked there too. The theme is
 * the toolbar's global, pinned for this story.
 */
export const DarkTheme: Story = {
  globals: { theme: 'dark' },
  // The docs page renders every story at once, under the theme picked in the toolbar.
  tags: ['!autodocs'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Keyboard shortcuts' }));

    await expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  },
};
