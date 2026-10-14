import { describe, expect, it } from 'vitest';

import type { Position } from '../geometry';
import {
  NODE_KINDS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineNode,
} from '../nodes/registry';
import { createEmptyPipeline, type Pipeline, type PipelineEdge } from '../pipeline';
import { SCHEMA_VERSION } from '../schema-version';
import { validatePipeline } from '../validation/validate-pipeline';
import { PIPELINE_V1 } from './fixtures/pipeline-v1';
import { PIPELINE_V2 } from './fixtures/pipeline-v2';
import type { JsonObject } from './json';
import { type Migration, MIGRATIONS } from './migrations';
import {
  type ParsedPipelineFile,
  parsePipelineFile,
  type ParsePipelineFileOptions,
  PIPELINE_FILE_FORMAT,
  serializePipeline,
} from './pipeline-file';

const ORIGIN = { x: 0, y: 0 };

/** A node whose label is its id. */
function nodeOf<K extends NodeKind>(
  kind: K,
  id: string,
  data: NodeDataMap[K],
  position: Position = ORIGIN,
): NodeOfKind<K> {
  return { id, kind, label: id, position, data };
}

/** An edge between `node.port` ends. */
function edge(id: string, from: string, to: string): PipelineEdge {
  const [source = '', sourcePort = ''] = from.split('.');
  const [target = '', targetPort = ''] = to.split('.');
  return { id, source, sourcePort, target, targetPort };
}

function pipelineOf(nodes: readonly PipelineNode[], edges: readonly PipelineEdge[] = []): Pipeline {
  return { ...createEmptyPipeline({ id: 'p', name: 'Test' }), nodes, edges };
}

const INPUT = nodeOf(
  'input',
  'in',
  { valueType: 'text', value: 'Is it sunny?' },
  { x: -240, y: 0 },
);
const PROMPT = nodeOf('prompt', 'prompt', { template: 'Answer: {{question}}' }, { x: 0, y: 12.5 });
const LLM = nodeOf('llm-call', 'llm', {
  provider: 'mock',
  model: 'mock',
  temperature: 0.7,
  maxTokens: 512,
});
const TRANSFORM = nodeOf('transform', 'parse', { operation: 'parse-json', path: '' });
const CONDITION = nodeOf('condition', 'check', { operator: 'contains', operand: 'yes' });
const OUTPUT = nodeOf('output', 'out', { format: 'markdown' }, { x: 960, y: -80 });

/** Input → Prompt → LLM Call → Transform → Condition → Output, all valid. */
const EVERY_KIND = pipelineOf(
  [INPUT, PROMPT, LLM, TRANSFORM, CONDITION, OUTPUT],
  [
    edge('e1', 'in.value', 'prompt.question'),
    edge('e2', 'prompt.prompt', 'llm.prompt'),
    edge('e3', 'llm.response', 'parse.value'),
    edge('e4', 'parse.result', 'check.value'),
    edge('e5', 'check.true', 'out.value'),
  ],
);

/** The text of a current pipeline file named "Test" without nodes, with `fields` replaced. */
function fileOf(fields: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    format: PIPELINE_FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: 'p',
    name: 'Test',
    nodes: [],
    edges: [],
    ...fields,
  });
}

function parseOk(text: string, options?: ParsePipelineFileOptions): ParsedPipelineFile {
  const result = parsePipelineFile(text, options);
  if (!result.ok) throw new Error(`Expected the file to load, got ${JSON.stringify(result.error)}`);
  return result.value;
}

