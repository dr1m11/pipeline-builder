import {
  addNode,
  connect,
  createEmptyPipeline,
  type LlmClient,
  type NodeKind,
  type NodeRunStatus,
  type Pipeline,
  type RunEvent,
  runPipeline,
  updateNodeData,
} from '@pipeline-builder/core';
import { describe, expect, it, vi } from 'vitest';

import { createStepGate } from './step-gate';

function status(nodeId: string, nodeStatus: NodeRunStatus): RunEvent {
  return { type: 'node-status', nodeId, status: nodeStatus };
}

/** Lets the promises that settled run their callbacks. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setUp(stepping: boolean) {
  const onPausedChange = vi.fn<(nodeId: string | null) => void>();
  const gate = createStepGate({ stepping, onPausedChange });
  const started: string[] = [];
  /** Asks the gate to start `nodeId`, as the engine does, and records when it may. */
  const ask = (nodeId: string) => {
    void gate.beforeNode(nodeId).then(() => {
      started.push(nodeId);
    });
  };
  /** Reports that `nodeId` ran and ended with `ending`. */
  const end = (nodeId: string, ending: NodeRunStatus = 'done') => {
    gate.observe(status(nodeId, 'running'));
    gate.observe(status(nodeId, ending));
  };
  const pauses = () => onPausedChange.mock.calls.map(([nodeId]) => nodeId);
  return { gate, ask, end, started, pauses };
}

describe('createStepGate', () => {
  it('lets every node start at once when not stepping', async () => {
    const { ask, started, pauses } = setUp(false);

    ask('a');
    ask('b');
    await settle();

    expect(started).toEqual(['a', 'b']);
    expect(pauses()).toEqual([]);
  });

  it('pauses before each node, and lets one start per step', async () => {
    const { gate, ask, end, started, pauses } = setUp(true);

    ask('a');
    await settle();
    expect(started).toEqual([]);
    expect(pauses()).toEqual(['a']);

    gate.next();
    await settle();
    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null]);

    end('a');
    ask('b');
    await settle();
    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null, 'b']);

    gate.next();
    await settle();
    expect(started).toEqual(['a', 'b']);
  });

  it('pauses before the next waiting node only once the node it let through has ended', async () => {
    const { gate, ask, end, started, pauses } = setUp(true);
    // Two independent branches: the engine starts both, and they wait in the order they came.
    ask('left');
    ask('right');
    await settle();
    expect(pauses()).toEqual(['left']);

    gate.next();
    await settle();
    expect(started).toEqual(['left']);
    expect(pauses()).toEqual(['left', null]);
    // Still running: Next does nothing.
    gate.next();
    await settle();
    expect(started).toEqual(['left']);

    end('left', 'error');
    expect(pauses()).toEqual(['left', null, 'right']);
    gate.next();
    await settle();
    expect(started).toEqual(['left', 'right']);
  });

  it('lets every waiting node start when stepping stops, and pauses no more', async () => {
    const { gate, ask, started, pauses } = setUp(true);
    ask('left');
    ask('right');
    await settle();

    gate.setStepping(false);
    ask('later');
    await settle();

    expect(started).toEqual(['left', 'right', 'later']);
    expect(pauses()).toEqual(['left', null]);
  });

  it('starts pausing when stepping starts, once the nodes it let through have ended', async () => {
    const { gate, ask, end, started, pauses } = setUp(false);
    ask('a');
    await settle();

    gate.setStepping(true);
    ask('b');
    await settle();
    expect(started).toEqual(['a']);
    expect(pauses()).toEqual([]);

    end('a');
    expect(pauses()).toEqual(['b']);
    gate.next();
    await settle();
    expect(started).toEqual(['a', 'b']);
  });

  it('ignores a change of stepping to what it already is', async () => {
    const { gate, ask, pauses } = setUp(true);
    ask('a');
    await settle();

    gate.setStepping(true);

    expect(pauses()).toEqual(['a']);
  });

  it('does nothing more once the run is cancelled', async () => {
    const { gate, ask, started, pauses } = setUp(true);
    ask('left');
    ask('right');
    await settle();
    gate.next();
    await settle();

    // Stopped while `left` runs: its cancellation must not pause before `right`.
    gate.observe(status('left', 'cancelled'));
    gate.observe(status('right', 'cancelled'));
    gate.next();
    gate.setStepping(false);
    await settle();

    expect(started).toEqual(['left']);
    expect(pauses()).toEqual(['left', null]);
  });

  it('does nothing more once the run has finished', async () => {
    const { gate, ask, end, started, pauses } = setUp(true);
    ask('a');
    await settle();
    gate.next();
    await settle();
    end('a');

    gate.observe({ type: 'run-finished', status: 'done' });
    gate.setStepping(false);
    gate.next();
    await settle();

    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null]);
  });

  it('ignores the ends of nodes it did not let through', async () => {
    const { gate, ask, started, pauses } = setUp(true);
    ask('a');
    await settle();
    gate.next();
    await settle();
    ask('b');

    // A node skipped below another, or one that never asked, does not end the step.
    gate.observe(status('elsewhere', 'skipped'));
    gate.observe(status('elsewhere', 'done'));
    await settle();

    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null]);
  });
});

