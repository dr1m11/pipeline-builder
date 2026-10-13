import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs font-medium whitespace-nowrap tabular-nums [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-fg-muted',
        danger: 'bg-danger text-danger-fg',
        warning: 'bg-warning text-warning-fg',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

/**
 * A small, non-interactive label, such as a problem count. Colour is never the only signal: pair
 * a tone with an icon, and give a bare number words for screen readers ("2 errors").
 */
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
