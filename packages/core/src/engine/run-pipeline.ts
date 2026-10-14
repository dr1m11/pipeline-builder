import { assertNever } from '../assert-never';
import type { AbortSignalLike, LlmClient } from '../llm/llm-client';
import { LlmError, type LlmErrorCode } from '../llm/llm-error';
import { LLM_REQUEST_SCHEMA, type LlmRequest } from '../llm/llm-request';
import type { NodeOfKind, PipelineNode } from '../nodes/registry';
import type { JsonValue } from '../persistence/json';
import type { Pipeline } from '../pipeline';
import { err, ok, type Result } from '../result';
import { validatePipeline } from '../validation/validate-pipeline';
import {
  type EvaluableNode,
  evaluateNode,
  type EvaluationErrorCode,
  type NodeValues,
} from './evaluate-node';
import { readText } from './inputs';

/**
 * Where a node is in a run. The engine never reports `idle`, the state of a node before any run:
 * a run makes every node `queued`, then `running` once it starts, and ends each with one of
 * `done`, `error`, `skipped` (it could not run, see `SkipReason`) or `cancelled`.
 */
export type NodeRunStatus =
  'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled' | 'skipped';

/**
 * Why a node was skipped: one of its connected inputs got no value because it comes from
 *
 * - `branch-not-taken` — the branch of a Condition that was not taken;
 * - `upstream-failed` — a node that failed;
 *
 * or from a node skipped for that reason. A node is skipped as soon as one of its inputs is known to
 * get no value, with the reason of that input.
 */
export type SkipReason = 'branch-not-taken' | 'upstream-failed';

/**
 * How a run ended: `done`, `error` when a node failed, or `cancelled` when the signal aborted
 * before every node had ended (even if a node had failed). An abort from inside `onEvent` counts
 * once the step it arrived in has been reported (see `RunOptions.onEvent`), so it changes nothing
 * when that step ends the last nodes: their `node-output`, `done` or `error`, or the skips that
 * follow.
 */
export type RunOutcome = 'done' | 'error' | 'cancelled';

/** Why a node failed: it could not compute its outputs, or its LLM request failed. */
export interface NodeRunError {
  readonly code: EvaluationErrorCode | LlmErrorCode;
  /** English description; it never names the node, so the UI can put the node label in front. */
  readonly message: string;
}

/**
 * What happens during a run, reported in this order:
 *
 * 1. `node-status` `queued` for every node, in pipeline order.
 * 2. For each node that starts, once every node its inputs come from is `done`: `running`, then the
 *    chunks of an LLM Call's response as `node-delta`s, then `node-output` right before `done`, or
 *    `error`. Right after a node ends, the nodes it leaves without an input value get `skipped`,
 *    breadth-first: first those it feeds, then those they feed, each level in edge order.
 * 3. On abort, `cancelled` for every node still queued or running, in pipeline order.
 * 4. `run-finished`, last and once.
 *
 * In a run that resolves, every node ends with exactly one of `done`, `error`, `skipped` or
 * `cancelled`. A run that rejects (a bug, see `runPipeline`) stops reporting where it failed.
 */
export type RunEvent =
  | {
      readonly type: 'node-status';
      readonly nodeId: string;
      readonly status: NodeRunStatus;
      /** Present with the `error` status. */
      readonly error?: NodeRunError;
      /** Present with the `skipped` status. */
      readonly skipReason?: SkipReason;
    }
  /** A chunk of an LLM Call's response, never empty. Joined, they are its `response` output. */
  | { readonly type: 'node-delta'; readonly nodeId: string; readonly text: string }
  /** The outputs of a node, by output port id; a Condition has only the branch it takes. */
  | { readonly type: 'node-output'; readonly nodeId: string; readonly outputs: NodeValues }
  | { readonly type: 'run-finished'; readonly status: RunOutcome };

/** What a run needs from the app. */
export interface RunOptions {
  /** Streams the responses of LLM Call nodes. */
  readonly llm: LlmClient;
  /** Cancels the run when it aborts; every LLM request gets it too, so it stops the streams. */
  readonly signal: AbortSignalLike;
  /**
   * Receives every event, synchronously, as it happens; it is never called again before it returns.
   * It may abort the signal: the run is cancelled once the engine has reported the change in
   * progress (a node's output and status, and the nodes skipped because of it), so that node still
   * ends with its own status. An abort during the change that ends the last nodes, or on
   * `run-finished`, changes nothing. Throwing is a bug: the run rejects with the error.
   */
  readonly onEvent: (event: RunEvent) => void;
  /**
   * Awaited before each node starts (step-by-step mode): the node stays `queued`, holding its place
   * among `maxConcurrency`, until the promise resolves. Once the signal aborts the run does not
   * wait for it, so it may never settle. Rejecting while the signal has not aborted is a bug: the
   * run rejects with that error.
   */
  readonly beforeNode?: (nodeId: string) => Promise<void>;
  /** Most nodes started at a time: a whole number from 1, or `Infinity`. Default 4. */
  readonly maxConcurrency?: number;
}

