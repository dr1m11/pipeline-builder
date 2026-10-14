import { describe, expect, it } from 'vitest';

import { formatShortcut, matchesShortcut, type ShortcutEvent, shortcutKeys } from './shortcut';

type Modifiers = Partial<Pick<ShortcutEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>>;

/** A key press: `key` is what the layout types, `code` the key's place on a US keyboard. */
function press(key: string, modifiers: Modifiers = {}, code = ''): ShortcutEvent {
  return {
    key,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe('matchesShortcut', () => {
  it('takes Mod for Ctrl outside Apple platforms and for ⌘ on them', () => {
    const ctrlZ = press('z', { ctrlKey: true }, 'KeyZ');
    const metaZ = press('z', { metaKey: true }, 'KeyZ');

    expect(matchesShortcut(ctrlZ, 'Mod+Z', false)).toBe(true);
    expect(matchesShortcut(metaZ, 'Mod+Z', false)).toBe(false);
    expect(matchesShortcut(metaZ, 'Mod+Z', true)).toBe(true);
    expect(matchesShortcut(ctrlZ, 'Mod+Z', true)).toBe(false);
  });

  it('takes Ctrl for the Control key on every platform', () => {
    const ctrlY = press('y', { ctrlKey: true }, 'KeyY');

    expect(matchesShortcut(ctrlY, 'Ctrl+Y', false)).toBe(true);
    expect(matchesShortcut(ctrlY, 'Ctrl+Y', true)).toBe(true);
  });

  it('needs exactly the modifiers of the shortcut', () => {
    const ctrlShiftZ = press('Z', { ctrlKey: true, shiftKey: true }, 'KeyZ');

    expect(matchesShortcut(ctrlShiftZ, 'Mod+Shift+Z', false)).toBe(true);
    expect(matchesShortcut(ctrlShiftZ, 'Mod+Z', false)).toBe(false);
    expect(matchesShortcut(press('z', {}, 'KeyZ'), 'Mod+Z', false)).toBe(false);
    expect(matchesShortcut(press('z', { ctrlKey: true, altKey: true }), 'Mod+Z', false)).toBe(
      false,
    );
  });

  it('finds letters of a non-Latin layout by their place on the keyboard', () => {
    expect(matchesShortcut(press('я', { ctrlKey: true }, 'KeyZ'), 'Mod+Z', false)).toBe(true);
    expect(
      matchesShortcut(press('Я', { metaKey: true, shiftKey: true }, 'KeyZ'), 'Mod+Shift+Z', true),
    ).toBe(true);
    expect(matchesShortcut(press('н', { ctrlKey: true }, 'KeyY'), 'Mod+Z', false)).toBe(false);
  });

  it('follows the letters of a Latin layout wherever they are', () => {
    // On a German keyboard Z is where a US keyboard has Y.
    const germanZ = press('z', { ctrlKey: true }, 'KeyY');

    expect(matchesShortcut(germanZ, 'Mod+Z', false)).toBe(true);
    expect(matchesShortcut(germanZ, 'Ctrl+Y', false)).toBe(false);
  });

  it('ignores Shift for a symbol that may need it to be typed', () => {
    expect(matchesShortcut(press('?', { shiftKey: true }, 'Slash'), '?', false)).toBe(true);
    expect(matchesShortcut(press('?'), '?', false)).toBe(true);
    expect(matchesShortcut(press('?', { ctrlKey: true, shiftKey: true }), '?', false)).toBe(false);
    expect(matchesShortcut(press('/', {}, 'Slash'), '?', false)).toBe(false);
  });

  it('matches named keys', () => {
    expect(matchesShortcut(press('Escape', {}, 'Escape'), 'Escape', false)).toBe(true);
    expect(matchesShortcut(press('Escape', { shiftKey: true }), 'Escape', false)).toBe(false);
  });

  it('rejects an unknown modifier', () => {
    expect(() => matchesShortcut(press('z'), 'Cmd+Z', true)).toThrow(
      'Unknown modifier "Cmd" in "Cmd+Z"',
    );
  });
});

describe('formatShortcut', () => {
  it('shows modifiers as symbols on Apple platforms', () => {
    expect(formatShortcut('Mod+Shift+Z', true)).toEqual(['⌘', '⇧', 'Z']);
    expect(formatShortcut('Ctrl+Alt+Y', true)).toEqual(['⌃', '⌥', 'Y']);
  });

  it('shows modifiers by name elsewhere', () => {
    expect(formatShortcut('Mod+Shift+Z', false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(formatShortcut('Alt+Meta+Y', false)).toEqual(['Alt', 'Meta', 'Y']);
  });

  it('shows keys briefly', () => {
    expect(formatShortcut('?', false)).toEqual(['?']);
    expect(formatShortcut('Escape', false)).toEqual(['Esc']);
    expect(formatShortcut('Shift+ArrowUp', false)).toEqual(['Shift', '↑']);
    expect(formatShortcut('Delete', true)).toEqual(['Delete']);
  });

  it('shows the gestures and key sets of the help as they are written', () => {
    expect(formatShortcut('Mod+Click', true)).toEqual(['⌘', 'Click']);
    expect(formatShortcut('Mod+Click', false)).toEqual(['Ctrl', 'Click']);
    expect(formatShortcut('Shift+Drag', false)).toEqual(['Shift', 'Drag']);
    expect(formatShortcut('Shift+Arrow keys', true)).toEqual(['⇧', 'Arrow keys']);
    expect(formatShortcut('Scroll', false)).toEqual(['Scroll']);
  });
});

describe('shortcutKeys', () => {
  it('uses the Apple shortcuts on Apple platforms when there are any', () => {
    const redo = { keys: ['Mod+Shift+Z', 'Ctrl+Y'], appleKeys: ['Mod+Shift+Z'] };

    expect(shortcutKeys(redo, false)).toEqual(['Mod+Shift+Z', 'Ctrl+Y']);
    expect(shortcutKeys(redo, true)).toEqual(['Mod+Shift+Z']);
    expect(shortcutKeys({ keys: ['Mod+Z'] }, true)).toEqual(['Mod+Z']);
  });
});
