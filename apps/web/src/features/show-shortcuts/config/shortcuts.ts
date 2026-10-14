import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

export const SHOW_SHORTCUTS_SHORTCUT: ShortcutDescriptor = {
  id: 'show-shortcuts',
  keys: ['?'],
  label: 'Show keyboard shortcuts',
  group: 'Help',
};

/** The shortcut that opens the keyboard shortcuts help, for the help itself. */
export const SHOW_SHORTCUTS_SHORTCUTS: readonly ShortcutDescriptor[] = [SHOW_SHORTCUTS_SHORTCUT];
