import * as z from 'zod';

import { NODE_DEFINITIONS, type PipelineNode } from '../nodes/registry';
import type { Pipeline, PipelineEdge } from '../pipeline';
import { err, ok, type Result } from '../result';
import { SCHEMA_VERSION } from '../schema-version';
import { isJsonObject, type JsonValue } from './json';
import { migrateDocument, type Migration, MIGRATIONS } from './migrations';
import { PIPELINE_SCHEMA } from './pipeline-schema';

/** Value of the `format` field that marks a JSON document as a pipeline file. */
export const PIPELINE_FILE_FORMAT = 'pipeline-builder';

/** Why text could not be read as a pipeline. */
export type PipelineFileError =
  | { readonly code: 'invalid-json' }
  /** Valid JSON, but not an object with the format marker and a whole `schemaVersion` from 1. */
  | { readonly code: 'not-a-pipeline' }
  /** Saved by a newer version of the app; `version` is the file's schema version. */
  | { readonly code: 'newer-version'; readonly version: number }
  /** The first field that does not fit the schema: its path (`nodes[2].data.temperature`) and why. */
  | { readonly code: 'invalid-pipeline'; readonly path: string; readonly message: string }
  /** Two nodes, or two edges, share an id. */
  | { readonly code: 'duplicate-id'; readonly element: 'node' | 'edge'; readonly id: string };

/**
 * An edge dropped while loading because the editor could not show or keep it: it starts or ends at
 * a node that is not in the file, or it goes into an input that an earlier edge already takes.
 */
export interface PipelineFileRepair {
  readonly edgeId: string;
  readonly reason: 'missing-node' | 'occupied-input';
}

/** A pipeline read from a file, with what was done to load it. */
export interface ParsedPipelineFile {
  readonly pipeline: Pipeline;
  /** Schema version the file was saved in, when it had to be migrated; null for a current file. */
  readonly migratedFrom: number | null;
  /** Edges dropped while loading, in file order; empty for a consistent file. */
  readonly repairs: readonly PipelineFileRepair[];
}

/** Overrides for tests; the app uses the defaults. */
export interface ParsePipelineFileOptions {
  /** Defaults to `MIGRATIONS`. */
  readonly migrations?: readonly Migration[];
  /** The version the app reads; defaults to `SCHEMA_VERSION`. */
  readonly currentVersion?: number;
}

/**
 * Writes a pipeline as the text of a pipeline file: the format marker, then the pipeline, as JSON
 * indented by two spaces with a trailing newline. Keys always come in the same order, so equal
 * pipelines give equal text. Export, autosave and the clipboard all use this format.
 */
export function serializePipeline(pipeline: Pipeline): string {
  const document = {
    format: PIPELINE_FILE_FORMAT,
    schemaVersion: pipeline.schemaVersion,
    id: pipeline.id,
    name: pipeline.name,
    nodes: pipeline.nodes.map(serializeNode),
    edges: pipeline.edges.map(serializeEdge),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Reads the text of a pipeline file (an export, the autosaved draft or the clipboard). Files of an
 * older schema version are migrated one version at a time; newer ones are refused. Node data is
 * checked against each kind's `dataSchema` only, so unfinished nodes load and validation reports
 * them; unknown fields are dropped. Edges the editor could not show or keep are dropped and listed
 * in `repairs`, while edges to a port that no longer exists are kept for validation to report.
 * See docs/adr/0010-pipeline-files-and-schema-migrations.md.
 */
export function parsePipelineFile(
  text: string,
  { migrations = MIGRATIONS, currentVersion = SCHEMA_VERSION }: ParsePipelineFileOptions = {},
): Result<ParsedPipelineFile, PipelineFileError> {
  let json: JsonValue;
  try {
    // `JSON.parse` is typed `any`, but it only ever returns JSON values.
    json = JSON.parse(text) as JsonValue;
  } catch {
    return err({ code: 'invalid-json' });
  }

  if (!isJsonObject(json) || json.format !== PIPELINE_FILE_FORMAT) {
    return err({ code: 'not-a-pipeline' });
  }
  const version = json.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return err({ code: 'not-a-pipeline' });
  }
  if (version > currentVersion) return err({ code: 'newer-version', version });

  const document = migrateDocument(json, version, { migrations, target: currentVersion });
  const parsed = PIPELINE_SCHEMA.safeParse(document);
  if (!parsed.success) return err(invalidPipeline(parsed.error));

  const duplicate = findDuplicateId(parsed.data);
  if (duplicate !== null) return err(duplicate);
  const { edges, repairs } = repairEdges(parsed.data);
  return ok({
    pipeline: { ...parsed.data, edges },
    migratedFrom: version < currentVersion ? version : null,
    repairs,
  });
}

function serializeNode(node: PipelineNode) {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    position: { x: node.position.x, y: node.position.y },
    data: serializeData(node),
  };
}

// Data fields in the order of the kind's schema, whatever order the data object was built in.
function serializeData(node: PipelineNode): Readonly<Record<string, unknown>> {
  const entries: [string, unknown][] = Object.entries(node.data);
  const values = new Map(entries);
  const fields = Object.keys(NODE_DEFINITIONS[node.kind].dataSchema.shape);
  return Object.fromEntries(fields.map((field) => [field, values.get(field)]));
}

function serializeEdge(edge: PipelineEdge): PipelineEdge {
  return {
    id: edge.id,
    source: edge.source,
    sourcePort: edge.sourcePort,
    target: edge.target,
    targetPort: edge.targetPort,
  };
}

// Stands in for the first issue of a failed parse, which Zod never leaves empty.
const DOCUMENT_ISSUE: z.core.$ZodIssue = { code: 'custom', path: [], message: 'Invalid pipeline' };

// Zod checks fields in schema order and list items in order; the first issue is enough to find
// the problem.
function invalidPipeline({ issues: [issue = DOCUMENT_ISSUE] }: z.ZodError): PipelineFileError {
  return { code: 'invalid-pipeline', path: z.core.toDotPath(issue.path), message: issue.message };
}

function findDuplicateId({ nodes, edges }: Pipeline): PipelineFileError | null {
  const node = firstDuplicate(nodes.map(({ id }) => id));
  if (node !== null) return { code: 'duplicate-id', element: 'node', id: node };
  const edge = firstDuplicate(edges.map(({ id }) => id));
  if (edge !== null) return { code: 'duplicate-id', element: 'edge', id: edge };
  return null;
}

function firstDuplicate(ids: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

// The canvas cannot draw an edge without both its nodes, so the user could neither see nor delete
// it; and an input takes one edge, so the first one wins. An edge whose port is gone stays: the
// canvas draws it to a placeholder handle and validation reports it (ADR 0008).
function repairEdges({ nodes, edges }: Pipeline): {
  edges: readonly PipelineEdge[];
  repairs: readonly PipelineFileRepair[];
} {
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const occupiedInputs = new Set<string>();
  const kept: PipelineEdge[] = [];
  const repairs: PipelineFileRepair[] = [];
  for (const edge of edges) {
    const input = `${edge.target}\u0000${edge.targetPort}`;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      repairs.push({ edgeId: edge.id, reason: 'missing-node' });
    } else if (occupiedInputs.has(input)) {
      repairs.push({ edgeId: edge.id, reason: 'occupied-input' });
    } else {
      occupiedInputs.add(input);
      kept.push(edge);
    }
  }
  return { edges: kept, repairs };
}
