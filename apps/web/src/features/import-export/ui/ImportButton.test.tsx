import {
  addNode,
  createEmptyPipeline,
  EMPTY_HISTORY,
  type Pipeline,
  serializePipeline,
} from '@pipeline-builder/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { ImportButton } from './ImportButton';

/** The pipeline being edited when a file is imported. */
const draft: Pipeline = addNode(createEmptyPipeline({ id: 'draft', name: 'Draft' }), {
  kind: 'input',
  id: 'input',
  position: { x: 0, y: 0 },
}).pipeline;

/** The pipeline in the imported file: Input → Output. */
const askQuestion: Pipeline = {
  ...addNode(
    addNode(createEmptyPipeline({ id: 'ask', name: 'Ask a question' }), {
      kind: 'input',
      id: 'question',
      position: { x: 0, y: 0 },
    }).pipeline,
    { kind: 'output', id: 'answer', position: { x: 300, y: 0 } },
  ).pipeline,
  edges: [
    { id: 'e1', source: 'question', sourcePort: 'value', target: 'answer', targetPort: 'value' },
  ],
};

function jsonFile(text: string, name = 'ask.pipeline.json'): File {
  return new File([text], name, { type: 'application/json' });
}

/** The text of a pipeline file with `fields` changed. */
function fileText(fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ ...JSON.parse(serializePipeline(askQuestion)), ...fields });
}

function renderImport(pipeline: Pipeline = draft) {
  const store = createPipelineStore(pipeline);
  render(
    <TooltipProvider delayDuration={0}>
      <ToastProvider>
        <PipelineStoreProvider store={store}>
          <ImportButton />
        </PipelineStoreProvider>
      </ToastProvider>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  // The file input is hidden behind the button, so it has no role to query it by.
  const input = screen.getByLabelText<HTMLInputElement>('Pipeline file');
  return {
    store,
    user,
    input,
    choose: (file: File) => user.upload(input, file),
  };
}

function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

/**
 * The toast's Undo button, once it can be clicked. The import ends after the file is read, outside
 * any user event, and Radix lets pointer events into the toast region only in an effect after the
 * toast renders.
 */
async function findUndoAction(): Promise<HTMLElement> {
  const region = screen.getByRole('region', { name: 'Notifications (F8)' });
  const undo = await within(region).findByRole('button', { name: 'Undo' });
  await waitFor(() => {
    expect(region).not.toHaveStyle({ pointerEvents: 'none' });
  });
  return undo;
}

describe('ImportButton', () => {
  it('opens the file picker for pipeline files', async () => {
    const { user, input } = renderImport();
    const openPicker = vi.spyOn(input, 'click');

    await user.click(screen.getByRole('button', { name: 'Import pipeline' }));

    expect(openPicker).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('accept', '.json,application/json');
  });

  it('imports the chosen file in one undoable step', async () => {
    const { store, choose } = renderImport();

    await choose(jsonFile(serializePipeline(askQuestion)));

    const toast = await notifications().findByRole('listitem');
    expect(toast).toHaveTextContent('Imported “Ask a question”');
    expect(store.getState().pipeline).toEqual(askQuestion);
    expect(store.getState().history.past.map((entry) => entry.label)).toEqual([
      'Import “Ask a question”',
    ]);
    store.getState().undo();
    expect(store.getState().pipeline).toBe(draft);
  });

  it('offers to undo an import that replaced nodes', async () => {
    const { store, user, choose } = renderImport();
    await choose(jsonFile(serializePipeline(askQuestion)));

    await user.click(await findUndoAction());

    expect(store.getState().pipeline).toBe(draft);
    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('offers no undo when the replaced pipeline was empty', async () => {
    const { choose } = renderImport(createEmptyPipeline({ id: 'draft', name: 'Draft' }));

    await choose(jsonFile(serializePipeline(askQuestion)));

    const toast = await notifications().findByRole('listitem');
    expect(toast).toHaveTextContent('Imported “Ask a question”');
    expect(within(toast).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('undoes nothing else from the toast once the pipeline has changed again', async () => {
    const { store, user, choose } = renderImport();
    await choose(jsonFile(serializePipeline(askQuestion)));
    const undo = await findUndoAction();
    store.getState().renameNode('question', 'Topic');
    const renamed = store.getState().pipeline;

    await user.click(undo);

    expect(store.getState().pipeline).toBe(renamed);
  });

  it('says how many connections it had to remove', async () => {
    const { store, choose } = renderImport();
    const dangling = {
      id: 'e2',
      source: 'question',
      sourcePort: 'value',
      target: 'gone',
      targetPort: 'value',
    };

    await choose(jsonFile(fileText({ edges: [...askQuestion.edges, dangling] })));

    expect(await notifications().findByRole('listitem')).toHaveTextContent(
      '1 connection that pointed at a missing node or an occupied input was removed.',
    );
    expect(store.getState().pipeline.edges.map((edge) => edge.id)).toEqual(['e1']);
  });

  it.each([
    ['text that is not JSON', '{"nodes": [', 'The file is not valid JSON.'],
    ['JSON of something else', '{"name": "Notes"}', 'It is not a Pipeline Builder file.'],
    [
      'a file from a newer version',
      fileText({ schemaVersion: 99 }),
      'It was saved by a newer version of Pipeline Builder (schema version 99). Reload the page to update the app.',
    ],
    [
      'a file with an invalid field',
      fileText({ name: 42 }),
      'The pipeline is invalid at name: Invalid input: expected string, received number.',
    ],
    [
      'a file with a node id used twice',
      fileText({ nodes: [...askQuestion.nodes, askQuestion.nodes[0]] }),
      'The id “question” is used by two nodes.',
    ],
  ])('leaves the pipeline as it was and explains %s', async (_, text, reason) => {
    const { store, choose } = renderImport();

    await choose(jsonFile(text, 'broken.json'));

    const toast = await notifications().findByRole('listitem');
    expect(toast).toHaveTextContent('Couldn’t import “broken.json”');
    expect(toast).toHaveTextContent(reason);
    expect(store.getState().pipeline).toBe(draft);
    expect(store.getState().history).toBe(EMPTY_HISTORY);
  });

  it('explains a file that cannot be read', async () => {
    const { store, choose } = renderImport();
    const file = jsonFile(serializePipeline(askQuestion));
    vi.spyOn(file, 'text').mockRejectedValue(new DOMException('Gone', 'NotFoundError'));

    await choose(file);

    const toast = await notifications().findByRole('listitem');
    expect(toast).toHaveTextContent('Couldn’t import “ask.pipeline.json”');
    expect(toast).toHaveTextContent('The file could not be read.');
    expect(store.getState().pipeline).toBe(draft);
  });

  it('lets the same file be chosen again', async () => {
    const { store, input, choose } = renderImport();
    const file = jsonFile(serializePipeline(askQuestion));

    await choose(file);
    await notifications().findByRole('listitem');

    // A browser reports a change only when the chosen file differs from the input's value.
    expect(input.value).toBe('');
    await choose(file);
    expect(await notifications().findAllByRole('listitem')).toHaveLength(2);
    expect(store.getState().history.past).toHaveLength(2);
  });
});
