import { NODE_DEFINITIONS } from '@pipeline-builder/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/shared/ui/tooltip';

import { EditorPage } from './EditorPage';

function renderPage() {
  render(<EditorPage />, { wrapper: TooltipProvider });
  return { user: userEvent.setup() };
}

/** Presses Enter on a port: the first port starts a connection, the second completes it. */
async function activatePort(
  user: ReturnType<typeof userEvent.setup>,
  nodeName: string,
  portName: string,
) {
  const node = await screen.findByRole('group', { name: nodeName });
  const port = within(node).getByRole('button', { name: portName });
  act(() => {
    port.focus();
  });
  await user.keyboard('{Enter}');
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

  it('takes the user from a problem to its node on the canvas', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    await user.click(screen.getByRole('button', { name: 'Add LLM Call' }));
    const problems = screen.getByRole('list', { name: 'Problems of the pipeline' });

    await user.click(
      within(problems).getByRole('button', {
        name: 'Error: Prompt 1, Input "question" is not connected',
      }),
    );

    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { level: 3, name: 'Prompt 1' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Prompt 1' })).toHaveFocus();
    });
  });

  it('links to the source code in a new tab', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/dr1m11/pipeline-builder');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('EditorPage undo and redo', () => {
  // Changes merge in the history when each follows the last within a second. With the clock
  // stopped, every burst of typing or nudging falls within that window, however slow the machine.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const undoButton = (change: string) => screen.getByRole('button', { name: `Undo ${change}` });

  it('offers undo and redo in the Edit toolbar, disabled at first', () => {
    renderPage();

    const toolbar = screen.getByRole('toolbar', { name: 'Edit' });
    expect(within(toolbar).getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(within(toolbar).getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('undoes typing in a field in one step and shows the old value', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const template = screen.getByRole('textbox', { name: 'Template' });
    const original = NODE_DEFINITIONS.prompt.createData().template;

    await user.type(template, 'abc');
    expect(template).toHaveValue(`${original}abc`);
    await user.click(undoButton('Edit Template of Prompt 1'));

    await waitFor(() => {
      expect(template).toHaveValue(original);
    });
    expect(undoButton('Add Prompt')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Redo Edit Template of Prompt 1' })).toBeEnabled();
  });

  it('undoes arrow-key nudges of a node in one step', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const node = await screen.findByRole('group', { name: 'Prompt 1' });
    act(() => {
      node.focus();
    });

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    expect(undoButton('Move Prompt 1')).toBeEnabled();
    await user.keyboard('{Control>}z{/Control}');

    expect(undoButton('Add Prompt')).toBeEnabled();
  });

  it('brings back a deleted node with its edge', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Input' }));
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    await activatePort(user, 'Input 1', 'Output value (text)');
    await activatePort(user, 'Prompt 1', 'Input question (text)');
    const edgeName = 'Input 1 value to Prompt 1 question';
    expect(await screen.findByRole('group', { name: edgeName })).toBeInTheDocument();

    act(() => {
      screen.getByRole('group', { name: 'Prompt 1' }).focus();
    });
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('group', { name: edgeName })).not.toBeInTheDocument();
    await user.click(undoButton('Delete Prompt 1'));

    expect(await screen.findByRole('group', { name: 'Prompt 1' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: edgeName })).toBeInTheDocument();
  });

  it('forgets what could be redone once something else changes', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Input' }));
    await user.click(undoButton('Add Input'));
    expect(screen.getByRole('button', { name: 'Redo Add Input' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Add Output' }));

    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('stops editing a node whose addition is undone', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('textbox', { name: 'Name' })).toHaveValue('Prompt 1');

    await user.click(undoButton('Add Prompt'));

    expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    expect(
      within(inspector).getByText('Select a node to edit its properties.'),
    ).toBeInTheDocument();
  });

  it('leaves Ctrl+Z in a text field to the field', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.type(name, ' draft');

    await user.keyboard('{Control>}z{/Control}');

    expect(name).toHaveValue('Prompt 1 draft');
    expect(screen.getByRole('group', { name: 'Prompt 1 draft' })).toBeInTheDocument();
    expect(undoButton('Rename Prompt 1')).toBeEnabled();
  });
});
