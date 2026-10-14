import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlow } from '@xyflow/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/shared/ui/tooltip';

import { ToastProvider } from './Toast';
import { type ToastOptions, useToast } from './use-toast';

/** A button that shows the given toast each time it is clicked. */
function Notify({ label = 'Notify', ...options }: ToastOptions & { label?: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast(options);
      }}
    >
      {label}
    </button>
  );
}

function renderWithProviders(ui: ReactNode) {
  render(
    <TooltipProvider delayDuration={0}>
      <ToastProvider>{ui}</ToastProvider>
    </TooltipProvider>,
  );
}

function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the title and description in the notifications region', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Notify
        title="Pipeline exported"
        description="Saved as draft.pipeline.json"
        tone="success"
      />,
    );
    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notify' }));

    const toast = notifications().getByRole('listitem');
    expect(toast).toHaveTextContent('Pipeline exported');
    expect(toast).toHaveTextContent('Saved as draft.pipeline.json');
  });

  it('closes by itself after its duration', async () => {
    // Testing Library waits on real timeouts after each user event, so time keeps moving too.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    renderWithProviders(<Notify title="Copied 2 nodes" duration={10_000} />);

    await user.click(screen.getByRole('button', { name: 'Notify' }));
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(notifications().getByRole('listitem')).toHaveTextContent('Copied 2 nodes');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('closes with its Dismiss button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Notify title="Import failed" tone="danger" />);
    await user.click(screen.getByRole('button', { name: 'Notify' }));

    await user.click(notifications().getByRole('button', { name: 'Dismiss' }));

    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('runs its action once and closes', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    renderWithProviders(
      <Notify
        title="Loaded “Route by sentiment”"
        action={{ label: 'Undo', altText: 'Press Ctrl+Z to undo', onClick: onUndo }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Notify' }));

    await user.click(notifications().getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('stacks toasts and keeps the newest three', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Notify label="First" title="First" />
        <Notify label="Second" title="Second" />
        <Notify label="Third" title="Third" />
        <Notify label="Fourth" title="Fourth" />
      </>,
    );

    for (const name of ['First', 'Second', 'Third', 'Fourth']) {
      await user.click(screen.getByRole('button', { name }));
    }

    expect(
      notifications()
        .getAllByRole('listitem')
        .map((toast) => toast.textContent),
    ).toEqual(['Second', 'Third', 'Fourth']);
  });

  it('keeps Delete pressed on a toast away from the canvas', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderWithProviders(
      <>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlow
            defaultNodes={[{ id: 'a', position: { x: 0, y: 0 }, data: {}, selected: true }]}
            deleteKeyCode={['Delete', 'Backspace']}
            onDelete={onDelete}
          />
        </div>
        <Notify title="Copied 2 nodes" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Notify' }));

    await user.keyboard('{F8}');
    await user.tab();
    expect(notifications().getByRole('listitem')).toHaveFocus();
    await user.keyboard('{Delete}{Backspace}');

    // Dialog.test.tsx shows that the same key outside a .nokey element deletes by this point.
    expect(onDelete).not.toHaveBeenCalled();
  });

  describe('on Escape', () => {
    /** Whether each Escape reached the page with its default action prevented. */
    function trackEscape() {
      const prevented: boolean[] = [];
      const listener = (event: KeyboardEvent) => {
        if (event.key === 'Escape') prevented.push(event.defaultPrevented);
      };
      document.addEventListener('keydown', listener);
      return {
        prevented,
        stop: () => {
          document.removeEventListener('keydown', listener);
        },
      };
    }

    it('closes a focused toast and marks the key handled for page-wide shortcuts', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Notify title="Copied 2 nodes" />);
      await user.click(screen.getByRole('button', { name: 'Notify' }));
      await user.keyboard('{F8}');
      await user.tab();
      expect(notifications().getByRole('listitem')).toHaveFocus();
      const escape = trackEscape();

      await user.keyboard('{Escape}');

      expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
      expect(escape.prevented).toEqual([true]);
      const region = screen.getByRole('region', { name: 'Notifications (F8)' });
      expect(region.contains(document.activeElement)).toBe(true);
      escape.stop();
    });

    it('closes a toast that does not have the focus and marks the key handled', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Notify title="Copied 2 nodes" />);
      const notify = screen.getByRole('button', { name: 'Notify' });
      await user.click(notify);
      expect(notifications().getByRole('listitem')).toBeInTheDocument();
      const escape = trackEscape();

      await user.keyboard('{Escape}');

      expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
      expect(escape.prevented).toEqual([true]);
      expect(notify).toHaveFocus();
      escape.stop();
    });
  });

  it('fails outside a provider', () => {
    expect(() => renderHook(() => useToast())).toThrow('useToast is used outside ToastProvider');
  });
});
