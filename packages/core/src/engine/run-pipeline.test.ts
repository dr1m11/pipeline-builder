import { describe, expect, it } from 'vitest';

import type { AbortSignalLike, LlmClient } from '../llm/llm-client';
import { LlmError } from '../llm/llm-error';
import { LLM_REQUEST_SCHEMA, type LlmRequest } from '../llm/llm-request';
import { mockCompletion, splitIntoTokens } from '../llm/mock-completion';
import {
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineNode,
} from '../nodes/registry';
import { createEmptyPipeline, type Pipeline, type PipelineEdge } from '../pipeline';
import { PIPELINE_TEMPLATES } from '../pipeline-templates/pipeline-templates';
import { err, ok } from '../result';
import { validatePipeline } from '../validation/validate-pipeline';
import type { NodeValues } from './evaluate-node';
import {
  type NodeRunError,
  type NodeRunStatus,
  type RunEvent,
  type RunOptions,
  type RunOutcome,
  runPipeline,
  type SkipReason,
} from './run-pipeline';

// Pipelines

const ORIGIN = { x: 0, y: 0 };

/** A node with the default data of its kind and `data` over it, labelled with its id. */
function node<K extends NodeKind>(
  kind: K,
  id: string,
  data: Partial<NodeDataMap[K]> = {},
): NodeOfKind<K> {
  return {
    id,
    kind,
    label: id,
    position: ORIGIN,
    data: { ...NODE_DEFINITIONS[kind].createData(), ...data },
  };
}

const textInput = (id: string, value: string) => node('input', id, { valueType: 'text', value });
const jsonInput = (id: string, value: string) => node('input', id, { valueType: 'json', value });
const promptNode = (id: string, template: string) => node('prompt', id, { template });
const llmNode = (id: string) => node('llm-call', id);
const getField = (id: string, path: string) =>
  node('transform', id, { operation: 'get-field', path });
const outputNode = (id: string) => node('output', id);

/** An edge from `"source.port"` to `"target.port"`. */
function link(from: string, to: string): PipelineEdge {
  const [source = '', sourcePort = ''] = from.split('.');
  const [target = '', targetPort = ''] = to.split('.');
  return { id: `${from}->${to}`, source, sourcePort, target, targetPort };
}

function pipelineOf(nodes: readonly PipelineNode[], edges: readonly PipelineEdge[]): Pipeline {
  return { ...createEmptyPipeline({ id: 'pipeline', name: 'Test' }), nodes, edges };
}

/** Input → Prompt → Output, without a model. */
const GREETING = pipelineOf(
  [textInput('name', 'Ada'), promptNode('greeting', 'Hello, {{name}}!'), outputNode('result')],
  [link('name.value', 'greeting.name'), link('greeting.prompt', 'result.value')],
);

/** Input → LLM Call → Output. */
const QUESTION = pipelineOf(
  [textInput('question', 'Why is the sky blue?'), llmNode('model'), outputNode('answer')],
  [link('question.value', 'model.prompt'), link('model.response', 'answer.value')],
);

/** `count` independent Input → LLM Call → Output branches: `q1 → m1 → o1`, `q2 → m2 → o2`… */
function branches(count: number): Pipeline {
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1));
  return pipelineOf(
    numbers.flatMap((n) => [
      textInput(`q${n}`, `Question ${n}?`),
      llmNode(`m${n}`),
      outputNode(`o${n}`),
    ]),
    numbers.flatMap((n) => [
      link(`q${n}.value`, `m${n}.prompt`),
      link(`m${n}.response`, `o${n}.value`),
    ]),
  );
}

/** A JSON Input and a Get field Transform that fails on it (`missing-field`). */
const FAILING_LOOKUP = [jsonInput('data', '{"a":1}'), getField('lookup', 'b')];
const DATA_TO_LOOKUP = link('data.value', 'lookup.value');

// Fakes

