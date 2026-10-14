import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShortcuts } from './use-shortcuts';

const undo = vi.fn();
const redo = vi.fn();

function Editor() {
  useShortcuts([
    { keys: ['Mod+Z'], handler: undo },
    { keys: ['Mod+Shift+Z', 'Ctrl+Y'], appleKeys: ['Mod+Shift+Z'], handler: redo },
  ]);
  return (
    <>
      <button type="button">Run</button>
      <input aria-label="Name" />
      <div role="textbox" aria-label="Notes" tabIndex={0} contentEditable />
      <div role="dialog" aria-label="Settings">
        <button type="button">Close</button>
      </div>
      <div className="nokey">
        <button type="button">Zoom</button>
      </div>
      <button
        type="button"
        onKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        Handled
      </button>
    </>
  );
}

/** Whether the last key press reached the window with its default action prevented. */
function trackDefaultPrevented() {
  const prevented: boolean[] = [];
  const listener = (event: KeyboardEvent) => prevented.push(event.defaultPrevented);
  window.addEventListener('keydown', listener);
  return {
    last: () => prevented.at(-1),
    stop: () => {
      window.removeEventListener('keydown', listener);
    },
  };
}

describe('useShortcuts', () => {
  beforeEach(() => {
    undo.mockClear();
    redo.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the handler of a pressed shortcut and prevents its default action', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const tracker = trackDefaultPrevented();

    await user.keyboard('{Control>}z{/Control}');
    expect(undo).toHaveBeenCalledOnce();
    expect(tracker.last()).toBe(true);

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await user.keyboard('{Control>}y{/Control}');
    expect(redo).toHaveBeenCalledTimes(2);
    expect(undo).toHaveBeenCalledOnce();

    await user.keyboard('{Control>}x{/Control}');
    expect(tracker.last()).toBe(false);
    tracker.stop();
  });

  it('takes ⌘ for Mod on Apple platforms, where Ctrl+Y is not bound', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const user = userEvent.setup();
    render(<Editor />);

    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}y{/Control}');
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();

    await user.keyboard('{Meta>}z{/Meta}');
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
  });

  it('works while a button has focus', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.keyboard('{Control>}z{/Control}');

    expect(undo).toHaveBeenCalledOnce();
  });

  it.each([
    ['a text field', () => screen.getByRole('textbox', { name: 'Name' })],
    ['an editable element', () => screen.getByRole('textbox', { name: 'Notes' })],
    ['a dialog', () => screen.getByRole('button', { name: 'Close' })],
    ['a .nokey element', () => screen.getByRole('button', { name: 'Zoom' })],
    [
      'an element that handles the keys itself',
      () => screen.getByRole('button', { name: 'Handled' }),
    ],
  ])('leaves keys pressed in %s alone', async (_place, element) => {
    const user = userEvent.setup();
    render(<Editor />);

    element().focus();
    await user.keyboard('{Control>}z{/Control}');

    expect(undo).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Editor />);

    unmount();
    await user.keyboard('{Control>}z{/Control}');

    expect(undo).not.toHaveBeenCalled();
  });
});
