import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '../schema-version';
import { isJsonArray, type JsonObject, type JsonValue } from './json';
import { migrateDocument, type Migration, MIGRATIONS } from './migrations';

/** A migration that records its step in the document's `trail`. */
function step(from: number): Migration {
  return {
    from,
    migrate: (document) => {
      const trail = isJsonArray(document.trail) ? document.trail : [];
      return { ...document, trail: [...trail, `${String(from)}→${String(from + 1)}`] };
    },
  };
}

const CHAIN = [step(1), step(2)];

function documentOf(version: number): JsonObject {
  return { schemaVersion: version, trail: [] };
}

describe('migrateDocument', () => {
  it('applies every step in order from the document version to the target', () => {
    expect(migrateDocument(documentOf(1), 1, { migrations: CHAIN, target: 3 })).toEqual({
      schemaVersion: 3,
      trail: ['1→2', '2→3'],
    });
  });

  it('starts from the version of the document', () => {
    expect(migrateDocument(documentOf(2), 2, { migrations: CHAIN, target: 3 })).toEqual({
      schemaVersion: 3,
      trail: ['2→3'],
    });
  });

  it('finds the steps whatever order they are listed in', () => {
    const migrations = [step(2), step(1)];
    expect(migrateDocument(documentOf(1), 1, { migrations, target: 3 }).trail).toEqual([
      '1→2',
      '2→3',
    ]);
  });

  it('returns a document at the target version as it is', () => {
    const document = documentOf(3);
    expect(migrateDocument(document, 3, { migrations: CHAIN, target: 3 })).toBe(document);
  });

  it('sets the schema version after each step, whatever the migration returns', () => {
    const seen: unknown[] = [];
    const record = (from: number): Migration => ({
      from,
      migrate: (document) => {
        seen.push(document.schemaVersion);
        return { kept: true };
      },
    });
    const migrated = migrateDocument(documentOf(1), 1, {
      migrations: [record(1), record(2)],
      target: 3,
    });
    expect(seen).toEqual([1, 2]);
    expect(migrated).toEqual({ kept: true, schemaVersion: 3 });
  });

  it('throws when a step of the chain is missing', () => {
    expect(() => migrateDocument(documentOf(1), 1, { migrations: [step(2)], target: 3 })).toThrow(
      'Expected one migration from schema version 1, found 0',
    );
    expect(() => migrateDocument(documentOf(1), 1, { migrations: [step(1)], target: 3 })).toThrow(
      'Expected one migration from schema version 2, found 0',
    );
  });

  it('throws when two migrations start from the same version', () => {
    expect(() =>
      migrateDocument(documentOf(1), 1, { migrations: [step(1), step(1)], target: 2 }),
    ).toThrow('Expected one migration from schema version 1, found 2');
  });
});

describe('MIGRATIONS', () => {
  it('has exactly one migration from every version below the current one', () => {
    const versions = Array.from({ length: SCHEMA_VERSION - 1 }, (_, index) => index + 1);
    expect(MIGRATIONS.map((migration) => migration.from).sort((a, b) => a - b)).toEqual(versions);
  });
});

describe('migration from version 1', () => {
  function migrationFrom(version: number): Migration {
    const migration = MIGRATIONS.find((candidate) => candidate.from === version);
    if (migration === undefined) throw new Error(`No migration from version ${String(version)}`);
    return migration;
  }

  const { migrate } = migrationFrom(1);

  const LLM_V1 = {
    id: 'llm',
    kind: 'llm-call',
    label: 'LLM Call 1',
    position: { x: 0, y: 0 },
    data: { model: 'mock', temperature: 0.3, maxTokens: 512 },
  };
  const PROMPT = {
    id: 'prompt',
    kind: 'prompt',
    label: 'Prompt 1',
    position: { x: -240, y: 0 },
    data: { template: 'Answer: {{question}}' },
  };

  function version1(nodes: JsonValue): JsonObject {
    return {
      format: 'pipeline-builder',
      schemaVersion: 1,
      id: 'p',
      name: 'Test',
      nodes,
      edges: [],
    };
  }

  it('gives every LLM Call the mock provider', () => {
    const second = { ...LLM_V1, id: 'llm-2', data: { ...LLM_V1.data, model: 'gpt' } };
    expect(migrate(version1([LLM_V1, second]))).toEqual(
      version1([
        { ...LLM_V1, data: { ...LLM_V1.data, provider: 'mock' } },
        { ...second, data: { ...second.data, provider: 'mock' } },
      ]),
    );
  });

  it('changes nothing but the data of LLM Calls', () => {
    const document = { ...version1([PROMPT, LLM_V1]), edges: [{ id: 'e1' }], extra: true };
    expect(migrate(document)).toEqual({
      ...document,
      nodes: [PROMPT, { ...LLM_V1, data: { ...LLM_V1.data, provider: 'mock' } }],
    });
  });

  it('does not change the document it is given', () => {
    const document = version1([LLM_V1]);
    const copy: unknown = JSON.parse(JSON.stringify(document));
    migrate(document);
    expect(document).toEqual(copy);
  });

  it('keeps a provider the node already has, for the schema to judge', () => {
    const withProvider = { ...LLM_V1, data: { ...LLM_V1.data, provider: 'openai' } };
    expect(migrate(version1([withProvider]))).toEqual(version1([withProvider]));
  });

  it('leaves a document without nodes as it is', () => {
    const document = { schemaVersion: 1 };
    expect(migrate(document)).toBe(document);
  });

  it.each<[string, JsonValue]>([
    ['nodes that are not a list', { llm: LLM_V1 }],
    ['nodes that are not objects', [42, null, 'llm-call', [LLM_V1]]],
    ['an LLM Call without data', [{ id: 'llm', kind: 'llm-call', label: 'LLM Call 1' }]],
    ['an LLM Call whose data is not an object', [{ ...LLM_V1, data: ['mock'] }]],
    ['a node of another kind with the data of an LLM Call', [{ ...LLM_V1, kind: 'prompt' }]],
  ])('leaves %s for the schema to judge', (_, nodes) => {
    const document = version1(nodes);
    expect(migrate(document)).toEqual(document);
  });
});
