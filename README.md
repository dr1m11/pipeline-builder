# Pipeline Builder

> Node-based editor for building and running LLM and data pipelines in the browser.

🚧 **Work in progress** — currently at stage A1 (foundation). See the [roadmap](docs/roadmap.md).

## Features

Planned for the MVP:

- Drag-and-drop canvas with 6 node types and typed ports
- Graph validation (cycles, type mismatches, unreachable nodes) shown on the canvas
- Properties panel generated from node schemas (React Hook Form + Zod)
- Undo / redo, copy / paste, keyboard shortcuts
- JSON import / export with schema migrations
- Pipeline execution with token streaming over SSE and cancellation
- Auto-layout in a Web Worker, 500+ nodes at 60 FPS

## Tech stack

React 19, TypeScript (strict), Vite, React Flow, Radix UI, Tailwind CSS, Vitest, Playwright, Storybook, pnpm workspaces, Cloudflare Workers.

## Architecture

Feature-Sliced Design enforced by Steiger, with the domain core (graph model, validation, engine, undo, migrations) in a separate framework-free package. Decisions are recorded in [`docs/adr/`](docs/adr/README.md).

## Getting started

Requires Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

## License

[MIT](LICENSE)
