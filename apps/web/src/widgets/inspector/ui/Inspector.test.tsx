import { addNode, createEmptyPipeline, type Pipeline } from '@pipeline-builder/core';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { Inspector } from './Inspector';

/** A Prompt "prompt" and an Output "output", unconnected. */
function twoNodes(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'p', name: 'Test' });
  pipeline = addNode(pipeline, { kind: 'prompt', id: 'prompt', position: { x: 0, y: 0 } }).pipeline;
  return addNode(pipeline, { kind: 'output', id: 'output', position: { x: 300, y: 0 } }).pipeline;
}

function renderInspector() {
  const store = createPipelineStore(twoNodes());
  render(
    <PipelineStoreProvider store={store}>
      <Inspector />
    </PipelineStoreProvider>,
  );
  const select = (nodeIds: string[]) => {
    act(() => {
      store.getState().select({ nodeIds });
    });
  };
  return { store, select };
}

describe('Inspector', () => {
  it('asks to select a node while none is selected', () => {
    renderInspector();

    expect(screen.getByRole('heading', { level: 2, name: 'Properties' })).toBeInTheDocument();
    expect(screen.getByText('Select a node to edit its properties.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('asks for one node when several are selected', () => {
    const { select } = renderInspector();

    select(['prompt', 'output']);

    expect(
      screen.getByText('2 nodes are selected. Select one to edit its properties.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('shows the kind and the form of the selected node', () => {
    const { select } = renderInspector();

    select(['prompt']);

    expect(screen.getByRole('heading', { level: 3, name: 'Prompt 1' })).toBeInTheDocument();
    expect(screen.getByText(/A text template/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Template' })).toBeInTheDocument();
  });

  it('switches the form to another selected node', () => {
    const { select } = renderInspector();

    select(['prompt']);
    select(['output']);

    expect(screen.getByRole('heading', { level: 3, name: 'Output 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Output 1');
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveValue('text');
    expect(screen.queryByRole('textbox', { name: 'Template' })).not.toBeInTheDocument();
  });

  it('goes back to the hint when the selected node is deleted', () => {
    const { store, select } = renderInspector();
    select(['prompt']);

    act(() => {
      store.getState().removeElements({ nodeIds: ['prompt'] });
    });

    expect(screen.getByText('Select a node to edit its properties.')).toBeInTheDocument();
  });
});
