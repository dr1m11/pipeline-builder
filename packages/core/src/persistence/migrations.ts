import type { JsonObject } from './json';

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
 * Every migration, one per schema version below `SCHEMA_VERSION`. Append-only: files saved in any
 * earlier version must keep loading, so a migration is never changed or removed once released.
 */
export const MIGRATIONS: readonly Migration[] = [];

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