/** How a run ended, and how each node ended, by node id in pipeline order. */
export interface RunSummary {
  readonly status: RunOutcome;
  readonly nodes: ReadonlyMap<string, NodeRunStatus>;
}

const DEFAULT_MAX_CONCURRENCY = 4;

// Shown for a failure of the LLM client that is not an `LlmError`: its message was not written for
// the user and could say anything.
const UNEXPECTED_LLM_FAILURE = 'The request to the language model failed unexpectedly';

/** How a node that ran ended. */
type Settlement =
  | { readonly status: 'done'; readonly outputs: NodeValues }
  | { readonly status: 'error'; readonly error: NodeRunError };

/** How a node ended, as the nodes below it see it. */
type Ending = Settlement | { readonly status: 'skipped'; readonly skipReason: SkipReason };

/** An edge from a node to the input of another. */
interface Link {
  readonly sourcePort: string;
  readonly target: NodeState;
  readonly targetPort: string;
}

interface NodeState {
  readonly node: PipelineNode;
  /** Edges out of the node, in pipeline order. */
  readonly links: Link[];
  status: NodeRunStatus;
  /** Edges into the node whose source has not ended yet. */
  waiting: number;
  /** Values the node's inputs received, by port id. */
  readonly inputs: Map<string, JsonValue>;
}

/**
 * Runs a pipeline: each node starts once every connected input has a value, and nodes that are ready
 * at the same time run concurrently, at most `maxConcurrency` at a time, in the order they became
 * ready. LLM Call nodes stream their response through `options.llm`; the other kinds are computed
 * by `evaluateNode`. Progress goes to `options.onEvent` (see `RunEvent` for the order).
 *
 * - A pipeline whose validation report has errors does not run: the result is `invalid-pipeline`
 *   and no event is sent. Warnings do not block, so unreachable nodes run too.
 * - A node that fails ends `error` and the nodes that need its output are `skipped`; independent
 *   branches keep running, and the run ends `error`.
 * - An LLM Call fails with the `LlmError` its client throws, with `upstream-error` for anything else
 *   the client throws, and with `bad-request`, without calling the client, when its prompts break
 *   `LLM_REQUEST_SCHEMA` (a blank prompt, a prompt or system prompt too long). Text inputs take
 *   strings only (`not-text`).
 * - When `options.signal` aborts, every node still queued or running is `cancelled` and the run
 *   ends `cancelled` at once, without waiting for streams to close or `beforeNode` to settle;
 *   anything a stream sends afterwards is dropped. An abort from inside `onEvent` takes effect once
 *   the engine has reported the change in progress (see `RunOptions.onEvent`).
 *
 * The promise resolves when the run ends. It rejects only on a bug: `maxConcurrency` out of range
 * (`RangeError`), `onEvent` throwing or `beforeNode` rejecting without an abort; the run then stops
 * reporting events, and the caller should abort the signal to stop requests still in flight.
 * See docs/adr/0011-pipeline-execution-engine.md.
 */
export function runPipeline(
  pipeline: Pipeline,
  options: RunOptions,
): Promise<Result<RunSummary, 'invalid-pipeline'>> {
  const { maxConcurrency = DEFAULT_MAX_CONCURRENCY } = options;
  if (!isConcurrencyLimit(maxConcurrency)) {
    return Promise.reject(
      new RangeError(
        `maxConcurrency must be a whole number from 1 or Infinity, got ${String(maxConcurrency)}`,
      ),
    );
  }
  if (validatePipeline(pipeline).hasErrors) return Promise.resolve(err('invalid-pipeline'));
  return new Promise((resolve, reject) => {
    startRun(
      pipeline,
      { ...options, maxConcurrency },
      (summary) => {
        resolve(ok(summary));
      },
      reject,
    );
  });
}

function isConcurrencyLimit(value: number): boolean {
  return value >= 1 && (Number.isInteger(value) || value === Number.POSITIVE_INFINITY);
}

