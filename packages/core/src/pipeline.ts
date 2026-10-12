import type { PipelineNode } from './nodes/registry';
import { err, ok, type Result } from './result';
import { SCHEMA_VERSION } from './schema-version';

/** A connection from an output port of one node to an input port of another. */
export interface PipelineEdge {
  readonly id: string;
  readonly source: string;
  /** Output port id on the source node. */
  readonly sourcePort: string;
  readonly target: string;
  /** Input port id on the target node. */
  readonly targetPort: string;
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