/** Lets every pending promise callback run: the engine has no timers, only promises. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** A plain-object signal and the means to abort it; core has no `AbortController`. */
function abortController() {
  const listeners = new Set<() => void>();
  let aborted = false;
  let reason: unknown;
  const signal: AbortSignalLike = {
    get aborted() {
      return aborted;
    },
    get reason() {
      return reason;
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  return {
    signal,
    listeners,
    /** Aborts the signal; `silently` skips the listeners, as a signal seen before its event. */
    abort({ silently = false } = {}) {
      aborted = true;
      reason = 'Stopped by the user';
      if (silently) return;
      for (const listener of [...listeners]) {
        listeners.delete(listener);
        listener();
      }
    },
  };
}

type Step =
  | { readonly kind: 'chunk'; readonly text: string }
  | { readonly kind: 'end' }
  | { readonly kind: 'error'; readonly error: Error };

/** A request the fake client received; the test sends its answer. */
interface FakeCall {
  readonly request: LlmRequest;
  readonly signal: AbortSignalLike;
  send(...chunks: string[]): void;
  end(): void;
  fail(error: Error): void;
  /** Whether the stream ended, failed or was left by its reader. */
  readonly closed: boolean;
}

/** What a fake stream does when its signal aborts: end, throw, or carry on. */
type AbortBehaviour = 'end' | 'throw' | 'ignore';

/** An LLM client whose answers the test sends chunk by chunk. */
function fakeLlm(onAbort: AbortBehaviour = 'end') {
  const calls: FakeCall[] = [];
  const client: LlmClient = {
    stream(request, signal) {
      const steps: Step[] = [];
      let wake: () => void = () => undefined;
      const put = (step: Step) => {
        steps.push(step);
        wake();
      };
      const call = {
        request,
        signal,
        closed: false,
        send: (...chunks: string[]) => {
          for (const text of chunks) put({ kind: 'chunk', text });
        },
        end: () => {
          put({ kind: 'end' });
        },
        fail: (error: Error) => {
          put({ kind: 'error', error });
        },
      };
      calls.push(call);

      const abort = () => {
        if (onAbort === 'end') put({ kind: 'end' });
        if (onAbort === 'throw')
          put({ kind: 'error', error: new Error('This operation was aborted') });
      };
      async function* answer(): AsyncGenerator<string> {
        signal.addEventListener('abort', abort, { once: true });
        try {
          for (;;) {
            const step = steps.shift();
            if (step === undefined) {
              await new Promise<void>((resolve) => (wake = resolve));
            } else if (step.kind === 'chunk') {
              yield step.text;
            } else if (step.kind === 'error') {
              throw step.error;
            } else {
              return;
            }
          }
        } finally {
          call.closed = true;
          signal.removeEventListener('abort', abort);
        }
      }
      return answer();
    },
  };
  return {
    client,
    calls,
    /** Calls whose stream is still open. */
    open: () => calls.filter((call) => !call.closed),
  };
}

/** The nth call, which must have been made. */
function callAt(calls: readonly FakeCall[], index: number): FakeCall {
  const call = calls[index];
  if (call === undefined) throw new Error(`No call ${String(index)}`);
  return call;
}

/** Starts a run on a fake client and a fresh signal, recording its events. */
function start(
  pipeline: Pipeline,
  options: Partial<RunOptions> = {},
  onAbort: AbortBehaviour = 'end',
) {
  const controller = abortController();
  const llm = fakeLlm(onAbort);
  const events: RunEvent[] = [];
  const result = runPipeline(pipeline, {
    llm: llm.client,
    signal: controller.signal,
    onEvent: (event) => {
      events.push(event);
    },
    ...options,
  });
  return { controller, llm, events, result };
}

/** Holds each node at `beforeNode` until the test lets it start. */
function gate() {
  const waiting: { readonly nodeId: string; readonly step: Deferred<void> }[] = [];
  return {
    waiting,
    beforeNode: (nodeId: string) => {
      const step = deferred();
      waiting.push({ nodeId, step });
      return step.promise;
    },
    /** Lets the nth node that asked start. */
    open(index: number) {
      const entry = waiting[index];
      if (entry === undefined) throw new Error(`No node waits at ${String(index)}`);
      entry.step.resolve();
    },
  };
}

// Events

const queued = (nodeId: string): RunEvent => ({ type: 'node-status', nodeId, status: 'queued' });
const running = (nodeId: string): RunEvent => ({ type: 'node-status', nodeId, status: 'running' });
const done = (nodeId: string): RunEvent => ({ type: 'node-status', nodeId, status: 'done' });
const cancelled = (nodeId: string): RunEvent => ({
  type: 'node-status',
  nodeId,
  status: 'cancelled',
});
const skipped = (nodeId: string, skipReason: SkipReason): RunEvent => ({
  type: 'node-status',
  nodeId,
  status: 'skipped',
  skipReason,
});
const failed = (nodeId: string, code: NodeRunError['code'], message: string): RunEvent => ({
  type: 'node-status',
  nodeId,
  status: 'error',
  error: { code, message },
});
const output = (nodeId: string, outputs: NodeValues): RunEvent => ({
  type: 'node-output',
  nodeId,
  outputs,
});
const delta = (nodeId: string, text: string): RunEvent => ({ type: 'node-delta', nodeId, text });
const finished = (status: RunOutcome): RunEvent => ({ type: 'run-finished', status });

/** The events about one node, in order. */
function eventsOf(events: readonly RunEvent[], nodeId: string): RunEvent[] {
  return events.filter((event) => event.type !== 'run-finished' && event.nodeId === nodeId);
}

/** Whether an event reports `status`, for the node `nodeId` when given. */
function isStatus(event: RunEvent, status: NodeRunStatus, nodeId?: string): boolean {
  return (
    event.type === 'node-status' &&
    event.status === status &&
    (nodeId === undefined || event.nodeId === nodeId)
  );
}

/** The latest status of every node, by id. */
function statuses(events: readonly RunEvent[]): Record<string, NodeRunStatus> {
  return Object.fromEntries(
    events.flatMap((event) => (event.type === 'node-status' ? [[event.nodeId, event.status]] : [])),
  );
}

/** The outputs a node reported, if any. */
function outputsOf(events: readonly RunEvent[], nodeId: string): NodeValues | undefined {
  for (const event of events) {
    if (event.type === 'node-output' && event.nodeId === nodeId) return event.outputs;
  }
  return undefined;
}

/** The most nodes `running` at the same time. */
function peakRunning(events: readonly RunEvent[]): number {
  const runningIds = new Set<string>();
  let peak = 0;
  for (const event of events) {
    if (event.type !== 'node-status') continue;
    if (event.status === 'running') runningIds.add(event.nodeId);
    else runningIds.delete(event.nodeId);
    peak = Math.max(peak, runningIds.size);
  }
  return peak;
}

// What every node goes through: queued first, then one ending.
const NODE_LIFECYCLE =
  /^queued (?:running (?:delta )*(?:output done|error|cancelled)|skipped|cancelled)$/;

/** Checks the order guarantees of `RunEvent` on the events of a whole run. */
function expectOrderedEvents(pipeline: Pipeline, events: readonly RunEvent[]): void {
  const nodeIds = pipeline.nodes.map(({ id }) => id);
  expect(events.slice(0, nodeIds.length)).toEqual(nodeIds.map(queued));
  expect(events.filter((event) => event.type === 'run-finished')).toHaveLength(1);
  expect(events.at(-1)?.type).toBe('run-finished');

  for (const nodeId of nodeIds) {
    const lifecycle = eventsOf(events, nodeId)
      .map((event) =>
        event.type === 'node-status' ? event.status : event.type.replace('node-', ''),
      )
      .join(' ');
    expect(lifecycle).toMatch(NODE_LIFECYCLE);
  }
  // A node starts only once every node its inputs come from is done.
  for (const { source, target } of pipeline.edges) {
    const started = events.findIndex((event) => isStatus(event, 'running', target));
    if (started === -1) continue;
    expect(events.slice(0, started)).toContainEqual(done(source));
  }
}

describe('runPipeline', () => {
  describe('run gate', () => {
    it('refuses a pipeline with validation errors without reporting anything', async () => {
      const pipeline = pipelineOf(
        [llmNode('model'), outputNode('answer')],
        [link('model.response', 'answer.value')],
      );
      const { result, events, llm, controller } = start(pipeline);

      await expect(result).resolves.toEqual(err('invalid-pipeline'));
      expect(events).toEqual([]);
      expect(llm.calls).toEqual([]);
      expect(controller.listeners.size).toBe(0);
    });

    it('runs a pipeline with warnings, unreachable nodes included', async () => {
      const pipeline = pipelineOf(
        [...GREETING.nodes, textInput('spare', 'Not used')],
        GREETING.edges,
      );
      expect(validatePipeline(pipeline)).toMatchObject({ hasErrors: false, warningCount: 1 });

      const { result, events } = start(pipeline);

      await expect(result).resolves.toMatchObject(ok({ status: 'done' }));
      expect(eventsOf(events, 'spare')).toEqual([
        queued('spare'),
        running('spare'),
        output('spare', { value: 'Not used' }),
        done('spare'),
      ]);
    });

    it('finishes an empty pipeline at once', async () => {
      const { result, events } = start(pipelineOf([], []));

      await expect(result).resolves.toEqual(ok({ status: 'done', nodes: new Map() }));
      expect(events).toEqual([finished('done')]);
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects a maxConcurrency of %d', async (maxConcurrency) => {
      const { result, events } = start(GREETING, { maxConcurrency });

      await expect(result).rejects.toThrow(RangeError);
      expect(events).toEqual([]);
    });
  });

  describe('order', () => {
    it('queues every node, then runs each once the nodes before it are done', async () => {
      const { result, events } = start(GREETING);

      await expect(result).resolves.toEqual(
        ok({
          status: 'done',
          nodes: new Map([
            ['name', 'done'],
            ['greeting', 'done'],
            ['result', 'done'],
          ]),
        }),
      );
      expect(events).toEqual([
        queued('name'),
        queued('greeting'),
        queued('result'),
        running('name'),
        output('name', { value: 'Ada' }),
        done('name'),
        running('greeting'),
        output('greeting', { prompt: 'Hello, Ada!' }),
        done('greeting'),
        running('result'),
        output('result', { value: 'Hello, Ada!' }),
        done('result'),
        finished('done'),
      ]);
    });

    it('passes a value to a __proto__ input like any other', async () => {
      const pipeline = pipelineOf(
        [
          textInput('name', 'Ada'),
          promptNode('greeting', 'Hi, {{__proto__}}'),
          outputNode('result'),
        ],
        [link('name.value', 'greeting.__proto__'), link('greeting.prompt', 'result.value')],
      );
      const { result, events } = start(pipeline);

      await result;
      expect(outputsOf(events, 'result')).toEqual({ value: 'Hi, Ada' });
    });

    it('removes its abort listener when the run ends', async () => {
      const { result, controller } = start(GREETING);

      await result;
      expect(controller.listeners.size).toBe(0);
    });
  });

  describe('LLM Call', () => {
    it('streams the response in chunks and outputs them joined', async () => {
      const { result, events, llm, controller } = start(QUESTION);
      await flush();

      const call = callAt(llm.calls, 0);
      expect(call.request).toStrictEqual({
        provider: 'mock',
        model: 'mock',
        prompt: 'Why is the sky blue?',
        temperature: 0.7,
        maxTokens: 512,
      });
      expect(call.signal).toBe(controller.signal);

      call.send('Because', '', ' of Rayleigh', ' scattering.');
      await flush();
      expect(statuses(events)).toMatchObject({ model: 'running', answer: 'queued' });

      call.end();
      await expect(result).resolves.toMatchObject(ok({ status: 'done' }));
      expect(eventsOf(events, 'model')).toEqual([
        queued('model'),
        running('model'),
        delta('model', 'Because'),
        delta('model', ' of Rayleigh'),
        delta('model', ' scattering.'),
        output('model', { response: 'Because of Rayleigh scattering.' }),
        done('model'),
      ]);
      expect(outputsOf(events, 'answer')).toEqual({ value: 'Because of Rayleigh scattering.' });
      expect(call.closed).toBe(true);
    });

    it('sends the system prompt when its input is connected', async () => {
      const pipeline = pipelineOf(
        [...QUESTION.nodes, textInput('rules', 'Answer in one sentence.')],
        [...QUESTION.edges, link('rules.value', 'model.system')],
      );
      const { llm } = start(pipeline);
      await flush();

      expect(callAt(llm.calls, 0).request).toMatchObject({
        prompt: 'Why is the sky blue?',
        system: 'Answer in one sentence.',
      });
    });

    it.each([
      ['blank', '{"question":" \\n"}', 'Input "prompt": Required'],
      [
        'too long',
        JSON.stringify({ question: 'x'.repeat(100_001) }),
        'Input "prompt": Must be at most 100000 characters',
      ],
    ])(
      'fails with bad-request, without a request, when the prompt is %s',
      async (_, json, message) => {
        const pipeline = pipelineOf(
          [
            jsonInput('data', json),
            getField('question', 'question'),
            llmNode('model'),
            outputNode('answer'),
          ],
          [
            link('data.value', 'question.value'),
            link('question.result', 'model.prompt'),
            link('model.response', 'answer.value'),
          ],
        );
        const { result, events, llm } = start(pipeline);

        await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
        expect(llm.calls).toEqual([]);
        expect(eventsOf(events, 'model').slice(-1)).toEqual([
          failed('model', 'bad-request', message),
        ]);
        expect(eventsOf(events, 'answer').slice(-1)).toEqual([
          skipped('answer', 'upstream-failed'),
        ]);
      },
    );

    it.each(['prompt', 'system'])('fails with not-text when the %s is not text', async (port) => {
      const pipeline = pipelineOf(
        [
          textInput('question', 'Why?'),
          jsonInput('data', '{"n":1}'),
          getField('number', 'n'),
          llmNode('model'),
          outputNode('answer'),
        ],
        [
          link('data.value', 'number.value'),
          link('number.result', `model.${port}`),
          link('question.value', port === 'prompt' ? 'model.system' : 'model.prompt'),
          link('model.response', 'answer.value'),
        ],
      );
      const { result, events, llm } = start(pipeline);

      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(llm.calls).toEqual([]);
      expect(eventsOf(events, 'model').slice(-1)).toEqual([
        failed(
          'model',
          'not-text',
          `Input "${port}" needs text but received a number; convert it with a Transform node`,
        ),
      ]);
    });

    it('fails with the LlmError of a failed request, after the chunks it streamed', async () => {
      const { result, events, llm } = start(QUESTION);
      await flush();

      const call = callAt(llm.calls, 0);
      call.send('Because');
      call.fail(new LlmError('rate-limited', 'Too many requests; try again in a minute'));

      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(eventsOf(events, 'model')).toEqual([
        queued('model'),
        running('model'),
        delta('model', 'Because'),
        failed('model', 'rate-limited', 'Too many requests; try again in a minute'),
      ]);
      expect(eventsOf(events, 'answer')).toEqual([
        queued('answer'),
        skipped('answer', 'upstream-failed'),
      ]);
    });

    it('fails with upstream-error when the client throws anything else', async () => {
      const { result, events, llm } = start(QUESTION);
      await flush();
      callAt(llm.calls, 0).fail(new TypeError('Failed to fetch'));

      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(eventsOf(events, 'model').slice(-1)).toEqual([
        failed('model', 'upstream-error', 'The request to the language model failed unexpectedly'),
      ]);
    });

    it('fails with upstream-error when the client cannot even start a stream', async () => {
      const client: LlmClient = {
        stream() {
          throw new Error('Not configured');
        },
      };
      const { result, events } = start(QUESTION, { llm: client });

      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(statuses(events)).toMatchObject({ model: 'error', answer: 'skipped' });
    });
  });

  describe('concurrency', () => {
    it('runs independent branches at the same time', async () => {
      const { result, events, llm } = start(branches(2));
      await flush();

      expect(llm.open()).toHaveLength(2);
      expect(statuses(events)).toMatchObject({ m1: 'running', m2: 'running' });

      callAt(llm.calls, 1).send('Second');
      callAt(llm.calls, 1).end();
      await flush();
      expect(statuses(events)).toMatchObject({ m1: 'running', o2: 'done' });

      callAt(llm.calls, 0).end();
      await expect(result).resolves.toMatchObject(ok({ status: 'done' }));
      expect(outputsOf(events, 'o1')).toEqual({ value: '' });
      expect(outputsOf(events, 'o2')).toEqual({ value: 'Second' });
    });

    it.each([
      ['2 nodes with a maxConcurrency of 2', 2, 2],
      ['4 nodes by default', undefined, 4],
    ])('starts at most %s at a time', async (_, maxConcurrency, limit) => {
      const { result, events, llm } = start(
        branches(6),
        maxConcurrency === undefined ? {} : { maxConcurrency },
      );
      await flush();
      expect(llm.open()).toHaveLength(limit);

      // Answer the oldest open request until every branch is done.
      for (let [call] = llm.open(); call !== undefined; [call] = llm.open()) {
        call.end();
        await flush();
        expect(llm.open().length).toBeLessThanOrEqual(limit);
      }

      await expect(result).resolves.toMatchObject(ok({ status: 'done' }));
      expect(llm.calls).toHaveLength(6);
      expect(peakRunning(events)).toBe(limit);
    });

    it('has no limit with a maxConcurrency of Infinity', async () => {
      const { llm } = start(branches(6), { maxConcurrency: Number.POSITIVE_INFINITY });
      await flush();

      expect(llm.open()).toHaveLength(6);
    });

    it('starts ready nodes in the order they became ready', async () => {
      const { events } = start(branches(2), { maxConcurrency: 1 });
      await flush();

      // q1 and q2 are ready at once; the model of q1 became ready before the model of q2.
      expect(events.filter((event) => isStatus(event, 'running'))).toEqual([
        running('q1'),
        running('q2'),
        running('m1'),
      ]);
    });
  });

  describe('skipping', () => {
    /** A review routed by a Condition to an Output, or through a Transform to another. */
    function routed(review: string): Pipeline {
      return pipelineOf(
        [
          textInput('review', review),
          node('condition', 'check', { operator: 'contains', operand: 'great' }),
          outputNode('praise'),
          node('transform', 'tidy', { operation: 'trim' }),
          outputNode('complaint'),
        ],
        [
          link('review.value', 'check.value'),
          link('check.true', 'praise.value'),
          link('check.false', 'tidy.value'),
          link('tidy.result', 'complaint.value'),
        ],
      );
    }

    it('skips the branch a Condition does not take, down to its end', async () => {
      const pipeline = routed('Sounds great');
      const { result, events } = start(pipeline);

      await expect(result).resolves.toEqual(
        ok({
          status: 'done',
          nodes: new Map([
            ['review', 'done'],
            ['check', 'done'],
            ['praise', 'done'],
            ['tidy', 'skipped'],
            ['complaint', 'skipped'],
          ]),
        }),
      );
      const checked = events.findIndex((event) => isStatus(event, 'done', 'check'));
      expect(events.slice(checked - 1, checked + 3)).toEqual([
        output('check', { true: 'Sounds great' }),
        done('check'),
        skipped('tidy', 'branch-not-taken'),
        skipped('complaint', 'branch-not-taken'),
      ]);
      expect(outputsOf(events, 'praise')).toEqual({ value: 'Sounds great' });
      expectOrderedEvents(pipeline, events);
    });

    it('runs the other branch when the Condition does not hold', async () => {
      const { result, events } = start(routed('  Arrived broken  '));

      await result;
      expect(statuses(events)).toMatchObject({ praise: 'skipped', complaint: 'done' });
      expect(outputsOf(events, 'complaint')).toEqual({ value: 'Arrived broken' });
    });

    it('skips the nodes below a failed node and keeps independent branches running', async () => {
      const pipeline = pipelineOf(
        [
          ...FAILING_LOOKUP,
          promptNode('quote', 'Found: {{found}}'),
          outputNode('found'),
          ...QUESTION.nodes,
        ],
        [
          DATA_TO_LOOKUP,
          link('lookup.result', 'quote.found'),
          link('quote.prompt', 'found.value'),
          ...QUESTION.edges,
        ],
      );
      const { result, events, llm } = start(pipeline);
      await flush();

      expect(statuses(events)).toEqual({
        data: 'done',
        lookup: 'error',
        quote: 'skipped',
        found: 'skipped',
        question: 'done',
        model: 'running',
        answer: 'queued',
      });
      expect(eventsOf(events, 'lookup').at(-1)).toEqual(
        failed('lookup', 'missing-field', 'Field "b" does not exist'),
      );
      expect(eventsOf(events, 'found').at(-1)).toEqual(skipped('found', 'upstream-failed'));

      callAt(llm.calls, 0).send('Rayleigh scattering');
      callAt(llm.calls, 0).end();
      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(outputsOf(events, 'answer')).toEqual({ value: 'Rayleigh scattering' });
      expectOrderedEvents(pipeline, events);
    });

    it('skips a node as soon as one of its inputs is known to get no value', async () => {
      const pipeline = pipelineOf(
        [
          ...FAILING_LOOKUP,
          textInput('question', 'Why?'),
          llmNode('model'),
          promptNode('both', '{{a}} {{b}}'),
          outputNode('result'),
        ],
        [
          DATA_TO_LOOKUP,
          link('lookup.result', 'both.a'),
          link('question.value', 'model.prompt'),
          link('model.response', 'both.b'),
          link('both.prompt', 'result.value'),
        ],
      );
      const { result, events, llm } = start(pipeline);
      await flush();

      expect(statuses(events)).toMatchObject({
        model: 'running',
        both: 'skipped',
        result: 'skipped',
      });
      callAt(llm.calls, 0).end();
      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(eventsOf(events, 'both')).toEqual([
        queued('both'),
        skipped('both', 'upstream-failed'),
      ]);
    });

    it('skips a node whose optional input gets no value', async () => {
      const pipeline = pipelineOf(
        [...FAILING_LOOKUP, ...QUESTION.nodes],
        [DATA_TO_LOOKUP, link('lookup.result', 'model.system'), ...QUESTION.edges],
      );
      const { result, events, llm } = start(pipeline);

      await expect(result).resolves.toMatchObject(ok({ status: 'error' }));
      expect(llm.calls).toEqual([]);
      expect(statuses(events)).toMatchObject({ model: 'skipped', answer: 'skipped' });
    });
  });

  describe('cancellation', () => {
    it('cancels the running and waiting nodes when the signal aborts mid-stream', async () => {
      const pipeline = branches(2);
      const { result, events, llm, controller } = start(pipeline, { maxConcurrency: 1 });
      await flush();
      const call = callAt(llm.calls, 0);
      call.send('Partial');
      await flush();

      controller.abort();

      await expect(result).resolves.toEqual(
        ok({
          status: 'cancelled',
          nodes: new Map([
            ['q1', 'done'],
            ['m1', 'cancelled'],
            ['o1', 'cancelled'],
            ['q2', 'done'],
            ['m2', 'cancelled'],
            ['o2', 'cancelled'],
          ]),
        }),
      );
      expect(events.slice(-6)).toEqual([
        delta('m1', 'Partial'),
        cancelled('m1'),
        cancelled('o1'),
        cancelled('m2'),
        cancelled('o2'),
        finished('cancelled'),
      ]);
      await flush();
      expect(call.closed).toBe(true);
      expect(llm.calls).toHaveLength(1);
      expect(controller.listeners.size).toBe(0);
      expectOrderedEvents(pipeline, events);
    });

    it('cancels rather than fails when the stream throws on abort', async () => {
      const { result, events, controller } = start(QUESTION, {}, 'throw');
      await flush();

      controller.abort();
      await flush();

      await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
      expect(statuses(events)).toMatchObject({ model: 'cancelled', answer: 'cancelled' });
      expect(events.at(-1)).toEqual(finished('cancelled'));
    });

    it('ends at once when a stream ignores the abort, and drops what it sends later', async () => {
      const { result, events, llm, controller } = start(QUESTION, {}, 'ignore');
      await flush();
      const call = callAt(llm.calls, 0);

      controller.abort();
      await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
      const reported = events.length;

      call.send('Late');
      await flush();
      expect(events).toHaveLength(reported);
      expect(call.closed).toBe(true);
    });

    it.each([
      [
        'ends',
        (call: FakeCall) => {
          call.end();
        },
      ],
      [
        'throws',
        (call: FakeCall) => {
          call.fail(new Error('Aborted'));
        },
      ],
      [
        'sends a chunk',
        (call: FakeCall) => {
          call.send('Late');
        },
      ],
    ])(
      'cancels when the stream %s after an abort the signal has not reported yet',
      async (_, react) => {
        const { result, events, llm, controller } = start(QUESTION);
        await flush();

        controller.abort({ silently: true });
        react(callAt(llm.calls, 0));

        await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
        expect(statuses(events)).toMatchObject({ model: 'cancelled', answer: 'cancelled' });
        expect(events.filter((event) => event.type === 'node-delta')).toEqual([]);
      },
    );

    it('cancels while a node waits for beforeNode, which may never settle', async () => {
      const steps = gate();
      const { result, events, controller } = start(GREETING, { beforeNode: steps.beforeNode });
      await flush();
      expect(steps.waiting.map(({ nodeId }) => nodeId)).toEqual(['name']);

      controller.abort();

      await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
      expect(events).toEqual([
        queued('name'),
        queued('greeting'),
        queued('result'),
        cancelled('name'),
        cancelled('greeting'),
        cancelled('result'),
        finished('cancelled'),
      ]);
    });

    it('cancels when beforeNode settles after an abort the signal has not reported yet', async () => {
      const steps = gate();
      const { result, events, controller } = start(GREETING, { beforeNode: steps.beforeNode });
      await flush();

      controller.abort({ silently: true });
      steps.open(0);

      await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
      expect(statuses(events)).toEqual({
        name: 'cancelled',
        greeting: 'cancelled',
        result: 'cancelled',
      });
    });

    it('cancels rather than rejects when beforeNode rejects after the abort', async () => {
      const steps = gate();
      const { result, controller } = start(GREETING, { beforeNode: steps.beforeNode });
      await flush();

      controller.abort();
      steps.waiting[0]?.step.reject(new Error('Run stopped'));

      await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
    });

    it('cancels every node at once when the signal has already aborted', async () => {
      const controller = abortController();
      controller.abort();
      const llm = fakeLlm();
      const events: RunEvent[] = [];
      const steps = gate();

      const result = await runPipeline(QUESTION, {
        llm: llm.client,
        signal: controller.signal,
        onEvent: (event) => {
          events.push(event);
        },
        beforeNode: steps.beforeNode,
      });

      expect(result).toMatchObject(ok({ status: 'cancelled' }));
      expect(events).toEqual([
        ...['question', 'model', 'answer'].map(queued),
        ...['question', 'model', 'answer'].map(cancelled),
        finished('cancelled'),
      ]);
      expect(steps.waiting).toEqual([]);
      expect(llm.calls).toEqual([]);
    });

    it('ends cancelled, not error, when a node had failed before the abort', async () => {
      const pipeline = pipelineOf(
        [...FAILING_LOOKUP, outputNode('found'), ...QUESTION.nodes],
        [DATA_TO_LOOKUP, link('lookup.result', 'found.value'), ...QUESTION.edges],
      );
      const { result, events, controller } = start(pipeline);
      await flush();
      expect(statuses(events)).toMatchObject({ lookup: 'error', model: 'running' });

      controller.abort();

      await expect(result).resolves.toMatchObject(ok({ status: 'cancelled' }));
      expect(statuses(events)).toMatchObject({
        lookup: 'error',
        found: 'skipped',
        model: 'cancelled',
      });
    });
  });

  describe('beforeNode', () => {
    it('is awaited before each node starts, which stays queued until then', async () => {
      const steps = gate();
      const { result, events } = start(GREETING, {
        beforeNode: steps.beforeNode,
        maxConcurrency: 1,
      });

      for (const [index, nodeId] of ['name', 'greeting', 'result'].entries()) {
        await flush();
        expect(steps.waiting.map((entry) => entry.nodeId)).toEqual(
          ['name', 'greeting', 'result'].slice(0, index + 1),
        );
        expect(statuses(events)[nodeId]).toBe('queued');
        steps.open(index);
      }

      await expect(result).resolves.toMatchObject(ok({ status: 'done' }));
      expect(outputsOf(events, 'result')).toEqual({ value: 'Hello, Ada!' });
    });

    it('holds a place among maxConcurrency while it waits', async () => {
      const steps = gate();
      start(branches(3), { beforeNode: steps.beforeNode, maxConcurrency: 2 });
      await flush();

      expect(steps.waiting.map(({ nodeId }) => nodeId)).toEqual(['q1', 'q2']);
    });

    it('rejects the run when it rejects without an abort', async () => {
      const steps = gate();
      const { result, events } = start(GREETING, { beforeNode: steps.beforeNode });
      await flush();
      const bug = new Error('Step controller failed');

      steps.waiting[0]?.step.reject(bug);

      await expect(result).rejects.toBe(bug);
      expect(events).toEqual(['name', 'greeting', 'result'].map(queued));
    });
  });

  describe('onEvent', () => {
    it.each([
      ['on the first event', GREETING, (event: RunEvent) => isStatus(event, 'queued')],
      ['when the model starts', QUESTION, (event: RunEvent) => isStatus(event, 'running', 'model')],
      ['when the run finishes', GREETING, (event: RunEvent) => event.type === 'run-finished'],
    ])(
      'rejects the run and reports nothing more when it throws %s',
      async (_, pipeline, throwsOn) => {
        const bug = new Error('Store update failed');
        const events: RunEvent[] = [];
        const onEvent = (event: RunEvent) => {
          events.push(event);
          if (throwsOn(event)) throw bug;
        };
        const { result, llm } = start(pipeline, { onEvent });

        await expect(result).rejects.toBe(bug);
        await flush();
        expect(events.filter(throwsOn)).toHaveLength(1);
        expect(events.at(-1)).toSatisfy(throwsOn);
        expect(llm.calls).toEqual([]);
      },
    );

    it('closes the stream when it throws on a chunk', async () => {
      const bug = new Error('Store update failed');
      const { result, llm } = start(QUESTION, {
        onEvent: (event) => {
          if (event.type === 'node-delta') throw bug;
        },
      });
      await flush();
      const call = callAt(llm.calls, 0);

      call.send('First', 'Second');
      await expect(result).rejects.toBe(bug);
      await flush();
      expect(call.closed).toBe(true);
    });
  });

  describe('built-in templates', () => {
    /** Streams the mock provider's answer, as the proxy does. */
    function mockLlm() {
      const requests: LlmRequest[] = [];
      const client: LlmClient = {
        async *stream(request) {
          requests.push(request);
          for (const token of splitIntoTokens(mockCompletion(request))) {
            yield await Promise.resolve(token);
          }
        },
      };
      return { client, requests };
    }

    async function runTemplate(id: string) {
      const template = PIPELINE_TEMPLATES.find((candidate) => candidate.id === id);
      if (template === undefined) throw new Error(`No template ${id}`);
      const llm = mockLlm();
      const events: RunEvent[] = [];
      const result = await runPipeline(template.pipeline, {
        llm: llm.client,
        signal: abortController().signal,
        onEvent: (event) => {
          events.push(event);
        },
      });
      expectOrderedEvents(template.pipeline, events);
      for (const request of llm.requests)
        expect(LLM_REQUEST_SCHEMA.parse(request)).toEqual(request);
      return { result, events, requests: llm.requests };
    }

    it('answers a question', async () => {
      const { result, events, requests } = await runTemplate('ask-a-question');

      expect(result).toMatchObject(ok({ status: 'done' }));
      const response = outputsOf(events, 'model')?.response;
      expect(requests.map(mockCompletion)).toEqual([response]);
      expect(response).toMatch(/^\*\*Why is the sky blue\?\*\*\n/);
      expect(outputsOf(events, 'answer')).toEqual({ value: response });
    });

    it('routes a review by its sentiment', async () => {
      const { result, events } = await runTemplate('route-by-sentiment');

      expect(result).toEqual(
        ok({
          status: 'done',
          nodes: new Map<string, NodeRunStatus>([
            ['review', 'done'],
            ['prompt', 'done'],
            ['classifier', 'done'],
            ['is-positive', 'done'],
            ['positive', 'done'],
            ['negative', 'skipped'],
          ]),
        }),
      );
      expect(outputsOf(events, 'positive')).toEqual({ value: 'positive' });
      expect(eventsOf(events, 'negative')).toEqual([
        queued('negative'),
        skipped('negative', 'branch-not-taken'),
      ]);
    });

    it('extracts a field from the JSON a model writes', async () => {
      const { result, events } = await runTemplate('extract-a-json-field');

      expect(result).toMatchObject(ok({ status: 'done' }));
      expect(outputsOf(events, 'email')).toEqual({ value: 'ada@example.com' });
    });
  });
});
