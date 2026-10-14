import { describe, expect, it } from 'vitest';

import { findNode } from '../graph/nodes';
import { LLM_CALL_DEFINITION } from '../nodes/llm-call';
import type { NodeKind, PipelineNode } from '../nodes/registry';
import {
  PIPELINE_TEMPLATES,
  type PipelineTemplate,
  type PipelineTemplateId,
} from '../pipeline-templates/pipeline-templates';
import type { LlmRequest } from './llm-request';
import { mockCompletion, splitIntoTokens } from './mock-completion';

/** A request with the default settings of an LLM Call node. */
function request(prompt: string, changes: Partial<LlmRequest> = {}): LlmRequest {
  return { ...LLM_CALL_DEFINITION.createData(), prompt, ...changes };
}

/** The template with `id`; fails the test when there is none. */
function templateWith(id: PipelineTemplateId): PipelineTemplate {
  const found = PIPELINE_TEMPLATES.find((template) => template.id === id);
  if (found === undefined) throw new Error(`No template ${id}`);
  return found;
}

/** The only node of `kind` in the template; fails the test unless there is exactly one. */
function nodeOf<K extends NodeKind>(
  { pipeline }: PipelineTemplate,
  kind: K,
): Extract<PipelineNode, { kind: K }> {
  const nodes = pipeline.nodes.filter(
    (node): node is Extract<PipelineNode, { kind: K }> => node.kind === kind,
  );
  const [node] = nodes;
  if (node === undefined || nodes.length > 1) throw new Error(`Not one ${kind} node`);
  return node;
}

/**
 * The request the template's LLM Call node makes: its settings and its Prompt with each
 * `{{variable}}` filled by the Input connected to it (or by `inputs`, by Input id).
 */
function templateRequest(
  template: PipelineTemplate,
  inputs: Readonly<Record<string, string>> = {},
): LlmRequest {
  const values = new Map<string, string>();
  for (const edge of template.pipeline.edges) {
    const source = findNode(template.pipeline, edge.source);
    if (source?.kind === 'input') {
      values.set(edge.targetPort, inputs[source.id] ?? source.data.value);
    }
  }
  const prompt = nodeOf(template, 'prompt').data.template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (placeholder, name: string) => values.get(name) ?? placeholder,
  );
  return { ...nodeOf(template, 'llm-call').data, prompt };
}

describe('mockCompletion with the built-in templates', () => {
  it('answers "Ask a question" in markdown that names the question', () => {
    const template = templateWith('ask-a-question');
    const answer = mockCompletion(templateRequest(template));

    expect(templateRequest(template).prompt).toBe('Answer the question: Why is the sky blue?');
    expect(nodeOf(template, 'output').data.format).toBe('markdown');
    expect(answer).toMatch(/^\*\*Why is the sky blue\?\*\*\n\n.*mock provider/);
  });

  it('routes the review of "Route by sentiment" to Positive', () => {
    const template = templateWith('route-by-sentiment');
    const answer = mockCompletion(templateRequest(template));
    const { operator, operand } = nodeOf(template, 'condition').data;

    expect(answer).toBe('positive');
    expect(operator).toBe('contains');
    expect(answer.includes(operand)).toBe(true);
  });

  it('routes a negative review of "Route by sentiment" to Negative', () => {
    const template = templateWith('route-by-sentiment');
    const review = 'The headphones broke after a week, and the sound was never good.';
    const answer = mockCompletion(templateRequest(template, { review }));

    expect(answer).toBe('negative');
    expect(answer.includes(nodeOf(template, 'condition').data.operand)).toBe(false);
  });

  it('gives "Extract a JSON field" JSON whose email field is ada@example.com', () => {
    const template = templateWith('extract-a-json-field');
    const answer = mockCompletion(templateRequest(template));
    const fieldPaths = template.pipeline.nodes.flatMap((node) =>
      node.kind === 'transform' && node.data.operation === 'get-field' ? [node.data.path] : [],
    );

    expect(JSON.parse(answer)).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(fieldPaths).toEqual(['email']);
  });
});

