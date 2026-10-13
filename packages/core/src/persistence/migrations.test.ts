import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '../schema-version';
import { isJsonArray, type JsonObject } from './json';
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
