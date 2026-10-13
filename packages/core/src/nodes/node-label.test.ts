import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { NODE_LABEL_MAX_LENGTH, NODE_LABEL_SCHEMA } from './node-label';

/** Messages for the label `input`. */
function labelMessages(input: string) {
  const result = NODE_LABEL_SCHEMA.safeParse(input);
  return result.success ? [] : z.flattenError(result.error).formErrors;
}

describe('NODE_LABEL_SCHEMA', () => {
  it('trims the label', () => {
    expect(NODE_LABEL_SCHEMA.parse('  Summarize  ')).toBe('Summarize');
  });

  it('requires a label that is not blank', () => {
    expect(labelMessages(' \t')).toEqual(['Required']);
  });

  it('limits the length of the trimmed label', () => {
    const longest = 'a'.repeat(NODE_LABEL_MAX_LENGTH);
    expect(labelMessages(` ${longest} `)).toEqual([]);
    expect(labelMessages(`${longest}a`)).toEqual(['Must be at most 60 characters']);
  });
});
