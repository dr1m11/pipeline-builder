/**
 * Version of the serialized pipeline format.
 * Bump it whenever the persisted shape changes and add a migration from the previous version.
 *
 * - 1: the first released format (A4).
 * - 2: LLM Call data has a `provider`.
 */
export const SCHEMA_VERSION = 2;
