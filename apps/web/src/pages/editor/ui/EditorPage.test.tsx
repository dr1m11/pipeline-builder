import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TooltipProvider } from '@/shared/ui/tooltip';

import { EditorPage } from './EditorPage';

function renderPage() {
  render(<EditorPage />, { wrapper: TooltipProvider });
  return { user: userEvent.setup() };
}

describe('EditorPage', () => {
  it('shows the pipeline name, the node palette and the canvas region', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Untitled pipeline' }),
    ).toBeInTheDocument();
    const palette = screen.getByRole('complementary', { name: 'Node palette' });
    expect(within(palette).getByRole('button', { name: 'Add Input' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Pipeline canvas' })).toBeInTheDocument();
  });

  it('hints how to start until the canvas has a node', async () => {
    const { user } = renderPage();
    const hint = 'Drag a node from the palette, or click one, to start your pipeline.';
    expect(screen.getByText(hint)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Input' }));

    expect(await screen.findByRole('group', { name: 'Input 1' })).toBeInTheDocument();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('shows the properties of a node it adds', async () => {
    const { user } = renderPage();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(
      within(inspector).getByText('Select a node to edit its properties.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));

    expect(within(inspector).getByRole('textbox', { name: 'Name' })).toHaveValue('Prompt 1');
    expect(within(inspector).getByRole('textbox', { name: 'Template' })).toBeInTheDocument();
  });

  it('edits text in a field without deleting the selected node', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.click(name);
    await user.keyboard('{Backspace}{Delete}{Backspace}');

    expect(name).toHaveValue('Prompt');
    expect(await screen.findByRole('group', { name: 'Prompt' })).toBeInTheDocument();
  });

  it('links to the source code in a new tab', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/dr1m11/pipeline-builder');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
