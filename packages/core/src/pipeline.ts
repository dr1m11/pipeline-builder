import { err, ok, type Result } from './result';
import { SCHEMA_VERSION } from './schema-version';

// Minimal graph model for the foundation stage; node kinds, typed ports and node data arrive in A2.

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface PipelineNode {
  readonly id: string;
  readonly kind: string;
  readonly position: Position;
}

export interface PipelineEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

/** Serializable pipeline document. */
export interface Pipeline {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly PipelineNode[];
  readonly edges: readonly PipelineEdge[];
}

export const PIPELINE_NAME_MAX_LENGTH = 80;

export type PipelineNameError = 'empty' | 'too-long';

/** Trims and validates a user-provided pipeline name. */
export function parsePipelineName(input: string): Result<string, PipelineNameError> {
  const name = input.trim();
  if (name.length === 0) return err('empty');
  if (name.length > PIPELINE_NAME_MAX_LENGTH) return err('too-long');
  return ok(name);
}

/** Creates an empty pipeline in the current schema version. The caller supplies the id. */
export function createEmptyPipeline(params: { id: string; name: string }): Pipeline {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: params.id,
    name: params.name,
    nodes: [],
    edges: [],
  };
}
