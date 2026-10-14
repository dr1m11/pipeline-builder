# 0011. Pipeline execution engine

- Status: Accepted
- Date: 2026-10-14

## Context

Stage A5 runs pipelines ([#79](https://github.com/dr1m11/pipeline-builder/issues/79)). The product spec asks for execution in dependency order with independent branches in parallel, node statuses (idle, queued, running, done, error, cancelled), tokens streamed into the nodes, cancellation through an `AbortController` and a step-by-step mode that highlights the active node.

Earlier decisions constrain the engine. [ADR 0001](./0001-monorepo-with-fsd-app-and-framework-free-core.md) keeps core free of the DOM, the network and timers. [ADR 0005](./0005-node-catalogue-and-typed-ports.md) gives every input at most one edge and makes conversions explicit. [ADR 0008](./0008-graph-validation.md) makes validation errors the run gate and asks the engine to check it again. Within A5, `evaluateNode` ([#76](https://github.com/dr1m11/pipeline-builder/issues/76)) computes every kind but LLM Call, and the LLM protocol ([#77](https://github.com/dr1m11/pipeline-builder/issues/77)) defines `LlmClient`, a stream of text chunks that takes an `AbortSignalLike`. The web app keeps run state in a store fed by the engine ([#84](https://github.com/dr1m11/pipeline-builder/issues/84)) and builds step mode on it ([#86](https://github.com/dr1m11/pipeline-builder/issues/86)).

## Decision

One function in core runs a pipeline and reports what happens as events:

```ts
runPipeline(pipeline, { llm, signal, onEvent, beforeNode?, maxConcurrency? })
  : Promise<Result<RunSummary, 'invalid-pipeline'>>
```

The app injects everything with side effects: the LLM client (through the proxy), the abort signal and the event sink. Core holds no timers or clocks; time limits belong to the client and the proxy (the `timeout` error code), and the app can time nodes from the events it receives.

**The gate.** A pipeline whose validation report has errors does not run: the result is `err('invalid-pipeline')` and no event is sent. Warnings do not block, so unreachable nodes run too.

**Scheduling by readiness, not by levels.** Every edge is a dependency. A node is ready once every node its inputs come from has ended and each connected input received a value. Ready nodes start in the order they became ready (nodes without inputs in pipeline order), at most `maxConcurrency` at a time (default 4). A node holds its place from the moment it starts waiting for `beforeNode` until it ends. Every start goes through an `await`, so a long chain of nodes does not grow the call stack.

**Statuses.** The engine never reports `idle`, which is the app's state before a run.

| Status      | When                                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| `queued`    | Every node, when the run starts; a node waiting for `beforeNode` is still queued |
| `running`   | The node started                                                                 |
| `done`      | It computed its outputs                                                          |
| `error`     | It failed, with a `NodeRunError`: an evaluation error code or an LLM error code  |
| `skipped`   | A connected input will get no value, with a `SkipReason`                         |
| `cancelled` | The signal aborted while the node was queued or running                          |

**Evaluation** (from #76). LLM Call streams through the client; every other kind is computed by `evaluateNode` from its data and input values, with these choices:

- Text inputs (Prompt variables, `parse-json`, `trim`, and LLM Call `prompt` and `system`) take strings only. Another type of value can arrive through an `any` port; it is a `not-text` error, not converted (ADR 0005).
- Input reads its value by `valueType`: text as it is, a finite number, or JSON. Non-finite numbers (`1e999`) are invalid JSON.
- Condition sends its input, unchanged, on the `true` or the `false` output only. `contains` and `equals` compare the text form of the value (a string as it is, anything else as compact JSON), case-sensitively and without trimming; `is-empty` holds for blank text, `null`, `[]` and `{}`.
- `get-field` follows a dot path through own object fields and canonical array indexes (`items.0`); `stringify` writes compact JSON.
- Output returns `{ value }`, the result it shows.
- Values travel as `NodeValues` by port id, built with own keys only, so a `__proto__` port id works like any other.

**LLM Call.** The request is the node's provider, model, temperature and max tokens, the text of its `prompt` input and, when its `system` input is connected, the text of that. It is checked against `LLM_REQUEST_SCHEMA` before it is sent: a blank prompt, or a prompt or system prompt longer than `LLM_PROMPT_MAX_LENGTH`, fails the node with `bad-request` (`Input "prompt": Required`, `Input "system": Must be at most 100000 characters`) without calling the client, since the proxy would refuse it anyway. Chunks are reported as `node-delta`s (empty ones are dropped) and, joined, become the `response` output. An `LlmError` from the client fails the node with its code and message; anything else the client throws becomes `upstream-error` with a generic message, because its own message was not written for the user.

**Skipping.** A node whose connected input will get no value is `skipped`, whether the input is required or optional: an optional system prompt that silently went missing would change the request. The reason is `branch-not-taken` below the Condition branch that was not taken and `upstream-failed` below a failed node, and it is passed on to everything below a skipped node. A node is skipped as soon as one input is known to get no value, without waiting for its other inputs, with that input's reason. Skips are reported right after the node that caused them, breadth-first: first the nodes it feeds, then the nodes they feed, each level in edge order.

**Errors stay in their branch.** A failed node only skips the nodes that need its output; independent branches keep running. A run with a failed node ends `error`; a run where nodes were only skipped below untaken branches ends `done`.

**Cancellation.** When the signal aborts, every node still queued or running becomes `cancelled`, the run ends `cancelled` and the promise resolves at once, without waiting for streams to close or for `beforeNode` to settle. Every LLM request gets the same signal, so the client stops its stream. A client may end its stream or throw on abort, so after a stream ends or fails the engine checks `signal.aborted`: a cut response is never reported as the output, and a throw caused by the abort is not an error. Chunks that arrive later are dropped, and the engine closes the stream on the next one. An abort never turns into `error`: a node that failed before keeps its status, but the run ends `cancelled`. A signal that has already aborted gives `queued` and then `cancelled` for every node.

**Aborting from `onEvent`.** The store may abort while it handles an event (a DOM `AbortController` calls its listeners synchronously), for example on an error. The engine works in synchronous steps: reporting one event, or ending a node, which reports its `node-output` and `done` (or `error`) and the nodes skipped because of it. An abort that arrives during a step is held until the step is over; then no new node starts and the run is cancelled as usual. So `onEvent` is never called again before it returns, the node being reported keeps the status it was given, and every node of a run that resolves ends with exactly one status. An abort once every node has ended, on the last node's `done` or on `run-finished`, changes nothing: the run ends `done` or `error`.

**Step mode.** `beforeNode(nodeId)` is awaited before each node starts; with `maxConcurrency: 1`, nodes start one at a time. Rejecting while the signal has not aborted is a bug (see below).

**Event order.** `queued` for every node in pipeline order first; for a node that runs, `running`, its `node-delta`s, then `node-output` right before `done`, or `error`; `skipped` right after the node that left it without a value, breadth-first; on abort, `cancelled` in pipeline order; `run-finished` last and once. A node starts only after every node its inputs come from is `done`. `onEvent` is called synchronously for each event and never re-entered.

**Bugs reject.** The promise rejects only when the caller breaks the contract: a `maxConcurrency` that is not a whole number from 1 (or `Infinity`), an `onEvent` that throws, or a `beforeNode` that rejects without an abort. The run then reports nothing more, and the caller should abort the signal to stop requests still in flight.

## Consequences

- Execution is tested in Node with a fake client, controllable promises and a plain-object signal, without timers; the built-in templates run end to end on the mock provider in unit tests.
- The store applies events in the order they come. `onEvent` fires for every token, so the app may batch events per frame.
- A client that ignores the signal keeps its connection open until it next sends a chunk or ends; the run itself has already ended.
- `maxConcurrency` bounds how many requests go to a provider at once, which also keeps a fan-out pipeline within rate limits.
- When a node misses inputs for different reasons, its skip reason is the one found first, which depends on which branch ended first.
- Results exist only in events. Re-running one node, caching results or resuming a run would need the engine to keep and accept them.

## Alternatives considered

- **Static levels from a topological sort** (run level by level) — simpler, but a slow model in one branch would hold back every node of the next level.
- **Unbounded concurrency** — a wide pipeline would send every request at once and hit provider rate limits.
- **Waiting for streams to close before ending a cancelled run** — a client that ignores the signal, or a step that never comes, would keep the run from ever ending.
- **Reporting an abort as an error** — the user stopped the run; failed nodes would be misleading.
- **Sending a blank prompt to the client** — the proxy refuses it with `bad-request` after a network round trip; checking in core gives the same code at once.
- **Running a node whose optional input got no value** — the request would change silently depending on which branch was taken.
- **An async iterator of events instead of a callback** — a slow consumer would slow the run down, and the store wants each update pushed as it happens.
