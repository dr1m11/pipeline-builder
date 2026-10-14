import { Keyboard } from 'lucide-react';
import { Fragment, useId, useRef, useState } from 'react';

import {
  formatShortcut,
  isApplePlatform,
  type ShortcutDescriptor,
  shortcutKeys,
} from '@/shared/lib/keyboard';
import { Dialog, DialogContent, DialogTrigger } from '@/shared/ui/dialog';
import { IconButton } from '@/shared/ui/icon-button';
import { Kbd } from '@/shared/ui/kbd';

import { SHOW_SHORTCUTS_SHORTCUT } from '../config/shortcuts';
import { groupShortcuts, type ShortcutGroup } from '../lib/group-shortcuts';

export interface ShortcutsHelpProps {
  /** The shortcuts to list, under the heading of their `group`, in the order groups first appear. */
  shortcuts: readonly ShortcutDescriptor[];
  /** Whether the help is open. The page also opens it on `?` (`useShowShortcutsShortcut`). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A button that opens the keyboard shortcuts help: a dialog that lists `shortcuts` by group, with
 * the keys of this platform (⌘ on Apple platforms, Ctrl elsewhere). While the dialog is open, the
 * keys pressed are its own: they neither run the editor's shortcuts nor reach the canvas behind.
 *
 * Closed, the help returns focus to where it came from: to the button when the button opened it,
 * and to the element that had focus when `?` opened it (a node on the canvas, say), as long as that
 * element is still on the page.
 */
export function ShortcutsHelp({ shortcuts, open, onOpenChange }: ShortcutsHelpProps) {
  const [apple] = useState(() => isApplePlatform());
  const openedByButtonRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        asChild
        onClick={() => {
          openedByButtonRef.current = true;
        }}
      >
        <IconButton
          label="Keyboard shortcuts"
          shortcut={mainShortcut(SHOW_SHORTCUTS_SHORTCUT, apple)}
        >
          <Keyboard aria-hidden />
        </IconButton>
      </DialogTrigger>
      <DialogContent
        title="Keyboard shortcuts"
        description="Text fields keep their own shortcuts while you type in them."
        className="max-w-3xl"
        // Runs before focus moves into the dialog, so the focused element is the one left behind.
        onOpenAutoFocus={() => {
          const focused = document.activeElement;
          returnFocusRef.current =
            !openedByButtonRef.current &&
            focused instanceof HTMLElement &&
            focused !== document.body
              ? focused
              : null;
          openedByButtonRef.current = false;
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          returnFocusRef.current = null;
          // With nothing to return to, Radix focuses the button.
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
      >
        {/* Columns rather than a grid: a short group follows the one above it without a gap. */}
        <div className="columns-2 gap-8">
          {groupShortcuts(shortcuts).map((group) => (
            <ShortcutTable key={group.name} group={group} apple={apple} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A group of shortcuts as a table named by its heading: what each does, and its keys. */
function ShortcutTable({ group, apple }: { group: ShortcutGroup; apple: boolean }) {
  const headingId = useId();
  return (
    <div className="mb-5 flex break-inside-avoid flex-col gap-1.5 last:mb-0">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {group.name}
      </h3>
      <table aria-labelledby={headingId} className="w-full text-sm">
        <tbody>
          {group.shortcuts.map((shortcut) => (
            <tr key={shortcut.id} className="border-t border-border first:border-t-0">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                {shortcut.label}
              </th>
              <td className="py-1.5 text-right whitespace-nowrap">
                <ShortcutKeys shortcut={shortcut} apple={apple} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Each shortcut of `shortcut` on this platform as `Kbd` keys, the shortcuts joined by "or". */
function ShortcutKeys({ shortcut, apple }: { shortcut: ShortcutDescriptor; apple: boolean }) {
  // The spaces only separate the words of the row's accessible text: flex layout drops them.
  return (
    <span className="inline-flex items-center gap-1.5">
      {shortcutKeys(shortcut, apple).map((combination, index) => (
        <Fragment key={combination}>
          {index > 0 && (
            <>
              {' '}
              <span className="text-xs text-fg-muted">or</span>{' '}
            </>
          )}
          <span className="inline-flex gap-0.5">
            {formatShortcut(combination, apple).map((key, keyIndex) => (
              <Fragment key={key}>
                {keyIndex > 0 && ' '}
                <Kbd>{key}</Kbd>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** The keys of the first shortcut of `shortcut` on this platform, as `Kbd` shows them. */
function mainShortcut(shortcut: ShortcutDescriptor, apple: boolean): readonly string[] {
  const [main] = shortcutKeys(shortcut, apple);
  return main === undefined ? [] : formatShortcut(main, apple);
}
