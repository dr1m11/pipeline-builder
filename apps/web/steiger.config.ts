import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      // Reviewed after A4 (MVP). The app has a single page, so every widget and feature has exactly
      // one consumer: the editor page, or the inspector for the properties form and the problem
      // list. Following FSD 2.1 "pages first", the rule would fold them all into pages/editor. We
      // keep the editor split into widgets (its large blocks) and features (one per user action)
      // instead: each stays small, behind its public API, with its own tests and stories, and
      // cannot import the slices beside it. A warning rather than off, as the rule also reports
      // slices that nothing uses. Revisit when the app gets a second page.
      'fsd/insignificant-slice': 'warn',
    },
  },
]);
