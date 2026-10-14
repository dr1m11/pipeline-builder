# 0010. Pipeline files and schema migrations

- Status: Accepted
- Date: 2026-10-14

## Context

Stage A4 persists pipelines for the first time ([#54](https://github.com/dr1m11/pipeline-builder/issues/54)): export and import of JSON files, an autosaved draft in `localStorage`, and copy and paste between tabs through the system clipboard. All of it is untrusted input: a file may be edited by hand, come from an older build, or be a draft saved before a deploy. The product spec asks that a file saved with an older schema version still opens.

Earlier decisions constrain the format. [ADR 0005](./0005-node-catalogue-and-typed-ports.md) keeps `SCHEMA_VERSION` at 1 until something is persisted and freezes it once export or autosave ship. [ADR 0007](./0007-zod-schemas-for-node-data-in-core.md) separates a kind's `dataSchema` (field types) from its `rulesSchema` (what a run needs) so that unfinished pipelines can be saved and imported. [ADR 0008](./0008-graph-validation.md) keeps broken edges in the document and reports them instead of removing them.

## Decision

**One flat format with a marker.** A pipeline file is the in-memory `Pipeline` with a `format` field in front:

```json
{
  "format": "pipeline-builder",
  "schemaVersion": 1,
  "id": "…",
  "name": "Ask a question",
  "nodes": [
    {
      "id": "…",
      "kind": "prompt",
      "label": "Prompt 1",
      "position": { "x": 0, "y": 0 },
      "data": { "template": "…" }
    }
  ],
  "edges": [
    { "id": "…", "source": "…", "sourcePort": "prompt", "target": "…", "targetPort": "prompt" }
  ]
}
```

`serializePipeline` writes it as JSON indented by two spaces with a final newline, with keys in a fixed order (data fields in the order of the kind's `dataSchema`), so equal pipelines give equal text. Export, the autosaved draft and the clipboard all use this format; a copied fragment is a `Pipeline` holding the selection. One parser, `parsePipelineFile`, reads all three:

| Step | What it does                                                                                  | Fails with                                          |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1    | `JSON.parse`                                                                                  | `invalid-json`                                      |
| 2    | Checks the marker and that `schemaVersion` is a whole number from 1, not newer than the app's | `not-a-pipeline`, `newer-version`                   |
| 3    | Runs the migrations from the file's version up to the current one                             | — (a gap in the chain is a bug and throws)          |
| 4    | Checks the document with a Zod schema built from each kind's `dataSchema`                     | `invalid-pipeline` with the path of the first issue |
| 5    | Checks ids and repairs edges the editor could not show or keep                                | `duplicate-id`                                      |

**Version rules.** `schemaVersion` is a whole number. Any change to the persisted shape bumps it and adds a migration `{ from, migrate }` that turns a raw JSON document of version `from` into version `from + 1`. Migrations run one step at a time on raw JSON, before Zod, so the schema only ever describes the current version and each migration only knows its two neighbours. A file from a newer version is refused rather than loaded in part. Migrations are append-only: a released one is never changed or removed, and each comes with a fixture test, a file saved in the old version.

**Lenient parsing.** Node data is checked against `dataSchema`, not `rulesSchema`, so a blank template or an out-of-range temperature loads and validation reports it. Unknown fields are dropped at every level. Names and labels follow the editor's rules: trimmed, not blank, not too long.

**Repairs versus errors.**

- Two nodes or two edges with the same id are an error: ids identify elements in the store, on the canvas and in the history, and nothing tells which one an edge refers to.
- An edge from or to a node that is not in the file is dropped. The canvas has nothing to attach it to, so the user could neither see, select nor delete it, and validation would report an error that cannot be fixed.
- Extra edges into an input that already has one are dropped and the first is kept. The editor never creates them (connecting replaces the old edge, ADR 0005), they would be drawn on top of each other, and no node defines what several values in one input would mean.
- An edge to a port that no longer exists is kept, as the editor itself keeps it: the canvas draws it to a placeholder handle and validation reports it (ADR 0008).

Repairs are returned with the pipeline (`{ edgeId, reason }`) so the app can tell the user; nothing is changed silently.

**Core stays free of I/O.** Core turns text into a pipeline and back. The web app reads and downloads files, owns the `localStorage` keys and handles clipboard events.

## Migrations

Every change to the persisted shape, oldest first; each row is one entry of `MIGRATIONS` in `packages/core/src/persistence/migrations.ts`. Version 1 is the first persisted shape: the node catalogue of [ADR 0005](./0005-node-catalogue-and-typed-ports.md) with the data fields of [ADR 0007](./0007-zod-schemas-for-node-data-in-core.md). There are no migrations yet.

| From | To  | Change |
| ---- | --- | ------ |

## Consequences

- Files from every released version keep loading, so migrations are never removed and the chain only grows. A test checks that there is exactly one migration from every version below the current one.
- A file from a newer build shows an error instead of opening with fields missing that a later save would erase.
- An invalid file reports one problem with its path (`nodes[2].data.temperature`): enough to find a hand-editing mistake, not a full report.
- Fields the format does not define are lost when a file is opened and saved again.
- The autosaved draft goes through the same parser, so a draft written before a deploy that bumps the version is migrated on the next load. A draft the parser refuses (a newer version after a rollback, damaged text) is moved to `pb:pipeline:unreadable` and reported rather than overwritten by the next save. A draft that loads only with repairs is reported too, and its saved text is copied there before the next save replaces it.
- All tabs of the editor autosave to the same `pb:pipeline` key, so with several tabs open the last save wins and the next load shows only that tab's pipeline. Collaboration in A9 replaces this.
- Version 2 lands in [#61](https://github.com/dr1m11/pipeline-builder/issues/61): a `provider` field on LLM Call nodes with a migration from version 1, tested against a real version 1 export from production. It adds the first row to [Migrations](#migrations).

## Alternatives considered

- **A versioned envelope (`{ format, version, pipeline }`)** — separates metadata from content, but the `Pipeline` already carries `schemaVersion`, every reader needs one more level, and a clipboard fragment would no longer be a plain pipeline.
- **Migrations in Zod (`.transform`, `z.preprocess`)** — every old schema would have to stay in the code, error paths would point into old shapes, and the types across versions get hard to follow. Plain functions on raw JSON are easier to write and to test with fixtures.
- **Rejecting files that need repairs** — strict, but a whole pipeline would be lost over edges the user could not see or use anyway.
- **Strict schemas that reject unknown keys** — catch typos, but a file with harmless extra fields (React Flow state, export metadata) would fail to open; ADR 0007 accepts rule-breaking values for the same reason.
- **Renaming duplicate ids on import** — keeps both elements, but edges that use the id would still point at only one of them, so the result could differ from what was saved without anyone noticing.
