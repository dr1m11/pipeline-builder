import {
  addNode,
  connect,
  createEmptyPipeline,
  type NodeKind,
  type Pipeline,
} from '@pipeline-builder/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, useViewport } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

/** Unconnected nodes of the given kinds in a row, with their kinds as ids. */
function row(...kinds: NodeKind[]): Pipeline {
  return kinds.reduce(
    (pipeline, kind, index) =>
      addNode(pipeline, { kind, id: kind, position: { x: index * 300, y: 0 } }).pipeline,
    createEmptyPipeline({ id: 'draft', name: 'Test' }),
  );
}

function renderCanvas(pipeline = chain()) {
  const store = createPipelineStore(pipeline, { createId: () => 'new' });
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

  it('connects compatible ports from the keyboard', async () => {
    const { store, user } = renderCanvas(row('transform', 'output'));

    await activatePort(user, 'Transform 1', 'Output result (json)');
    await activatePort(user, 'Output 1', 'Input value (any)');

    expect(store.getState().pipeline.edges).toEqual([
      {
        id: 'new',
        source: 'transform',
        sourcePort: 'result',
        target: 'output',
        targetPort: 'value',
      },
    ]);
  });

  it('refuses to connect ports of incompatible types', async () => {
    const { store, user } = renderCanvas(row('transform', 'llm-call'));

    await activatePort(user, 'Transform 1', 'Output result (json)');
    await activatePort(user, 'LLM Call 1', 'Input prompt (text)');

    expect(store.getState().pipeline.edges).toEqual([]);
  });

  it('disables the ports a started connection cannot end on', async () => {
    const { user } = renderCanvas(row('transform', 'llm-call', 'output'));
    const port = (nodeName: string, portName: string) =>
      within(screen.getByRole('group', { name: nodeName })).getByRole('button', {
        name: portName,
      });

    await activatePort(user, 'Transform 1', 'Output result (json)');

    expect(port('Output 1', 'Input value (any)')).not.toHaveAttribute('aria-disabled');
    // Incompatible type, the node's own input, another output.
    expect(port('LLM Call 1', 'Input prompt (text)')).toHaveAttribute('aria-disabled', 'true');
    expect(port('Transform 1', 'Input value (text)')).toHaveAttribute('aria-disabled', 'true');
    expect(port('LLM Call 1', 'Output response (text)')).toHaveAttribute('aria-disabled', 'true');

    await activatePort(user, 'Output 1', 'Input value (any)');

    expect(port('LLM Call 1', 'Input prompt (text)')).not.toHaveAttribute('aria-disabled');
  });

  it('ends a text selection elsewhere on the page when it is pressed', async () => {
    render(
      <PipelineStoreProvider store={createPipelineStore(chain())}>
        <p>Text selected before</p>
        <div style={{ width: 1200, height: 600 }}>
          <PipelineCanvas />
        </div>
      </PipelineStoreProvider>,
    );
    const node = await screen.findByRole('group', { name: 'Input 1' });
    document.getSelection()?.selectAllChildren(screen.getByText('Text selected before'));

    // user-event would move the selection to the pressed point itself, as the browser does on text
    // that can be selected; nothing on the canvas can be, so the press alone must clear it.
    fireEvent.pointerDown(node);

    expect(document.getSelection()?.isCollapsed).toBe(true);
  });
});

/** The canvas's viewport as text, rounded: "x y zoom". */
function ViewportStatus() {
  const { x, y, zoom } = useViewport();
  return (
    <output aria-label="Viewport">{`${String(Math.round(x))} ${String(Math.round(y))} ${zoom.toFixed(2)}`}</output>
  );
}

