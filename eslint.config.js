// @ts-check
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import storybook from 'eslint-plugin-storybook';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/storybook-static/',
    '**/playwright-report/',
    '**/test-results/',
    '**/.wrangler/',
    '.local/',
    // Git worktrees of Claude Code agents: full checkouts that lint themselves.
    '.claude/worktrees/',
  ]),
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
      ],
    },
  },
  {
    // Plain JS here is tooling (configs, Claude hooks): Node globals, no type-aware rules.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // Classic scripts served as-is to the browser (e.g. the pre-paint theme script).
    files: ['apps/web/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    // Tools that load their config through a default export.
    files: ['**/*.config.{js,mjs,ts,mts}', '**/.storybook/**', '**/*.stories.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.stories.tsx'],
    // The plugin's rule types come from @typescript-eslint/utils and do not match ESLint 10's Plugin type.
    extends: [
      /** @type {import('eslint').Linter.Config[]} */ (storybook.configs['flat/recommended']),
    ],
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [
      eslintReact.configs['recommended-type-checked'],
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite(),
      jsxA11y.configs.recommended,
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    extends: [vitest.configs.recommended],
  },
  {
    files: ['apps/web/e2e/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                '@xyflow/*',
                'zustand',
                'zustand/*',
                'radix-ui',
                '@radix-ui/*',
              ],
              message: 'packages/core must stay framework-free (see docs/adr/0001).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage'].map((name) => ({
          name,
          message: 'packages/core must not depend on browser APIs.',
        })),
      ],
    },
  },
  prettier,
);
