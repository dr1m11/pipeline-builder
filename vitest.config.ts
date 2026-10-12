import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      'apps/web/vitest.config.ts',
      'apps/web/vitest.storybook.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.stories.tsx', '**/index.ts', 'apps/web/src/main.tsx'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        // The domain core is the quality gate (see docs/adr/0001).
        'packages/core/src/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
