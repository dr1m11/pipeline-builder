# 0004. UI stack: Radix primitives, Tailwind CSS and CSS-variable tokens

- Status: Accepted
- Date: 2026-10-12

## Context

The editor needs a small, consistent UI kit (buttons, menus, dialogs, form controls, tooltips) and must stay fast with 500+ nodes on the canvas: every node is a React component, so per-render styling cost multiplies. Two themes (light/dark) are required, and the kit is documented and tested in Storybook.

Candidates were a component library with runtime CSS-in-JS (MUI + Emotion) or unstyled accessible primitives with utility CSS (Radix + Tailwind).

## Decision

- **Behaviour:** Radix primitives from the unified `radix-ui` package (focus management, keyboard support, ARIA patterns).
- **Styling:** Tailwind CSS 4 via `@tailwindcss/vite`. No runtime styling cost; unused utilities are not shipped.
- **Tokens:** semantic CSS variables (`--pb-canvas`, `--pb-surface`, `--pb-fg`, `--pb-accent`, …) defined per theme in `src/app/styles/tokens.css`, exposed to Tailwind with `@theme inline` (`bg-surface`, `text-fg-muted`, `ring-focus`). Components use token utilities only; raw colours are not allowed in `shared/ui`.
- **Theming:** `[data-theme]` on `<html>`. A tiny external script (`public/theme-init.js`) applies the stored preference before first paint; `useTheme` keeps it in sync with the stored choice and the OS setting. React Flow's `--xy-*` variables are mapped to the same tokens.
- **Variants:** `class-variance-authority` with a `cn()` helper (`clsx` + `tailwind-merge`).
- **Storybook 10** documents the kit; stories run as Vitest browser tests with axe (`a11y.test = 'error'`), in both CI and locally.

## Consequences

- Styling has zero runtime cost, which matters for large graphs; theme switches are a single attribute change.
- The kit is ours: components are small and readable, but we maintain their styles and variants.
- Tokens are the single source for colours across app, canvas and Storybook.
- Class strings are long; Prettier sorts them and `cva` keeps variants declarative.

## Alternatives considered

- **MUI + Emotion** — rich components out of the box, but runtime CSS-in-JS adds per-render cost on a canvas with hundreds of nodes, a larger bundle, and theme overrides spread across `sx`/`styled` calls. Emotion's runtime model also fits poorly with where React is heading.
- **shadcn/ui generator** — same foundations (Radix + Tailwind); copying generated components adds more surface than this project needs. The same patterns are applied by hand.
- **CSS Modules** — no runtime cost either, but no shared scale/tokens utilities and more files per component.
