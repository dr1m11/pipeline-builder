import { useRunStoreApi } from '@/entities/run';
import { useShortcuts } from '@/shared/lib/keyboard';

import { RUN_SHORTCUT, STOP_SHORTCUT } from '../config/shortcuts';
import type { PipelineRunner } from './use-pipeline-runner';

/**
 * Runs and stops the pipeline from the keyboard: Ctrl/⌘+Enter runs it, Ctrl/⌘+. stops the run in
 * progress (and is left to the browser when nothing runs). Like every shortcut of the editor, they
 * are left alone in text fields, dialogs and menus (see `useShortcuts`).
 */
export function useRunShortcuts({ run, stop }: Pick<PipelineRunner, 'run' | 'stop'>): void {
  const runStore = useRunStoreApi();
  useShortcuts([
    {
      ...RUN_SHORTCUT,
      handler: () => {
        run();
      },
    },
    {
      ...STOP_SHORTCUT,
      when: () => runStore.getState().status === 'running',
      handler: () => {
        stop();
      },
    },
  ]);
}