/** A node of a test pipeline: its kind, its id, and the data it differs in from the default. */
interface NodeSpec {
  readonly kind: NodeKind;
  readonly id: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** A pipeline of `nodes` and of edges written as ['source.port', 'target.port']. */
function pipelineOf(
  nodes: readonly NodeSpec[],
  edges: readonly (readonly [string, string])[],
): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'test', name: 'Test' });
  for (const { kind, id, data } of nodes) {
    pipeline = addNode(pipeline, { kind, id, position: { x: 0, y: 0 } }).pipeline;
    if (data === undefined) continue;
    const updated = updateNodeData(pipeline, id, data);
    if (!updated.ok) throw new Error(`Invalid data for ${id}: ${updated.error}`);
    pipeline = updated.value;
  }
  for (const [from, to] of edges) {
    const [source = '', sourcePort = ''] = from.split('.');
    const [target = '', targetPort = ''] = to.split('.');
    const connected = connect(
      pipeline,
      { source, sourcePort, target, targetPort },
      `${from}-${to}`,
    );
    if (!connected.ok) throw new Error(`Cannot connect ${from} to ${to}: ${connected.error}`);
    pipeline = connected.value.pipeline;
  }
  return pipeline;
}

const question = (id: string): NodeSpec => ({ kind: 'input', id, data: { value: `${id}?` } });

/** `count` independent branches, Input → LLM Call → Output: q1 → m1 → o1, q2 → m2 → o2… */
function branches(count: number): Pipeline {
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1));
  return pipelineOf(
    numbers.flatMap((n): NodeSpec[] => [
      question(`q${n}`),
      { kind: 'llm-call', id: `m${n}` },
      { kind: 'output', id: `o${n}` },
    ]),
    numbers.flatMap((n) => [
      [`q${n}.value`, `m${n}.prompt`],
      [`m${n}.response`, `o${n}.value`],
    ]),
  );
}

/** An LLM client whose answers each wait until the test lets them come. */
function controllableLlm() {
  /** The requests in flight, oldest first, with what lets each answer. */
  const inFlight: { readonly prompt: string; readonly answer: () => void }[] = [];
  const llm: LlmClient = {
    async *stream(request) {
      await new Promise<void>((resolve) => {
        inFlight.push({ prompt: request.prompt, answer: resolve });
      });
      yield `Answer to ${request.prompt}`;
    },
  };
  return { llm, inFlight };
}

/** Runs `pipeline` with the real engine, at its default concurrency, through a step gate. */
function runThroughGate(pipeline: Pipeline, stepping: boolean) {
  const { llm, inFlight } = controllableLlm();
  const controller = new AbortController();
  const pauses: (string | null)[] = [];
  const events: RunEvent[] = [];
  const working = new Set<string>();
  const started: string[] = [];
  let mostAtOnce = 0;
  const gate = createStepGate({
    stepping,
    onPausedChange: (nodeId) => {
      pauses.push(nodeId);
    },
  });
  const result = runPipeline(pipeline, {
    llm,
    signal: controller.signal,
    beforeNode: gate.beforeNode,
    onEvent: (event) => {
      events.push(event);
      gate.observe(event);
      if (event.type !== 'node-status') return;
      if (event.status === 'running') {
        started.push(event.nodeId);
        working.add(event.nodeId);
        mostAtOnce = Math.max(mostAtOnce, working.size);
      } else {
        working.delete(event.nodeId);
      }
    },
  });
  const finished = () => events.at(-1)?.type === 'run-finished';
  return {
    gate,
    inFlight,
    controller,
    result,
    started,
    finished,
    /** The nodes the gate paused before, in order. */
    pausedBefore: () => pauses.filter((nodeId) => nodeId !== null),
    lastPause: () => pauses.at(-1) ?? null,
    pauseCount: () => pauses.length,
    mostAtOnce: () => mostAtOnce,
    statusOf: (nodeId: string) =>
      events.findLast(
        (event): event is Extract<RunEvent, { type: 'node-status' }> =>
          event.type === 'node-status' && event.nodeId === nodeId,
      )?.status,
  };
}

/** Lets the run go as far as it can: the engine, the gate and the answers that came. */
async function settleMany(times = 10) {
  for (let count = 0; count < times; count += 1) await settle();
}

/**
 * Takes a run to its end as a user would, one step at a time: Next step at each pause, and
 * otherwise the oldest answer in flight comes.
 */
async function stepToEnd(run: ReturnType<typeof runThroughGate>) {
  for (let count = 0; count < 500 && !run.finished(); count += 1) {
    await settle();
    if (run.lastPause() !== null) run.gate.next();
    else run.inFlight.shift()?.answer();
  }
  if (!run.finished()) throw new Error('The run did not finish');
}

