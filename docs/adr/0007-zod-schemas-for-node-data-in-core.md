# 0007. Zod schemas for node data in core

- Status: Accepted
- Date: 2026-10-13

## Context

Stage A3 adds a properties panel built with React Hook Form + Zod and generated from the node type's schema ([#36](https://github.com/dr1m11/pipeline-builder/issues/36)), and graph validation that reports invalid fields on the canvas. Both need the same rules: a form that accepts a value the canvas flags, or the reverse, is a bug. Later stages need them too: import parses untrusted JSON (A4) and the proxy checks requests (A5). [ADR 0005](./0005-node-catalogue-and-typed-ports.md) keeps node data as plain TypeScript types and asks for this decision; [ADR 0001](./0001-monorepo-with-fsd-app-and-framework-free-core.md) gave core no runtime dependencies.

Saved and edited data must be allowed to break the rules: a new Input node has an empty value, and a work-in-progress file with a blank template must still import.

## Decision

Core depends on Zod 4 (`zod`, version pinned in the pnpm catalog, shared with the web app). Each node definition gains:

- **`dataSchema`** — field types and allowed values only. Every node in the store matches it; edits are parsed with it, and so will imports be.
- **`rulesSchema`** — `dataSchema` plus what a runnable node needs (a template that is not blank, a temperature from 0 to 2, a JSON value that parses). Graph validation and the form resolver both use it, so the canvas and the form show the same messages. Rules check values and never transform them.
- **`fields`** — a typed record with a label, an optional description and hints (`multiline`, `step`, option labels, `appliesWhen`) for every data field. A field that does not apply (the path of a Transform that does not read a field) is hidden and its rules are skipped.

`getNodeFields(node)` turns the schema shape and `fields` into a form model: field order, the control (text, number or choice, chosen by the field's Zod type) and options. The web app renders that model and never inspects Zod internals. `NODE_LABEL_SCHEMA` trims node labels and limits them to 60 characters.

The data interfaces stay the source of truth. Definitions type-check each schema against its interface, and type tests check the reverse, so a schema can neither add nor narrow a field.

## Consequences

- One set of rules for the form, validation, import and later the proxy; messages are written once.
- Core has its first runtime dependency. New ones still need an ADR.
- The production bundle grows by 24.6 KB gzipped (164.6 → 189.2 KB), measured with `vite build`. If the A6 performance budget needs it back, Zod Mini (`zod/mini`) keeps the same schemas with a functional API at a fraction of the size.
- Field metadata lives next to the schema but outside it, so the compiler checks that every field has a label; option labels and the field order are covered by tests.
- Adding a data field means updating the interface, both schemas and `fields`; the type tests fail until all agree.

## Alternatives considered

- **Zod only in the web app, hand-written checks in core** — core stays dependency-free, but every rule is written twice and the copies drift.
- **One schema with the rules** — simpler, but the store could not hold a half-configured node and imports of unfinished pipelines would fail.
- **Field metadata in a Zod registry or `.meta()`** — idiomatic, but metadata belongs to one schema instance and is lost by `.extend()` and refinements, the compiler cannot check that every field is described, and `globalRegistry` is global state.
- **Deriving the interfaces from the schemas (`z.infer`)** — one definition, but it drops the documented `readonly` interfaces that ADR 0005 and the rest of core rely on.
- **Valibot or another validator** — smaller, but React Hook Form's Zod resolver and Zod's ecosystem (JSON Schema export for A5) are the better-trodden path.
