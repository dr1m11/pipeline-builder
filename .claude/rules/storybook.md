---
paths:
  - "**/*.stories.tsx"
  - "**/*.mdx"
  - "apps/web/.storybook/**"
---

# Storybook conventions

- If the `storybook` MCP server is connected (`pnpm storybook` running), call its story-writing instructions tool first and follow it.
- CSF3: `const meta = { component: X, ... } satisfies Meta<typeof X>; export default meta; type Story = StoryObj<typeof meta>;`
- Title follows the FSD path: `shared/ui/Button`, `features/ToggleTheme`.
- `tags: ['autodocs']` on every meta. Keep `args` minimal and realistic; cover each variant and state (disabled, loading, error) with its own story.
- Interactions and assertions go in `play` functions using `storybook/test` (`expect`, `userEvent`, `within`). Stories run as tests in Vitest browser mode (`pnpm test:storybook`).
- Accessibility violations fail the run (`parameters.a11y.test = 'error'`). Fix the component; disable a rule per story only with a comment explaining why.
- Stories render in both themes via the toolbar; never hard-code a theme inside a story.
