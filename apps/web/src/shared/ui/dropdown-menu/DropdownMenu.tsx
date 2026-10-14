import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { type ComponentProps, type ReactNode, useId } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * A menu of actions opened from a button. Arrow keys move between items, Enter or Space runs one,
 * typing jumps to an item by its first letters, Escape closes and returns focus to the trigger.
 *
 * Not modal by default. A modal Radix menu hides the rest of the page with `aria-hidden`, including
 * its own focusable trigger, which axe reports (aria-hidden-focus); a menu button does not need
 * that. Tab is still kept inside the open menu, and a click or focus outside closes it.
 */
export function DropdownMenu({
  modal = false,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={modal} {...props} />;
}

/** Opens the menu (also with Enter, Space or ArrowDown). Use `asChild` with a kit `Button`. */
export function DropdownMenuTrigger(props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

/**
 * The menu panel, portalled next to its trigger. It has the `nokey` class, so Delete or Backspace
 * pressed in the menu never reaches React Flow's key handler and deletes the canvas selection.
 */
export function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'nokey z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-md border border-border bg-surface p-1 text-fg shadow-elevated motion-safe:animate-pop-in',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends Omit<
  ComponentProps<typeof DropdownMenuPrimitive.Item>,
  'asChild'
> {
  /** Decorative leading icon, e.g. `<FilePlus />`; hidden from assistive technology. */
  icon?: ReactNode;
  /** Right-aligned secondary text, e.g. a shortcut. It describes the item, not names it. */
  hint?: ReactNode;
}

/** A menu action. `onSelect` runs it; the menu then closes unless the handler prevents default. */
export function DropdownMenuItem({
  icon,
  hint,
  className,
  children,
  ...props
}: DropdownMenuItemProps) {
  const hintId = useId();
  return (
    <DropdownMenuPrimitive.Item
      aria-describedby={hint === undefined ? undefined : hintId}
      className={cn(
        'flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-surface-muted',
        className,
      )}
      {...props}
    >
      {icon !== undefined && (
        <span aria-hidden className="flex shrink-0 text-fg-muted [&_svg]:size-4">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {/* Hidden from the item's name, which is computed from its text; read as its description. */}
      {hint !== undefined && (
        <span id={hintId} aria-hidden className="ml-auto shrink-0 pl-4 text-xs text-fg-muted">
          {hint}
        </span>
      )}
    </DropdownMenuPrimitive.Item>
  );
}

/** A thin rule between groups of items. */
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

/** A non-interactive heading for a group of items. */
export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 text-xs font-medium text-fg-muted', className)}
      {...props}
    />
  );
}
