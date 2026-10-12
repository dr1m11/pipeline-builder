import { addNode, connect, createEmptyPipeline, type Pipeline } from '@pipeline-builder/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';

import { PipelineCanvas } from './PipelineCanvas';

/** Input → Prompt → LLM Call. */
function chain(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'draft', name: 'Test' });
  pipeline = addNode(pipeline, { kind: 'input', id: 'input', position: { x: 0, y: 0 } }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'prompt',
    id: 'prompt',
    position: { x: 300, y: 0 },
  }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'llm-call',
    id: 'llm',
    position: { x: 600, y: 0 },
  }).pipeline;
  for (const [candidate, id] of [
    [{ source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' }, 'e1'],
    [{ source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'prompt' }, 'e2'],
  ] as const) {
    const result = connect(pipeline, candidate, id);
    if (!result.ok) throw new Error(result.error);
    pipeline = result.value.pipeline;
  }
  return pipeline;
}

function renderCanvas() {
  const store = createPipelineStore(chain());
  render(
    <PipelineStoreProvider store={store}>
      <div style={{ width: 1200, height: 600 }}>
        <PipelineCanvas />
      </div>
    </PipelineStoreProvider>,
  );
  return { store, user: userEvent.setup() };
}

async function selectWithKeyboard(user: ReturnType<typeof userEvent.setup>, name: string) {
  const node = await screen.findByRole('group', { name });
  act(() => {
    node.focus();
  });
  await user.keyboard('{Enter}');
}

// jsdom cannot drag (d3-drag needs event.view) or draw a selection rectangle; the Storybook stories
// cover those.
describe('PipelineCanvas', () => {
  it('shows every node of the pipeline', async () => {
    renderCanvas();

    for (const name of ['Input 1', 'Prompt 1', 'LLM Call 1']) {
      expect(await screen.findByRole('group', { name })).toBeInTheDocument();
    }
  });

  it('deletes the selected node together with its edges', async () => {
    const { store, user } = renderCanvas();

    await selectWithKeyboard(user, 'Prompt 1');
    expect(store.getState().selectedNodeIds).toEqual(new Set(['prompt']));
    await user.keyboard('{Delete}');

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    });
    expect(store.getState().pipeline.nodes.map((node) => node.id)).toEqual(['input', 'llm']);
    expect(store.getState().pipeline.edges).toEqual([]);
  });

  it('moves the selected node with the arrow keys', async () => {
    const { store, user } = renderCanvas();

    await selectWithKeyboard(user, 'Input 1');
    await user.keyboard('{ArrowRight}{ArrowDown}');

    expect(store.getState().pipeline.nodes[0]?.position).toEqual({ x: 5, y: 5 });
    expect(store.getState().dragPositions.size).toBe(0);
  });
});
