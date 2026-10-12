import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class names and skips falsy ones', () => {
    expect(cn('a', false, undefined, null, 'b', { c: true, d: false })).toBe('a b c');
  });

  it('lets later Tailwind utilities override conflicting earlier ones', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('keeps token colour utilities distinct from other utilities', () => {
    expect(cn('bg-surface text-fg', 'bg-accent')).toBe('text-fg bg-accent');
  });
});
