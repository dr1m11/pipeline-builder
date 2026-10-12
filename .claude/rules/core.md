---
paths:
  - 'packages/core/**'
---

# packages/core — framework-free domain

- Plain TypeScript only: no React, DOM, `window`, `localStorage`, timers, `@xyflow/*`, zustand or `radix-ui`. ESLint and the tsconfig (no DOM lib) enforce this.
- Prefer pure functions over classes; data is immutable (`readonly` types, return new objects instead of mutating).
- Expected failures (invalid graph, unknown schema version, incompatible ports) return `Result<T, E>` from `src/result.ts`; reserve `throw` for programmer errors and use `assertNever` for exhaustive switches.
- Everything exported from `src/index.ts` is public API: give it a short TSDoc comment and tests.
- Serialized data carries `schemaVersion`. Changing a persisted shape means bumping the version and adding a migration with tests.
- Coverage gate is 80% for lines, branches, functions and statements; aim for 100% on validation, commands and migrations.
- Tests are colocated (`foo.ts` → `foo.test.ts`) and run in the `core` Vitest project (Node environment).
