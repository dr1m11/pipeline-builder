// PreToolUse (Bash|PowerShell): keeps git/gh usage within the repo's workflow rules.
import { AI_ATTRIBUTION_RE, fail, git, isMain, PROJECT_DIR, readInput } from './_lib.mjs';

const CONVENTIONAL_TITLE_RE =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: \S.*$/;

/**
 * Replace heredoc bodies, PowerShell here-strings and quoted strings so flags inside messages are ignored.
 * @param {string} command
 */
export function stripQuoted(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '<<HEREDOC')
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '""')
    .replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');
}

/** @param {string} command */
function segments(command) {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** @param {string} command */
function extractTitle(command) {
  const match = /(?:--title|-t)(?:\s+|=)("(?:\\.|[^"\\])*"|'[^']*'|\S+)/.exec(command);
  return match?.[1]?.replace(/^(["'])([\s\S]*)\1$/, '$2') ?? null;
}

/**
 * @param {string} command
 * @param {{ branch: string | null, hasOrigin: boolean }} context
 * @returns {string | null} reason to block, or null to allow
 */
export function checkCommand(command, { branch, hasOrigin }) {
  if (!/\b(git|gh)\b/.test(command)) return null;

  const writesHistory =
    /\bgit\b[\s\S]*\bcommit\b/.test(command) ||
    /\bgh\s+(pr|issue)\s+(create|edit|comment)\b/.test(command) ||
    /\bgh\s+api\b/.test(command);
  if (writesHistory && AI_ATTRIBUTION_RE.test(command)) {
    return 'AI attribution (Co-Authored-By: Claude / noreply@anthropic.com / "Generated with Claude") is not allowed in commits, PRs or issues. Remove it and retry.';
  }

  let createsBranch = false;
  for (const segment of segments(stripQuoted(command))) {
    if (/\bgit\s+(switch\s+(-c|-C|--create)|checkout\s+-[bB])\b/.test(segment))
      createsBranch = true;

    const commit = /\bgit\s+(?:-[cC]\s+\S+\s+)*commit\b(.*)$/.exec(segment);
    if (commit) {
      const args = commit[1] ?? '';
      if (/(^|\s)--no-verify\b/.test(args) || /(^|\s)-[a-zA-Z]*n[a-zA-Z]*\b/.test(args)) {
        return 'Skipping git hooks (--no-verify / -n) is not allowed. Fix the reported problem instead.';
      }
      if (branch === 'main' && hasOrigin && !createsBranch) {
        return 'Do not commit directly to main. Create a branch first: git switch -c <type>/<kebab-summary>.';
      }
    }

    const push = /\bgit\s+(?:-[cC]\s+\S+\s+)*push\b(.*)$/.exec(segment);
    if (push) {
      const args = push[1] ?? '';
      if (/(^|\s)--no-verify\b/.test(args)) {
        return 'Skipping git hooks (--no-verify) is not allowed.';
      }
      if (/(^|\s)(--force(?![-\w])|-[a-zA-Z]*f[a-zA-Z]*\b)/.test(args) || /(^|\s)\+\S/.test(args)) {
        return 'Plain force push is not allowed. On a feature branch use --force-with-lease.';
      }
      if (
        /--force-with-lease|--force-if-includes/.test(args) &&
        (/\bmain\b/.test(args) || branch === 'main')
      ) {
        return 'Force-pushing main is not allowed.';
      }
    }

    if (/\bgh\s+pr\s+create\b/.test(segment)) {
      const title = extractTitle(command);
      if (title === null) {
        return 'Pass an explicit --title in Conventional Commits format, e.g. --title "feat(canvas): add node palette".';
      }
      if (!CONVENTIONAL_TITLE_RE.test(title)) {
        return `PR title "${title}" is not a Conventional Commit (type(scope): summary).`;
      }
    }
  }
  return null;
}

if (isMain(import.meta.url)) {
  const input = await readInput();
  const command = input.tool_input?.command ?? '';
  if (/\b(git|gh)\b/.test(command)) {
    const cwd = input.cwd ?? PROJECT_DIR;
    const reason = checkCommand(command, {
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
      hasOrigin: git(['remote', 'get-url', 'origin'], cwd) !== null,
    });
    if (reason) fail(`Blocked by .claude/hooks/guard-git.mjs: ${reason}`);
  }
}
