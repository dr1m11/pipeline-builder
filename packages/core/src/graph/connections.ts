import { getNodePorts } from '../nodes/registry';
import type { Pipeline, PipelineEdge } from '../pipeline';
import { arePortTypesCompatible, type PortDefinition } from '../ports';
import { err, ok, type Result } from '../result';
import { findNode } from './nodes';

/** A connection the user is trying to make: an output port of `source` to an input port of `target`. */
export interface ConnectionCandidate {
  readonly source: string;
  readonly sourcePort: string;
  readonly target: string;
  readonly targetPort: string;
}

/** Why a connection is not allowed. */
export type ConnectionError = 'self-loop' | 'unknown-node' | 'unknown-port' | 'incompatible-types';

/** The two ports a valid connection joins. */
export interface ConnectedPorts {
  readonly sourcePort: PortDefinition;
  readonly targetPort: PortDefinition;
}

/**
 * Checks whether an output may be connected to an input: different nodes, both ports exist
 * (an output on the source, an input on the target) and their types are compatible.
 * Whether the input is already connected does not matter: `connect` replaces that edge.
 */
export function validateConnection(
  pipeline: Pipeline,
  candidate: ConnectionCandidate,
): Result<ConnectedPorts, ConnectionError> {
  if (candidate.source === candidate.target) return err('self-loop');
  const source = findNode(pipeline, candidate.source);
  const target = findNode(pipeline, candidate.target);
  if (source === undefined || target === undefined) return err('unknown-node');
  const sourcePort = getNodePorts(source).outputs.find((port) => port.id === candidate.sourcePort);
  const targetPort = getNodePorts(target).inputs.find((port) => port.id === candidate.targetPort);
  if (sourcePort === undefined || targetPort === undefined) return err('unknown-port');
  if (!arePortTypesCompatible(sourcePort.type, targetPort.type)) return err('incompatible-types');
  return ok({ sourcePort, targetPort });
}

/** Outcome of a successful `connect`. */
export interface ConnectResult {
  readonly pipeline: Pipeline;
  /** The edge between the two ports: the new one, or the existing one if they were already connected. */
  readonly edge: PipelineEdge;
  /** The edge that occupied the target input and was replaced, if any. */
  readonly replacedEdge: PipelineEdge | null;
}

/**
 * Connects an output to an input. An input takes one edge, so an edge already attached to it is
 * replaced in place. Connecting ports that are already connected returns the same pipeline.
 * The caller supplies a unique edge id; reusing one is a programming error and throws.
 */
export function connect(
  pipeline: Pipeline,
  candidate: ConnectionCandidate,
  edgeId: string,
): Result<ConnectResult, ConnectionError> {
  const validation = validateConnection(pipeline, candidate);
  if (!validation.ok) return validation;

  const occupant = pipeline.edges.find(
    (edge) => edge.target === candidate.target && edge.targetPort === candidate.targetPort,
  );
  if (occupant?.source === candidate.source && occupant.sourcePort === candidate.sourcePort) {
    return ok({ pipeline, edge: occupant, replacedEdge: null });
  }
  if (pipeline.edges.some((edge) => edge.id === edgeId)) {
    throw new Error(`Edge id "${edgeId}" is already used`);
  }

  const edge: PipelineEdge = { id: edgeId, ...candidate };
  const edges =
    occupant === undefined
      ? [...pipeline.edges, edge]
      : pipeline.edges.map((existing) => (existing === occupant ? edge : existing));
  return ok({ pipeline: { ...pipeline, edges }, edge, replacedEdge: occupant ?? null });
}
