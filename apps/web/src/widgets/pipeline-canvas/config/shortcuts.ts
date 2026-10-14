import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

/** The keys that delete the selected nodes and edges: React Flow's `deleteKeyCode`. */
export const DELETE_KEYS = ['Delete', 'Backspace'];

/**
 * The canvas's own keys and gestures, for the keyboard shortcuts help. React Flow handles them
 * itself, with its defaults except for the delete keys, so they are listed for the help only.
 */
export const CANVAS_SHORTCUTS: readonly ShortcutDescriptor[] = [
  {
    id: 'delete-selection',
    keys: DELETE_KEYS,
    label: 'Delete the selection',
    group: 'Canvas',
  },
  // A selected node with focus moves 5px per key press, and 20px with Shift.
  {
    id: 'move-nodes',
    keys: ['Arrow keys'],
    label: 'Move the selected nodes',
    group: 'Canvas',
  },
  {
    id: 'move-nodes-further',
    keys: ['Shift+Arrow keys'],
    label: 'Move the selected nodes further',
    group: 'Canvas',
  },
  {
    id: 'select-area',
    keys: ['Shift+Drag'],
    label: 'Select the nodes in an area',
    group: 'Canvas',
  },
  // React Flow's multi-selection key is ⌘ on macOS and Ctrl elsewhere, as `Mod` is.
  {
    id: 'toggle-selection',
    keys: ['Mod+Click'],
    label: 'Add to or remove from the selection',
    group: 'Canvas',
  },
  // Dragging the background, not a node.
  {
    id: 'pan',
    keys: ['Drag'],
    label: 'Pan the canvas',
    group: 'Canvas',
  },
  {
    id: 'zoom',
    keys: ['Scroll', 'Pinch'],
    label: 'Zoom in and out',
    group: 'Canvas',
  },
];
