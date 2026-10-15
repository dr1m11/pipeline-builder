# Pipeline Builder

Browser-based node editor for building and running LLM/data pipelines: React Flow canvas, typed ports, graph validation, undo/redo, schema migrations, SSE streaming execution. Portfolio project, public repo.
Product scope: `docs/product-spec.md`. Stages and current stage: `docs/roadmap.md` (also GitHub milestones). Decisions: `docs/adr/`.

## Commands (run from the repo root)

| Command                            | What it does                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                         | Vite dev server for `apps/web` plus `wrangler dev` of `apps/proxy` on :8787 (Vite proxies `/api/` to it)   |
| `pnpm verify`                      | format check → lint → Steiger → typecheck → unit tests → hook tests → build. **Must be green before a PR** |
| `pnpm verify:full`                 | `verify` + Storybook tests + Playwright e2e                                                                |
| `pnpm lint` / `pnpm lint:fsd`      | ESLint / Steiger (FSD boundaries)                                                                          |
| `pnpm typecheck`                   | `tsc` across the workspace                                                                                 |
| `pnpm test` / `pnpm test:coverage` | Vitest projects `core` + `proxy` + `web` (core coverage gate 80%)                                          |
| `pnpm test:storybook`              | Stories as tests in Vitest browser mode                                                                    |
| `pnpm test:e2e`                    | Playwright against the built Worker (`wrangler dev` of `apps/proxy` on :8788, SPA + `/api`)                |
| `pnpm storybook`                   | Storybook on :6006 (also enables the `storybook` MCP server)                                               |
| `pnpm format`                      | Prettier write                                                                                             |

## Monorepo

- `apps/web` — React 19 SPA, Feature-Sliced Design. Deployed to Cloudflare Workers static assets.
- `packages/core` — framework-free domain: graph model, validation, engine, undo commands, migrations.
- `apps/proxy` — Hono LLM proxy (SSE): the script of the same Worker that serves the SPA, on `/api/*` (ADR 0012).

## Architecture rules

- FSD layers: `app → pages → widgets → features → entities → shared`. Import only from lower layers.
- Use a slice only through its `index.ts` public API. No imports between slices of the same layer.
- `shared/ui/<component>/index.ts` is the public API of each UI-kit component.
- Steiger (`pnpm lint:fsd`) is the judge of FSD structure; fix its findings, do not silence them.
- `packages/core` never imports React, DOM APIs, `@xyflow/*`, zustand or `radix-ui`. Its tsconfig has no DOM lib.

## TypeScript

- Strict mode. No `any`, no non-null `!`, no `as` casts except at validated boundaries (e.g. after Zod parse).
- Named exports only; default exports only where a tool requires them (configs, stories).
- `import type` for type-only imports.

## Testing

- Tests live next to the code as `*.test.ts(x)`. RTL queries by role and accessible name; no markup snapshots.
- Every `shared/ui` component has a story and a test. Every change in `packages/core` comes with tests.

## Git and PRs

- Branch per task: `<type>/<kebab-summary>` (e.g. `feat/node-palette`). Never commit to `main`.
- Conventional Commits in English: `type(scope): summary`. Scopes are listed in `commitlint.config.js`.
- **Never add AI attribution** — no `Co-Authored-By: Claude`, no "Generated with Claude Code" — in commits, PRs or issues.
- Open PRs with `gh pr create` using `.github/pull_request_template.md`; link the issue with `Closes #N`.
- Use `/ship` to branch → verify → commit → push → open the PR.

## Working agreements

- Look up library APIs with `npx ctx7@latest` before relying on memory (versions here are newer than most training data).
- Ask before adding, removing or upgrading dependencies. Never edit `pnpm-lock.yaml` by hand.
- Architectural decisions get an ADR (`/adr <title>`).
- Definition of done: `pnpm verify` green, tests and stories updated, docs/ADR updated when behaviour or architecture changed.
