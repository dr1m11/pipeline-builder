// SessionStart: prints a short repository briefing that Claude Code adds to the session context.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { git, isMain, PROJECT_DIR, readInput } from './_lib.mjs';

/**
 * Reads the `<!-- current-stage: A1 -->` marker from docs/roadmap.md.
 * @param {string} roadmap
 */
export function currentStage(roadmap) {
  return /<!--\s*current-stage:\s*([\w.-]+)\s*-->/.exec(roadmap)?.[1] ?? null;
}

/**
 * Summarizes `git status --porcelain` output as "2 staged, 1 modified, 3 untracked".
 * @param {string} porcelain
 */
export function summarizeStatus(porcelain) {
  const counts = { staged: 0, modified: 0, untracked: 0 };
  for (const line of porcelain.split(/\r?\n/).filter(Boolean)) {
    if (line.startsWith('??')) {
      counts.untracked += 1;
      continue;
    }
    if (line[0] !== ' ') counts.staged += 1;
    if (line[1] !== ' ') counts.modified += 1;
  }
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`);
  return parts.length > 0 ? parts.join(', ') : 'clean';
}

function openPullRequest() {
  const result = spawnSync(
    'gh',
    ['pr', 'view', '--json', 'number,state,url', '-q', '"#\\(.number) \\(.state) \\(.url)"'],
    {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      timeout: 3000,
    },
  );
  return result.status === 0 ? result.stdout.trim().replace(/^"|"$/g, '') : null;
}

if (isMain(import.meta.url)) {
  await readInput();
  const lines = ['## Repository context (SessionStart hook)'];

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const hasOrigin = git(['remote', 'get-url', 'origin']) !== null;
  if (branch) {
    const counts = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    const [behind, ahead] = counts ? counts.split(/\s+/) : [];
    lines.push(
      `- Branch: ${branch}${counts ? ` (ahead ${ahead}, behind ${behind} of upstream)` : ' (no upstream)'}`,
    );
    if (branch === 'main' && hasOrigin) {
      lines.push(
        '- ⚠ On main: create a branch (`git switch -c <type>/<kebab-summary>`) before committing.',
      );
    }
  }

  const status = git(['status', '--porcelain']);
  if (status !== null) lines.push(`- Working tree: ${summarizeStatus(status)}`);

  const roadmapPath = path.join(PROJECT_DIR, 'docs', 'roadmap.md');
  const stage = existsSync(roadmapPath) ? currentStage(readFileSync(roadmapPath, 'utf8')) : null;
  if (stage) lines.push(`- Current stage: ${stage} (see docs/roadmap.md and the GitHub milestone)`);

  if (hasOrigin && branch && branch !== 'main') {
    const pr = openPullRequest();
    if (pr) lines.push(`- Open PR for this branch: ${pr}`);
  }

  const log = git(['log', '--oneline', '-5']);
  if (log) lines.push('- Recent commits:', ...log.split(/\r?\n/).map((entry) => `  - ${entry}`));

  process.stdout.write(`${lines.join('\n')}\n`);
}
