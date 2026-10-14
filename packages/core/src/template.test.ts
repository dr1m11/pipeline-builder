import { describe, expect, it } from 'vitest';

import { extractTemplateVariables, renderTemplate } from './template';

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

describe('renderTemplate', () => {
  it('fills every placeholder with the value of its variable', () => {
    expect(
      renderTemplate('Summarize {{document}} for {{audience}}; {{document}} again.', {
        document: 'the report',
        audience: 'managers',
      }),
    ).toBe('Summarize the report for managers; the report again.');
  });

  it('allows spaces inside the braces', () => {
    expect(renderTemplate('{{ name }} and {{  user_id2}}', { name: 'Ada', user_id2: '42' })).toBe(
      'Ada and 42',
    );
  });

  it('keeps a placeholder without a value as written', () => {
    expect(renderTemplate('Hi {{ name }}, {{topic}}', { topic: 'tests' })).toBe(
      'Hi {{ name }}, tests',
    );
  });

  it('fills a placeholder with an empty value', () => {
    expect(renderTemplate('[{{name}}]', { name: '' })).toBe('[]');
  });

  it('leaves placeholders without an identifier as plain text', () => {
    const template = '{{}} {{ 1st }} {{a-b}} {{two words}} {{"x"}}';
    expect(renderTemplate(template, { '1st': 'x', 'a-b': 'x', 'two words': 'x' })).toBe(template);
  });

  it('inserts values as they are, without filling placeholders or replacement patterns in them', () => {
    expect(renderTemplate('{{a}} {{b}}', { a: '{{b}}', b: "$& $1 $$ $'" })).toBe(
      "{{b}} $& $1 $$ $'",
    );
  });

  it('fills a variable named __proto__ from an own key', () => {
    expect(renderTemplate('[{{__proto__}}]', Object.fromEntries([['__proto__', 'own']]))).toBe(
      '[own]',
    );
  });

  it('ignores values inherited from the object prototype', () => {
    expect(renderTemplate('{{constructor}} {{toString}}', {})).toBe('{{constructor}} {{toString}}');
  });

  it('returns a template without placeholders unchanged', () => {
    expect(renderTemplate('{name} is not a variable', { name: 'x' })).toBe(
      '{name} is not a variable',
    );
    expect(renderTemplate('', {})).toBe('');
  });
});
