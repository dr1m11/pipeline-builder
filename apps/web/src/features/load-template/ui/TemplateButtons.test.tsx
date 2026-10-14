import { createEmptyPipeline, PIPELINE_TEMPLATES } from '@pipeline-builder/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { TemplateButtons } from './TemplateButtons';

function renderButtons() {
  const empty = createEmptyPipeline({ id: 'draft', name: 'Untitled pipeline' });
  const store = createPipelineStore(empty);
  render(
    <TooltipProvider delayDuration={0}>
      <ToastProvider>
        <PipelineStoreProvider store={store}>
          <TemplateButtons />
        </PipelineStoreProvider>
      </ToastProvider>
    </TooltipProvider>,
  );
  return { store, empty, user: userEvent.setup() };
}

describe('TemplateButtons', () => {
  it('offers a button per template under one label', () => {
    renderButtons();

    const group = screen.getByRole('group', { name: 'Start from a template:' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(PIPELINE_TEMPLATES.map(({ name }) => name));
  });

  it('starts a pipeline from a template as one undoable step', async () => {
    const { store, empty, user } = renderButtons();

    await user.click(screen.getByRole('button', { name: 'Extract a JSON field' }));

    const { pipeline, history } = store.getState();
    expect(pipeline.name).toBe('Extract a JSON field');
    expect(pipeline.nodes.map((node) => node.label)).toEqual([
      'Text',
      'Extraction prompt',
      'Extractor',
      'Parse JSON',
      'Get email',
      'Email',
    ]);
    expect(history.past.map((entry) => entry.label)).toEqual([
      'Load template “Extract a JSON field”',
    ]);
    store.getState().undo();
    expect(store.getState().pipeline).toBe(empty);
  });
});
