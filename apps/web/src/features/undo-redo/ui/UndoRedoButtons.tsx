import { Redo2, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { useHistoryLabels, usePipelineStoreApi } from '@/entities/pipeline';
import {
  formatShortcut,
  isApplePlatform,
  type ShortcutDescriptor,
  shortcutKeys,
} from '@/shared/lib/keyboard';
import { IconButton } from '@/shared/ui/icon-button';

import { REDO_SHORTCUT, UNDO_SHORTCUT } from '../config/shortcuts';

/**
 * Undo and Redo buttons for the surrounding pipeline. Each names the change it would make ("Undo
 * Move 3 nodes") and shows its shortcut in the tooltip; it is disabled when there is nothing to do.
 */
export function UndoRedoButtons() {
  const store = usePipelineStoreApi();
  const labels = useHistoryLabels();
  const [apple] = useState(() => isApplePlatform());

  return (
    <>
      <IconButton
        label={labels.undo === null ? 'Undo' : `Undo ${labels.undo}`}
        shortcut={mainShortcut(UNDO_SHORTCUT, apple)}
        disabled={labels.undo === null}
        onClick={() => {
          store.getState().undo();
        }}
      >
        <Undo2 aria-hidden />
      </IconButton>
      <IconButton
        label={labels.redo === null ? 'Redo' : `Redo ${labels.redo}`}
        shortcut={mainShortcut(REDO_SHORTCUT, apple)}
        disabled={labels.redo === null}
        onClick={() => {
          store.getState().redo();
        }}
      >
        <Redo2 aria-hidden />
      </IconButton>
    </>
  );
}

/** The keys of the first shortcut of `shortcut` on this platform, as `Kbd` shows them. */
function mainShortcut(shortcut: ShortcutDescriptor, apple: boolean): readonly string[] {
  const [main] = shortcutKeys(shortcut, apple);
  return main === undefined ? [] : formatShortcut(main, apple);
}
