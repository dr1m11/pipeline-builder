// Shared helpers for Claude Code hooks. Plain Node ESM, no dependencies, works on Windows and POSIX.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT_DIR = path.resolve(
  process.env.CLAUDE_PROJECT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'),
);

/** Matches AI attribution trailers we never allow in commits, PRs or issues. */
export const AI_ATTRIBUTION_RE =
  /co-authored-by:[^\n]*(claude|anthropic)|noreply@anthropic\.com|generated with \[?claude/i;

/** True when the module is executed directly (`node file.mjs`), false when imported by tests. */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  return entry !== undefined && importMetaUrl === pathToFileURL(path.resolve(entry)).href;
}

export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

/** Project-relative POSIX path, or null when the file is outside the project. */
export function projectRelative(file, root = PROJECT_DIR) {
  if (!file) return null;
  const rel = path.relative(root, path.resolve(root, file));
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** Resolve a package's JS bin inside the project's node_modules (avoids spawning .cmd shims on Windows). */
export function resolveBin(pkg, binName = pkg) {
  const pkgJsonPath = path.join(PROJECT_DIR, 'node_modules', pkg, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;
  const { bin } = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const rel = typeof bin === 'string' ? bin : bin?.[binName];
  return rel ? path.join(path.dirname(pkgJsonPath), rel) : null;
}

export function runNode(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

export function git(args, cwd = PROJECT_DIR) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Exit with code 2 so Claude Code shows the reason to Claude (blocks PreToolUse/Stop). */
export function fail(message) {
  process.stderr.write(`${message.trim()}\n`);
  process.exit(2);
}

export function firstLines(text, count) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.slice(0, count).join('\n');
  return lines.length > count ? `${head}\n… ${lines.length - count} more line(s)` : head;
}