function startRun(
  pipeline: Pipeline,
  options: RunOptions & { readonly maxConcurrency: number },
  resolve: (summary: RunSummary) => void,
  reject: (error: unknown) => void,
): void {
  const { llm, signal, onEvent, beforeNode, maxConcurrency } = options;

  const states = new Map<string, NodeState>(
    pipeline.nodes.map((node) => [
      node.id,
      { node, links: [], status: 'queued', waiting: 0, inputs: new Map() },
    ]),
  );
  for (const { source, sourcePort, target, targetPort } of pipeline.edges) {
    const from = states.get(source);
    const to = states.get(target);
    // The run gate rejects edges whose node does not exist.
    if (from === undefined || to === undefined) continue;
    from.links.push({ sourcePort, target: to, targetPort });
    to.waiting += 1;
  }

  /** Nodes whose inputs all have values, in the order they got them. */
  const ready: NodeState[] = [];
  /** Nodes started (waiting for `beforeNode` or running) that have not ended. */
  let started = 0;
  let unfinished = states.size;
  let nodeFailed = false;
  /** Set once the run ended or failed: nothing is reported or started after that. */
  let finished = false;
  /** Set when the signal aborts; the run is cancelled as soon as no step is in progress. */
  let abortRequested = false;
  /** How many synchronous steps are in progress, one inside another. */
  let depth = 0;

  /**
   * Runs a synchronous step of the run, such as reporting an event or ending a node. An abort that
   * arrives meanwhile, even from `onEvent`, cancels the run only once the outermost step is over:
   * `onEvent` is never called again before it returns, and the node being reported keeps the status
   * it was given.
   */
  function step(action: () => void): void {
    depth += 1;
    try {
      action();
    } finally {
      depth -= 1;
    }
    if (depth === 0 && abortRequested) cancel();
  }

  const emit = (event: RunEvent): void => {
    step(() => {
      if (finished) return;
      try {
        onEvent(event);
      } catch (error) {
        fail(error);
      }
    });
  };

  const setStatus = (state: NodeState, status: 'queued' | 'running' | 'cancelled'): void => {
    state.status = status;
    emit({ type: 'node-status', nodeId: state.node.id, status });
  };

  function finish(status: RunOutcome): void {
    if (finished) return;
    // Before the last event, so that aborting on it changes nothing.
    finished = true;
    signal.removeEventListener('abort', requestCancel);
    const nodes = new Map(Array.from(states, ([id, state]) => [id, state.status]));
    try {
      onEvent({ type: 'run-finished', status });
    } catch (error) {
      reject(error);
      return;
    }
    resolve({ status, nodes });
  }

  // Once the promise has settled, rejecting it again does nothing.
  function fail(error: unknown): void {
    finished = true;
    signal.removeEventListener('abort', requestCancel);
    reject(error);
  }

  function requestCancel(): void {
    abortRequested = true;
    if (depth === 0) cancel();
  }

  function cancel(): void {
    if (finished) return;
    step(() => {
      for (const state of states.values()) {
        if (state.status === 'queued' || state.status === 'running') setStatus(state, 'cancelled');
      }
      finish('cancelled');
    });
  }

  /**
   * Whether the run has ended or is being cancelled. An aborted signal cancels it first: the
   * listener normally has, but a client may see the abort, and end its stream, before the listener
   * runs.
   */
  const stopped = (): boolean => {
    if (signal.aborted) requestCancel();
    return finished || abortRequested;
  };

  /** Records how a node ended and reports it. */
  function end(state: NodeState, ending: Ending): void {
    state.status = ending.status;
    unfinished -= 1;
    const nodeId = state.node.id;
    switch (ending.status) {
      case 'done':
        emit({ type: 'node-output', nodeId, outputs: ending.outputs });
        emit({ type: 'node-status', nodeId, status: 'done' });
        return;
      case 'error':
        nodeFailed = true;
        emit({ type: 'node-status', nodeId, status: 'error', error: ending.error });
        return;
      case 'skipped':
        emit({ type: 'node-status', nodeId, status: 'skipped', skipReason: ending.skipReason });
        return;
      default:
        assertNever(ending);
    }
  }

  /**
   * Ends a node that ran, passes its outputs on, skips the nodes left without an input value (and
   * the nodes below them, breadth-first), then starts the nodes that became ready or finishes the
   * run. One step: an abort meanwhile cancels the run only after all of it has been reported.
   */
  function settle(state: NodeState, settlement: Settlement): void {
    step(() => {
      started -= 1;
      end(state, settlement);
      const ended: [NodeState, Ending][] = [[state, settlement]];
      // Nodes skipped on the way are appended, and the loop reaches them too.
      for (const [source, ending] of ended) {
        for (const { sourcePort, target, targetPort } of source.links) {
          // Already skipped through another of its inputs.
          if (target.status !== 'queued') continue;
          target.waiting -= 1;
          const value = ending.status === 'done' ? valueOf(ending.outputs, sourcePort) : undefined;
          if (value !== undefined) {
            target.inputs.set(targetPort, value);
            if (target.waiting === 0) ready.push(target);
            continue;
          }
          const skipped: Ending = { status: 'skipped', skipReason: missingReason(ending) };
          end(target, skipped);
          ended.push([target, skipped]);
        }
      }
      // Once every node has ended, an abort during this step has nothing left to cancel.
      if (unfinished === 0) finish(nodeFailed ? 'error' : 'done');
      else startReadyNodes();
    });
  }

  function startReadyNodes(): void {
    while (!finished && !abortRequested && started < maxConcurrency) {
      const state = ready.shift();
      if (state === undefined) return;
      started += 1;
      runNode(state).catch(fail);
    }
  }

  async function runNode(state: NodeState): Promise<void> {
    const { node } = state;
    try {
      // Awaited even without a hook, so a long chain of nodes does not grow the call stack.
      await beforeNode?.(node.id);
    } catch (error) {
      // After an abort the hook may reject: that is the cancellation, not a bug.
      if (!stopped()) fail(error);
      return;
    }
    if (stopped()) return;
    setStatus(state, 'running');
    // `onEvent` aborted or threw: the node is cancelled or the run failed, so no request goes out.
    if (stopped()) return;
    // Own keys only, so a `__proto__` port gets its value like any other.
    const inputs: NodeValues = Object.fromEntries(state.inputs);
    const settlement =
      node.kind === 'llm-call' ? await callModel(node, inputs) : evaluate(node, inputs);
    // The run stopped while the model was answering. A stream may end early or throw when the
    // signal aborts: a cut response is no output, and that failure is the cancellation.
    if (settlement === undefined || stopped()) return;
    settle(state, settlement);
  }

  /** Streams an LLM Call's response; `undefined` when the run stopped while reading it. */
  async function callModel(
    node: NodeOfKind<'llm-call'>,
    inputs: NodeValues,
  ): Promise<Settlement | undefined> {
    const request = llmRequest(node, inputs);
    if (!request.ok) return { status: 'error', error: request.error };
    let response = '';
    try {
      for await (const chunk of llm.stream(request.value, signal)) {
        // Leaving the loop closes the stream.
        if (stopped()) return undefined;
        if (chunk === '') continue;
        response += chunk;
        emit({ type: 'node-delta', nodeId: node.id, text: chunk });
      }
    } catch (error) {
      return { status: 'error', error: llmFailure(error) };
    }
    return { status: 'done', outputs: { response } };
  }

  step(() => {
    for (const state of states.values()) setStatus(state, 'queued');
    if (stopped()) return;
    signal.addEventListener('abort', requestCancel, { once: true });
    for (const state of states.values()) if (state.waiting === 0) ready.push(state);
    if (unfinished === 0) finish('done');
    else startReadyNodes();
  });
}

