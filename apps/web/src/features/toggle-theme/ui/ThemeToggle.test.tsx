import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers the three theme options with "System" selected by default', () => {
    render(<ThemeToggle />);

    const group = screen.getByRole('group', { name: 'Colour theme' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('switches the document theme when an option is chosen', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('is operable with the keyboard', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
