import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useShowShortcutsShortcut } from './use-show-shortcuts-shortcut';

function Shortcut({ show }: { show: () => void }) {
  useShowShortcutsShortcut(show);
  return <input aria-label="Name" />;
}

function renderShortcut() {
  const show = vi.fn<() => void>();
  render(<Shortcut show={show} />);
  return { show, user: userEvent.setup() };
}

describe('useShowShortcutsShortcut', () => {
  it('shows the help when ? is pressed', async () => {
    const { show, user } = renderShortcut();

    await user.keyboard('?');

    expect(show).toHaveBeenCalledOnce();
  });

  it('leaves ? typed in a text field to the field', async () => {
    const { show, user } = renderShortcut();
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.type(name, 'Why?');

    expect(name).toHaveValue('Why?');
    expect(show).not.toHaveBeenCalled();
  });
});
