---
paths:
  - 'apps/web/src/**'
---

# Feature-Sliced Design in apps/web

- Layers, top to bottom: `app`, `pages`, `widgets`, `features`, `entities`, `shared`. A module may import only from layers below it.
- `app` and `shared` have no slices, only segments. Every other layer is split into slices (`pages/editor`, `features/toggle-theme`, `entities/node`).
- Segment names: `ui` (components), `model` (state, stores, domain glue), `lib` (helpers), `api` (I/O), `config` (constants).
- Slice and folder names are kebab-case. React component files are PascalCase (`NodeCard.tsx`); everything else is kebab-case.
- Each slice exposes a public API in `index.ts` that re-exports only what other layers consume. Never deep-import another slice (`@/features/x/model/store` ✗ → `@/features/x` ✓).
- No imports between slices of the same layer. If two features need the same thing, move it down (entity or shared). Cross-entity `@x` imports are not used yet.
- `shared/ui/<component>/index.ts` is the public API for each UI-kit component; import them as `@/shared/ui/button`.
- `app/` has no `ui` segment; providers live in `app/providers`, global styles in `app/styles`.
- Domain logic belongs in `packages/core`, not in slices. Slices adapt core to React (stores, hooks, components).
- Use the `@/` alias for cross-layer imports and relative imports inside a slice.
- After structural changes run `pnpm lint:fsd` and fix every finding.
