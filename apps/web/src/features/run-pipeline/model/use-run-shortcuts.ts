import { useRunStoreApi } from '@/entities/run';
import { useShortcuts } from '@/shared/lib/keyboard';

import { NEXT_STEP_SHORTCUT, RUN_SHORTCUT, STOP_SHORTCUT } from '../config/shortcuts';
import type { PipelineRunner } from './use-pipeline-runner';

/**
 * Runs and stops the pipeline from the keyboard: Ctrl/⌘+Enter runs it, Ctrl/⌘+. stops the run in
 * progress, and F10 lets the node a step-by-step run is paused before run. The last two are left to
 * the browser when there is nothing to stop or no pause. Like every shortcut of the editor, they
 * are left alone in text fields, dialogs and menus (see `useShortcuts`).
 *
 * They are taken in the capture phase and go no further: on a focused node, React Flow would take
 * Ctrl/⌘+Enter as Enter with its multi-selection key, and deselect the node.
 */
export function useRunShortcuts({
  run,
  stop,
  nextStep,
}: Pick<PipelineRunner, 'run' | 'stop' | 'nextStep'>): void {
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
      {
        ...NEXT_STEP_SHORTCUT,
        when: () => runStore.getState().pausedNodeId !== null,
        handler: (event) => {
          event.stopPropagation();
          nextStep();
        },
      },
    ],
    { capture: true },
  );
}
