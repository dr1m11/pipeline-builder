---
name: fsd-slice
description: Scaffold a Feature-Sliced Design slice in apps/web (pages, widgets, features or entities) with segments, a public API, and test/story stubs. Use when adding a new page, widget, feature or entity.
argument-hint: <layer>/<slice-name> [segments, default "ui model"]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(pnpm lint:fsd*), Bash(pnpm test*), Bash(pnpm typecheck*)
---

# Create an FSD slice

Arguments: `$ARGUMENTS` — e.g. `features/run-pipeline ui model` or `entities/node`.

1. Parse `<layer>/<slice>`. Layer must be one of `pages`, `widgets`, `features`, `entities` (`app` and `shared` have no slices — refuse and explain). Slice name must be kebab-case.
2. Check `apps/web/src/<layer>/<slice>` does not exist yet, and look at one or two existing slices on the same layer to match their style.
3. Create only the segments requested (default `ui model`):
   - `ui/<PascalName>.tsx` — a minimal named-export component, plus `ui/<PascalName>.test.tsx` (RTL, query by role) and `ui/<PascalName>.stories.tsx` (CSF3, title `<layer>/<PascalName>`, `tags: ['autodocs']`).
   - `model/` — start with one file for the slice's state or logic and its colocated test. Domain rules belong in `packages/core`; the model segment adapts them to React.
   - `lib/`, `api/`, `config/` — only if asked.
4. Create `index.ts` exporting only what other layers will consume (usually the main component and its prop type, or a hook).
5. Wire the slice into its consumer through the public API (`@/<layer>/<slice>`) if the user named one.
6. Run `pnpm lint:fsd`, `pnpm typecheck` and `pnpm test`; fix every finding before reporting.
7. Report the created files and the public API in a short list.