function evaluate(node: EvaluableNode, inputs: NodeValues): Settlement {
  const result = evaluateNode(node, inputs);
  return result.ok
    ? { status: 'done', outputs: result.value }
    : { status: 'error', error: result.error };
}

/** The value of an output port; `undefined` when the node did not send one (a Condition branch). */
function valueOf(outputs: NodeValues, port: string): JsonValue | undefined {
  return Object.hasOwn(outputs, port) ? outputs[port] : undefined;
}

/** Why an input that comes from a node that ended this way gets no value. */
function missingReason(ending: Ending): SkipReason {
  switch (ending.status) {
    case 'done':
      return 'branch-not-taken';
    case 'error':
      return 'upstream-failed';
    case 'skipped':
      return ending.skipReason;
    default:
      return assertNever(ending);
  }
}

/**
 * The request of an LLM Call: its settings, the text of its `prompt` input and, when connected,
 * of its `system` input. A request that breaks `LLM_REQUEST_SCHEMA` (a blank prompt, a prompt too
 * long) is a `bad-request` error: the proxy would refuse it.
 */
function llmRequest(
  { data }: NodeOfKind<'llm-call'>,
  inputs: NodeValues,
): Result<LlmRequest, NodeRunError> {
  const prompt = readText(inputs, 'prompt');
  if (!prompt.ok) return prompt;
  const system = Object.hasOwn(inputs, 'system') ? readText(inputs, 'system') : ok(undefined);
  if (!system.ok) return system;

  const request: LlmRequest = {
    provider: data.provider,
    model: data.model,
    prompt: prompt.value,
    ...(system.value === undefined ? {} : { system: system.value }),
    temperature: data.temperature,
    maxTokens: data.maxTokens,
  };
  // After the run gate the settings follow the node's rules, so only the prompts can break one.
  const checked = LLM_REQUEST_SCHEMA.safeParse(request);
  if (checked.success) return ok(request);
  const message = checked.error.issues
    .map(({ path, message }) => `Input "${String(path[0])}": ${message}`)
    .join('; ');
  return err({ code: 'bad-request', message });
}

function llmFailure(error: unknown): NodeRunError {
  return error instanceof LlmError
    ? { code: error.code, message: error.message }
    : { code: 'upstream-error', message: UNEXPECTED_LLM_FAILURE };
}
