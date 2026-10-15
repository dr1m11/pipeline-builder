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
      {
        // The Worker's code runs on workerd; its tests call the Hono app in Node with fake bindings.
        test: {
          name: 'proxy',
          root: './apps/proxy',
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
      // (packages/core, apps/proxy, apps/web), so these patterns cover the sources of all three.
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