describe('serializePipeline', () => {
  it('writes the format marker and the pipeline as indented JSON with a final newline', () => {
    const pipeline = pipelineOf(
      [
        nodeOf('input', 'in', { valueType: 'text', value: 'Hi' }),
        nodeOf('output', 'out', { format: 'text' }, { x: 240.5, y: -16 }),
      ],
      [edge('e1', 'in.value', 'out.value')],
    );
    expect(serializePipeline(pipeline)).toBe(`{
  "format": "pipeline-builder",
  "schemaVersion": ${String(SCHEMA_VERSION)},
  "id": "p",
  "name": "Test",
  "nodes": [
    {
      "id": "in",
      "kind": "input",
      "label": "in",
      "position": {
        "x": 0,
        "y": 0
      },
      "data": {
        "valueType": "text",
        "value": "Hi"
      }
    },
    {
      "id": "out",
      "kind": "output",
      "label": "out",
      "position": {
        "x": 240.5,
        "y": -16
      },
      "data": {
        "format": "text"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "in",
      "sourcePort": "value",
      "target": "out",
      "targetPort": "value"
    }
  ]
}
`);
  });

  it('writes keys in the same order whatever order the objects were built in', () => {
    const shuffled: Pipeline = {
      edges: EVERY_KIND.edges.map(({ targetPort, target, sourcePort, source, id }) => ({
        targetPort,
        target,
        sourcePort,
        source,
        id,
      })),
      nodes: [
        {
          data: { maxTokens: 512, temperature: 0.7, model: 'mock', provider: 'mock' },
          position: LLM.position,
          label: LLM.label,
          kind: LLM.kind,
          id: LLM.id,
        },
        {
          position: { y: INPUT.position.y, x: INPUT.position.x },
          data: { value: INPUT.data.value, valueType: INPUT.data.valueType },
          label: INPUT.label,
          kind: INPUT.kind,
          id: INPUT.id,
        },
      ],
      name: EVERY_KIND.name,
      id: EVERY_KIND.id,
      schemaVersion: EVERY_KIND.schemaVersion,
    };
    expect(serializePipeline(shuffled)).toBe(
      serializePipeline({ ...EVERY_KIND, nodes: [LLM, INPUT] }),
    );
  });
});

