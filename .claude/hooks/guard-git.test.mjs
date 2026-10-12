import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkCommand, stripQuoted } from './guard-git.mjs';

const onFeature = { branch: 'feat/canvas', hasOrigin: true };
const onMain = { branch: 'main', hasOrigin: true };

describe('checkCommand', () => {
  it('ignores commands without git or gh', () => {
    assert.equal(checkCommand('pnpm test', onMain), null);
  });

  it('allows a plain conventional commit on a feature branch', () => {
    assert.equal(checkCommand('git add -A && git commit -m "feat(core): add pipeline type"', onFeature), null);
  });

  it('blocks Claude co-author trailers in commit messages', () => {
    const command = `git commit -m "$(cat <<'EOF'\nfeat: x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>\nEOF\n)"`;
    assert.match(checkCommand(command, onFeature) ?? '', /AI attribution/);
  });

  it('blocks "Generated with Claude Code" in PR bodies', () => {
    const command = 'gh pr create --title "feat: x" --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"';
    assert.match(checkCommand(command, onFeature) ?? '', /AI attribution/);
  });

  it('blocks --no-verify and -n on commit', () => {
    assert.match(checkCommand('git commit --no-verify -m "fix: x"', onFeature) ?? '', /--no-verify/);
    assert.match(checkCommand('git commit -nm "fix: x"', onFeature) ?? '', /--no-verify/);
  });

  it('does not treat flags inside the message as real flags', () => {
    assert.equal(checkCommand('git commit -m "docs: explain the -n flag and --no-verify"', onFeature), null);
  });

  it('blocks commits on main once the repo has a remote', () => {
    assert.match(checkCommand('git commit -m "fix: x"', onMain) ?? '', /main/);
  });

  it('allows commits on main during local bootstrap (no origin yet)', () => {
    assert.equal(checkCommand('git commit -m "chore: bootstrap"', { branch: 'main', hasOrigin: false }), null);
  });

  it('allows committing on main when the same command creates a branch first', () => {
    assert.equal(checkCommand('git switch -c feat/x && git commit -m "feat: x"', onMain), null);
  });

  it('blocks plain force push but allows --force-with-lease on feature branches', () => {
    assert.match(checkCommand('git push --force', onFeature) ?? '', /force push/);
    assert.match(checkCommand('git push -f origin feat/canvas', onFeature) ?? '', /force push/);
    assert.match(checkCommand('git push origin +feat/canvas', onFeature) ?? '', /force push/);
    assert.equal(checkCommand('git push --force-with-lease', onFeature), null);
    assert.equal(checkCommand('git push -u origin feat/canvas', onFeature), null);
  });

  it('blocks force-with-lease to main', () => {
    assert.match(checkCommand('git push --force-with-lease origin main', onFeature) ?? '', /main/);
  });

  it('requires a conventional --title for gh pr create', () => {
    assert.match(checkCommand('gh pr create --fill', onFeature) ?? '', /--title/);
    assert.match(checkCommand('gh pr create --title "Add canvas" --body x', onFeature) ?? '', /Conventional/);
    assert.equal(checkCommand('gh pr create --title "feat(canvas): add palette" --body-file -', onFeature), null);
  });
});

describe('stripQuoted', () => {
  it('removes quoted strings and heredoc bodies', () => {
    const stripped = stripQuoted(`git commit -F - <<'EOF'\nfix: -n inside\nEOF\n && echo "a -f b"`);
    assert.doesNotMatch(stripped, /-n inside|a -f b/);
  });

  it('removes PowerShell here-strings', () => {
    const stripped = stripQuoted("git commit -m @'\nfix: x\n-n here\n'@");
    assert.doesNotMatch(stripped, /-n here/);
  });
});
