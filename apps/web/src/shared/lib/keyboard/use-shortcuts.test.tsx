import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ownsKeys, useShortcuts } from './use-shortcuts';

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
      <input type="search" aria-label="Search" />
      <input type="number" aria-label="Count" />
      <textarea aria-label="Description" />
      <select aria-label="Operation">
        <option>Trim</option>
        <option>Parse JSON</option>
      </select>
      <input type="checkbox" aria-label="Enabled" />
      <div role="textbox" aria-label="Notes" tabIndex={0} contentEditable />
      <div role="dialog" aria-label="Settings">
        <button type="button">Close</button>
      </div>
      <div role="menu" aria-label="File">
        <div role="menuitem" tabIndex={-1}>
          Export
        </div>
      </div>
      {/* React Flow's mark for elements its own keys skip, such as a port. */}
      <div className="nokey">
        <button type="button">Port</button>
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

  // Controls that edit no text have no undo of their own: a changed choice can be undone at once.
  it.each([
    ['a button', () => screen.getByRole('button', { name: 'Run' })],
    ['a select', () => screen.getByRole('combobox', { name: 'Operation' })],
    ['a checkbox', () => screen.getByRole('checkbox', { name: 'Enabled' })],
    ['a .nokey element', () => screen.getByRole('button', { name: 'Port' })],
  ])('works while %s has focus', async (_control, element) => {
    const user = userEvent.setup();
    render(<Editor />);

    element().focus();
    await user.keyboard('{Control>}z{/Control}');

    expect(undo).toHaveBeenCalledOnce();
  });

  it.each([
    ['a text field', () => screen.getByRole('textbox', { name: 'Name' })],
    ['a search field', () => screen.getByRole('searchbox', { name: 'Search' })],
    ['a number field', () => screen.getByRole('spinbutton', { name: 'Count' })],
    ['a textarea', () => screen.getByRole('textbox', { name: 'Description' })],
    ['an editable element', () => screen.getByRole('textbox', { name: 'Notes' })],
    ['a dialog', () => screen.getByRole('button', { name: 'Close' })],
    ['a menu', () => screen.getByRole('menuitem', { name: 'Export' })],
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

  it('leaves a key to the browser and the next binding when a binding does not take it', async () => {
    const user = userEvent.setup();
    const skipped = vi.fn();
    const taken = vi.fn();
    function Bindings() {
      useShortcuts([
        { keys: ['Escape'], when: (event) => event.target === document.body, handler: skipped },
        { keys: ['Mod+D'], when: () => false, handler: skipped },
        { keys: ['Mod+D'], handler: taken },
      ]);
      return <button type="button">Run</button>;
    }
    render(<Bindings />);
    const tracker = trackDefaultPrevented();

    screen.getByRole('button', { name: 'Run' }).focus();
    await user.keyboard('{Escape}');
    expect(tracker.last()).toBe(false);
    await user.keyboard('{Control>}d{/Control}');

    expect(skipped).not.toHaveBeenCalled();
    expect(taken).toHaveBeenCalledOnce();
    expect(tracker.last()).toBe(true);
    tracker.stop();
  });

  it('stops listening once unmounted', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Editor />);

    unmount();
    await user.keyboard('{Control>}z{/Control}');

    expect(undo).not.toHaveBeenCalled();
  });
});

describe('ownsKeys', () => {
  it('tells elements that keep their keys from the rest of the page', () => {
    render(<Editor />);

    expect(ownsKeys(screen.getByRole('textbox', { name: 'Name' }))).toBe(true);
    expect(ownsKeys(screen.getByRole('textbox', { name: 'Notes' }))).toBe(true);
    expect(ownsKeys(screen.getByRole('button', { name: 'Close' }))).toBe(true);
    expect(ownsKeys(screen.getByRole('menuitem', { name: 'Export' }))).toBe(true);
    expect(ownsKeys(screen.getByRole('button', { name: 'Port' }))).toBe(false);
    expect(ownsKeys(screen.getByRole('button', { name: 'Run' }))).toBe(false);
    expect(ownsKeys(screen.getByRole('combobox', { name: 'Operation' }))).toBe(false);
    expect(ownsKeys(document)).toBe(false);
    expect(ownsKeys(null)).toBe(false);
  });
});
