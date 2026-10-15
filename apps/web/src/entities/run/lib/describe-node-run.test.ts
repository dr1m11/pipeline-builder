import { describe, expect, it } from 'vitest';

import { IDLE_NODE_RUN } from '../model/run-state';
import { describeNodeRun, formatRunValue } from './describe-node-run';

describe('describeNodeRun', () => {
  it('says nothing about a node no run has reported', () => {
    expect(describeNodeRun(IDLE_NODE_RUN)).toBe('');
  });

  it('names the status of a node', () => {
    expect(describeNodeRun({ status: 'queued', text: '' })).toBe('Run status: queued.');
    expect(describeNodeRun({ status: 'running', text: 'The sky' })).toBe('Run status: running.');
    expect(describeNodeRun({ status: 'done', text: '' })).toBe('Run status: done.');
    expect(describeNodeRun({ status: 'cancelled', text: '' })).toBe('Run status: cancelled.');
  });

  it('says why a node failed, as a sentence', () => {
    expect(
      describeNodeRun({
        status: 'error',
        text: '',
        error: { code: 'invalid-key', message: 'The API key was rejected.' },
      }),
    ).toBe('Run status: failed. The API key was rejected.');
    expect(
      describeNodeRun({
        status: 'error',
        text: '',
        error: { code: 'invalid-json', message: 'Value is not valid JSON' },
      }),
    ).toBe('Run status: failed. Value is not valid JSON.');
  });

  it('names the node a step-by-step run is paused before', () => {
    expect(describeNodeRun({ status: 'queued', text: '' }, { paused: true })).toBe(
      'Run status: next. The run is paused before this node.',
    );
    expect(describeNodeRun(IDLE_NODE_RUN, { paused: true })).toBe('');
  });

  it('says why a node was skipped', () => {
    expect(describeNodeRun({ status: 'skipped', text: '', skipReason: 'branch-not-taken' })).toBe(
      'Run status: skipped, its branch was not taken.',
    );
    expect(describeNodeRun({ status: 'skipped', text: '', skipReason: 'upstream-failed' })).toBe(
      'Run status: skipped, a node it depends on failed.',
    );
  });
});

describe('formatRunValue', () => {
  it('shows text as it is, whitespace included', () => {
    expect(formatRunValue('  Line one\nLine two  ')).toBe('  Line one\nLine two  ');
  });

  it('shows other values as indented JSON', () => {
    expect(formatRunValue({ name: 'Ada', tags: [1, true, null] })).toBe(
      '{\n  "name": "Ada",\n  "tags": [\n    1,\n    true,\n    null\n  ]\n}',
    );
    expect(formatRunValue(42)).toBe('42');
  });
});
