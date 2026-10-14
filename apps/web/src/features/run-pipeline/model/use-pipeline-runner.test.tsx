import type * as Core from '@pipeline-builder/core';
import {
  type AbortSignalLike,
  addNode,
  type LlmClient,
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type Pipeline,
  PIPELINE_TEMPLATES,
  type RunOptions,
} from '@pipeline-builder/core';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearApiKey, saveApiKey } from '@/entities/api-key';
import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { createRunStore, RunStoreProvider } from '@/entities/run';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { usePipelineRunner } from './use-pipeline-runner';

// `breakAfter` makes the engine's `onEvent` throw after that many events, the way a bug in the
// caller would: `runPipeline` then rejects.
const engine = vi.hoisted(() => ({ breakAfter: null as number | null }));

vi.mock('@pipeline-builder/core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  return {
    ...core,
    runPipeline: (pipeline: Pipeline, options: RunOptions) => {
      const { breakAfter } = engine;
      if (breakAfter === null) return core.runPipeline(pipeline, options);
      let reported = 0;
      return core.runPipeline(pipeline, {
        ...options,
        onEvent: (event) => {
          if (reported === breakAfter) throw new Error('A bug in the caller');
          reported += 1;
          options.onEvent(event);
        },
      });
    },
  };
});

/** A response the test streams chunk by chunk. */
interface FakeStream {
  readonly request: LlmRequest;
  readonly signal: AbortSignalLike;
  send: (text: string) => void;
  end: () => void;
  fail: (error: unknown) => void;
}

/** An LLM client whose streams the test drives; it records each one in `streams`. */
function createFakeLlm() {
  const streams: FakeStream[] = [];
  const llm: LlmClient = {
    stream(request, signal) {
      const state = {
        chunks: [] as string[],
        ended: false,
        failure: null as { readonly error: unknown } | null,
        wake: null as (() => void) | null,
      };
      const notify = () => {
        state.wake?.();
        state.wake = null;
      };
      signal.addEventListener('abort', notify);
      streams.push({
        request,
        signal,
        send: (text) => {
          state.chunks.push(text);
          notify();
        },
        end: () => {
          state.ended = true;
          notify();
        },
        fail: (error) => {
          state.failure = { error };
          notify();
        },
      });
      return (async function* () {
        for (;;) {
          if (signal.aborted) return;
          const chunk = state.chunks.shift();
          if (chunk !== undefined) {
            yield chunk;
          } else if (state.failure !== null) {
            throw state.failure.error;
          } else if (state.ended) {
            return;
          } else {
            await new Promise<void>((resolve) => {
              state.wake = resolve;
            });
          }
        }
      })();
    },
  };
  return { llm, streams };
}

/** "Ask a question": Question → Answer prompt → Model (the mock provider) → Answer. */
function askPipeline(provider: LlmProvider = 'mock'): Pipeline {
  const template = PIPELINE_TEMPLATES.find(({ id }) => id === 'ask-a-question');
  if (template === undefined) throw new Error('The "Ask a question" template is missing');
  const { pipeline } = template;
  return {
    ...pipeline,
    nodes: pipeline.nodes.map((node) =>
      node.kind === 'llm-call' ? { ...node, data: { ...node.data, provider } } : node,
    ),
  };
}

