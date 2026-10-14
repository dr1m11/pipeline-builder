import { createEmptyPipeline } from '@pipeline-builder/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { UndoRedoButtons } from './UndoRedoButtons';

function renderButtons() {
  const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Test' }));
  render(
    <TooltipProvider delayDuration={0}>
      <PipelineStoreProvider store={store}>
        <UndoRedoButtons />
      </PipelineStoreProvider>
    </TooltipProvider>,
  );
  const addNodes = () => {
    act(() => {
      store.getState().addNode('input', { x: 0, y: 0 });
      store.getState().addNode('prompt', { x: 300, y: 0 });
    });
  };
  const nodeLabels = () => store.getState().pipeline.nodes.map((node) => node.label);
  return { addNodes, nodeLabels, user: userEvent.setup() };
}

describe('UndoRedoButtons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is disabled while there is nothing to undo or redo', () => {
    renderButtons();

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('names the change each button would make, and makes it', async () => {
    const { addNodes, nodeLabels, user } = renderButtons();
    addNodes();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Undo Add Prompt' }));

    expect(nodeLabels()).toEqual(['Input 1']);
    expect(screen.getByRole('button', { name: 'Undo Add Input' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Redo Add Prompt' }));

    expect(nodeLabels()).toEqual(['Input 1', 'Prompt 1']);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('shows the change and its shortcut in the tooltip', async () => {
    const { addNodes, user } = renderButtons();
    addNodes();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Undo Add Prompt' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Undo Add Prompt Ctrl Z');
  });

  it('shows the shortcut with ⌘ on Apple platforms', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { addNodes, user } = renderButtons();
    addNodes();

    await user.tab();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Undo Add Prompt ⌘ Z');
  });
});
