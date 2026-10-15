import {
  type AbortSignalLike,
  addNode,
  type LlmClient,
  type LlmProvider,
  mockCompletion,
  type Pipeline,
  PIPELINE_TEMPLATES,
  splitIntoTokens,
} from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, waitFor } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { createRunStore, RunStoreProvider, useRunStore } from '@/entities/run';

import { RunControls } from './RunControls';

/** "Ask a question": Question → Answer prompt → Model → Answer, with Model on `provider`. */
function askPipeline(provider: LlmProvider = 'mock'): Pipeline {
  const template = PIPELINE_TEMPLATES.find(({ id }) => id === 'ask-a-question');
  if (template === undefined) throw new Error('The "Ask a question" template is missing');
  return {
    ...template.pipeline,
    nodes: template.pipeline.nodes.map((node) =>
      node.kind === 'llm-call' ? { ...node, data: { ...node.data, provider } } : node,
    ),
  };
}

const PIPELINES = {
  /** Runs on the mock provider. */
  valid: askPipeline(),
  /** Has a Prompt whose input is not connected. */
  withErrors: addNode(askPipeline(), {
    kind: 'prompt',
    id: 'loose',
    position: { x: 0, y: 400 },
  }).pipeline,
  /** Runs on Anthropic, with the user's API key. */
  needsApiKey: askPipeline('anthropic'),
} satisfies Record<string, Pipeline>;

/** Milliseconds between two tokens of a story's answer. */
const TOKEN_DELAY_MS = 20;

/**
 * Streams the mock provider's answer token by token, without a proxy; with `stall`, the stream
 * then waits until the run is stopped.
 */
function storyLlm({ stall }: { stall: boolean }): LlmClient {
  /** Resolves after `ms` milliseconds, or never with `ms` null, or as soon as `signal` aborts. */
  const wait = (ms: number | null, signal: AbortSignalLike) =>
    new Promise<void>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer =
        ms === null
          ? undefined
          : setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              resolve();
            }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  return {
    async *stream(request, signal) {
      for (const token of splitIntoTokens(mockCompletion(request))) {
        await wait(TOKEN_DELAY_MS, signal);
        if (signal.aborted) return;
        yield token;
      }
      if (stall && !signal.aborted) await wait(null, signal);
    },
  };
}

/** How each node of the run is doing, until the canvas shows it on the nodes. */
function NodeStatuses({ pipeline }: { pipeline: Pipeline }) {
  const nodes = useRunStore((state) => state.nodes);
  const status = useRunStore((state) => state.status);
  return (
    <div className="flex flex-col gap-1 text-xs text-fg-muted">
      <p>Run: {status}</p>
      <ul>
        {pipeline.nodes.map((node) => (
          <li key={node.id}>
            {node.label}: {nodes.get(node.id)?.status ?? 'idle'}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RunControlsPreviewProps {
  pipeline: keyof typeof PIPELINES;
  /** Whether the answer stalls after its last token, so the run goes on until it is stopped. */
  stall: boolean;
  onMissingApiKey: (provider: LlmProvider) => void;
}

/** The controls in a "Run" toolbar over a pipeline and a run of their own. */
function RunControlsPreview({ pipeline, stall, onMissingApiKey }: RunControlsPreviewProps) {
  const [stores] = useState(() => ({
    pipeline: createPipelineStore(PIPELINES[pipeline]),
    run: createRunStore(),
  }));
  const [llm] = useState(() => storyLlm({ stall }));
  return (
    <PipelineStoreProvider store={stores.pipeline}>
      <RunStoreProvider store={stores.run}>
        <div className="flex flex-col items-start gap-3">
          <div role="toolbar" aria-label="Run" className="flex items-center gap-1">
            <RunControls llm={llm} onMissingApiKey={onMissingApiKey} />
          </div>
          <NodeStatuses pipeline={PIPELINES[pipeline]} />
        </div>
      </RunStoreProvider>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'features/RunControls',
  component: RunControlsPreview,
  args: { pipeline: 'valid', stall: false, onMissingApiKey: fn() },
  argTypes: {
    pipeline: { control: 'radio', options: Object.keys(PIPELINES) },
  },
} satisfies Meta<typeof RunControlsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Run' })).not.toHaveAttribute('aria-disabled');
    await expect(canvas.getByRole('button', { name: 'Stop' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};

/** Run stays focusable and says why it is unavailable, in its tooltip and its description. */
export const UnavailableWithErrors: Story = {
  args: { pipeline: 'withErrors' },
  play: async ({ canvas, userEvent }) => {
    const run = canvas.getByRole('button', { name: 'Run' });
    await expect(run).toHaveAttribute('aria-disabled', 'true');
    await expect(run).toHaveAccessibleDescription('Fix 1 error to run');

    await userEvent.tab();

    await expect(run).toHaveFocus();
    // The tooltip is portalled to <body>, outside the story canvas.
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Fix 1 error to run');
  },
};

/** A run in progress until Stop: Run is unavailable, Stop available. */
export const Running: Story = {
  args: { stall: true },
  play: async ({ canvas, userEvent }) => {
    const run = canvas.getByRole('button', { name: 'Run' });
    const stop = canvas.getByRole('button', { name: 'Stop' });

    await userEvent.click(run);

    await expect(canvas.getByRole('status')).toHaveTextContent('Run started');
    await expect(run).toHaveAccessibleDescription('The pipeline is running');
    await expect(stop).not.toHaveAttribute('aria-disabled');
    await waitFor(() => expect(canvas.getByText('Model: running')).toBeVisible());
  },
};

export const Stopped: Story = {
  args: { stall: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(canvas.getByText('Model: running')).toBeVisible());

    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }));

    await expect(canvas.getByRole('status')).toHaveTextContent('Run stopped');
    await expect(canvas.getByText('Model: cancelled')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Stop' })).toHaveFocus();
  },
};

export const Finished: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }));

    // The answer streams a token at a time, for a second or so.
    await waitFor(
      () => expect(canvas.getByRole('status')).toHaveTextContent('Run finished: 4 nodes done'),
      { timeout: 5000 },
    );
    await expect(canvas.getByText('Answer: done')).toBeVisible();
  },
};

/** A run that needs a key the user has not added asks for it instead of starting. */
export const AsksForApiKey: Story = {
  args: { pipeline: 'needsApiKey' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }));

    await expect(args.onMissingApiKey).toHaveBeenCalledWith('anthropic');
    await expect(canvas.getByRole('button', { name: 'Run' })).toHaveFocus();
    await expect(canvas.getByText('Run: idle')).toBeVisible();
  },
};