/** Lets the engine and the fake streams go as far as they can without the test. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function nextFrame() {
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

function setUp(pipeline: Pipeline = askPipeline()) {
  const pipelineStore = createPipelineStore(pipeline);
  const runStore = createRunStore();
  const { llm, streams } = createFakeLlm();
  const stream = vi.spyOn(llm, 'stream');
  const onMissingApiKey = vi.fn<(provider: LlmProvider) => void>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TooltipProvider>
      <ToastProvider>
        <PipelineStoreProvider store={pipelineStore}>
          <RunStoreProvider store={runStore}>{children}</RunStoreProvider>
        </PipelineStoreProvider>
      </ToastProvider>
    </TooltipProvider>
  );
  const hook = renderHook(() => usePipelineRunner({ llm, onMissingApiKey }), { wrapper });
  const run = async () => {
    act(() => {
      hook.result.current.run();
    });
    await settle();
  };
  const announced = () => hook.result.current.announcement.message;
  const nodeRun = (nodeId: string) => runStore.getState().nodes.get(nodeId);
  return {
    ...hook,
    pipelineStore,
    runStore,
    streams,
    stream,
    onMissingApiKey,
    run,
    announced,
    nodeRun,
  };
}

function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

describe('usePipelineRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    engine.breakAfter = null;
    clearApiKey('anthropic');
  });

  it('runs the pipeline and shows the run in the run store', async () => {
    const { runStore, streams, run, announced, nodeRun } = setUp();

    await run();

    expect(runStore.getState().status).toBe('running');
    expect(announced()).toBe('Run started');
    const [stream] = streams;
    expect(stream?.request).toMatchObject({
      provider: 'mock',
      prompt: 'Answer the question: Why is the sky blue?',
    });
    stream?.send('Because of ');
    stream?.send('Rayleigh scattering.');
    stream?.end();
    await settle();

    expect(runStore.getState().status).toBe('done');
    expect(nodeRun('model')).toEqual({
      status: 'done',
      text: 'Because of Rayleigh scattering.',
      outputs: { response: 'Because of Rayleigh scattering.' },
    });
    expect(nodeRun('answer')).toMatchObject({
      status: 'done',
      outputs: { value: 'Because of Rayleigh scattering.' },
    });
    expect(announced()).toBe('Run finished: 4 nodes done');
  });

  it('applies the events of a run at most once per animation frame', async () => {
    const { runStore, streams, run, nodeRun } = setUp();
    const changes = vi.fn();
    runStore.subscribe(changes);

    await run();
    // The run started; the first statuses wait for the next frame.
    expect(changes).toHaveBeenCalledTimes(1);
    expect(nodeRun('question')).toBeUndefined();
    nextFrame();
    expect(changes).toHaveBeenCalledTimes(2);
    expect(nodeRun('question')?.status).toBe('done');
    expect(nodeRun('model')?.status).toBe('running');

    const [stream] = streams;
    for (const token of ['The ', 'sky ', 'scatters ', 'light.']) {
      stream?.send(token);
      await settle();
    }
    expect(changes).toHaveBeenCalledTimes(2);
    expect(nodeRun('model')?.text).toBe('');
    nextFrame();
    expect(changes).toHaveBeenCalledTimes(3);
    expect(nodeRun('model')?.text).toBe('The sky scatters light.');

    // The end of the run is applied at once, without waiting for a frame.
    stream?.end();
    await settle();
    expect(changes).toHaveBeenCalledTimes(4);
    expect(runStore.getState().status).toBe('done');
  });

  it('keeps running the pipeline it started with while the user edits', async () => {
    const { pipelineStore, runStore, streams, run, nodeRun } = setUp();

    await run();
    act(() => {
      pipelineStore.getState().removeElements({ nodeIds: ['answer'] });
      pipelineStore.getState().renameNode('model', 'Renamed');
    });
    streams[0]?.send('Blue.');
    streams[0]?.end();
    await settle();

    expect(runStore.getState().status).toBe('done');
    expect(nodeRun('answer')?.status).toBe('done');
  });

  it('stops the run', async () => {
    const { result, runStore, streams, run, announced, nodeRun } = setUp();
    await run();
    streams[0]?.send('Half an ans');
    await settle();

    act(() => {
      result.current.stop();
    });
    await settle();

    expect(streams[0]?.signal.aborted).toBe(true);
    expect(runStore.getState().status).toBe('cancelled');
    expect(nodeRun('question')?.status).toBe('done');
    expect(nodeRun('model')).toEqual({ status: 'cancelled', text: 'Half an ans' });
    expect(nodeRun('answer')?.status).toBe('cancelled');
    expect(announced()).toBe('Run stopped');
  });

  it('does not start a second run while one is in progress', async () => {
    const { result, stream, run } = setUp();
    await run();

    act(() => {
      result.current.run();
    });
    await settle();

    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('starts a new run from scratch once the last one has ended', async () => {
    const { result, runStore, streams, run, nodeRun } = setUp();
    await run();
    streams[0]?.send('First answer');
    streams[0]?.end();
    await settle();
    expect(nodeRun('model')?.text).toBe('First answer');

    await run();

    expect(runStore.getState().status).toBe('running');
    nextFrame();
    expect(nodeRun('model')).toEqual({ status: 'running', text: '' });
    expect(streams).toHaveLength(2);
    expect(result.current.announcement.message).toBe('Run started');
  });

  it('cancels and forgets the run when the document is replaced', async () => {
    const { pipelineStore, runStore, streams, run, announced } = setUp();
    await run();
    nextFrame();
    expect(runStore.getState().nodes.size).toBe(4);

    act(() => {
      pipelineStore.getState().replacePipeline(askPipeline(), 'template');
    });
    streams[0]?.send('Too late');
    await settle();
    nextFrame();

    expect(streams[0]?.signal.aborted).toBe(true);
    expect(runStore.getState().status).toBe('idle');
    expect(runStore.getState().nodes.size).toBe(0);
    expect(announced()).toBe('Run started');
  });

  it('forgets a finished run when the document is replaced', async () => {
    const { pipelineStore, runStore, streams, run } = setUp();
    await run();
    streams[0]?.end();
    await settle();
    expect(runStore.getState().status).toBe('done');

    act(() => {
      pipelineStore.getState().replacePipeline(askPipeline(), 'import');
    });

    expect(runStore.getState().status).toBe('idle');
  });

  it('keeps the run when the document only changes', async () => {
    const { pipelineStore, runStore, run } = setUp();
    await run();

    act(() => {
      pipelineStore.getState().addNode('output', { x: 0, y: 400 });
    });

    expect(runStore.getState().status).toBe('running');
  });

  it('cancels the run when it unmounts', async () => {
    const { unmount, runStore, streams, run } = setUp();
    await run();

    unmount();

    expect(streams[0]?.signal.aborted).toBe(true);
    expect(runStore.getState().status).toBe('idle');
  });

  it('asks for a missing API key instead of running', async () => {
    const { runStore, stream, onMissingApiKey, run } = setUp(askPipeline('anthropic'));

    await run();

    expect(onMissingApiKey).toHaveBeenCalledWith('anthropic');
    expect(stream).not.toHaveBeenCalled();
    expect(runStore.getState().status).toBe('idle');
  });

  it('runs with a saved API key', async () => {
    saveApiKey('anthropic', 'sk-ant-test', { remember: false });
    const { runStore, stream, onMissingApiKey, run } = setUp(askPipeline('anthropic'));

    await run();

    expect(onMissingApiKey).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(1);
    expect(runStore.getState().status).toBe('running');
  });

  it('does not run a pipeline with errors, and says why', async () => {
    const withError = addNode(askPipeline(), {
      kind: 'prompt',
      id: 'loose',
      position: { x: 0, y: 400 },
    }).pipeline;
    const { runStore, stream, run, announced } = setUp(withError);

    await run();

    expect(stream).not.toHaveBeenCalled();
    expect(runStore.getState().status).toBe('idle');
    expect(announced()).toBe('Fix 1 error to run');
  });

  it('does not run an empty pipeline', async () => {
    const { runStore, run, announced } = setUp({ ...askPipeline(), nodes: [], edges: [] });

    await run();

    expect(runStore.getState().status).toBe('idle');
    expect(announced()).toBe('Add a node to run');
  });

  it('shows the first error in a toast', async () => {
    const { runStore, streams, run, announced } = setUp();
    await run();

    streams[0]?.fail(new LlmError('rate-limited', 'Too many requests. Wait a minute.'));
    await settle();

    expect(runStore.getState().status).toBe('error');
    expect(announced()).toBe('Run failed at Model: Too many requests. Wait a minute.');
    const toast = notifications().getByRole('listitem');
    expect(toast).toHaveTextContent('Run failed');
    expect(toast).toHaveTextContent('Model: Too many requests. Wait a minute.');
    expect(within(toast).queryByRole('button', { name: 'Add API key' })).not.toBeInTheDocument();
  });

  it('offers to add another API key when the provider rejects one', async () => {
    vi.useRealTimers();
    saveApiKey('anthropic', 'sk-ant-revoked', { remember: false });
    const { streams, onMissingApiKey, run } = setUp(askPipeline('anthropic'));
    await run();

    streams[0]?.fail(new LlmError('invalid-key', 'The API key was rejected.'));
    await settle();

    const toast = notifications().getByRole('listitem');
    expect(toast).toHaveTextContent('Model: The API key was rejected.');
    const region = screen.getByRole('region', { name: 'Notifications (F8)' });
    // Radix lets pointer events into the toast region only in an effect after the toast renders.
    await waitFor(() => {
      expect(region).not.toHaveStyle({ pointerEvents: 'none' });
    });
    await userEvent.setup().click(within(toast).getByRole('button', { name: 'Add API key' }));

    expect(onMissingApiKey).toHaveBeenCalledWith('anthropic');
  });

  it('stops and fails a run that breaks off', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The four nodes are queued, the first one runs, and then the caller breaks.
    engine.breakAfter = 5;
    const { runStore, run, announced, nodeRun } = setUp();

    await run();

    expect(runStore.getState().status).toBe('error');
    expect(nodeRun('question')?.status).toBe('cancelled');
    expect(nodeRun('answer')?.status).toBe('cancelled');
    expect(announced()).toBe('Run failed unexpectedly');
    expect(notifications().getByRole('listitem')).toHaveTextContent(
      'Something went wrong while running the pipeline.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'The pipeline run failed unexpectedly',
      new Error('A bug in the caller'),
    );
  });
});
