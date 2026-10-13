import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ComponentProps, type ReactNode, useRef } from 'react';

import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/icon-button';

/** What Radix may focus when a dialog opens: tabbable elements except links, which it skips. */
const FOCUSABLE = [
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface DialogProps {
  /** Controlled open state; pair it with `onOpenChange`. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A `DialogTrigger` (optional when `open` is controlled) and a `DialogContent`. */
  children: ReactNode;
}

/** A modal dialog: traps focus, closes on Escape or a click outside, returns focus to the trigger. */
export function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />;
}

/** Opens the dialog. Use `asChild` to render a kit `Button` instead of a bare `<button>`. */
export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export interface DialogContentProps extends Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  'title' | 'asChild'
> {
  /** Heading of the dialog and its accessible name. Required: a dialog must be named. */
  title: string;
  /** Text under the title; it becomes the dialog's accessible description. */
  description?: ReactNode;
}

/**
 * The dialog panel, portalled over a scrim, with a title, an optional description and a Close
 * button. Focus moves to the first focusable child. A dialog with no controls besides Close (help
 * text, a list of shortcuts) focuses the panel itself instead: the dialog is read from its title,
 * and the Close button's tooltip does not pop up over the content.
 *
 * The panel has the `nokey` class: React Flow ignores keys whose target is inside a `.nokey`
 * element, so Delete or Backspace pressed in the dialog never deletes the canvas selection behind it.
 */
export function DialogContent({
  title,
  description,
  className,
  children,
  onOpenAutoFocus,
  ...props
}: DialogContentProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay motion-safe:animate-overlay-in" />
      <DialogPrimitive.Content
        className={cn(
          'nokey fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-4rem)] w-[calc(100vw-2rem)] max-w-md -translate-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 text-fg shadow-elevated outline-none motion-safe:animate-pop-in',
          className,
        )}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          const panel = event.currentTarget;
          if (event.defaultPrevented || !(panel instanceof HTMLElement)) return;
          // Close is last in the DOM, so it is first only when nothing else can take focus.
          if (panel.querySelector(FOCUSABLE) === closeRef.current) {
            event.preventDefault();
            panel.focus();
          }
        }}
        {...props}
      >
        {/* Room on the right for the Close button. */}
        <div className="flex flex-col gap-1 pr-8">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          {description !== undefined && (
            <DialogPrimitive.Description className="text-sm text-fg-muted">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        {children}
        {/* Last in the DOM, so focus lands on the dialog's own controls first. */}
        <DialogPrimitive.Close asChild>
          <IconButton ref={closeRef} label="Close" className="absolute top-3 right-3">
            <X aria-hidden />
          </IconButton>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
