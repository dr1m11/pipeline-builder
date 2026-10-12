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
      // Vitest 5 matches include/exclude against paths relative to each project's root
      // (packages/core, apps/web), so these patterns cover the sources of both projects.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.stories.tsx', '**/index.ts', 'src/main.tsx'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        // The domain core is the quality gate (see docs/adr/0001).
        // Unlike include/exclude, threshold globs match paths relative to the repository root.
        'packages/core/src/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
