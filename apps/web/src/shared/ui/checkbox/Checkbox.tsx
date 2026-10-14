import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';

export type CheckboxProps = Omit<
  ComponentProps<typeof CheckboxPrimitive.Root>,
  'asChild' | 'children'
>;

/**
 * A checkbox: a button with the `checkbox` role, toggled by a click or Space (Enter does not toggle
 * it, as in the WAI-ARIA pattern). `checked` may also be `'indeterminate'`, shown as a dash.
 *
 * It has no text of its own: name it with a `<label htmlFor>` pointing at its `id`, which also
 * toggles it when clicked, or with `aria-label`. The box is 16px; an invisible margin around it
 * makes the hit area 24px.
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-fg-muted bg-surface text-accent-fg transition-colors after:absolute after:-inset-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center">
        <Check
          aria-hidden
          strokeWidth={3}
          className="hidden size-3 group-data-[state=checked]:block"
        />
        <Minus
          aria-hidden
          strokeWidth={3}
          className="hidden size-3 group-data-[state=indeterminate]:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
