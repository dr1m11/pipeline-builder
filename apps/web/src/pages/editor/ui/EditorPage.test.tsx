import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/shared/ui/tooltip';

import { EditorPage } from './EditorPage';

function renderPage() {
  return render(<EditorPage />, { wrapper: TooltipProvider });
}

describe('EditorPage', () => {
  it('shows the pipeline name and the canvas region', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Untitled pipeline' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Pipeline canvas' })).toBeInTheDocument();
  });

  it('links to the source code in a new tab', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/dr1m11/pipeline-builder');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
