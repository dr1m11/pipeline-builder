import { useRunStoreApi } from '@/entities/run';
import { useShortcuts } from '@/shared/lib/keyboard';

import { RUN_SHORTCUT, STOP_SHORTCUT } from '../config/shortcuts';
import type { PipelineRunner } from './use-pipeline-runner';

/**
 * Runs and stops the pipeline from the keyboard: Ctrl/⌘+Enter runs it, Ctrl/⌘+. stops the run in
 * progress (and is left to the browser when nothing runs). Like every shortcut of the editor, they
 * are left alone in text fields, dialogs and menus (see `useShortcuts`).
 *
 * They are taken in the capture phase and go no further: on a focused node, React Flow would take
 * Ctrl/⌘+Enter as Enter with its multi-selection key, and deselect the node.
 */
export function useRunShortcuts({ run, stop }: Pick<PipelineRunner, 'run' | 'stop'>): void {
  const runStore = useRunStoreApi();
  useShortcuts(
    [
      {
        ...RUN_SHORTCUT,
        handler: (event) => {
          event.stopPropagation();
          run();
        },
      },
      {
        ...STOP_SHORTCUT,
        when: () => runStore.getState().status === 'running',
        handler: (event) => {
          event.stopPropagation();
          stop();
        },
      },
    ],
    { capture: true },
  );
}
