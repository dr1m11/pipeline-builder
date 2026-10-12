import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorFallback } from './ErrorFallback';

describe('ErrorFallback', () => {
  it('announces the error with its message', () => {
    render(<ErrorFallback error={new Error('Graph is corrupted')} onRetry={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent('Graph is corrupted');
  });

  it('falls back to a generic message for non-Error values', () => {
    render(<ErrorFallback error="boom" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown error');
  });

  it('calls onRetry when the user retries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorFallback error={new Error('x')} onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
