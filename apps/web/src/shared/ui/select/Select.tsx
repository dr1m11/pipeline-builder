import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';
import { CONTROL_CLASSES } from '@/shared/ui/input';

/**
 * A drop-down choice with `<option>` children, styled like `Input`.
 *
 * It is a native `<select>` on purpose, unlike the rest of the kit, which takes its behaviour from
 * Radix: the native element works with React Hook Form's `register()` and with `selectOptions` in
 * jsdom tests, and brings the platform's own keyboard and screen-reader support. Radix Select
 * renders a custom listbox that needs pointer-capture APIs jsdom does not have.
 *
 * Every prop except the chevron goes to the `<select>`, so `Field` can label and describe it.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL_CLASSES, 'h-8 appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}
