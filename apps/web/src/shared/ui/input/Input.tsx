import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';

import { CONTROL_CLASSES } from './control-classes';

/**
 * A single-line text or number field. Uncontrolled-friendly: `ref`, `name` and `onChange` pass
 * straight to the `<input>`, so React Hook Form's `register()` works. Label it with `Field`, or give
 * it an `aria-label`.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(CONTROL_CLASSES, 'h-8', className)} {...props} />;
}
