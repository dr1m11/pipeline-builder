import { useEffect, useEffectEvent } from 'react';

import { isApplePlatform } from './platform';
import { matchesShortcut, type ShortcutDescriptor, shortcutKeys } from './shortcut';

/** A handler for the shortcuts in `keys` (and `appleKeys` on Apple platforms). */
export interface ShortcutBinding extends Pick<ShortcutDescriptor, 'keys' | 'appleKeys'> {
  readonly handler: (event: KeyboardEvent) => void;
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

// A dialog or a menu handles its keys itself. `.nokey` is how React Flow marks elements that keep
// their keys too.
const OWNS_KEYS = '.nokey, [role="dialog"], [role="alertdialog"], [role="menu"]';

/**
 * Listens for shortcuts on the whole page while the component is mounted. A pressed shortcut runs
 * the handler of the first binding that has it, and its default action is prevented. Keys pressed
 * where text is edited (a text input, a textarea, an editable element), in a dialog, a menu or a
 * `.nokey` element are left alone, and so are keys that something else has already handled
 * (`defaultPrevented`). The bindings may change on every render.
 */
export function useShortcuts(bindings: readonly ShortcutBinding[]): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || ownsKeys(event.target)) return;
    const apple = isApplePlatform();
    const binding = bindings.find((candidate) =>
      shortcutKeys(candidate, apple).some((shortcut) => matchesShortcut(event, shortcut, apple)),
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

function ownsKeys(target: EventTarget | null): boolean {
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
