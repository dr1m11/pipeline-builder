import { describe, expect, it } from 'vitest';

import { findNode } from '../graph/nodes';
import { NODE_DEFINITIONS } from '../nodes/registry';
import { parsePipelineFile, serializePipeline } from '../persistence/pipeline-file';
import { SCHEMA_VERSION } from '../schema-version';
import { validatePipeline } from '../validation/validate-pipeline';
import { PIPELINE_TEMPLATES, type PipelineTemplate } from './pipeline-templates';

/** The template with `id`; fails the test when there is none. */
function templateWith(id: PipelineTemplate['id']): PipelineTemplate {
  const found = PIPELINE_TEMPLATES.find((template) => template.id === id);
  if (found === undefined) throw new Error(`No template ${id}`);
  return found;
}

/** Each edge as "source label.port → target label.port". */
function connections({ pipeline }: PipelineTemplate): string[] {
  const label = (id: string) => findNode(pipeline, id)?.label ?? `missing ${id}`;
  return pipeline.edges.map(
    (edge) => `${label(edge.source)}.${edge.sourcePort} → ${label(edge.target)}.${edge.targetPort}`,
  );
}

describe('PIPELINE_TEMPLATES', () => {
  it('offers three templates with stable ids, in menu order', () => {
    expect(
      PIPELINE_TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
    ).toEqual([
      {
        id: 'ask-a-question',
        name: 'Ask a question',
        description: 'An LLM answers a question',
      },
      {
        id: 'route-by-sentiment',
        name: 'Route by sentiment',
        description: 'Branches on a review’s sentiment',
      },
      {
        id: 'extract-a-json-field',
        name: 'Extract a JSON field',
        description: 'Reads one field from an LLM’s JSON',
      },
    ]);
  });

  it.each(PIPELINE_TEMPLATES)('$name is a pipeline of the current version named after it', (t) => {
    expect(t.pipeline.schemaVersion).toBe(SCHEMA_VERSION);
    expect(t.pipeline.id).toBe(t.id);
    expect(t.pipeline.name).toBe(t.name);
  });

  it.each(PIPELINE_TEMPLATES)('$name has no validation errors or warnings', ({ pipeline }) => {
    expect(validatePipeline(pipeline).issues).toEqual([]);
  });

  it.each(PIPELINE_TEMPLATES)('$name gives every node and edge a unique id', ({ pipeline }) => {
    const nodeIds = pipeline.nodes.map((node) => node.id);
    const edgeIds = pipeline.edges.map((edge) => edge.id);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });

  it.each(PIPELINE_TEMPLATES)('$name survives a pipeline file round trip', ({ pipeline }) => {
    const parsed = parsePipelineFile(serializePipeline(pipeline));

    expect(parsed).toEqual({
      ok: true,
      value: { pipeline, migratedFrom: null, repairs: [] },
    });
  });

  it.each(PIPELINE_TEMPLATES)('$name is laid out left to right', ({ pipeline }) => {
    for (const edge of pipeline.edges) {
      const source = findNode(pipeline, edge.source);
      const target = findNode(pipeline, edge.target);
      expect(target?.position.x).toBeGreaterThan(source?.position.x ?? Infinity);
    }
  });

  it.each(PIPELINE_TEMPLATES)(
    '$name builds its LLM Call from the kind’s defaults',
    ({ pipeline }) => {
      const defaults = NODE_DEFINITIONS['llm-call'].createData();
      const models = pipeline.nodes.filter((node) => node.kind === 'llm-call');
      expect(models).toHaveLength(1);
      for (const { data } of models) {
        expect(Object.keys(data).sort()).toEqual(Object.keys(defaults).sort());
        expect(data.model).toBe(defaults.model);
      }
    },
  );

  it('asks a question: Input → Prompt → LLM Call → Output', () => {
    const ask = templateWith('ask-a-question');

    expect(ask.pipeline.nodes.map(({ id, kind, label }) => ({ id, kind, label }))).toEqual([
      { id: 'question', kind: 'input', label: 'Question' },
      { id: 'prompt', kind: 'prompt', label: 'Answer prompt' },
      { id: 'model', kind: 'llm-call', label: 'Model' },
      { id: 'answer', kind: 'output', label: 'Answer' },
    ]);
    expect(connections(ask)).toEqual([
      'Question.value → Answer prompt.question',
      'Answer prompt.prompt → Model.prompt',
      'Model.response → Answer.value',
    ]);
    expect(findNode(ask.pipeline, 'prompt')?.data).toEqual({
      template: 'Answer the question: {{question}}',
    });
    expect(findNode(ask.pipeline, 'answer')?.data).toEqual({ format: 'markdown' });
  });

  it('routes by sentiment: a Condition sends the answer to one of two Outputs', () => {
    const route = templateWith('route-by-sentiment');

    expect(route.pipeline.nodes.map(({ id, kind, label }) => ({ id, kind, label }))).toEqual([
      { id: 'review', kind: 'input', label: 'Review' },
      { id: 'prompt', kind: 'prompt', label: 'Sentiment prompt' },
      { id: 'classifier', kind: 'llm-call', label: 'Classifier' },
      { id: 'is-positive', kind: 'condition', label: 'Is positive?' },
      { id: 'positive', kind: 'output', label: 'Positive' },
      { id: 'negative', kind: 'output', label: 'Negative' },
    ]);
    expect(connections(route)).toEqual([
      'Review.value → Sentiment prompt.review',
      'Sentiment prompt.prompt → Classifier.prompt',
      'Classifier.response → Is positive?.value',
      'Is positive?.true → Positive.value',
      'Is positive?.false → Negative.value',
    ]);
    expect(findNode(route.pipeline, 'is-positive')?.data).toEqual({
      operator: 'contains',
      operand: 'positive',
    });
    // The branches sit above and below the Condition.
    const y = (id: string) => findNode(route.pipeline, id)?.position.y;
    expect(y('positive')).toBeLessThan(y('is-positive') ?? -Infinity);
    expect(y('negative')).toBeGreaterThan(y('is-positive') ?? Infinity);
  });

  it('extracts a JSON field: two Transforms parse the answer and read its email', () => {
    const extract = templateWith('extract-a-json-field');

    expect(extract.pipeline.nodes.map(({ id, kind, label }) => ({ id, kind, label }))).toEqual([
      { id: 'text', kind: 'input', label: 'Text' },
      { id: 'prompt', kind: 'prompt', label: 'Extraction prompt' },
      { id: 'extractor', kind: 'llm-call', label: 'Extractor' },
      { id: 'parse', kind: 'transform', label: 'Parse JSON' },
      { id: 'get-email', kind: 'transform', label: 'Get email' },
      { id: 'email', kind: 'output', label: 'Email' },
    ]);
    expect(connections(extract)).toEqual([
      'Text.value → Extraction prompt.text',
      'Extraction prompt.prompt → Extractor.prompt',
      'Extractor.response → Parse JSON.value',
      'Parse JSON.result → Get email.value',
      'Get email.result → Email.value',
    ]);
    expect(findNode(extract.pipeline, 'parse')?.data).toEqual({
      operation: 'parse-json',
      path: '',
    });
    expect(findNode(extract.pipeline, 'get-email')?.data).toEqual({
      operation: 'get-field',
      path: 'email',
    });
  });
});
