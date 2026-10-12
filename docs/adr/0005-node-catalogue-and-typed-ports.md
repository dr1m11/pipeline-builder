# 0005. Node catalogue and typed ports

- Status: Accepted
- Date: 2026-10-12

## Context

Stage A2 ([#20](https://github.com/dr1m11/pipeline-builder/issues/20)) adds the six node kinds from the product spec with typed ports; the spec left "exact field set and port types for every node" open. The model must let the canvas reject wrong connections (A2), let validation report missing inputs and broken edges (A3), stay serializable for import/export with migrations (A4) and tell the engine what flows between nodes (A5).

## Decision

Ports have one of four types — `text`, `number`, `json`, `any`. An output may feed an input when the types match or either side is `any`; conversions happen only in Transform nodes. Each kind is described in `packages/core` by a definition (title, description, default data, `getPorts(data)`); ports are derived from node data, not stored.

| Kind        | Data (default)                                                   | Inputs                                       | Outputs                            |
| ----------- | ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| `input`     | `valueType` text \| number \| json (`text`), `value`             | —                                            | `value`: `valueType`               |
| `prompt`    | `template` (`Answer the question: {{question}}`)                 | one required `text` input per `{{variable}}` | `prompt`: text                     |
| `llm-call`  | `model` (`mock`), `temperature` (0.7), `maxTokens` (512)         | `prompt`: text (required), `system`: text    | `response`: text                   |
| `transform` | `operation` parse-json \| stringify \| trim \| get-field, `path` | `value`: text / json / text / json           | `result`: json / text / text / any |
| `condition` | `operator` contains \| equals \| is-empty, `operand`             | `value`: any (required)                      | `true`: any, `false`: any          |
| `output`    | `format` text \| markdown (`text`)                               | `value`: any (required)                      | —                                  |

- `PipelineNode` is a discriminated union on `kind`, built from `NodeDataMap`. Every node has a `label`, numbered per kind by default ("Prompt 2"), used in accessible names and error lists.
- Edges reference ports by id (`sourcePort`, `targetPort`). Port ids are identifiers (`[A-Za-z_][A-Za-z0-9_]*`); Prompt inputs use the variable name, so an edge stays attached while the rest of the template is edited. When a port disappears the edge is kept and validation (A3) reports it.
- An input accepts one edge; connecting to an occupied input replaces the old edge.
- The defaults contain an incompatible pair (Transform `parse-json` outputs `json`, LLM Call takes `text`), so type checking is visible before the properties panel exists.
- `SCHEMA_VERSION` stays `1`: no pipeline has been persisted yet. Version 1 is frozen once autosave or export ship (A4); later shape changes bump it and add a migration.

## Consequences

- One pure compatibility function serves the canvas, validation and the engine.
- Derived ports cannot drift from node data, but every reader goes through `getNodePorts`, and the canvas must refresh handle positions when a node's ports change (A3).
- `any` (Condition branches, Output, `get-field`) turns type checking off downstream. Passing the input type through Condition is a possible refinement.
- Node data are plain TypeScript types. If A3 generates forms from Zod schemas, the schemas must infer the same types, and Zod in core needs its own ADR.

## Alternatives considered

- **Open-ended port types or JSON Schema per port** — more expressive, but the canvas needs a fixed set of colours and the rules become hard to explain; four types cover the LLM scenarios.
- **Implicit coercions (number → text, json → text)** — convenient, but hide conversions the user should see; an explicit Transform keeps the graph honest.
- **Ports stored on nodes** — simpler reads, but they can disagree with data after a template edit and need migrating with it.
- **Rejecting connections to an occupied input** — forces delete-then-connect; replacing matches common node editors and is a single undo step in A4.
- **Several edges into one input** — needs merge semantics that no node defines.