describe('mockCompletion', () => {
  describe('for a prompt that asks "positive or negative"', () => {
    const ask = (text: string) =>
      mockCompletion(request(`Is this positive or negative?\n\n${text}`));

    it.each([
      ['Great sound, I love them.', 'positive'],
      ['Terrible: broken on arrival and the refund was slow.', 'negative'],
      ['Fast delivery but poor and noisy sound.', 'negative'],
      ['Good, but late.', 'positive'],
      ['It is a pair of headphones.', 'positive'],
    ])('reads "%s" as %s', (text, sentiment) => {
      expect(ask(text)).toBe(sentiment);
    });

    it.each([
      ['Not good at all.', 'negative'],
      ['Never slow, no defective parts.', 'positive'],
      ['It isn’t great and doesn’t work.', 'negative'],
      ["It isn't bad, it's not bad at all.", 'positive'],
      ["I wouldn't say it is bad.", 'negative'],
    ])('turns a word round after a negation in "%s"', (text, sentiment) => {
      expect(ask(text)).toBe(sentiment);
    });

    it('recognises the question in either order and any case', () => {
      expect(mockCompletion(request('NEGATIVE or POSITIVE: the case is awful'))).toBe('negative');
      expect(mockCompletion(request('Positive  or\nnegative? It broke.'))).toBe('negative');
    });
  });

  describe('for a prompt that asks for JSON', () => {
    const extract = (prompt: string): unknown => JSON.parse(mockCompletion(request(prompt)));

    it('fills the quoted fields in order, with null for what it cannot find', () => {
      const prompt =
        'Return JSON with "email", "name", "phone" and "email" again. Text: write to grace@navy.mil.';

      expect(mockCompletion(request(prompt))).toBe(
        '{\n  "email": "grace@navy.mil",\n  "name": null,\n  "phone": null\n}',
      );
    });

    it.each([
      ['My name is Grace Brewster Hopper, I wrote the compiler.', 'Grace Brewster Hopper'],
      ['I am Alan Turing.', 'Alan Turing'],
      ['Hello, this is Édouard Lucas-Smith here.', 'Édouard Lucas-Smith'],
      ["Hi, I'm Ada, and I like engines.", 'Ada'],
      ['This is great.', null],
    ])('reads the name in "%s"', (text, name) => {
      expect(extract(`Give a JSON object with the field "name". ${text}`)).toEqual({ name });
    });

    it('accepts typographic quotes and leaves names from Object.prototype alone', () => {
      expect(extract('JSON with “name”, “constructor” and “toString”: I’m Ada.')).toEqual({
        name: 'Ada',
        constructor: null,
        toString: null,
      });
    });

    it('answers an empty object when the prompt names no fields', () => {
      expect(mockCompletion(request('Describe the weather as json.'))).toBe('{}');
    });

    it('indents the object by two spaces', () => {
      expect(mockCompletion(request('JSON with "email": ada@example.com'))).toBe(
        '{\n  "email": "ada@example.com"\n}',
      );
    });

    it('needs the word JSON, not a longer word', () => {
      expect(mockCompletion(request('Ask Jsonathan for "name"'))).toMatch(/^\*\*/);
    });
  });

  describe('for any other prompt', () => {
    const title = (prompt: string) => mockCompletion(request(prompt)).split('\n')[0];

    it('answers in markdown under the last question of the prompt', () => {
      expect(title('Some context. Is it here? Or is it there?\nThanks!')).toBe(
        '**Or is it there?**',
      );
    });

    it('drops a lead-in before ": " but keeps other colons', () => {
      expect(title('Question: Why is the sky blue?')).toBe('**Why is the sky blue?**');
      expect(title('What happens at 10:30?')).toBe('**What happens at 10:30?**');
    });

    it('uses the first line of a prompt without a question, shortened to 80 characters', () => {
      expect(title('\n  Write a haiku about cats.  \nMake it funny.')).toBe(
        '**Write a haiku about cats.**',
      );
      const long = `Summarize ${'very '.repeat(30)}long text`;
      const shortened = title(long) ?? '';

      expect(shortened).toMatch(/^\*\*Summarize very very .*…\*\*$/);
      expect(shortened.length).toBe(80 + '****'.length);
    });

    it('stands in a title for a blank prompt', () => {
      expect(title(' \n ')).toBe('**Your prompt**');
    });
  });

  it('cuts the answer to about maxTokens tokens', () => {
    const prompt = 'Why is the sky blue?';
    const full = mockCompletion(request(prompt));

    expect(mockCompletion(request(prompt, { maxTokens: 3 }))).toBe('**Why is the');
    expect(splitIntoTokens(full).length).toBeGreaterThan(20);
    expect(mockCompletion(request(prompt, { maxTokens: 10_000 }))).toBe(full);
    expect(mockCompletion(request(prompt, { maxTokens: 0 }))).toBe('');
    expect(mockCompletion(request(prompt, { maxTokens: -1 }))).toBe('');
  });

  it('gives the same answer every time, whatever the model, temperature or system prompt', () => {
    const prompt = 'Why is the sky blue?';
    const changes: Partial<LlmRequest> = { model: 'other', temperature: 2, system: 'Be brief.' };

    expect(mockCompletion(request(prompt))).toBe(mockCompletion(request(prompt)));
    expect(mockCompletion(request(prompt, changes))).toBe(mockCompletion(request(prompt)));
  });
});

describe('splitIntoTokens', () => {
  it('cuts text into words with the whitespace before them', () => {
    expect(splitIntoTokens('Why is  the\nsky blue?')).toEqual([
      'Why',
      ' is',
      '  the',
      '\nsky',
      ' blue?',
    ]);
  });

  it('keeps whitespace at the end as a chunk of its own', () => {
    expect(splitIntoTokens('  done \n')).toEqual(['  done', ' \n']);
    expect(splitIntoTokens(' ')).toEqual([' ']);
  });

  it('has no chunks for empty text', () => {
    expect(splitIntoTokens('')).toEqual([]);
  });

  it.each([
    'Answer the question: Why is the sky blue?',
    '{\n  "email": "ada@example.com"\n}\n',
    '\t leading and trailing \r\n',
    'emoji 👩‍🚀 and non-breaking\u00a0spaces',
  ])('joins back into %j', (text) => {
    const tokens = splitIntoTokens(text);

    expect(tokens.join('')).toBe(text);
    for (const token of tokens) expect(token.trim()).not.toMatch(/\s/);
  });
});
