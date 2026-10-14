import {
  addNode,
  connect,
  createEmptyPipeline,
  extractFragment,
  type Pipeline,
  SCHEMA_VERSION,
  serializePipeline,
} from '@pipeline-builder/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { COPY_OFFSET } from '../lib/paste-cascade';
import { useEditSelection } from './use-edit-selection';

/** Input → Prompt, and an LLM Call on its own. */
function pipelineWithEdge(): Pipeline {
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
  const connected = connect(
    pipeline,
    { source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
    'input-prompt',
  );
  if (!connected.ok) throw new Error('Cannot connect Input to Prompt');
  return connected.value.pipeline;
}

function Editor() {
  useEditSelection();
  return (
    <>
      <textarea aria-label="Notes" />
      <p>Some text on the page</p>
      <div role="dialog" aria-label="Settings">
        <button type="button">Close</button>
      </div>
      {/* React Flow's mark for elements its own keys skip, as a port of a node is. */}
      <div className="nokey">
        <button type="button">Port</button>
      </div>
      <select aria-label="Operation">
        <option>Trim</option>
        <option>Parse JSON</option>
      </select>
      <input type="checkbox" aria-label="Enabled" />
    </>
  );
}

function renderEditor(pipeline = pipelineWithEdge()) {
  const store = createPipelineStore(pipeline);
  render(
    <TooltipProvider>
      <ToastProvider>
        <PipelineStoreProvider store={store}>
          <Editor />
        </PipelineStoreProvider>
      </ToastProvider>
    </TooltipProvider>,
  );
  const labels = () => store.getState().pipeline.nodes.map((node) => node.label);
  return { store, labels, user: userEvent.setup() };
}

/** The clipboard that the browser hands to clipboard events; jsdom has no `DataTransfer`. */
class ClipboardStub {
  readonly #data = new Map<string, string>();

  getData(format: string): string {
    return this.#data.get(format) ?? '';
  }

  setData(format: string, data: string): void {
    this.#data.set(format, data);
  }
}

/**
 * Fires a copy or cut event as the browser does for Ctrl+C or Ctrl+X: on the focused element, with
 * an empty clipboard to write to. (user-event copies only selected text, and here none is.)
 */
function pressCopy(
  type: 'copy' | 'cut',
  target: Element = document.activeElement ?? document.body,
) {
  const clipboardData = new ClipboardStub();
  const notCancelled =
    type === 'copy'
      ? fireEvent.copy(target, { clipboardData })
      : fireEvent.cut(target, { clipboardData });
  return { handled: !notCancelled, text: clipboardData.getData('text/plain') };
}

/** Whether keys pressed next reach the window with their default action prevented. */
function trackDefaultPrevented() {
  const prevented: boolean[] = [];
  const listener = (event: KeyboardEvent) => prevented.push(event.defaultPrevented);
  window.addEventListener('keydown', listener);
  return {
    last: () => prevented.at(-1),
    stop: () => {
      window.removeEventListener('keydown', listener);
    },
  };
}

const offsetBy = (steps: number) => ({ x: steps * COPY_OFFSET, y: steps * COPY_OFFSET });

describe('useEditSelection clipboard', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  it('copies the selected nodes and the edges between them as a pipeline file', () => {
    const { store } = renderEditor();
    const { pipeline } = store.getState();
    store.getState().select({ nodeIds: ['input', 'prompt'] });

    const { handled, text } = pressCopy('copy');

    expect(handled).toBe(true);
    expect(text).toBe(serializePipeline(extractFragment(pipeline, ['input', 'prompt'])));
    expect(text).toContain('"id": "input-prompt"');
    expect(store.getState().pipeline).toBe(pipeline);
  });

  it('leaves copy to the browser when no node is selected', () => {
    renderEditor();

    expect(pressCopy('copy')).toEqual({ handled: false, text: '' });
  });

  it('pastes copies with fresh ids, offset and selected, as one undo step', async () => {
    const { store, labels, user } = renderEditor();
    const before = store.getState().pipeline;
    store.getState().select({ nodeIds: ['input', 'prompt'] });
    const { text } = pressCopy('copy');

    await user.paste(text);

    const { pipeline, selectedNodeIds, selectedEdgeIds, history } = store.getState();
    expect(labels()).toEqual(['Input 1', 'Prompt 1', 'LLM Call 1', 'Input 2', 'Prompt 2']);
    const copies = pipeline.nodes.slice(3);
    const originalIds = before.nodes.map((node) => node.id);
    expect(copies.every((node) => !originalIds.includes(node.id))).toBe(true);
    expect(copies.map((node) => node.position)).toEqual([
      offsetBy(1),
      { x: 300 + COPY_OFFSET, y: COPY_OFFSET },
    ]);
    const pastedEdge = pipeline.edges.at(-1);
    expect(pastedEdge).toMatchObject({ source: copies[0]?.id, target: copies[1]?.id });
    expect([...selectedNodeIds]).toEqual(copies.map((node) => node.id));
    expect([...selectedEdgeIds]).toEqual([pastedEdge?.id]);
    expect(history.past.map((entry) => entry.label)).toEqual(['Paste 2 nodes']);

    store.getState().undo();

    expect(store.getState().pipeline).toBe(before);
  });

  it('pastes each time a little further from the originals', async () => {
    const { store, user } = renderEditor();
    store.getState().select({ nodeIds: ['input'] });
    const { text } = pressCopy('copy');

    await user.paste(text);
    await user.paste(text);
    await user.paste(text);

    const positions = store
      .getState()
      .pipeline.nodes.slice(3)
      .map((node) => node.position);
    expect(positions).toEqual([offsetBy(1), offsetBy(2), offsetBy(3)]);
    expect(
      store
        .getState()
        .pipeline.nodes.slice(3)
        .map((node) => node.label),
    ).toEqual(['Input 2', 'Input 3', 'Input 4']);
  });

  it('pastes the same text with other line ends as further copies too', async () => {
    const { store, user } = renderEditor();
    store.getState().select({ nodeIds: ['input'] });
    const { text } = pressCopy('copy');

    await user.paste(text);
    await user.paste(text.replaceAll('\n', '\r\n'));

    const positions = store
      .getState()
      .pipeline.nodes.slice(3)
      .map((node) => node.position);
    expect(positions).toEqual([offsetBy(1), offsetBy(2)]);
  });

  it('cuts the selected nodes and edges as one undo step', async () => {
    const { store, labels, user } = renderEditor();
    const before = store.getState().pipeline;
    store.getState().select({ nodeIds: ['input', 'prompt'], edgeIds: ['input-prompt'] });

    const { handled, text } = pressCopy('cut');

    expect(handled).toBe(true);
    expect(text).toBe(serializePipeline(extractFragment(before, ['input', 'prompt'])));
    expect(labels()).toEqual(['LLM Call 1']);
    expect(store.getState().pipeline.edges).toEqual([]);
    expect(store.getState().history.past.map((entry) => entry.label)).toEqual(['Cut 2 nodes']);

    await user.paste(text);
    expect(labels()).toEqual(['LLM Call 1', 'Input 1', 'Prompt 1']);

    store.getState().undo();
    store.getState().undo();
    expect(store.getState().pipeline).toBe(before);
  });

  it('pastes the nodes of an exported pipeline file', async () => {
    const { store, labels, user } = renderEditor();
    const exported = addNode(createEmptyPipeline({ id: 'other', name: 'Other' }), {
      kind: 'output',
      id: 'output',
      position: { x: 100, y: 100 },
    }).pipeline;

    await user.paste(serializePipeline(exported));

    expect(labels()).toEqual(['Input 1', 'Prompt 1', 'LLM Call 1', 'Output 1']);
    expect(store.getState().pipeline.nodes.at(-1)?.position).toEqual({
      x: 100 + COPY_OFFSET,
      y: 100 + COPY_OFFSET,
    });
  });

  it('ignores clipboard text that is not a pipeline', async () => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();

    await user.paste('Just some text');
    await user.paste('{"nodes": []}');

    expect(store.getState().pipeline).toBe(pipeline);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tells that nodes copied in a newer version cannot be pasted', async () => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();
    const newer = serializePipeline(pipeline).replace(
      `"schemaVersion": ${String(SCHEMA_VERSION)}`,
      `"schemaVersion": ${String(SCHEMA_VERSION + 1)}`,
    );

    await user.paste(newer);

    expect(await screen.findByText('Cannot paste nodes from a newer version')).toBeInTheDocument();
    expect(store.getState().pipeline).toBe(pipeline);
  });

  it('leaves the clipboard of a text field to the browser', async () => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();
    store.getState().select({ nodeIds: ['input'] });
    const { text } = pressCopy('copy');
    const notes = screen.getByRole('textbox', { name: 'Notes' });

    await user.click(notes);
    expect(pressCopy('copy').handled).toBe(false);
    expect(pressCopy('cut').handled).toBe(false);
    await user.paste(text);

    expect(notes).toHaveValue(text);
    expect(store.getState().pipeline).toBe(pipeline);
  });

  it('copies and pastes while a port of a node has the focus', async () => {
    const { store, labels, user } = renderEditor();
    store.getState().select({ nodeIds: ['input'] });

    await user.click(screen.getByRole('button', { name: 'Port' }));
    const { handled, text } = pressCopy('copy');
    await user.paste(text);

    expect(handled).toBe(true);
    expect(labels()).toEqual(['Input 1', 'Prompt 1', 'LLM Call 1', 'Input 2']);
  });

  it('copies, but neither cuts nor pastes, while a select has the focus', async () => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();
    store.getState().select({ nodeIds: ['input'] });

    await user.click(screen.getByRole('combobox', { name: 'Operation' }));
    const copied = pressCopy('copy');
    await user.paste(copied.text);

    // Both would change the selection, and the Inspector would replace the form the select is in.
    expect(copied.handled).toBe(true);
    expect(pressCopy('cut').handled).toBe(false);
    expect(store.getState().pipeline).toBe(pipeline);
  });

  it('leaves the clipboard alone while a dialog has the focus', async () => {
    const { store, user } = renderEditor();
    store.getState().select({ nodeIds: ['input'] });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Some browsers aim the event at the page rather than at the focused element.
    expect(pressCopy('copy', document.body).handled).toBe(false);
    expect(pressCopy('copy').handled).toBe(false);
  });

  it('leaves selected text on the page to the browser', async () => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();
    store.getState().select({ nodeIds: ['input'] });
    const { text } = pressCopy('copy');
    document.getSelection()?.selectAllChildren(screen.getByText('Some text on the page'));

    const copied = await user.copy();
    await user.paste(text);

    expect(copied?.getData('text/plain')).toBe('Some text on the page');
    expect(store.getState().pipeline).toBe(pipeline);
  });

  it('tells Safari that it handles the clipboard outside text fields', async () => {
    const { store, user } = renderEditor();
    // Returns whether the event was cancelled, which tells Safari the page handles the command.
    const fire = (type: string) =>
      !fireEvent(
        document.activeElement ?? document.body,
        new Event(type, { bubbles: true, cancelable: true }),
      );

    expect(fire('beforecopy')).toBe(false);
    expect(fire('beforecut')).toBe(false);
    expect(fire('beforepaste')).toBe(true);

    store.getState().select({ nodeIds: ['input'] });
    expect(fire('beforecopy')).toBe(true);
    expect(fire('beforecut')).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));
    expect(fire('beforecopy')).toBe(true);
    expect(fire('beforecut')).toBe(false);
    expect(fire('beforepaste')).toBe(false);

    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    expect(fire('beforecopy')).toBe(false);
    expect(fire('beforepaste')).toBe(false);
  });
});

