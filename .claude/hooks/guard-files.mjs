// PreToolUse (Edit|Write): protects secrets, the lockfile and generated output from direct edits.
import { fail, isMain, projectRelative, readInput } from './_lib.mjs';

const GENERATED_DIRS = new Set([
  'node_modules',
  'dist',
  'storybook-static',
  'coverage',
  'playwright-report',
  'test-results',
  'blob-report',
  '.wrangler',
  '.git',
]);

/**
 * @param {string | null} rel project-relative POSIX path (null = outside the project)
 * @returns {string | null} reason to block, or null to allow
 */
export function checkPath(rel) {
  if (rel === null) return null;
  const parts = rel.split('/');
  const name = parts.at(-1) ?? '';

  if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
    return `${rel} may contain secrets. Edit .env.example instead and ask the user to update local env files.`;
  }
  if (name.startsWith('.dev.vars')) {
    return `${rel} holds local Worker secrets. Ask the user to edit it.`;
  }
  if (name === 'pnpm-lock.yaml') {
    return 'pnpm-lock.yaml is generated. Change package.json and run pnpm install instead.';
  }
  if (name.endsWith('.tsbuildinfo')) {
    return `${rel} is a generated TypeScript build artifact.`;
  }
  const generated = parts.slice(0, -1).find((part) => GENERATED_DIRS.has(part));
  if (generated) {
    return `${rel} is inside generated directory "${generated}/". Change the source instead.`;
  }
  return null;
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  const reason = checkPath(projectRelative(input.tool_input?.file_path));
  if (reason) fail(`Blocked by .claude/hooks/guard-files.mjs: ${reason}`);
}
