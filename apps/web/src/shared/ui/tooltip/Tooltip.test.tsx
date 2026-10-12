import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tooltip, TooltipProvider } from './Tooltip';

describe('Tooltip', () => {
  it('is hidden until the trigger is focused, then describes it', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Fit the graph to the screen">
          <button type="button">Fit view</button>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Fit the graph to the screen');
    expect(screen.getByRole('button', { name: 'Fit view' })).toHaveAccessibleDescription(
      'Fit the graph to the screen',
    );
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Help">
          <button type="button">?</button>
        </Tooltip>
      </TooltipProvider>,
    );

    await user.tab();
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
