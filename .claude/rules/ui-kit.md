---
paths:
  - "apps/web/src/shared/ui/**"
  - "apps/web/src/app/styles/**"
---

# UI kit (Radix + Tailwind CSS 4)

- Behaviour comes from Radix primitives imported from the unified `radix-ui` package; styling is ours.
- Colours, radii, shadows and fonts only through design tokens (`bg-surface`, `text-fg`, `border-border`, `ring-focus`…). No raw hex/rgb/oklch values or arbitrary colour classes in components; add a token in `tokens.css` instead.
- Variants via `cva`, class merging via `cn()` from `@/shared/lib/cn`. Accept `className` and merge it last.
- React 19: `ref` is a regular prop — no `forwardRef`. Spread remaining props onto the root element.
- Polymorphism via `asChild` + Radix `Slot`, not `as` props.
- Every interactive element has a visible `focus-visible` ring and a hit area of at least 24×24px.
- Icon-only controls take a required `label` prop used for `aria-label` (and the tooltip).
- One component per folder: `Name.tsx`, `Name.stories.tsx`, `Name.test.tsx`, `index.ts`. Use `/ui-component` to scaffold.
