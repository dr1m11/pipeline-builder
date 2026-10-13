# 0008. Graph validation: issues, severities and what blocks a run

- Status: Accepted
- Date: 2026-10-13

## Context

Stage A3 shows what is wrong with a pipeline on the canvas and in a problems list ([#38](https://github.com/dr1m11/pipeline-builder/issues/38)); A5 must refuse to run a pipeline that cannot work. The product spec names cycles, incompatible ports, unreachable nodes and missing inputs and fields. The editor lets the graph become invalid on purpose: [ADR 0005](./0005-node-catalogue-and-typed-ports.md) keeps an edge whose port disappears, a node's settings can change its port types after it is connected, and a new node starts with empty required fields ([ADR 0007](./0007-zod-schemas-for-node-data-in-core.md)).

## Decision

One pure function in core, `validatePipeline(pipeline)`, returns a report of issues. Each issue has a `code`, a severity, a stable `id` and an English message that never names the node (the UI puts the label in front).

| Code                | Severity | When                                                                   |
| ------------------- | -------- | ---------------------------------------------------------------------- |
| `cycle`             | error    | Nodes reach themselves through edges (a node wired to itself included) |
| `dangling-edge`     | error    | An edge's node or port no longer exists                                |
| `incompatible-edge` | error    | An edge joins ports whose types no longer match                        |
| `missing-input`     | error    | A required input has no edge                                           |
| `invalid-field`     | error    | A data field breaks its kind's `rulesSchema`                           |
| `unreachable`       | warning  | No Output can be reached from the node, so its result is discarded     |
| `no-output`         | warning  | The pipeline has nodes but no Output (replaces per-node `unreachable`) |

- **Errors block a run; warnings do not.** The report's `hasErrors` is the run gate for A5, and the engine checks it again before it starts.
- An empty pipeline has no issues, so a fresh editor does not open with a warning.
- Issues are ordered errors first; within a severity, pipeline-wide problems, cycles, node problems in node order, then edge problems in edge order. `byNode` and `byEdge` index them for the canvas: a node gets its own issues, the cycles it belongs to and edges to a port of it that no longer exists.
- **Broken edges stay in the document** and are reported; the canvas draws them to placeholder handles so they can be seen, selected and deleted.
- **Cycles are allowed when connecting** and reported instead. Checking at connect time would run a graph search for every handle on every pointer move while a connection is dragged.
- Cycle detection is Tarjan's algorithm with an explicit stack, so long chains cannot overflow the call stack.
- Validation is synchronous. The report is cached per pipeline object and field checks per node data object; core keeps unchanged objects identical ([ADR 0006](./0006-canvas-state-core-document-and-react-flow-view.md)), so a drag or a selection change costs a cache lookup.

## Consequences

- The canvas, the problems list and the run gate read one report; there is a single definition of "invalid".
- Messages live in core, in English. Translating the UI would mean mapping codes to messages in the app.
- A pipeline can be saved and imported in any state; only running requires a valid one.
- Validation runs on the main thread on every document change. A6 measures it on 500+ nodes and moves it to a Web Worker only if the numbers call for it.

## Alternatives considered

- **Prevent invalid states instead of reporting them** (reject cycles, remove edges with their ports) — the user would lose edges while editing a template, and every check would need to run inside every gesture.
- **Unreachable as "no path from an Input"** — every such node already has an unconnected required input, so the warning would repeat that error.
- **Messages built in the web app from codes** — easier to translate, but each code's wording would be split from the rule that produces it; not needed while the app is English-only.
- **Validation in a Web Worker from the start** — asynchronous results complicate the canvas and tests before any measurement shows a need.
