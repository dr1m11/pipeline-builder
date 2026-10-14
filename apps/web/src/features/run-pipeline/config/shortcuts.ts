import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

export const RUN_SHORTCUT: ShortcutDescriptor = {
  id: 'run',
  keys: ['Mod+Enter'],
  label: 'Run the pipeline',
  group: 'Run',
};

// ⌘. is the macOS habit for cancelling; Ctrl+. elsewhere.
export const STOP_SHORTCUT: ShortcutDescriptor = {
  id: 'stop',
  keys: ['Mod+.'],
  label: 'Stop the run',
  group: 'Run',
};

/** The run and stop shortcuts, for the keyboard shortcuts help. */
export const RUN_SHORTCUTS: readonly ShortcutDescriptor[] = [RUN_SHORTCUT, STOP_SHORTCUT];
