import { addNode, createEmptyPipeline, type NodeKind, type Pipeline } from '@pipeline-builder/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { Inspector } from './Inspector';

/** Nodes with the given ids and kinds, unconnected. */
function pipelineOf(...nodes: [string, NodeKind][]): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'p', name: 'Test' });
  nodes.forEach(([id, kind], index) => {
    pipeline = addNode(pipeline, { kind, id, position: { x: index * 300, y: 0 } }).pipeline;
  });
  return pipeline;
}

/** A Prompt "prompt" and an Output "output", unconnected. */
function twoNodes(): Pipeline {
  return pipelineOf(['prompt', 'prompt'], ['output', 'output']);
}

function renderInspector(pipeline = twoNodes()) {
  const store = createPipelineStore(pipeline);
  render(
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <Inspector />
      </ReactFlowProvider>
    </PipelineStoreProvider>,
  );
  const select = (nodeIds: string[]) => {
    act(() => {
      store.getState().select({ nodeIds });
    });
  };
  return { store, select, user: userEvent.setup() };
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

  it('lists the graph problems of the selected node above its form', () => {
    const { select } = renderInspector();

    select(['prompt']);

    const problems = screen.getByRole('list', { name: 'Problems of Prompt 1' });
    expect(
      within(problems).getByRole('button', {
        name: 'Error: Prompt 1, Input "question" is not connected',
      }),
    ).toBeInTheDocument();
    expect(
      within(problems).getByRole('button', {
        name: 'Warning: Prompt 1, Its result does not reach any Output',
      }),
    ).toBeInTheDocument();
  });

  it('leaves field problems of the selected node to its form', async () => {
    const { select } = renderInspector(pipelineOf(['input', 'input'], ['output', 'output']));

    select(['input']);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAccessibleDescription(
        expect.stringContaining('Required'),
      );
    });
    const problems = screen.getByRole('list', { name: 'Problems of Input 1' });
    expect(within(problems).queryByRole('button', { name: /Value: Required/ })).toBeNull();
  });
});

describe('Inspector problems', () => {
  it('counts errors and warnings in the heading', () => {
    renderInspector();

    // The heading takes its name from the toggle in it.
    const toggle = screen.getByRole('button', { name: 'Problems: 2 errors, 1 warning' });
    expect(toggle.closest('h2')).not.toBeNull();
    const list = screen.getByRole('list', { name: 'Problems of the pipeline' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('says so when the pipeline has no problems', () => {
    renderInspector(createEmptyPipeline({ id: 'p', name: 'Empty' }));

    expect(screen.getByRole('button', { name: 'Problems: none' })).toBeInTheDocument();
    expect(screen.getByText('No problems')).toBeInTheDocument();
  });

  it('collapses and expands the list', async () => {
    const { user } = renderInspector();
    const toggle = screen.getByRole('button', { name: 'Problems: 2 errors, 1 warning' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Problems of the pipeline' })).toBeNull();

    await user.click(toggle);

    expect(screen.getByRole('list', { name: 'Problems of the pipeline' })).toBeInTheDocument();
  });

  it('selects the node of a field problem and focuses the field', async () => {
    const { store, user } = renderInspector(pipelineOf(['input', 'input'], ['output', 'output']));
    const list = screen.getByRole('list', { name: 'Problems of the pipeline' });

    await user.click(within(list).getByRole('button', { name: 'Error: Input 1, Value: Required' }));

    expect(store.getState().selectedNodeIds).toEqual(new Set(['input']));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus();
    });
  });

  it('focuses the field again when the same problem is picked again', async () => {
    const { user } = renderInspector(pipelineOf(['input', 'input'], ['output', 'output']));
    const list = screen.getByRole('list', { name: 'Problems of the pipeline' });
    const problem = within(list).getByRole('button', { name: 'Error: Input 1, Value: Required' });

    await user.click(problem);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus();
    });
    await user.click(problem);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus();
    });
  });

  it('does not move focus when the node is selected again later', async () => {
    const { select, user } = renderInspector(pipelineOf(['input', 'input'], ['output', 'output']));
    const list = screen.getByRole('list', { name: 'Problems of the pipeline' });
    await user.click(within(list).getByRole('button', { name: 'Error: Input 1, Value: Required' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus();
    });

    select(['output']);
    select(['input']);
    // React Hook Form focuses on the next task; let one pass.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.getByRole('textbox', { name: 'Value' })).not.toHaveFocus();
  });
});
