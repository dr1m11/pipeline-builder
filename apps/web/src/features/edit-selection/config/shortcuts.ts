import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

// Copy, cut and paste are the browser's own shortcuts: the editor takes the clipboard events they
// fire, so these three are listed for the help only.
export const COPY_SHORTCUT: ShortcutDescriptor = {
  id: 'copy',
  keys: ['Mod+C'],
  label: 'Copy',
  group: 'Edit',
};

export const CUT_SHORTCUT: ShortcutDescriptor = {
  id: 'cut',
  keys: ['Mod+X'],
  label: 'Cut',
  group: 'Edit',
};

export const PASTE_SHORTCUT: ShortcutDescriptor = {
  id: 'paste',
  keys: ['Mod+V'],
  label: 'Paste',
  group: 'Edit',
};

export const DUPLICATE_SHORTCUT: ShortcutDescriptor = {
  id: 'duplicate',
  keys: ['Mod+D'],
  label: 'Duplicate',
  group: 'Edit',
};

export const SELECT_ALL_SHORTCUT: ShortcutDescriptor = {
  id: 'select-all',
  keys: ['Mod+A'],
  label: 'Select all',
  group: 'Edit',
};

export const CLEAR_SELECTION_SHORTCUT: ShortcutDescriptor = {
  id: 'clear-selection',
  keys: ['Escape'],
  label: 'Clear selection',
  group: 'Edit',
};

/** The clipboard and selection shortcuts, for the keyboard shortcuts help. */
export const EDIT_SELECTION_SHORTCUTS: readonly ShortcutDescriptor[] = [
  COPY_SHORTCUT,
  CUT_SHORTCUT,
  PASTE_SHORTCUT,
  DUPLICATE_SHORTCUT,
  SELECT_ALL_SHORTCUT,
  CLEAR_SELECTION_SHORTCUT,
];
