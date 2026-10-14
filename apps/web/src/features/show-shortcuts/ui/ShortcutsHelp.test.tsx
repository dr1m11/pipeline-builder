import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ShortcutDescriptor } from '@/shared/lib/keyboard';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { SHOW_SHORTCUTS_SHORTCUTS } from '../config/shortcuts';
import { useShowShortcutsShortcut } from '../model/use-show-shortcuts-shortcut';
import { ShortcutsHelp } from './ShortcutsHelp';

const SHORTCUTS: readonly ShortcutDescriptor[] = [
  { id: 'undo', keys: ['Mod+Z'], label: 'Undo', group: 'Edit' },
  {
    id: 'redo',
    keys: ['Mod+Shift+Z', 'Ctrl+Y'],
    appleKeys: ['Mod+Shift+Z'],
    label: 'Redo',
    group: 'Edit',
  },
  { id: 'delete', keys: ['Delete', 'Backspace'], label: 'Delete the selection', group: 'Canvas' },
  { id: 'toggle', keys: ['Mod+Click'], label: 'Add to the selection', group: 'Canvas' },
  { id: 'clear', keys: ['Escape'], label: 'Clear selection', group: 'Edit' },
  ...SHOW_SHORTCUTS_SHORTCUTS,
];

/**
 * The help as the editor wires it: the button, and `?` from anywhere but a text field. A text field
 * and, while `withNode`, another control stand for the rest of the page.
 */
function Help({ withNode }: { withNode: boolean }) {
  const [open, setOpen] = useState(false);
  useShowShortcutsShortcut(() => {
    setOpen(true);
  });
  return (
    <TooltipProvider delayDuration={0}>
      <input aria-label="Name" />
      {withNode && <button type="button">Node</button>}
      <ShortcutsHelp shortcuts={SHORTCUTS} open={open} onOpenChange={setOpen} />
    </TooltipProvider>
  );
}

function renderHelp() {
  const { rerender } = render(<Help withNode />);
  const removeNode = () => {
    rerender(<Help withNode={false} />);
  };
  return { removeNode, user: userEvent.setup() };
}

const trigger = () => screen.getByRole('button', { name: 'Keyboard shortcuts' });
const node = () => screen.getByRole('button', { name: 'Node' });

describe('ShortcutsHelp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens from its button and lists the shortcuts by group', async () => {
    const { user } = renderHelp();

    await user.click(trigger());

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveAccessibleDescription(
      'Text fields keep their own shortcuts while you type in them.',
    );
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Edit', 'Canvas', 'Help']);
    const edit = screen.getByRole('table', { name: 'Edit' });
    expect(within(edit).getByRole('row', { name: 'Undo Ctrl Z' })).toBeInTheDocument();
    expect(
      within(edit).getByRole('row', { name: 'Redo Ctrl Shift Z or Ctrl Y' }),
    ).toBeInTheDocument();
    expect(within(edit).getByRole('row', { name: 'Clear selection Esc' })).toBeInTheDocument();
    const canvas = screen.getByRole('table', { name: 'Canvas' });
    expect(
      within(canvas).getByRole('row', { name: 'Delete the selection Delete or Backspace' }),
    ).toBeInTheDocument();
    expect(
      within(canvas).getByRole('row', { name: 'Add to the selection Ctrl Click' }),
    ).toBeInTheDocument();
    const help = screen.getByRole('table', { name: 'Help' });
    expect(
      within(help).getByRole('row', { name: 'Show keyboard shortcuts ?' }),
    ).toBeInTheDocument();
  });

  it('shows each key as a keyboard key', async () => {
    const { user } = renderHelp();

    await user.click(trigger());

    const redo = screen.getByRole('row', { name: 'Redo Ctrl Shift Z or Ctrl Y' });
    const keys = within(redo)
      .getAllByText(/^(Ctrl|Shift|Z|Y)$/)
      .map((key) => [key.tagName, key.textContent]);
    expect(keys).toEqual([
      ['KBD', 'Ctrl'],
      ['KBD', 'Shift'],
      ['KBD', 'Z'],
      ['KBD', 'Ctrl'],
      ['KBD', 'Y'],
    ]);
  });

  it('shows the keys of Apple platforms there, without the shortcuts they lack', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { user } = renderHelp();

    await user.click(trigger());

    const edit = screen.getByRole('table', { name: 'Edit' });
    expect(within(edit).getByRole('row', { name: 'Undo ⌘ Z' })).toBeInTheDocument();
    // Ctrl+Y redoes on Windows and Linux only.
    expect(within(edit).getByRole('row', { name: 'Redo ⌘ ⇧ Z' })).toBeInTheDocument();
    const canvas = screen.getByRole('table', { name: 'Canvas' });
    expect(
      within(canvas).getByRole('row', { name: 'Add to the selection ⌘ Click' }),
    ).toBeInTheDocument();
  });

  it('opens with ? and, closed with Escape, gives focus back to where it was', async () => {
    const { user } = renderHelp();
    await user.click(node());

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(node()).toHaveFocus();
  });

  it('gives focus to its button when the button opened it', async () => {
    const { user } = renderHelp();
    // Opened with ? first, so what it remembered then is forgotten.
    await user.click(node());
    await user.keyboard('?{Escape}');

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('gives focus to its button when ? opened it with nothing, or something now gone, in focus', async () => {
    const { removeNode, user } = renderHelp();

    await user.keyboard('?{Escape}');
    expect(trigger()).toHaveFocus();

    await user.click(node());
    await user.keyboard('?');
    removeNode();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('leaves ? typed in a text field to the field', async () => {
    const { user } = renderHelp();
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.type(name, 'Why?');

    expect(name).toHaveValue('Why?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names its shortcut in the tooltip of its button', async () => {
    const { user } = renderHelp();

    await user.hover(trigger());

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Keyboard shortcuts ?');
  });
});
