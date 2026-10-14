import { describe, expect, it } from 'vitest';

import { undoReplacementAltText } from './undo-alt-text';

describe('undoReplacementAltText', () => {
  it('names the undo shortcut of the platform', () => {
    expect(undoReplacementAltText(false)).toBe('Press Ctrl+Z to bring back the previous pipeline');
    expect(undoReplacementAltText(true)).toBe('Press ⌘Z to bring back the previous pipeline');
  });
});
