import { useEffect, useEffectEvent } from 'react';

import { isApplePlatform } from './platform';
import { matchesShortcut, type ShortcutDescriptor, shortcutKeys } from './shortcut';

/** A handler for the shortcuts in `keys` (and `appleKeys` on Apple platforms). */
export interface ShortcutBinding extends Pick<ShortcutDescriptor, 'keys' | 'appleKeys'> {
  readonly handler: (event: KeyboardEvent) => void;
  /**
   * Whether the binding takes this key press; when it does not, the key is left to the browser
   * (and to the bindings after it). Always by default.
   */
  readonly when?: (event: KeyboardEvent) => boolean;
}

// Inputs that edit text, and so have the browser's own undo; `HTMLInputElement.type` is 'text' for
// an input without a type. A select, a checkbox or a button edits no text, so shortcuts work there.
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
]);

const EDITABLE = '[contenteditable]:not([contenteditable="false"])';

// A dialog or a menu handles its keys itself. React Flow's `.nokey` is not checked: it only keeps
// the canvas's own keys (Delete, arrows, Enter) off an element, and a focused port or toast should
// still undo with Ctrl+Z.
const OWNS_KEYS = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/**
 * Listens for shortcuts on the whole page while the component is mounted. A pressed shortcut runs
 * the handler of the first binding that has it, and its default action is prevented. Keys pressed
 * where text is edited (a text input, a textarea, an editable element), in a dialog or in a menu
 * are left alone, and so are keys that something else has already handled (`defaultPrevented`).
 * The bindings may change on every render.
 */
export function useShortcuts(bindings: readonly ShortcutBinding[]): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || ownsKeys(event.target)) return;
    const apple = isApplePlatform();
    const binding = bindings.find(
      (candidate) =>
        shortcutKeys(candidate, apple).some((shortcut) =>
          matchesShortcut(event, shortcut, apple),
        ) &&
        (candidate.when?.(event) ?? true),
    );
    if (binding === undefined) return;
    event.preventDefault();
    binding.handler(event);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onKeyDown(event);
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);
}

/**
 * Whether keys pressed on `target` belong to it rather than to the page: it edits text (a text
 * input, a textarea, an editable element), or it is in a dialog or a menu. Clipboard shortcuts
 * pressed there keep the browser's behaviour too.
 */
export function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return editsText(target) || target.closest(OWNS_KEYS) !== null;
}

/** Whether keys pressed in `element` edit text, where the browser's own undo applies. */
function editsText(element: Element): boolean {
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type);
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable) ||
    element.closest(EDITABLE) !== null
  );
}
