---
name: ui-component
description: Add a UI-kit component to apps/web/src/shared/ui built on Radix primitives and Tailwind design tokens, with cva variants, a Storybook story with play-function tests, and an RTL test. Use when a reusable control (button, input, menu, dialog, badge…) is needed.
argument-hint: <ComponentName> [radix primitive, e.g. Tooltip]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(pnpm test*), Bash(pnpm lint*), Bash(pnpm typecheck*), Bash(npx ctx7@latest *), mcp__storybook
---

# Create a shared/ui component

Arguments: `$ARGUMENTS`.

1. Read `.claude/rules/ui-kit.md` and one existing component in `apps/web/src/shared/ui/` to match the established pattern.
2. If the `storybook` MCP server is available, fetch its story-writing instructions first. If a Radix primitive is named, check its current API with `npx ctx7@latest` (import it from the `radix-ui` package).
3. Create `apps/web/src/shared/ui/<kebab-name>/`:
   - `<Name>.tsx` — named export, `ref` as a regular prop, remaining props spread on the root, `className` merged last via `cn()`. Variants with `cva`; only token classes (no raw colours). Visible `focus-visible` ring, hit area ≥ 24px. Icon-only controls require a `label` prop.
   - `<Name>.stories.tsx` — CSF3 `satisfies Meta<typeof Name>`, title `shared/ui/<Name>`, `tags: ['autodocs']`, one story per variant/state, at least one `play` function that exercises keyboard interaction.
   - `<Name>.test.tsx` — RTL + `userEvent.setup()`: accessible name/role, keyboard operation, disabled state, `asChild` if supported.
   - `index.ts` — exports the component and its props type.
4. Accessibility checklist: correct role, accessible name, keyboard support matching the WAI-ARIA pattern, focus management (dialogs/menus return focus), colour contrast via tokens in both themes.
5. Run `pnpm test`, `pnpm test:storybook` and `pnpm lint`; fix all failures, including a11y violations.
6. Summarize the API (props and variants) in 3–5 lines.
