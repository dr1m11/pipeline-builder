import { describe, expect, it } from 'vitest';

import { toConnectionCandidate } from './flow-connections';

describe('toConnectionCandidate', () => {
  it('turns handle ids into port ids', () => {
    expect(
      toConnectionCandidate({
        source: 'input',
        sourceHandle: 'value',
        target: 'prompt',
        targetHandle: 'question',
      }),
    ).toEqual({ source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' });
  });

  it('rejects a connection that misses a handle', () => {
    expect(
      toConnectionCandidate({
        source: 'input',
        sourceHandle: null,
        target: 'prompt',
        targetHandle: 'question',
      }),
    ).toBeNull();
    expect(toConnectionCandidate({ id: 'edge', source: 'input', target: 'prompt' })).toBeNull();
  });
});