describe('parsePipelineFile', () => {
  it('reads back a pipeline with every node kind as it was written', () => {
    expect(EVERY_KIND.nodes.map((node) => node.kind)).toEqual(NODE_KINDS);
    const text = serializePipeline(EVERY_KIND);

    const { pipeline, migratedFrom, repairs } = parseOk(text);

    expect(pipeline).toEqual(EVERY_KIND);
    expect(migratedFrom).toBeNull();
    expect(repairs).toEqual([]);
    expect(serializePipeline(pipeline)).toBe(text);
  });

  it('gives a pipeline that validates the same as the original', () => {
    const { pipeline } = parseOk(serializePipeline(EVERY_KIND));
    expect(validatePipeline(pipeline)).toEqual(validatePipeline(EVERY_KIND));
  });

  it('reads an empty pipeline', () => {
    expect(parseOk(fileOf()).pipeline).toEqual(pipelineOf([]));
  });

  it.each([
    ['empty text', ''],
    ['unfinished JSON', '{"format": "pipeline-builder"'],
    ['a trailing comma', '{"format": "pipeline-builder",}'],
    ['plain text', 'Answer the question'],
  ])('refuses %s as invalid JSON', (_, text) => {
    expect(parsePipelineFile(text)).toEqual({ ok: false, error: { code: 'invalid-json' } });
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"pipeline-builder"'],
    ['null', 'null'],
    ['a number', '1'],
    ['an object without the format marker', JSON.stringify({ ...EVERY_KIND })],
    ['another format', fileOf({ format: 'other-editor' })],
    ['a missing schema version', fileOf({ schemaVersion: undefined })],
    ['a schema version in a string', fileOf({ schemaVersion: '1' })],
    ['a fractional schema version', fileOf({ schemaVersion: 1.5 })],
    ['schema version 0', fileOf({ schemaVersion: 0 })],
    ['a negative schema version', fileOf({ schemaVersion: -1 })],
  ])('refuses %s as not a pipeline', (_, text) => {
    expect(parsePipelineFile(text)).toEqual({ ok: false, error: { code: 'not-a-pipeline' } });
  });

  it('refuses a file saved in a newer schema version, whatever its content', () => {
    const version = SCHEMA_VERSION + 1;
    expect(parsePipelineFile(fileOf({ schemaVersion: version, nodes: 'unknown' }))).toEqual({
      ok: false,
      error: { code: 'newer-version', version },
    });
  });

  it.each([
    [
      'an id that is not a string',
      { id: 7 },
      'id',
      'Invalid input: expected string, received number',
    ],
    ['a blank name', { name: '   ' }, 'name', 'Required'],
    ['a name over the limit', { name: 'x'.repeat(81) }, 'name', 'Must be at most 80 characters'],
    [
      'nodes that are not a list',
      { nodes: {} },
      'nodes',
      'Invalid input: expected array, received object',
    ],
    [
      'a node that is not an object',
      { nodes: [42] },
      'nodes[0]',
      'Invalid input: expected object, received number',
    ],
    [
      'a node of an unknown kind',
      { nodes: [{ ...OUTPUT, kind: 'webhook' }] },
      'nodes[0].kind',
      "Invalid discriminator value. Expected 'input' | 'prompt' | 'llm-call' | 'transform' | 'condition' | 'output'",
    ],
    ['a blank label', { nodes: [INPUT, { ...OUTPUT, label: ' ' }] }, 'nodes[1].label', 'Required'],
    [
      'a label over the limit',
      { nodes: [{ ...OUTPUT, label: 'x'.repeat(61) }] },
      'nodes[0].label',
      'Must be at most 60 characters',
    ],
    [
      'a position without y',
      { nodes: [{ ...OUTPUT, position: { x: 0 } }] },
      'nodes[0].position.y',
      'Invalid input: expected number, received undefined',
    ],
    [
      'a data field of the wrong type',
      { nodes: [{ ...LLM, data: { ...LLM.data, temperature: '0.7' } }] },
      'nodes[0].data.temperature',
      'Invalid input: expected number, received string',
    ],
    [
      'a missing data field',
      { nodes: [{ ...LLM, data: { provider: 'mock', model: 'mock', temperature: 0.7 } }] },
      'nodes[0].data.maxTokens',
      'Invalid input: expected number, received undefined',
    ],
    [
      'an LLM Call without a provider',
      { nodes: [{ ...LLM, data: { model: 'mock', temperature: 0.7, maxTokens: 512 } }] },
      'nodes[0].data.provider',
      'Invalid option: expected one of "mock"|"anthropic"|"openai"',
    ],
    [
      'a provider the app does not know',
      { nodes: [{ ...LLM, data: { ...LLM.data, provider: 'gemini' } }] },
      'nodes[0].data.provider',
      'Invalid option: expected one of "mock"|"anthropic"|"openai"',
    ],
    [
      'an option the kind does not have',
      { nodes: [{ ...TRANSFORM, data: { operation: 'reverse', path: '' } }] },
      'nodes[0].data.operation',
      'Invalid option: expected one of "parse-json"|"stringify"|"trim"|"get-field"',
    ],
    [
      'an edge without a target port',
      { edges: [{ id: 'e', source: 'a', sourcePort: 'x', target: 'b' }] },
      'edges[0].targetPort',
      'Invalid input: expected string, received undefined',
    ],
  ])('refuses %s with the path of the problem', (_, fields, path, message) => {
    expect(parsePipelineFile(fileOf(fields))).toEqual({
      ok: false,
      error: { code: 'invalid-pipeline', path, message },
    });
  });

  it('refuses a position that is not a finite number', () => {
    // JSON has no Infinity, but `JSON.parse` reads 1e999 as one.
    const text = fileOf({ nodes: [{ ...OUTPUT, position: { x: 'far', y: 0 } }] }).replace(
      '"far"',
      '1e999',
    );
    expect(parsePipelineFile(text)).toEqual({
      ok: false,
      error: {
        code: 'invalid-pipeline',
        path: 'nodes[0].position.x',
        message: 'Invalid input: expected number, received Infinity',
      },
    });
  });

  it('reports only the first problem of the document', () => {
    expect(parsePipelineFile(fileOf({ name: '', nodes: [42], edges: null }))).toEqual({
      ok: false,
      error: { code: 'invalid-pipeline', path: 'name', message: 'Required' },
    });
  });

  it('loads data that breaks only the rules of its kind, for validation to report', () => {
    const unfinished = pipelineOf([
      nodeOf('input', 'in', { valueType: 'number', value: 'ten' }),
      nodeOf('prompt', 'prompt', { template: '   ' }),
      nodeOf('llm-call', 'llm', { provider: 'mock', model: '', temperature: 5, maxTokens: 0.5 }),
      nodeOf('transform', 'parse', { operation: 'get-field', path: '' }),
    ]);

    const { pipeline } = parseOk(serializePipeline(unfinished));

    expect(pipeline).toEqual(unfinished);
    const report = validatePipeline(pipeline);
    expect(report.issues.filter((issue) => issue.code === 'invalid-field')).toHaveLength(6);
    expect(report).toEqual(validatePipeline(unfinished));
  });

  it('drops fields it does not know at every level', () => {
    const text = fileOf({
      exportedAt: '2026-10-14',
      nodes: [
        {
          ...LLM,
          selected: true,
          position: { ...LLM.position, z: 1 },
          data: { ...LLM.data, seed: 42 },
        },
        OUTPUT,
      ],
      edges: [{ ...edge('e1', 'llm.response', 'out.value'), animated: true }],
    });

    expect(parseOk(text).pipeline).toEqual(
      pipelineOf([LLM, OUTPUT], [edge('e1', 'llm.response', 'out.value')]),
    );
  });

  it('trims the name and node labels', () => {
    const { pipeline } = parseOk(
      fileOf({ name: '  Draft  ', nodes: [{ ...OUTPUT, label: ' Out ' }] }),
    );
    expect(pipeline.name).toBe('Draft');
    expect(pipeline.nodes[0]?.label).toBe('Out');
  });

  it('refuses two nodes with the same id', () => {
    const text = fileOf({ nodes: [INPUT, OUTPUT, { ...PROMPT, id: 'in' }] });
    expect(parsePipelineFile(text)).toEqual({
      ok: false,
      error: { code: 'duplicate-id', element: 'node', id: 'in' },
    });
  });

  it('refuses two edges with the same id', () => {
    const text = fileOf({
      nodes: [INPUT, PROMPT, LLM],
      edges: [edge('e1', 'in.value', 'prompt.question'), edge('e1', 'prompt.prompt', 'llm.prompt')],
    });
    expect(parsePipelineFile(text)).toEqual({
      ok: false,
      error: { code: 'duplicate-id', element: 'edge', id: 'e1' },
    });
  });

  it('drops edges from or to a node that is not in the file and reports them', () => {
    const kept = edge('kept', 'in.value', 'out.value');
    const text = fileOf({
      nodes: [INPUT, LLM, OUTPUT],
      edges: [
        edge('from-ghost', 'ghost.prompt', 'llm.prompt'),
        kept,
        edge('to-ghost', 'llm.response', 'ghost.value'),
      ],
    });

    const { pipeline, repairs } = parseOk(text);

    expect(pipeline.edges).toEqual([kept]);
    expect(repairs).toEqual([
      { edgeId: 'from-ghost', reason: 'missing-node' },
      { edgeId: 'to-ghost', reason: 'missing-node' },
    ]);
  });

  it('keeps the first edge into an input and drops the others', () => {
    const first = edge('first', 'in.value', 'out.value');
    const text = fileOf({
      nodes: [INPUT, LLM, OUTPUT],
      edges: [
        first,
        edge('second', 'llm.response', 'out.value'),
        edge('third', 'in.value', 'out.value'),
      ],
    });

    const { pipeline, repairs } = parseOk(text);

    expect(pipeline.edges).toEqual([first]);
    expect(repairs).toEqual([
      { edgeId: 'second', reason: 'occupied-input' },
      { edgeId: 'third', reason: 'occupied-input' },
    ]);
  });

  it('keeps edges into different inputs of the same node', () => {
    const edges = [edge('e1', 'in.value', 'llm.prompt'), edge('e2', 'in.value', 'llm.system')];
    const { pipeline, repairs } = parseOk(fileOf({ nodes: [INPUT, LLM], edges }));
    expect(pipeline.edges).toEqual(edges);
    expect(repairs).toEqual([]);
  });

  it('does not count a dropped edge as taking its input', () => {
    const kept = edge('kept', 'in.value', 'out.value');
    const text = fileOf({
      nodes: [INPUT, OUTPUT],
      edges: [edge('dropped', 'ghost.value', 'out.value'), kept],
    });

    const { pipeline, repairs } = parseOk(text);

    expect(pipeline.edges).toEqual([kept]);
    expect(repairs).toEqual([{ edgeId: 'dropped', reason: 'missing-node' }]);
  });

  it('keeps an edge to a port that no longer exists, for validation to report', () => {
    const broken = pipelineOf(
      [INPUT, nodeOf('prompt', 'prompt', { template: 'No variables' })],
      [edge('e1', 'in.value', 'prompt.question')],
    );

    const { pipeline, repairs } = parseOk(serializePipeline(broken));

    expect(pipeline).toEqual(broken);
    expect(repairs).toEqual([]);
    expect(validatePipeline(pipeline).byEdge.get('e1')).toEqual([
      expect.objectContaining({ code: 'dangling-edge', missing: 'port' }),
    ]);
  });

  // Input → Prompt → LLM Call (temperature 0.3) → Output, exported by the released version 1 app.
  describe('a file exported by the version 1 app', () => {
    it('loads migrated from version 1 without repairs', () => {
      const { pipeline, migratedFrom, repairs } = parseOk(PIPELINE_V1);

      expect(migratedFrom).toBe(1);
      expect(repairs).toEqual([]);
      expect(pipeline.schemaVersion).toBe(SCHEMA_VERSION);
      expect(pipeline.name).toBe('Untitled pipeline');
      expect(pipeline.nodes.map((node) => node.label)).toEqual([
        'Input 1',
        'Prompt 1',
        'LLM Call 1',
        'Output 1',
      ]);
      expect(pipeline.edges).toHaveLength(3);
    });

    it('gives the LLM Call the mock provider and keeps its settings', () => {
      const { pipeline } = parseOk(PIPELINE_V1);
      expect(pipeline.nodes.find((node) => node.kind === 'llm-call')?.data).toEqual({
        provider: 'mock',
        model: 'mock',
        temperature: 0.3,
        maxTokens: 512,
      });
    });

    it('changes nothing else: saved again, it is the same file with the provider added', () => {
      const { pipeline } = parseOk(PIPELINE_V1);
      const current = PIPELINE_V1.replace(
        '"schemaVersion": 1,',
        `"schemaVersion": ${String(SCHEMA_VERSION)},`,
      ).replace('"model": "mock",', '"provider": "mock",\n        "model": "mock",');
      expect(serializePipeline(pipeline)).toBe(current);
    });

    it('reads back without a migration once saved in the current version', () => {
      const { pipeline } = parseOk(PIPELINE_V1);
      const saved = parseOk(serializePipeline(pipeline));
      expect(saved.migratedFrom).toBeNull();
      expect(saved.pipeline).toEqual(pipeline);
    });

    it('validates as it did in version 1, where only its empty Input was a problem', () => {
      const { pipeline } = parseOk(PIPELINE_V1);
      const input = pipeline.nodes.find((node) => node.kind === 'input');
      expect(validatePipeline(pipeline).issues).toEqual([
        expect.objectContaining({ code: 'invalid-field', nodeId: input?.id, field: 'value' }),
      ]);
    });
  });

  // The "Route by sentiment" template with a mock LLM Call, exported by the released version 2 app.
  describe('a file exported by the version 2 app', () => {
    it('loads migrated from version 2 without repairs', () => {
      const { pipeline, migratedFrom, repairs } = parseOk(PIPELINE_V2);

      expect(migratedFrom).toBe(2);
      expect(repairs).toEqual([]);
      expect(pipeline.schemaVersion).toBe(SCHEMA_VERSION);
      expect(pipeline.name).toBe('Route by sentiment');
      expect(pipeline.nodes.map((node) => node.label)).toEqual([
        'Review',
        'Sentiment prompt',
        'Classifier',
        'Is positive?',
        'Positive',
        'Negative',
      ]);
      expect(pipeline.edges).toHaveLength(5);
    });

    it('keeps the mock provider and the settings of its LLM Call', () => {
      const { pipeline } = parseOk(PIPELINE_V2);
      expect(pipeline.nodes.find((node) => node.kind === 'llm-call')?.data).toEqual({
        provider: 'mock',
        model: 'mock',
        temperature: 0,
        maxTokens: 16,
      });
    });

    it('changes nothing: saved again, it is the same file in the current version', () => {
      const { pipeline } = parseOk(PIPELINE_V2);
      const current = PIPELINE_V2.replace(
        '"schemaVersion": 2,',
        `"schemaVersion": ${String(SCHEMA_VERSION)},`,
      );
      expect(serializePipeline(pipeline)).toBe(current);
    });

    it('reads back without a migration once saved in the current version', () => {
      const { pipeline } = parseOk(PIPELINE_V2);
      const saved = parseOk(serializePipeline(pipeline));
      expect(saved.migratedFrom).toBeNull();
      expect(saved.pipeline).toEqual(pipeline);
    });

    it('validates without problems, as it did in version 2', () => {
      const { pipeline } = parseOk(PIPELINE_V2);
      expect(validatePipeline(pipeline).issues).toEqual([]);
    });
  });

  it('is refused as newer, not as invalid, by a build that knows only version 2', () => {
    const anthropic = nodeOf('llm-call', 'llm', {
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      temperature: 0.7,
      maxTokens: 512,
    });
    const text = serializePipeline(pipelineOf([anthropic]));
    const versionTwoBuild = { migrations: MIGRATIONS.slice(0, 1), currentVersion: 2 };

    expect(parsePipelineFile(text, versionTwoBuild)).toEqual({
      ok: false,
      error: { code: 'newer-version', version: SCHEMA_VERSION },
    });
  });

  describe('with migrations', () => {
    /** Renames a top-level field of the raw document. */
    function renaming(from: number, field: string, to: string): Migration {
      return {
        from,
        migrate: ({ [field]: value = null, ...rest }: JsonObject) => ({ ...rest, [to]: value }),
      };
    }

    // Version 2 stored the name as `title`; version 3 went back to `name`.
    const RENAMES = [renaming(1, 'name', 'title'), renaming(2, 'title', 'name')];
    const OPTIONS = { migrations: RENAMES, currentVersion: 3 };

    it('migrates a file from the first version to the current one', () => {
      const { pipeline, migratedFrom } = parseOk(
        fileOf({ schemaVersion: 1, name: 'Draft', nodes: [OUTPUT] }),
        OPTIONS,
      );
      expect(pipeline).toEqual({
        schemaVersion: 3,
        id: 'p',
        name: 'Draft',
        nodes: [OUTPUT],
        edges: [],
      });
      expect(migratedFrom).toBe(1);
    });

    it('migrates a file from a version in between', () => {
      const text = fileOf({ schemaVersion: 2, name: undefined, title: 'Draft' });
      const { pipeline, migratedFrom } = parseOk(text, OPTIONS);
      expect(pipeline.name).toBe('Draft');
      expect(migratedFrom).toBe(2);
    });

    it('does not migrate a file in the current version', () => {
      const { pipeline, migratedFrom } = parseOk(fileOf({ schemaVersion: 3 }), OPTIONS);
      expect(pipeline.schemaVersion).toBe(3);
      expect(migratedFrom).toBeNull();
    });

    it('checks the document after migrating it', () => {
      // A version 2 file whose `title` is blank.
      expect(parsePipelineFile(fileOf({ schemaVersion: 2, title: '' }), OPTIONS)).toEqual({
        ok: false,
        error: { code: 'invalid-pipeline', path: 'name', message: 'Required' },
      });
    });

    it('refuses a file newer than the current version', () => {
      expect(parsePipelineFile(fileOf({ schemaVersion: 4 }), OPTIONS)).toEqual({
        ok: false,
        error: { code: 'newer-version', version: 4 },
      });
    });

    it('throws when a step of the chain is missing', () => {
      const options = { migrations: RENAMES.slice(1), currentVersion: 3 };
      expect(() => parsePipelineFile(fileOf({ schemaVersion: 1 }), options)).toThrow(
        'Expected one migration from schema version 1, found 0',
      );
    });
  });
});
