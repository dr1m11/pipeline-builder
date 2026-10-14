import {
  addNode,
  type LlmClient,
  type LlmProvider,
  type Pipeline,
  PIPELINE_TEMPLATES,
} from '@pipeline-builder/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { createRunStore, RunStoreProvider } from '@/entities/run';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

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

/** A client that answers "Blue." and, with `stall`, then waits until the run is stopped. */
function createLlm({ stall }: { stall: boolean }): LlmClient {
  return {
    async *stream(_request, signal) {
      yield 'Blue.';
      if (!stall) return;
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', resolve, { once: true });
      });
    },
  };
}

function renderControls({
  pipeline = askPipeline(),
  stall = true,
}: { pipeline?: Pipeline; stall?: boolean } = {}) {
  const llm = createLlm({ stall });
  const stream = vi.spyOn(llm, 'stream');
  const runStore = createRunStore();
  const onMissingApiKey = vi.fn<(provider: LlmProvider) => void>();
  render(
    <TooltipProvider delayDuration={0}>
      <ToastProvider>
        <PipelineStoreProvider store={createPipelineStore(pipeline)}>
          <RunStoreProvider store={runStore}>
            <button type="button">Elsewhere</button>
            <RunControls llm={llm} onMissingApiKey={onMissingApiKey} />
          </RunStoreProvider>
        </PipelineStoreProvider>
      </ToastProvider>
    </TooltipProvider>,
  );
  return { runStore, stream, onMissingApiKey, user: userEvent.setup() };
}

const runButton = () => screen.getByRole('button', { name: 'Run' });
const stopButton = () => screen.getByRole('button', { name: 'Stop' });

describe('RunControls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers Run, and Stop only while a run is in progress', () => {
    renderControls();

    expect(runButton()).not.toHaveAttribute('aria-disabled');
    expect(runButton()).not.toHaveAccessibleDescription();
    expect(stopButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('runs and stops the pipeline, announcing both', async () => {
    const { runStore, stream, user } = renderControls();

    await user.click(runButton());

    expect(stream).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Run started');
    expect(runButton()).toHaveAttribute('aria-disabled', 'true');
    expect(runButton()).toHaveAccessibleDescription('The pipeline is running');
    expect(runButton()).toHaveFocus();
    expect(stopButton()).not.toHaveAttribute('aria-disabled');

    await user.click(stopButton());

    expect(runStore.getState().status).toBe('cancelled');
    expect(await screen.findByText('Run stopped')).toBeInTheDocument();
    expect(stopButton()).toHaveAttribute('aria-disabled', 'true');
    expect(stopButton()).toHaveFocus();
    expect(runButton()).not.toHaveAttribute('aria-disabled');
  });

  it('announces how a run finished', async () => {
    const { user } = renderControls({ stall: false });

    await user.click(runButton());

    expect(await screen.findByText('Run finished: 4 nodes done')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Run finished: 4 nodes done');
  });

  it('is unavailable with the reason while the pipeline has errors', async () => {
    const withErrors = addNode(askPipeline(), {
      kind: 'prompt',
      id: 'loose',
      position: { x: 0, y: 400 },
    }).pipeline;
    const { stream, user } = renderControls({ pipeline: withErrors });

    expect(runButton()).toHaveAttribute('aria-disabled', 'true');
    expect(runButton()).toHaveAccessibleDescription('Fix 1 error to run');
    await user.click(runButton());

    expect(stream).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Fix 1 error to run');
  });

  it('tells why Run is unavailable in its tooltip', async () => {
    const { user } = renderControls({ pipeline: { ...askPipeline(), nodes: [], edges: [] } });

    await user.tab();
    await user.tab();

    expect(runButton()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Add a node to run');
  });

  it('shows the shortcuts in the tooltips', async () => {
    const { user } = renderControls();

    await user.tab();
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Run the pipeline Ctrl Enter');
    await user.tab();

    expect(stopButton()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Stop the run Ctrl .');
  });

  it('runs with Ctrl+Enter and stops with Ctrl+.', async () => {
    const { runStore, stream, user } = renderControls();

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(runStore.getState().status).toBe('running');

    await user.keyboard('{Control>}.{/Control}');
    expect(runStore.getState().status).toBe('cancelled');
  });

  it('takes focus before it asks for a missing API key', async () => {
    const { stream, onMissingApiKey, user } = renderControls({
      pipeline: askPipeline('anthropic'),
    });
    onMissingApiKey.mockImplementation(() => {
      expect(runButton()).toHaveFocus();
    });
    act(() => {
      screen.getByRole('button', { name: 'Elsewhere' }).focus();
    });

    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onMissingApiKey).toHaveBeenCalledWith('anthropic');
    expect(onMissingApiKey).toHaveBeenCalledTimes(1);
    expect(stream).not.toHaveBeenCalled();
    expect(runButton()).toHaveFocus();
  });
});
