import { describe, expect, it } from 'vitest';

import { COPY_OFFSET, nextPaste, NO_PASTES, startCascade } from './paste-cascade';

const step = (count: number) => ({ x: count * COPY_OFFSET, y: count * COPY_OFFSET });

describe('nextPaste', () => {
  it('moves each paste of the copied text one step further', () => {
    const first = nextPaste(startCascade('nodes'), 'nodes');
    const second = nextPaste(first.cascade, 'nodes');
    const third = nextPaste(second.cascade, 'nodes');

    expect([first.offset, second.offset, third.offset]).toEqual([step(1), step(2), step(3)]);
  });

  it('starts one step away for text copied elsewhere', () => {
    const pastedTwice = nextPaste(nextPaste(NO_PASTES, 'nodes').cascade, 'nodes').cascade;

    expect(nextPaste(NO_PASTES, 'nodes').offset).toEqual(step(1));
    expect(nextPaste(pastedTwice, 'other nodes').offset).toEqual(step(1));
  });
});
