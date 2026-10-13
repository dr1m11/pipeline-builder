import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';
import { CONTROL_CLASSES } from '@/shared/ui/input';

/**
 * A multi-line text field that the user can resize vertically. Like `Input`, it passes `ref`,
 * `name` and `onChange` to the native element, so React Hook Form's `register()` works.
 */
export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL_CLASSES, 'min-h-16 resize-y py-1.5', className)}
      {...props}
    />
  );
}
