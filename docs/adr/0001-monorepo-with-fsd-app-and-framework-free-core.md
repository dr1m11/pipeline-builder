# 0001. Monorepo with an FSD app and a framework-free core

- Status: Accepted
- Date: 2026-10-12

## Context

The product has three runtime parts with different constraints:

- a React SPA (canvas, panels, UI kit) that will grow to dozens of slices;
- a domain core — graph model, validation, execution engine, undo commands, schema migrations — that must be testable in isolation and is the main target of the 80% coverage gate;
- an SSE proxy (stage A5) that runs on Cloudflare Workers and may reuse core types.

In a single `src/` tree, keeping the core free of React relies on reviewers and lint rules alone, and the proxy would later force a restructure.

## Decision

Use a pnpm workspace from day one:

- `apps/web` — the SPA, organised with Feature-Sliced Design (`app → pages → widgets → features → entities → shared`). Steiger checks the structure in CI (`pnpm lint:fsd`).
- `packages/core` — plain TypeScript, no runtime dependencies, consumed from source (`exports → ./src/index.ts`, no build step). React, DOM, `@xyflow/*`, zustand and Radix imports are banned by ESLint, and its tsconfig has no DOM lib, so browser APIs do not typecheck.
- `apps/proxy` — added in A5; it picks up the `apps/*` glob, extends `tsconfig.base.json` and imports `@pipeline-builder/core` the same way.

Shared versions live in the pnpm `catalog`; shared compiler options live in `tsconfig.base.json`.

## Consequences

- Core purity is structural: the package cannot resolve React because it does not depend on it.
- Coverage thresholds apply to `packages/core/src/**` only, so UI code does not dilute or inflate the domain metric.
- FSD slices in `apps/web` stay thin: they adapt core functions to React (stores, hooks, components).
- Slightly more configuration (workspace, per-package tsconfig and scripts) than a single app.
- Source-first packages mean every consumer must compile TypeScript; Vite, Vitest and Wrangler all do.

## Alternatives considered

- **Single Vite app with the core in `src/shared` or `src/entities`** — simpler start, but purity depends on lint rules only, and A5 would need a restructure anyway.
- **Building `packages/core` to `dist/`** — adds a build step and watch mode for no benefit while there are no external consumers.
- **Nx / Turborepo** — task caching is not needed at this size; pnpm filters cover orchestration.
