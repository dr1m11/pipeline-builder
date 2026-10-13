import { createContext, use } from 'react';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastOptions {
  title: string;
  description?: string;
  /** Picks the icon. The title must carry the meaning on its own; colour is not enough. */
  tone?: ToastTone;
  /** One button, e.g. "Undo". Clicking it runs `onClick` and closes the toast. */
  action?: {
    label: string;
    /**
     * What a screen reader announces instead of the button, as it may not be reachable in time,
     * e.g. "Press Ctrl+Z to undo".
     */
    altText: string;
    onClick: () => void;
  };
  /** Milliseconds before the toast closes by itself; 5000 by default. Hover and focus pause it. */
  duration?: number;
}

export interface ToastApi {
  /** Shows a notification. It closes after its duration, by its Dismiss button or its action. */
  toast: (options: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** Shows notifications through the surrounding `ToastProvider` (mounted once in `app`). */
export function useToast(): ToastApi {
  const api = use(ToastContext);
  if (api === null) throw new Error('useToast is used outside ToastProvider');
  return api;
}
