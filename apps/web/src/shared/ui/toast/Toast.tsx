import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, type LucideIcon, X } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/shared/ui/button';
import { IconButton } from '@/shared/ui/icon-button';

import { type ToastApi, ToastContext, type ToastOptions, type ToastTone } from './use-toast';

/** A new toast beyond this many pushes the oldest one out. */
const MAX_TOASTS = 3;

const TONE_ICONS = {
  neutral: Info,
  success: CircleCheck,
  danger: CircleAlert,
} satisfies Record<ToastTone, LucideIcon>;

const toneIconVariants = cva('my-0.5 size-4 shrink-0', {
  variants: {
    tone: {
      neutral: 'text-fg-muted',
      success: 'text-success',
      danger: 'text-danger',
    },
  },
});

interface ActiveToast extends ToastOptions {
  id: number;
}

/**
 * Lets everything inside show notifications with `useToast`; mount it once near the app root,
 * inside `TooltipProvider`. Toasts stack at the bottom centre of the screen, in a region labelled
 * "Notifications (F8)" that F8 focuses, and screen readers announce each one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);
  const lastIdRef = useRef(0);

  const toast = useCallback((options: ToastOptions) => {
    lastIdRef.current += 1;
    const id = lastIdRef.current;
    setToasts((current) => [...current, { ...options, id }].slice(-MAX_TOASTS));
  }, []);
  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);
  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastPrimitive.Provider>
      <ToastContext value={api}>{children}</ToastContext>
      {toasts.map(({ id, ...options }) => (
        <ToastCard
          key={id}
          {...options}
          onClose={() => {
            remove(id);
          }}
        />
      ))}
      {/* `nokey`: keys pressed on a focused toast must not delete the canvas selection. */}
      <ToastPrimitive.Viewport className="nokey fixed bottom-4 left-1/2 z-50 flex w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus" />
    </ToastPrimitive.Provider>
  );
}

interface ToastCardProps extends ToastOptions {
  onClose: () => void;
}

function ToastCard({
  title,
  description,
  tone = 'neutral',
  action,
  duration,
  onClose,
}: ToastCardProps) {
  const Icon = TONE_ICONS[tone];
  return (
    <ToastPrimitive.Root
      duration={duration}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      // Escape closes the toast and goes no further, so page-wide shortcuts (Escape clears the
      // canvas selection) do not act on it too.
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
      className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-fg shadow-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[translate] data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) motion-safe:animate-toast-in"
    >
      <Icon aria-hidden className={toneIconVariants({ tone })} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title className="text-sm font-medium">{title}</ToastPrimitive.Title>
        {description !== undefined && (
          <ToastPrimitive.Description className="text-sm text-fg-muted">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      {/* Taller than a line of text; the negative margin keeps them on the title's line. */}
      <div className="-my-1.5 -mr-1.5 flex shrink-0 items-center gap-1">
        {action && (
          <ToastPrimitive.Action altText={action.altText} onClick={action.onClick} asChild>
            <Button size="sm">{action.label}</Button>
          </ToastPrimitive.Action>
        )}
        <ToastPrimitive.Close asChild>
          <IconButton label="Dismiss" tooltipSide="top">
            <X aria-hidden />
          </IconButton>
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  );
}
