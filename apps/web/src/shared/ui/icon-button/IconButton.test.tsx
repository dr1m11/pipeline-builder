import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Undo2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/shared/ui/tooltip';

import { IconButton } from './IconButton';

function renderWithProvider(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('IconButton', () => {
  it('uses the label as the accessible name', () => {
    renderWithProvider(
      <IconButton label="Undo">
        <Undo2 aria-hidden />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('shows the label as a tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <IconButton label="Undo">
        <Undo2 aria-hidden />
      </IconButton>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Undo');
  });

  it('shows the keys of its shortcut in the tooltip', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <IconButton label="Undo" shortcut={['Ctrl', 'Z']}>
        <Undo2 aria-hidden />
      </IconButton>,
    );

    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Undo Ctrl Z');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(within(tooltip).getByText('Ctrl').tagName).toBe('KBD');
  });

  it('forwards clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProvider(
      <IconButton label="Undo" onClick={onClick}>
        <Undo2 aria-hidden />
      </IconButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('labels a link rendered with asChild', () => {
    renderWithProvider(
      <IconButton label="Source code" asChild>
        <a href="https://example.com">
          <Undo2 aria-hidden />
        </a>
      </IconButton>,
    );
    expect(screen.getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });
});
