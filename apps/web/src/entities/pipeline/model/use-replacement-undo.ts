import type { Pipeline } from '@pipeline-builder/core';
import { useCallback, useState } from 'react';

import { formatShortcut, isApplePlatform } from '@/shared/lib/keyboard';
import type { ToastOptions } from '@/shared/ui/toast';

import { usePipelineStoreApi } from './store-context';

// The editor's undo shortcut (features/undo-redo), which undoes the replacement too as long as
// nothing else has changed since.
const UNDO_SHORTCUT = 'Mod+Z';

/** The Undo button of a toast about a replaced document. */
export type ReplacementUndoAction = NonNullable<ToastOptions['action']>;

/**
 * Returns a function that makes the Undo button for a toast about a document that replaced the
 * whole pipeline (an import, a template, a new pipeline). The history lives in memory only and
 * autosave overwrites the replaced draft, so the toast is where the user finds out how to get it
 * back (see docs/adr/0009). The button undoes only that replacement: once the pipeline has changed
 * again, or the replacement was undone already, it does nothing. Screen readers, which may not
 * reach the button in time, hear "Press Ctrl+Z to …" instead ("⌘Z" on Apple platforms, written
 * without a plus as macOS writes shortcuts), ending with `undoes` ("undo the import").
 */
export function useReplacementUndo(): (
  replacement: Pipeline,
  undoes: string,
) => ReplacementUndoAction {
  const store = usePipelineStoreApi();
  const [apple] = useState(() => isApplePlatform());

  return useCallback(
    (replacement, undoes) => ({
      label: 'Undo',
      altText: `Press ${formatShortcut(UNDO_SHORTCUT, apple).join(apple ? '' : '+')} to ${undoes}`,
      onClick: () => {
        if (store.getState().pipeline === replacement) store.getState().undo();
      },
    }),
    [store, apple],
  );
}
