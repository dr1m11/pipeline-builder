import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineProject, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

// Every story runs as a test in a real browser: render + play function + axe checks.
export default mergeConfig(
  viteConfig,
  defineProject({
    plugins: [
      storybookTest({
        configDir: path.join(import.meta.dirname, '.storybook'),
        storybookScript: 'pnpm storybook --ci',
      }),
    ],
    test: {
      name: 'storybook',
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
    },
  }),
);
