import { createEmptyPipeline } from '@pipeline-builder/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { useUndoRedoShortcuts } from './use-undo-redo-shortcuts';

function Shortcuts() {
  useUndoRedoShortcuts();
  return <input aria-label="Name" />;
}

/** A pipeline with two nodes added one after the other, under the shortcuts. */
function renderShortcuts() {
  const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Test' }));
  render(
    <PipelineStoreProvider store={store}>
      <Shortcuts />
    </PipelineStoreProvider>,
  );
  act(() => {
    store.getState().addNode('input', { x: 0, y: 0 });
    store.getState().addNode('prompt', { x: 300, y: 0 });
  });
  const nodeLabels = () => store.getState().pipeline.nodes.map((node) => node.label);
  return { nodeLabels, user: userEvent.setup() };
}

describe('useUndoRedoShortcuts', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z or Ctrl+Y', async () => {
    const { nodeLabels, user } = renderShortcuts();

    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}z{/Control}');
    expect(nodeLabels()).toEqual([]);

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(nodeLabels()).toEqual(['Input 1']);

    await user.keyboard('{Control>}y{/Control}');
    expect(nodeLabels()).toEqual(['Input 1', 'Prompt 1']);
  });

  it('leaves Ctrl+Z in a text field to the field', async () => {
    const { nodeLabels, user } = renderShortcuts();

    await user.click(screen.getByRole('textbox', { name: 'Name' }));
    await user.keyboard('{Control>}z{/Control}');

    expect(nodeLabels()).toEqual(['Input 1', 'Prompt 1']);
  });
});
