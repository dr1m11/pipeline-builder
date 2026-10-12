# Pipeline Builder — product spec

> Working title. Stage-by-stage plan: [roadmap](./roadmap.md). Decisions: [ADRs](./adr/README.md).

## 1. What it is

A browser-based, node-based editor for building and running LLM and data pipelines. The user assembles a graph of nodes on a canvas, configures each node in a properties panel and runs the pipeline. Results stream straight into the nodes.

## 2. Users and scenarios

The user is a developer or product person prototyping an LLM chain without writing code. A demo visitor must see the value within 30 seconds, without signing up and without an API key.

Key scenarios:

1. Open the demo → pick a built-in template → press Run → watch the response stream through the nodes.
2. Build a pipeline from scratch: drag nodes from the palette, connect ports, configure properties.
3. See validation errors on the canvas and fix them.
4. Undo and redo actions; copy and paste a fragment of the graph.
5. Export the graph to JSON and import it back, including files saved with an older schema version.
6. Plug in your own API key, run the pipeline against a real model and stop the run.
7. Open the same board in a second tab and edit it collaboratively.

## 3. Functional requirements

**Canvas and nodes**

- Node palette with drag-and-drop onto the canvas.
- Node types: Input, Prompt (template with variables), LLM Call, Transform, Condition (branching), Output.
- Typed ports: connecting incompatible ports is not allowed.
- Zoom, pan, minimap, marquee selection, bulk operations.

**Graph validation**

- Cycles, incompatible ports, unreachable nodes, missing required inputs and fields.
- Errors are highlighted on nodes and edges; a summary list jumps to the offending node.
- Running an invalid graph is blocked.

**Properties panel**

- Form built with React Hook Form + Zod, generated from the node type's schema.
- Instant validation; changes go into the undo history.

**Editing**

- Undo/redo (command pattern), copy/paste, delete, duplicate.
- Keyboard shortcuts with a help overlay.
- Autosave to localStorage.
- JSON import/export with a schema version and a migration chain.
- 2–3 built-in pipeline templates.

**Auto-layout**

- Graph layout with elkjs in a Web Worker, without blocking the UI, with an animated transition.

**Execution**

- Engine: topological sort, parallel execution of independent branches, node statuses (idle, queued, running, done, error, cancelled).
- Step-by-step simulation mode highlighting the active node.
- Mock provider by default: streams fake tokens over SSE, works without a key.
- Real provider through a dedicated SSE proxy (Hono). The user's key lives only in the browser and is never stored on the server.
- Token streaming into the node, cancellation via AbortController, error and timeout handling.

**Collaboration** (last stage)

- Graph sync via Yjs, participant cursors and presence.

## 4. Non-functional requirements

- **Performance:** a 500+ node graph holds 60 FPS while panning and dragging. Validation and layout times are measured and published in the README.
- **Quality:** TypeScript strict, no `any`. Core coverage (validation, undo/redo, migrations, engine) ≥ 80% enforced in CI. 3–5 Playwright e2e scenarios.
- **Accessibility:** keyboard control for the palette, properties panel and main actions; ARIA for controls.
- **Security:** keys are never logged and never sent anywhere except the proxy. The proxy rate-limits requests. No secrets in the repository.
- **Lighthouse CI** in the pipeline with thresholds.
- Latest Chrome, Firefox and Safari; desktop only (mobile shows a placeholder screen).

## 5. Technology

React 19, TypeScript, Vite, @xyflow/react, Zustand, TanStack Query, React Hook Form + Zod, elkjs, Yjs, Hono (SSE proxy), Vitest, Testing Library, Playwright, Storybook, pnpm. UI: Radix + Tailwind CSS (see ADRs).

## 6. Architecture guidelines

- Feature-Sliced Design; layer boundaries are checked by Steiger in CI.
- The core (graph model, validation, engine, undo commands, migrations) is plain TypeScript without React and is tested in isolation.
- Heavy computation (layout, validation of large graphs if needed) runs in a Web Worker.
- Decisions are recorded in [`docs/adr/`](./adr/README.md).

## 7. Repository standard

- GitHub Actions CI: lint → typecheck → Steiger → test (+coverage) → build → e2e → Lighthouse.
- ESLint (flat config), Prettier, Husky + lint-staged, commitlint, Conventional Commits in English.
- Work through branches and PRs with descriptions; roadmap in issues and milestones.
- Renovate, MIT license, `.env.example`.

## 8. Out of scope

Authentication and accounts, server-side graph storage, billing, a mobile editor, a node marketplace.

## 9. Open questions

- Final name and demo domain.
- Which real LLM providers the proxy supports (one or several).
- Exact field set and port types for every node.
