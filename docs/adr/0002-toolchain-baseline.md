# 0002. Toolchain baseline

- Status: Accepted
- Date: 2026-10-12

## Context

The repository standard requires strict TypeScript, ESLint flat config, Prettier, pre-commit hooks and Conventional Commits. In October 2026 the latest major versions do not all fit together:

- TypeScript 7 (the native port) is `latest`, but `typescript-eslint` 8.71 supports `typescript >=4.8.4 <6.1.0`.
- ESLint 10 is current and ESLint 9 is out of maintenance, but `eslint-plugin-jsx-a11y` (last released in 2024) declares peer support only up to ESLint 9.

## Decision

- **TypeScript 6.0** (`6.0.3`, pinned in the pnpm catalog). Renovate keeps it below 6.1 until `typescript-eslint` supports newer versions. All compiler options are set explicitly in `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, …) so default changes between versions do not alter behaviour.
- **ESLint 10** with `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked` using the project service. Accessibility linting for JSX uses `eslint-plugin-jsx-a11y-x`, a maintained fork that supports ESLint 10; runtime checks (axe in Storybook and Playwright) back it up.
- **Prettier** for formatting; ESLint does not format (`eslint-config-prettier`).
- **Husky + lint-staged** run ESLint and Prettier on staged files; **commitlint** enforces Conventional Commits, a scope list and a rule that rejects AI attribution trailers. The PR title is checked with the same config because squash merges use it as the commit subject.
- Plain JS tooling files (configs, Claude Code hooks) are type-checked with `checkJs` and JSDoc.
- Exact versions everywhere (`saveExact`), Node 24 (`.nvmrc`), pnpm pinned via `packageManager`.

## Consequences

- We do not get TypeScript 7 compile speed yet; revisit when `typescript-eslint` adds support (Renovate will surface it).
- The JSX a11y plugin is young; if it stalls, the fallback is the original plugin with a peer-dependency override.
- One commitlint config is the single source of truth for local commits and PR titles.

## Alternatives considered

- **TypeScript 7 with typed linting disabled** — loses the most valuable lint rules (`no-floating-promises`, `no-unsafe-*`, exhaustiveness).
- **ESLint 9** — out of maintenance.
- **Biome instead of ESLint + Prettier** — faster, but no type-aware rules comparable to `typescript-eslint` and no FSD/Storybook/Playwright plugins we rely on.
