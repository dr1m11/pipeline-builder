import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AI_ATTRIBUTION_RE } from './_lib.mjs';
import { formatEslintErrors } from './format-lint.mjs';
import { currentStage, summarizeStatus } from './session-context.mjs';
import { changedTsFiles } from './stop-typecheck.mjs';

describe('AI_ATTRIBUTION_RE', () => {
  it('matches attribution lines in any casing', () => {
    assert.match('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', AI_ATTRIBUTION_RE);
    assert.match('co-authored-by: claude', AI_ATTRIBUTION_RE);
    assert.match('🤖 Generated with [Claude Code](https://claude.com/claude-code)', AI_ATTRIBUTION_RE);
  });

  it('does not match human co-authors or unrelated text', () => {
    assert.doesNotMatch('Co-authored-by: Jane Doe <jane@example.com>', AI_ATTRIBUTION_RE);
    assert.doesNotMatch('docs(claude): update project rules', AI_ATTRIBUTION_RE);
  });
});

describe('currentStage', () => {
  it('reads the roadmap marker', () => {
    assert.equal(currentStage('# Roadmap\n\n<!-- current-stage: A2 -->\n'), 'A2');
    assert.equal(currentStage('# Roadmap'), null);
  });
});

describe('summarizeStatus', () => {
  it('counts staged, modified and untracked entries', () => {
    assert.equal(summarizeStatus('M  a.ts\n M b.ts\nMM c.ts\n?? d.ts\n'), '2 staged, 2 modified, 1 untracked');
    assert.equal(summarizeStatus(''), 'clean');
  });
});

describe('changedTsFiles', () => {
  it('keeps TypeScript paths, including rename targets', () => {
    const porcelain = ' M apps/web/src/main.tsx\n?? README.md\nR  old.ts -> packages/core/src/new.ts\n?? "with space.ts"\n';
    assert.deepEqual(changedTsFiles(porcelain), ['apps/web/src/main.tsx', 'packages/core/src/new.ts', 'with space.ts']);
  });
});

describe('formatEslintErrors', () => {
  it('reports errors only, relative to the root', () => {
    const lines = formatEslintErrors(
      [
        {
          filePath: `${process.cwd()}/src/a.ts`,
          messages: [
            { severity: 2, line: 3, column: 5, message: 'Unexpected any.', ruleId: '@typescript-eslint/no-explicit-any' },
            { severity: 1, line: 4, column: 1, message: 'warning', ruleId: 'x' },
          ],
        },
      ],
      process.cwd(),
    );
    assert.deepEqual(lines, ['src/a.ts:3:5 Unexpected any. (@typescript-eslint/no-explicit-any)']);
  });
});
