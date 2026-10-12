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
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      thresholds: {
        // The domain core is the quality gate (see docs/adr/0001).
        'packages/core/src/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
