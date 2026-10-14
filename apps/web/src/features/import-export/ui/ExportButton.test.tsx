import { addNode, createEmptyPipeline, serializePipeline } from '@pipeline-builder/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { ExportButton } from './ExportButton';

// jsdom has no object URLs, and it cannot follow a link to download a file.
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:exported-pipeline');
const revokeObjectURL = vi.fn<(url: string) => void>();
/** Links that were clicked: where they pointed, and whether they were in the document then. */
const clickedLinks: { href: string; download: string; inDocument: boolean }[] = [];

const OBJECT_URL_METHODS = ['createObjectURL', 'revokeObjectURL'] as const;
const originalObjectUrlMethods = OBJECT_URL_METHODS.map(
  (name) => [name, Object.getOwnPropertyDescriptor(URL, name)] as const,
);

beforeEach(() => {
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL },
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedLinks.push({ href: this.href, download: this.download, inDocument: this.isConnected });
  });
});

afterEach(() => {
  for (const [name, descriptor] of originalObjectUrlMethods) {
    if (descriptor === undefined) Reflect.deleteProperty(URL, name);
    else Object.defineProperty(URL, name, descriptor);
  }
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clickedLinks.length = 0;
  vi.restoreAllMocks();
});

function renderExport() {
  const pipeline = addNode(createEmptyPipeline({ id: 'draft', name: 'Ask: a question?' }), {
    kind: 'prompt',
    id: 'prompt',
    position: { x: 0, y: 0 },
  }).pipeline;
  const store = createPipelineStore(pipeline);
  render(
    <TooltipProvider delayDuration={0}>
      <PipelineStoreProvider store={store}>
        <ExportButton />
      </PipelineStoreProvider>
    </TooltipProvider>,
  );
  return { store, user: userEvent.setup() };
}

describe('ExportButton', () => {
  it('downloads the pipeline as it is now, as a pipeline file named after it', async () => {
    const { store, user } = renderExport();
    store.getState().renameNode('prompt', 'Ask the model');

    await user.click(screen.getByRole('button', { name: 'Export pipeline' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const [blob] = createObjectURL.mock.calls[0] ?? [];
    expect(blob?.type).toBe('application/json');
    expect(await blob?.text()).toBe(serializePipeline(store.getState().pipeline));
    expect(clickedLinks).toEqual([
      {
        href: 'blob:exported-pipeline',
        download: 'Ask- a question-.pipeline.json',
        inDocument: true,
      },
    ]);
  });

  it('removes the link and releases the file once the download has started', async () => {
    const { user } = renderExport();
    const appended = vi.spyOn(document.body, 'append');

    await user.click(screen.getByRole('button', { name: 'Export pipeline' }));

    const [link] = appended.mock.calls[0] ?? [];
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link).not.toBeInTheDocument();
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:exported-pipeline');
    });
  });

  it('names the button in its tooltip', async () => {
    const { user } = renderExport();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Export pipeline' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Export pipeline');
  });
});
