# Pipeline Builder

> Node-based editor for building and running LLM and data pipelines in the browser.

[![CI](https://github.com/dr1m11/pipeline-builder/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dr1m11/pipeline-builder/actions/workflows/ci.yml)
[![Deploy](https://github.com/dr1m11/pipeline-builder/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/dr1m11/pipeline-builder/actions/workflows/deploy.yml)
[![Storybook](https://github.com/dr1m11/pipeline-builder/actions/workflows/storybook.yml/badge.svg?branch=main)](https://dr1m11.github.io/pipeline-builder/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Live demo](https://pipeline-builder.marat-gabdrashitov17.workers.dev)** · **[Storybook](https://dr1m11.github.io/pipeline-builder/)** · **[Roadmap](docs/roadmap.md)** · **[Architecture decisions](docs/adr/README.md)**

> 🚧 Work in progress. Stages A1–A4 are done, and the MVP is live in the [demo](https://pipeline-builder.marat-gabdrashitov17.workers.dev): build, validate and edit pipelines, with undo, files and autosave. Execution comes next, with stage A5. Progress is tracked in [milestones](https://github.com/dr1m11/pipeline-builder/milestones).

## Features

Available now:

- Canvas with 6 node types (Input, Prompt, LLM Call, Transform, Condition, Output) and typed ports: incompatible ports cannot be connected, and compatible ones light up while you connect
- Node palette: drag a node onto the canvas or add it from the keyboard
- Shift-drag a rectangle or Ctrl/⌘-click to select several nodes, then move or delete them together; minimap, zoom and pan
- Keyboard and screen-reader support on the canvas: nodes, ports and edges have readable names, and ports connect with Enter
- Live graph validation: cycles, type mismatches, unconnected inputs, invalid settings and nodes whose result reaches no Output are marked on nodes, ports and edges; edges to a removed template variable stay drawn and reported; a Problems list jumps to the node, edge or field to fix
- Properties panel generated from each node type's Zod schema (React Hook Form): changes apply as you type, with the same messages as on the canvas
- Undo / redo of every change, named on the buttons ("Undo Move 3 nodes"); a burst of typing in a field or of nudging nodes is one step
- Copy, cut, paste and duplicate nodes with the edges between them, also from one browser tab to another
- Keyboard shortcuts, all listed in a help dialog that opens on `?`
- Autosave in the browser: the pipeline is restored when you come back
- JSON import / export with a schema version: files saved by an older version are updated by a chain of migrations (v1 → v2) as they open
- Three built-in templates, offered on the empty canvas and in the New menu, which also starts a blank pipeline
- Light/dark themes without a flash, desktop-only gate
- UI kit on Radix primitives and design tokens, documented in Storybook
- Every pull request gets its own preview deployment

Planned (A5 onward):

- Execution: a mock provider that needs no key or your own API key through an SSE proxy, tokens streaming into the nodes, cancellation (A5)
- Auto-layout in a Web Worker and 500+ nodes at 60 FPS (A6)
- Real-time collaboration with Yjs (A9)

## Tech stack

React 19 · TypeScript (strict) · Vite · React Flow · React Hook Form · Zod · Radix UI · Tailwind CSS · Vitest · Testing Library · Playwright · Storybook · pnpm workspaces · Hono · Cloudflare Workers

## Architecture

```
apps/web/              React SPA, Feature-Sliced Design (checked by Steiger)
  src/app/             composition root: error handling, device support, theme, global styles
  src/pages/           editor page, autosave
  src/widgets/         pipeline canvas, inspector
  src/features/        user actions (add-node, edit-node-properties, edit-selection, undo-redo,
                       import-export, load-template, review-problems, show-shortcuts, toggle-theme)
  src/entities/        pipeline store with the undo history, node cards
  src/shared/          UI kit, helpers, config
apps/proxy/            Hono Worker: the LLM proxy on /api/* (SSE); serves the SPA build as assets
packages/core/         framework-free domain: graph model, validation, engine, undo, migrations
docs/adr/              architecture decision records
```

- **Feature-Sliced Design** with layer boundaries enforced by [Steiger](https://github.com/feature-sliced/steiger) in CI.
- **Framework-free core.** Domain logic lives in `packages/core`, which cannot import React or browser APIs (lint rule plus a tsconfig without the DOM lib) and has its own 80% coverage gate. See [ADR 0001](docs/adr/0001-monorepo-with-fsd-app-and-framework-free-core.md).
- **One source of truth for the graph.** The core `Pipeline` document lives in a zustand store and changes only through pure core operations; React Flow is a controlled view of it, and a drag reaches the document once, on drop. See [ADR 0006](docs/adr/0006-canvas-state-core-document-and-react-flow-view.md).
- **Typed ports.** Every node kind declares its ports in core, and one rule decides which ports may connect. The canvas checks it while you connect and again before it adds an edge. See [ADR 0005](docs/adr/0005-node-catalogue-and-typed-ports.md).
- **Undo through commands.** Every change to the document is a typed core command, and the history keeps the document before and after each one. Snapshots are cheap because untouched nodes stay the same objects; bursts such as typing merge into one step. See [ADR 0009](docs/adr/0009-undo-redo-commands-with-snapshot-history.md).
- **Versioned pipeline files.** Export, import, autosave and the clipboard share one JSON format with a schema version and one parser: files from older versions pass through a chain of migrations, are checked with Zod, and connections the editor cannot keep are dropped and reported. See [ADR 0010](docs/adr/0010-pipeline-files-and-schema-migrations.md).
- **One set of rules for forms and validation.** Each node kind describes its data with Zod schemas in core; the properties form and graph validation check the same rules, so the form and the canvas always agree. See [ADR 0007](docs/adr/0007-zod-schemas-for-node-data-in-core.md) and [ADR 0008](docs/adr/0008-graph-validation.md).
- **Design tokens** as CSS variables exposed through Tailwind utilities; components never use raw colours. See [ADR 0004](docs/adr/0004-ui-stack-radix-and-tailwind.md).
- **One Worker, one origin.** Cloudflare Workers serves the SPA as static assets and runs the LLM proxy on `/api/*`, so there is no CORS and the CSP keeps `connect-src 'self'`. The proxy streams answers over SSE, rate-limits requests, and sends the user's API key only to the provider, never storing or logging it. See [ADR 0003](docs/adr/0003-hosting-on-cloudflare-workers.md) and [ADR 0012](docs/adr/0012-llm-proxy-same-origin-worker.md).

## Quality gates

Every pull request runs:

| Check            | What it enforces                                                                |
| ---------------- | ------------------------------------------------------------------------------- |
| Lint & typecheck | Prettier, ESLint with type-aware rules, Steiger, TypeScript strict (no `any`)   |
| Unit tests       | Vitest + Testing Library; ≥ 80% coverage on `packages/core`, reported on the PR |
| Storybook tests  | Every story renders and runs its interaction test in Chromium, with axe checks  |
| E2E              | Playwright against the production build, with axe and a console-error guard     |
| PR title         | Conventional Commits (the squash-merge commit message)                          |
| Preview          | A deployed preview URL commented on the PR                                      |

`main` is protected: changes land only through squash-merged pull requests with green checks.

## Getting started

Requires Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:5173, with the API from wrangler dev on :8787
pnpm storybook    # http://localhost:6006
```

| Script                 | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm verify`          | Format check, lint, Steiger, typecheck, unit tests, build      |
| `pnpm verify:full`     | `verify` plus Storybook tests and e2e                          |
| `pnpm test`            | Unit tests (`core`, `proxy` and `web` projects)                |
| `pnpm test:coverage`   | Unit tests with coverage thresholds                            |
| `pnpm test:storybook`  | Stories as browser tests (requires `playwright install`)       |
| `pnpm test:e2e`        | Playwright e2e against `vite preview` (run `pnpm build` first) |
| `pnpm build-storybook` | Static Storybook in `apps/web/storybook-static`                |

## Performance

Benchmarks (FPS while panning, validation and layout times for 100–1000 nodes) will be published here with stage A6.

## Working on this repository

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint; every change goes through a pull request. The repository also ships a [Claude Code](https://code.claude.com) setup — project rules in `CLAUDE.md` and `.claude/` (path-scoped rules, skills, guard and formatting hooks) — that encodes the same conventions for AI-assisted work.

## License

[MIT](LICENSE) © Marat Gabdrashitov
