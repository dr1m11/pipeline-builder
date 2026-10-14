import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

export const UNDO_SHORTCUT: ShortcutDescriptor = {
  id: 'undo',
  keys: ['Mod+Z'],
  label: 'Undo',
  group: 'Edit',
};

// Ctrl+Y is the Windows and Linux habit; on a Mac only ⌘⇧Z redoes.
export const REDO_SHORTCUT: ShortcutDescriptor = {
  id: 'redo',
  keys: ['Mod+Shift+Z', 'Ctrl+Y'],
  appleKeys: ['Mod+Shift+Z'],
  label: 'Redo',
  group: 'Edit',
};

/** The undo and redo shortcuts, for the keyboard shortcuts help. */
export const UNDO_REDO_SHORTCUTS: readonly ShortcutDescriptor[] = [UNDO_SHORTCUT, REDO_SHORTCUT];