describe('useEditSelection shortcuts', () => {
  it('duplicates the selected nodes with Ctrl+D as one undo step', async () => {
    const { store, labels, user } = renderEditor();
    const before = store.getState().pipeline;
    store.getState().select({ nodeIds: ['input', 'prompt'] });

    await user.keyboard('{Control>}d{/Control}');

    const { pipeline, selectedNodeIds, history } = store.getState();
    expect(labels()).toEqual(['Input 1', 'Prompt 1', 'LLM Call 1', 'Input 2', 'Prompt 2']);
    const copies = pipeline.nodes.slice(3);
    expect(copies.map((node) => node.position)).toEqual([
      offsetBy(1),
      { x: 300 + COPY_OFFSET, y: COPY_OFFSET },
    ]);
    expect(pipeline.edges).toHaveLength(2);
    expect([...selectedNodeIds]).toEqual(copies.map((node) => node.id));
    expect(history.past.map((entry) => entry.label)).toEqual(['Duplicate 2 nodes']);

    store.getState().undo();
    expect(store.getState().pipeline).toBe(before);
  });

  it('keeps Ctrl+D from the browser even with nothing to duplicate', async () => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();
    const tracker = trackDefaultPrevented();

    await user.keyboard('{Control>}d{/Control}');

    expect(tracker.last()).toBe(true);
    expect(store.getState().pipeline).toBe(pipeline);
    tracker.stop();
  });

  it('selects every node and edge with Ctrl+A and clears the selection with Escape', async () => {
    const { store, user } = renderEditor();
    const tracker = trackDefaultPrevented();

    await user.keyboard('{Control>}a{/Control}');

    expect(tracker.last()).toBe(true);
    expect([...store.getState().selectedNodeIds]).toEqual(['input', 'prompt', 'llm']);
    expect([...store.getState().selectedEdgeIds]).toEqual(['input-prompt']);

    await user.keyboard('{Escape}');

    expect(store.getState().selectedNodeIds.size).toBe(0);
    expect(store.getState().selectedEdgeIds.size).toBe(0);
    tracker.stop();
  });

  it('leaves Ctrl+A in a text field to the field', async () => {
    const { store, user } = renderEditor();

    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    await user.keyboard('{Control>}a{/Control}');

    expect(store.getState().selectedNodeIds.size).toBe(0);
  });

  it.each([
    ['a select', () => screen.getByRole('combobox', { name: 'Operation' })],
    ['a checkbox', () => screen.getByRole('checkbox', { name: 'Enabled' })],
  ])('keeps the selection when keys are pressed on %s', async (_control, control) => {
    const { store, user } = renderEditor();
    const { pipeline } = store.getState();
    store.getState().select({ nodeIds: ['input'] });
    const { selectedNodeIds } = store.getState();
    const tracker = trackDefaultPrevented();

    act(() => {
      control().focus();
    });
    await user.keyboard('{Control>}d{/Control}');
    expect(tracker.last()).toBe(false);
    await user.keyboard('{Control>}a{/Control}');
    await user.keyboard('{Escape}');

    expect(store.getState().pipeline).toBe(pipeline);
    expect(store.getState().selectedNodeIds).toBe(selectedNodeIds);
    expect(control()).toHaveFocus();
    tracker.stop();
  });
});
