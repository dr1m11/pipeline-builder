import { describe, expect, it } from 'vitest';

import { extractTemplateVariables } from './template';

describe('extractTemplateVariables', () => {
  it('returns the variable names in order of first appearance', () => {
    expect(extractTemplateVariables('Summarize {{document}} for {{audience}}.')).toEqual([
      'document',
      'audience',
    ]);
  });

  it('lists a repeated variable once', () => {
    expect(extractTemplateVariables('{{topic}}, then {{tone}}, then {{topic}} again')).toEqual([
      'topic',
      'tone',
    ]);
  });

  it('allows spaces inside the braces', () => {
    expect(extractTemplateVariables('{{ name }} and {{  user_id2}}')).toEqual(['name', 'user_id2']);
  });

  it('treats placeholders without an identifier as plain text', () => {
    expect(extractTemplateVariables('{{}} {{ 1st }} {{a-b}} {{two words}} {{"x"}}')).toEqual([]);
  });

  it('ignores single braces and text without placeholders', () => {
    expect(extractTemplateVariables('{name} is not a variable')).toEqual([]);
    expect(extractTemplateVariables('')).toEqual([]);
  });
});
