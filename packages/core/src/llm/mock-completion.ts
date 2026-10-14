import type { LlmRequest } from './llm-request';

/**
 * The mock provider's answer to a request: deterministic, so the demo runs without an API key and
 * gives the same result every time. It reads only `prompt` and `maxTokens`; the first rule that
 * applies picks the answer:
 *
 * 1. **Sentiment.** A prompt with "positive or negative" (or "negative or positive", in any case)
 *    gets one lowercase word. Each word of the prompt found in a small lexicon counts +1 ("great",
 *    "love") or −1 ("broken", "late"), or the opposite right after "not", "no", "never" or a word
 *    ending in "n't"; "positive" and "negative" themselves do not count. A total below zero gives
 *    `negative`, any other total `positive`.
 * 2. **JSON.** A prompt with the word "JSON" that names at least one field in double quotes
 *    (straight or curly) gets a JSON object, indented by two spaces, with those fields in order of
 *    first mention. `email` is the first email address in the prompt and `name` the one to three
 *    capitalised words after "I'm", "I am", "my name is" or "this is"; other fields, and fields
 *    whose value is not found, are `null`. A prompt about JSON that names no field ("What is
 *    JSON?") falls through to the next rule.
 * 3. **Anything else** gets a short markdown answer: the question in bold, then a note that the
 *    answer comes from the mock provider. The question is the last sentence of the prompt that ends
 *    with "?", without what comes before its last ": " ("Answer the question: Why is the sky blue?"
 *    gives "Why is the sky blue?"); without one, the prompt's first line that is not blank, cut to
 *    80 characters.
 *
 * The answer is cut to its first `maxTokens` chunks of `splitIntoTokens`: a word stands in for a
 * token, so the limit holds approximately.
 */
export function mockCompletion({ prompt, maxTokens }: LlmRequest): string {
  return splitIntoTokens(mockAnswer(prompt)).slice(0, Math.max(0, maxTokens)).join('');
}

/**
 * Cuts text into word-sized chunks, the way the mock provider streams it: a word with the
 * whitespace before it (`" blue?"`), and any whitespace at the end as a chunk of its own. Joined,
 * the chunks give back the text; empty text has none.
 */
export function splitIntoTokens(text: string): readonly string[] {
  return text.match(/\s*\S+|\s+/g) ?? [];
}

function mockAnswer(prompt: string): string {
  if (SENTIMENT_QUESTION.test(prompt)) return classifySentiment(prompt);
  const fields = JSON_REQUEST.test(prompt) ? quotedFieldNames(prompt) : [];
  if (fields.length > 0) return jsonObject(prompt, fields);
  return answerQuestion(prompt);
}

// The prompt reaches the proxy's mock unauthenticated, so every pattern below runs in linear time:
// a pattern that could start anywhere inside a long run of characters starts only where the run
// does, instead of rescanning the rest of the run from each of its positions.

// Sentiment

const SENTIMENT_QUESTION = /\b(?:positive\s+or\s+negative|negative\s+or\s+positive)\b/i;

const POSITIVE_WORDS: ReadonlySet<string> = new Set([
  'amazing',
  'awesome',
  'best',
  'comfortable',
  'delighted',
  'early',
  'easy',
  'excellent',
  'fantastic',
  'fast',
  'good',
  'great',
  'happy',
  'love',
  'loved',
  'nice',
  'perfect',
  'recommend',
  'wonderful',
  'works',
]);

const NEGATIVE_WORDS: ReadonlySet<string> = new Set([
  'awful',
  'bad',
  'broke',
  'broken',
  'cheap',
  'defective',
  'disappointed',
  'disappointing',
  'hate',
  'hated',
  'horrible',
  'late',
  'noisy',
  'poor',
  'refund',
  'slow',
  'terrible',
  'useless',
  'waste',
  'worst',
]);

const NEGATIONS: ReadonlySet<string> = new Set(['not', 'no', 'never']);

function classifySentiment(prompt: string): string {
  // Words with their apostrophes, so that "isn’t" stays one word ending in "n't".
  const words =
    prompt
      .toLowerCase()
      .replaceAll('’', "'")
      .match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
  const score = words.reduce((sum, word, index) => sum + polarity(word, words[index - 1]), 0);
  return score < 0 ? 'negative' : 'positive';
}

// +1 for a positive word and −1 for a negative one, the opposite right after a negation; else 0.
function polarity(word: string, previous = ''): number {
  const value = POSITIVE_WORDS.has(word) ? 1 : NEGATIVE_WORDS.has(word) ? -1 : 0;
  return NEGATIONS.has(previous) || previous.endsWith("n't") ? -value : value;
}

// JSON

const JSON_REQUEST = /\bjson\b/i;
const FIELD_NAME = /["“]([A-Za-z_][A-Za-z0-9_]*)["”]/g;
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const NAME =
  /\b(?:I['’]m|I am|[Mm]y name is|[Tt]his is)\s+(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*){0,2})/u;

// The value of a field found in the prompt, or null.
const FIELD_EXTRACTORS: ReadonlyMap<string, (prompt: string) => string | null> = new Map([
  ['email', (prompt: string) => EMAIL.exec(prompt)?.[0] ?? null],
  ['name', (prompt: string) => NAME.exec(prompt)?.[1] ?? null],
]);

// Field names in double quotes, unique, in order of first mention.
function quotedFieldNames(prompt: string): readonly string[] {
  return [...new Set(Array.from(prompt.matchAll(FIELD_NAME), ([, name = '']) => name))];
}

function jsonObject(prompt: string, fields: readonly string[]): string {
  const entries = fields.map((field): [string, string | null] => [
    field,
    FIELD_EXTRACTORS.get(field)?.(prompt) ?? null,
  ]);
  return JSON.stringify(Object.fromEntries(entries), null, 2);
}

// Anything else

const TITLE_MAX_LENGTH = 80;

function answerQuestion(prompt: string): string {
  return [
    `**${answerTitle(prompt)}**`,
    '',
    'This answer comes from the mock provider, which needs no API key: it streams sample text so you can watch the pipeline run.',
    '',
    '- Choose a real provider in the LLM Call node to get a real answer.',
    '- The mock also answers “positive or negative” questions and fills JSON objects with a name and an email.',
  ].join('\n');
}

// The last question of the prompt without its lead-in, else its first line, else a stand-in.
function answerTitle(prompt: string): string {
  const questions = prompt.match(/(?<![^.!?\r\n])[^.!?\r\n]+\?/g) ?? [];
  const question = questions.at(-1)?.split(': ').at(-1)?.trim() ?? '';
  if (question !== '') return question;

  const lines = prompt.split(/\r\n?|\n/).map((line) => line.trim());
  const firstLine = lines.find((line) => line !== '') ?? 'Your prompt';
  return firstLine.length > TITLE_MAX_LENGTH
    ? `${firstLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : firstLine;
}
