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

// F10 steps over in debuggers (browser dev tools, VS Code). It is taken only while a run is paused;
// otherwise it is left to the browser, which on Windows and Linux focuses its menu with it. Mac
// keyboards send it with Fn, or as a media key without.
export const NEXT_STEP_SHORTCUT: ShortcutDescriptor = {
  id: 'next-step',
  keys: ['F10'],
  label: 'Run the next node in step mode',
  group: 'Run',
};

/** The run, stop and next step shortcuts, for the keyboard shortcuts help. */
export const RUN_SHORTCUTS: readonly ShortcutDescriptor[] = [
  RUN_SHORTCUT,
  STOP_SHORTCUT,
  NEXT_STEP_SHORTCUT,
];