/** The canvas inside the page's React Flow provider, with its viewport readable as text. */
function renderCanvasWithViewport(pipeline: Pipeline) {
  const store = createPipelineStore(pipeline, { createId: () => 'new' });
  render(
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <div style={{ width: 1200, height: 600 }}>
          <PipelineCanvas />
        </div>
        <ViewportStatus />
      </ReactFlowProvider>
    </PipelineStoreProvider>,
  );
  const viewport = () => {
    const [x = Number.NaN, y = Number.NaN, zoom = Number.NaN] = screen
      .getByRole('status', { name: 'Viewport' })
      .textContent.split(' ')
      .map(Number);
    return { x, y, zoom };
  };
  return { store, viewport };
}

/** One Output node far to the right of where the canvas opens. */
function farAway(): Pipeline {
  return addNode(createEmptyPipeline({ id: 'far', name: 'Far away' }), {
    kind: 'output',
    id: 'far',
    position: { x: 5000, y: 3000 },
  }).pipeline;
}

describe('PipelineCanvas view of a replaced document', () => {
  it('fits the view to a pipeline that replaces the document, and again on undo', async () => {
    const { store, viewport } = renderCanvasWithViewport(chain());
    await screen.findByRole('group', { name: 'Prompt 1' });

    act(() => {
      store.getState().replacePipeline(farAway(), 'import');
    });

    expect(await screen.findByRole('group', { name: 'Output 1' })).toBeInTheDocument();
    await waitFor(() => {
      expect(viewport().x).toBeLessThan(-1000);
    });
    expect(viewport().y).toBeLessThan(-1000);

    act(() => {
      store.getState().undo();
    });

    await waitFor(() => {
      expect(viewport().x).toBeGreaterThan(-1000);
    });
    expect(viewport().y).toBeGreaterThan(-1000);
  });

  it('returns to the default view for an empty pipeline', async () => {
    const { store, viewport } = renderCanvasWithViewport(farAway());
    await screen.findByRole('group', { name: 'Output 1' });
    await waitFor(() => {
      expect(viewport().x).toBeLessThan(-1000);
    });

    act(() => {
      store.getState().replacePipeline(createEmptyPipeline({ id: 'new', name: 'New' }), 'new');
    });

    await waitFor(() => {
      expect(viewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  it('keeps the view while the document only changes', async () => {
    const { store, viewport } = renderCanvasWithViewport(chain());
    await screen.findByRole('group', { name: 'Prompt 1' });
    await waitFor(() => {
      expect(viewport().zoom).not.toBe(1);
    });
    const opened = viewport();

    act(() => {
      store.getState().addNode('output', { x: 5000, y: 3000 });
    });

    expect(await screen.findByRole('group', { name: 'Output 1' })).toBeInTheDocument();
    expect(viewport()).toEqual(opened);
  });
});

describe('PipelineCanvas focus after a replaced document', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives the first node of the new document focus when focus went with the old one', async () => {
    const { store } = renderCanvasWithViewport(chain());
    const prompt = await screen.findByRole('group', { name: 'Prompt 1' });
    act(() => {
      prompt.focus();
    });

    act(() => {
      store.getState().replacePipeline(farAway(), 'import');
    });

    // Once the view fits it: React Flow would otherwise jump to the node and cut the fit short.
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Output 1' })).toHaveFocus();
    });
  });

  it('leaves focus on a control that is still on the page', async () => {
    // Without animation the fit, and what follows it, is over as soon as the view changes.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const store = createPipelineStore(chain());
    render(
      <PipelineStoreProvider store={store}>
        <ReactFlowProvider>
          <button type="button">Import pipeline</button>
          <div style={{ width: 1200, height: 600 }}>
            <PipelineCanvas />
          </div>
          <ViewportStatus />
        </ReactFlowProvider>
      </PipelineStoreProvider>,
    );
    await screen.findByRole('group', { name: 'Prompt 1' });
    const control = screen.getByRole('button', { name: 'Import pipeline' });
    act(() => {
      control.focus();
    });

    act(() => {
      store.getState().replacePipeline(farAway(), 'import');
    });
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Viewport' })).toHaveTextContent(/^-\d{4,}/);
    });

    expect(control).toHaveFocus();
  });
});
