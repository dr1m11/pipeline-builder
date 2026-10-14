import { usePipelineStoreApi } from '@/entities/pipeline';
import { useShortcuts } from '@/shared/lib/keyboard';

import { REDO_SHORTCUT, UNDO_SHORTCUT } from '../config/shortcuts';

/**
 * Undoes and redoes changes of the surrounding pipeline from the keyboard: Ctrl/⌘+Z undoes,
 * Ctrl/⌘+Shift+Z and Ctrl+Y redo. Text fields keep their own undo (see `useShortcuts`).
 */
export function useUndoRedoShortcuts(): void {
  const store = usePipelineStoreApi();
  useShortcuts([
    {
      ...UNDO_SHORTCUT,
      handler: () => {
        store.getState().undo();
      },
    },
    {
      ...REDO_SHORTCUT,
      handler: () => {
        store.getState().redo();
      },
    },
  ]);
}
