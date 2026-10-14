import { useShortcuts } from '@/shared/lib/keyboard';

import { SHOW_SHORTCUTS_SHORTCUT } from '../config/shortcuts';

/**
 * Calls `show` when `?` is pressed, to open the keyboard shortcuts help. A `?` typed in a text
 * field stays in the field (see `useShortcuts`).
 */
export function useShowShortcutsShortcut(show: () => void): void {
  useShortcuts([
    {
      ...SHOW_SHORTCUTS_SHORTCUT,
      handler: () => {
        show();
      },
    },
  ]);
}
