import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      // While the app is small, many slices have a single consumer. Revisit after A4 (MVP).
      'fsd/insignificant-slice': 'warn',
    },
  },
]);
