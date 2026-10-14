import {
  addNode,
  createEmptyPipeline,
  type NodeKind,
  type Pipeline,
  serializePipeline,
} from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, spyOn, waitFor, within } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';

import { ExportButton } from './ExportButton';
import { ImportButton } from './ImportButton';

/** A pipeline named `name` with one node of each kind in `kinds`, in a row. */
function pipelineOf(name: string, kinds: readonly NodeKind[]): Pipeline {
  return kinds.reduce(
    (pipeline, kind, index) =>
      addNode(pipeline, {
        kind,
        id: `${kind}-${String(index)}`,
        position: { x: index * 320, y: 0 },
      }).pipeline,
    createEmptyPipeline({ id: name, name }),
  );
}

const ASK_A_QUESTION = pipelineOf('Ask a question', ['input', 'prompt', 'llm-call', 'output']);

function jsonFile(text: string, name: string): File {
  return new File([text], name, { type: 'application/json' });
}

/** The pipeline's name and node labels, so stories can see what an import changed. */
function PipelineSummary() {
  const pipeline = usePipelineStore((state) => state.pipeline);
  return (
    <p role="status" className="text-xs text-fg-muted">
      {pipeline.name}: {pipeline.nodes.map((node) => node.label).join(', ') || 'no nodes'}
    </p>
  );
}

/** The buttons in a File toolbar over a pipeline of their own, which starts with `kinds`. */
function ImportExportPreview({ kinds }: { kinds: readonly NodeKind[] }) {
  const store = useMemo(() => createPipelineStore(pipelineOf('Story pipeline', kinds)), [kinds]);
  return (
    <PipelineStoreProvider store={store}>
      <div className="flex flex-col items-start gap-2">
        <div role="toolbar" aria-label="File" className="flex gap-1">
          <ImportButton />
          <ExportButton />
        </div>
        <PipelineSummary />
      </div>
    </PipelineStoreProvider>
  );
}

/** The toast region lives outside the story canvas, at the bottom of the page. */
function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

const meta = {
  title: 'features/ImportExport',
  component: ImportExportPreview,
  args: { kinds: ['input', 'output'] },
} satisfies Meta<typeof ImportExportPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Import pipeline' })).toHaveFocus();
    // The tooltip is portalled to <body>, outside the story canvas.
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Import pipeline');
  },
};

export const Export: Story = {
  play: async ({ canvas, userEvent }) => {
    // The download link is recorded instead of followed, so the story saves no file.
    const links: { download: string; href: string }[] = [];
    const click = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      links.push({ download: this.download, href: this.href });
    });
    const createObjectURL = spyOn(URL, 'createObjectURL');
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Export pipeline' }));

      await expect(links.map((link) => link.download)).toEqual(['Story pipeline.pipeline.json']);
      await expect(links[0]?.href).toMatch(/^blob:/);
      const [file] = createObjectURL.mock.calls[0] ?? [];
      if (!(file instanceof Blob)) throw new Error('No file was exported');
      await expect(file.type).toBe('application/json');
      await expect(await file.text()).toContain('"name": "Story pipeline"');
    } finally {
      click.mockRestore();
      createObjectURL.mockRestore();
    }
  },
};

export const ImportFile: Story = {
  args: { kinds: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      canvas.getByLabelText('Pipeline file'),
      jsonFile(serializePipeline(ASK_A_QUESTION), 'ask.pipeline.json'),
    );

    await expect(await notifications().findByRole('listitem')).toHaveTextContent(
      'Imported “Ask a question”',
    );
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Ask a question: Input 1, Prompt 1, LLM Call 1, Output 1',
    );
  },
};

export const UndoImport: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      canvas.getByLabelText('Pipeline file'),
      jsonFile(serializePipeline(ASK_A_QUESTION), 'ask.pipeline.json'),
    );
    // The import replaced nodes, so the toast offers to bring them back.
    const undo = await notifications().findByRole('button', { name: 'Undo' });
    await expect(canvas.getByRole('status')).toHaveTextContent(/^Ask a question:/);

    await userEvent.click(undo);

    await expect(canvas.getByRole('status')).toHaveTextContent('Story pipeline: Input 1, Output 1');
    await waitFor(() => expect(notifications().queryByRole('listitem')).not.toBeInTheDocument());
  },
};

export const ImportInvalidFile: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      canvas.getByLabelText('Pipeline file'),
      jsonFile('{"nodes": [', 'notes.json'),
    );

    const toast = await notifications().findByRole('listitem');
    await expect(toast).toHaveTextContent('Couldn’t import “notes.json”');
    await expect(toast).toHaveTextContent('The file is not valid JSON.');
    await expect(canvas.getByRole('status')).toHaveTextContent('Story pipeline: Input 1, Output 1');
  },
};
