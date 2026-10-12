// PostToolUse (Edit|Write): formats the touched file with Prettier and auto-fixes it with ESLint.
// Remaining ESLint errors are reported back to Claude (exit 2) so they get fixed in the same turn.
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  fail,
  firstLines,
  isMain,
  PROJECT_DIR,
  projectRelative,
  readInput,
  resolveBin,
  runNode,
} from './_lib.mjs';

const PRETTIER_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.css',
  '.yml',
  '.yaml',
  '.html',
]);
const ESLINT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const ESLINT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'];
const MAX_REPORTED_ERRORS = 30;

/**
 * @typedef {{ severity: number, line?: number, column?: number, message: string, ruleId?: string | null }} EslintMessage
 * @typedef {{ filePath: string, messages: EslintMessage[] }} EslintResult
 */

/**
 * Turn ESLint JSON output into `file:line:col message (rule)` lines, errors only.
 * @param {EslintResult[]} results
 * @param {string} [root]
 */
export function formatEslintErrors(results, root = PROJECT_DIR) {
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.severity === 2)
      .map(
        (message) =>
          `${projectRelative(result.filePath, root) ?? result.filePath}:${message.line ?? 0}:${message.column ?? 0} ` +
          `${message.message}${message.ruleId ? ` (${message.ruleId})` : ''}`,
      ),
  );
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  const rel = projectRelative(input.tool_input?.file_path);
  if (rel === null) process.exit(0);

  const extension = path.extname(rel).toLowerCase();
  const problems = [];

  const prettier = resolveBin('prettier');
  if (prettier && PRETTIER_EXTENSIONS.has(extension)) {
    const result = runNode(prettier, ['--write', '--ignore-unknown', '--log-level', 'warn', rel]);
    if (result.status !== 0) {
      problems.push(
        `Prettier could not format ${rel}:\n${firstLines(result.stderr || result.stdout, 15)}`,
      );
    }
  }

  const eslint = resolveBin('eslint');
  const hasEslintConfig = ESLINT_CONFIGS.some((name) => existsSync(path.join(PROJECT_DIR, name)));
  if (eslint && hasEslintConfig && ESLINT_EXTENSIONS.has(extension)) {
    const result = runNode(eslint, [
      '--fix',
      '--cache',
      '--cache-location',
      'node_modules/.cache/eslint/',
      '--no-warn-ignored',
      '--format',
      'json',
      rel,
    ]);
    if (result.status === 0 || result.status === 1) {
      try {
        const errors = formatEslintErrors(JSON.parse(result.stdout));
        if (errors.length > 0) {
          const shown = errors.slice(0, MAX_REPORTED_ERRORS).join('\n');
          const more =
            errors.length > MAX_REPORTED_ERRORS
              ? `\n… ${errors.length - MAX_REPORTED_ERRORS} more`
              : '';
          problems.push(`ESLint errors remain in ${rel} after --fix:\n${shown}${more}`);
        }
      } catch {
        problems.push(
          `ESLint output for ${rel} was not valid JSON:\n${firstLines(result.stdout, 10)}`,
        );
      }
    } else {
      problems.push(`ESLint failed on ${rel}:\n${firstLines(result.stderr || result.stdout, 15)}`);
    }
  }

  if (problems.length > 0) fail(problems.join('\n\n'));
}
