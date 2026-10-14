import { describe, expect, it } from 'vitest';

import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

import { groupShortcuts } from './group-shortcuts';

function shortcut(id: string, group: string): ShortcutDescriptor {
  return { id, keys: ['?'], label: id, group };
}

describe('groupShortcuts', () => {
  it('lists the groups in the order they first appear, each with its shortcuts in order', () => {
    const undo = shortcut('undo', 'Edit');
    const deleteSelection = shortcut('delete', 'Canvas');
    const copy = shortcut('copy', 'Edit');
    const help = shortcut('help', 'Help');

    expect(groupShortcuts([undo, deleteSelection, copy, help])).toEqual([
      { name: 'Edit', shortcuts: [undo, copy] },
      { name: 'Canvas', shortcuts: [deleteSelection] },
      { name: 'Help', shortcuts: [help] },
    ]);
  });

  it('has no groups without shortcuts', () => {
    expect(groupShortcuts([])).toEqual([]);
  });
});
