import { isJsonArray, isJsonObject, type JsonObject, type JsonValue } from './json';

/**
 * Upgrades a pipeline document from schema version `from` to `from + 1`. It works on the raw JSON
 * object, before the document is checked, so it must not assume any field exists or has a type.
 * The chain sets `schemaVersion` on the result, so `migrate` only changes the shape.
 */
export interface Migration {
  /** Version of the documents this migration reads. */
  readonly from: number;
  readonly migrate: (document: JsonObject) => JsonObject;
}

/**
 * 1 → 2: LLM Call data gains `provider`. Version 1 had only the built-in mock provider, so every
 * LLM Call node gets `mock`. Anything else (other nodes, malformed nodes or data, a provider that
 * is already there) is left as it is for the schema to judge.
 */
const ADD_LLM_PROVIDER: Migration = {
  from: 1,
  migrate: (document) => {
    const { nodes } = document;
    if (!isJsonArray(nodes)) return document;
    return { ...document, nodes: nodes.map(withLlmProvider) };
  },
};

function withLlmProvider(node: JsonValue): JsonValue {
  if (!isJsonObject(node) || node.kind !== 'llm-call') return node;
  const { data } = node;
  if (!isJsonObject(data) || 'provider' in data) return node;
  return { ...node, data: { ...data, provider: 'mock' } };
}

/**
 * 2 → 3: LLM Call providers gain `anthropic` and `openai`. Every version 2 document is already a
 * valid version 3 one, so nothing changes; the version is bumped so that a build that knows only
 * the mock provider refuses these files as newer instead of as invalid.
 */
const ADD_REAL_LLM_PROVIDERS: Migration = {
  from: 2,
  migrate: (document) => document,
};

/**
 * Every migration, one per schema version below `SCHEMA_VERSION`. Append-only: files saved in any
 * earlier version must keep loading, so a migration is never changed or removed once released.
 * Each one is listed in docs/adr/0010-pipeline-files-and-schema-migrations.md.
 */
export const MIGRATIONS: readonly Migration[] = [ADD_LLM_PROVIDER, ADD_REAL_LLM_PROVIDERS];

/**
 * Brings a raw document from `version` up to `target`, one version at a time. A document already at
 * `target` is returned as it is. A missing or repeated step is a programming error and throws.
 */
export function migrateDocument(
  document: JsonObject,
  version: number,
  { migrations, target }: { migrations: readonly Migration[]; target: number },
): JsonObject {
  let current = document;
  for (let from = version; from < target; from++) {
    const steps = migrations.filter((migration) => migration.from === from);
    const [step] = steps;
    if (step === undefined || steps.length > 1) {
      throw new Error(
        `Expected one migration from schema version ${String(from)}, found ${String(steps.length)}`,
      );
    }
    current = { ...step.migrate(current), schemaVersion: from + 1 };
  }
  return current;
}
