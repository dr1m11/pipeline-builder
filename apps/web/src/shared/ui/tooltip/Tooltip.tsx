import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

/** Shares open/close delays between tooltips; mount once near the app root. */
export function TooltipProvider({
  delayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export interface TooltipProps {
  /** Tooltip text. Describes the trigger; it does not replace the trigger's accessible name. */
  content: ReactNode;
  /** A single focusable element (button, link). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md bg-fg px-2 py-1 text-xs text-canvas shadow-elevated"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
