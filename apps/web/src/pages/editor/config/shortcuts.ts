import { EDIT_SELECTION_SHORTCUTS } from '@/features/edit-selection';
import { RUN_SHORTCUTS } from '@/features/run-pipeline';
import { SHOW_SHORTCUTS_SHORTCUTS } from '@/features/show-shortcuts';
import { UNDO_REDO_SHORTCUTS } from '@/features/undo-redo';
import type { ShortcutDescriptor } from '@/shared/lib/keyboard';
import { CANVAS_SHORTCUTS } from '@/widgets/pipeline-canvas';

/**
 * Every shortcut of the editor, as the keyboard shortcuts help lists them: grouped by their
 * `group` (Edit, Run, Canvas, Help), in this order.
 */
export const EDITOR_SHORTCUTS: readonly ShortcutDescriptor[] = [
  ...UNDO_REDO_SHORTCUTS,
  ...EDIT_SELECTION_SHORTCUTS,
  ...RUN_SHORTCUTS,
  ...CANVAS_SHORTCUTS,
  ...SHOW_SHORTCUTS_SHORTCUTS,
];
