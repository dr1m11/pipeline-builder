---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "apps/web/e2e/**"
---

# Testing conventions

- Vitest with explicit imports (`import { describe, expect, it, vi } from 'vitest'`); globals are off.
- Name tests by behaviour: `it('rejects an edge between incompatible ports')`.
- React components: Testing Library. Query by role and accessible name (`getByRole('button', { name: 'Run' })`); fall back to label/text, never to class names or test ids unless there is no accessible handle.
- User interaction via `const user = userEvent.setup()` and `await user.click(...)`, not `fireEvent`.
- No snapshot tests of markup. Assert on behaviour and accessible output.
- Mock at module boundaries only (network, workers, time). Use `vi.useFakeTimers()` for time-based logic and restore afterwards.
- Playwright e2e: import `test`/`expect` from `e2e/fixtures.ts` — it fails the test on console errors and provides `expectNoA11yViolations()`.
- Locate elements with `getByRole`/`getByLabel`; never use `waitForTimeout`, wait for state with web-first assertions.
- Keep e2e scenarios few and end-to-end (user journeys from `docs/product-spec.md`); push edge cases down to unit tests.
