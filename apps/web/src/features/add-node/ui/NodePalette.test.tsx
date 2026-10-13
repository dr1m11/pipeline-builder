import { createEmptyPipeline, NODE_DEFINITIONS, NODE_KINDS } from '@pipeline-builder/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { NodePalette } from './NodePalette';

function renderPalette() {
  let ids = 0;
  const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Test' }), {
    createId: () => `node-${String(++ids)}`,
  });
  render(
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <NodePalette />
      </ReactFlowProvider>
    </PipelineStoreProvider>,
  );
  return { store, user: userEvent.setup() };
}

describe('NodePalette', () => {
  it('lists every node kind with its description', () => {
    renderPalette();

    const list = screen.getByRole('list', { name: 'Nodes' });
    expect(list.children).toHaveLength(NODE_KINDS.length);
    for (const kind of NODE_KINDS) {
      const { title, description } = NODE_DEFINITIONS[kind];
      expect(screen.getByRole('button', { name: `Add ${title}`, description })).toBeVisible();
    }
  });

  it('adds a node on click, selects it and announces it', async () => {
    const { store, user } = renderPalette();

    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));

    const { pipeline, selectedNodeIds } = store.getState();
    expect(pipeline.nodes).toEqual([expect.objectContaining({ id: 'node-1', label: 'Prompt 1' })]);
    expect(selectedNodeIds).toEqual(new Set(['node-1']));
    expect(screen.getByRole('status')).toHaveTextContent('Added Prompt 1');
  });

  it('adds nodes from the keyboard side by side, not on top of each other', async () => {
    const { store, user } = renderPalette();

    screen.getByRole('button', { name: 'Add LLM Call' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    const [first, second] = store.getState().pipeline.nodes;
    expect(second?.label).toBe('LLM Call 2');
    expect(second?.position).toEqual({ x: (first?.position.x ?? 0) + 280, y: first?.position.y });
    expect(store.getState().selectedNodeIds).toEqual(new Set([second?.id]));
    expect(screen.getByRole('status')).toHaveTextContent('Added LLM Call 2');
  });

  it('announces a label again when it comes back', async () => {
    const { store, user } = renderPalette();
    const status = screen.getByRole('status');

    await user.click(screen.getByRole('button', { name: 'Add Output' }));
    const announced = status.textContent;
    store.getState().removeElements({ nodeIds: ['node-1'] });
    await user.click(screen.getByRole('button', { name: 'Add Output' }));

    expect(status).toHaveTextContent('Added Output 1');
    expect(status.textContent).not.toBe(announced);
  });
});
