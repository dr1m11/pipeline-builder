import { formatShortcut } from '@/shared/lib/keyboard';

// The editor's undo shortcut (features/undo-redo), which brings the replaced pipeline back as
// long as nothing else has changed since.
const UNDO_SHORTCUT = 'Mod+Z';

/**
 * What a screen reader announces in place of the toast's Undo button, which it may not reach in
 * time: "Press Ctrl+Z to bring back the previous pipeline" ("⌘Z" on Apple platforms, written
 * without a plus as macOS writes shortcuts).
 */
export function undoReplacementAltText(apple: boolean): string {
  const keys = formatShortcut(UNDO_SHORTCUT, apple).join(apple ? '' : '+');
  return `Press ${keys} to bring back the previous pipeline`;
}