/** The order in which the engine starts the nodes of `pipeline` one at a time, without a gate. */
async function oneAtATimeOrder(pipeline: Pipeline): Promise<string[]> {
  const started: string[] = [];
  await runPipeline(pipeline, {
    llm: {
      async *stream(request) {
        await Promise.resolve();
        yield `Answer to ${request.prompt}`;
      },
    },
    signal: new AbortController().signal,
    maxConcurrency: 1,
    onEvent: (event) => {
      if (event.type === 'node-status' && event.status === 'running') started.push(event.nodeId);
    },
  });
  return started;
}

describe('createStepGate with the engine at its default concurrency', () => {
  it('runs one node at a time, in the order the engine makes them ready', async () => {
    // Five branches: more ready nodes than the engine's four places.
    const pipeline = branches(5);
    const run = runThroughGate(pipeline, true);

    await stepToEnd(run);

    const result = await run.result;
    expect(result.ok && result.value.status).toBe('done');
    expect(run.mostAtOnce()).toBe(1);
    expect(run.pausedBefore()).toEqual(run.started);
    expect(run.started).toHaveLength(15);
    expect(run.started).toEqual(await oneAtATimeOrder(pipeline));
  });

  it('goes on past the branch a Condition does not take', async () => {
    const pipeline = pipelineOf(
      [
        { kind: 'input', id: 'review', data: { value: 'Cold food.' } },
        { kind: 'condition', id: 'check', data: { operator: 'contains', operand: 'great' } },
        { kind: 'output', id: 'praise' },
        { kind: 'transform', id: 'tidy', data: { operation: 'trim' } },
        { kind: 'output', id: 'complaint' },
      ],
      [
        ['review.value', 'check.value'],
        ['check.true', 'praise.value'],
        ['check.false', 'tidy.value'],
        ['tidy.result', 'complaint.value'],
      ],
    );
    const run = runThroughGate(pipeline, true);

    await stepToEnd(run);

    const result = await run.result;
    expect(result.ok && result.value.status).toBe('done');
    expect(run.pausedBefore()).toEqual(['review', 'check', 'tidy', 'complaint']);
    expect(run.statusOf('praise')).toBe('skipped');
    expect(run.mostAtOnce()).toBe(1);
  });

  it('pauses before the next node when the one it let through fails at once', async () => {
    const pipeline = pipelineOf(
      [
        { kind: 'input', id: 'data', data: { valueType: 'json', value: '{"a":1}' } },
        { kind: 'transform', id: 'lookup', data: { operation: 'get-field', path: 'b' } },
        { kind: 'output', id: 'found' },
        { kind: 'input', id: 'other', data: { value: 'Hello' } },
        { kind: 'output', id: 'echo' },
      ],
      [
        ['data.value', 'lookup.value'],
        ['lookup.result', 'found.value'],
        ['other.value', 'echo.value'],
      ],
    );
    const run = runThroughGate(pipeline, true);

    await stepToEnd(run);

    // `echo` waits at the gate while `lookup` runs and fails.
    expect(run.pausedBefore()).toEqual(['data', 'other', 'lookup', 'echo']);
    expect(run.statusOf('lookup')).toBe('error');
    expect(run.statusOf('found')).toBe('skipped');
    expect(run.statusOf('echo')).toBe('done');
    const result = await run.result;
    expect(result.ok && result.value.status).toBe('error');
    expect(run.mostAtOnce()).toBe(1);
  });

  it('runs the branches at once again when stepping stops (Continue)', async () => {
    const run = runThroughGate(branches(5), true);
    await settleMany();
    expect(run.lastPause()).toBe('q1');

    run.gate.setStepping(false);
    await settleMany();

    // As many requests as the engine's places, all in flight together.
    expect(run.inFlight).toHaveLength(4);
    expect(run.pausedBefore()).toEqual(['q1']);
    while (!run.finished()) {
      run.inFlight.shift()?.answer();
      await settle();
    }
    const result = await run.result;
    expect(result.ok && result.value.status).toBe('done');
    expect(run.mostAtOnce()).toBe(4);
  });

  it('pauses, once stepping starts during a run, only when every node in flight has ended', async () => {
    const run = runThroughGate(branches(5), false);
    await settleMany();
    expect(run.inFlight).toHaveLength(4);

    run.gate.setStepping(true);
    run.inFlight.shift()?.answer();
    await settleMany();

    // Three models still answer; the nodes ready meanwhile wait at the gate.
    expect(run.pausedBefore()).toEqual([]);
    while (run.inFlight.length > 0) run.inFlight.shift()?.answer();
    await settleMany();
    expect(run.lastPause()).not.toBeNull();

    await stepToEnd(run);
    const result = await run.result;
    expect(result.ok && result.value.status).toBe('done');
  });

  it('pauses no more once stopped while paused, and the run ends cancelled', async () => {
    const run = runThroughGate(branches(5), true);
    await settleMany();
    run.gate.next();
    await settleMany();
    expect(run.lastPause()).toBe('q2');
    const pauses = run.pauseCount();

    run.controller.abort();
    const result = await run.result;
    await settleMany();

    expect(result.ok && result.value.status).toBe('cancelled');
    expect(run.pauseCount()).toBe(pauses);
    expect(run.statusOf('q2')).toBe('cancelled');
    expect(run.started).toEqual(['q1']);
  });
});
