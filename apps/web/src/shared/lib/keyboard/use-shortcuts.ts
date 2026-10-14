import { useEffect, useEffectEvent } from 'react';

import { isApplePlatform } from './platform';
import { matchesShortcut, type ShortcutDescriptor, shortcutKeys } from './shortcut';

/** A handler for the shortcuts in `keys` (and `appleKeys` on Apple platforms). */
export interface ShortcutBinding extends Pick<ShortcutDescriptor, 'keys' | 'appleKeys'> {
  readonly handler: (event: KeyboardEvent) => void;
}

// Keys pressed here belong to the element: a text field keeps its own undo, and a dialog or a menu
// handles its keys itself. `.nokey` is how React Flow marks elements that keep their keys too.
const OWNS_KEYS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .nokey, [role="dialog"], [role="alertdialog"], [role="menu"]';

/**
 * Listens for shortcuts on the whole page while the component is mounted. A pressed shortcut runs
 * the handler of the first binding that has it, and its default action is prevented. Keys pressed
 * in a text field, a dialog, a menu or a `.nokey` element are left alone, and so are keys that
 * something else has already handled (`defaultPrevented`). The bindings may change on every render.
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
  return (
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest(OWNS_KEYS) !== null
  );
}
